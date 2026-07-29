/**
 * SERVIDOR · RUTAS DEL COBRO
 * ─────────────────────────────────────────────────────────────────────────────
 * Todo lo que toca dinero: cortesías, descuentos, propinas y el cobro mismo.
 *
 * Nada de esto lo puede hacer un mesero. No es desconfianza: es que cuando
 * falte dinero en la caja tiene que haber una lista corta de quién pudo
 * haberlo movido.
 *
 * La pantalla NUNCA manda el total. Manda "cobra $200 en efectivo, me dieron
 * $500" o "cobra estos tres renglones", y el servidor calcula el resto con
 * `nucleo/cuenta.js`. Una tablet con un error no puede descuadrar una caja.
 */

import { buscarCuenta, ponerCortesia, ponerDescuento, ponerPropina } from '../../datos/repos/cuentas.js';
import { registrarCobro, anularUltimoPago, buscarTicket } from '../../datos/repos/cobro.js';
import { dividirRestante } from '../../nucleo/cuenta.js';
import { exigir } from '../auth.js';
import { conFolio } from '../idempotencia.js';
import { avisarATodos } from '../tiempo-real.js';

function alto(mensaje, codigo = 400) {
  const e = new Error(mensaje);
  e.statusCode = codigo;
  return e;
}

/** Igual que en las rutas de cuentas: no pisar lo que otro acaba de hacer. */
function revisarVersion(cuenta, versionQueTraia) {
  if (versionQueTraia === undefined || versionQueTraia === null) return;
  if (Number(versionQueTraia) === cuenta.version) return;

  const e = new Error('Esta cuenta cambió mientras la tenías abierta. Revísala y vuelve a intentar.');
  e.statusCode = 409;
  e.cuenta = cuenta;
  throw e;
}

function traerCuenta(id, version) {
  const cuenta = buscarCuenta(id);
  if (!cuenta) throw alto('Esa cuenta no existe.', 404);
  revisarVersion(cuenta, version);
  return cuenta;
}

export function registrarRutasCobro(app) {

  /* ── Cortesía ────────────────────────────────────────────────────────── */

  app.post('/api/cuentas/:id/cortesia', async (peticion) => {
    const usuario = exigir(peticion, 'cuenta.cortesia');
    const cuentaId = Number(peticion.params.id);
    const { lineaId, esCortesia = true, motivo = null, version } = peticion.body ?? {};

    traerCuenta(cuentaId, version);
    if (!lineaId) throw alto('Falta decir qué renglón se regala.');

    const cuenta = conFolio(peticion, '/api/cuentas/:id/cortesia', () =>
      ponerCortesia({ cuentaId, lineaId: Number(lineaId), esCortesia, motivo, usuario }));

    avisarATodos('cuenta.cambio', { cuentaId, version: cuenta.version });
    return { ok: true, cuenta };
  });

  /* ── Descuento ───────────────────────────────────────────────────────── */

  app.post('/api/cuentas/:id/descuento', async (peticion) => {
    const usuario = exigir(peticion, 'cuenta.descuento');
    const cuentaId = Number(peticion.params.id);
    const { tipo, valor, motivo = null, version } = peticion.body ?? {};

    traerCuenta(cuentaId, version);

    const cuenta = conFolio(peticion, '/api/cuentas/:id/descuento', () =>
      ponerDescuento({ cuentaId, tipo, valor, motivo, usuario }));

    avisarATodos('cuenta.cambio', { cuentaId, version: cuenta.version });
    return { ok: true, cuenta };
  });

  /* ── Propina ─────────────────────────────────────────────────────────── */

  app.post('/api/cuentas/:id/propina', async (peticion) => {
    const usuario = exigir(peticion, 'cuenta.propina');
    const cuentaId = Number(peticion.params.id);
    const { tipo, valor, version } = peticion.body ?? {};

    traerCuenta(cuentaId, version);

    const cuenta = conFolio(peticion, '/api/cuentas/:id/propina', () =>
      ponerPropina({ cuentaId, tipo, valor, usuario }));

    avisarATodos('cuenta.cambio', { cuentaId, version: cuenta.version });
    return { ok: true, cuenta };
  });

  /* ── Dividir entre personas ──────────────────────────────────────────── */

  /**
   * Cuánto le toca a cada quien de lo que FALTA por pagar.
   * Lo calcula el servidor para que los centavos sobrantes se repartan
   * siempre igual: $100 entre 3 son 33.34, 33.33 y 33.33, nunca 33.33 tres
   * veces (eso dejaría un centavo sin cobrar en cada cuenta partida).
   */
  app.get('/api/cuentas/:id/dividir', async (peticion) => {
    exigir(peticion, 'cobro.registrar');
    const cuenta = buscarCuenta(Number(peticion.params.id));
    if (!cuenta) throw alto('Esa cuenta no existe.', 404);

    const personas = Number(peticion.query.personas ?? 2);
    if (!Number.isInteger(personas) || personas < 2 || personas > 50) {
      throw alto('Entre cuántas personas: de 2 a 50.');
    }

    return { ok: true, personas, partes: dividirRestante(cuenta, personas) };
  });

  /* ── El cobro ────────────────────────────────────────────────────────── */

  app.post('/api/cuentas/:id/cobrar', async (peticion) => {
    const usuario = exigir(peticion, 'cobro.registrar');
    const cuentaId = Number(peticion.params.id);
    const {
      metodo, monto = null, recibido = null,
      lineas = null, referencia = null, version,
    } = peticion.body ?? {};

    traerCuenta(cuentaId, version);

    const r = conFolio(peticion, '/api/cuentas/:id/cobrar', () =>
      registrarCobro({ cuentaId, metodo, monto, recibido, lineas, referencia, usuario }));

    avisarATodos('cuenta.cambio', { cuentaId, version: r.cuenta.version });
    if (r.ticket) avisarATodos('cuentas.cambio', { cerro: cuentaId });

    return { ok: true, ...r };
  });

  /** Deshacer el último pago (se tecleó mal, o se cobró en la mesa equivocada). */
  app.post('/api/cuentas/:id/anular-pago', async (peticion) => {
    const usuario = exigir(peticion, 'cobro.registrar');
    const cuentaId = Number(peticion.params.id);
    const { motivo, version } = peticion.body ?? {};

    traerCuenta(cuentaId, version);

    const cuenta = conFolio(peticion, '/api/cuentas/:id/anular-pago', () =>
      anularUltimoPago({ cuentaId, motivo, usuario }));

    avisarATodos('cuenta.cambio', { cuentaId, version: cuenta.version });
    return { ok: true, cuenta };
  });

  /* ── Tickets ─────────────────────────────────────────────────────────── */

  app.get('/api/tickets/:folio', async (peticion) => {
    exigir(peticion, 'cuenta.ver');
    const ticket = buscarTicket(Number(peticion.params.folio));
    if (!ticket) throw alto('Ese ticket no existe.', 404);
    return { ok: true, ticket };
  });
}
