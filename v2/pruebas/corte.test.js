/**
 * PRUEBAS · CORTE DE CAJA
 * ─────────────────────────────────────────────────────────────────────────────
 * Se corren con:   npm test
 *
 * El corte es el momento en que se descubre si falta dinero. Si estas cuentas
 * están mal, o se acusa a alguien injustamente, o se deja pasar un faltante.
 * Por eso cada caso de aquí es una noche real del bar.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularCorte, loMasVendido, resumirCorte } from '../nucleo/corte.js';

/** Un ticket como el que guarda la base, con lo mínimo que usa el corte. */
const tk = ({ total, consumo = total, cortesias = 0, descuento = 0, propina = 0,
              articulos = 1, pagos = [], anulado = false }) => ({
  anulado,
  totales: { consumo, cortesias, descuento, propina, total, articulos },
  pagos,
});

const efectivo = (monto, cambio = 0) => ({ metodo: 'efectivo', monto, cambio });
const tarjeta  = (monto) => ({ metodo: 'tarjeta', monto, cambio: 0 });

/* ── Una noche tranquila ───────────────────────────────────────────────── */

test('la caja cuadra cuando lo contado es el fondo más lo cobrado en efectivo', () => {
  const corte = calcularCorte({
    fondo: 50000,                                   // $500 de fondo
    tickets: [
      tk({ total: 20000, pagos: [efectivo(20000)] }),
      tk({ total: 15000, pagos: [efectivo(15000)] }),
    ],
    efectivoContado: 85000,                         // 500 + 200 + 150
  });

  assert.equal(corte.efectivoEsperado, 85000);
  assert.equal(corte.diferencia, 0);
  assert.equal(corte.cuadra, true);
  assert.equal(corte.falta, false);
});

test('el cambio entregado NO se resta: ya está descontado del monto', () => {
  // El cliente pagó $150 con un billete de $200. Entraron 200, salieron 50.
  // En el cajón quedan 150, que es lo que dice `monto`.
  const corte = calcularCorte({
    fondo: 0,
    tickets: [tk({ total: 15000, pagos: [efectivo(15000, 5000)] })],
    efectivoContado: 15000,
  });

  assert.equal(corte.efectivoEsperado, 15000);
  assert.equal(corte.cambioEntregado, 5000, 'se guarda aparte, sólo para saberlo');
  assert.equal(corte.diferencia, 0);
});

/* ── Cuando falta dinero ───────────────────────────────────────────────── */

test('si falta dinero lo dice claro y con cuánto', () => {
  const corte = calcularCorte({
    fondo: 50000,
    tickets: [tk({ total: 30000, pagos: [efectivo(30000)] })],
    efectivoContado: 79000,                          // deberían ser 80000
  });

  assert.equal(corte.diferencia, -1000);
  assert.equal(corte.falta, true);
  assert.equal(corte.cuadra, false);
  assert.match(resumirCorte(corte).join(' '), /FALTAN 10\.00/);
});

test('si sobra dinero también lo dice: puede ser un cobro sin registrar', () => {
  const corte = calcularCorte({
    fondo: 0,
    tickets: [tk({ total: 10000, pagos: [efectivo(10000)] })],
    efectivoContado: 12000,
  });

  assert.equal(corte.diferencia, 2000);
  assert.equal(corte.falta, false);
  assert.match(resumirCorte(corte).join(' '), /SOBRAN 20\.00/);
});

test('mientras no se cuente el efectivo, no se opina', () => {
  const corte = calcularCorte({
    fondo: 50000,
    tickets: [tk({ total: 10000, pagos: [efectivo(10000)] })],
  });

  assert.equal(corte.efectivoContado, null);
  assert.equal(corte.diferencia, null);
  assert.equal(corte.cuadra, null);
  assert.match(resumirCorte(corte).join(' '), /Falta contar el efectivo/);
});

/* ── Cómo pagó la gente ────────────────────────────────────────────────── */

test('la tarjeta NO cuenta para el efectivo del cajón', () => {
  const corte = calcularCorte({
    fondo: 50000,
    tickets: [
      tk({ total: 30000, pagos: [tarjeta(30000)] }),
      tk({ total: 10000, pagos: [efectivo(10000)] }),
    ],
    efectivoContado: 60000,                          // 500 de fondo + 100 en efectivo
  });

  assert.equal(corte.porMetodo.tarjeta, 30000);
  assert.equal(corte.porMetodo.efectivo, 10000);
  assert.equal(corte.efectivoEsperado, 60000);
  assert.equal(corte.diferencia, 0, 'la tarjeta no pasa por el cajón');
});

test('una cuenta pagada mitad y mitad se reparte entre los dos métodos', () => {
  const corte = calcularCorte({
    tickets: [tk({ total: 20000, pagos: [efectivo(12000), tarjeta(8000)] })],
  });

  assert.equal(corte.porMetodo.efectivo, 12000);
  assert.equal(corte.porMetodo.tarjeta, 8000);
  assert.equal(corte.total, 20000);
});

/* ── Los tickets anulados ──────────────────────────────────────────────── */

test('un ticket anulado no suma dinero, pero sí se reporta', () => {
  const corte = calcularCorte({
    tickets: [
      tk({ total: 10000, pagos: [efectivo(10000)] }),
      tk({ total: 99900, pagos: [efectivo(99900)], anulado: true }),
    ],
    efectivoContado: 10000,
  });

  assert.equal(corte.tickets, 1);
  assert.equal(corte.anulados, 1);
  assert.equal(corte.total, 10000);
  assert.equal(corte.porMetodo.efectivo, 10000);
  assert.equal(corte.diferencia, 0);
  assert.match(resumirCorte(corte).join(' '), /1 ticket\(s\) anulado/);
});

/* ── Lo que no se cobró ────────────────────────────────────────────────── */

test('las cortesías y los descuentos se reportan aparte', () => {
  const corte = calcularCorte({
    tickets: [
      tk({ total: 18000, consumo: 20000, cortesias: 5000, descuento: 2000, propina: 0, articulos: 6,
           pagos: [efectivo(18000)] }),
    ],
  });

  assert.equal(corte.cortesias, 5000);
  assert.equal(corte.descuento, 2000);
  assert.equal(corte.consumo, 20000);
  assert.equal(corte.articulos, 6);
});

test('las cuentas canceladas se cuentan con su monto', () => {
  const corte = calcularCorte({
    tickets: [tk({ total: 10000, pagos: [efectivo(10000)] })],
    cancelados: [
      { nombre: 'Mesa 3', motivo: 'se fueron sin pagar', total: 45000, usuario: 'Caja' },
      { nombre: 'Mesa 9', motivo: 'se anotó mal', total: 5000, usuario: 'Caja' },
    ],
  });

  assert.equal(corte.canceladas.cuantas, 2);
  assert.equal(corte.canceladas.monto, 50000);
  assert.match(resumirCorte(corte).join(' '), /2 cuenta\(s\) cancelada\(s\) por 500\.00/);
});

/* ── Lo más vendido ────────────────────────────────────────────────────── */

test('lo más vendido se ordena por piezas, no por dinero', () => {
  const top = loMasVendido([
    { nombre: 'Cerveza', cant: 40, precio: 4000, cortesia: false },
    { nombre: 'Whisky Chivas', cant: 3, precio: 15000, cortesia: false },
    { nombre: 'Papas', cant: 12, precio: 2500, cortesia: false },
  ]);

  assert.deepEqual(top.map((p) => p.nombre), ['Cerveza', 'Papas', 'Whisky Chivas']);
  assert.equal(top[0].piezas, 40);
  assert.equal(top[0].importe, 160000);
});

test('lo más vendido junta los renglones del mismo producto', () => {
  const top = loMasVendido([
    { nombre: 'Cerveza', cant: 2, precio: 4000, cortesia: false },
    { nombre: 'Cerveza', cant: 3, precio: 4000, cortesia: false },
    { nombre: 'Cerveza', cant: 1, precio: 4500, cortesia: false },
  ]);

  assert.equal(top.length, 1);
  assert.equal(top[0].piezas, 6);
  assert.equal(top[0].importe, 2 * 4000 + 3 * 4000 + 4500);
});

test('lo regalado se cuenta en piezas pero no en dinero', () => {
  const top = loMasVendido([
    { nombre: 'Cerveza', cant: 5, precio: 4000, cortesia: false },
    { nombre: 'Cerveza', cant: 2, precio: 4000, cortesia: true },
  ]);

  assert.equal(top[0].piezas, 7);
  assert.equal(top[0].regaladas, 2);
  assert.equal(top[0].importe, 20000, 'las regaladas no entran al importe');
});

test('lo más vendido se corta en los que se le pidan', () => {
  const lineas = Array.from({ length: 20 }, (_, i) =>
    ({ nombre: `Producto ${i}`, cant: 20 - i, precio: 1000, cortesia: false }));

  assert.equal(loMasVendido(lineas, 5).length, 5);
  assert.equal(loMasVendido(lineas, 5)[0].nombre, 'Producto 0');
});

/* ── Un turno vacío ────────────────────────────────────────────────────── */

test('un turno sin ventas no truena y el fondo sigue ahí', () => {
  const corte = calcularCorte({ fondo: 50000, efectivoContado: 50000 });

  assert.equal(corte.tickets, 0);
  assert.equal(corte.total, 0);
  assert.equal(corte.efectivoEsperado, 50000);
  assert.equal(corte.diferencia, 0);
  assert.equal(loMasVendido([]).length, 0);
});

/* ── Una noche completa ────────────────────────────────────────────────── */

test('noche completa: efectivo, tarjeta, cortesía, descuento, cancelación y anulado', () => {
  const corte = calcularCorte({
    fondo: 100000,                                   // $1,000 de fondo
    tickets: [
      tk({ total: 22770, consumo: 23000, cortesias: 7000, descuento: 2300, propina: 2070,
           articulos: 4, pagos: [efectivo(12770, 7230), tarjeta(10000)] }),
      tk({ total: 8000, consumo: 8000, articulos: 2, pagos: [efectivo(8000, 2000)] }),
      tk({ total: 50000, articulos: 1, pagos: [efectivo(50000)], anulado: true }),
    ],
    cancelados: [{ nombre: 'Mesa 3', motivo: 'se fueron', total: 12000, usuario: 'Caja' }],
    efectivoContado: 120770,                         // 100000 + 12770 + 8000
  });

  assert.equal(corte.tickets, 2);
  assert.equal(corte.anulados, 1);
  assert.equal(corte.total, 30770);
  assert.equal(corte.porMetodo.efectivo, 20770);
  assert.equal(corte.porMetodo.tarjeta, 10000);
  assert.equal(corte.cambioEntregado, 9230);
  assert.equal(corte.efectivoEsperado, 120770);
  assert.equal(corte.diferencia, 0, 'la caja tiene que cuadrar exacto');
  assert.equal(corte.cortesias, 7000);
  assert.equal(corte.canceladas.monto, 12000);
});

test('la lista completa no se corta, la del papel sí', () => {
  // La pantalla enseña TODO lo que se vendió —para el pedido al proveedor y
  // para contestar «¿cuántas alitas salieron?»—, pero el ticket del corte
  // lleva sólo los diez primeros: el rollo cuesta.
  const lineas = Array.from({ length: 25 }, (_, i) => ({
    nombre: `Producto ${i}`, cant: 25 - i, precio: 1000, cortesia: false,
  }));

  assert.equal(loMasVendido(lineas, Infinity).length, 25);
  assert.equal(loMasVendido(lineas, 10).length, 10);

  // Y los diez del papel son de verdad los diez de arriba de la lista larga
  const todos = loMasVendido(lineas, Infinity);
  assert.deepEqual(loMasVendido(lineas, 10), todos.slice(0, 10));
});

test('lo regalado se cuenta aparte y no suma dinero', () => {
  // Si las cortesías sumaran importe, el corte diría que entró dinero que
  // nunca entró.
  const top = loMasVendido([
    { nombre: 'Cerveza', cant: 8, precio: 4000, cortesia: false },
    { nombre: 'Cerveza', cant: 2, precio: 4000, cortesia: true },
  ], Infinity);

  assert.equal(top[0].piezas, 10);        // salieron 10 del refrigerador
  assert.equal(top[0].regaladas, 2);
  assert.equal(top[0].importe, 8 * 4000); // pero sólo se cobraron 8
});
