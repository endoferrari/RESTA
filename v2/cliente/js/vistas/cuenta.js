/**
 * CLIENTE · PANTALLA DE LA CUENTA
 * ─────────────────────────────────────────────────────────────────────────────
 * La pantalla donde se pasa la noche: los productos a la izquierda, la cuenta
 * a la derecha. Se toca un producto y se anota.
 *
 * Dos cosas que NO hace esta pantalla, a propósito:
 *
 *  · No calcula el total. Los números llegan calculados del servidor
 *    (`cuenta.totales`). Una tablet con un error no puede descuadrar una cuenta.
 *  · No decide quién puede qué. Esconde los botones que el mesero no puede
 *    usar, pero el que manda es el servidor: aunque alguien se saltara la
 *    pantalla, la acción se rechaza allá.
 */

import { api } from '../api.js';
import { estado, puede, producto } from '../estado.js';
import { $, esc, avisar, ventana, confirmar, pedirTexto } from '../ui.js';
import { formatear } from '/nucleo/dinero.js';
import { preguntaAplica, resumirEleccion } from '/nucleo/opciones.js';

let alVolver = null;

const RAZONES_CANCELACION = [
  'El cliente se arrepintió',
  'Se anotó en la mesa equivocada',
  'Producto agotado',
  'Se fueron sin pagar',
];

export function iniciarCuenta(cuandoVuelva) {
  alVolver = cuandoVuelva;

  $('familias-cuenta').addEventListener('click', alTocarFamilia);
  $('productos-cuenta').addEventListener('click', alTocarProducto);
  $('ticket-lineas').addEventListener('click', alTocarLinea);

  // La pastilla del total (pantallas angostas) baja hasta la cuenta completa.
  $('total-flotante').addEventListener('click', () =>
    document.querySelector('.columna-ticket')
      .scrollIntoView({ behavior: 'smooth', block: 'start' }));

  $('volver-mesas').addEventListener('click', () => alVolver?.());
  $('boton-comandar').addEventListener('click', mandarComanda);
  $('boton-pedir-cuenta').addEventListener('click', pedirLaCuenta);
  $('boton-cancelar-cuenta').addEventListener('click', cancelar);
}

/* ── Pintar ────────────────────────────────────────────────────────────── */

export function pintarCuenta() {
  const c = estado.cuenta;
  if (!c) return;

  $('titulo-cuenta').textContent = c.nombre;
  $('sub-cuenta').textContent =
    `abrió ${c.abiertaPor ?? '—'} · ${c.creada?.slice(11, 16) ?? ''}`;

  pintarFamilias();
  pintarProductos();
  pintarTicket();
  pintarBotones();
}

function pintarFamilias() {
  $('familias-cuenta').innerHTML = estado.menu.familias.map((f) => `
    <button data-familia="${esc(f.clave)}" class="${f.clave === estado.familiaActiva ? 'activo' : ''}">
      ${esc(f.emoji)} ${esc(f.nombre)}
    </button>`).join('');
}

function pintarProductos() {
  const dela = estado.menu.productos.filter((p) => p.familia === estado.familiaActiva);

  // Una familia recién creada no tiene nada. Se dice, en vez de dejar el
  // hueco en blanco y que uno crea que algo falló.
  if (dela.length === 0) {
    const familia = estado.menu.familias.find((f) => f.clave === estado.familiaActiva);
    $('productos-cuenta').innerHTML = `
      <div class="vacio">
        <div class="vacio-icono">${esc(familia?.emoji ?? '🍽️')}</div>
        <div class="vacio-titulo">«${esc(familia?.nombre ?? '')}» todavía no tiene productos</div>
        <div class="vacio-nota">
          Se agregan en <b>⚙️ Configurar → Productos</b>.
        </div>
      </div>`;
    return;
  }

  $('productos-cuenta').innerHTML = dela.map((p, i) => `
    <button class="prod-tile c${(i % 8) + 1}" data-producto="${p.id}">
      ${p.opciones ? '<span class="tiene-submenu">⚙️</span>' : ''}
      <span class="ic">${esc(p.icono || '🍽️')}</span>
      <span class="nm">${esc(p.nombre)}</span>
      <span class="pr dinero">${formatear(p.precio)}</span>
    </button>`).join('');
}

function pintarTicket() {
  const c = estado.cuenta;

  if (c.items.length === 0) {
    $('ticket-lineas').innerHTML =
      '<div class="ticket-vacio">Todavía no hay nada anotado.<br>Toca un producto para empezar.</div>';
  } else {
    $('ticket-lineas').innerHTML = c.items.map((l) => `
      <div class="linea ${l.porComandar > 0 ? 'linea-nueva' : ''}" data-linea="${l.id}">
        <span class="linea-cant">${l.cant}</span>
        <span class="linea-texto">
          <span class="linea-nombre">${esc(l.icono)} ${esc(l.nombre)}</span>
          ${l.detalle ? `<span class="linea-detalle">${esc(l.detalle)}</span>` : ''}
          ${l.porComandar > 0
            ? `<span class="linea-marca">🔔 ${l.porComandar} sin mandar</span>` : ''}
          ${l.cortesia ? '<span class="linea-marca cortesia">🎁 cortesía</span>' : ''}
        </span>
        <span class="linea-importe dinero">${formatear(l.precio * l.cant)}</span>
      </div>`).join('');
  }

  const t = c.totales;
  const filas = [];

  if (t.cortesias) filas.push(['Cortesías', `− ${formatear(t.cortesias)}`, 'sutil']);
  if (t.descuento) filas.push(['Descuento', `− ${formatear(t.descuento)}`, 'sutil']);
  if (t.propina)   filas.push(['Propina', formatear(t.propina), 'sutil']);

  $('ticket-totales').innerHTML =
    filas.map(([et, val, clase]) =>
      `<div class="fila-total ${clase}"><span>${et}</span><span class="dinero">${val}</span></div>`).join('') +
    `<div class="fila-total fila-gran">
       <span>Total</span><span class="dinero">${formatear(t.total)}</span>
     </div>`;

  // El mismo total, en la pastilla flotante de las pantallas angostas.
  $('total-flotante-monto').textContent = formatear(t.total);
}

function pintarBotones() {
  const c = estado.cuenta;
  const pendientes = c.items.reduce((n, i) => n + i.porComandar, 0);

  const comandar = $('boton-comandar');
  comandar.disabled = pendientes === 0;
  comandar.textContent = pendientes > 0
    ? `🔔 Mandar a barra (${pendientes})`
    : '🔔 Nada nuevo que mandar';

  // Los botones de dinero sólo se le enseñan a quien puede usarlos.
  // Aunque alguien se saltara la pantalla, el servidor los rechaza igual.
  $('boton-ir-cobrar').hidden = !puede('cobro.registrar');
  $('boton-pedir-cuenta').hidden = !puede('cuenta.imprimir');
  $('boton-cancelar-cuenta').hidden = !puede('cuenta.cancelar');
}

/* ── Tocar cosas ───────────────────────────────────────────────────────── */

function alTocarFamilia(e) {
  const b = e.target.closest('[data-familia]');
  if (!b) return;
  estado.familiaActiva = b.dataset.familia;
  pintarFamilias();
  pintarProductos();
}

async function alTocarProducto(e) {
  const b = e.target.closest('[data-producto]');
  if (!b) return;

  const p = producto(b.dataset.producto);
  if (!p) return;

  // Si el producto pregunta algo (cómo va el whisky, qué marca de cerveza),
  // se abre el submenú antes de anotar.
  const detalle = p.opciones ? await preguntarOpciones(p) : '';
  if (detalle === null) return;              // se arrepintió

  await anotar(p, detalle);
}

async function anotar(p, detalle) {
  try {
    const r = await api.anotar(estado.cuenta.id, p.id, detalle);
    estado.cuenta = r.cuenta;
    pintarCuenta();
    avisar(`${p.icono} ${p.nombre}${detalle ? ` (${detalle})` : ''} anotado`);
  } catch (err) {
    avisar(err.message, true);
  }
}

/* ── El submenú del mesero ─────────────────────────────────────────────── */

/**
 * Abre las preguntas del producto. Las preguntas que dependen de otra
 * («¿con qué refresco?» sólo si pidió puesto) aparecen y desaparecen
 * conforme se va contestando.
 *
 * Devuelve el detalle ya resumido («Puesto · Coca · Con hielo») o null.
 */
function preguntarOpciones(p) {
  const elegidas = new Map();       // pregunta → respuesta (o lista)

  const respuestasPlanas = () => [...elegidas.values()].flat();

  // Qué grupo tiene abierto el campo de «otra». Sólo uno a la vez.
  let grupoEscribiendo = null;

  function html() {
    return p.opciones.map((preg, i) => {
      if (!preguntaAplica(preg, respuestasPlanas())) return '';
      const puestas = elegidas.get(preg.g) ?? (preg.multi ? [] : null);

      // El campo para la petición especial del cliente. Lo que se escriba
      // aquí queda guardado como una opción más de este producto, así la
      // próxima vez ya sale con su botón.
      const otra = grupoEscribiendo === preg.g
        ? `<span class="caja-otra">
             <input type="text" class="campo-otra" data-otra-campo="${esc(preg.g)}"
                    maxlength="60" autocomplete="off"
                    placeholder="Escribe lo que pidió y Enter…">
             <button type="button" class="op op-ok" data-otra-ok="${esc(preg.g)}">✔</button>
           </span>`
        : `<button type="button" class="op op-otra" data-otra="${esc(preg.g)}"
             title="Algo que no está en la lista. Queda guardado para la próxima.">＋ Otra…</button>`;

      return `
        <div class="grupo-opciones">
          <div class="grupo-titulo">
            ${esc(preg.g)}${preg.multi ? ' <span class="grupo-nota">(puedes marcar varias)</span>' : ''}
          </div>
          <div class="grupo-botones">
            ${preg.ops.map((op) => {
              const activo = preg.multi ? puestas.includes(op) : puestas === op;
              return `<button type="button" class="op ${activo ? 'activo' : ''}"
                        data-preg="${i}" data-op="${esc(op)}">${esc(op)}</button>`;
            }).join('')}
            ${otra}
          </div>
        </div>`;
    }).join('');
  }

  /** El resumen se arma en el orden de las preguntas, no en el que se tocó. */
  function detalleActual() {
    const partes = [];
    for (const preg of p.opciones) {
      if (!preguntaAplica(preg, respuestasPlanas())) continue;
      const v = elegidas.get(preg.g);
      if (!v) continue;
      partes.push(...(Array.isArray(v) ? v : [v]));
    }
    return resumirEleccion(partes);
  }

  return ventana({
    titulo: `${p.icono} ${p.nombre} — ${formatear(p.precio)}`,
    cuerpo: `<div id="opciones-cuerpo">${html()}</div>`,
    botones: [
      { texto: 'Cancelar', valor: null },
      { texto: 'Anotar', clase: 'btn-ambar', valor: () => detalleActual() },
    ],
    alAbrir(fondo) {
      const cuerpo = fondo.querySelector('#opciones-cuerpo');

      /** Repinta y, si hay un campo de «otra» abierto, le deja el cursor. */
      function repintar() {
        cuerpo.innerHTML = html();
        const campo = cuerpo.querySelector('[data-otra-campo]');
        if (campo) setTimeout(() => campo.focus(), 30);
      }

      /** Guarda la petición especial y la deja elegida. */
      async function guardarOtra(grupo) {
        const campo = cuerpo.querySelector(`[data-otra-campo="${CSS.escape(grupo)}"]`);
        if (!campo) return;

        const texto = campo.value.trim();
        if (!texto) { campo.focus(); return; }

        try {
          const r = await api.agregarOpcion(p.id, grupo, texto);

          // El producto de esta pantalla se actualiza con la opción nueva,
          // para que aparezca su botón sin tener que recargar nada.
          p.opciones = r.producto.opciones;

          const preg = p.opciones.find((o) => o.g === grupo);
          if (preg?.multi) {
            const lista = elegidas.get(grupo) ?? [];
            if (!lista.includes(r.opcion)) lista.push(r.opcion);
            elegidas.set(grupo, lista);
          } else {
            elegidas.set(grupo, r.opcion);
          }

          grupoEscribiendo = null;
          repintar();
          if (r.esNueva) avisar(`«${r.opcion}» queda guardado para la próxima`);
        } catch (err) {
          avisar(err.message, true);
        }
      }

      cuerpo.addEventListener('keydown', (e) => {
        if (!e.target.matches('[data-otra-campo]')) return;
        if (e.key === 'Enter') { e.preventDefault(); guardarOtra(e.target.dataset.otraCampo); }
        // Escape cierra el campo, no la ventana entera.
        if (e.key === 'Escape') { e.stopPropagation(); grupoEscribiendo = null; repintar(); }
      });

      cuerpo.addEventListener('click', (e) => {
        // ── Abrir el campo de petición especial ──
        const abrir = e.target.closest('[data-otra]');
        if (abrir) { grupoEscribiendo = abrir.dataset.otra; repintar(); return; }

        const ok = e.target.closest('[data-otra-ok]');
        if (ok) { guardarOtra(ok.dataset.otraOk); return; }

        const b = e.target.closest('[data-op]');
        if (!b) return;

        const preg = p.opciones[Number(b.dataset.preg)];
        const op = b.dataset.op;

        if (preg.multi) {
          const lista = elegidas.get(preg.g) ?? [];
          const i = lista.indexOf(op);
          if (i >= 0) lista.splice(i, 1); else lista.push(op);
          elegidas.set(preg.g, lista);
        } else {
          // Volver a tocar la misma respuesta la quita.
          elegidas.set(preg.g, elegidas.get(preg.g) === op ? null : op);
        }

        // Al cambiar una respuesta puede dejar de tener sentido otra
        // (pidió "derecho" después de haber elegido refresco): se limpia.
        for (const preg2 of p.opciones) {
          if (!preguntaAplica(preg2, respuestasPlanas())) elegidas.delete(preg2.g);
        }

        repintar();
      });
    },
  });
}

/* ── Quitar un renglón ─────────────────────────────────────────────────── */

async function alTocarLinea(e) {
  const b = e.target.closest('[data-linea]');
  if (!b) return;

  const linea = estado.cuenta.items.find((l) => l.id === Number(b.dataset.linea));
  if (!linea) return;

  if (linea.pagado) return avisar('Ese renglón ya se cobró.', true);

  // Lo que ya salió a barra no lo quita un mesero: se está preparando.
  if (estado.usuario.rol === 'mesero' && linea.comandadaCant > 0) {
    return avisar(`«${linea.nombre}» ya salió a barra. Pídele a la caja que lo quite.`, true);
  }

  const cuantas = linea.cant === 1
    ? 1
    : await preguntarCuantas(linea);
  if (!cuantas) return;

  let motivo = null;
  if (linea.comandadaCant > 0) {
    motivo = await pedirTexto(
      'Ya salió a barra o cocina',
      `¿Por qué se quita «${linea.nombre}»?`,
      { sugerencias: RAZONES_CANCELACION },
    );
    if (!motivo) return;
  } else {
    const seguro = await confirmar(
      'Quitar de la cuenta',
      `¿Quitar ${cuantas} × ${esc(linea.nombre)}?`,
      'Quitar',
    );
    if (!seguro) return;
  }

  try {
    const r = await api.quitar(estado.cuenta.id, linea.id, {
      cant: cuantas, motivo, version: estado.cuenta.version,
    });
    estado.cuenta = r.cuenta;
    pintarCuenta();
    avisar('Renglón quitado');
  } catch (err) {
    // Si otro mesero cambió la cuenta mientras tanto, el servidor manda la
    // cuenta como está ahora y la pantalla se corrige sola.
    if (err.cuenta) {
      estado.cuenta = err.cuenta;
      pintarCuenta();
    }
    avisar(err.message, true);
  }
}

function preguntarCuantas(linea) {
  return ventana({
    titulo: `Quitar ${linea.nombre}`,
    cuerpo: `
      <p class="texto-ventana">Hay ${linea.cant}. ¿Cuántas quitas?</p>
      <div class="grupo-botones" id="cuantas">
        ${Array.from({ length: linea.cant }, (_, i) => i + 1)
          .map((n) => `<button type="button" class="op" data-n="${n}">${n}</button>`).join('')}
      </div>`,
    botones: [{ texto: 'Cancelar', valor: null }],
    alAbrir(fondo, terminar) {
      // Se cierra sola al elegir el número: un toque en vez de dos.
      fondo.querySelector('#cuantas').addEventListener('click', (e) => {
        const b = e.target.closest('[data-n]');
        if (b) terminar(Number(b.dataset.n));
      });
    },
  });
}

/* ── Comanda, cuenta y cancelación ─────────────────────────────────────── */

async function mandarComanda() {
  try {
    const r = await api.comandar(estado.cuenta.id);
    estado.cuenta = r.cuenta;
    pintarCuenta();
    const piezas = r.salieron.reduce((n, s) => n + s.cant, 0);
    avisar(`${piezas} producto(s) mandados a barra/cocina`);
  } catch (e) {
    avisar(e.message, true);
  }
}

async function pedirLaCuenta() {
  try {
    const r = await api.pedirCuenta(estado.cuenta.id);
    estado.cuenta = r.cuenta;
    pintarCuenta();
    avisar('Anotado: el cliente pidió su cuenta');
  } catch (e) {
    avisar(e.message, true);
  }
}

async function cancelar() {
  const c = estado.cuenta;

  const motivo = await pedirTexto(
    `Cancelar «${c.nombre}»`,
    `Se dejarán de cobrar ${formatear(c.totales.total)}. ¿Por qué se cancela?`,
    { sugerencias: RAZONES_CANCELACION },
  );
  if (!motivo) return;

  // La segunda pregunta es la que salva el inventario.
  //
  // Cancelar sin más sirve cuando se anotó en la mesa equivocada o el cliente
  // se fue antes de que le sirvieran. Pero el caso que de verdad pasa en un
  // bar es el otro: se lo tomaron y se fueron. Ahí el dinero se perdió Y la
  // mercancía salió del refrigerador. Si no se descuenta, el almacén las
  // sigue contando y al mes nadie entiende por qué nunca cuadra.
  const seConsumio = await ventana({
    titulo: '¿Se lo llegaron a consumir?',
    cuerpo: `
      <p class="texto-ventana">
        «${esc(c.nombre)}» tiene <b>${c.totales.articulos} artículo(s)</b> anotados.
      </p>
      <p class="sutil">
        Esto no cambia el dinero —esa cuenta no se cobra de todos modos—,
        cambia el <b>almacén</b>.
      </p>`,
    botones: [
      { texto: 'No se sirvió nada', valor: 'no' },
      { texto: '🍺 Sí, se lo tomaron', valor: 'si', clase: 'btn-rojo' },
    ],
  });
  if (!seConsumio) return;               // cerró la ventana: no se cancela nada

  try {
    await api.cancelarCuenta(c.id, motivo, seConsumio === 'si', c.version);
    avisar(seConsumio === 'si'
      ? 'Cuenta cancelada. La mercancía se descontó del almacén.'
      : 'Cuenta cancelada. Queda registrada con el motivo.');
    alVolver?.();
  } catch (e) {
    if (e.cuenta) { estado.cuenta = e.cuenta; pintarCuenta(); }
    avisar(e.message, true);
  }
}
