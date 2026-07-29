/**
 * IMPRESIÓN · LA PUERTA DE ENTRADA
 * ─────────────────────────────────────────────────────────────────────────────
 * Lo único que el resto de RESTA necesita saber de la impresora.
 *
 * El servidor no arma tickets ni habla con puertos: llama a
 * `imprimirComanda(...)` y sigue con lo suyo. Si la impresora está apagada,
 * el ticket se queda en la cola y sale solo cuando vuelva — pero el cobro
 * ya quedó registrado y la caja nunca se detiene por culpa del papel.
 */

import { leerAjuste, escribirAjuste } from '../datos/repos/ajustes.js';
import {
  comanda, cuenta as plantillaCuenta, ticket as plantillaTicket,
  corte as plantillaCorte, prueba,
} from './plantillas.js';
import { encolar, configurarSalida } from './cola.js';
import { MODOS } from './salidas.js';

export { estadoImpresion, alCambiarEstado, cancelar, vaciar, reintentarYa } from './cola.js';
export { MODOS, impresorasDeWindows } from './salidas.js';

/** Cómo está configurada la impresora ahora mismo. */
export function configuracion() {
  return {
    modo:      leerAjuste('impresora.modo', 'simulada'),
    host:      leerAjuste('impresora.host', ''),
    puerto:    Number(leerAjuste('impresora.puerto', '9100')),
    impresora: leerAjuste('impresora.nombre', 'POSPrinter POS80'),
    com:       leerAjuste('impresora.com', 'COM3'),
    velocidad: Number(leerAjuste('impresora.velocidad', '9600')),
    anchoMm:   Number(leerAjuste('ticket.ancho_mm', '80')),
    negocio:   leerAjuste('negocio.nombre', 'RESTA'),
    pie:       leerAjuste('ticket.pie', '¡Gracias por su visita!'),
    // Si está apagada, RESTA no imprime nada. Sirve para trabajar sin papel
    // un rato sin que se llene la cola de tickets que nadie va a ver.
    activa:    leerAjuste('impresora.activa', '1') === '1',
  };
}

/**
 * Guarda la configuración. Sólo se aceptan valores que tengan sentido:
 * un modo inventado o un ancho raro dejarían la impresora muda sin decir
 * por qué.
 */
export function guardarConfiguracion(nueva = {}) {
  if (nueva.modo !== undefined) {
    if (!MODOS.includes(nueva.modo)) {
      throw new Error(`No conozco esa forma de imprimir. Elige una de: ${MODOS.join(', ')}.`);
    }
    escribirAjuste('impresora.modo', nueva.modo);
  }

  if (nueva.anchoMm !== undefined) {
    const ancho = Number(nueva.anchoMm);
    if (ancho !== 58 && ancho !== 80) {
      throw new Error('El papel es de 58 mm o de 80 mm.');
    }
    escribirAjuste('ticket.ancho_mm', ancho);
  }

  if (nueva.host !== undefined)      escribirAjuste('impresora.host', String(nueva.host).trim());
  if (nueva.puerto !== undefined)    escribirAjuste('impresora.puerto', Number(nueva.puerto) || 9100);
  if (nueva.impresora !== undefined) escribirAjuste('impresora.nombre', String(nueva.impresora).trim());
  if (nueva.com !== undefined)       escribirAjuste('impresora.com', String(nueva.com).trim().toUpperCase());
  if (nueva.velocidad !== undefined) escribirAjuste('impresora.velocidad', Number(nueva.velocidad) || 9600);
  if (nueva.pie !== undefined)       escribirAjuste('ticket.pie', String(nueva.pie));
  if (nueva.activa !== undefined)    escribirAjuste('impresora.activa', nueva.activa ? '1' : '0');

  return configuracion();
}

// La cola pregunta por la configuración cada vez que va a enviar, no cuando
// se encoló. Así, corregir la IP de la impresora destraba lo que estaba
// esperando en vez de dejarlo intentando contra la impresora equivocada.
configurarSalida(configuracion);

/** Encola un documento con la configuración de este momento. */
function mandar(documento, nombre, descripcion, { abrirCajon = false } = {}) {
  const config = configuracion();

  if (!config.activa) {
    return { impreso: false, motivo: 'La impresora está apagada en los ajustes.' };
  }

  const r = encolar({ documento, nombre, descripcion, configuracion: config, abrirCajon });
  return { impreso: true, ...r };
}

/* ── Lo que se imprime ─────────────────────────────────────────────────── */

/** A barra o cocina: lo que se acaba de mandar a preparar. */
export function imprimirComanda({ cuenta, salieron, mesero }) {
  const config = configuracion();
  return mandar(
    comanda({ negocio: config.negocio, cuenta, salieron, mesero }),
    'comanda',
    `comanda de ${cuenta.nombre}`,
  );
}

/** La cuenta que pide el cliente antes de pagar. */
export function imprimirCuenta({ cuenta }) {
  const config = configuracion();
  return mandar(
    plantillaCuenta({ negocio: config.negocio, cuenta, pie: config.pie }),
    'cuenta',
    `cuenta de ${cuenta.nombre}`,
  );
}

/**
 * El comprobante de que ya pagó.
 * Si hubo efectivo, se abre el cajón de dinero al imprimirlo.
 */
export function imprimirTicket({ ticket, cuenta }) {
  const config = configuracion();
  const huboEfectivo = (ticket.pagos ?? []).some((p) => p.metodo === 'efectivo');

  return mandar(
    plantillaTicket({ negocio: config.negocio, ticket, cuenta, pie: config.pie }),
    'ticket',
    `ticket ${ticket.folio}`,
    { abrirCajon: huboEfectivo },
  );
}

/** El corte de caja, que se guarda al cerrar el turno. */
export function imprimirCorte({ corte }) {
  const config = configuracion();
  return mandar(
    plantillaCorte({ negocio: config.negocio, corte }),
    'corte',
    `corte del turno ${corte.turno.id}`,
  );
}

/** La tira de calibración, para probar la impresora sin cobrarle a nadie. */
export function imprimirPrueba() {
  const config = configuracion();
  return mandar(
    prueba({ negocio: config.negocio, anchoMm: config.anchoMm }),
    'prueba',
    'prueba de impresión',
  );
}
