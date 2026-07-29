/**
 * SERVIDOR · RUTAS DEL ALMACÉN
 * ─────────────────────────────────────────────────────────────────────────────
 * Lo que hay, lo que llegó, lo que se perdió y lo que hay que comprar.
 *
 * Quién puede qué:
 *  · ver existencias y la lista de compras → caja (es quien está de noche y
 *    necesita saber si aguanta hasta mañana)
 *  · anotar merma → caja (si hay que pedir permiso, no se anota nunca)
 *  · meter compras y hacer el conteo → administrador
 *  · decir qué se controla → administrador
 */

import {
  existencias, queComprar, registrarCompra, registrarMerma, registrarConteo,
  movimientosDe, vendidoHoy, configurarProducto, configuracionDeAlmacen,
  MOTIVOS_MERMA,
} from '../../datos/repos/almacen.js';
import { escribirAjuste, leerAjuste } from '../../datos/repos/ajustes.js';
import { exigir } from '../auth.js';
import { conFolio } from '../idempotencia.js';
import { avisarATodos } from '../tiempo-real.js';

function alto(mensaje, codigo = 400) {
  const e = new Error(mensaje);
  e.statusCode = codigo;
  return e;
}

export function registrarRutasAlmacen(app) {

  /** La foto del almacén: qué hay y para cuántos días alcanza. */
  app.get('/api/almacen', async (peticion) => {
    exigir(peticion, 'corte.ver');
    const dias = peticion.query.dias ? Number(peticion.query.dias) : null;

    return {
      ok: true,
      diasACubrir: dias ?? Number(leerAjuste('almacen.dias_a_cubrir', '7')),
      existencias: existencias({ diasACubrir: dias }),
      motivosDeMerma: MOTIVOS_MERMA,
    };
  });

  /** Qué comprar y cuánto, para llegar cubierto. */
  app.get('/api/almacen/compras', async (peticion) => {
    exigir(peticion, 'corte.ver');
    const dias = peticion.query.dias ? Number(peticion.query.dias) : null;

    if (dias !== null && (!Number.isInteger(dias) || dias < 1 || dias > 60)) {
      throw alto('Los días a cubrir van de 1 a 60.');
    }

    return { ok: true, ...queComprar({ diasACubrir: dias }) };
  });

  /** Cuántos días quiere estar cubierto. Compra 1 o 2 veces por semana. */
  app.put('/api/almacen/dias', async (peticion) => {
    exigir(peticion, 'ajustes.cambiar');
    const dias = Number(peticion.body?.dias);

    if (!Number.isInteger(dias) || dias < 1 || dias > 60) {
      throw alto('Los días a cubrir van de 1 a 60.');
    }

    escribirAjuste('almacen.dias_a_cubrir', dias);
    return { ok: true, diasACubrir: dias };
  });

  /** LLEGÓ EL PEDIDO. Se captura en envases, que es como llega. */
  app.post('/api/almacen/compras', async (peticion) => {
    const usuario = exigir(peticion, 'ajustes.cambiar');
    const { compras } = peticion.body ?? {};

    if (!Array.isArray(compras) || compras.length === 0) {
      throw alto('No anotaste ninguna cantidad.');
    }

    const guardadas = conFolio(peticion, '/api/almacen/compras', () =>
      registrarCompra({ compras, usuario }));

    avisarATodos('almacen.cambio', {});
    return { ok: true, guardadas, existencias: existencias() };
  });

  /** MERMA: se cayó, se sirvió mal, se echó a perder. */
  app.post('/api/almacen/merma', async (peticion) => {
    const usuario = exigir(peticion, 'impresora.operar');   // caja y administrador
    const { productoId, porciones, motivo } = peticion.body ?? {};

    const r = conFolio(peticion, '/api/almacen/merma', () =>
      registrarMerma({ productoId: Number(productoId), porciones, motivo, usuario }));

    avisarATodos('almacen.cambio', {});
    return { ok: true, ...r, existencias: existencias() };
  });

  /** CONTEO FÍSICO: se cuenta de verdad y el sistema ajusta. */
  app.post('/api/almacen/conteo', async (peticion) => {
    const usuario = exigir(peticion, 'ajustes.cambiar');
    const { conteos } = peticion.body ?? {};

    if (!Array.isArray(conteos) || conteos.length === 0) {
      throw alto('No contaste ningún producto.');
    }

    const resultado = conFolio(peticion, '/api/almacen/conteo', () =>
      registrarConteo({ conteos, usuario }));

    avisarATodos('almacen.cambio', {});
    return { ok: true, resultado, existencias: existencias() };
  });

  /** «¿Y por qué hay 38?» — los movimientos, uno por uno. */
  app.get('/api/almacen/productos/:id/movimientos', async (peticion) => {
    exigir(peticion, 'corte.ver');
    return { ok: true, movimientos: movimientosDe(Number(peticion.params.id), 60) };
  });

  /** Lo que se vendió hoy, con cantidades. */
  app.get('/api/almacen/vendido', async (peticion) => {
    exigir(peticion, 'corte.ver');
    return { ok: true, vendido: vendidoHoy(peticion.query.fecha ?? null) };
  });

  /* ── Configurar qué se controla ──────────────────────────────────────── */

  app.get('/api/almacen/configuracion', async (peticion) => {
    exigir(peticion, 'ajustes.cambiar');
    return { ok: true, productos: configuracionDeAlmacen() };
  });

  app.put('/api/almacen/configuracion/:id', async (peticion) => {
    exigir(peticion, 'ajustes.cambiar');
    const { controla, porcionesPorEnvase, envase, unidad, gastaDe } = peticion.body ?? {};

    configurarProducto({
      id: Number(peticion.params.id),
      controla, porcionesPorEnvase, envase, unidad,
      gastaDe: gastaDe === undefined ? undefined : (gastaDe ? Number(gastaDe) : null),
    });

    avisarATodos('almacen.cambio', {});
    return { ok: true, productos: configuracionDeAlmacen() };
  });
}
