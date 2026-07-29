/**
 * PRUEBAS · EL ALMACÉN SE MUEVE SOLO
 * ─────────────────────────────────────────────────────────────────────────────
 * Se corren con:   npm test
 *
 * Lo que se comprueba aquí es la promesa del módulo: **nadie captura las
 * salidas**. Se cobra una cuenta y el inventario baja solo, incluidas las
 * mezclas (una michelada baja una cerveza) y las cortesías (una cerveza
 * regalada salió del refrigerador igual que una vendida).
 *
 * Y lo contrario: una cuenta CANCELADA no descuenta nada, porque nunca se
 * vendió. Si además se sirvió, eso es una merma y se anota como tal.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CARPETA = mkdtempSync(join(tmpdir(), 'resta-almacen-'));
process.env.RESTA_DATOS = CARPETA;

let abrirBase, cerrarBase;
let abrirCuenta, anotarLinea, cancelarCuenta, ponerCortesia, buscarCuenta, cuentasAbiertas;
let registrarCobro, cerrarSinCobro, abrirTurno;
let existenciaDe, registrarCompra, registrarMerma, registrarConteo,
    existencias, queComprar, vendidoHoy, configurarProducto, aQuienDescuenta,
    movimientosDe;
let listarProductos;

let ANA, CAJA;
let cerveza, michelada, chelada, whisky, papas;

/** Abre una mesa, anota y cobra. Devuelve el ticket. */
function venderYCobrar(nombre, cosas) {
  const { cuenta } = abrirCuenta({ nombre, usuario: ANA });
  for (const [p, cant] of cosas) {
    anotarLinea({ cuentaId: cuenta.id, productoId: p.id, cant, usuario: ANA });
  }
  const total = buscarCuenta(cuenta.id).totales.total;
  return registrarCobro({
    cuentaId: cuenta.id, metodo: 'efectivo', recibido: total, usuario: CAJA,
  });
}

before(async () => {
  ({ abrirBase, cerrarBase } = await import('../datos/conexion.js'));
  ({ abrirCuenta, anotarLinea, cancelarCuenta, ponerCortesia, buscarCuenta, cuentasAbiertas } =
    await import('../datos/repos/cuentas.js'));
  ({ registrarCobro, cerrarSinCobro } = await import('../datos/repos/cobro.js'));
  ({ abrirTurno } = await import('../datos/repos/turnos.js'));
  ({
    existenciaDe, registrarCompra, registrarMerma, registrarConteo,
    existencias, queComprar, vendidoHoy, configurarProducto, aQuienDescuenta,
    movimientosDe,
  } = await import('../datos/repos/almacen.js'));
  ({ listarProductos } = await import('../datos/repos/productos.js'));
  const { crearUsuario } = await import('../datos/repos/usuarios.js');

  abrirBase({ silencioso: true });

  ANA  = crearUsuario({ nombre: 'Ana',  pin: '1111', rol: 'mesero' });
  CAJA = crearUsuario({ nombre: 'Caja', pin: '2222', rol: 'caja' });
  abrirTurno({ fondo: 0, usuario: CAJA });

  const bebidas = listarProductos({ familia: 'Bebidas' });
  cerveza   = bebidas.find((p) => p.nombre === 'Cerveza');
  michelada = bebidas.find((p) => p.nombre === 'Michelada (salsas)');
  chelada   = bebidas.find((p) => p.nombre === 'Chelada (limón y sal)');
  whisky    = bebidas.find((p) => p.nombre === 'Whisky Chivas');
  papas     = listarProductos({ familia: 'Comida' }).find((p) => p.nombre === 'Papas');
});

after(() => {
  cerrarBase();
  rmSync(CARPETA, { recursive: true, force: true });
});

/* ── Cómo quedó configurado de fábrica ─────────────────────────────────── */

test('de arranque se controlan los licores y la cerveza, no los cacahuates', () => {
  const controlados = existencias().map((p) => p.nombre);

  assert.ok(controlados.includes('Cerveza'));
  assert.ok(controlados.includes('Whisky Chivas'));
  assert.ok(!controlados.includes('Papas'), 'las papas no se controlan de inicio');
  assert.ok(!controlados.includes('Michelada (salsas)'),
    'la michelada no tiene existencia propia: gasta cerveza');
});

test('el whisky viene a 15 copas por botella, como pidió Rosendo', () => {
  const w = existencias().find((p) => p.nombre === 'Whisky Chivas');
  assert.equal(w.porcionesPorEnvase, 15);
  assert.equal(w.envase, 'botella');
  assert.equal(w.unidad, 'copa');
});

test('las mezclas apuntan a la cerveza', () => {
  assert.equal(aQuienDescuenta(michelada.id), cerveza.id);
  assert.equal(aQuienDescuenta(chelada.id), cerveza.id);
  assert.equal(aQuienDescuenta(cerveza.id), cerveza.id, 'la cerveza se gasta a sí misma');
  assert.equal(aQuienDescuenta(papas.id), null, 'lo que no se controla no mueve nada');
});

/* ── Llegó el pedido ───────────────────────────────────────────────────── */

test('se compra en cajas y el almacén guarda cervezas', () => {
  registrarCompra({ compras: [{ productoId: cerveza.id, envases: 5 }], usuario: CAJA });

  assert.equal(existenciaDe(cerveza.id), 120, '5 cajas de 24');

  const c = existencias().find((p) => p.nombre === 'Cerveza');
  assert.equal(c.texto, '5 cajas');
});

test('se compran botellas y el almacén guarda copas', () => {
  registrarCompra({ compras: [{ productoId: whisky.id, envases: 2 }], usuario: CAJA });

  assert.equal(existenciaDe(whisky.id), 30, '2 botellas de 15 copas');
  assert.equal(existencias().find((p) => p.nombre === 'Whisky Chivas').texto, '2 botellas');
});

test('una compra sin cantidades avisa en vez de guardar nada', () => {
  assert.throws(
    () => registrarCompra({ compras: [{ productoId: cerveza.id, envases: 0 }], usuario: CAJA }),
    /No anotaste ninguna cantidad/
  );
});

/* ── LO IMPORTANTE: la venta descuenta sola ────────────────────────────── */

test('cobrar una cuenta baja el almacén sin que nadie capture nada', () => {
  const antes = existenciaDe(cerveza.id);

  venderYCobrar('201', [[cerveza, 3]]);

  assert.equal(existenciaDe(cerveza.id), antes - 3);
});

test('una michelada baja UNA CERVEZA, que es lo que se compra', () => {
  const antes = existenciaDe(cerveza.id);

  venderYCobrar('202', [[michelada, 2], [chelada, 1]]);

  assert.equal(existenciaDe(cerveza.id), antes - 3,
    '2 micheladas y 1 chelada gastan 3 cervezas');
});

test('las copas de whisky bajan de la botella', () => {
  const antes = existenciaDe(whisky.id);

  venderYCobrar('203', [[whisky, 4]]);

  assert.equal(existenciaDe(whisky.id), antes - 4);
  assert.equal(existencias().find((p) => p.nombre === 'Whisky Chivas').texto,
    '1 botella y 11 copas');
});

test('una cortesía TAMBIÉN baja el almacén: salió del refrigerador igual', () => {
  const antes = existenciaDe(cerveza.id);

  const { cuenta } = abrirCuenta({ nombre: '204', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, cant: 2, usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: whisky.id, cant: 1, usuario: ANA });

  const c = buscarCuenta(cuenta.id);
  ponerCortesia({
    cuentaId: cuenta.id, lineaId: c.items[0].id, esCortesia: true,
    motivo: 'cumpleaños', usuario: CAJA,
  });

  const total = buscarCuenta(cuenta.id).totales.total;
  registrarCobro({ cuentaId: cuenta.id, metodo: 'efectivo', recibido: total, usuario: CAJA });

  assert.equal(existenciaDe(cerveza.id), antes - 2, 'las regaladas también salieron');
});

/* ── La mesa que va toda de cortesía ───────────────────────────────────── */

test('una mesa 100% de cortesía se puede cerrar y SÍ baja el almacén', () => {
  // La mesa del dueño, la ronda del cumpleaños. El total queda en cero, así
  // que no hay nada que cobrar; antes la mesa se quedaba abierta para siempre
  // y esas cervezas nunca salían del inventario aunque salieron del refri.
  const antes = existenciaDe(cerveza.id);

  const { cuenta } = abrirCuenta({ nombre: '206', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, cant: 3, usuario: ANA });

  const c = buscarCuenta(cuenta.id);
  ponerCortesia({
    cuentaId: cuenta.id, lineaId: c.items[0].id, esCortesia: true,
    motivo: 'Mesa del dueño', usuario: CAJA,
  });
  assert.equal(buscarCuenta(cuenta.id).totales.total, 0);

  const r = cerrarSinCobro({ cuentaId: cuenta.id, motivo: 'Mesa del dueño', usuario: CAJA });

  assert.ok(r.ticket, 'tiene que quedar su ticket, aunque sea de cero');
  assert.equal(existenciaDe(cerveza.id), antes - 3);
  assert.equal(buscarCuenta(cuenta.id).estado, 'cobrada');
});

test('cerrar sin cobrar NO sirve para una cuenta que sí debe', () => {
  // Si esto pasara, sería la puerta para cerrar cuentas sin cobrarlas.
  const { cuenta } = abrirCuenta({ nombre: '207', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, cant: 2, usuario: ANA });

  assert.throws(
    () => cerrarSinCobro({ cuentaId: cuenta.id, usuario: CAJA }),
    /todavía debe/,
  );
});

/* ── El cliente que se va sin pagar ────────────────────────────────────── */

test('si se lo tomaron y se fueron, la mercancía SÍ sale del almacén', () => {
  // El caso que de verdad pasa en un bar. El dinero se perdió, pero esas
  // cervezas salieron del refrigerador igual que las vendidas. Si no se
  // descuentan, el inventario las sigue contando y al mes no cuadra nada.
  const antes = existenciaDe(cerveza.id);

  const { cuenta } = abrirCuenta({ nombre: '220', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, cant: 4, usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: michelada.id, cant: 2, usuario: ANA });

  cancelarCuenta({
    cuentaId: cuenta.id, motivo: 'Se fueron sin pagar',
    seConsumio: true, usuario: CAJA,
  });

  // 4 cervezas + 2 micheladas, que también gastan cerveza
  assert.equal(existenciaDe(cerveza.id), antes - 6);
});

test('sale como MERMA, no como venta', () => {
  // Si entrara como venta, la proyección de consumo creería que ese día se
  // vendió más de lo real y haría comprar de más para siempre. Además, el
  // motivo tiene que quedar escrito: es dinero perdido y hay que poder verlo.
  const { cuenta } = abrirCuenta({ nombre: '221', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, cant: 3, usuario: ANA });

  cancelarCuenta({
    cuentaId: cuenta.id, motivo: 'Se fueron sin pagar',
    seConsumio: true, usuario: CAJA,
  });

  const ultimo = movimientosDe(cerveza.id)[0];
  assert.equal(ultimo.tipo, 'merma');
  assert.equal(ultimo.cantidad, -3);
  assert.match(ultimo.motivo, /sin pagar/i);
});

test('si NO se sirvió nada, el almacén no se toca', () => {
  // Se anotó en la mesa equivocada, o se fueron antes de que les sirvieran.
  const antes = existenciaDe(cerveza.id);

  const { cuenta } = abrirCuenta({ nombre: '222', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, cant: 9, usuario: ANA });

  cancelarCuenta({
    cuentaId: cuenta.id, motivo: 'Mesa equivocada',
    seConsumio: false, usuario: CAJA,
  });

  assert.equal(existenciaDe(cerveza.id), antes);
});

test('una cuenta cancelada desaparece de la pantalla de mesas', () => {
  // La pregunta de Rosendo: una cuenta que nadie liquida se queda ahí
  // para siempre y además NO deja cerrar el turno. Cancelarla la saca.
  const { cuenta } = abrirCuenta({ nombre: '223', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, cant: 1, usuario: ANA });

  assert.ok(cuentasAbiertas().some((c) => c.id === cuenta.id), 'estaba en mesas');

  cancelarCuenta({
    cuentaId: cuenta.id, motivo: 'Se fueron sin pagar',
    seConsumio: true, usuario: CAJA,
  });

  assert.ok(!cuentasAbiertas().some((c) => c.id === cuenta.id), 'ya no estorba');
});

test('lo que no se controla no mueve el almacén', () => {
  const movimientosAntes = movimientosDe(papas.id).length;
  venderYCobrar('205', [[papas, 5]]);
  assert.equal(movimientosDe(papas.id).length, movimientosAntes);
});

/* ── Una cuenta cancelada NO descuenta ─────────────────────────────────── */

test('cancelar una cuenta no toca el almacén: nunca se vendió', () => {
  const antes = existenciaDe(cerveza.id);

  const { cuenta } = abrirCuenta({ nombre: '210', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, cant: 6, usuario: ANA });
  cancelarCuenta({ cuentaId: cuenta.id, motivo: 'se fueron sin pagar', usuario: CAJA });

  assert.equal(existenciaDe(cerveza.id), antes,
    'si además se sirvieron, eso se anota como merma');
});

/* ── Merma ─────────────────────────────────────────────────────────────── */

test('una botella rota baja el almacén y queda con su motivo', () => {
  const antes = existenciaDe(whisky.id);

  registrarMerma({
    productoId: whisky.id, porciones: 15, motivo: 'Se cayó / se rompió', usuario: CAJA,
  });

  assert.equal(existenciaDe(whisky.id), antes - 15);

  const ultimo = movimientosDe(whisky.id, 1)[0];
  assert.equal(ultimo.tipo, 'merma');
  assert.equal(ultimo.motivo, 'Se cayó / se rompió');
  assert.equal(ultimo.usuario_nom, 'Caja');
});

test('una merma sin motivo no se guarda', () => {
  assert.throws(
    () => registrarMerma({ productoId: whisky.id, porciones: 2, motivo: '  ', usuario: CAJA }),
    /qué pasó/
  );
});

test('una merma sin cantidad no se guarda', () => {
  assert.throws(
    () => registrarMerma({ productoId: whisky.id, porciones: 0, motivo: 'x', usuario: CAJA }),
    /Cuántas se perdieron/
  );
});

/* ── El conteo físico ──────────────────────────────────────────────────── */

test('el conteo ajusta la diferencia y deja rastro', () => {
  const segunSistema = existenciaDe(cerveza.id);
  const contado = segunSistema - 7;             // faltaron 7 al contar

  const [r] = registrarConteo({
    conteos: [{ productoId: cerveza.id, contado }], usuario: CAJA,
  });

  assert.equal(r.diferencia, -7);
  assert.equal(r.falta, true);
  assert.equal(existenciaDe(cerveza.id), contado, 'el sistema se ajusta a lo contado');

  const ultimo = movimientosDe(cerveza.id, 1)[0];
  assert.equal(ultimo.tipo, 'conteo');
  assert.match(ultimo.motivo, /Faltaron 7/);
});

test('un conteo que cuadra no inventa movimientos', () => {
  const antes = movimientosDe(whisky.id).length;
  const [r] = registrarConteo({
    conteos: [{ productoId: whisky.id, contado: existenciaDe(whisky.id) }], usuario: CAJA,
  });

  assert.equal(r.cuadra, true);
  assert.equal(movimientosDe(whisky.id).length, antes, 'no se anota nada si cuadra');
});

/* ── Lo que se vendió hoy ──────────────────────────────────────────────── */

test('el corte puede listar lo vendido hoy con sus cantidades', () => {
  const lista = vendidoHoy();
  const cerv = lista.find((x) => x.nombre === 'Cerveza');

  assert.ok(cerv, 'la cerveza debe aparecer');
  assert.ok(cerv.piezas > 0);
  // Sale de mayor a menor
  for (let i = 1; i < lista.length; i++) {
    assert.ok(lista[i - 1].piezas >= lista[i].piezas);
  }
});

/* ── Configurar ────────────────────────────────────────────────────────── */

test('el número de copas por botella se puede cambiar, como pidió Rosendo', () => {
  configurarProducto({ id: whisky.id, porcionesPorEnvase: 16 });
  assert.equal(existencias().find((p) => p.nombre === 'Whisky Chivas').porcionesPorEnvase, 16);
  configurarProducto({ id: whisky.id, porcionesPorEnvase: 15 });
});

test('se puede empezar a controlar un producto que no se controlaba', () => {
  configurarProducto({
    id: papas.id, controla: true, porcionesPorEnvase: 40,
    envase: 'caja', unidad: 'bolsa',
  });

  assert.ok(existencias().some((p) => p.nombre === 'Papas'));
  configurarProducto({ id: papas.id, controla: false });
});

test('un producto no puede gastar de sí mismo', () => {
  assert.throws(
    () => configurarProducto({ id: michelada.id, gastaDe: michelada.id }),
    /no puede gastar de sí mismo/
  );
});

test('no se encadenan mezclas de mezclas', () => {
  // La michelada ya gasta cerveza; nadie debe apuntar a la michelada.
  assert.throws(
    () => configurarProducto({ id: chelada.id, gastaDe: michelada.id }),
    /ya gasta de otro/
  );
});

test('un número de porciones absurdo se rechaza', () => {
  assert.throws(() => configurarProducto({ id: whisky.id, porcionesPorEnvase: 0 }), /1 o más/);
  assert.throws(() => configurarProducto({ id: whisky.id, porcionesPorEnvase: 5000 }), /Sobran ceros/);
});

/* ── La lista de compras ───────────────────────────────────────────────── */

test('la lista de compras dice qué y cuántos envases', () => {
  const { lista, diasACubrir } = queComprar({ diasACubrir: 14 });

  assert.equal(diasACubrir, 14);
  for (const r of lista) {
    assert.ok(r.comprar >= 1, 'siempre al menos un envase');
    assert.ok(Number.isInteger(r.comprar));
    assert.ok(r.envase, 'debe decir en qué se compra');
  }
});
