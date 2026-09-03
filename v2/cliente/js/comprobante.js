/**
 * CLIENTE · EL COMPROBANTE QUE PIDE EL CLIENTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Volver a sacar en papel una cuenta que YA se cobró.
 *
 * Existe porque el comprobante del cobro se puede dejar apagado: casi nadie
 * se lleva el ticket y ese rollo cuesta dinero. Pero el que sí lo pide lo
 * tiene que tener en el momento, sin buscar nada. De ahí que este botón
 * aparezca en los dos lugares donde se pide de verdad:
 *
 *   · en la ventana de «cuenta cerrada», que es donde pasa casi siempre
 *     —el cliente lo pide con el cambio en la mano—;
 *   · en la lista de tickets del día (Corte → Ver un día), para el que
 *     regresa al rato, o cuando el papel salió mordido.
 *
 * El papel sale marcado COPIA. Eso no es un adorno: dos tickets con el mismo
 * folio sueltos por el bar son un agujero en la caja el día que se cuadre
 * a mano.
 */

import { api } from './api.js';
import { avisar } from './ui.js';

/**
 * Manda el comprobante de un ticket ya cobrado.
 *
 * Si se le pasa una ventanita abierta, contesta DENTRO de ella: los avisos
 * de abajo quedan tapados por la ventana, y quien toca el botón se quedaría
 * sin saber si salió o no.
 */
export async function pedirComprobante(folio, ventanaAbierta = null) {
  const donde = ventanaAbierta?.querySelector('#estado-comprobante') ?? null;
  const contestar = (mensaje, esError) => {
    if (donde) donde.textContent = mensaje;
    else avisar(mensaje, esError);
  };

  contestar('Mandando el comprobante…', false);

  try {
    const r = await api.reimprimir(folio);
    contestar(
      r.impreso
        ? `Comprobante del ticket ${folio} en camino a la impresora.`
        : `No salió: ${r.motivo ?? 'la impresora está apagada.'}`,
      !r.impreso,
    );
    return !!r.impreso;
  } catch (e) {
    contestar(e.message, true);
    return false;
  }
}
