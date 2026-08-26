/**
 * IMPRESIÓN · LA COLA
 * ─────────────────────────────────────────────────────────────────────────────
 * Los tickets NO se imprimen en el momento de cobrar. Se meten a una cola y
 * se van imprimiendo de uno en uno.
 *
 * La razón es concreta: si la impresora está apagada, sin papel, o la
 * desconectaron sin querer, el cobro NO se puede quedar esperando a que
 * alguien la arregle — el cliente ya pagó y hay gente formada. El ticket se
 * queda en la cola, la caja sigue funcionando, y en cuanto la impresora
 * vuelve, sale solo.
 *
 * Reintentos: cada 5, 15 y 30 segundos, y de ahí cada minuto. No se rinde
 * nunca por sí sola; el trabajo se queda ahí hasta que salga o hasta que
 * alguien lo cancele desde la pantalla.
 *
 * Un foquito en pantalla dice cómo va:
 *    verde = lista · ámbar = imprimiendo o esperando · rojo = revisa la impresora
 */

import { enviar } from './salidas.js';
import { aBytes } from './escpos.js';
import { aTexto } from './documento.js';

const ESPERAS_MS = [5_000, 15_000, 30_000];
const ESPERA_LARGA_MS = 60_000;

let siguienteId = 1;
const cola = [];

let trabajando = false;
let temporizador = null;
let alCambiar = null;          // para avisarle a las pantallas
let leerConfiguracion = null;  // de dónde salen los datos de la impresora

/** Cómo está la impresión ahora mismo. */
const estado = {
  luz: 'verde',                // 'verde' | 'ambar' | 'rojo'
  mensaje: 'Lista',
  pendientes: 0,
  ultimoError: null,
  ultimoExito: null,
  imprimiendo: null,
};

export function estadoImpresion() {
  return { ...estado, pendientes: cola.length, cola: cola.map(resumir) };
}

const resumir = (t) => ({
  id: t.id,
  nombre: t.nombre,
  descripcion: t.descripcion,
  intentos: t.intentos,
  error: t.ultimoError,
  creado: t.creado,
});

/** La app registra aquí qué hacer cuando cambia el estado (avisar por WebSocket). */
export function alCambiarEstado(fn) {
  alCambiar = fn;
}

/**
 * De dónde se leen los datos de la impresora al momento de enviar.
 *
 * A propósito NO se usa la configuración que había cuando se encoló: si un
 * ticket se quedó atorado porque la IP estaba mal escrita, corregirla en la
 * pantalla tiene que hacer que ese ticket salga. Con la configuración vieja
 * seguiría intentando contra la impresora equivocada para siempre.
 *
 * (El FORMATO del papel sí queda congelado: los bytes se calculan al encolar,
 * así un ticket cobrado en 80 mm no cambia si después se pasa a 58 mm.)
 */
export function configurarSalida(fn) {
  leerConfiguracion = fn;
}

function marcar(luz, mensaje, extra = {}) {
  estado.luz = luz;
  estado.mensaje = mensaje;
  Object.assign(estado, extra);
  estado.pendientes = cola.length;
  try { alCambiar?.(estadoImpresion()); } catch { /* que un aviso no tumbe la cola */ }
}

/* ── Meter un trabajo ──────────────────────────────────────────────────── */

/**
 * Encola un documento.
 *
 * Los bytes se calculan AQUÍ, no al imprimir. Así, si alguien cambia el
 * ancho del papel mientras un ticket espera en la cola, ese ticket sale con
 * el formato que tenía cuando se cobró, que es el correcto.
 */
export function encolar({ documento, nombre, descripcion, configuracion, abrirCajon = false }) {
  const anchoMm = Number(configuracion?.anchoMm ?? 80);

  const trabajo = {
    id: siguienteId++,
    nombre,
    descripcion: descripcion ?? nombre,
    bytes: aBytes(documento, { anchoMm, abrirCajon }),
    vistaTexto: aTexto(documento, { anchoMm }),
    intentos: 0,
    ultimoError: null,
    creado: new Date().toISOString(),
  };

  cola.push(trabajo);
  marcar('ambar', `${cola.length} en cola`);

  arrancar();
  return { id: trabajo.id, enCola: cola.length };
}

/** Quita un trabajo de la cola (la impresora se quedó sin papel y ya no sirve). */
export function cancelar(id) {
  const i = cola.findIndex((t) => t.id === Number(id));
  if (i < 0) return false;
  cola.splice(i, 1);
  marcar(cola.length ? 'ambar' : 'verde', cola.length ? `${cola.length} en cola` : 'Lista');
  return true;
}

/** Tira toda la cola. Se usa cuando la impresora se cambió de sitio. */
export function vaciar() {
  const cuantos = cola.length;
  cola.length = 0;
  clearTimeout(temporizador);
  marcar('verde', 'Lista', { ultimoError: null });
  return cuantos;
}

/** Vuelve a intentar ya, sin esperar. Es el botón «reintentar» de la pantalla. */
export function reintentarYa() {
  clearTimeout(temporizador);
  arrancar();
  return estadoImpresion();
}

/* ── El motor ──────────────────────────────────────────────────────────── */

function arrancar() {
  if (trabajando || cola.length === 0) return;
  trabajando = true;
  procesar();
}

async function procesar() {
  while (cola.length > 0) {
    const trabajo = cola[0];

    marcar('ambar', `Imprimiendo ${trabajo.descripcion}`, { imprimiendo: trabajo.id });

    try {
      const r = await enviar({
        bytes: trabajo.bytes,
        vistaTexto: trabajo.vistaTexto,
        nombre: trabajo.nombre,
        // Se lee AHORA, no cuando se encoló: si se corrigió la impresora,
        // este intento ya sale por la buena.
        configuracion: leerConfiguracion ? leerConfiguracion() : { modo: 'simulada' },
      });

      cola.shift();
      marcar(
        cola.length ? 'ambar' : 'verde',
        cola.length ? `${cola.length} en cola` : 'Lista',
        {
          ultimoError: null,
          imprimiendo: null,
          ultimoExito: { descripcion: trabajo.descripcion, destino: r?.destino, momento: new Date().toISOString() },
        },
      );
    } catch (e) {
      trabajo.intentos++;
      trabajo.ultimoError = e.message;

      const espera = ESPERAS_MS[trabajo.intentos - 1] ?? ESPERA_LARGA_MS;

      marcar('rojo', e.message, {
        imprimiendo: null,
        ultimoError: {
          mensaje: e.message,
          descripcion: trabajo.descripcion,
          intentos: trabajo.intentos,
          siguienteIntentoEn: Math.round(espera / 1000),
        },
      });

      // Se espera y se vuelve a intentar con el MISMO trabajo, sin pasar al
      // siguiente: si la impresora está caída, los de atrás tampoco van a
      // salir, y así los tickets conservan su orden.
      trabajando = false;
      temporizador = setTimeout(arrancar, espera);
      return;
    }
  }

  trabajando = false;
}
