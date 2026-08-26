/**
 * PRUEBAS · CONFIGURAR LA CARTA
 * ─────────────────────────────────────────────────────────────────────────────
 * Se corren con:   npm test
 *
 * Dar de alta familias y productos, y las peticiones especiales del cliente.
 *
 * Lo que más se vigila aquí: que **dar de baja un producto NO rompa las
 * cuentas ni los tickets de antes**. Si eso falla, el corte de hace tres
 * meses deja de cuadrar y no hay forma de arreglarlo.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CARPETA = mkdtempSync(join(tmpdir(), 'resta-config-'));
process.env.RESTA_DATOS = CARPETA;

let abrirBase, cerrarBase;
let familiasConCuenta, crearFamilia, editarFamilia, moverFamilia, listarFamilias;
let crearProducto, editarProducto, apagarProducto, encenderProducto, eliminarProducto;
let listarProductos, buscarProducto, agregarOpcion, menuCompleto;
let abrirCuenta, anotarLinea, buscarCuenta;
let parseOpciones;
let ANA;

before(async () => {
  ({ abrirBase, cerrarBase } = await import('../datos/conexion.js'));
  ({
    familiasConCuenta, crearFamilia, editarFamilia, moverFamilia, listarFamilias,
    crearProducto, editarProducto, apagarProducto, encenderProducto, eliminarProducto,
    listarProductos, buscarProducto, agregarOpcion, menuCompleto,
  } = await import('../datos/repos/productos.js'));
  ({ abrirCuenta, anotarLinea, buscarCuenta } = await import('../datos/repos/cuentas.js'));
  ({ parseOpciones } = await import('../nucleo/opciones.js'));
  const { crearUsuario } = await import('../datos/repos/usuarios.js');

  abrirBase({ silencioso: true });
  ANA = crearUsuario({ nombre: 'Ana', pin: '1111', rol: 'mesero' });
});

after(() => {
  cerrarBase();
  rmSync(CARPETA, { recursive: true, force: true });
});

/* ── Familias ──────────────────────────────────────────────────────────── */

test('se puede crear una familia nueva, como Canchas', () => {
  const f = crearFamilia({ nombre: 'Canchas', emoji: '🎱' });

  assert.equal(f.nombre, 'Canchas');
  assert.equal(f.emoji, '🎱');
  assert.equal(f.productos, 0);
  assert.ok(familiasConCuenta().some((x) => x.nombre === 'Canchas'));
});

test('no se permiten dos familias con el mismo nombre', () => {
  assert.throws(() => crearFamilia({ nombre: 'canchas' }), /Ya existe una familia/);
});

test('una familia sin nombre no se crea', () => {
  assert.throws(() => crearFamilia({ nombre: '   ' }), /Escribe el nombre/);
});

test('renombrar una familia NO mueve sus productos', () => {
  const antes = listarProductos({ familia: 'Bebidas' }).length;
  assert.ok(antes > 0);

  editarFamilia({ clave: 'Bebidas', nombre: 'Barra' });

  // Los productos siguen en la misma familia: cambió el nombre que se ve,
  // no el identificador interno.
  assert.equal(listarProductos({ familia: 'Bebidas' }).length, antes);
  assert.equal(familiasConCuenta().find((f) => f.clave === 'Bebidas').nombre, 'Barra');

  editarFamilia({ clave: 'Bebidas', nombre: 'Bebidas' });
});

test('apagar una familia la esconde de la venta pero no borra nada', () => {
  const cuantosAntes = listarProductos({ familia: 'Comida' }).length;

  editarFamilia({ clave: 'Comida', activa: false });

  assert.ok(!listarFamilias().some((f) => f.clave === 'Comida'), 'ya no sale en la venta');
  assert.equal(listarProductos({ familia: 'Comida' }).length, cuantosAntes,
    'sus productos siguen ahí');

  editarFamilia({ clave: 'Comida', activa: true });
  assert.ok(listarFamilias().some((f) => f.clave === 'Comida'));
});

test('una familia vacía SÍ sale en la pantalla de venta', () => {
  // Antes se escondían las que no tenían productos y quien acababa de crear
  // una no la veía por ningún lado: no había forma de saber si se guardó.
  crearFamilia({ nombre: 'Recién creada', emoji: '🆕' });

  const enLaVenta = menuCompleto().familias.map((f) => f.nombre);
  assert.ok(enLaVenta.includes('Recién creada'));
});

test('esconder una familia SÍ la quita de la venta', () => {
  const f = familiasConCuenta().find((x) => x.nombre === 'Recién creada');
  editarFamilia({ clave: f.clave, activa: false });

  assert.ok(!menuCompleto().familias.some((x) => x.nombre === 'Recién creada'),
    'lo que se esconde a propósito sí se va');
});

test('renombrar una familia no permite que otra choque con su clave vieja', () => {
  // Caso real: «Souvenirs» renombrada a «CANCHAS». Su clave interna sigue
  // siendo «Souvenirs». Crear ahora una familia llamada «Souvenirs» no debe
  // quedarse con esa misma clave.
  const original = crearFamilia({ nombre: 'Temporal', emoji: '📦' });
  editarFamilia({ clave: original.clave, nombre: 'Renombrada' });

  const nueva = crearFamilia({ nombre: 'Temporal' });

  assert.notEqual(nueva.clave, original.clave);
  assert.notEqual(nueva.clave.toLowerCase(), original.clave.toLowerCase());

  editarFamilia({ clave: original.clave, activa: false });
  editarFamilia({ clave: nueva.clave, activa: false });
});

test('las familias se pueden reordenar', () => {
  const antes = familiasConCuenta().map((f) => f.clave);
  moverFamilia({ clave: antes[1], haciaArriba: true });

  const despues = familiasConCuenta().map((f) => f.clave);
  assert.equal(despues[0], antes[1]);
  assert.equal(despues[1], antes[0]);

  moverFamilia({ clave: antes[0], haciaArriba: true });   // se deja como estaba
});

test('mover la primera hacia arriba no truena ni cambia nada', () => {
  const antes = familiasConCuenta().map((f) => f.clave);
  moverFamilia({ clave: antes[0], haciaArriba: true });
  assert.deepEqual(familiasConCuenta().map((f) => f.clave), antes);
});

/* ── Productos ─────────────────────────────────────────────────────────── */

test('se da de alta un producto con su submenú', () => {
  const p = crearProducto({
    nombre: 'Hora de billar',
    precio: 8000,
    familia: familiasConCuenta().find((f) => f.nombre === 'Canchas').clave,
    icono: '🎱',
    opciones: parseOpciones('Mesa: 1, 2, 3, 4'),
  });

  assert.equal(p.nombre, 'Hora de billar');
  assert.equal(p.precio, 8000);
  assert.deepEqual(p.opciones, [{ g: 'Mesa', ops: ['1', '2', '3', '4'] }]);
  assert.equal(p.activo, true);
});

test('no se puede repetir el nombre dentro de la misma familia', () => {
  const canchas = familiasConCuenta().find((f) => f.nombre === 'Canchas').clave;
  assert.throws(
    () => crearProducto({ nombre: 'hora de billar', precio: 5000, familia: canchas }),
    /ya está en esa familia/
  );
});

test('el mismo nombre SÍ se puede en otra familia', () => {
  const p = crearProducto({ nombre: 'Hora de billar', precio: 8000, familia: 'Comida' });
  assert.ok(p.id);
  apagarProducto(p.id);
});

test('un precio inválido no se guarda', () => {
  assert.throws(
    () => crearProducto({ nombre: 'Raro', precio: -100, familia: 'Comida' }),
    /precio no es válido/
  );
  assert.throws(
    () => crearProducto({ nombre: 'Raro', precio: 1.5, familia: 'Comida' }),
    /precio no es válido/
  );
  assert.throws(
    () => crearProducto({ nombre: 'Carísimo', precio: 999_999_999, familia: 'Comida' }),
    /demasiado alto/
  );
});

test('una familia que no existe no deja guardar', () => {
  assert.throws(
    () => crearProducto({ nombre: 'Perdido', precio: 1000, familia: 'inventada' }),
    /Elige una familia/
  );
});

/* ── LA PRUEBA QUE MÁS IMPORTA ─────────────────────────────────────────── */

test('cambiar el precio NO toca las cuentas abiertas ni los tickets viejos', () => {
  const cerveza = listarProductos({ familia: 'Bebidas' }).find((p) => p.nombre === 'Cerveza');

  const { cuenta } = abrirCuenta({ nombre: 'Mesa prueba precio', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, cant: 2, usuario: ANA });

  const antes = buscarCuenta(cuenta.id).totales.total;
  assert.equal(antes, 8000);

  // El administrador sube la cerveza a $60 desde la configuración.
  editarProducto({ id: cerveza.id, precio: 6000 });

  assert.equal(buscarCuenta(cuenta.id).totales.total, 8000,
    'la cuenta abierta conserva el precio con que se anotó');

  editarProducto({ id: cerveza.id, precio: 4000 });
});

test('dar de baja un producto NO rompe la cuenta donde ya estaba anotado', () => {
  const papas = listarProductos({ familia: 'Comida' }).find((p) => p.nombre === 'Papas');

  const { cuenta } = abrirCuenta({ nombre: 'Mesa prueba baja', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: papas.id, usuario: ANA });

  apagarProducto(papas.id);

  const c = buscarCuenta(cuenta.id);
  assert.equal(c.items.length, 1, 'el renglón sigue en la cuenta');
  assert.equal(c.items[0].nombre, 'Papas');
  assert.equal(c.totales.total, 2500, 'y con su precio');

  // Pero ya no se puede anotar más.
  assert.throws(
    () => anotarLinea({ cuentaId: cuenta.id, productoId: papas.id, usuario: ANA }),
    /ya no está en la carta/
  );

  encenderProducto(papas.id);
});

test('un producto dado de baja desaparece de la pantalla de venta', () => {
  const galletas = listarProductos({ familia: 'Comida' }).find((p) => p.nombre === 'Galletas');

  assert.ok(menuCompleto().productos.some((p) => p.id === galletas.id));
  apagarProducto(galletas.id);
  assert.ok(!menuCompleto().productos.some((p) => p.id === galletas.id));

  // Pero sigue existiendo para configurarlo y volverlo a activar.
  assert.ok(listarProductos({ soloActivos: false }).some((p) => p.id === galletas.id));

  encenderProducto(galletas.id);
  assert.ok(menuCompleto().productos.some((p) => p.id === galletas.id));
});

/* ── Eliminar por completo: sólo el que nunca se usó ───────────────────── */

test('un producto que nunca se vendió SÍ se puede eliminar por completo', () => {
  const p = crearProducto({ nombre: 'Capturado por error', precio: 1000, familia: 'Comida' });

  const eliminado = eliminarProducto(p.id);
  assert.equal(eliminado.nombre, 'Capturado por error');

  // Ya no existe ni entre los dados de baja: como si nunca se hubiera capturado.
  assert.equal(buscarProducto(p.id), null);
  assert.ok(!listarProductos({ soloActivos: false }).some((x) => x.id === p.id));

  // Y su nombre queda libre para capturarlo de nuevo sin pleito.
  const otraVez = crearProducto({ nombre: 'Capturado por error', precio: 1000, familia: 'Comida' });
  eliminarProducto(otraVez.id);
});

test('un producto con ventas anotadas NO se puede eliminar por completo', () => {
  const p = crearProducto({ nombre: 'Ya vendido una vez', precio: 2000, familia: 'Comida' });

  const { cuenta } = abrirCuenta({ nombre: 'Mesa prueba eliminar', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: p.id, usuario: ANA });

  // Se niega con el motivo, y el producto sigue entero.
  assert.throws(() => eliminarProducto(p.id), /una venta anotada/);
  assert.ok(buscarProducto(p.id));

  // La cuenta donde se vendió tampoco se inmuta.
  assert.equal(buscarCuenta(cuenta.id).items[0].nombre, 'Ya vendido una vez');

  apagarProducto(p.id);   // el camino que sí tiene: la baja
});

test('eliminar un producto que no existe truena con un mensaje claro', () => {
  assert.throws(() => eliminarProducto(999999), /ya no existe/);
});

test('un producto se puede mover de familia', () => {
  const p = crearProducto({ nombre: 'Cacahuates japoneses', precio: 3000, familia: 'Comida' });
  const canchas = familiasConCuenta().find((f) => f.nombre === 'Canchas').clave;

  const movido = editarProducto({ id: p.id, familia: canchas });
  assert.equal(movido.familia, canchas);
  assert.ok(!listarProductos({ familia: 'Comida' }).some((x) => x.id === p.id));

  apagarProducto(p.id);
});

test('editar no deja chocar con otro producto de la misma familia', () => {
  const comida = listarProductos({ familia: 'Comida' });
  const uno = comida[0];
  const otro = comida[1];

  assert.throws(
    () => editarProducto({ id: uno.id, nombre: otro.nombre }),
    /Ya hay otro/
  );
});

/* ── Peticiones especiales del cliente ─────────────────────────────────── */

test('lo que pide un cliente queda guardado como opción del producto', () => {
  const cerveza = listarProductos({ familia: 'Bebidas' }).find((p) => p.nombre === 'Cerveza');

  const r = agregarOpcion({
    productoId: cerveza.id, grupo: 'Marca', opcion: 'Victoria bien fría',
  });

  assert.equal(r.esNueva, true);
  assert.equal(r.opcion, 'Victoria bien fría');

  const marcas = buscarProducto(cerveza.id).opciones.find((o) => o.g === 'Marca').ops;
  assert.ok(marcas.includes('Victoria bien fría'));
});

test('la misma petición escrita distinto NO se duplica', () => {
  const cerveza = listarProductos({ familia: 'Bebidas' }).find((p) => p.nombre === 'Cerveza');
  const cuantas = buscarProducto(cerveza.id).opciones.find((o) => o.g === 'Marca').ops.length;

  const r = agregarOpcion({
    productoId: cerveza.id, grupo: 'Marca', opcion: 'VICTORIA BIEN FRIA',
  });

  assert.equal(r.esNueva, false);
  assert.equal(r.opcion, 'Victoria bien fría', 'devuelve la que ya estaba escrita');
  assert.equal(
    buscarProducto(cerveza.id).opciones.find((o) => o.g === 'Marca').ops.length,
    cuantas
  );
});

test('una petición vacía o larguísima se rechaza con un mensaje claro', () => {
  const cerveza = listarProductos({ familia: 'Bebidas' }).find((p) => p.nombre === 'Cerveza');

  assert.throws(
    () => agregarOpcion({ productoId: cerveza.id, grupo: 'Marca', opcion: '   ' }),
    /Escribe qué pidió/
  );
  assert.throws(
    () => agregarOpcion({ productoId: cerveza.id, grupo: 'Marca', opcion: 'x'.repeat(80) }),
    /muy larga/
  );
});

test('no se puede agregar a una pregunta que el producto no tiene', () => {
  const cerveza = listarProductos({ familia: 'Bebidas' }).find((p) => p.nombre === 'Cerveza');
  assert.throws(
    () => agregarOpcion({ productoId: cerveza.id, grupo: 'Inventado', opcion: 'algo' }),
    /no tiene la pregunta/
  );
});

test('a un producto sin submenú se avisa que no se le pueden agregar opciones', () => {
  const agua = listarProductos({ familia: 'Refrescos' }).find((p) => p.nombre === 'Agua 500 ml');
  assert.equal(agua.opciones, null);

  assert.throws(
    () => agregarOpcion({ productoId: agua.id, grupo: 'Sabor', opcion: 'algo' }),
    /no pregunta nada/
  );
});

/* ── Editar un producto no le cambia la familia ────────────────────────── */

test('cambiarle el nombre a un producto lo deja en su familia', () => {
  // La pantalla tenía un error: al abrir un producto para editarlo, el
  // desplegable de familia se iba a la primera («Bebidas»), así que guardar
  // un cambio de nombre le movía la familia sin avisar. Aquí se fija la
  // regla del lado del servidor: si no se manda familia, no se toca.
  const fam = crearFamilia({ nombre: 'Canchas de padel' });
  const p = crearProducto({ nombre: 'CANCHA 1', precio: 15000, familia: fam.clave });

  editarProducto({ id: p.id, nombre: 'CANCHA 1 (techada)' });

  const despues = buscarProducto(p.id);
  assert.equal(despues.nombre, 'CANCHA 1 (techada)');
  assert.equal(despues.familia, fam.clave, 'la familia no se movió');
});
