/**
 * PRUEBAS · DINERO
 * ─────────────────────────────────────────────────────────────────────────────
 * Se corren con:   npm test
 *
 * Cada `test` de aquí es un caso real que podría pasar en la caja del bar.
 * Si algún día tocamos el cálculo de dinero y rompemos algo, estas pruebas
 * fallan ANTES de instalar, no cuando un cliente reclame.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aCentavos, formatear, formatearSeco, sumar,
  porcentaje, repartir, esValido, redondear,
} from '../nucleo/dinero.js';

/* ── Leer lo que teclea la persona ─────────────────────────────────────── */

test('lee precios escritos de forma normal', () => {
  assert.equal(aCentavos('45.50'), 4550);
  assert.equal(aCentavos('45'), 4500);
  assert.equal(aCentavos('0.50'), 50);
  assert.equal(aCentavos('.5'), 50);
  assert.equal(aCentavos('120.00'), 12000);
});

test('perdona el signo de pesos, las comas y los espacios', () => {
  assert.equal(aCentavos('$45.50'), 4550);
  assert.equal(aCentavos(' 45.50 '), 4550);
  assert.equal(aCentavos('1,250.00'), 125000);
  assert.equal(aCentavos('$ 1,250 '), 125000);
});

test('acepta también números, no sólo texto', () => {
  assert.equal(aCentavos(45.5), 4550);
  assert.equal(aCentavos(0), 0);
});

test('rechaza lo que no es dinero', () => {
  assert.equal(aCentavos(''), null);
  assert.equal(aCentavos('   '), null);
  assert.equal(aCentavos('abc'), null);
  assert.equal(aCentavos('45.50.20'), null);
  assert.equal(aCentavos('-10'), null);
  assert.equal(aCentavos(null), null);
  assert.equal(aCentavos(undefined), null);
  assert.equal(aCentavos(NaN), null);
  assert.equal(aCentavos(Infinity), null);
});

test('rechaza cantidades absurdas (error de captura)', () => {
  assert.equal(aCentavos('99999999'), null); // más de un millón de pesos
});

test('el clásico 0.1 + 0.2 no nos rompe', () => {
  // Este es EL motivo de trabajar en centavos enteros.
  assert.notEqual(0.1 + 0.2, 0.3);            // así se comporta JavaScript
  assert.equal(aCentavos('0.1') + aCentavos('0.2'), 30); // así se comporta RESTA
});

test('precios con decimal medio no se pierden', () => {
  // 1.005 * 100 = 100.49999999999999 en JavaScript puro
  assert.equal(aCentavos('1.005'), 101);
  assert.equal(redondear(100.49999999999999), 100);
});

/* ── Mostrar el dinero ─────────────────────────────────────────────────── */

test('formatea para pantalla', () => {
  assert.equal(formatear(4550), '$45.50');
  assert.equal(formatear(0), '$0.00');
  assert.equal(formatear(125000), '$1,250.00');
  assert.equal(formatear(null), '$0.00');
});

test('formatea seco para el ticket térmico', () => {
  assert.equal(formatearSeco(4550), '45.50');
  assert.equal(formatearSeco(0), '0.00');
  assert.equal(formatearSeco(125000), '1250.00');
});

/* ── Sumas y porcentajes ───────────────────────────────────────────────── */

test('suma una comanda completa', () => {
  // 2 cervezas de $45 + 1 orden de tacos de $75 + 1 refresco de $30
  assert.equal(sumar([4500, 4500, 7500, 3000]), 19500);
  assert.equal(sumar([]), 0);
});

test('calcula propinas y descuentos', () => {
  assert.equal(porcentaje(19500, 10), 1950);  // propina 10%
  assert.equal(porcentaje(19500, 15), 2925);  // propina 15%
  assert.equal(porcentaje(10000, 0), 0);
  assert.equal(porcentaje(3333, 10), 333);    // redondea a centavo entero
});

test('un porcentaje inválido no cobra de más', () => {
  assert.equal(porcentaje(10000, -5), 0);
  assert.equal(porcentaje(10000, NaN), 0);
});

/* ── Dividir la cuenta: donde más se pierde dinero ─────────────────────── */

test('$100 entre 3 no pierde el centavo', () => {
  const partes = repartir(10000, 3);
  assert.deepEqual(partes, [3334, 3333, 3333]);
  assert.equal(sumar(partes), 10000); // <- lo importante: cuadra exacto
});

test('divisiones exactas quedan parejas', () => {
  assert.deepEqual(repartir(10000, 2), [5000, 5000]);
  assert.deepEqual(repartir(9000, 3), [3000, 3000, 3000]);
});

test('cualquier división entre 2 y 20 siempre cuadra', () => {
  for (let personas = 2; personas <= 20; personas++) {
    for (const monto of [1, 7, 99, 4550, 19500, 123457]) {
      const partes = repartir(monto, personas);
      assert.equal(sumar(partes), monto,
        `falló repartiendo ${monto} entre ${personas}`);
      assert.equal(partes.length, personas);
    }
  }
});

test('dividir entre una persona devuelve todo', () => {
  assert.deepEqual(repartir(4550, 1), [4550]);
  assert.deepEqual(repartir(4550, 0), [4550]);
});

/* ── Validación antes de guardar ───────────────────────────────────────── */

test('sólo deja guardar cantidades sanas', () => {
  assert.equal(esValido(4550), true);
  assert.equal(esValido(0), true);
  assert.equal(esValido(-1), false);
  assert.equal(esValido(45.5), false);      // decimales: nunca
  assert.equal(esValido('4550'), false);    // texto: nunca
  assert.equal(esValido(999_999_999), false);
});

/* ── Caso completo, como en la barra ───────────────────────────────────── */

test('cuenta real: consumo + descuento + propina, dividida entre 3', () => {
  const consumo = sumar([
    4500, 4500, 4500,  // 3 cervezas
    18000,             // 1 carne asada
    7000,              // 1 michelada
  ]);
  assert.equal(consumo, 38500);              // $385.00

  const descuento = porcentaje(consumo, 15); // 15% de cortesía
  assert.equal(descuento, 5775);             // $57.75

  const subtotal = consumo - descuento;
  assert.equal(subtotal, 32725);             // $327.25

  const propina = porcentaje(subtotal, 10);
  assert.equal(propina, 3273);               // $32.73 (redondeado al centavo)

  const total = subtotal + propina;
  assert.equal(total, 35998);                // $359.98
  assert.equal(formatear(total), '$359.98');

  const partes = repartir(total, 3);
  assert.deepEqual(partes, [12000, 11999, 11999]);
  assert.equal(sumar(partes), total);        // la caja cuadra al centavo
});
