/**
 * PRUEBAS · TURNOS, CORTE Y RESPALDO
 * ─────────────────────────────────────────────────────────────────────────────
 * Se corren con:   npm test
 *
 * Aquí se prueba el cierre de caja de punta a punta: abrir con fondo, vender,
 * regalar, cancelar, contar el dinero y ver si cuadra. Y que el respaldo de
 * verdad se pueda hacer con la base abierta.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CARPETA = mkdtempSync(join(tmpdir(), 'resta-turnos-'));
process.env.RESTA_DATOS = CARPETA;

let abrirBase, cerrarBase;
let abrirCuenta, anotarLinea, cancelarCuenta, ponerCortesia, buscarCuenta;
let registrarCobro, anularUltimoPago;
let turnoAbierto, abrirTurno, cerrarTurno, corteDeTurno, ultimosTurnos, ticketsSinTurno;
let respaldarAhora, listarRespaldos;
let listarProductos;

let ANA, CAJA;
let cerveza, papas, whisky;

const efectivo = (monto, recibido = null) => ({ metodo: 'efectivo', recibido: recibido ?? monto });

/** Abre una mesa, le anota y la cobra en efectivo. Devuelve el ticket. */
function venderYCobrar(nombre, cosas, metodo = 'efectivo') {
  const { cuenta } = abrirCuenta({ nombre, usuario: ANA });
  for (const [p, cant] of cosas) {
    anotarLinea({ cuentaId: cuenta.id, productoId: p.id, cant, usuario: ANA });
  }
  const total = buscarCuenta(cuenta.id).totales.total;
  const r = registrarCobro({
    cuentaId: cuenta.id, metodo,
    recibido: metodo === 'efectivo' ? total : null,
    usuario: CAJA,
  });
  return r.ticket;
}

before(async () => {
  ({ abrirBase, cerrarBase } = await import('../datos/conexion.js'));
  ({ abrirCuenta, anotarLinea, cancelarCuenta, ponerCortesia, buscarCuenta } =
    await import('../datos/repos/cuentas.js'));
  ({ registrarCobro, anularUltimoPago } = await import('../datos/repos/cobro.js'));
  ({ turnoAbierto, abrirTurno, cerrarTurno, corteDeTurno, ultimosTurnos, ticketsSinTurno } =
    await import('../datos/repos/turnos.js'));
  ({ respaldarAhora, listar: listarRespaldos } = await import('../datos/respaldo.js'));
  ({ listarProductos } = await import('../datos/repos/productos.js'));
  const { crearUsuario } = await import('../datos/repos/usuarios.js');

  abrirBase({ silencioso: true });

  ANA  = crearUsuario({ nombre: 'Ana',  pin: '1111', rol: 'mesero' });
  CAJA = crearUsuario({ nombre: 'Caja', pin: '2222', rol: 'caja' });

  const bebidas = listarProductos({ familia: 'Bebidas' });
  cerveza = bebidas.find((p) => p.nombre === 'Cerveza');           // $40
  whisky  = bebidas.find((p) => p.nombre === 'Whisky Chivas');     // $150
  papas   = listarProductos({ familia: 'Comida' }).find((p) => p.nombre === 'Papas'); // $25
});

after(() => {
  cerrarBase();
  rmSync(CARPETA, { recursive: true, force: true });
});

/* ── Abrir la caja ─────────────────────────────────────────────────────── */

test('al principio no hay ningún turno abierto', () => {
  assert.equal(turnoAbierto(), null);
});

test('abrir la caja guarda el fondo y quién la abrió', () => {
  const t = abrirTurno({ fondo: 100000, usuario: CAJA });

  assert.equal(t.fondo, 100000);
  assert.equal(t.abiertoPor, 'Caja');
  assert.equal(t.estaAbierto, true);
  assert.equal(turnoAbierto().id, t.id);
});

test('no se pueden tener dos cajas abiertas a la vez', () => {
  assert.throws(
    () => abrirTurno({ fondo: 50000, usuario: CAJA }),
    /Ya hay un turno abierto/
  );
});

/* ── Vender ────────────────────────────────────────────────────────────── */

test('lo que se cobra queda apuntado al turno abierto', () => {
  const ticket = venderYCobrar('101', [[cerveza, 2]]);          // $80
  const corte = corteDeTurno(turnoAbierto().id);

  assert.equal(corte.tickets, 1);
  assert.equal(corte.total, 8000);
  assert.equal(corte.porMetodo.efectivo, 8000);
  assert.ok(ticket.folio);
  assert.equal(ticketsSinTurno().length, 0);
});

test('el corte se puede ver a media noche, sin cerrar nada', () => {
  venderYCobrar('102', [[whisky, 1]], 'tarjeta');               // $150 con tarjeta
  const corte = corteDeTurno(turnoAbierto().id);

  assert.equal(corte.tickets, 2);
  assert.equal(corte.porMetodo.efectivo, 8000);
  assert.equal(corte.porMetodo.tarjeta, 15000);
  assert.equal(corte.efectivoEsperado, 108000, 'fondo 1000 + 80 en efectivo');
  assert.equal(corte.diferencia, null, 'todavía no se cuenta el dinero');
});

test('lo más vendido sale del turno', () => {
  venderYCobrar('103', [[cerveza, 5], [papas, 1]]);
  const corte = corteDeTurno(turnoAbierto().id);

  const top = corte.masVendido;
  assert.equal(top[0].nombre, 'Cerveza');
  assert.equal(top[0].piezas, 7, '2 de la mesa 101 más 5 de la 103');
});

test('una cortesía se ve en el corte y no se cobra', () => {
  const { cuenta } = abrirCuenta({ nombre: '104', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: whisky.id, usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, usuario: ANA });

  const c = buscarCuenta(cuenta.id);
  ponerCortesia({
    cuentaId: cuenta.id, lineaId: c.items[1].id, esCortesia: true,
    motivo: 'se tardó', usuario: CAJA,
  });

  registrarCobro({ cuentaId: cuenta.id, metodo: 'efectivo', recibido: 15000, usuario: CAJA });

  const corte = corteDeTurno(turnoAbierto().id);
  assert.equal(corte.cortesias, 4000, 'la cerveza regalada');
});

test('una cuenta cancelada aparece en el corte con su motivo', () => {
  const { cuenta } = abrirCuenta({ nombre: '105', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: whisky.id, cant: 2, usuario: ANA });
  cancelarCuenta({ cuentaId: cuenta.id, motivo: 'se fueron sin pagar', usuario: CAJA });

  const corte = corteDeTurno(turnoAbierto().id);
  assert.equal(corte.canceladas.cuantas, 1);
  assert.equal(corte.canceladas.monto, 30000);
  assert.equal(corte.canceladas.lista[0].motivo, 'se fueron sin pagar');
  assert.equal(corte.canceladas.lista[0].usuario, 'Caja');
});

test('un ticket anulado deja de contar en el corte', () => {
  const antes = corteDeTurno(turnoAbierto().id);

  const { cuenta } = abrirCuenta({ nombre: '106', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: papas.id, usuario: ANA });
  registrarCobro({ cuentaId: cuenta.id, metodo: 'efectivo', recibido: 2500, usuario: CAJA });
  anularUltimoPago({ cuentaId: cuenta.id, motivo: 'se cobró mal', usuario: CAJA });
  cancelarCuenta({ cuentaId: cuenta.id, motivo: 'ya no la quisieron', usuario: CAJA });

  const despues = corteDeTurno(turnoAbierto().id);
  assert.equal(despues.total, antes.total, 'el dinero del ticket anulado no cuenta');
  assert.equal(despues.anulados, 1);
});

/* ── Cerrar la caja ────────────────────────────────────────────────────── */

test('no se cierra la caja con mesas abiertas', () => {
  const { cuenta } = abrirCuenta({ nombre: '110', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, usuario: ANA });

  assert.throws(
    () => cerrarTurno({ turnoId: turnoAbierto().id, efectivoContado: 100000, usuario: CAJA }),
    /mesa\(s\) abierta\(s\)/
  );

  cancelarCuenta({ cuentaId: cuenta.id, motivo: 'prueba', usuario: CAJA });
});

test('no se cierra la caja sin contar el efectivo', () => {
  assert.throws(
    () => cerrarTurno({ turnoId: turnoAbierto().id, efectivoContado: null, usuario: CAJA }),
    /Cuenta el efectivo/
  );
});

test('cerrar contando exacto: la caja cuadra', () => {
  const id = turnoAbierto().id;
  const antes = corteDeTurno(id);

  const corte = cerrarTurno({
    turnoId: id,
    efectivoContado: antes.efectivoEsperado,
    notas: 'noche tranquila',
    usuario: CAJA,
  });

  assert.equal(corte.diferencia, 0);
  assert.equal(corte.cuadra, true);
  assert.equal(corte.turno.estaAbierto, false);
  assert.equal(corte.turno.cerradoPor, 'Caja');
  assert.equal(corte.turno.notas, 'noche tranquila');
  assert.equal(turnoAbierto(), null);
});

test('un turno ya cerrado no se cierra dos veces', () => {
  const cerrado = ultimosTurnos(1)[0];
  assert.throws(
    () => cerrarTurno({ turnoId: cerrado.id, efectivoContado: 1000, usuario: CAJA }),
    /ya estaba cerrado/
  );
});

test('el corte de un turno cerrado sigue dando lo mismo después', () => {
  const cerrado = ultimosTurnos(1)[0];
  const a = corteDeTurno(cerrado.id);
  const b = corteDeTurno(cerrado.id);

  assert.equal(a.total, b.total);
  assert.equal(a.diferencia, 0);
  assert.equal(a.efectivoContado, cerrado.efectivoContado);
});

/* ── Cuando falta dinero ───────────────────────────────────────────────── */

test('si falta dinero, el corte lo dice y queda guardado', () => {
  const t = abrirTurno({ fondo: 50000, usuario: CAJA });
  venderYCobrar('201', [[cerveza, 3]]);                          // $120 en efectivo

  const esperado = corteDeTurno(t.id).efectivoEsperado;          // 500 + 120 = 620
  assert.equal(esperado, 62000);

  const corte = cerrarTurno({
    turnoId: t.id, efectivoContado: 60000,                       // faltan $20
    notas: 'faltó dinero, revisar', usuario: CAJA,
  });

  assert.equal(corte.diferencia, -2000);
  assert.equal(corte.falta, true);

  // Y sigue guardado, para poder revisarlo mañana.
  assert.equal(ultimosTurnos(1)[0].diferencia, -2000);
});

/* ── Un turno nuevo empieza de cero ────────────────────────────────────── */

test('el turno nuevo no arrastra las ventas del anterior', () => {
  const t = abrirTurno({ fondo: 0, usuario: CAJA });
  const corte = corteDeTurno(t.id);

  assert.equal(corte.tickets, 0);
  assert.equal(corte.total, 0);
  assert.equal(corte.efectivoEsperado, 0);

  cerrarTurno({ turnoId: t.id, efectivoContado: 0, usuario: CAJA });
});

/* ── El respaldo ───────────────────────────────────────────────────────── */

test('la base se puede respaldar con el bar abierto', async () => {
  const t = abrirTurno({ fondo: 10000, usuario: CAJA });
  venderYCobrar('301', [[cerveza, 1]]);

  const r = await respaldarAhora('prueba');

  assert.ok(existsSync(r.archivo), 'el archivo de respaldo tiene que existir');
  assert.ok(r.bytes > 0, 'y no puede estar vacío');
  assert.ok(listarRespaldos().some((x) => x.ruta === r.archivo));

  cerrarTurno({ turnoId: t.id, efectivoContado: corteDeTurno(t.id).efectivoEsperado, usuario: CAJA });
});

test('cada respaldo es un archivo aparte, no se pisan', async () => {
  const antes = listarRespaldos().length;
  await respaldarAhora('uno');
  await respaldarAhora('dos');
  assert.equal(listarRespaldos().length, antes + 2);
});
