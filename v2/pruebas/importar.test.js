/**
 * PRUEBAS · IMPORTADOR DEL RESPALDO v1.3.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Se corren con:   npm test
 *
 * Esta importación se hace UNA vez, el día que se cambie la laptop del bar de
 * la v1 a la v2, y con datos que no se pueden volver a generar. Si sale mal,
 * sale mal con la carta real de ONCE. Por eso se prueba a fondo aquí.
 *
 * Cada prueba usa una base nueva en una carpeta temporal, para no tocar los
 * datos de desarrollo.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Hay que apuntar la base a una carpeta temporal ANTES de cargar los módulos
// que la abren; por eso se importan más abajo, ya arrancada la prueba.
const CARPETA = mkdtempSync(join(tmpdir(), 'resta-prueba-'));
process.env.RESTA_DATOS = CARPETA;

let abrirBase, cerrarBase, importarV1, revisarRespaldo, resumirImportacion;
let listarProductos, listarFamilias, contarProductos, leerAjuste;

before(async () => {
  ({ abrirBase, cerrarBase } = await import('../datos/conexion.js'));
  ({ importarV1, revisarRespaldo, resumirImportacion } = await import('../datos/importar-v1.js'));
  ({ listarProductos, listarFamilias, contarProductos } = await import('../datos/repos/productos.js'));
  ({ leerAjuste } = await import('../datos/repos/ajustes.js'));
  abrirBase({ silencioso: true });
});

after(() => {
  cerrarBase();
  rmSync(CARPETA, { recursive: true, force: true });
});

/** Un respaldo mínimo, con la forma exacta que descarga la v1.3.0. */
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

/* ── Lo que no es un respaldo ──────────────────────────────────────────── */

test('un archivo que no es respaldo se rechaza con un mensaje claro', () => {
  assert.match(revisarRespaldo(null), /no tiene forma de respaldo/);
  assert.match(revisarRespaldo({ hola: 1 }), /lista de productos/);
  assert.match(revisarRespaldo({ productos: [] }), /historial de ventas/);
  assert.equal(revisarRespaldo(respaldo()), null);
});

test('importar algo que no es respaldo truena antes de tocar la base', () => {
  const antes = contarProductos();
  assert.throws(() => importarV1({ cualquier: 'cosa' }), /no parece un respaldo/);
  assert.equal(contarProductos(), antes);
});

/* ── El caso real ──────────────────────────────────────────────────────── */

test('el precio del respaldo le gana al menú de fábrica', () => {
  // La base arranca con el menú de fábrica: la cerveza está en $40.
  const antes = listarProductos({ familia: 'Bebidas' }).find((p) => p.nombre === 'Cerveza');
  assert.equal(antes.precio, 4000);

  // En el bar subieron la cerveza a $45.
  const informe = importarV1(respaldo({
    productos: [
      { id: 'abc12', familia: 'Bebidas', icono: '🍺', nombre: 'Cerveza', precio: 4500 },
    ],
  }));

  const despues = listarProductos({ familia: 'Bebidas' }).find((p) => p.nombre === 'Cerveza');
  assert.equal(despues.precio, 4500);
  assert.equal(informe.productos.actualizados, 1);
  assert.equal(informe.productos.nuevos, 0);
});

test('un producto que no estaba en el menú de fábrica se agrega', () => {
  const informe = importarV1(respaldo({
    productos: [
      { id: 'nue01', familia: 'Comida', icono: '🌮', nombre: 'Tacos de canasta', precio: 3000 },
    ],
  }));
  assert.equal(informe.productos.nuevos, 1);

  const p = listarProductos({ familia: 'Comida' }).find((x) => x.nombre === 'Tacos de canasta');
  assert.equal(p.precio, 3000);
  assert.equal(p.icono, '🌮');
});

test('importar el mismo respaldo dos veces no duplica nada', () => {
  const archivo = respaldo({
    productos: [
      { id: 'rep01', familia: 'Bebidas', icono: '🍺', nombre: 'Cerveza artesanal', precio: 6500 },
    ],
  });

  importarV1(archivo);
  const despuesDeUna = contarProductos();

  importarV1(archivo);
  assert.equal(contarProductos(), despuesDeUna, 'la segunda importación no debe agregar productos');
});

/* ── Familias ──────────────────────────────────────────────────────────── */

test('una familia que v2 no conocía se crea sola', () => {
  importarV1(respaldo({
    productos: [
      { id: 'sv001', familia: 'Souvenirs', icono: '👕', nombre: 'Playera ONCE', precio: 25000 },
      { id: 'ct001', familia: 'Cocteles', icono: '🍸', nombre: 'Mojito', precio: 12000 },
    ],
  }));

  const claves = listarFamilias().map((f) => f.clave);
  assert.ok(claves.includes('Cocteles'), 'debió crearse la familia Cocteles');

  const m = listarProductos({ familia: 'Cocteles' });
  assert.equal(m.length, 1);
  assert.equal(m[0].nombre, 'Mojito');
});

/* ── Productos con problemas ───────────────────────────────────────────── */

test('un producto con precio corrupto se salta y se reporta por nombre', () => {
  const informe = importarV1(respaldo({
    productos: [
      { id: 'ok001', familia: 'Comida', icono: '🍕', nombre: 'Pizza', precio: 12000 },
      { id: 'ma001', familia: 'Comida', icono: '❓', nombre: 'Algo roto', precio: '120 pesos' },
      { id: 'ma002', familia: 'Comida', icono: '❓', nombre: 'Precio con decimales', precio: 120.5 },
    ],
  }));

  assert.equal(informe.productos.omitidos.length, 2);
  const nombres = informe.productos.omitidos.map((o) => o.nombre);
  assert.deepEqual(nombres, ['Algo roto', 'Precio con decimales']);

  // El bueno sí entró: un producto malo no detiene la importación.
  assert.ok(listarProductos({ familia: 'Comida' }).some((p) => p.nombre === 'Pizza'));
});

test('un producto sin nombre se salta sin tumbar la importación', () => {
  const informe = importarV1(respaldo({
    productos: [
      { id: 'sn001', familia: 'Comida', icono: '', nombre: '   ', precio: 1000 },
      { id: 'sn002', familia: 'Comida', icono: '🍞', nombre: 'Pan', precio: 1500 },
    ],
  }));

  assert.equal(informe.productos.omitidos.length, 1);
  assert.match(informe.productos.omitidos[0].motivo, /no trae nombre/);
  assert.ok(listarProductos({ familia: 'Comida' }).some((p) => p.nombre === 'Pan'));
});

/* ── El submenú del mesero ─────────────────────────────────────────────── */

test('el submenú se importa venga como texto o ya convertido', () => {
  importarV1(respaldo({
    productos: [
      {
        id: 'tx001', familia: 'Bebidas', icono: '🥃', nombre: 'Mezcal de la casa', precio: 9000,
        opciones: 'Cómo va: Derecho, En las rocas',
      },
      {
        id: 'js001', familia: 'Bebidas', icono: '🍺', nombre: 'Cerveza del día', precio: 3500,
        opciones: [{ g: 'Marca', ops: ['Sol', 'Indio'] }],
      },
    ],
  }));

  const bebidas = listarProductos({ familia: 'Bebidas' });
  const mezcal = bebidas.find((p) => p.nombre === 'Mezcal de la casa');
  const cerveza = bebidas.find((p) => p.nombre === 'Cerveza del día');

  assert.deepEqual(mezcal.opciones, [{ g: 'Cómo va', ops: ['Derecho', 'En las rocas'] }]);
  assert.deepEqual(cerveza.opciones, [{ g: 'Marca', ops: ['Sol', 'Indio'] }]);
});

/* ── La configuración del negocio ──────────────────────────────────────── */

test('se traen el nombre del negocio y los ajustes del ticket', () => {
  importarV1(respaldo({
    negocio: 'ONCE Social Lounge',
    impresion: { ancho: 58, logo: 'data:image/svg+xml;utf8,<svg/>', pie: 'Vuelva pronto', comanda: false },
  }));

  assert.equal(leerAjuste('negocio.nombre'), 'ONCE Social Lounge');
  assert.equal(leerAjuste('ticket.ancho_mm'), '58');
  assert.equal(leerAjuste('ticket.pie'), 'Vuelva pronto');
  assert.equal(leerAjuste('ticket.comanda'), '0');
  assert.equal(leerAjuste('menu.origen'), 'respaldo v1.3.0');
});

test('un ancho de ticket inventado no se acepta', () => {
  escribirAnchoConocido();
  importarV1(respaldo({ impresion: { ancho: 33 } }));
  assert.equal(leerAjuste('ticket.ancho_mm'), '80', 'debió quedarse con el ancho anterior');
});

function escribirAnchoConocido() {
  importarV1(respaldo({ impresion: { ancho: 80 } }));
}

/* ── Lo que todavía no se importa ──────────────────────────────────────── */

test('las ventas viejas se cuentan y se avisa que no se perdieron', () => {
  const informe = importarV1(respaldo({
    tickets: [{ n: 1 }, { n: 2 }, { n: 3 }],
    cuentas: [{ nombre: 'Mesa 4' }],
  }));

  assert.equal(informe.sinImportar.tickets, 3);
  assert.equal(informe.sinImportar.cuentas, 1);

  const resumen = resumirImportacion(informe).join(' ');
  assert.match(resumen, /3 venta\(s\) y 1 cuenta\(s\)/);
  assert.match(resumen, /No se perdieron/);
});

test('el resumen se lee en español y menciona lo que no entró', () => {
  const informe = importarV1(respaldo({
    productos: [
      { id: 'r1', familia: 'Comida', icono: '🍔', nombre: 'Hamburguesa', precio: 11000 },
      { id: 'r2', familia: 'Comida', icono: '❓', nombre: 'Rota', precio: null },
    ],
  }));

  const resumen = resumirImportacion(informe).join(' ');
  assert.match(resumen, /producto\(s\)/);
  assert.match(resumen, /Rota/);
});
