/**
 * PRUEBAS · LAS CUENTAS DEL ALMACÉN, CON UNA SEMANA DE BAR ENCIMA
 * ─────────────────────────────────────────────────────────────────────────────
 * Aquí no se prueba que los botones funcionen: se prueba que los NÚMEROS que
 * salen en pantalla sean los que uno sacaría con lápiz y papel.
 *
 * Son las tres preguntas que se hace uno parado frente al refrigerador:
 *   · ¿para cuántos días me alcanza?
 *   · ¿de qué color está: puedo dormir tranquilo o pido mañana?
 *   · si compro para 7 días, ¿cuántas cajas son?
 *
 * Todo es cálculo puro, así que se prueba sin base de datos y sin servidor.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  diasDeCobertura, consumoEsperado, semaforo, listaDeCompra,
  enEnvases, textoEnvases, revisarConteo,
} from '../nucleo/almacen.js';

/* Un lunes cualquiera, para no depender del día en que se corran las pruebas */
const LUNES = 1, VIERNES = 5, SÁBADO = 6;

/* ── ¿Para cuántos días alcanza? ───────────────────────────────────────── */

test('un producto que se vende parejo alcanza lo que dice la división', () => {
  // Cuatro semanas seguidas vendiendo 10 diarios todos los días
  const ventas = {};
  for (let d = 1; d <= 28; d++) ventas[`2026-07-${String(d).padStart(2, '0')}`] = 10;
  const ventana = { desde: '2026-07-01', hasta: '2026-07-28' };

  // 100 en existencia a 10 diarios = 10 días
  assert.equal(diasDeCobertura(100, ventas, LUNES, ventana), 10);
});

test('los días que no se vende TAMBIÉN cuentan como días cubiertos', () => {
  // Este bar sólo vende los sábados: 20 cervezas cada sábado, cuatro semanas.
  // Con 60 cervezas aguanta TRES sábados, o sea 21 días de calendario.
  //
  // Contar sólo los días que se vende diría «alcanza 3 días» y haría pedir
  // cerveza cada tres días para algo que dura tres semanas.
  const soloSabados = {
    '2026-07-04': 20, '2026-07-11': 20, '2026-07-18': 20, '2026-07-25': 20,
  };
  const ventana = { desde: '2026-07-04', hasta: '2026-07-31' };

  assert.equal(diasDeCobertura(60, soloSabados, SÁBADO, ventana), 21);
});

test('un martes sin ventas cuenta en el promedio, no se salta', () => {
  // Cuatro martes en la ventana y sólo dos vendieron 10.
  // El promedio del martes es 5, no 10. Sin esto se compra el doble,
  // para siempre, de todo lo que no se vende parejo.
  const ventas = { '2026-07-07': 10, '2026-07-14': 10 };   // faltan el 21 y el 28
  const ventana = { desde: '2026-07-07', hasta: '2026-07-28' };

  assert.equal(consumoEsperado(ventas, 2, ventana), 5);
  assert.equal(consumoEsperado(ventas, 2), 10);            // sin ventana, el error viejo
});

test('los primeros días, sin ventana, no se inventa una historia larga', () => {
  // Se controla desde ayer: la ventana es de un día y no hay con qué
  // promediar por día de la semana. Vale más el promedio general que un cero.
  const ayer = { '2026-07-28': 12 };
  assert.equal(consumoEsperado(ayer, 2, { desde: '2026-07-28', hasta: '2026-07-28' }), 12);
});

test('sin existencia son cero días, aunque se venda poquísimo', () => {
  assert.equal(diasDeCobertura(0, { '2026-07-27': 1 }, LUNES), 0);
});

test('sin ninguna venta registrada no se puede saber, y se dice', () => {
  // Infinity es «no tengo con qué calcularlo», no «tienes de sobra».
  // La pantalla tiene que enseñarlo distinto de un verde de verdad.
  assert.equal(diasDeCobertura(50, {}, LUNES), Infinity);
});

/* ── El consumo, día de la semana por día de la semana ─────────────────── */

test('el sábado no se calcula con el promedio de la semana', () => {
  // Ésta es la razón de ser del módulo. Dos martes flojos y dos sábados
  // fuertes: el promedio plano diría 30, y por comprar 30 para el sábado
  // el bar se queda sin cerveza a las once de la noche.
  const ventas = {
    '2026-07-07': 10, '2026-07-14': 10,   // martes
    '2026-07-11': 50, '2026-07-18': 50,   // sábados
  };

  assert.equal(consumoEsperado(ventas, 2), 10);   // martes
  assert.equal(consumoEsperado(ventas, 6), 50);   // sábado

  const promedioPlano = (10 + 10 + 50 + 50) / 4;
  assert.equal(promedioPlano, 30);
  assert.notEqual(consumoEsperado(ventas, 6), promedioPlano);
});

test('de un día del que no hay historia se usa el promedio, no cero', () => {
  // Un cero haría creer que el jueves no hace falta comprar nada.
  const soloSabados = { '2026-07-11': 40, '2026-07-18': 40 };
  assert.equal(consumoEsperado(soloSabados, 4), 40);   // jueves
});

/* ── El semáforo ───────────────────────────────────────────────────────── */

test('el color dice qué hacer, no cuánto hay', () => {
  assert.equal(semaforo(0, 7).color, 'rojo');          // se acabó
  assert.equal(semaforo(3, 7).color, 'rojo');          // no llega a la compra
  assert.equal(semaforo(8, 7).color, 'ambar');         // justo
  assert.equal(semaforo(30, 7).color, 'verde');        // tranquilo
});

test('sin datos el semáforo NO se pinta de verde', () => {
  // Verde significa «puedes dormir tranquilo». Decirlo sin una sola venta
  // registrada es una promesa que el sistema no puede sostener.
  const s = semaforo(Infinity, 7);

  assert.notEqual(s.color, 'verde');
  assert.notEqual(s.color, 'rojo');
  assert.match(s.texto, /sin ventas|sin datos/i);
});

test('el corte del semáforo se mueve con cada cuánto se surte', () => {
  // Rosendo compra 1 o 2 veces por semana. Con 10 días de existencia:
  // si surte cada 7 días llega con margen; si surte cada 14, no llega.
  assert.equal(semaforo(10, 7).color, 'ambar');    // llega, pero sin colchón
  assert.equal(semaforo(10, 14).color, 'rojo');    // se queda a medio camino
  assert.equal(semaforo(20, 7).color, 'verde');
});

/* ── La lista de compra ────────────────────────────────────────────────── */

test('la lista dice CAJAS, no cervezas sueltas', () => {
  // Nadie va al proveedor a pedir «74 cervezas».
  const lista = listaDeCompra([{
    id: 1, nombre: 'Cerveza', existencia: 10,
    porcionesPorEnvase: 24, envase: 'caja', unidad: 'cerveza',
    ventasPorFecha: { '2026-07-06': 12, '2026-07-07': 12, '2026-07-08': 12 },
  }], { diasACubrir: 7, desdeDiaSemana: LUNES });

  const cerveza = lista[0];
  assert.equal(cerveza.seVanAConsumir, 84);        // 12 × 7 días
  assert.equal(cerveza.faltanPorciones, 74);       // 84 − 10 que hay
  assert.equal(cerveza.comprar, 4);                // 74 ÷ 24 = 3.08 → 4 cajas
  assert.equal(cerveza.envase, 'caja');
});

test('siempre redondea hacia arriba: más vale que sobre', () => {
  // Falta 1 sola copa de whisky → hay que comprar la botella entera.
  const lista = listaDeCompra([{
    id: 1, nombre: 'Whisky', existencia: 6,
    porcionesPorEnvase: 15, envase: 'botella', unidad: 'copa',
    ventasPorFecha: { '2026-07-06': 1 },
  }], { diasACubrir: 7, desdeDiaSemana: LUNES });

  assert.equal(lista[0].faltanPorciones, 1);
  assert.equal(lista[0].comprar, 1);
});

test('lo que alcanza no sale en la lista', () => {
  const lista = listaDeCompra([{
    id: 1, nombre: 'Whisky', existencia: 500,
    porcionesPorEnvase: 15, envase: 'botella', unidad: 'copa',
    ventasPorFecha: { '2026-07-06': 2 },
  }], { diasACubrir: 7, desdeDiaSemana: LUNES });

  assert.equal(lista.length, 0);
});

test('un fin de semana pide más que la misma semana empezando en martes', () => {
  // La lista tiene que cambiar según en qué día se pare uno a pedir.
  const producto = {
    id: 1, nombre: 'Cerveza', existencia: 0,
    porcionesPorEnvase: 24, envase: 'caja', unidad: 'cerveza',
    ventasPorFecha: {
      '2026-07-07': 10, '2026-07-08': 10, '2026-07-09': 10, '2026-07-10': 10,
      '2026-07-11': 60, '2026-07-12': 40, '2026-07-13': 10,   // vie/sáb/dom
    },
  };

  const pidiendoElViernes = listaDeCompra([producto], { diasACubrir: 3, desdeDiaSemana: VIERNES });
  const pidiendoElMartes  = listaDeCompra([producto], { diasACubrir: 3, desdeDiaSemana: 2 });

  // Viernes + sábado + domingo pesa mucho más que martes + miércoles + jueves
  assert.ok(pidiendoElViernes[0].comprar > pidiendoElMartes[0].comprar);
});

test('lo que peor está va primero en la lista', () => {
  const lista = listaDeCompra([
    { id: 1, nombre: 'Whisky', existencia: 0, porcionesPorEnvase: 15,
      ventasPorFecha: { '2026-07-06': 1 } },                    // falta 1 botella
    { id: 2, nombre: 'Cerveza', existencia: 0, porcionesPorEnvase: 24,
      ventasPorFecha: { '2026-07-06': 30 } },                   // faltan 9 cajas
  ], { diasACubrir: 7, desdeDiaSemana: LUNES });

  assert.equal(lista[0].nombre, 'Cerveza');
});

/* ── Cómo se enseña ────────────────────────────────────────────────────── */

test('38 copas se enseñan como 2 botellas y 8 copas', () => {
  assert.deepEqual(enEnvases(38, 15), { envases: 2, sueltas: 8, mixto: true });
  assert.equal(textoEnvases(38, { porcionesPorEnvase: 15, envase: 'botella', unidad: 'copa' }),
    '2 botellas y 8 copas');
});

test('lo exacto no dice «y 0 copas»', () => {
  assert.equal(textoEnvases(30, { porcionesPorEnvase: 15, envase: 'botella', unidad: 'copa' }),
    '2 botellas');
});

test('lo que se vende de a uno no habla de envases', () => {
  assert.equal(textoEnvases(7, { porcionesPorEnvase: 1, envase: 'pieza', unidad: 'orden' }),
    '7 ordenes');
});

test('cero no desaparece: dice cero', () => {
  assert.equal(textoEnvases(0, { porcionesPorEnvase: 15, envase: 'botella', unidad: 'copa' }),
    '0 copas');
});

/* ── El conteo físico ──────────────────────────────────────────────────── */

test('el conteo dice cuánto falta y en cuántas botellas', () => {
  const r = revisarConteo({ contado: 20, segunSistema: 38, porcionesPorEnvase: 15 });

  assert.equal(r.diferencia, -18);
  assert.equal(r.falta, true);
  assert.equal(r.cuadra, false);
  assert.deepEqual(r.enEnvases, { envases: 1, sueltas: 3, mixto: true });
});

test('contar cero es contar, no es dejarlo en blanco', () => {
  // «Se acabó» es un dato tan válido como cualquier otro y tiene que poder
  // capturarse; si se tratara como vacío, el sistema seguiría creyendo que hay.
  const r = revisarConteo({ contado: 0, segunSistema: 12, porcionesPorEnvase: 15 });

  assert.equal(r.diferencia, -12);
  assert.equal(r.cuadra, false);
});

test('contar de más también se registra', () => {
  const r = revisarConteo({ contado: 40, segunSistema: 38, porcionesPorEnvase: 15 });
  assert.equal(r.diferencia, 2);
  assert.equal(r.falta, false);
});
