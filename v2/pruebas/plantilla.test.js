/**
 * PRUEBAS · LA PLANTILLA DE LA CARTA
 * ─────────────────────────────────────────────────────────────────────────────
 * Se corren con:   npm test
 *
 * Lo que se comprueba aquí es lo que puede salir caro:
 *
 *   · que un precio corregido en Excel llegue EXACTO a la base, en centavos;
 *   · que renombrar un producto no cree un gemelo, porque la Clave lo ata;
 *   · que un producto que ya no viene en la hoja NO desaparezca solo — sólo
 *     si alguien lo confirmó — y que aun entonces se dé de baja, nunca se
 *     borre, para que los tickets de hace meses sigan cuadrando;
 *   · que las columnas de inventario no hagan nada mientras el inventario
 *     esté apagado.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CARPETA = mkdtempSync(join(tmpdir(), 'resta-plantilla-'));
process.env.RESTA_DATOS = CARPETA;

let abrirBase, cerrarBase;
let filasDeLaPlantilla, aplicarPlantilla, losQueFaltan;
let listarProductos, buscarProducto;
let existenciaDe, cambiarAlmacenActivo, configuracionDeAlmacen;
let ADMIN;

/** El renglón como sale de la hoja: sólo lo que de verdad viaja. */
const renglon = (p) => ({
  id: p.id, nombre: p.nombre, precio: p.precio, familia: p.familia,
  icono: p.icono, submenu: p.submenu ?? '',
  inventario: p.inventario ?? '', existencia: p.existencia ?? '',
  unidad: p.unidad ?? '', envase: p.envase ?? '', porciones: p.porciones ?? '',
});

/** La carta de hoy en forma de renglones, como si se hubiera bajado la hoja. */
function laHojaDeHoy() {
  return filasDeLaPlantilla().map((f) => renglon({
    id: f.id,
    nombre: f.nombre,
    // En la hoja el precio va en pesos; aquí se simula lo que hace la pantalla
    // al leerlo de vuelta: convertirlo a centavos enteros.
    precio: Math.round(Number(f.precio) * 100),
    familia: f.familia,
    icono: f.icono,
    submenu: f.submenu,
    inventario: f.inventario,
    existencia: f.existencia,
    unidad: f.unidad,
    envase: f.envase,
    porciones: f.porciones,
  }));
}

before(async () => {
  ({ abrirBase, cerrarBase } = await import('../datos/conexion.js'));
  ({ filasDeLaPlantilla, aplicarPlantilla, losQueFaltan } =
    await import('../datos/plantilla-carta.js'));
  ({ listarProductos, buscarProducto } = await import('../datos/repos/productos.js'));
  ({ existenciaDe, cambiarAlmacenActivo, configuracionDeAlmacen } =
    await import('../datos/repos/almacen.js'));
  const { crearUsuario } = await import('../datos/repos/usuarios.js');

  abrirBase({ silencioso: true });
  ADMIN = crearUsuario({ nombre: 'Rosendo', pin: '9999', rol: 'admin' });
});

after(() => {
  cerrarBase();
  rmSync(CARPETA, { recursive: true, force: true });
});

/* ── Bajar la hoja ─────────────────────────────────────────────────────── */

test('la hoja se baja LLENA con la carta de hoy y cada renglón trae su clave', () => {
  const filas = filasDeLaPlantilla();

  assert.ok(filas.length >= 50, 'la carta de ONCE tiene 55 productos');
  assert.ok(filas.every((f) => Number.isInteger(f.id)), 'todos traen clave');

  const cerveza = filas.find((f) => f.nombre === 'Cerveza');
  assert.equal(cerveza.familia, 'Bebidas', 'va el NOMBRE de la familia, no su clave interna');
  assert.match(cerveza.precio, /^\d+\.\d\d$/, 'el precio va en pesos, para que Excel lo sume');
});

test('con el inventario apagado, sus columnas van vacías', () => {
  const cerveza = filasDeLaPlantilla().find((f) => f.nombre === 'Cerveza');
  assert.equal(cerveza.inventario, '');
  assert.equal(cerveza.existencia, '');
});

/* ── Subirla ───────────────────────────────────────────────────────────── */

test('un precio corregido en la hoja llega exacto, en centavos', () => {
  const hoja = laHojaDeHoy();
  const cerveza = hoja.find((r) => r.nombre === 'Cerveza');
  cerveza.precio = 5550;                      // $55.50

  const informe = aplicarPlantilla({ renglones: hoja, usuario: ADMIN });

  assert.equal(buscarProducto(cerveza.id).precio, 5550);
  assert.equal(informe.preciosCambiados.length, 1);
  assert.equal(informe.preciosCambiados[0].nombre, 'Cerveza');
  assert.equal(informe.dadosDeBaja.length, 0, 'nadie pidió dar de baja nada');
});

test('un renglón sin clave da de alta un producto nuevo', () => {
  const hoja = laHojaDeHoy();
  hoja.push(renglon({
    id: null, nombre: 'Agua mineral', precio: 3000, familia: 'Bebidas', icono: '💧',
  }));

  const informe = aplicarPlantilla({ renglones: hoja, usuario: ADMIN });

  assert.equal(informe.nuevos, 1);
  const nueva = listarProductos({ familia: 'Bebidas' }).find((p) => p.nombre === 'Agua mineral');
  assert.equal(nueva.precio, 3000);
});

test('la clave permite RENOMBRAR sin crear un gemelo', () => {
  const hoja = laHojaDeHoy();
  const agua = hoja.find((r) => r.nombre === 'Agua mineral');
  agua.nombre = 'Agua mineral chica';

  aplicarPlantilla({ renglones: hoja, usuario: ADMIN });

  const bebidas = listarProductos({ familia: 'Bebidas' });
  assert.equal(bebidas.filter((p) => p.nombre.startsWith('Agua mineral')).length, 1,
    'se renombró el mismo producto, no se duplicó');
  assert.equal(buscarProducto(agua.id).nombre, 'Agua mineral chica');
});

test('una familia que no existe se crea sola', () => {
  const hoja = laHojaDeHoy();
  // «Postres» no está entre las cuatro familias de ONCE (Bebidas, Comida,
  // Canchas, Souvenirs): tiene que nacer con el producto.
  hoja.push(renglon({
    id: null, nombre: 'Gorra ONCE', precio: 25000, familia: 'Postres', icono: '🧢',
  }));

  const informe = aplicarPlantilla({ renglones: hoja, usuario: ADMIN });

  assert.deepEqual(informe.familiasCreadas, ['Postres']);
  assert.ok(listarProductos().some((p) => p.nombre === 'Gorra ONCE'));
});

/* ── Lo que ya no viene en la hoja ─────────────────────────────────────── */

test('los que faltan se DETECTAN pero no se tocan sin confirmar', () => {
  const hoja = laHojaDeHoy();
  const fuera = hoja.pop();                   // se borra un renglón de la hoja

  const faltan = losQueFaltan(hoja);
  assert.ok(faltan.some((f) => f.id === fuera.id), 'se detecta el que falta');

  // Se aplica SIN pedir bajas: el producto tiene que seguir en la carta.
  aplicarPlantilla({ renglones: hoja, usuario: ADMIN });
  assert.equal(buscarProducto(fuera.id).activo, true,
    'subir media carta no puede desaparecer la otra media');
});

test('confirmando, se DA DE BAJA — nunca se borra', () => {
  const hoja = laHojaDeHoy();
  const fuera = hoja.find((r) => r.nombre === 'Gorra ONCE');
  const sinLaGorra = hoja.filter((r) => r.id !== fuera.id);

  const informe = aplicarPlantilla({
    renglones: sinLaGorra, darDeBaja: [fuera.id], usuario: ADMIN,
  });

  assert.deepEqual(informe.dadosDeBaja, ['Gorra ONCE']);

  const p = buscarProducto(fuera.id);
  assert.ok(p, 'el producto SIGUE existiendo: los tickets viejos lo necesitan');
  assert.equal(p.activo, false, 'sólo desaparece de la pantalla de venta');
});

test('un renglón sin precio no detiene a los demás', () => {
  const hoja = laHojaDeHoy();
  hoja.push(renglon({ id: null, nombre: 'Sin precio', precio: 'x', familia: 'Bebidas' }));

  const informe = aplicarPlantilla({ renglones: hoja, usuario: ADMIN });

  assert.equal(informe.omitidos.length, 1);
  assert.equal(informe.omitidos[0].nombre, 'Sin precio');
  assert.ok(informe.sinCambio > 40, 'los demás entraron igual');
});

/* ── Las columnas de inventario ────────────────────────────────────────── */

test('con el inventario APAGADO, sus columnas no hacen nada', () => {
  const hoja = laHojaDeHoy();
  const papas = hoja.find((r) => r.nombre === 'Papas');
  papas.inventario = 'Sí';
  papas.existencia = '40';

  const informe = aplicarPlantilla({ renglones: hoja, usuario: ADMIN });

  assert.equal(informe.inventario.seAplico, false);
  assert.equal(informe.inventario.ajustados, 0);
  assert.equal(existenciaDe(papas.id), 0, 'no se movió ni una pieza');
});

test('con el inventario ENCENDIDO, la hoja da de alta y ajusta la existencia', () => {
  cambiarAlmacenActivo({ activo: true, usuario: ADMIN });

  const hoja = laHojaDeHoy();
  const papas = hoja.find((r) => r.nombre === 'Papas');
  papas.inventario = 'Sí';
  papas.existencia = '40';
  papas.unidad = 'bolsa';
  papas.envase = 'caja';
  papas.porciones = '12';

  const informe = aplicarPlantilla({ renglones: hoja, usuario: ADMIN });

  assert.equal(informe.inventario.seAplico, true);
  assert.equal(informe.inventario.dadosDeAlta, 1);
  assert.equal(informe.inventario.ajustados, 1);
  assert.equal(existenciaDe(papas.id), 40);

  const config = configuracionDeAlmacen().find((p) => p.id === papas.id);
  assert.equal(config.controla, true);
  assert.equal(config.unidad, 'bolsa');
  assert.equal(config.porcionesPorEnvase, 12);
});

test('volver a subir la MISMA hoja no vuelve a mover el inventario', () => {
  const hoja = laHojaDeHoy();      // ya trae las papas con 40, recién bajada

  const informe = aplicarPlantilla({ renglones: hoja, usuario: ADMIN });

  assert.equal(informe.inventario.ajustados, 0, 'no había diferencia que ajustar');
  assert.equal(informe.nuevos, 0, 'ni productos que crear');
});

test('un submenú vacío en la hoja NO borra el que ya tenía el producto', () => {
  const antes = listarProductos({ familia: 'Bebidas' }).find((p) => p.opciones);
  assert.ok(antes, 'la carta de ONCE trae productos con submenú');

  const hoja = laHojaDeHoy();
  hoja.find((r) => r.id === antes.id).submenu = '';

  aplicarPlantilla({ renglones: hoja, usuario: ADMIN });

  assert.deepEqual(buscarProducto(antes.id).opciones, antes.opciones,
    'perder los submenús por subir una hoja de precios sería un desastre');
});
