/**
 * PRUEBAS · IMPORTAR LAS VENTAS Y LAS MESAS ABIERTAS DE LA v1.3.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Se corren con:   npm test
 *
 * Esta importación mueve DINERO de verdad: el día que ONCE cambie de la v1 a
 * la v2, lo que entre aquí es lo que va a aparecer en el corte, y el archivo
 * de origen no se puede volver a generar. Un peso de más o de menos aquí es
 * un peso que nadie va a poder explicar tres meses después.
 *
 * Por eso se prueba, sobre todo, que los números CUADREN: la v1 y la v2 no
 * suman igual (la propina va aparte en una y adentro en la otra), y ahí es
 * donde se rompería sin que nadie lo notara hasta el corte.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CARPETA = mkdtempSync(join(tmpdir(), 'resta-historial-'));
process.env.RESTA_DATOS = CARPETA;

let base, abrirBase, cerrarBase, importarV1, cuentasAbiertas, ticketsDelDia, resumenDelDia;

before(async () => {
  ({ abrirBase, cerrarBase, base } = await import('../datos/conexion.js'));
  ({ importarV1 } = await import('../datos/importar-v1.js'));
  ({ cuentasAbiertas } = await import('../datos/repos/cuentas.js'));
  ({ ticketsDelDia, resumenDelDia } = await import('../datos/repos/cobro.js'));
  abrirBase({ silencioso: true });
});

after(() => {
  cerrarBase();
  rmSync(CARPETA, { recursive: true, force: true });
});

/* ── Piezas para armar respaldos de la v1 ──────────────────────────────── */

const respaldo = (extra = {}) => ({
  negocio: 'ONCE Social Lounge',
  esDemo: false,
  produccion: true,
  seq: 47,
  productos: [],
  cuentas: [],
  tickets: [],
  turno: { fecha: '2026-07-29', hora: '18:00:00' },
  impresion: { ancho: 80, logo: '', pie: '¡Gracias por su visita!', comanda: true },
  ...extra,
});

/** Una cerveza de $40. En la v1 los precios ya vienen en centavos enteros. */
const cerveza = (extra = {}) => ({
  icono: '🍺', nombre: 'Cerveza', detalle: '', precio: 4000, cant: 1,
  precioOriginal: 0, motivoCortesia: '', ...extra,
});

const venta = (extra = {}) => ({
  id: 'tk-1', folio: 41, nombre: 'Mesa 4', abierta: '20:10:00',
  fecha: '2026-07-28', hora: '21:34:05',
  items: [cerveza({ cant: 2 })],
  pagos: [{
    fecha: '2026-07-28', hora: '21:34:00', monto: 8000, propina: 1000,
    metodo: 'efectivo', recibido: 10000, cambio: 1000,
  }],
  descuento: null, eventos: [], total: 8000,
  ...extra,
});

const conHistorial = (datos) => importarV1(datos, { conHistorial: true });

const unTicket = (folio) =>
  base().prepare('SELECT * FROM tickets WHERE folio = ?').get(folio);

const lineasDe = (cuentaId) =>
  base().prepare('SELECT * FROM lineas WHERE cuenta_id = ? ORDER BY id').all(cuentaId);

const cuantosMovimientos = () =>
  base().prepare('SELECT COUNT(*) AS n FROM movimientos_stock').get().n;

/* ── Lo de antes sigue igual ───────────────────────────────────────────── */

test('sin pedir el historial, las ventas NO entran (como hasta ahora)', () => {
  const informe = importarV1(respaldo({ tickets: [venta({ id: 'no-1', folio: 900 })] }));

  assert.equal(informe.historial, null);
  assert.equal(informe.sinImportar.tickets, 1);
  assert.equal(unTicket(900), undefined);
});

/* ── Una venta normal ──────────────────────────────────────────────────── */

test('una venta entra con sus totales recalculados con las reglas de la v2', () => {
  const informe = conHistorial(respaldo({ tickets: [venta()] }));

  assert.equal(informe.historial.ventas.nuevas, 1);

  const t = unTicket(41);
  assert.ok(t, 'el ticket tiene que existir');
  assert.equal(t.nombre, 'Mesa 4');
  assert.equal(t.fecha, '2026-07-28');
  assert.equal(t.bruto, 8000);
  assert.equal(t.cortesias, 0);
  assert.equal(t.consumo, 8000);
  assert.equal(t.descuento, 0);
  assert.equal(t.subtotal, 8000);
  assert.equal(t.articulos, 2);

  // El corazón del asunto: en la v1 el total del ticket era 8000 y la propina
  // vivía aparte, en el pago. En la v2 el total es lo que pagó el cliente.
  assert.equal(t.propina, 1000);
  assert.equal(t.total, 9000);

  // Y sin turno, porque la v1 no sabía de turnos.
  assert.equal(t.turno_id, null);
});

test('el pago importado liquida la cuenta: no queda debiendo la propina', () => {
  conHistorial(respaldo({ tickets: [venta({ id: 'tk-liq', folio: 42 })] }));

  const t = unTicket(42);
  const pagos = base().prepare('SELECT * FROM pagos WHERE cuenta_id = ?').all(t.cuenta_id);

  assert.equal(pagos.length, 1);
  assert.equal(pagos[0].monto, 9000, 'el monto del pago incluye la propina');
  assert.equal(pagos[0].recibido, 10000);
  assert.equal(pagos[0].cambio, 1000);
  assert.equal(pagos[0].monto - t.total, 0, 'lo pagado tiene que igualar al total');
});

test('la venta importada aparece en el corte de su día, no en el de hoy', () => {
  conHistorial(respaldo({ tickets: [venta({ id: 'tk-corte', folio: 43, fecha: '2026-07-20' })] }));

  const delDia = ticketsDelDia('2026-07-20');
  assert.ok(delDia.some((t) => t.folio === 43));
  assert.ok(!ticketsDelDia('2026-07-21').some((t) => t.folio === 43));
});

/* ── Cortesías y descuentos ────────────────────────────────────────────── */

test('una cortesía de la v1 conserva su valor y no se cobra', () => {
  conHistorial(respaldo({
    tickets: [venta({
      id: 'tk-cort', folio: 44,
      items: [
        cerveza({ cant: 1 }),
        cerveza({ nombre: 'Cerveza cortesía', precio: 0, precioOriginal: 4000, motivoCortesia: 'Cliente frecuente' }),
      ],
      pagos: [{ fecha: '2026-07-28', hora: '22:00:00', monto: 4000, propina: 0, metodo: 'efectivo' }],
    })],
  }));

  const t = unTicket(44);
  assert.equal(t.cortesias, 4000, 'la cortesía vale lo que costaba, no cero');
  assert.equal(t.consumo, 4000, 'pero no se cobra');
  assert.equal(t.bruto, 8000, 'y el bruto sí la incluye');
  assert.equal(t.total, 4000);

  const lineas = lineasDe(t.cuenta_id);
  const regalada = lineas.find((l) => l.cortesia === 1);
  assert.ok(regalada, 'la cortesía queda marcada como tal');
  assert.equal(regalada.precio, 4000, 'con su precio real, no en cero');
  assert.equal(regalada.cortesia_motivo, 'Cliente frecuente');
});

test('el descuento de la v1 se respeta y la propina va sobre el subtotal', () => {
  conHistorial(respaldo({
    tickets: [venta({
      id: 'tk-desc', folio: 45,
      items: [cerveza({ cant: 5 })],                    // 20000
      descuento: { monto: 2000, motivo: 'Amigo de la casa' },
      pagos: [{ fecha: '2026-07-28', hora: '23:00:00', monto: 18000, propina: 1800, metodo: 'tarjeta', digitos: '4321' }],
    })],
  }));

  const t = unTicket(45);
  assert.equal(t.consumo, 20000);
  assert.equal(t.descuento, 2000);
  assert.equal(t.subtotal, 18000);
  assert.equal(t.propina, 1800);
  assert.equal(t.total, 19800);

  const pago = base().prepare('SELECT * FROM pagos WHERE cuenta_id = ?').get(t.cuenta_id);
  assert.equal(pago.metodo, 'tarjeta');
  assert.match(pago.referencia, /4321/);
});

/* ── Reimportar ────────────────────────────────────────────────────────── */

test('importar dos veces el mismo respaldo no duplica ni una venta', () => {
  const archivo = respaldo({
    tickets: [venta({ id: 'tk-doble', folio: 60 })],
    cuentas: [{
      id: 'ct-doble', nombre: 'Mesa 9', creada: '19:00:00', fecha: '2026-07-28',
      items: [cerveza()], pagos: [], eventos: [],
    }],
  });

  const primera = conHistorial(archivo);
  assert.equal(primera.historial.ventas.nuevas, 1);
  assert.equal(primera.historial.cuentas.nuevas, 1);

  const segunda = conHistorial(archivo);
  assert.equal(segunda.historial.ventas.nuevas, 0);
  assert.equal(segunda.historial.ventas.repetidas, 1);
  assert.equal(segunda.historial.cuentas.nuevas, 0);
  assert.equal(segunda.historial.cuentas.repetidas, 1);

  const cuantos = base().prepare('SELECT COUNT(*) AS n FROM tickets WHERE folio = 60').get().n;
  assert.equal(cuantos, 1);
});

/* ── Folios ────────────────────────────────────────────────────────────── */

test('la numeración de tickets sigue donde la dejó la v1', () => {
  const informe = conHistorial(respaldo({ seq: 120, tickets: [venta({ id: 'tk-folio', folio: 119 })] }));

  // El siguiente folio de la v1 era el 120: si la v2 empezara en 1, los
  // folios chocarían con los importados y el corte dejaría de auditarse.
  assert.equal(informe.historial.folioSiguiente, 120);
});

test('un folio que ya usó una venta de la v2 no se pisa', () => {
  conHistorial(respaldo({ tickets: [venta({ id: 'tk-ocupa', folio: 200 })] }));
  const informe = conHistorial(respaldo({ tickets: [venta({ id: 'tk-otro', folio: 200 })] }));

  assert.equal(informe.historial.ventas.nuevas, 0);
  assert.equal(informe.historial.ventas.omitidas.length, 1);
  assert.match(informe.historial.ventas.omitidas[0].motivo, /ya lo usó/);
});

/* ── Mesas abiertas ────────────────────────────────────────────────────── */

test('una mesa abierta entra abierta, con lo que falta por cobrar', () => {
  const informe = conHistorial(respaldo({
    cuentas: [{
      id: 'ct-abierta', nombre: 'Mesa 12', creada: '20:00:00', fecha: '2026-07-28',
      items: [cerveza({ cant: 3 })],                      // 12000
      pagos: [{ fecha: '2026-07-28', hora: '20:30:00', monto: 5000, propina: 0, metodo: 'efectivo' }],
      eventos: [{ fecha: '2026-07-28', hora: '20:00:00', texto: 'Cuenta abierta' }],
    }],
  }));

  assert.equal(informe.historial.cuentas.nuevas, 1);
  assert.equal(informe.historial.dinero.porCobrar, 7000);

  const abierta = cuentasAbiertas().find((c) => c.nombre === 'Mesa 12');
  assert.ok(abierta, 'la mesa tiene que quedar abierta');
  assert.equal(abierta.totales.total, 12000);
  assert.equal(abierta.totales.pagado, 5000);
  assert.equal(abierta.totales.restante, 7000);
  assert.equal(abierta.items.length, 1);
});

test('si esa mesa ya estaba abierta en la v2, la que llega entra marcada', () => {
  const archivo = (id) => respaldo({
    cuentas: [{
      id, nombre: 'Mesa 30', creada: '21:00:00', fecha: '2026-07-28',
      items: [cerveza()], pagos: [], eventos: [],
    }],
  });

  conHistorial(archivo('ct-30a'));
  const informe = conHistorial(archivo('ct-30b'));

  assert.equal(informe.historial.cuentas.nuevas, 1);
  assert.deepEqual(informe.historial.cuentas.renombradas, [{ de: 'Mesa 30', a: 'Mesa 30 (v1)' }]);

  const nombres = cuentasAbiertas().map((c) => c.nombre);
  assert.ok(nombres.includes('Mesa 30'));
  assert.ok(nombres.includes('Mesa 30 (v1)'), 'ninguna de las dos se pierde');
});

test('los renglones de una mesa abierta se reenlazan con su producto', () => {
  conHistorial(respaldo({
    productos: [{ id: 'p-cerv', familia: 'Bebidas', nombre: 'Cerveza', icono: '🍺', precio: 4000 }],
    cuentas: [{
      id: 'ct-enlace', nombre: 'Mesa 44', creada: '20:00:00', fecha: '2026-07-28',
      items: [cerveza({ prodId: 'p-cerv' })], pagos: [], eventos: [],
    }],
  }));

  const cuenta = base().prepare(`SELECT id FROM cuentas WHERE id_v1 = 'ct-enlace'`).get();
  const linea = lineasDe(cuenta.id)[0];
  const producto = base().prepare(`SELECT id FROM productos WHERE id_v1 = 'p-cerv'`).get();

  assert.equal(linea.producto_id, producto.id,
    'sin esto el almacén no sabría de qué producto habla ese renglón');
});

/* ── El almacén ────────────────────────────────────────────────────────── */

test('importar el historial NO mueve el almacén', () => {
  const antes = cuantosMovimientos();

  conHistorial(respaldo({
    tickets: [venta({ id: 'tk-alm', folio: 300, items: [cerveza({ cant: 40 })] })],
  }));

  // Si estas 40 cervezas de julio descontaran del inventario de hoy, el
  // almacén quedaría en negativo y la lista de compras pediría de más
  // para siempre. Ya salieron del refrigerador en su día.
  assert.equal(cuantosMovimientos(), antes);
});

/* ── Archivos con algo roto ────────────────────────────────────────────── */

test('una venta con un renglón corrupto se omite ENTERA y se reporta', () => {
  const informe = conHistorial(respaldo({
    tickets: [venta({
      id: 'tk-roto', folio: 400,
      items: [cerveza(), cerveza({ precio: 'cuarenta pesos' })],
    })],
  }));

  assert.equal(informe.historial.ventas.nuevas, 0);
  assert.equal(unTicket(400), undefined, 'media venta no entra: el corte daría de menos');
  assert.match(informe.historial.ventas.omitidas[0].motivo, /corruptos/);
  assert.match(informe.historial.ventas.omitidas[0].etiqueta, /0400/);
});

test('una venta sin fecha o sin folio se omite, y las demás sí entran', () => {
  const informe = conHistorial(respaldo({
    tickets: [
      venta({ id: 'tk-sf', folio: 401, fecha: null }),
      venta({ id: 'tk-nf', folio: null }),
      venta({ id: 'tk-ok', folio: 402 }),
    ],
  }));

  assert.equal(informe.historial.ventas.nuevas, 1);
  assert.equal(informe.historial.ventas.omitidas.length, 2);
  assert.ok(unTicket(402), 'lo que sí está bien tiene que entrar');
});

test('un método de pago desconocido entra como efectivo, pero queda escrito', () => {
  conHistorial(respaldo({
    tickets: [venta({
      id: 'tk-metodo', folio: 403,
      pagos: [{ fecha: '2026-07-28', hora: '22:00:00', monto: 8000, propina: 0, metodo: 'vales' }],
    })],
  }));

  const t = unTicket(403);
  const pago = base().prepare('SELECT * FROM pagos WHERE cuenta_id = ?').get(t.cuenta_id);
  assert.equal(pago.metodo, 'efectivo', 'para que el efectivo contado siga cuadrando');
  assert.match(pago.referencia, /vales/, 'y para poder rastrearlo después');
});

/* ── La bitácora ───────────────────────────────────────────────────────── */

test('la bitácora de la v1 se conserva', () => {
  conHistorial(respaldo({
    tickets: [venta({
      id: 'tk-bit', folio: 500,
      eventos: [
        { fecha: '2026-07-28', hora: '20:10:00', texto: 'Cuenta abierta' },
        { fecha: '2026-07-28', hora: '21:00:00', texto: '❌ Cancelado 1 × Cerveza · se equivocó de mesa' },
      ],
    })],
    cancelaciones: [{
      fecha: '2026-07-28', hora: '21:00:00', cuenta: 'Mesa 4', icono: '🍺',
      nombre: 'Cerveza', detalle: '', cant: 1, importe: 4000, motivo: 'se equivocó de mesa',
    }],
  }));

  const t = unTicket(500);
  const bitacora = base().prepare(
    `SELECT * FROM eventos WHERE tipo = 'v1.bitacora' AND referencia = ?`
  ).all(String(t.cuenta_id));
  assert.equal(bitacora.length, 2);
  assert.match(JSON.parse(bitacora[0].detalle).texto, /Cuenta abierta/);

  const canceladas = base().prepare(
    `SELECT * FROM eventos WHERE tipo = 'v1.cancelacion'`
  ).all();
  assert.equal(canceladas.length, 1);
  assert.equal(JSON.parse(canceladas[0].detalle).importe, 4000);
});

/* ── Poder verlo ───────────────────────────────────────────────────────── */

test('el resumen del día enseña lo importado y suma igual que la v1', () => {
  const dia = '2026-06-15';
  conHistorial(respaldo({
    tickets: [
      venta({ id: 'tk-d1', folio: 700, fecha: dia, items: [cerveza({ cant: 2 })],
              pagos: [{ fecha: dia, hora: '21:00:00', monto: 8000, propina: 1000, metodo: 'efectivo' }] }),
      venta({ id: 'tk-d2', folio: 701, fecha: dia, nombre: 'Barra 1', items: [cerveza()],
              pagos: [{ fecha: dia, hora: '22:00:00', monto: 4000, propina: 0, metodo: 'tarjeta' }] }),
    ],
  }));

  const r = resumenDelDia(dia);

  assert.equal(r.ventas, 2);
  assert.equal(r.totales.consumo, 12000);
  assert.equal(r.totales.propina, 1000);
  assert.equal(r.totales.total, 13000);
  assert.equal(r.totales.articulos, 3);
  assert.equal(r.porMetodo.efectivo, 9000);
  assert.equal(r.porMetodo.tarjeta, 4000);

  // Sin esta marca, en pantalla no habría forma de distinguir lo que se
  // importó de lo que se cobró en la v2.
  assert.ok(r.tickets.every((t) => t.importado));
});

test('el resumen de un día sin ventas no truena', () => {
  const r = resumenDelDia('2020-01-01');
  assert.equal(r.ventas, 0);
  assert.equal(r.totales.total, 0);
  assert.deepEqual(r.tickets, []);
});

/* ── Todo o nada ───────────────────────────────────────────────────────── */

test('si el archivo no es un respaldo, no entra nada de nada', () => {
  const antesTickets = base().prepare('SELECT COUNT(*) AS n FROM tickets').get().n;
  assert.throws(() => conHistorial({ cualquier: 'cosa' }), /no parece un respaldo/);
  assert.equal(base().prepare('SELECT COUNT(*) AS n FROM tickets').get().n, antesTickets);
});
