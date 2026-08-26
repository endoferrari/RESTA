/**
 * CLIENTE · IMPRESORA
 * ─────────────────────────────────────────────────────────────────────────────
 * El foquito de la barra de arriba y la pantalla para configurarla.
 *
 * El foquito es lo más importante de esta pantalla. Hoy, en la v1, si la
 * impresora está apagada nadie se entera hasta que un cliente reclama su
 * ticket. Aquí se ve todo el tiempo, en todas las pantallas:
 *
 *    verde = lista  ·  ámbar = imprimiendo o esperando  ·  rojo = revísala
 */

import { api } from '../api.js';
import { estado, puede } from '../estado.js';
import { $, esc, avisar, confirmar } from '../ui.js';
import { LOGO_TICKET, rasterizarLogo } from '../logo-once.js';

let alVolver = null;
let datos = { estado: null, configuracion: null, modos: [], esWindows: false };

export function iniciarImpresora(cuandoVuelva) {
  alVolver = cuandoVuelva;

  $('volver-de-impresora').addEventListener('click', () => alVolver?.());
  $('foquito').addEventListener('click', () => alVerPantalla?.());
  $('impresora-modos').addEventListener('click', alElegirModo);
  $('form-impresora').addEventListener('submit', guardar);
  $('boton-prueba').addEventListener('click', hacerPrueba);
  $('boton-reintentar').addEventListener('click', reintentar);
  $('boton-mandar-logo').addEventListener('click', mandarLogo);

  // Se enseña en blanco y negro, que es como va a salir en el papel.
  $('logo-vista').innerHTML = LOGO_TICKET;
  $('cola-impresion').addEventListener('click', alTocarCola);
}

let alVerPantalla = null;
export function alTocarFoquito(fn) { alVerPantalla = fn; }

/* ── El foquito ────────────────────────────────────────────────────────── */

/** Lo llama la app cuando el servidor avisa que cambió el estado. */
export function ponerEstadoImpresion(nuevo) {
  datos.estado = nuevo;
  pintarFoquito();
  if (estado.vista === 'impresora') pintarImpresora();
}

function pintarFoquito() {
  const e = datos.estado;
  const foco = $('foquito');

  // Ojo: esto se comprueba AQUÍ y no sólo al entrar. Antes se escondía al
  // iniciar sesión pero volvía a aparecer en cuanto llegaba el primer aviso
  // de la impresora, y a un mesero le salía un botón que no le sirve.
  if (!e || !puedeVerImpresora()) { foco.hidden = true; return; }

  foco.hidden = false;
  foco.className = `foquito foquito-${e.luz}`;
  foco.title = e.mensaje;

  // Lleva la palabra «Impresora» escrita, no sólo el foquito de color. Antes
  // era una pastilla con un punto adentro y nada más: en la barra lateral se
  // veía como un botón vacío y nadie adivinaba que ahí se entra a configurar
  // la impresora. El color sigue siendo lo que se ve de lejos; el renglón de
  // abajo dice en qué está («Lista», «2 en cola», el error).
  foco.innerHTML =
    `<span class="foco"></span>` +
    '<span class="foquito-texto">' +
      '<span class="foquito-que">🖨️ Impresora</span>' +
      `<span class="foquito-como">${esc(e.mensaje)}</span>` +
    '</span>' +
    (e.pendientes ? `<span class="foco-cuantos">${e.pendientes}</span>` : '');
}

/* ── Cargar ────────────────────────────────────────────────────────────── */

export async function cargarImpresora() {
  try {
    datos = await api.impresion();
    pintarFoquito();
    if (estado.vista === 'impresora') pintarImpresora();
  } catch (e) {
    if (e.codigo !== 401) console.warn('No pude leer el estado de la impresora:', e.message);
  }
}

/* ── La pantalla ───────────────────────────────────────────────────────── */

const EXPLICA_MODO = {
  simulada: 'No imprime nada: escribe el ticket a un archivo de texto en la carpeta de datos. ' +
            'Sirve para revisar cómo queda el papel sin gastarlo.',
  red:      'La más confiable de todas. Le manda los bytes por la red directo a la impresora, ' +
            'sin drivers ni nada que se desconfigure. Necesita que la impresora tenga cable de red o WiFi.',
  windows:  'Por el spooler de Windows. Es lo que usa la XPRINTER conectada por USB.',
  com:      'Por un puerto COM (Bluetooth clásico). ⚠️ Si la impresora Bluetooth es BLE, ' +
            'Windows no puede imprimir en ella y no hay arreglo por código.',
};

export function pintarImpresora() {
  const c = datos.configuracion;
  const e = datos.estado;
  if (!c) return;

  // Estado grande arriba
  $('impresora-estado').className = `estado-impresora estado-${e?.luz ?? 'verde'}`;
  $('impresora-estado').innerHTML = `
    <span class="foco grande"></span>
    <span>
      <b>${esc(e?.mensaje ?? 'Sin información')}</b>
      ${e?.ultimoExito ? `<br><span class="sutil">Lo último que salió: ${esc(e.ultimoExito.descripcion)}</span>` : ''}
      ${e?.ultimoError ? `<br><span class="sutil">Reintentando en ${e.ultimoError.siguienteIntentoEn} s (intento ${e.ultimoError.intentos})</span>` : ''}
    </span>`;

  // Modos
  $('impresora-modos').innerHTML = datos.modos.map((m) => `
    <button type="button" class="op ${c.modo === m ? 'activo' : ''}" data-modo="${m}">
      ${nombreModo(m)}
    </button>`).join('');

  $('explica-modo').textContent = EXPLICA_MODO[c.modo] ?? '';

  // Los campos que hacen falta según el modo
  $('campos-red').hidden = c.modo !== 'red';
  $('campos-windows').hidden = c.modo !== 'windows';
  $('campos-com').hidden = c.modo !== 'com';

  $('impresora-host').value = c.host ?? '';
  $('impresora-puerto').value = c.puerto ?? 9100;
  $('impresora-nombre').value = c.impresora ?? '';
  $('impresora-com').value = c.com ?? '';
  $('impresora-pie').value = c.pie ?? '';
  $('impresora-activa').checked = !!c.activa;
  $('impresora-comanda').checked = !!c.comanda;

  for (const boton of $('impresora-ancho').querySelectorAll('[data-ancho]')) {
    boton.classList.toggle('activo', Number(boton.dataset.ancho) === c.anchoMm);
  }

  // Aviso de que aquí no se puede probar de verdad
  $('aviso-linux').hidden = datos.esWindows;

  pintarCola();
}

const nombreModo = (m) => ({
  simulada: '📄 Simulada (a un archivo)',
  red: '🌐 Red (lo más confiable)',
  windows: '🖨️ Windows / USB',
  com: '📶 Puerto COM (Bluetooth)',
}[m] ?? m);

function pintarCola() {
  const cola = datos.estado?.cola ?? [];
  $('bloque-cola').hidden = cola.length === 0;

  $('cola-impresion').innerHTML = cola.map((t) => `
    <div class="trabajo">
      <span class="trabajo-nombre">${esc(t.descripcion)}</span>
      ${t.error ? `<span class="trabajo-error">${esc(t.error)}</span>` : ''}
      ${t.intentos ? `<span class="sutil">${t.intentos} intento(s)</span>` : ''}
      <button class="btn btn-chico" data-cancelar="${t.id}">Quitar</button>
    </div>`).join('');
}

/* ── Acciones ──────────────────────────────────────────────────────────── */

function alElegirModo(e) {
  const b = e.target.closest('[data-modo]');
  if (!b) return;
  datos.configuracion.modo = b.dataset.modo;
  pintarImpresora();
}

async function guardar(e) {
  e.preventDefault();

  const anchoElegido = $('impresora-ancho').querySelector('.activo');

  try {
    const r = await api.guardarImpresora({
      modo: datos.configuracion.modo,
      anchoMm: Number(anchoElegido?.dataset.ancho ?? 80),
      host: $('impresora-host').value,
      puerto: Number($('impresora-puerto').value) || 9100,
      impresora: $('impresora-nombre').value,
      com: $('impresora-com').value,
      pie: $('impresora-pie').value,
      activa: $('impresora-activa').checked,
      comanda: $('impresora-comanda').checked,
    });
    datos.configuracion = r.configuracion;
    datos.estado = r.estado;
    pintarImpresora();
    avisar(r.configuracion.comanda
      ? 'Impresora guardada'
      : 'Guardado. La comanda de barra ya no sale en papel.');
  } catch (err) {
    avisar(err.message, true);
  }
}

async function hacerPrueba() {
  try {
    const r = await api.pruebaDeImpresion();
    datos.estado = r.estado;
    pintarImpresora();
    avisar(r.impreso
      ? 'Prueba mandada a la impresora'
      : r.motivo ?? 'La impresora está apagada en los ajustes', !r.impreso);
  } catch (e) {
    avisar(e.message, true);
  }
}

/**
 * Convierte el logo a puntos y lo manda al servidor.
 *
 * Se hace AQUÍ y no en el servidor porque para pasar un dibujo a puntos hay
 * que dibujarlo, y el navegador sabe dibujar; Node no. Se hace una sola vez
 * y de ahí en adelante el ticket sale con logo.
 */
async function mandarLogo() {
  try {
    const anchoDelPapel = datos.configuracion?.anchoMm === 58 ? 384 : 576;
    const raster = await rasterizarLogo({ anchoDelPapel });

    await api.guardarLogoTicket(raster);
    avisar('Logo guardado. Los próximos tickets ya salen con él.');
  } catch (e) {
    avisar(e.message, true);
  }
}

async function reintentar() {
  try {
    const r = await api.reintentarImpresion();
    datos.estado = r.estado;
    pintarImpresora();
    avisar('Reintentando…');
  } catch (e) {
    avisar(e.message, true);
  }
}

async function alTocarCola(e) {
  const b = e.target.closest('[data-cancelar]');
  if (!b) return;

  const seguro = await confirmar(
    'Quitar de la cola',
    'Ese papel ya no va a salir. ¿Seguro?',
    'Quitar',
  );
  if (!seguro) return;

  try {
    const r = await api.cancelarImpresion(Number(b.dataset.cancelar));
    datos.estado = r.estado;
    pintarImpresora();
  } catch (err) {
    avisar(err.message, true);
  }
}

/* ── El ancho del papel ────────────────────────────────────────────────── */

export function iniciarAncho() {
  $('impresora-ancho').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ancho]');
    if (!b) return;
    for (const otro of $('impresora-ancho').querySelectorAll('[data-ancho]')) {
      otro.classList.toggle('activo', otro === b);
    }
  });
}

/** ¿Se le enseña el botón de la impresora a esta persona? */
export function puedeVerImpresora() {
  return puede('impresora.operar') || puede('ajustes.cambiar');
}

/**
 * ¿La comanda sale en papel?
 *
 * Lo pregunta la pantalla de la cuenta para escribirlo en el botón: si la
 * comanda está en «sin papel», el mesero tiene que verlo ANTES de tocar,
 * no quedarse esperando junto a una impresora que no va a sonar.
 */
export function laComandaImprime() {
  // Si todavía no llegó la configuración se supone que sí: es lo normal, y
  // equivocarse hacia «sí imprime» sólo hace que el botón diga de más.
  return datos.configuracion?.comanda !== false;
}
