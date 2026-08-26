/**
 * PRUEBAS · COMPARAR VERSIONES
 * ─────────────────────────────────────────────────────────────────────────────
 * Esto decide si al bar se le ofrece actualizar. Equivocarse tiene dos
 * formas de doler:
 *
 *  · Decir que hay algo nuevo cuando no lo hay → alguien reinstala un
 *    sábado por gusto y el punto de venta se queda abajo un rato.
 *  · Decir que no hay nada cuando sí → el arreglo que se acaba de publicar
 *    nunca llega.
 *
 * Comparar «2.0.10» con «2.0.9» como texto da lo contrario de lo correcto,
 * que es justo el error clásico. Por eso se compara número por número.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { esMasNueva } from '../servidor/actualizaciones.js';

test('una versión mayor es más nueva', () => {
  assert.equal(esMasNueva('2.1.0', '2.0.0'), true);
  assert.equal(esMasNueva('3.0.0', '2.9.9'), true);
});

test('la misma versión no es más nueva', () => {
  assert.equal(esMasNueva('2.0.0', '2.0.0'), false);
});

test('una versión vieja nunca se ofrece', () => {
  // Ofrecer la 1.3.0 a quien ya tiene la 2.0.0 sería devolverle el bar al
  // sistema que estamos reemplazando.
  assert.equal(esMasNueva('1.3.0', '2.0.0'), false);
  assert.equal(esMasNueva('2.0.0', '2.0.1'), false);
});

test('la 2.0.10 es más nueva que la 2.0.9, no al revés', () => {
  // Comparando como texto, «2.0.10» < «2.0.9» porque «1» va antes que «9».
  // Ése es el error clásico y aquí no pasa.
  assert.equal(esMasNueva('2.0.10', '2.0.9'), true);
  assert.equal(esMasNueva('2.0.9', '2.0.10'), false);
});

test('la «v» de las etiquetas de GitHub no estorba', () => {
  // Las publicaciones se etiquetan «v2.1.0», no «2.1.0».
  assert.equal(esMasNueva('v2.1.0', '2.0.0'), true);
  assert.equal(esMasNueva('v2.0.0', 'v2.0.0'), false);
});

test('una beta no se le ofrece a un bar que está trabajando', () => {
  // «2.1.0-beta» no cuenta como más nueva que «2.1.0»: los sufijos se
  // ignoran, así que quedan iguales y no se ofrece nada.
  assert.equal(esMasNueva('2.1.0-beta', '2.1.0'), false);
  assert.equal(esMasNueva('2.0.0', '2.0.0-fase6'), false);
});

test('faltar un número cuenta como cero', () => {
  assert.equal(esMasNueva('2.1', '2.0.5'), true);
  assert.equal(esMasNueva('2', '2.0.0'), false);
});

test('una etiqueta que no se entiende no ofrece nada', () => {
  // Ante la duda, callarse. Nadie quiere reinstalar por una etiqueta rara.
  assert.equal(esMasNueva('ultima', '2.0.0'), false);
  assert.equal(esMasNueva('', '2.0.0'), false);
});
