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
import { encolar, configurarSalida, alCorregirPuerto } from './cola.js';
import { MODOS } from './salidas.js';
import { puntosDelLogo } from './escpos.js';

export { estadoImpresion, alCambiarEstado, cancelar, vaciar, reintentarYa } from './cola.js';
export { MODOS, impresorasDeWindows } from './salidas.js';

/** Cómo está configurada la impresora ahora mismo. */
export function configuracion() {
  return {
    modo:      leerAjuste('impresora.modo', 'simulada'),
    host:      leerAjuste('impresora.host', ''),
    puerto:    Number(leerAjuste('impresora.puerto', '9100')),
    impresora: leerAjuste('impresora.nombre', 'POS-80'),
    com:       leerAjuste('impresora.com', 'COM4'),
    velocidad: Number(leerAjuste('impresora.velocidad', '9600')),
    anchoMm:   Number(leerAjuste('ticket.ancho_mm', '80')),
    negocio:   leerAjuste('negocio.nombre', 'RESTA'),
    pie:       leerAjuste('ticket.pie', '¡Gracias por su visita!'),
    // Si está apagada, RESTA no imprime nada. Sirve para trabajar sin papel
    // un rato sin que se llene la cola de tickets que nadie va a ver.
    activa:    leerAjuste('impresora.activa', '1') === '1',
    // Y este es el interruptor de SÓLO la comanda de barra/cocina. Con la
    // barra a dos metros de la caja, ese papel es basura: el mesero le canta
    // el pedido al cantinero y ya. El ticket del cobro, la cuenta que pide
    // el cliente y el corte siguen saliendo normales.
    comanda:   leerAjuste('impresora.comanda', '1') === '1',
    // Y este otro es el del COMPROBANTE DEL COBRO. Apagado, la cuenta se
    // cierra igual y su ticket queda guardado con su folio: lo único que no
    // pasa es que salga papel. Casi nadie se lleva el ticket, y ese rollo
    // cuesta dinero. Al que sí lo pida se le imprime con un botón —en la
    // misma ventana de «cuenta cerrada», o después desde la lista del día—
    // y ese papel sale marcado COPIA.
    ticket:    leerAjuste('impresora.ticket', '1') === '1',
    // Los puntos del logo, dibujados una vez por el navegador y guardados.
    // Si no hay, el ticket sale sin logo y ya.
    logoRaster: leerLogo(),
  };
}

/** El logo guardado, o null si todavía no se ha mandado desde la pantalla. */
function leerLogo() {
  const guardado = leerAjuste('ticket.logo_raster', '');
  if (!guardado) return null;
  try {
    const r = JSON.parse(guardado);
    return r?.bytes ? r : null;
  } catch {
    return null;      // si quedó mal guardado, mejor sin logo que con basura
  }
}

/** Guarda el logo ya convertido a puntos. Lo manda la pantalla una sola vez. */
export function guardarLogo(raster) {
  if (raster === null) {
    escribirAjuste('ticket.logo_raster', '');
    return { guardado: false };
  }

  const { bytes, anchoEnBytes, alto } = raster ?? {};
  if (!bytes || !Number.isInteger(anchoEnBytes) || !Number.isInteger(alto)) {
    throw new Error('Ese logo no llegó bien; vuelve a mandarlo desde la pantalla.');
  }
  if (alto > 600 || anchoEnBytes > 100) {
    throw new Error('Ese logo es demasiado grande para la impresora.');
  }

  // Se cuentan los puntos ANTES de guardar. Antes se aceptaba cualquier cosa
  // que trajera las tres piezas, y un logo mal formado se guardaba tan
  // campante: el fallo aparecía después, en la impresora, como un rectángulo
  // en blanco sin explicación. Vale más negarse aquí, con la pantalla
  // enfrente y el botón de volver a mandarlo a la mano.
  const puntos = puntosDelLogo(bytes);
  const esperados = anchoEnBytes * alto;
  if (puntos.length !== esperados) {
    throw new Error(
      `Ese logo llegó incompleto (${puntos.length} puntos en vez de ${esperados}). ` +
      'Vuelve a mandarlo desde la pantalla.',
    );
  }

  escribirAjuste('ticket.logo_raster', JSON.stringify({ bytes, anchoEnBytes, alto }));
  return { guardado: true, alto, anchoEnBytes, puntos: puntos.length };
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
  if (nueva.comanda !== undefined)   escribirAjuste('impresora.comanda', nueva.comanda ? '1' : '0');
  if (nueva.ticket !== undefined)    escribirAjuste('impresora.ticket', nueva.ticket ? '1' : '0');

  return configuracion();
}

// La cola pregunta por la configuración cada vez que va a enviar, no cuando
// se encoló. Así, corregir la IP de la impresora destraba lo que estaba
// esperando en vez de dejarlo intentando contra la impresora equivocada.
configurarSalida(configuracion);

// Si Windows le cambió el número de puerto a la impresora, se apunta el nuevo
// en cuanto sale el primer ticket. Así la pantalla de Configuración enseña la
// verdad y el siguiente ticket ya sale derecho, sin volver a buscar.
alCorregirPuerto((puerto) => escribirAjuste('impresora.com', puerto));

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

/**
 * A barra o cocina: lo que se acaba de mandar a preparar.
 *
 * Es lo único que se puede apagar por separado. El mesero sigue tocando
 * «Mandar a barra» y el sistema sigue marcando qué salió —así la caja sabe
 * qué ya se está preparando y qué no—; lo único que no pasa es que se gaste
 * papel. El ticket del cobro y la cuenta del cliente NO se ven afectados.
 */
export function imprimirComanda({ cuenta, salieron, mesero }) {
  const config = configuracion();

  if (!config.comanda) {
    return { impreso: false, motivo: 'La comanda está puesta en «sin papel».' };
  }

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
    plantillaCuenta({ negocio: config.negocio, cuenta, pie: config.pie, logoRaster: config.logoRaster }),
    'cuenta',
    `cuenta de ${cuenta.nombre}`,
  );
}

/**
 * El comprobante de que ya pagó.
 * Si hubo efectivo, se abre el cajón de dinero al imprimirlo.
 *
 * `copia` es para cuando el cliente lo pide después: ese papel sale marcado,
 * para que dos tickets con el mismo folio no se puedan contar dos veces al
 * cuadrar la caja. Y `forzar` es lo que hace que la copia salga AUNQUE el
 * comprobante esté apagado — que es justo el caso para el que se hizo: no se
 * imprime de rutina, se imprime al que lo pide.
 */
export function imprimirTicket({ ticket, cuenta, copia = false, forzar = false }) {
  const config = configuracion();
  const huboEfectivo = (ticket.pagos ?? []).some((p) => p.metodo === 'efectivo');

  if (!config.ticket && !forzar) {
    // El papel no sale, pero el cajón SÍ se tiene que abrir: quien cobró en
    // efectivo necesita el cajón para dar el cambio, y hasta hoy eso pasaba
    // de rebote, pegado al ticket. Es un pulso solo, sin papel: un documento
    // vacío no alimenta el rollo ni lo corta.
    if (huboEfectivo) mandar([], 'cajon', `cajón (ticket ${ticket.folio})`, { abrirCajon: true });

    return {
      impreso: false,
      cajon: huboEfectivo,
      motivo: 'El comprobante está en «sólo si lo piden».',
    };
  }

  return mandar(
    plantillaTicket({
      negocio: config.negocio, ticket, cuenta,
      pie: config.pie, logoRaster: config.logoRaster, copia,
    }),
    'ticket',
    copia ? `copia del ticket ${ticket.folio}` : `ticket ${ticket.folio}`,
    // Una copia NO abre el cajón: el cliente ya pagó y ya se le dio su
    // cambio. Abrirlo de nuevo es enseñarle el dinero a quien pase por ahí.
    { abrirCajon: huboEfectivo && !copia },
  );
}

/** El corte de caja, que se guarda al cerrar el turno. */
export function imprimirCorte({ corte }) {
  const config = configuracion();
  return mandar(
    plantillaCorte({ negocio: config.negocio, corte, logoRaster: config.logoRaster }),
    'corte',
    `corte del turno ${corte.turno.id}`,
  );
}

/** La tira de calibración, para probar la impresora sin cobrarle a nadie. */
export function imprimirPrueba() {
  const config = configuracion();
  return mandar(
    prueba({ negocio: config.negocio, anchoMm: config.anchoMm, logoRaster: config.logoRaster }),
    'prueba',
    'prueba de impresión',
  );
}
