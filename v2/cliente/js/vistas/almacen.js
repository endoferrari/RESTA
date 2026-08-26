/**
 * CLIENTE · ALMACÉN
 * ─────────────────────────────────────────────────────────────────────────────
 * Qué hay, qué llegó, qué se perdió y qué hay que comprar.
 *
 * Está armada alrededor de UNA pregunta: **¿me alcanza?**. Por eso lo grande
 * de cada renglón no es cuántos hay, sino cuántos días aguanta y de qué
 * color está. Cuántos hay se lee debajo, en botellas y copas.
 *
 * Los números —cobertura, proyección, lista de compra— los calcula el
 * servidor con `nucleo/almacen.js`. Esta pantalla sólo los pinta.
 */

import { api } from '../api.js';
import { estado, puede } from '../estado.js';
import { $, esc, avisar, confirmar, ventana } from '../ui.js';

let alVolver = null;
// 'existencias' · 'pedido' · 'conteo' · 'comprar' · 'ajustes' · 'arqueo'
let seccion = 'existencias';

let datos = {
  existencias: [], diasACubrir: 7, motivos: [],
  compras: { lista: [], diasACubrir: 7 },
  configuracion: [],
  arqueo: [],
};

// Lo que se va tecleando antes de guardar, por producto
let capturado = {};
let contadoEnArqueo = {};

export function iniciarAlmacen(cuandoVuelva) {
  alVolver = cuandoVuelva;

  $('volver-de-almacen').addEventListener('click', () => alVolver?.());
  $('almacen-secciones').addEventListener('click', alTocarSeccion);

  // ── El arqueo ──
  $('almacen-arqueo-lista').addEventListener('input', alTeclearArqueo);
  $('boton-guardar-arqueo').addEventListener('click', guardarArqueo);
  $('boton-limpiar-arqueo').addEventListener('click', () => {
    contadoEnArqueo = {};
    pintarArqueo();
  });
  $('buscar-arqueo').addEventListener('input', (e) => {
    buscadoEnArqueo = e.target.value;
    pintarArqueo();
  });
  $('arqueo-familias').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fam-arqueo]');
    if (!b) return;
    familiaArqueo = b.dataset.famArqueo;
    pintarArqueo();
  });
  $('almacen-sin-arqueo').addEventListener('click', (e) => {
    if (!e.target.closest('[data-ir-arqueo]')) return;
    seccion = 'arqueo';
    cargarAlmacen();
  });
  $('almacen-existencias').addEventListener('click', alTocarExistencia);
  $('almacen-captura').addEventListener('input', alTeclearCantidad);
  $('boton-guardar-captura').addEventListener('click', guardarCaptura);
  $('boton-limpiar-captura').addEventListener('click', limpiarCaptura);
  $('almacen-dias').addEventListener('click', alCambiarDias);
  $('almacen-config').addEventListener('click', alTocarConfig);

  $('config-almacen-familias').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fam-config]');
    if (!b) return;
    familiaConfig = b.dataset.famConfig;
    pintarConfiguracion();
  });

  // Se filtra al teclear, sin botón de buscar: con 137 productos, tener que
  // apretar «buscar» cada vez cansa a la tercera.
  $('buscar-config-almacen').addEventListener('input', (e) => {
    buscado = e.target.value;
    pintarConfiguracion();
  });
}

/* ── Cargar ────────────────────────────────────────────────────────────── */

export async function cargarAlmacen() {
  try {
    const r = await api.almacen();
    datos.existencias = r.existencias;
    datos.diasACubrir = r.diasACubrir;
    datos.motivos = r.motivosDeMerma;

    estado.almacen = {
      activo: r.activo, arqueoHecho: r.arqueoHecho,
      arqueoFecha: r.arqueoFecha, controlados: r.controlados,
    };

    // Recién encendido el inventario, lo primero es contar. Se entra directo
    // a esa pantalla en vez de a una lista de ceros que no dice nada.
    if (!r.arqueoHecho && puede('ajustes.cambiar')
        && ['existencias', 'comprar'].includes(seccion)) {
      seccion = 'arqueo';
    }

    if (seccion === 'comprar') datos.compras = await api.queComprar(datos.diasACubrir);
    if (seccion === 'ajustes' && puede('ajustes.cambiar')) {
      datos.configuracion = (await api.configAlmacen()).productos;
    }
    if (seccion === 'arqueo' && puede('ajustes.cambiar')) {
      datos.arqueo = (await api.paraElArqueo()).productos;
    }

    pintarAlmacen();
  } catch (e) {
    if (e.codigo !== 401 && e.codigo !== 403) avisar(e.message, true);
  }
}

/* ── Pintar ────────────────────────────────────────────────────────────── */

export function pintarAlmacen() {
  const secciones = [
    ['existencias', '📦 Qué hay'],
    ['comprar', '🧾 Qué comprar'],
  ];
  if (puede('ajustes.cambiar')) {
    secciones.push(
      ['pedido', '🚚 Llegó el pedido'], ['conteo', '🔢 Conteo'],
      ['arqueo', '🧮 Arqueo'], ['ajustes', '⚙️ Qué se controla'],
    );
  }

  $('almacen-secciones').innerHTML = secciones.map(([clave, texto]) =>
    `<button class="op ${seccion === clave ? 'activo' : ''}" data-seccion="${clave}">${texto}</button>`
  ).join('');

  // Mientras nadie haya contado, los números de arriba no significan nada:
  // no hubo un día en que alguien dijera «de aquí para adelante». Decirlo es
  // más honesto que enseñar una pantalla de ceros como si fuera la verdad.
  const faltaArqueo = !estado.almacen.arqueoHecho;
  $('almacen-sin-arqueo').hidden = !faltaArqueo || seccion === 'arqueo';
  $('almacen-sin-arqueo').innerHTML = faltaArqueo
    ? `🧮 <b>Todavía no se ha hecho el arqueo.</b> Hasta que alguien cuente lo
       que hay de verdad, estos números no valen.
       ${puede('ajustes.cambiar')
         ? '<button class="btn btn-chico btn-ambar" data-ir-arqueo="1">Contar ahora</button>'
         : 'Pídeselo al administrador.'}`
    : '';

  // «Llegó el pedido» y «Conteo» son la MISMA lista con distinto sentido:
  // en una se anota lo que entró, en la otra lo que hay. Comparten panel.
  $('almacen-panel-existencias').hidden = seccion !== 'existencias';
  $('almacen-pedido').hidden  = seccion !== 'pedido' && seccion !== 'conteo';
  $('almacen-comprar').hidden = seccion !== 'comprar';
  $('almacen-ajustes').hidden = seccion !== 'ajustes';
  $('almacen-arqueo').hidden  = seccion !== 'arqueo';

  if (seccion === 'existencias') pintarExistencias();
  if (seccion === 'pedido' || seccion === 'conteo') pintarCaptura();
  if (seccion === 'comprar') pintarComprar();
  if (seccion === 'ajustes') pintarConfiguracion();
  if (seccion === 'arqueo') pintarArqueo();
}

/* ── El arqueo: contar todo por primera vez ────────────────────────────── */

let buscadoEnArqueo = '';
let familiaArqueo = '*';

/**
 * Aquí va TODA la carta, no sólo lo que ya se controla.
 *
 * El arqueo es el momento en que se decide qué se lleva y qué no, caminando
 * por la bodega con la tablet en la mano. Si la lista sólo trajera lo ya
 * marcado, habría que adivinar antes de contar — y anotar una cantidad es
 * justamente lo que da de alta el producto.
 */
function pintarArqueo() {
  const todos = datos.arqueo;
  const familias = [...new Set(todos.map((p) => p.familia))];

  const visibles = todos.filter((p) => {
    if (familiaArqueo !== '*' && p.familia !== familiaArqueo) return false;
    if (buscadoEnArqueo && !sinAcentos(p.nombre).includes(sinAcentos(buscadoEnArqueo))) return false;
    return true;
  });

  $('arqueo-familias').innerHTML = [
    ['*', `Todas (${todos.length})`],
    ...familias.map((f) => [f, f]),
  ].map(([clave, texto]) =>
    `<button class="op ${familiaArqueo === clave ? 'activo' : ''}" data-fam-arqueo="${esc(clave)}">${esc(texto)}</button>`
  ).join('');

  $('almacen-arqueo-lista').innerHTML = visibles.length === 0
    ? `<div class="vacio"><div class="vacio-icono">🔍</div>
         <div class="vacio-titulo">Nada con ese nombre</div></div>`
    : visibles.map((p) => {
      // Una michelada no se guarda en el refrigerador: la cerveza sí. No
      // tiene existencia propia, así que no se cuenta.
      if (p.gastaNombre) {
        return `
          <div class="fila-almacen apagado">
            <span class="fila-icono">${esc(p.icono || '📦')}</span>
            <span class="alm-texto">
              <span class="alm-nombre">${esc(p.nombre)}</span>
              <span class="alm-cuanto">🔗 sale de <b>${esc(p.gastaNombre)}</b>: no se cuenta aparte</span>
            </span>
          </div>`;
      }

      const valor = contadoEnArqueo[p.id] ?? '';

      return `
        <div class="fila-almacen ${p.controla ? '' : 'apagado'}">
          <span class="fila-icono">${esc(p.icono || '📦')}</span>
          <span class="alm-texto">
            <span class="alm-nombre">${esc(p.nombre)}</span>
            <span class="alm-cuanto">
              ${p.controla
                ? `el sistema dice ${p.existencia} ${esc(p.unidad)}(s)`
                : 'todavía no lo llevas · anota una cantidad para empezar'}
            </span>
          </span>
          <span class="alm-captura">
            <input class="campo campo-cantidad" type="text" inputmode="numeric"
                   data-arqueo="${p.id}" value="${esc(valor)}" placeholder="—"
                   autocomplete="off">
            <span class="alm-unidad">${esc(p.unidad || 'pieza')}(s)</span>
          </span>
        </div>`;
    }).join('');

  resumirArqueo();
}

function alTeclearArqueo(e) {
  const campo = e.target.closest('[data-arqueo]');
  if (!campo) return;

  const limpio = campo.value.replace(/[^\d]/g, '');
  if (campo.value !== limpio) campo.value = limpio;

  // El 0 SÍ cuenta: «de esto no queda nada» es una respuesta, y es distinta
  // de no haber contado ese producto.
  if (limpio === '') delete contadoEnArqueo[campo.dataset.arqueo];
  else contadoEnArqueo[campo.dataset.arqueo] = Number(limpio);

  resumirArqueo();
}

function resumirArqueo() {
  const cuantos = Object.keys(contadoEnArqueo).length;
  $('boton-guardar-arqueo').disabled = cuantos === 0;
  $('resumen-arqueo').textContent = cuantos
    ? `${cuantos} producto(s) contado(s)`
    : 'Todavía no cuentas nada';
}

async function guardarArqueo() {
  const conteos = Object.entries(contadoEnArqueo)
    .map(([id, contado]) => ({ productoId: Number(id), contado: Number(contado) }));

  if (conteos.length === 0) return;

  try {
    const r = await api.guardarArqueo(conteos);
    datos.existencias = r.existencias;
    estado.almacen = {
      activo: r.activo, arqueoHecho: r.arqueoHecho,
      arqueoFecha: r.arqueoFecha, controlados: r.controlados,
    };
    contadoEnArqueo = {};
    datos.arqueo = (await api.paraElArqueo()).productos;

    const dadosDeAlta = r.resultado.filter((x) => x.eraNuevo).length;
    const omitidos = r.resultado.filter((x) => x.omitido);

    await ventana({
      titulo: 'Arqueo guardado',
      cuerpo: `
        <p class="texto-ventana">
          Contaste <b>${r.resultado.length - omitidos.length} producto(s)</b>.
          ${dadosDeAlta ? `<b>${dadosDeAlta}</b> empiezan a llevarse desde hoy.` : ''}
        </p>
        ${omitidos.length ? `
          <p class="sutil">
            ${omitidos.length} no se contaron porque salen de otro producto:
            ${omitidos.map((o) => esc(o.producto)).join(', ')}.
          </p>` : ''}
        <p class="sutil" style="margin-top:12px">
          De aquí en adelante cada venta descuenta sola. Anota la merma cuando
          se caiga una botella y vuelve a contar cada tanto: eso es lo que
          mantiene vivo un inventario.
        </p>`,
      botones: [{ texto: 'Listo', valor: true, clase: 'btn-ambar' }],
    });

    seccion = 'existencias';
    await cargarAlmacen();
  } catch (e) {
    avisar(e.message, true);
  }
}

/* ── Qué hay ───────────────────────────────────────────────────────────── */

function pintarExistencias() {
  if (datos.existencias.length === 0) {
    $('almacen-existencias').innerHTML = `
      <div class="vacio">
        <div class="vacio-icono">📦</div>
        <div class="vacio-titulo">No hay nada controlado todavía</div>
        <div class="vacio-nota">
          En «Qué se controla» eliges qué productos quieres seguir.<br>
          Empieza por pocos: los que de verdad duelen.
        </div>
      </div>`;
    return;
  }

  // Recién cargado el inventario no hay ni una venta con qué proyectar. Antes
  // la pantalla se pintaba entera de verde, que se lee como «todo bien»
  // cuando en realidad es «todavía no sé nada».
  const sinDatos = datos.existencias.filter((p) => p.semaforo.color === 'gris').length;

  $('nota-sin-ventas').hidden = sinDatos === 0;
  $('nota-sin-ventas').innerHTML = sinDatos === datos.existencias.length
    ? `⏳ Todavía no hay ventas registradas, así que no se puede decir para
       cuántos días alcanza. En cuanto cobres unas cuantas cuentas, cada
       renglón se pinta de verde, ámbar o rojo solo.`
    : `⏳ ${sinDatos} producto(s) no se han vendido todavía: de ésos no se
       puede calcular cuántos días alcanzan.`;

  $('almacen-existencias').innerHTML = datos.existencias.map((p) => `
    <div class="fila-almacen sem-${p.semaforo.color}" data-producto="${p.id}">
      <span class="fila-icono">${esc(p.icono || '📦')}</span>

      <span class="alm-texto">
        <span class="alm-nombre">${esc(p.nombre)}</span>
        <span class="alm-cuanto">${esc(p.texto)}</span>
      </span>

      <span class="alm-dias">
        <span class="alm-foco"></span>
        <span class="alm-dias-texto">${esc(p.semaforo.texto)}</span>
      </span>

      ${puede('impresora.operar')
        ? `<button class="btn btn-chico" data-merma="${p.id}" title="Se cayó, se sirvió mal…">💔 Merma</button>`
        : ''}
      <button class="btn btn-chico" data-historia="${p.id}" title="¿Por qué hay esa cantidad?">📜</button>
    </div>`).join('');
}

/* ── Llegó el pedido · Conteo ──────────────────────────────────────────── */

/** Las dos pantallas de capturar son la misma lista con distinto sentido. */
function pintarCaptura() {
  const esPedido = seccion === 'pedido';

  $('titulo-captura').textContent = esPedido ? 'Llegó el pedido' : 'Conteo físico';
  $('explica-captura').innerHTML = esPedido
    ? 'Anota <b>cuántos envases</b> llegaron de cada cosa. Lo que no llegó, déjalo vacío.'
    : 'Cuenta lo que hay de verdad y anótalo <b>en la unidad que vendes</b> ' +
      '(copas, cervezas). El sistema ajusta la diferencia y la deja registrada.';

  $('boton-guardar-captura').textContent = esPedido ? 'Guardar la entrada' : 'Guardar el conteo';

  $('almacen-captura').innerHTML = datos.existencias.map((p) => {
    const valor = capturado[p.id] ?? '';
    const unidad = esPedido
      ? `${p.envase}(s) de ${p.porcionesPorEnvase}`
      : p.unidad + 's';

    return `
      <div class="fila-almacen" data-producto="${p.id}">
        <span class="fila-icono">${esc(p.icono || '📦')}</span>
        <span class="alm-texto">
          <span class="alm-nombre">${esc(p.nombre)}</span>
          <span class="alm-cuanto">
            ${esPedido ? 'hay' : 'el sistema dice'} ${esc(p.texto)}
          </span>
        </span>
        <span class="alm-captura">
          <input class="campo campo-cantidad" type="text" inputmode="numeric"
                 data-cantidad="${p.id}" value="${esc(valor)}" placeholder="0"
                 autocomplete="off">
          <span class="alm-unidad">${esc(unidad)}</span>
        </span>
      </div>`;
  }).join('');

  const cuantos = Object.values(capturado).filter((v) => String(v).trim() !== '').length;
  $('boton-guardar-captura').disabled = cuantos === 0;
  $('resumen-captura').textContent = cuantos
    ? `${cuantos} producto(s) anotado(s)`
    : 'Todavía no anotas nada';
}

function alTeclearCantidad(e) {
  const campo = e.target.closest('[data-cantidad]');
  if (!campo) return;

  const limpio = campo.value.replace(/[^\d]/g, '');
  if (campo.value !== limpio) campo.value = limpio;

  if (limpio === '') delete capturado[campo.dataset.cantidad];
  else capturado[campo.dataset.cantidad] = Number(limpio);

  const cuantos = Object.keys(capturado).length;
  $('boton-guardar-captura').disabled = cuantos === 0;
  $('resumen-captura').textContent = cuantos
    ? `${cuantos} producto(s) anotado(s)`
    : 'Todavía no anotas nada';
}

function limpiarCaptura() {
  capturado = {};
  pintarCaptura();
}

async function guardarCaptura() {
  const entradas = Object.entries(capturado)
    .filter(([, v]) => String(v).trim() !== '');

  if (entradas.length === 0) return;

  try {
    if (seccion === 'pedido') {
      const r = await api.registrarCompra(
        entradas.map(([id, envases]) => ({ productoId: Number(id), envases: Number(envases) }))
      );
      datos.existencias = r.existencias;
      capturado = {};
      pintarCaptura();
      avisar(`Entrada guardada: ${r.guardadas.length} producto(s)`);
      return;
    }

    // Conteo: se enseña lo que descuadró, que es la información útil
    const r = await api.registrarConteo(
      entradas.map(([id, contado]) => ({ productoId: Number(id), contado: Number(contado) }))
    );
    datos.existencias = r.existencias;
    capturado = {};
    pintarCaptura();

    const descuadrados = r.resultado.filter((x) => !x.cuadra);

    await ventana({
      titulo: 'Conteo guardado',
      cuerpo: descuadrados.length === 0
        ? `<p class="texto-ventana">Contaste ${r.resultado.length} producto(s) y
             <b>todo cuadró</b>.</p>`
        : `<p class="texto-ventana">
             Contaste ${r.resultado.length} producto(s).
             <b>${descuadrados.length} no cuadró(aron)</b>:
           </p>
           ${descuadrados.map((x) => `
             <div class="fila-total ${x.falta ? 'sutil' : 'sutil'}">
               <span>${esc(x.producto)}</span>
               <span class="dinero" style="color:var(--${x.falta ? 'peligro' : 'exito'})">
                 ${x.falta ? '−' : '+'}${Math.abs(x.diferencia)}
               </span>
             </div>`).join('')}
           <p class="sutil" style="margin-top:12px">
             La diferencia quedó registrada. Si un producto siempre falta de
             más, ahí hay algo que ver.
           </p>`,
      botones: [{ texto: 'Listo', valor: true, clase: 'btn-ambar' }],
    });
  } catch (e) {
    avisar(e.message, true);
  }
}

/* ── Qué comprar ───────────────────────────────────────────────────────── */

function pintarComprar() {
  const { lista, diasACubrir } = datos.compras;

  $('almacen-dias').innerHTML = [3, 7, 10, 14].map((d) =>
    `<button class="op ${d === diasACubrir ? 'activo' : ''}" data-dias="${d}">${d} días</button>`
  ).join('');

  if (lista.length === 0) {
    // Una lista vacía por falta de ventas NO es lo mismo que una lista vacía
    // porque alcanza. Decir «no hace falta comprar nada» sin una sola venta
    // detrás es exactamente el consejo que deja al bar sin cerveza.
    const nuncaSeVendio = datos.existencias.length > 0 &&
      datos.existencias.every((p) => p.semaforo.color === 'gris');

    $('almacen-compras').innerHTML = nuncaSeVendio
      ? `<div class="vacio">
           <div class="vacio-icono">⏳</div>
           <div class="vacio-titulo">Todavía no puedo decirte qué comprar</div>
           <div class="vacio-nota">
             Esta lista sale de lo que se vende cada día de la semana, y
             todavía no hay ventas registradas.<br>
             Después de unos días de trabajo aparece sola.
           </div>
         </div>`
      : `<div class="vacio">
           <div class="vacio-icono">👍</div>
           <div class="vacio-titulo">No hace falta comprar nada</div>
           <div class="vacio-nota">Con lo que hay alcanza los próximos ${diasACubrir} días.</div>
         </div>`;
    return;
  }

  $('almacen-compras').innerHTML = `
    <p class="sutil">
      Para llegar cubierto los próximos <b>${diasACubrir} días</b>, según lo que
      se vende cada día de la semana:
    </p>` +
    lista.map((r) => `
      <div class="fila-almacen">
        <span class="fila-icono">🛒</span>
        <span class="alm-texto">
          <span class="alm-nombre">${esc(r.nombre)}</span>
          <span class="alm-cuanto">
            hay ${r.existencia} · se van a ir ${r.seVanAConsumir}
          </span>
        </span>
        <span class="alm-comprar">
          <b>${r.comprar}</b> ${esc(r.comprar === 1 ? r.envase : r.envase + 's')}
        </span>
      </div>`).join('');
}

async function alCambiarDias(e) {
  const b = e.target.closest('[data-dias]');
  if (!b) return;

  const dias = Number(b.dataset.dias);
  try {
    datos.compras = await api.queComprar(dias);
    datos.diasACubrir = dias;
    if (puede('ajustes.cambiar')) await api.diasACubrir(dias);
    pintarComprar();
  } catch (err) {
    avisar(err.message, true);
  }
}

/* ── Merma e historia ──────────────────────────────────────────────────── */

async function alTocarExistencia(e) {
  const merma = e.target.closest('[data-merma]');
  if (merma) return pedirMerma(Number(merma.dataset.merma));

  const historia = e.target.closest('[data-historia]');
  if (historia) return verHistoria(Number(historia.dataset.historia));
}

/** La merma tiene que ser de un toque, o nadie la anota. */
async function pedirMerma(productoId) {
  const p = datos.existencias.find((x) => x.id === productoId);
  if (!p) return;

  const r = await ventana({
    titulo: `${p.icono} ${p.nombre}`,
    cuerpo: `
      <p class="texto-ventana">¿Cuántas se perdieron? Hay ${esc(p.texto)}.</p>
      <label class="etiqueta-campo" for="merma-cuantas">Cantidad, en ${esc(p.unidad)}s</label>
      <input class="campo" id="merma-cuantas" type="text" inputmode="numeric"
             autocomplete="off" value="1">
      <label class="etiqueta-campo">¿Qué pasó?</label>
      <div class="grupo-botones" id="merma-motivos">
        ${datos.motivos.map((m, i) =>
          `<button type="button" class="op ${i === 0 ? 'activo' : ''}" data-motivo="${esc(m)}">${esc(m)}</button>`
        ).join('')}
      </div>`,
    botones: [
      { texto: 'Cancelar', valor: null },
      {
        texto: 'Anotar la merma', clase: 'btn-rojo',
        valor: (fondo) => {
          const cuantas = Number(String(fondo.querySelector('#merma-cuantas').value).replace(/\D/g, ''));
          if (!cuantas) return undefined;
          return { cuantas, motivo: fondo.querySelector('#merma-motivos .activo').dataset.motivo };
        },
      },
    ],
    alAbrir(fondo) {
      fondo.querySelector('#merma-motivos').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-motivo]');
        if (!b) return;
        for (const otro of fondo.querySelectorAll('#merma-motivos .op')) {
          otro.classList.toggle('activo', otro === b);
        }
      });
      fondo.querySelector('#merma-cuantas').select();
    },
  });

  if (!r) return;

  try {
    const resp = await api.registrarMerma(productoId, r.cuantas, r.motivo);
    datos.existencias = resp.existencias;
    pintarExistencias();
    avisar('Merma anotada');
  } catch (e) {
    avisar(e.message, true);
  }
}

const NOMBRE_MOVIMIENTO = {
  compra: '🚚 Entró', venta: '💵 Se vendió', merma: '💔 Merma',
  conteo: '🔢 Conteo', ajuste: '✏️ Ajuste',
};

/** «¿Y por qué hay 38?» — la respuesta, renglón por renglón. */
async function verHistoria(productoId) {
  const p = datos.existencias.find((x) => x.id === productoId);

  try {
    const { movimientos } = await api.movimientosDe(productoId);

    await ventana({
      titulo: `${p.icono} ${p.nombre} — de dónde sale`,
      cuerpo: movimientos.length === 0
        ? '<p class="texto-ventana">Todavía no hay movimientos.</p>'
        : `<div class="historia">${movimientos.map((m) => `
             <div class="mov">
               <span class="mov-tipo">${NOMBRE_MOVIMIENTO[m.tipo] ?? m.tipo}</span>
               <span class="mov-cant ${m.cantidad < 0 ? 'sale' : 'entra'}">
                 ${m.cantidad > 0 ? '+' : ''}${m.cantidad}
               </span>
               <span class="mov-nota">
                 ${esc(m.motivo ?? '')}${m.usuario_nom ? ` · ${esc(m.usuario_nom)}` : ''}
                 <br><span class="sutil">${esc(m.momento)}</span>
               </span>
             </div>`).join('')}</div>`,
      botones: [{ texto: 'Cerrar', valor: true }],
    });
  } catch (e) {
    avisar(e.message, true);
  }
}

/* ── Qué se controla ───────────────────────────────────────────────────── */

/** Lo que se teclea en el buscador y qué familia se está viendo. */
let buscado = '';
let familiaConfig = '*';

const sinAcentos = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function pintarConfiguracion() {
  const todos = datos.configuracion;

  const controlados = todos.filter((p) => p.controla).length;
  const mezclas = todos.filter((p) => p.gastaNombre).length;

  // Las familias que de verdad hay, para no pintar pestañas vacías
  const familias = [...new Set(todos.map((p) => p.familia))];

  // El filtro es lo que hace usable esta pantalla. Con 137 productos, una
  // lista corrida no sirve para nada: encontrar «Coca cola» sería rodar la
  // pantalla medio minuto.
  const visibles = todos.filter((p) => {
    if (familiaConfig === 'mios' && !p.controla && !p.gastaNombre) return false;
    if (familiaConfig !== '*' && familiaConfig !== 'mios' && p.familia !== familiaConfig) return false;
    if (buscado && !sinAcentos(p.nombre).includes(sinAcentos(buscado))) return false;
    return true;
  });

  $('config-almacen-resumen').innerHTML = `
    <b>${controlados}</b> producto(s) se controlan de ${todos.length}${
      mezclas ? ` · <b>${mezclas}</b> mezcla(s) gastan de otro` : ''}`;

  $('config-almacen-familias').innerHTML = [
    ['*', `Todos (${todos.length})`],
    ['mios', `⚙️ Los que llevo (${controlados + mezclas})`],
    ...familias.map((f) => [f, f]),
  ].map(([clave, texto]) =>
    `<button class="op ${familiaConfig === clave ? 'activo' : ''}" data-fam-config="${esc(clave)}">${esc(texto)}</button>`
  ).join('');

  if (visibles.length === 0) {
    $('almacen-config').innerHTML = `
      <div class="vacio">
        <div class="vacio-icono">🔍</div>
        <div class="vacio-titulo">Nada con ese nombre</div>
      </div>`;
    return;
  }

  // Con las familias a la vista, un encabezado por familia ubica de un vistazo
  let ultimaFamilia = null;

  $('almacen-config').innerHTML = visibles.map((p) => {
    const cabecera = p.familia !== ultimaFamilia && familiaConfig === '*'
      ? `<div class="titulo-bloque">${esc(ultimaFamilia = p.familia)}</div>`
      : ((ultimaFamilia = p.familia), '');

    return cabecera + `
      <div class="fila-almacen ${p.controla || p.gastaNombre ? '' : 'apagado'}" data-config="${p.id}">
        <span class="fila-icono">${esc(p.icono || '📦')}</span>

        <span class="alm-texto">
          <span class="alm-nombre">${esc(p.nombre)}</span>
          <span class="alm-cuanto">
            ${p.gastaNombre
              ? `🔗 gasta 1 <b>${esc(p.gastaNombre)}</b>`
              : p.controla
                ? `1 ${esc(p.envase)} = ${p.porcionesPorEnvase} ${esc(p.unidad)}(s)`
                : 'no lo llevas en almacén'}
          </span>
        </span>

        <span class="fila-acciones">
          ${p.gastaNombre
            ? `<button class="btn btn-chico" data-mezcla="${p.id}">🔗 Cambiar</button>
               <button class="btn btn-chico" data-quitar-mezcla="${p.id}">✕</button>`
            : p.controla
              ? `<button class="btn btn-chico" data-envase="${p.id}"
                         title="Cuántas trae lo que compras">✏️ 1 ${esc(p.envase)} = ${p.porcionesPorEnvase}</button>
                 <button class="btn btn-chico" data-controlar="${p.id}">✔ Se controla</button>`
              : `<button class="btn btn-chico btn-ambar" data-controlar="${p.id}">➕ Controlar</button>
                 <button class="btn btn-chico" data-mezcla="${p.id}"
                         title="Esta bebida se hace con otra">🔗 Gasta de…</button>`}
        </span>
      </div>`;
  }).join('');
}

/** «Esta michelada, ¿de qué cerveza sale?» */
async function pedirMezcla(producto) {
  const candidatos = datos.configuracion.filter((x) => x.controla && x.id !== producto.id);

  if (candidatos.length === 0) {
    avisar('Primero controla el producto del que sale, por ejemplo la cerveza.', true);
    return;
  }

  const elegido = await ventana({
    titulo: `${producto.icono} ${producto.nombre}`,
    cuerpo: `
      <p class="texto-ventana">
        Al vender uno de éstos, ¿de qué producto sale la mercancía?<br>
        <span class="sutil">
          Una michelada baja <b>una cerveza</b> del refrigerador. Las salsas,
          el limón y el hielo no se llevan: complican el inventario y no
          mueven la aguja.
        </span>
      </p>
      <label class="etiqueta-campo" for="mezcla-de">Gasta de</label>
      <select class="campo" id="mezcla-de">
        ${candidatos.map((c) =>
          `<option value="${c.id}" ${c.id === producto.gastaDe ? 'selected' : ''}>
             ${esc(c.icono || '📦')} ${esc(c.nombre)}
           </option>`).join('')}
      </select>`,
    botones: [
      { texto: 'Cancelar', valor: null },
      {
        texto: 'Guardar', clase: 'btn-ambar',
        valor: (v) => Number(v.querySelector('#mezcla-de').value),
      },
    ],
  });

  if (!elegido) return;

  try {
    await api.guardarConfigAlmacen(producto.id, { gastaDe: elegido });
    datos.configuracion = (await api.configAlmacen()).productos;
    pintarConfiguracion();
    avisar('Guardado');
  } catch (e) { avisar(e.message, true); }
}

async function alTocarConfig(e) {
  const dame = (attr, nodo) =>
    datos.configuracion.find((x) => x.id === Number(nodo.dataset[attr]));

  const controlar = e.target.closest('[data-controlar]');
  if (controlar) {
    const p = dame('controlar', controlar);
    try {
      await api.guardarConfigAlmacen(p.id, { controla: !p.controla });
      datos.configuracion = (await api.configAlmacen()).productos;
      pintarConfiguracion();
      avisar(p.controla ? `${p.nombre} ya no se lleva` : `${p.nombre} ya se controla`);
    } catch (err) { avisar(err.message, true); }
    return;
  }

  const mezcla = e.target.closest('[data-mezcla]');
  if (mezcla) return pedirMezcla(dame('mezcla', mezcla));

  const quitar = e.target.closest('[data-quitar-mezcla]');
  if (quitar) {
    const p = dame('quitarMezcla', quitar);
    try {
      await api.guardarConfigAlmacen(p.id, { gastaDe: null });
      datos.configuracion = (await api.configAlmacen()).productos;
      pintarConfiguracion();
    } catch (err) { avisar(err.message, true); }
    return;
  }

  const envase = e.target.closest('[data-envase]');
  if (envase) {
    const p = datos.configuracion.find((x) => x.id === Number(envase.dataset.envase));

    const r = await ventana({
      titulo: `${p.icono} ${p.nombre}`,
      cuerpo: `
        <p class="texto-ventana">
          Cuando compras <b>uno</b>, ¿cuántas porciones trae?<br>
          <span class="sutil">Una botella de whisky da unas 15 copas; una caja de cerveza, 24.</span>
        </p>
        <label class="etiqueta-campo" for="cfg-porciones">Trae</label>
        <input class="campo" id="cfg-porciones" type="text" inputmode="numeric"
               value="${p.porcionesPorEnvase}" autocomplete="off">
        <label class="etiqueta-campo" for="cfg-envase">Lo que compras se llama</label>
        <input class="campo" id="cfg-envase" value="${esc(p.envase)}" autocomplete="off">
        <label class="etiqueta-campo" for="cfg-unidad">Lo que vendes se llama</label>
        <input class="campo" id="cfg-unidad" value="${esc(p.unidad)}" autocomplete="off">`,
      botones: [
        { texto: 'Cancelar', valor: null },
        {
          texto: 'Guardar', clase: 'btn-ambar',
          valor: (fondo) => {
            const n = Number(String(fondo.querySelector('#cfg-porciones').value).replace(/\D/g, ''));
            if (!n) return undefined;
            return {
              porcionesPorEnvase: n,
              envase: fondo.querySelector('#cfg-envase').value.trim() || 'paquete',
              unidad: fondo.querySelector('#cfg-unidad').value.trim() || 'pieza',
            };
          },
        },
      ],
      alAbrir(fondo) { fondo.querySelector('#cfg-porciones').select(); },
    });

    if (!r) return;

    try {
      await api.guardarConfigAlmacen(p.id, r);
      datos.configuracion = (await api.configAlmacen()).productos;
      pintarConfiguracion();
      avisar('Guardado');
    } catch (err) { avisar(err.message, true); }
  }
}

/* ── Cambiar de sección ────────────────────────────────────────────────── */

async function alTocarSeccion(e) {
  const b = e.target.closest('[data-seccion]');
  if (!b) return;

  seccion = b.dataset.seccion;
  capturado = {};
  await cargarAlmacen();
}
