/**
 * PRUEBAS · ALMACÉN
 * ─────────────────────────────────────────────────────────────────────────────
 * Se corren con:   npm test
 *
 * Lo que más se vigila aquí es la proyección: si dice de menos, un sábado se
 * acaba la cerveza; si dice de más, se compra dinero muerto. Y el bar no
 * consume igual un martes que un sábado, así que un promedio simple mentiría.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  enEnvases, textoEnvases, consumoEsperado, diaDeLaSemana,
  diasDeCobertura, semaforo, listaDeCompra, revisarConteo,
} from '../nucleo/almacen.js';

/* ── Porciones y envases ───────────────────────────────────────────────── */

test('38 copas con 15 por botella son 2 botellas y 8 copas', () => {
  assert.deepEqual(enEnvases(38, 15), { envases: 2, sueltas: 8, mixto: true });
});

test('lo que se vende suelto no se parte en envases', () => {
  assert.deepEqual(enEnvases(142, 1), { envases: 142, sueltas: 0, mixto: false });
});

test('una botella exacta no deja sueltas', () => {
  assert.deepEqual(enEnvases(30, 15), { envases: 2, sueltas: 0, mixto: true });
});

test('un faltante se reparte igual, en negativo', () => {
  assert.deepEqual(enEnvases(-17, 15), { envases: -1, sueltas: -2, mixto: true });
});

test('se lee en español, con sus plurales', () => {
  assert.equal(textoEnvases(38, { porcionesPorEnvase: 15, envase: 'botella', unidad: 'copa' }),
    '2 botellas y 8 copas');
  assert.equal(textoEnvases(15, { porcionesPorEnvase: 15, envase: 'botella', unidad: 'copa' }),
    '1 botella');
  assert.equal(textoEnvases(1, { porcionesPorEnvase: 15, envase: 'botella', unidad: 'copa' }),
    '1 copa');
  assert.equal(textoEnvases(0, { porcionesPorEnvase: 15, envase: 'botella', unidad: 'copa' }),
    '0 copas');
  assert.equal(textoEnvases(142, { unidad: 'cerveza' }), '142 cervezas');
});

/* ── El día de la semana ───────────────────────────────────────────────── */

test('la fecha se lee sin que la zona horaria la corra un día', () => {
  assert.equal(diaDeLaSemana('2026-07-25'), 6);   // sábado
  assert.equal(diaDeLaSemana('2026-07-26'), 0);   // domingo
  assert.equal(diaDeLaSemana('2026-07-29'), 3);   // miércoles
});

/* ── LO IMPORTANTE: el consumo NO es un promedio ───────────────────────── */

/** Cuatro semanas: los sábados se venden 60 y los martes 8. */
const CUATRO_SEMANAS = {
  '2026-07-04': 60, '2026-07-11': 60, '2026-07-18': 60, '2026-07-25': 60,  // sábados
  '2026-07-07': 8,  '2026-07-14': 8,  '2026-07-21': 8,  '2026-07-28': 8,   // martes
};

test('el sábado espera lo de los sábados, no el promedio de la semana', () => {
  assert.equal(consumoEsperado(CUATRO_SEMANAS, 6), 60);
  assert.equal(consumoEsperado(CUATRO_SEMANAS, 2), 8);

  // El promedio simple sería 34: compraría de menos para el sábado y de más
  // para el martes. Ése es justo el error que se evita.
  const promedioSimple = Object.values(CUATRO_SEMANAS).reduce((a, b) => a + b) / 8;
  assert.equal(promedioSimple, 34);
  assert.notEqual(consumoEsperado(CUATRO_SEMANAS, 6), promedioSimple);
});

test('un día sin historia usa el promedio, no cero', () => {
  // Un cero haría creer que ese día no hace falta comprar nada.
  const esperado = consumoEsperado(CUATRO_SEMANAS, 1);   // lunes, sin datos
  assert.equal(esperado, 34);
});

test('sin ninguna venta, el consumo es cero', () => {
  assert.equal(consumoEsperado({}, 6), 0);
});

/* ── Días de cobertura ─────────────────────────────────────────────────── */

test('la cobertura cuenta día por día, no con un promedio', () => {
  // 80 cervezas un viernes. Sábado se van 60, martes 8, los demás 34 (promedio).
  // viernes(34) → quedan 46 · sábado(60) → NO alcanza. Cubre 1 día.
  assert.equal(diasDeCobertura(80, CUATRO_SEMANAS, 5), 1);
});

test('con mucha existencia, cubre muchos días', () => {
  assert.ok(diasDeCobertura(1000, CUATRO_SEMANAS, 2) > 20);
});

test('sin existencia, cero días', () => {
  assert.equal(diasDeCobertura(0, CUATRO_SEMANAS, 6), 0);
});

test('un producto que no se vende nunca «no se acaba»', () => {
  assert.equal(diasDeCobertura(5, {}, 3), Infinity);
});

/* ── El semáforo ───────────────────────────────────────────────────────── */

test('el semáforo avisa según cuántos días quieras estar cubierto', () => {
  // Rosendo compra 1 o 2 veces por semana; se le pregunta para cuántos días
  assert.equal(semaforo(2, 7).color, 'rojo');
  assert.equal(semaforo(8, 7).color, 'ambar');
  assert.equal(semaforo(20, 7).color, 'verde');

  // Con compras cada 3 días, 4 días de existencia ya está bien
  assert.equal(semaforo(4, 3).color, 'ambar');
  assert.equal(semaforo(10, 3).color, 'verde');
});

test('lo que se acabó sale en rojo y lo dice con esas palabras', () => {
  assert.deepEqual(semaforo(0, 7), { color: 'rojo', texto: 'se acabó' });
});

test('lo que no se vende no molesta con avisos', () => {
  assert.equal(semaforo(Infinity, 7).color, 'verde');
  assert.match(semaforo(Infinity, 7).texto, /no se vende/);
});

/* ── La lista de compras ───────────────────────────────────────────────── */

const CERVEZA = {
  id: 1, nombre: 'Cerveza', existencia: 40,
  porcionesPorEnvase: 24, envase: 'caja', unidad: 'cerveza',
  ventasPorFecha: CUATRO_SEMANAS,
};

const WHISKY = {
  id: 2, nombre: 'Whisky Chivas', existencia: 30,
  porcionesPorEnvase: 15, envase: 'botella', unidad: 'copa',
  ventasPorFecha: { '2026-07-25': 6, '2026-07-18': 6, '2026-07-28': 2, '2026-07-21': 2 },
};

test('la lista dice cuántos ENVASES comprar, no cuántas porciones', () => {
  const lista = listaDeCompra([CERVEZA], { diasACubrir: 7, desdeDiaSemana: 1 });
  const cerveza = lista.find((x) => x.nombre === 'Cerveza');

  assert.ok(cerveza, 'la cerveza debería estar en la lista');
  assert.equal(cerveza.envase, 'caja');
  assert.ok(Number.isInteger(cerveza.comprar));
  // Se compra por cajas completas, redondeando hacia arriba
  assert.ok(cerveza.comprar * 24 >= cerveza.faltanPorciones);
});

test('siempre redondea hacia arriba: mejor que sobre a quedarse sin', () => {
  const p = {
    id: 9, nombre: 'Prueba', existencia: 0,
    porcionesPorEnvase: 24, envase: 'caja', unidad: 'pieza',
    ventasPorFecha: { '2026-07-27': 25 },   // lunes: 25 al día
  };
  const [r] = listaDeCompra([p], { diasACubrir: 1, desdeDiaSemana: 1 });

  assert.equal(r.faltanPorciones, 25);
  assert.equal(r.comprar, 2, '25 piezas no caben en 1 caja de 24');
});

test('lo que alcanza no aparece en la lista', () => {
  const sobrado = { ...CERVEZA, existencia: 5000 };
  assert.equal(listaDeCompra([sobrado], { diasACubrir: 7 }).length, 0);
});

test('lo que no se vende nunca no aparece en la lista', () => {
  const quieto = { id: 3, nombre: 'Souvenir', existencia: 0, porcionesPorEnvase: 1, ventasPorFecha: {} };
  assert.equal(listaDeCompra([quieto], { diasACubrir: 7 }).length, 0);
});

test('la lista sale ordenada: primero lo que peor está', () => {
  const lista = listaDeCompra([WHISKY, CERVEZA], { diasACubrir: 14, desdeDiaSemana: 1 });
  assert.ok(lista.length >= 1);

  for (let i = 1; i < lista.length; i++) {
    const antes = lista[i - 1].faltanPorciones / lista[i - 1].porcionesPorEnvase;
    const ahora = lista[i].faltanPorciones / lista[i].porcionesPorEnvase;
    assert.ok(antes >= ahora, 'debe ir de mayor a menor falta');
  }
});

/* ── El conteo físico ──────────────────────────────────────────────────── */

test('cuando el conteo cuadra, lo dice', () => {
  const r = revisarConteo({ contado: 38, segunSistema: 38, porcionesPorEnvase: 15 });
  assert.equal(r.cuadra, true);
  assert.equal(r.diferencia, 0);
});

test('cuando falta, dice cuánto y en botellas', () => {
  const r = revisarConteo({ contado: 21, segunSistema: 38, porcionesPorEnvase: 15 });

  assert.equal(r.diferencia, -17);
  assert.equal(r.falta, true);
  assert.deepEqual(r.enEnvases, { envases: 1, sueltas: 2, mixto: true });
});

test('cuando sobra, también lo dice', () => {
  const r = revisarConteo({ contado: 45, segunSistema: 38, porcionesPorEnvase: 15 });
  assert.equal(r.diferencia, 7);
  assert.equal(r.falta, false);
});

test('un conteo que no es un número se rechaza con un mensaje claro', () => {
  assert.throws(() => revisarConteo({ contado: -3, segunSistema: 10 }), /número de porciones/);
  assert.throws(() => revisarConteo({ contado: 1.5, segunSistema: 10 }), /número de porciones/);
});

/* ── Un caso completo de ONCE ──────────────────────────────────────────── */

test('caso real: whisky a 15 copas por botella, un viernes', () => {
  // Quedan 2 botellas justas (30 copas). Los viernes no hay historia, así que
  // se usa el promedio: (6+6+2+2)/4 = 4 copas al día.
  const dias = diasDeCobertura(30, WHISKY.ventasPorFecha, 5);
  assert.ok(dias >= 5, `debería cubrir varios días, dio ${dias}`);

  // Y en pantalla se lee como lo que es
  assert.equal(
    textoEnvases(30, { porcionesPorEnvase: 15, envase: 'botella', unidad: 'copa' }),
    '2 botellas'
  );
});
