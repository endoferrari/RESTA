/**
 * PRUEBAS · OPCIONES DE PRODUCTO
 * ─────────────────────────────────────────────────────────────────────────────
 * Se corren con:   npm test
 *
 * El submenú del mesero es de lo poco que Rosendo edita a mano desde la
 * pantalla. Si el parser se rompe, un whisky se manda a la barra sin decir
 * cómo va. Estos casos son los submenús reales de ONCE.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOpciones, textoOpciones, preguntaAplica, resumirEleccion,
} from '../nucleo/opciones.js';

/* ── Lo básico ─────────────────────────────────────────────────────────── */

test('una pregunta sencilla con sus respuestas', () => {
  assert.deepEqual(
    parseOpciones('Sabor: Fresa, Naranja, Toronja'),
    [{ g: 'Sabor', ops: ['Fresa', 'Naranja', 'Toronja'] }]
  );
});

test('varias preguntas, una por línea', () => {
  const r = parseOpciones('Marca: Sol, Indio\nHielo: Con hielo, Sin hielo');
  assert.equal(r.length, 2);
  assert.equal(r[0].g, 'Marca');
  assert.equal(r[1].g, 'Hielo');
});

test('perdona espacios de más y líneas vacías', () => {
  assert.deepEqual(
    parseOpciones('  Sabor :  Fresa ,  Coco  \n\n  '),
    [{ g: 'Sabor', ops: ['Fresa', 'Coco'] }]
  );
});

/* ── Los marcadores ────────────────────────────────────────────────────── */

test('[varias] deja marcar más de una respuesta', () => {
  const [p] = parseOpciones('Aparte [varias]: Agua mineral, Refresco');
  assert.equal(p.multi, true);
  assert.equal(p.g, 'Aparte');
  assert.deepEqual(p.ops, ['Agua mineral', 'Refresco']);
});

test('[si: ...] guarda de qué respuesta depende la pregunta', () => {
  const [p] = parseOpciones('Con qué va [si: Puesto]: Agua mineral, Refresco');
  assert.deepEqual(p.si, ['Puesto']);
  assert.equal(p.g, 'Con qué va');
});

test('los dos marcadores juntos, en cualquier orden', () => {
  const [p] = parseOpciones('Aparte [varias] [si: Divorciado]: Agua, Refresco');
  assert.equal(p.multi, true);
  assert.deepEqual(p.si, ['Divorciado']);
});

/* ── El submenú real de una copa en ONCE ───────────────────────────────── */

const OPS_COPA =
  'Mezcla: Puesto, Campechano, Pintado, Divorciado, Derecho\n' +
  'Con qué va [si: Puesto]: Agua mineral, Refresco, Agua y refresco (pintado)\n' +
  'Aparte [varias] [si: Divorciado]: Agua mineral, Agua natural, Refresco\n' +
  'Refresco [si: Refresco, Agua y refresco (pintado), Campechano, Pintado]: Coca, Coca Light\n' +
  'Hielo: Con hielo, Sin hielo';

test('el submenú de una copa se entiende completo', () => {
  const r = parseOpciones(OPS_COPA);
  assert.equal(r.length, 5);
  assert.deepEqual(r.map((p) => p.g),
    ['Mezcla', 'Con qué va', 'Aparte', 'Refresco', 'Hielo']);
  assert.equal(r[2].multi, true);
  assert.equal(r[4].si, undefined);   // el hielo siempre se pregunta
});

test('a quien pide derecho no se le pregunta el refresco', () => {
  const r = parseOpciones(OPS_COPA);
  const visibles = r.filter((p) => preguntaAplica(p, ['Derecho']));
  assert.deepEqual(visibles.map((p) => p.g), ['Mezcla', 'Hielo']);
});

test('a quien pide puesto sí se le pregunta con qué va', () => {
  const r = parseOpciones(OPS_COPA);
  const visibles = r.filter((p) => preguntaAplica(p, ['Puesto']));
  assert.deepEqual(visibles.map((p) => p.g), ['Mezcla', 'Con qué va', 'Hielo']);
});

test('a quien pide divorciado se le pregunta qué quiere aparte', () => {
  const r = parseOpciones(OPS_COPA);
  const visibles = r.filter((p) => preguntaAplica(p, ['Divorciado']));
  assert.deepEqual(visibles.map((p) => p.g), ['Mezcla', 'Aparte', 'Hielo']);
});

test('las condiciones no se rompen por acentos ni mayúsculas', () => {
  const [, conQue] = parseOpciones(OPS_COPA);
  assert.equal(preguntaAplica(conQue, ['PUESTO']), true);
  assert.equal(preguntaAplica(conQue, ['puésto']), true);
});

/* ── Ida y vuelta ──────────────────────────────────────────────────────── */

test('el texto se puede volver a leer igual (ida y vuelta)', () => {
  const preguntas = parseOpciones(OPS_COPA);
  assert.deepEqual(parseOpciones(textoOpciones(preguntas)), preguntas);
});

/* ── Lo que no se entiende ─────────────────────────────────────────────── */

test('un texto sin dos puntos no es un submenú', () => {
  assert.equal(parseOpciones('esto no tiene forma de pregunta'), null);
});

test('una pregunta sin respuestas no es un submenú', () => {
  assert.equal(parseOpciones('Sabor:'), null);
});

test('sin submenú devuelve null, no truena', () => {
  assert.equal(parseOpciones(null), null);
  assert.equal(parseOpciones(undefined), null);
  assert.equal(parseOpciones(''), null);
});

/* ── Cómo se ve en la comanda ──────────────────────────────────────────── */

test('las respuestas se resumen en una línea para la comanda', () => {
  assert.equal(resumirEleccion(['Puesto', 'Coca', 'Con hielo']),
    'Puesto · Coca · Con hielo');
  assert.equal(resumirEleccion([]), '');
});
