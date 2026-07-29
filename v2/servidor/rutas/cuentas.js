/**
 * SERVIDOR · RUTAS DE CUENTAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Lo que hace un mesero toda la noche: abrir mesas, anotar, quitar lo que se
 * equivocó y mandar la comanda.
 *
 * La tablet manda «producto 37 a la cuenta 4». NO manda el precio. El precio
 * lo busca el servidor en la base. Una tablet con el menú viejo en pantalla,
 * o alguien jugando con la dirección del navegador, no puede cambiar lo que
 * cuesta una cerveza.
 */

import {
  cuentasAbiertas, buscarCuenta, abrirCuenta, anotarLinea, quitarLinea,
  marcarComandado, cancelarCuenta, marcarCuentaImpresa,
} from '../../datos/repos/cuentas.js';
import { exigir } from '../auth.js';
import { conFolio } from '../idempotencia.js';
import { avisarATodos } from '../tiempo-real.js';
import { imprimirComanda, imprimirCuenta } from '../../impresion/index.js';

function alto(mensaje, codigo = 400) {
  const e = new Error(mensaje);
  e.statusCode = codigo;
  return e;
}

/**
 * Bloqueo optimista.
 *
 * Si la tablet trae la versión que ella tenía en pantalla y la cuenta ya
 * cambió (otro mesero anotó algo), no se ejecuta a ciegas: se le contesta
 * "esto cambió, mira lo nuevo" y la pantalla se actualiza sola.
 *
 * Sólo se exige en lo que puede pisar el trabajo de otro (quitar, cancelar).
 * Anotar es seguro: dos meseros anotando suman, no se pisan.
 */
function revisarVersion(cuenta, versionQueTraia) {
  if (versionQueTraia === undefined || versionQueTraia === null) return;
  if (Number(versionQueTraia) === cuenta.version) return;

  const e = new Error('Esta cuenta cambió mientras la tenías abierta. Revísala y vuelve a intentar.');
  e.statusCode = 409;
  e.cuenta = cuenta;
  throw e;
}

/** Avisa a todas las pantallas que esta cuenta (y la lista de mesas) cambió. */
function avisarCambio(cuenta) {
  avisarATodos('cuenta.cambio', { cuentaId: cuenta.id, version: cuenta.version });
}

export function registrarRutasCuentas(app) {

  /** Las mesas abiertas ahora mismo. */
  app.get('/api/cuentas', async (peticion) => {
    exigir(peticion, 'cuenta.ver');
    return { ok: true, cuentas: cuentasAbiertas() };
  });

  /** Una cuenta en particular. */
  app.get('/api/cuentas/:id', async (peticion) => {
    exigir(peticion, 'cuenta.ver');
    const cuenta = buscarCuenta(Number(peticion.params.id));
    if (!cuenta) throw alto('Esa cuenta no existe.', 404);
    return { ok: true, cuenta };
  });

  /** Abrir una mesa. */
  app.post('/api/cuentas', async (peticion) => {
    const usuario = exigir(peticion, 'cuenta.abrir');
    const { nombre } = peticion.body ?? {};

    const r = conFolio(peticion, '/api/cuentas', () => abrirCuenta({ nombre, usuario }));

    if (!r.yaEstaba) avisarATodos('cuentas.cambio', { abrio: r.cuenta.id });
    return { ok: true, ...r };
  });

  /** Anotar un producto. */
  app.post('/api/cuentas/:id/lineas', async (peticion) => {
    const usuario = exigir(peticion, 'cuenta.anotar');
    const cuentaId = Number(peticion.params.id);
    const { productoId, detalle = '', cant = 1 } = peticion.body ?? {};

    if (!productoId) throw alto('Falta decir qué producto se anota.');

    const cuenta = conFolio(peticion, '/api/cuentas/:id/lineas', () =>
      anotarLinea({ cuentaId, productoId, detalle, cant, usuario }));

    avisarCambio(cuenta);
    return { ok: true, cuenta };
  });

  /** Quitar un renglón (o parte de su cantidad). */
  app.delete('/api/cuentas/:id/lineas/:lineaId', async (peticion) => {
    const usuario = exigir(peticion, 'cuenta.quitar');
    const cuentaId = Number(peticion.params.id);
    const lineaId  = Number(peticion.params.lineaId);
    const { cant = null, motivo = null, version } = peticion.body ?? {};

    const actual = buscarCuenta(cuentaId);
    if (!actual) throw alto('Esa cuenta no existe.', 404);
    revisarVersion(actual, version);

    const linea = actual.items.find((l) => l.id === lineaId);
    if (!linea) throw alto('Ese renglón ya no está en la cuenta.', 404);

    // Lo que ya salió a barra/cocina se está preparando. Si el mesero lo
    // pudiera borrar solo, la barra haría una bebida que nadie va a pagar y
    // nadie se enteraría. Que lo quite la caja.
    if (usuario.rol === 'mesero' && linea.comandadaCant > 0) {
      throw alto(
        `«${linea.nombre}» ya salió a barra o cocina. Pídele a la caja que lo quite.`,
        403
      );
    }

    const cuenta = conFolio(peticion, '/api/cuentas/:id/lineas/:lineaId', () =>
      quitarLinea({ cuentaId, lineaId, cant, motivo, usuario }));

    avisarCambio(cuenta);
    return { ok: true, cuenta };
  });

  /** Mandar a barra/cocina lo que esté pendiente. */
  app.post('/api/cuentas/:id/comanda', async (peticion) => {
    const usuario = exigir(peticion, 'cuenta.comandar');
    const cuentaId = Number(peticion.params.id);

    const r = conFolio(peticion, '/api/cuentas/:id/comanda', () =>
      marcarComandado({ cuentaId, usuario }));

    avisarCambio(r.cuenta);

    // El papel sale a barra/cocina. Va DESPUÉS de haberlo guardado y no se
    // espera a que termine: si la impresora está apagada, la comanda se
    // queda en la cola y sale sola cuando vuelva, pero el mesero no se queda
    // parado mirando la tablet.
    const impresion = imprimirComanda({
      cuenta: r.cuenta, salieron: r.salieron, mesero: usuario.nombre,
    });

    return { ok: true, ...r, impresion };
  });

  /** El cliente pidió su cuenta (se imprime, todavía no paga). */
  app.post('/api/cuentas/:id/imprimir', async (peticion) => {
    const usuario = exigir(peticion, 'cuenta.imprimir');
    const cuentaId = Number(peticion.params.id);

    const cuenta = conFolio(peticion, '/api/cuentas/:id/imprimir', () =>
      marcarCuentaImpresa({ cuentaId, usuario }));

    avisarCambio(cuenta);
    const impresion = imprimirCuenta({ cuenta });

    return { ok: true, cuenta, impresion };
  });

  /** Cancelar la cuenta. Sólo caja o administrador, y siempre con motivo. */
  app.post('/api/cuentas/:id/cancelar', async (peticion) => {
    const usuario = exigir(peticion, 'cuenta.cancelar');
    const cuentaId = Number(peticion.params.id);
    const { motivo, seConsumio = false, version } = peticion.body ?? {};

    const actual = buscarCuenta(cuentaId);
    if (!actual) throw alto('Esa cuenta no existe.', 404);
    revisarVersion(actual, version);

    const cuenta = conFolio(peticion, '/api/cuentas/:id/cancelar', () =>
      cancelarCuenta({ cuentaId, motivo, seConsumio: !!seConsumio, usuario }));

    avisarCambio(cuenta);
    avisarATodos('cuentas.cambio', { cerro: cuentaId });
    return { ok: true, cuenta };
  });
}
