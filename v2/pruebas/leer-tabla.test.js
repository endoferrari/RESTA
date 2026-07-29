/**
 * PRUEBAS · LEER UNA LISTA DE PRECIOS
 * ─────────────────────────────────────────────────────────────────────────────
 * La parte que entiende el texto se prueba aquí. La parte que abre el Excel
 * necesita el navegador (usa DOMParser), y se comprueba abriendo un archivo
 * de verdad desde la pantalla.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { leerCSV, entenderColumnas, interpretar, esPrecio } from '../cliente/js/leer-tabla.js';

test('lee un CSV normal separado por comas', () => {
  const filas = leerCSV('nombre,precio\nCorona,45\nSol,40\n');
  assert.deepEqual(filas, [['nombre', 'precio'], ['Corona', '45'], ['Sol', '40']]);
});

test('lee el CSV que guarda Excel en español, con punto y coma', () => {
  // Si no se detectara el separador, «45,50» partiría el renglón en dos y
  // la cerveza costaría 45 pesos en vez de 45.50.
  const filas = leerCSV('nombre;precio\nCorona;45,50\n');
  assert.deepEqual(filas[1], ['Corona', '45,50']);
});

test('respeta las comas que van dentro de comillas', () => {
  const filas = leerCSV('nombre,precio\n"Alitas, 12 piezas",180\n');
  assert.deepEqual(filas[1], ['Alitas, 12 piezas', '180']);
});

test('no se traga la marca invisible que mete Excel al inicio', () => {
  // Sin esto, el título quedaría «﻿nombre» y no se reconocería la columna
  const filas = leerCSV('﻿nombre,precio\nCorona,45');
  assert.equal(filas[0][0], 'nombre');
});

test('reconoce las columnas aunque se llamen de otra forma', () => {
  const filas = leerCSV('CATEGORÍA,Descripción,Importe\nBebidas,Corona,45');
  const { columnas, desdeLaFila } = entenderColumnas(filas);

  assert.equal(desdeLaFila, 1);
  assert.equal(columnas.familia, 0);
  assert.equal(columnas.nombre, 1);
  assert.equal(columnas.precio, 2);
});

test('salta los renglones de adorno de arriba y encuentra los títulos', () => {
  // Casi ninguna lista de precios real empieza en la primera fila:
  // arriba suele haber el nombre del negocio y la fecha.
  const filas = leerCSV('LISTA DE PRECIOS,,\nJulio 2026,,\n,,\nProducto,Precio,Familia\nCorona,45,Bebidas');
  const { productos, modo } = interpretar(filas);

  assert.equal(modo, 'tabla');
  assert.deepEqual(productos.map((p) => p.nombre), ['Corona']);
  assert.equal(productos[0].familia, 'Bebidas');
});

/* ── La lista de precios de ONCE ─────────────────────────────────────────
 * No es una tabla: es un cartel con tres listas lado a lado, y las familias
 * van como títulos EN MAYÚSCULAS dentro de cada lista. Estos renglones están
 * copiados del archivo real, incluidos los huecos.
 */
const CARTEL = [
  ['', ''],
  ['BEBIDAS', '', '', 'CERVEZA', ''],
  ['Agua 500 ml', '15', '', 'Cerveza', '40'],
  ['Agua 1 lt', '25', '', 'Chelada (limon y sal)', '50'],
  ['Agua mineral', '25', '', 'Michelada (salsas)', '60'],
  ['Clamato natural', '55', '', 'Chelato (salsas y clamato)', '70'],
  ['(con salsas y agua mineral)', '', '', '', ''],
  ['Limonada / Rusa', '40', '', 'WHISKY', ''],
  ['', '', '', 'Etiqueta negra', '150'],
  ['CAFÉ', '', '', 'Buchannans 12 años', '150'],
  ['Café americano', '30', '', 'Chivas', '150'],
  ['Capuchino', '45'],
];

test('lee una lista de precios con forma de cartel', () => {
  const { productos, modo } = interpretar(CARTEL);
  assert.equal(modo, 'cartel');

  // Los DOS bloques, no sólo el de la izquierda
  assert.ok(productos.some((p) => p.nombre === 'Agua 500 ml'));
  assert.ok(productos.some((p) => p.nombre === 'Etiqueta negra'));
});

test('los títulos en mayúsculas se vuelven la familia de lo que va debajo', () => {
  const de = (n) => interpretar(CARTEL).productos.find((p) => p.nombre === n);

  assert.equal(de('Agua 500 ml').familia, 'Bebidas');
  assert.equal(de('Capuchino').familia, 'Café');       // cambió a mitad de la columna
  assert.equal(de('Cerveza').familia, 'Cerveza');
  assert.equal(de('Etiqueta negra').familia, 'Whisky'); // familia de la OTRA columna
});

test('una nota al pie no se confunde con una familia', () => {
  // «(con salsas y agua mineral)» no lleva precio, igual que un título.
  // Lo que la distingue es que no va en mayúsculas.
  const { productos } = interpretar(CARTEL);

  assert.ok(!productos.some((p) => p.nombre.startsWith('(con salsas')));
  assert.equal(productos.find((p) => p.nombre === 'Limonada / Rusa').familia, 'Bebidas');
});

test('un producto sin precio no se inventa uno', () => {
  assert.equal(esPrecio(''), false);
  assert.equal(esPrecio('a consultar'), false);
  assert.equal(esPrecio('45'), true);
  assert.equal(esPrecio('$1,250.00'), true);
});
