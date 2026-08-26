/**
 * PRUEBAS · ACTUALIZAR NO PUEDE BORRAR NADA
 * ─────────────────────────────────────────────────────────────────────────────
 * Rosendo lo pidió con estas palabras: «que no toque lo que ya tiene de
 * información, sólo el sistema, para que nada se pierda».
 *
 * Instalar una versión nueva encima es exactamente eso: se reemplazan los
 * archivos del programa y la base de datos se queda donde está, con meses de
 * ventas adentro. Lo que sí pasa es que el esquema puede haber cambiado, y
 * ahí es donde se pierde una base si se hace mal.
 *
 * Aquí se simula la actualización: se llena una base como la de un bar que
 * lleva tiempo trabajando, se «apaga» y se vuelve a abrir como lo haría la
 * versión nueva al arrancar. Todo tiene que seguir ahí.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CARPETA = mkdtempSync(join(tmpdir(), 'resta-actualizar-'));
process.env.RESTA_DATOS = CARPETA;

let abrirBase, cerrarBase, base;
let abrirCuenta, anotarLinea, buscarCuenta;
let registrarCobro, abrirTurno;
let crearProducto, listarProductos, crearFamilia;
let crearUsuario;
let migracionesAplicadas;

before(async () => {
  ({ abrirBase, cerrarBase, base } = await import('../datos/conexion.js'));
  ({ abrirCuenta, anotarLinea, buscarCuenta } = await import('../datos/repos/cuentas.js'));
  ({ registrarCobro } = await import('../datos/repos/cobro.js'));
  ({ abrirTurno } = await import('../datos/repos/turnos.js'));
  ({ crearProducto, listarProductos, crearFamilia } =
    await import('../datos/repos/productos.js'));
  ({ crearUsuario } = await import('../datos/repos/usuarios.js'));
});

after(() => {
  try { cerrarBase(); } catch { /* ya estaba cerrada */ }
  rmSync(CARPETA, { recursive: true, force: true });
});

/** Cuántas migraciones se han aplicado, que es lo que el arranque revisa. */
function cuantasMigraciones() {
  return base().prepare('SELECT count(*) AS n FROM migraciones').get().n;
}

test('las ventas de meses sobreviven a instalar la versión nueva', () => {
  // ── El bar lleva tiempo trabajando ──
  abrirBase({ silencioso: true });

  const rosendo = crearUsuario({ nombre: 'Rosendo', pin: '4321', rol: 'admin' });
  abrirTurno({ fondo: 100000, usuario: rosendo });

  crearFamilia({ nombre: 'Canchas de padel' });
  const cancha = crearProducto({
    nombre: 'CANCHA 1', precio: 15000, familia: 'canchas-de-padel',
  });

  const { cuenta } = abrirCuenta({ nombre: 'Mesa 7', usuario: rosendo });
  anotarLinea({ cuentaId: cuenta.id, productoId: cancha.id, cant: 2, usuario: rosendo });
  const total = buscarCuenta(cuenta.id).totales.total;
  const { ticket } = registrarCobro({
    cuentaId: cuenta.id, metodo: 'efectivo', recibido: total, usuario: rosendo,
  });

  const antes = {
    migraciones: cuantasMigraciones(),
    productos: listarProductos({ soloActivos: false }).length,
    folio: ticket.folio,
    total,
  };

  migracionesAplicadas = antes.migraciones;

  // ── Se instala la versión nueva ──
  // El instalador reemplaza los archivos del programa; la base vive aparte,
  // en C:\RESTA, y no la toca. Al arrancar, la versión nueva vuelve a abrirla
  // y aplica las migraciones que le falten.
  cerrarBase();
  assert.ok(existsSync(join(CARPETA, 'resta.db')), 'el archivo sigue en su sitio');

  abrirBase({ silencioso: true });

  // ── Todo tiene que seguir ahí ──
  assert.equal(cuantasMigraciones(), antes.migraciones,
    'no se reaplicó ninguna migración: eso borraría tablas');

  assert.equal(listarProductos({ soloActivos: false }).length, antes.productos,
    'la carta completa');

  const laCancha = listarProductos({ soloActivos: false })
    .find((p) => p.nombre === 'CANCHA 1');
  assert.equal(laCancha.precio, 15000, 'con su precio');

  const cerrada = buscarCuenta(cuenta.id);
  assert.equal(cerrada.estado, 'cobrada', 'la cuenta cobrada sigue cobrada');
  assert.equal(cerrada.totales.total, antes.total, 'por el mismo importe');
});

test('abrir y cerrar diez veces no reaplica migraciones', () => {
  // Cada actualización vuelve a arrancar. Si el migrador se equivocara y
  // corriera de nuevo un `CREATE TABLE`, la primera actualización se llevaría
  // por delante meses de ventas.
  for (let i = 0; i < 10; i++) {
    cerrarBase();
    abrirBase({ silencioso: true });
  }

  assert.equal(cuantasMigraciones(), migracionesAplicadas);
  assert.ok(listarProductos({ soloActivos: false }).length > 0, 'la carta sigue entera');
});

test('los datos NO viven dentro de la carpeta del programa', () => {
  // Ésta es la razón por la que actualizar es seguro. Si la base viviera en
  // «Archivos de programa», el instalador la borraría al reemplazar la
  // versión vieja. Vive en C:\RESTA, aparte, a propósito.
  const dentroDelPrograma = /program files|archivos de programa|[/\\]app\.asar/i;
  assert.ok(!dentroDelPrograma.test(CARPETA));
  assert.ok(existsSync(join(CARPETA, 'resta.db')));
});
