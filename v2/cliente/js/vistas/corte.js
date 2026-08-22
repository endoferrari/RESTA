/**
 * CLIENTE · CORTE DE CAJA
 * ─────────────────────────────────────────────────────────────────────────────
 * Abrir la caja al empezar la noche, ver cómo va, y cerrarla contando el
 * dinero.
 *
 * La pantalla está armada alrededor de una sola pregunta: **¿cuánto debe
 * haber en el cajón?**. Todo lo demás —lo más vendido, las cortesías— es
 * información útil, pero eso es lo que se revisa con el bar cerrado y ganas
 * de irse a dormir.
 *
 * El número no lo calcula esta pantalla. Lo calcula el servidor con
 * `nucleo/corte.js`, que está probado. Aquí sólo se pinta.
 */

import { api } from '../api.js';
import { estado } from '../estado.js';
import { $, esc, avisar, confirmar, ventana } from '../ui.js';
import { formatear } from '/nucleo/dinero.js';

let alVolver = null;
let alAbrirCaja = null;
let datos = { turno: null, corte: null, fondoSugerido: 0 };
let contado = '';         // lo que se teclea al cerrar, en centavos como texto

export function iniciarCorte(cuandoVuelva, cuandoAbraLaCaja) {
  alVolver = cuandoVuelva;
  alAbrirCaja = cuandoAbraLaCaja;

  $('volver-de-corte').addEventListener('click', () => alVolver?.());
  $('boton-abrir-caja').addEventListener('click', abrirCaja);
  $('boton-cerrar-caja').addEventListener('click', cerrarCaja);
  $('boton-imprimir-corte').addEventListener('click', imprimir);
  $('corte-teclado').addEventListener('click', alTocarTecla);
  $('boton-ver-dia').addEventListener('click', verDia);
}

/* ── Cargar ────────────────────────────────────────────────────────────── */

export async function cargarCorte() {
  try {
    const t = await api.turno();
    datos.turno = t.turno;
    datos.fondoSugerido = t.fondoSugerido;
    datos.corte = t.turno ? (await api.corte()).corte : null;
    contado = '';
    pintarCorte();
    pintarAvisoDeCaja();

    // El día de hoy queda puesto, que es lo que se consulta el 90% de las veces.
    const campo = $('corte-fecha-dia');
    if (campo && !campo.value) campo.value = new Date().toLocaleDateString('sv-SE');
  } catch (e) {
    if (e.codigo !== 401 && e.codigo !== 403) avisar(e.message, true);
  }
}

/** ¿Hay caja abierta ahora mismo? Lo pregunta la app al arrancar. */
export function hayCaja() {
  return !!datos.turno;
}

/** La barra amarilla de «la caja no está abierta», en la pantalla de Mesas. */
export function pintarAvisoDeCaja() {
  const aviso = $('aviso-caja');
  const hayTurno = !!datos.turno;

  aviso.hidden = hayTurno || !estado.permisos.includes('turno.cerrar');
  if (!aviso.hidden) {
    aviso.innerHTML =
      'La caja no está abierta. Se puede vender, pero esas ventas no van a ' +
      'aparecer en ningún corte. <b>Abre la caja</b> desde el botón Corte.';
  }
}

/* ── Pintar ────────────────────────────────────────────────────────────── */

export function pintarCorte() {
  const hayTurno = !!datos.turno;

  $('corte-sin-turno').hidden = hayTurno;
  $('corte-con-turno').hidden = !hayTurno;

  if (!hayTurno) {
    $('fondo-sugerido').textContent = formatear(datos.fondoSugerido);
    return;
  }

  const c = datos.corte;
  const t = datos.turno;

  $('titulo-corte').textContent = `Turno #${t.id}`;
  $('sub-corte').textContent = `abrió ${t.abiertoPor ?? '—'} · ${t.abierto ?? ''}`;

  // ── Lo que importa: el cajón ──
  const dieron = aCentavos(contado);
  const diferencia = contado ? dieron - c.efectivoEsperado : null;

  $('corte-cajon').innerHTML = `
    <div class="fila-total sutil"><span>Fondo con que se abrió</span>
      <span class="dinero">${formatear(c.fondo)}</span></div>
    <div class="fila-total sutil"><span>Entró en efectivo</span>
      <span class="dinero">${formatear(c.porMetodo.efectivo ?? 0)}</span></div>
    <div class="fila-total fila-gran"><span>Debe haber</span>
      <span class="dinero">${formatear(c.efectivoEsperado)}</span></div>`;

  $('corte-contado').textContent = contado ? formatear(dieron) : '—';

  $('corte-diferencia').innerHTML = diferencia === null
    ? '<span class="cambio-nota">Cuenta el dinero del cajón y tecléalo.</span>'
    : diferencia === 0
      ? '<span class="cambio-et">La caja</span><span class="cambio-valor dinero">CUADRA</span>'
      : diferencia < 0
        ? `<span class="cambio-et">Faltan</span><span class="cambio-valor dinero falta">${formatear(-diferencia)}</span>`
        : `<span class="cambio-et">Sobran</span><span class="cambio-valor dinero">${formatear(diferencia)}</span>`;

  // ── Lo vendido ──
  const filas = [
    ['Cuentas cobradas', String(c.tickets)],
    ['Productos', String(c.articulos)],
    ['Consumo cobrado', formatear(c.consumo)],
  ];
  if (c.descuento) filas.push(['Descuentos', `− ${formatear(c.descuento)}`]);
  if (c.propina)   filas.push(['Propinas', formatear(c.propina)]);

  // Las cortesías van aparte y SIN signo de menos: nunca estuvieron dentro
  // del total, así que restarlas haría creer que el total sería mayor.
  const regalado = c.cortesias
    ? `<div class="fila-total sutil" style="margin-top:8px">
         <span>Se regaló en cortesías</span>
         <span class="dinero">${formatear(c.cortesias)}</span></div>`
    : '';

  $('corte-ventas').innerHTML =
    filas.map(([e, v]) =>
      `<div class="fila-total sutil"><span>${e}</span><span class="dinero">${v}</span></div>`).join('') +
    `<div class="fila-total fila-gran"><span>Total vendido</span>
       <span class="dinero">${formatear(c.total)}</span></div>` + regalado;

  // Efectivo y tarjeta salen siempre, aunque estén en cero: si un día no
  // entró nada en efectivo, eso mismo es un dato. La transferencia sólo
  // aparece si de verdad se usó; si no, es un renglón en cero que estorba.
  const metodos = ['efectivo', 'tarjeta']
    .concat((c.porMetodo.transferencia ?? 0) > 0 ? ['transferencia'] : []);

  $('corte-metodos').innerHTML = metodos.map((m) => `
    <div class="fila-total sutil">
      <span>${nombreMetodo(m)}</span>
      <span class="dinero">${formatear(c.porMetodo[m] ?? 0)}</span>
    </div>`).join('');

  // ── Lo que no se cobró ──
  $('corte-canceladas').hidden = !c.canceladas.cuantas && !c.anulados;
  $('corte-canceladas').innerHTML =
    (c.canceladas.cuantas ? `
      <div class="titulo-bloque">Cuentas canceladas</div>
      ${c.canceladas.lista.map((x) => `
        <div class="fila-total sutil">
          <span>${esc(x.nombre)} · ${esc(x.motivo ?? '')} · ${esc(x.usuario ?? '')}</span>
          <span class="dinero">${formatear(x.total)}</span>
        </div>`).join('')}
      <div class="fila-total"><span><b>Total no cobrado</b></span>
        <span class="dinero"><b>${formatear(c.canceladas.monto)}</b></span></div>` : '') +
    (c.anulados ? `<p class="sutil">${c.anulados} ticket(s) anulado(s) en este turno.</p>` : '');

  // ── Lo que se vendió ──
  //
  // Al llegar salen los diez de arriba, que es lo que se mira siempre. La
  // lista entera está a un toque: sirve para el pedido del proveedor y para
  // contestar «¿cuántas alitas salieron?» sin ponerse a sumar tickets.
  pintarVendido();

  // ── Se puede cerrar? ──
  const cerrar = $('boton-cerrar-caja');
  cerrar.disabled = !contado || c.cuentasAbiertas > 0;
  cerrar.textContent = c.cuentasAbiertas > 0
    ? `Hay ${c.cuentasAbiertas} mesa(s) abierta(s)`
    : contado ? 'Cerrar la caja' : 'Cuenta el efectivo primero';
}

/** Cuántos productos distintos se enseñan antes de decir «ver todos». */
const DE_ENTRADA = 10;
let verTodoLoVendido = false;

function pintarVendido() {
  const lista = datos.corte?.vendido ?? [];
  const caja = $('corte-mas-vendido');

  caja.hidden = lista.length === 0;
  if (lista.length === 0) return;

  const seVen = verTodoLoVendido ? lista : lista.slice(0, DE_ENTRADA);
  const piezas = lista.reduce((n, p) => n + p.piezas, 0);
  const regaladas = lista.reduce((n, p) => n + p.regaladas, 0);

  caja.innerHTML = `
    <div class="titulo-bloque">
      ${verTodoLoVendido ? 'Todo lo que se vendió' : 'Lo más vendido'}
    </div>
    <p class="sutil">
      <b>${piezas}</b> pieza(s) de <b>${lista.length}</b> producto(s) distinto(s)${
        regaladas ? ` · ${regaladas} de cortesía` : ''}
    </p>

    ${seVen.map((p) => `
      <div class="fila-total sutil">
        <span><b>${p.piezas}</b> × ${esc(p.nombre)}${
          p.regaladas ? ` <span style="color:var(--ambar)">(${p.regaladas} de cortesía)</span>` : ''}</span>
        <span class="dinero">${formatear(p.importe)}</span>
      </div>`).join('')}

    ${lista.length > DE_ENTRADA ? `
      <button class="btn btn-chico" id="boton-ver-todo-vendido" style="margin-top:10px">
        ${verTodoLoVendido
          ? '▲ Ver sólo los 10 primeros'
          : `▼ Ver los ${lista.length} productos`}
      </button>` : ''}`;

  $('boton-ver-todo-vendido')?.addEventListener('click', () => {
    verTodoLoVendido = !verTodoLoVendido;
    pintarVendido();
  });
}

const nombreMetodo = (m) => ({
  efectivo: '💵 Efectivo', tarjeta: '💳 Tarjeta', transferencia: '📱 Transferencia',
}[m] ?? m);

/** Lo tecleado se lee como centavos, igual que en la pantalla de cobro. */
function aCentavos(texto) {
  const soloNumeros = String(texto).replace(/\D/g, '');
  return soloNumeros ? Number(soloNumeros) : 0;
}

function alTocarTecla(e) {
  const b = e.target.closest('[data-tecla]');
  if (!b) return;

  const t = b.dataset.tecla;
  if (t === 'borrar') contado = contado.slice(0, -1);
  else if (t === 'limpiar') contado = '';
  else if (contado.length < 9) contado += t;

  pintarCorte();
}

/* ── Acciones ──────────────────────────────────────────────────────────── */

async function abrirCaja() {
  const fondo = await ventana({
    titulo: 'Abrir la caja',
    cuerpo: `
      <p class="texto-ventana">
        ¿Con cuánto dinero empieza el cajón? Es lo que se deja para dar cambio.
        Al final de la noche se compara contra esto.
      </p>
      <label class="etiqueta-campo" for="campo-fondo">Fondo, en pesos</label>
      <input class="campo" id="campo-fondo" type="text" inputmode="numeric" autocomplete="off"
             value="${Math.round(datos.fondoSugerido / 100)}">`,
    botones: [
      { texto: 'Cancelar', valor: null },
      {
        texto: 'Abrir la caja', clase: 'btn-ambar',
        valor: (fondo) => {
          const pesos = Number(String(fondo.querySelector('#campo-fondo').value).replace(/[^\d]/g, ''));
          return Number.isFinite(pesos) ? pesos * 100 : undefined;
        },
      },
    ],
    alAbrir(fondo) { fondo.querySelector('#campo-fondo').select(); },
  });

  if (fondo === null) return;

  try {
    await api.abrirTurno(fondo);
    await cargarCorte();
    avisar('Caja abierta');
    // Abrir la caja es el paso previo a trabajar, no un fin en sí mismo:
    // en cuanto queda abierta, la pantalla se va sola a Mesas.
    alAbrirCaja?.();
  } catch (e) {
    avisar(e.message, true);
  }
}

async function cerrarCaja() {
  const c = datos.corte;
  const dieron = aCentavos(contado);
  const diferencia = dieron - c.efectivoEsperado;

  const aviso = diferencia === 0
    ? 'La caja cuadra exacto.'
    : diferencia < 0
      ? `<b>Faltan ${formatear(-diferencia)}</b> en el cajón.`
      : `<b>Sobran ${formatear(diferencia)}</b> en el cajón.`;

  const notas = await ventana({
    titulo: 'Cerrar la caja',
    cuerpo: `
      <p class="texto-ventana">
        ${aviso}<br>
        Se van a guardar ${c.tickets} cuenta(s) por ${formatear(c.total)}.
      </p>
      <p class="texto-ventana sutil">
        Esto no se puede deshacer. Después de cerrar, para vender hay que abrir
        una caja nueva.
      </p>
      <label class="etiqueta-campo" for="campo-notas">Notas (opcional)</label>
      <input class="campo" id="campo-notas" type="text" maxlength="200" autocomplete="off"
             placeholder="${diferencia !== 0 ? 'Por ejemplo: por qué no cuadró' : ''}">`,
    botones: [
      { texto: 'Todavía no', valor: null },
      {
        texto: 'Cerrar la caja', clase: 'btn-rojo',
        valor: (fondo) => fondo.querySelector('#campo-notas').value.trim() || '',
      },
    ],
  });

  if (notas === null) return;

  try {
    const r = await api.cerrarTurno(dieron, notas || null);

    await ventana({
      titulo: `Caja cerrada · turno ${r.corte.turno.id}`,
      cuerpo: `
        <div class="cambio-grande dinero ${r.corte.diferencia < 0 ? 'falta' : ''}">
          ${r.corte.diferencia === 0 ? 'CUADRA'
            : r.corte.diferencia < 0 ? `FALTAN ${formatear(-r.corte.diferencia)}`
            : `SOBRAN ${formatear(r.corte.diferencia)}`}
        </div>
        <p class="texto-ventana" style="text-align:center">
          ${r.corte.tickets} cuenta(s) · ${formatear(r.corte.total)}<br>
          <span class="sutil">
            ${r.impresion?.impreso ? 'El corte va en camino a la impresora.' : 'El corte quedó guardado.'}<br>
            ${r.respaldo?.archivo
              ? 'Respaldo de la base guardado.'
              : `Respaldo: ${esc(r.respaldo?.error ?? 'no se pudo')}`}
          </span>
        </p>`,
      botones: [{ texto: 'Listo', valor: true, clase: 'btn-ambar' }],
    });

    await cargarCorte();
  } catch (e) {
    avisar(e.message, true);
  }
}

async function imprimir() {
  try {
    const r = await api.imprimirCorte(datos.turno.id);
    avisar(r.impresion?.impreso ? 'Corte mandado a la impresora' : 'La impresora está apagada', !r.impresion?.impreso);
  } catch (e) {
    avisar(e.message, true);
  }
}

/* ── Ventas de un día ──────────────────────────────────────────────────── */

/**
 * El corte de la pantalla es por turno, que es lo correcto para cuadrar el
 * cajón. Esto es lo otro que hace falta: ver un día entero.
 *
 * Sin esto, las ventas importadas de la v1 no se verían en ningún lado —no
 * pertenecen a ningún turno— y no habría forma de comprobar que la migración
 * trajo el dinero completo.
 */
async function verDia() {
  const fecha = $('corte-fecha-dia').value;
  if (!fecha) { avisar('Elige un día', true); return; }

  $('corte-dia-resultado').innerHTML = '<p class="sutil">Buscando…</p>';
  try {
    const r = await api.ventasDelDia(fecha);
    pintarDia(r.dia);
  } catch (e) {
    $('corte-dia-resultado').innerHTML = `<p class="sutil">${esc(e.message)}</p>`;
  }
}

function pintarDia(d) {
  if (!d.ventas) {
    $('corte-dia-resultado').innerHTML = '<p class="sutil">Ese día no se vendió nada.</p>';
    return;
  }

  const t = d.totales;
  const importadas = d.tickets.filter((x) => x.importado).length;

  // Mismos renglones y mismo orden que el corte del turno, para que las dos
  // cifras se puedan comparar de un vistazo sin traducir nada.
  const filas = [
    ['Cuentas cobradas', String(d.ventas)],
    ['Productos', String(t.articulos)],
    ['Consumo cobrado', formatear(t.consumo)],
  ];
  if (t.descuento) filas.push(['Descuentos', `− ${formatear(t.descuento)}`]);
  if (t.propina)   filas.push(['Propinas', formatear(t.propina)]);

  const metodos = Object.entries(d.porMetodo)
    .map(([m, v]) => `<div class="fila-total sutil">
         <span>${nombreMetodo(m)}</span>
         <span class="dinero">${formatear(v)}</span></div>`).join('');

  $('corte-dia-resultado').innerHTML = `
    ${filas.map(([e, v]) => `
      <div class="fila-total sutil"><span>${e}</span>
        <span class="dinero">${v}</span></div>`).join('')}
    <div class="fila-total fila-gran">
      <span>Total del día</span>
      <span class="dinero">${formatear(t.total)}</span>
    </div>
    ${t.cortesias ? `<div class="fila-total sutil">
       <span>Se regaló en cortesías</span>
       <span class="dinero">${formatear(t.cortesias)}</span></div>` : ''}

    <div class="titulo-bloque">Cómo pagaron</div>
    ${metodos}

    <div class="titulo-bloque">Los tickets</div>
    ${d.tickets.map((x) => `
      <div class="fila-total sutil">
        <span>${String(x.folio).padStart(4, '0')} · ${esc(x.nombre)}
          ${x.importado ? '<span class="sutil">· v1</span>' : ''}</span>
        <span class="dinero">${formatear(x.total)}</span>
      </div>`).join('')}

    ${importadas ? `<p class="sutil">${importadas} de esos tickets vienen importados de la
       v1 y no pertenecen a ningún turno; por eso se ven aquí y no en el corte
       del turno.</p>` : ''}`;
}
