/**
 * PRUEBAS · COBRO
 * ─────────────────────────────────────────────────────────────────────────────
 * Se corren con:   npm test
 *
 * Estos son LOS casos que dan miedo: descuento + propina + dividido entre
 * tres, mitad efectivo y mitad tarjeta, cada quien lo suyo, cortesías sobre
 * una cuenta con descuento.
 *
 * En todos, lo que se comprueba al final es lo mismo: que la suma de los
 * pagos dé EXACTAMENTE el total, sin un centavo de más ni de menos.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CARPETA = mkdtempSync(join(tmpdir(), 'resta-cobro-'));
process.env.RESTA_DATOS = CARPETA;

let abrirBase, cerrarBase;
let abrirCuenta, anotarLinea, buscarCuenta, ponerCortesia, ponerDescuento, ponerPropina;
let registrarCobro, anularUltimoPago, buscarTicket, ticketsDelDia;
let listarProductos, eventosDe, dividirRestante;

let CAJA, ANA;
let cerveza, papas, whisky;

/** Abre una mesa nueva con lo que se le diga: [[producto, cantidad], …] */
function mesaCon(nombre, cosas) {
  const { cuenta } = abrirCuenta({ nombre, usuario: ANA });
  for (const [p, cant] of cosas) {
    anotarLinea({ cuentaId: cuenta.id, productoId: p.id, cant, usuario: ANA });
  }
  return buscarCuenta(cuenta.id);
}

before(async () => {
  ({ abrirBase, cerrarBase } = await import('../datos/conexion.js'));
  ({
    abrirCuenta, anotarLinea, buscarCuenta,
    ponerCortesia, ponerDescuento, ponerPropina,
  } = await import('../datos/repos/cuentas.js'));
  ({ registrarCobro, anularUltimoPago, buscarTicket, ticketsDelDia } =
    await import('../datos/repos/cobro.js'));
  ({ listarProductos } = await import('../datos/repos/productos.js'));
  ({ eventosDe } = await import('../datos/repos/eventos.js'));
  ({ dividirRestante } = await import('../nucleo/cuenta.js'));
  const { crearUsuario } = await import('../datos/repos/usuarios.js');

  abrirBase({ silencioso: true });

  ANA  = crearUsuario({ nombre: 'Ana',  pin: '1111', rol: 'mesero' });
  CAJA = crearUsuario({ nombre: 'Caja', pin: '2222', rol: 'caja' });

  const bebidas = listarProductos({ familia: 'Bebidas' });
  cerveza = bebidas.find((p) => p.nombre === 'Cerveza');            // $40
  whisky  = bebidas.find((p) => p.nombre === 'Whisky Chivas');      // $150
  papas   = listarProductos({ familia: 'Comida' }).find((p) => p.nombre === 'Papas'); // $25
});

after(() => {
  cerrarBase();
  rmSync(CARPETA, { recursive: true, force: true });
});

/* ── Lo sencillo ───────────────────────────────────────────────────────── */

test('cobrar todo en efectivo cierra la cuenta y saca su ticket', () => {
  const c = mesaCon('101', [[cerveza, 2]]);          // $80

  const r = registrarCobro({
    cuentaId: c.id, metodo: 'efectivo', recibido: 10000, usuario: CAJA,
  });

  assert.equal(r.pago.monto, 8000);
  assert.equal(r.pago.cambio, 2000, 'de $100 por $80, el cambio son $20');
  assert.equal(r.cuenta.estado, 'cobrada');
  assert.ok(r.ticket, 'debió nacer el ticket');
  assert.equal(r.ticket.totales.total, 8000);
  assert.equal(r.cuenta.totales.restante, 0);
});

test('los folios de los tickets van en orden y no se repiten', () => {
  const a = registrarCobro({
    cuentaId: mesaCon('102', [[papas, 1]]).id, metodo: 'tarjeta', usuario: CAJA,
  });
  const b = registrarCobro({
    cuentaId: mesaCon('103', [[papas, 1]]).id, metodo: 'tarjeta', usuario: CAJA,
  });

  assert.equal(b.ticket.folio, a.ticket.folio + 1);
});

test('cobrar de más no rechaza: se ajusta a lo que falta y se avisa', () => {
  const c = mesaCon('104', [[cerveza, 1]]);          // $40

  const r = registrarCobro({
    cuentaId: c.id, metodo: 'efectivo', monto: 100000, recibido: 100000, usuario: CAJA,
  });

  assert.equal(r.pago.monto, 4000, 'sólo se cobra lo que falta');
  assert.match(r.aviso, /se ajustó/);
  assert.equal(r.cuenta.estado, 'cobrada');
});

test('si el cliente da menos de lo que se cobra, no se registra', () => {
  const c = mesaCon('105', [[whisky, 1]]);           // $150

  assert.throws(
    () => registrarCobro({ cuentaId: c.id, metodo: 'efectivo', recibido: 10000, usuario: CAJA }),
    /dio menos/
  );

  assert.equal(buscarCuenta(c.id).estado, 'abierta', 'la cuenta no se tocó');
});

/* ── Pagos parciales ───────────────────────────────────────────────────── */

test('la cuenta sigue abierta hasta que el restante llega a cero', () => {
  const c = mesaCon('110', [[whisky, 2]]);           // $300

  const uno = registrarCobro({ cuentaId: c.id, metodo: 'efectivo', monto: 10000, recibido: 10000, usuario: CAJA });
  assert.equal(uno.cuenta.estado, 'abierta');
  assert.equal(uno.cuenta.totales.restante, 20000);
  assert.equal(uno.ticket, null);

  const dos = registrarCobro({ cuentaId: c.id, metodo: 'tarjeta', monto: 15000, usuario: CAJA });
  assert.equal(dos.cuenta.totales.restante, 5000);
  assert.equal(dos.ticket, null);

  const tres = registrarCobro({ cuentaId: c.id, metodo: 'efectivo', recibido: 5000, usuario: CAJA });
  assert.equal(tres.cuenta.estado, 'cobrada');
  assert.equal(tres.cuenta.totales.restante, 0);
  assert.ok(tres.ticket);
});

test('mitad en efectivo y mitad con tarjeta suma exacto', () => {
  const c = mesaCon('111', [[whisky, 1], [cerveza, 1]]);   // $190

  registrarCobro({ cuentaId: c.id, metodo: 'efectivo', monto: 9500, recibido: 10000, usuario: CAJA });
  const r = registrarCobro({ cuentaId: c.id, metodo: 'tarjeta', monto: 9500, usuario: CAJA });

  const pagado = r.cuenta.pagos.reduce((n, p) => n + p.monto, 0);
  assert.equal(pagado, 19000);
  assert.equal(r.cuenta.totales.restante, 0);
  assert.equal(r.cuenta.estado, 'cobrada');
});

/* ── EL CASO QUE MÁS DA MIEDO ──────────────────────────────────────────── */

test('descuento del 15% + propina del 10%, dividido entre 3, cuadra al centavo', () => {
  const c = mesaCon('120', [[whisky, 1], [cerveza, 2], [papas, 1]]);  // 150+80+25 = $255

  ponerDescuento({ cuentaId: c.id, tipo: 'porcentaje', valor: 15, motivo: 'cliente frecuente', usuario: CAJA });
  ponerPropina({ cuentaId: c.id, tipo: 'porcentaje', valor: 10, usuario: CAJA });

  const conNumeros = buscarCuenta(c.id);
  const t = conNumeros.totales;

  assert.equal(t.consumo, 25500);
  assert.equal(t.descuento, 3825);                 // 15% de 255.00
  assert.equal(t.subtotal, 21675);
  assert.equal(t.propina, 2168);                   // 10% del subtotal, redondeado
  assert.equal(t.total, 23843);                    // $238.43

  // Se divide entre 3: los centavos sobrantes NO se pueden perder.
  const partes = dividirRestante(conNumeros, 3);
  assert.equal(partes.reduce((a, b) => a + b, 0), 23843, 'las tres partes suman el total');
  assert.deepEqual(partes, [7948, 7948, 7947]);

  // Y se cobran las tres partes.
  for (const parte of partes) {
    registrarCobro({ cuentaId: c.id, metodo: 'efectivo', monto: parte, recibido: parte, usuario: CAJA });
  }

  const final = buscarCuenta(c.id);
  assert.equal(final.totales.restante, 0, 'no puede quedar ni un centavo pendiente');
  assert.equal(final.estado, 'cobrada');
  assert.equal(final.pagos.reduce((n, p) => n + p.monto, 0), 23843);
});

/* ── Cada quien lo suyo ────────────────────────────────────────────────── */

test('cada quien paga lo suyo y la suma da el total, con descuento de por medio', () => {
  const c = mesaCon('130', [[whisky, 1], [cerveza, 1], [papas, 1]]);  // 150+40+25 = $215
  ponerDescuento({ cuentaId: c.id, tipo: 'porcentaje', valor: 20, motivo: 'promoción', usuario: CAJA });

  const cuenta = buscarCuenta(c.id);
  assert.equal(cuenta.totales.total, 17200);       // 215 − 20% = 172.00

  const [lWhisky, lCerveza, lPapas] = cuenta.items;

  const a = registrarCobro({ cuentaId: c.id, metodo: 'tarjeta', lineas: [lWhisky.id], usuario: CAJA });
  const b = registrarCobro({ cuentaId: c.id, metodo: 'efectivo', lineas: [lCerveza.id], recibido: 20000, usuario: CAJA });
  const d = registrarCobro({ cuentaId: c.id, metodo: 'efectivo', lineas: [lPapas.id], recibido: 20000, usuario: CAJA });

  const suma = a.pago.monto + b.pago.monto + d.pago.monto;
  assert.equal(suma, 17200, 'la suma de los tres pagos tiene que dar el total con descuento');
  assert.equal(d.cuenta.estado, 'cobrada');
});

test('un renglón ya cobrado no se puede volver a cobrar', () => {
  const c = mesaCon('131', [[cerveza, 1], [papas, 1]]);
  const cuenta = buscarCuenta(c.id);

  registrarCobro({ cuentaId: c.id, metodo: 'tarjeta', lineas: [cuenta.items[0].id], usuario: CAJA });

  assert.throws(
    () => registrarCobro({ cuentaId: c.id, metodo: 'tarjeta', lineas: [cuenta.items[0].id], usuario: CAJA }),
    /ya se había cobrado/
  );
});

/* ── Cortesías ─────────────────────────────────────────────────────────── */

test('una cortesía se ve en la cuenta pero no se cobra', () => {
  const c = mesaCon('140', [[whisky, 1], [cerveza, 1]]);   // $190
  const cuenta = buscarCuenta(c.id);

  const r = ponerCortesia({
    cuentaId: c.id, lineaId: cuenta.items[1].id, esCortesia: true,
    motivo: 'se tardó la comida', usuario: CAJA,
  });

  assert.equal(r.items.length, 2, 'la cerveza sigue en la cuenta');
  assert.equal(r.totales.cortesias, 4000);
  assert.equal(r.totales.consumo, 15000);
  assert.equal(r.totales.total, 15000, 'sólo se cobra el whisky');
  assert.equal(r.totales.bruto, 19000, 'el bruto sí incluye lo regalado');
});

test('la cortesía exige motivo y queda escrito quién la autorizó', () => {
  const c = mesaCon('141', [[cerveza, 1]]);
  const cuenta = buscarCuenta(c.id);

  assert.throws(
    () => ponerCortesia({ cuentaId: c.id, lineaId: cuenta.items[0].id, esCortesia: true, motivo: '  ', usuario: CAJA }),
    /por qué se regala/
  );

  ponerCortesia({
    cuentaId: c.id, lineaId: cuenta.items[0].id, esCortesia: true,
    motivo: 'cumpleaños', usuario: CAJA,
  });

  const rastro = eventosDe(c.id).find((e) => e.tipo === 'linea.cortesia');
  assert.equal(rastro.usuario_nom, 'Caja');
  assert.equal(rastro.detalle.motivo, 'cumpleaños');
  assert.equal(rastro.detalle.seRegala, 4000);
});

test('cortesía sobre una cuenta con descuento: el descuento no toca lo regalado', () => {
  const c = mesaCon('142', [[whisky, 1], [cerveza, 1]]);   // 150 + 40
  const cuenta = buscarCuenta(c.id);

  ponerCortesia({
    cuentaId: c.id, lineaId: cuenta.items[1].id, esCortesia: true,
    motivo: 'invitación', usuario: CAJA,
  });
  const r = ponerDescuento({ cuentaId: c.id, tipo: 'porcentaje', valor: 10, usuario: CAJA });

  // El 10% se aplica sobre los $150 que sí se cobran, no sobre los $190.
  assert.equal(r.totales.consumo, 15000);
  assert.equal(r.totales.descuento, 1500);
  assert.equal(r.totales.total, 13500);
});

/* ── Descuentos y propinas: los topes ──────────────────────────────────── */

test('el descuento nunca deja la cuenta en negativo', () => {
  const c = mesaCon('150', [[papas, 1]]);          // $25
  const r = ponerDescuento({ cuentaId: c.id, tipo: 'monto', valor: 100000, usuario: CAJA });

  assert.equal(r.totales.descuento, 2500, 'como mucho, todo el consumo');
  assert.equal(r.totales.total, 0);
});

test('no se acepta un descuento de más del 100%', () => {
  const c = mesaCon('151', [[papas, 1]]);
  assert.throws(
    () => ponerDescuento({ cuentaId: c.id, tipo: 'porcentaje', valor: 120, usuario: CAJA }),
    /no puede pasar del 100/
  );
});

test('la propina se calcula sobre el subtotal, no sobre el bruto', () => {
  const c = mesaCon('152', [[whisky, 1]]);         // $150
  ponerDescuento({ cuentaId: c.id, tipo: 'porcentaje', valor: 50, usuario: CAJA });
  const r = ponerPropina({ cuentaId: c.id, tipo: 'porcentaje', valor: 10, usuario: CAJA });

  // 10% de 75.00 (lo que va a pagar), no de 150.00
  assert.equal(r.totales.subtotal, 7500);
  assert.equal(r.totales.propina, 750);
  assert.equal(r.totales.total, 8250);
});

test('poner el descuento en cero lo quita', () => {
  const c = mesaCon('153', [[cerveza, 1]]);
  ponerDescuento({ cuentaId: c.id, tipo: 'porcentaje', valor: 20, usuario: CAJA });
  const r = ponerDescuento({ cuentaId: c.id, tipo: 'porcentaje', valor: 0, usuario: CAJA });

  assert.equal(r.descuento, null);
  assert.equal(r.totales.total, 4000);
});

/* ── Deshacer un cobro mal hecho ───────────────────────────────────────── */

test('anular el último pago lo deshace y queda registrado', () => {
  const c = mesaCon('160', [[whisky, 1]]);         // $150
  registrarCobro({ cuentaId: c.id, metodo: 'efectivo', monto: 5000, recibido: 5000, usuario: CAJA });

  const r = anularUltimoPago({ cuentaId: c.id, motivo: 'se tecleó de más', usuario: CAJA });

  assert.equal(r.pagos.length, 0);
  assert.equal(r.totales.restante, 15000);

  const rastro = eventosDe(c.id).find((e) => e.tipo === 'cobro.anular');
  assert.equal(rastro.detalle.monto, 5000);
  assert.equal(rastro.detalle.motivo, 'se tecleó de más');
});

test('anular exige motivo', () => {
  const c = mesaCon('161', [[cerveza, 1]]);
  registrarCobro({ cuentaId: c.id, metodo: 'tarjeta', monto: 1000, usuario: CAJA });

  assert.throws(
    () => anularUltimoPago({ cuentaId: c.id, motivo: '', usuario: CAJA }),
    /por qué se anula/
  );
});

test('al anular un pago por renglones, sólo esos vuelven a estar pendientes', () => {
  const c = mesaCon('162', [[whisky, 1], [cerveza, 1]]);
  const cuenta = buscarCuenta(c.id);
  const [lWhisky, lCerveza] = cuenta.items;

  registrarCobro({ cuentaId: c.id, metodo: 'tarjeta', lineas: [lWhisky.id], usuario: CAJA });
  registrarCobro({ cuentaId: c.id, metodo: 'efectivo', lineas: [lCerveza.id], recibido: 4000, usuario: CAJA });

  const r = anularUltimoPago({ cuentaId: c.id, motivo: 'era de otra mesa', usuario: CAJA });

  const whiskyDespues  = r.items.find((i) => i.id === lWhisky.id);
  const cervezaDespues = r.items.find((i) => i.id === lCerveza.id);

  assert.equal(whiskyDespues.pagado, true, 'el que pagó el otro sigue pagado');
  assert.equal(cervezaDespues.pagado, false, 'sólo se deshizo el último');
});

test('deshacer el pago que ya había cerrado la cuenta la vuelve a abrir', () => {
  const c = mesaCon('163', [[whisky, 1]]);          // $150

  // La caja se equivoca: cobra completo cuando en realidad faltaba.
  const cobro = registrarCobro({ cuentaId: c.id, metodo: 'tarjeta', usuario: CAJA });
  assert.equal(cobro.cuenta.estado, 'cobrada');
  const folio = cobro.ticket.folio;

  const r = anularUltimoPago({ cuentaId: c.id, motivo: 'era la mesa de al lado', usuario: CAJA });

  assert.equal(r.estado, 'abierta', 'la cuenta se reabre para poder cobrarla bien');
  assert.equal(r.totales.restante, 15000);
  assert.equal(r.pagos.length, 0);

  // El ticket NO se borró: se anuló, y su folio se queda usado para siempre.
  const t = buscarTicket(folio);
  assert.ok(t, 'el ticket sigue existiendo');
  assert.equal(t.anulado, true);
  assert.equal(t.anuladoMotivo, 'era la mesa de al lado');
  assert.equal(t.anuladoPor, 'Caja');
});

test('un ticket anulado no cuenta para el corte del día', () => {
  const c = mesaCon('164', [[cerveza, 1]]);
  const fecha = buscarCuenta(c.id).fecha;

  // Dos puntos de partida distintos: el día ya trae tickets de otras pruebas.
  const antesBuenos = ticketsDelDia(fecha).length;
  const antesTodos  = ticketsDelDia(fecha, { incluirAnulados: true }).length;

  registrarCobro({ cuentaId: c.id, metodo: 'tarjeta', usuario: CAJA });
  assert.equal(ticketsDelDia(fecha).length, antesBuenos + 1);

  anularUltimoPago({ cuentaId: c.id, motivo: 'se cobró de más', usuario: CAJA });

  assert.equal(ticketsDelDia(fecha).length, antesBuenos, 'el anulado ya no suma dinero');
  assert.equal(ticketsDelDia(fecha, { incluirAnulados: true }).length, antesTodos + 1,
    'pero se puede revisar qué se anuló');
});

test('una cuenta reabierta se puede volver a cobrar, con folio nuevo', () => {
  const c = mesaCon('165', [[papas, 1]]);           // $25

  const primero = registrarCobro({ cuentaId: c.id, metodo: 'tarjeta', usuario: CAJA });
  anularUltimoPago({ cuentaId: c.id, motivo: 'iba en efectivo', usuario: CAJA });
  const segundo = registrarCobro({ cuentaId: c.id, metodo: 'efectivo', recibido: 5000, usuario: CAJA });

  assert.equal(segundo.cuenta.estado, 'cobrada');
  assert.equal(segundo.pago.cambio, 2500);
  assert.notEqual(segundo.ticket.folio, primero.ticket.folio, 'folio nuevo, el viejo quedó anulado');
  assert.equal(buscarTicket(primero.ticket.folio).anulado, true);
});

/* ── El ticket es una fotografía ───────────────────────────────────────── */

test('el ticket guarda los números del momento del cobro', () => {
  const c = mesaCon('170', [[whisky, 1], [papas, 1]]);   // $175
  ponerDescuento({ cuentaId: c.id, tipo: 'monto', valor: 2500, usuario: CAJA });
  ponerPropina({ cuentaId: c.id, tipo: 'monto', valor: 3000, usuario: CAJA });

  const r = registrarCobro({ cuentaId: c.id, metodo: 'tarjeta', usuario: CAJA });
  const t = r.ticket;

  assert.equal(t.totales.consumo, 17500);
  assert.equal(t.totales.descuento, 2500);
  assert.equal(t.totales.subtotal, 15000);
  assert.equal(t.totales.propina, 3000);
  assert.equal(t.totales.total, 18000);
  assert.equal(t.nombre, 'Mesa 170');
  assert.equal(t.cerradoPor, 'Caja');
  assert.equal(t.pagos.length, 1);

  // Se puede volver a buscar por su folio y da lo mismo.
  assert.deepEqual(buscarTicket(t.folio).totales, t.totales);
});

test('los tickets del día se pueden listar para el corte', () => {
  const hoy = buscarCuenta(mesaCon('180', [[papas, 1]]).id).fecha;
  const antes = ticketsDelDia(hoy).length;

  registrarCobro({
    cuentaId: mesaCon('181', [[papas, 1]]).id, metodo: 'efectivo', recibido: 2500, usuario: CAJA,
  });

  assert.equal(ticketsDelDia(hoy).length, antes + 1);
});

/* ── En una cuenta ya cobrada no se toca nada ──────────────────────────── */

test('una cuenta cobrada ya no admite más movimientos', () => {
  const c = mesaCon('190', [[cerveza, 1]]);
  registrarCobro({ cuentaId: c.id, metodo: 'tarjeta', usuario: CAJA });

  assert.throws(
    () => registrarCobro({ cuentaId: c.id, metodo: 'efectivo', monto: 100, usuario: CAJA }),
    /ya se cobró/
  );
  assert.throws(
    () => ponerDescuento({ cuentaId: c.id, tipo: 'porcentaje', valor: 10, usuario: CAJA }),
    /ya se cobró/
  );
  assert.throws(
    () => anotarLinea({ cuentaId: c.id, productoId: cerveza.id, usuario: ANA }),
    /ya se cobró/
  );
});
