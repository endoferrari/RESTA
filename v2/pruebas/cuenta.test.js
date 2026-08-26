/**
 * PRUEBAS · CUENTA
 * ─────────────────────────────────────────────────────────────────────────────
 * Los casos que dan miedo cobrar mal.
 *
 * Cada prueba de aquí es una situación que de verdad pasa en la barra un
 * sábado. Si algún día tocamos el cálculo y rompemos alguna, `npm test`
 * lo dice antes de instalar.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularCuenta, calcularDescuento, calcularPropina,
  dividirRestante, revisarCobro, calcularCambio,
  importeLinea, importeSeleccion, totalDeSeleccion,
} from '../nucleo/cuenta.js';
import { sumar } from '../nucleo/dinero.js';

/* ── Ayuda para escribir las pruebas más cortas ────────────────────────── */
let n = 0;
const linea = (nombre, precio, cant = 1, extra = {}) =>
  ({ id: 'l' + (++n), nombre, precio, cant, ...extra });

/* ── Lo básico ─────────────────────────────────────────────────────────── */

test('cuenta vacía da todo en cero', () => {
  const c = calcularCuenta({ items: [] });
  assert.equal(c.total, 0);
  assert.equal(c.restante, 0);
  assert.equal(c.articulos, 0);
  assert.equal(c.liquidada, true);
});

test('una cuenta simple suma bien', () => {
  const c = calcularCuenta({
    items: [linea('Cerveza', 4500, 3), linea('Tacos', 7500, 1)],
  });
  assert.equal(c.consumo, 21000);   // 3×45 + 75 = $210
  assert.equal(c.total, 21000);
  assert.equal(c.articulos, 4);
});

test('el importe de una línea respeta la cantidad', () => {
  assert.equal(importeLinea({ precio: 4500, cant: 3 }), 13500);
  assert.equal(importeLinea({ precio: 4500, cant: 0 }), 0);
});

/* ── Cortesías ─────────────────────────────────────────────────────────── */

test('una cortesía no se cobra pero sí se registra', () => {
  const c = calcularCuenta({
    items: [
      linea('Cerveza', 4500, 2),
      linea('Michelada', 7000, 1, { cortesia: true }),
    ],
  });
  assert.equal(c.bruto, 16000);     // lo que se consumió de verdad
  assert.equal(c.cortesias, 7000);  // lo que se regaló
  assert.equal(c.consumo, 9000);    // lo que se cobra
  assert.equal(c.total, 9000);
});

test('si todo es cortesía, la cuenta es cero', () => {
  const c = calcularCuenta({
    items: [linea('Cerveza', 4500, 2, { cortesia: true })],
  });
  assert.equal(c.total, 0);
  assert.equal(c.cortesias, 9000);
  assert.equal(c.liquidada, true);
});

/* ── Descuentos ────────────────────────────────────────────────────────── */

test('descuento por porcentaje', () => {
  assert.equal(calcularDescuento(20000, { tipo: 'porcentaje', valor: 15 }), 3000);
  assert.equal(calcularDescuento(20000, { tipo: 'porcentaje', valor: 0 }), 0);
});

test('descuento por cantidad fija', () => {
  assert.equal(calcularDescuento(20000, { tipo: 'monto', valor: 5000 }), 5000);
});

test('el descuento NUNCA deja la cuenta en negativo', () => {
  // Alguien teclea $500 de descuento en una cuenta de $200
  assert.equal(calcularDescuento(20000, { tipo: 'monto', valor: 50000 }), 20000);
  assert.equal(calcularDescuento(20000, { tipo: 'porcentaje', valor: 150 }), 20000);
});

test('un descuento raro no cobra de más', () => {
  assert.equal(calcularDescuento(20000, { tipo: 'monto', valor: -500 }), 0);
  assert.equal(calcularDescuento(20000, { tipo: 'loquesea', valor: 10 }), 0);
  assert.equal(calcularDescuento(20000, null), 0);
});

/* ── Propinas ──────────────────────────────────────────────────────────── */

test('propina por porcentaje y por cantidad', () => {
  assert.equal(calcularPropina(20000, { tipo: 'porcentaje', valor: 10 }), 2000);
  assert.equal(calcularPropina(20000, { tipo: 'monto', valor: 3000 }), 3000);
  assert.equal(calcularPropina(20000, null), 0);
});

test('la propina se calcula sobre el subtotal, NO sobre el bruto', () => {
  // Esto es la decisión más discutible del cálculo, así que queda probada:
  // si le regalaste una michelada al cliente, no le cobras propina por ella.
  const c = calcularCuenta({
    items: [
      linea('Carne asada', 18000, 1),
      linea('Michelada', 7000, 1, { cortesia: true }),
    ],
    propina: { tipo: 'porcentaje', valor: 10 },
  });
  assert.equal(c.consumo, 18000);
  assert.equal(c.propina, 1800);   // 10% de 180, no de 250
  assert.equal(c.total, 19800);
});

test('descuento y propina juntos, en el orden correcto', () => {
  const c = calcularCuenta({
    items: [linea('Consumo', 100000, 1)],           // $1,000
    descuento: { tipo: 'porcentaje', valor: 20 },   // −$200
    propina:   { tipo: 'porcentaje', valor: 10 },   // 10% de $800 = $80
  });
  assert.equal(c.descuento, 20000);
  assert.equal(c.subtotal, 80000);
  assert.equal(c.propina, 8000);    // 8000, no 10000
  assert.equal(c.total, 88000);
});

/* ── Pagos parciales ───────────────────────────────────────────────────── */

test('un pago parcial deja el restante correcto', () => {
  const cuenta = {
    items: [linea('Consumo', 30000, 1)],
    pagos: [{ monto: 10000 }],
  };
  const c = calcularCuenta(cuenta);
  assert.equal(c.pagado, 10000);
  assert.equal(c.restante, 20000);
  assert.equal(c.liquidada, false);
  assert.equal(c.tienePagoParcial, true);
});

test('varios pagos hasta liquidar exacto', () => {
  const c = calcularCuenta({
    items: [linea('Consumo', 30000, 1)],
    pagos: [{ monto: 10000 }, { monto: 15000 }, { monto: 5000 }],
  });
  assert.equal(c.restante, 0);
  assert.equal(c.liquidada, true);
  assert.equal(c.tienePagoParcial, false);
});

/* ── Cobrar: lo que pasa en la caja ────────────────────────────────────── */

test('cobrar más de lo que falta se ajusta solo', () => {
  const cuenta = { items: [linea('Consumo', 30000, 1)], pagos: [{ monto: 25000 }] };
  const r = revisarCobro(cuenta, 10000);   // faltan 5000
  assert.equal(r.valido, true);
  assert.equal(r.monto, 5000);
  assert.equal(r.ajustado, true);
});

test('no se puede cobrar cero ni negativo', () => {
  const cuenta = { items: [linea('Consumo', 30000, 1)] };
  assert.equal(revisarCobro(cuenta, 0).valido, false);
  assert.equal(revisarCobro(cuenta, -100).valido, false);
  assert.equal(revisarCobro(cuenta, 45.5).valido, false);
});

test('no se puede cobrar una cuenta ya pagada', () => {
  const cuenta = { items: [linea('Consumo', 30000, 1)], pagos: [{ monto: 30000 }] };
  const r = revisarCobro(cuenta, 5000);
  assert.equal(r.valido, false);
  assert.match(r.motivo, /ya está pagada/);
});

/* ── El cambio ─────────────────────────────────────────────────────────── */

test('calcula el cambio de un billete', () => {
  assert.deepEqual(calcularCambio(38500, 50000), { valido: true, cambio: 11500, motivo: null });
  assert.deepEqual(calcularCambio(38500, 38500), { valido: true, cambio: 0, motivo: null });
});

test('pago exacto: si no dicen con cuánto pagan, no hay cambio', () => {
  assert.deepEqual(calcularCambio(38500, null), { valido: true, cambio: 0, motivo: null });
});

test('avisa si el cliente dio menos', () => {
  const r = calcularCambio(38500, 20000);
  assert.equal(r.valido, false);
  assert.match(r.motivo, /menos de lo que se cobra/);
});

/* ── Dividir entre personas ────────────────────────────────────────────── */

test('divide lo que falta sin perder centavos', () => {
  const cuenta = { items: [linea('Consumo', 10000, 1)] };
  const partes = dividirRestante(cuenta, 3);
  assert.deepEqual(partes, [3334, 3333, 3333]);
  assert.equal(sumar(partes), 10000);
});

test('divide sólo lo que falta, no el total', () => {
  const cuenta = { items: [linea('Consumo', 10000, 1)], pagos: [{ monto: 4000 }] };
  const partes = dividirRestante(cuenta, 2);
  assert.deepEqual(partes, [3000, 3000]);
});

/* ── "Cada quien lo suyo" ──────────────────────────────────────────────── */

test('suma sólo los productos elegidos', () => {
  const a = linea('Cerveza', 4500, 2);      // 9000
  const b = linea('Tacos', 7500, 1);        // 7500
  const c = linea('Refresco', 3000, 1);     // 3000
  assert.equal(importeSeleccion([a, b, c], [a.id, c.id]), 12000);
  assert.equal(importeSeleccion([a, b, c], new Set([b.id])), 7500);
  assert.equal(importeSeleccion([a, b, c], []), 0);
});

test('una cortesía no se puede seleccionar para cobrar', () => {
  const a = linea('Cerveza', 4500, 2);
  const b = linea('Postre', 4000, 1, { cortesia: true });
  assert.equal(importeSeleccion([a, b], [a.id, b.id]), 9000);
});

test('pagar por partes con descuento SIGUE cuadrando con el total', () => {
  // El caso que descuadra las cajas: cuenta con 20% de descuento que se
  // paga producto por producto. Si el descuento no se reparte, la suma
  // de los pagos no da el total.
  const a = linea('Carne asada', 18000, 1);
  const b = linea('Cerveza', 4500, 2);       // 9000
  const c = linea('Postre', 3000, 1);
  const cuenta = {
    items: [a, b, c],
    descuento: { tipo: 'porcentaje', valor: 20 },
  };

  const { total, consumo } = calcularCuenta(cuenta);
  assert.equal(consumo, 30000);
  assert.equal(total, 24000);                // $300 − 20% = $240

  const parte1 = totalDeSeleccion(cuenta, [a.id]);        // 18000 − 20%
  const parte2 = totalDeSeleccion(cuenta, [b.id, c.id]);  // 12000 − 20%
  assert.equal(parte1, 14400);
  assert.equal(parte2, 9600);
  assert.equal(parte1 + parte2, total);      // ← cuadra exacto
});

test('elegir todos los productos da exactamente el total', () => {
  const a = linea('Uno', 3333, 1);
  const b = linea('Dos', 6667, 1);
  const cuenta = {
    items: [a, b],
    descuento: { tipo: 'porcentaje', valor: 13 },
    propina: { tipo: 'porcentaje', valor: 7 },
  };
  const { total } = calcularCuenta(cuenta);
  assert.equal(totalDeSeleccion(cuenta, [a.id, b.id]), total);
});

/* ── El caso completo, como en la barra ────────────────────────────────── */

test('sábado en ONCE: consumo, cortesía, descuento, propina y pago mixto', () => {
  const cuenta = {
    items: [
      linea('Carne asada', 18000, 2),                    // 36000
      linea('Cerveza', 4500, 6),                         // 27000
      linea('Guacamole', 6500, 1),                       //  6500
      linea('Michelada', 7000, 1, { cortesia: true }),   //  regalada
    ],
    descuento: { tipo: 'porcentaje', valor: 10 },
    propina:   { tipo: 'porcentaje', valor: 15 },
    pagos: [],
  };

  let c = calcularCuenta(cuenta);
  assert.equal(c.bruto, 76500);       // $765.00 consumido
  assert.equal(c.cortesias, 7000);    // $70.00 de cortesía
  assert.equal(c.consumo, 69500);     // $695.00 cobrable
  assert.equal(c.descuento, 6950);    // −$69.50
  assert.equal(c.subtotal, 62550);    // $625.50
  assert.equal(c.propina, 9383);      // $93.83 (15% del subtotal)
  assert.equal(c.total, 71933);       // $719.33
  assert.equal(c.articulos, 10);

  // Pagan $400 con tarjeta y el resto en efectivo con un billete de $500
  cuenta.pagos.push({ monto: 40000 });
  c = calcularCuenta(cuenta);
  assert.equal(c.restante, 31933);
  assert.equal(c.tienePagoParcial, true);

  const cobro = revisarCobro(cuenta, 31933);
  assert.equal(cobro.monto, 31933);

  const cambio = calcularCambio(cobro.monto, 50000);
  assert.equal(cambio.cambio, 18067);   // $180.67 de cambio

  cuenta.pagos.push({ monto: cobro.monto });
  c = calcularCuenta(cuenta);
  assert.equal(c.restante, 0);
  assert.equal(c.liquidada, true);
});
