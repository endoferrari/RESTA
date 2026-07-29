/**
 * SERVIDOR · RUTAS DE LA IMPRESORA
 * ─────────────────────────────────────────────────────────────────────────────
 * El foquito de estado, el botón de prueba y la configuración.
 *
 * El botón de prueba es más importante de lo que parece: es la única forma
 * de calibrar la impresora sin tener que cobrarle a un cliente de verdad. Si
 * los acentos salen en chino o el papel está mal configurado, se descubre
 * con la tira de prueba, no con una mesa esperando su ticket.
 */

import {
  estadoImpresion, configuracion, guardarConfiguracion, imprimirPrueba,
  imprimirTicket, cancelar, vaciar, reintentarYa, MODOS, impresorasDeWindows,
} from '../../impresion/index.js';
import { buscarTicket } from '../../datos/repos/cobro.js';
import { buscarCuenta } from '../../datos/repos/cuentas.js';
import { anotarEvento } from '../../datos/repos/eventos.js';
import { exigir } from '../auth.js';
import { esWindows } from '../../datos/rutas-datos.js';

function alto(mensaje, codigo = 400) {
  const e = new Error(mensaje);
  e.statusCode = codigo;
  return e;
}

export function registrarRutasImpresion(app) {

  /** Cómo va la impresora. Lo consulta el foquito de la pantalla. */
  app.get('/api/impresion', async (peticion) => {
    exigir(peticion, 'cuenta.ver');
    return {
      ok: true,
      estado: estadoImpresion(),
      configuracion: configuracion(),
      modos: MODOS,
      esWindows,
    };
  });

  /** Las impresoras instaladas en Windows, para elegir de una lista. */
  app.get('/api/impresion/impresoras', async (peticion) => {
    exigir(peticion, 'ajustes.cambiar');
    return { ok: true, impresoras: await impresorasDeWindows(), esWindows };
  });

  /** Cambiar cómo se imprime. */
  app.put('/api/impresion', async (peticion) => {
    const usuario = exigir(peticion, 'ajustes.cambiar');
    const config = guardarConfiguracion(peticion.body ?? {});

    anotarEvento({
      tipo: 'impresora.configurar', usuario,
      detalle: { modo: config.modo, anchoMm: config.anchoMm, activa: config.activa },
    });

    return { ok: true, configuracion: config, estado: estadoImpresion() };
  });

  /** La tira de calibración. */
  app.post('/api/impresion/prueba', async (peticion) => {
    const usuario = exigir(peticion, 'impresora.operar');
    const r = imprimirPrueba();
    anotarEvento({ tipo: 'impresora.prueba', usuario, detalle: r });
    return { ok: true, ...r, estado: estadoImpresion() };
  });

  /** Volver a intentar ya, sin esperar a que le toque su turno al reintento. */
  app.post('/api/impresion/reintentar', async (peticion) => {
    exigir(peticion, 'cuenta.ver');
    return { ok: true, estado: reintentarYa() };
  });

  /** Quitar un trabajo atorado. */
  app.delete('/api/impresion/cola/:id', async (peticion) => {
    const usuario = exigir(peticion, 'impresora.operar');
    const quitado = cancelar(Number(peticion.params.id));
    if (!quitado) throw alto('Ese trabajo ya no está en la cola.', 404);

    anotarEvento({ tipo: 'impresora.cancelar', usuario, detalle: { id: Number(peticion.params.id) } });
    return { ok: true, estado: estadoImpresion() };
  });

  /** Tirar toda la cola. */
  app.delete('/api/impresion/cola', async (peticion) => {
    const usuario = exigir(peticion, 'impresora.operar');
    const cuantos = vaciar();
    anotarEvento({ tipo: 'impresora.vaciar', usuario, detalle: { cuantos } });
    return { ok: true, cuantos, estado: estadoImpresion() };
  });

  /**
   * Reimprimir un ticket ya cobrado.
   * Pasa seguido: el cliente pide otra copia, o el papel salió mordido.
   */
  app.post('/api/tickets/:folio/reimprimir', async (peticion) => {
    const usuario = exigir(peticion, 'cuenta.imprimir');
    const folio = Number(peticion.params.folio);

    const ticket = buscarTicket(folio);
    if (!ticket) throw alto('Ese ticket no existe.', 404);

    const cuenta = buscarCuenta(ticket.cuentaId);
    const r = imprimirTicket({ ticket, cuenta });

    anotarEvento({
      tipo: 'ticket.reimprimir', referencia: ticket.cuentaId, usuario,
      detalle: { folio, anulado: ticket.anulado },
    });

    return { ok: true, ...r, estado: estadoImpresion() };
  });
}
