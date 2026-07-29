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
let seccion = 'existencias';   // 'existencias' · 'pedido' · 'conteo' · 'comprar' · 'ajustes'

let datos = {
  existencias: [], diasACubrir: 7, motivos: [],
  compras: { lista: [], diasACubrir: 7 },
  configuracion: [],
};

// Lo que se va tecleando antes de guardar, por producto
let capturado = {};

export function iniciarAlmacen(cuandoVuelva) {
  alVolver = cuandoVuelva;

  $('volver-de-almacen').addEventListener('click', () => alVolver?.());
  $('almacen-secciones').addEventListener('click', alTocarSeccion);
  $('almacen-existencias').addEventListener('click', alTocarExistencia);
  $('almacen-captura').addEventListener('input', alTeclearCantidad);
  $('boton-guardar-captura').addEventListener('click', guardarCaptura);
  $('boton-limpiar-captura').addEventListener('click', limpiarCaptura);
  $('almacen-dias').addEventListener('click', alCambiarDias);
  $('almacen-config').addEventListener('click', alTocarConfig);
}

/* ── Cargar ────────────────────────────────────────────────────────────── */

export async function cargarAlmacen() {
  try {
    const r = await api.almacen();
    datos.existencias = r.existencias;
    datos.diasACubrir = r.diasACubrir;
    datos.motivos = r.motivosDeMerma;

    if (seccion === 'comprar') datos.compras = await api.queComprar(datos.diasACubrir);
    if (seccion === 'ajustes' && puede('ajustes.cambiar')) {
      datos.configuracion = (await api.configAlmacen()).productos;
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
    secciones.push(['pedido', '🚚 Llegó el pedido'], ['conteo', '🔢 Conteo'], ['ajustes', '⚙️ Qué se controla']);
  }

  $('almacen-secciones').innerHTML = secciones.map(([clave, texto]) =>
    `<button class="op ${seccion === clave ? 'activo' : ''}" data-seccion="${clave}">${texto}</button>`
  ).join('');

  // «Llegó el pedido» y «Conteo» son la MISMA lista con distinto sentido:
  // en una se anota lo que entró, en la otra lo que hay. Comparten panel.
  $('almacen-panel-existencias').hidden = seccion !== 'existencias';
  $('almacen-pedido').hidden  = seccion !== 'pedido' && seccion !== 'conteo';
  $('almacen-comprar').hidden = seccion !== 'comprar';
  $('almacen-ajustes').hidden = seccion !== 'ajustes';

  if (seccion === 'existencias') pintarExistencias();
  if (seccion === 'pedido' || seccion === 'conteo') pintarCaptura();
  if (seccion === 'comprar') pintarComprar();
  if (seccion === 'ajustes') pintarConfiguracion();
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
    $('almacen-compras').innerHTML = `
      <div class="vacio">
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

function pintarConfiguracion() {
  const controlables = datos.configuracion;

  $('almacen-config').innerHTML = controlables.map((p) => `
    <div class="fila-almacen ${p.controla ? '' : 'apagado'}" data-config="${p.id}">
      <span class="fila-icono">${esc(p.icono || '📦')}</span>

      <span class="alm-texto">
        <span class="alm-nombre">${esc(p.nombre)}</span>
        <span class="alm-cuanto">
          ${p.gastaNombre
            ? `gasta 1 <b>${esc(p.gastaNombre)}</b>`
            : p.controla
              ? `1 ${esc(p.envase)} = ${p.porcionesPorEnvase} ${esc(p.unidad)}(s)`
              : 'no se controla'}
        </span>
      </span>

      <span class="fila-acciones">
        ${p.gastaNombre ? '' : `
          <button class="btn btn-chico" data-controlar="${p.id}">
            ${p.controla ? '✔ Se controla' : 'No se controla'}
          </button>`}
        ${p.controla && !p.gastaNombre
          ? `<button class="btn btn-chico" data-envase="${p.id}" title="Cuántas trae lo que compras">✏️ ${p.porcionesPorEnvase}</button>`
          : ''}
      </span>
    </div>`).join('');
}

async function alTocarConfig(e) {
  const controlar = e.target.closest('[data-controlar]');
  if (controlar) {
    const p = datos.configuracion.find((x) => x.id === Number(controlar.dataset.controlar));
    try {
      await api.guardarConfigAlmacen(p.id, { controla: !p.controla });
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
