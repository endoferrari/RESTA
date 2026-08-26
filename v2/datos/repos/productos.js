/**
 * DATOS · PRODUCTOS Y FAMILIAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Todas las consultas del menú viven aquí. Ninguna pantalla ni ruta escribe
 * SQL por su cuenta: así, el día que haya que cambiar una consulta, hay un
 * solo lugar donde buscarla.
 *
 * Los precios entran y salen SIEMPRE en centavos enteros.
 * El submenú (`opciones`) se guarda como JSON y se devuelve ya convertido,
 * para que quien lo use no tenga que acordarse de hacer JSON.parse.
 */

import { base, enTransaccion } from '../conexion.js';

/** Convierte una fila de la base en un producto listo para usar. */
function aProducto(fila) {
  if (!fila) return null;
  return {
    id: fila.id,
    familia: fila.familia,
    nombre: fila.nombre,
    icono: fila.icono,
    precio: fila.precio,                    // centavos
    opciones: fila.opciones ? JSON.parse(fila.opciones) : null,
    orden: fila.orden,
    activo: fila.activo === 1,
  };
}

/* ── Familias ──────────────────────────────────────────────────────────── */

export function listarFamilias({ soloActivas = true } = {}) {
  const filtro = soloActivas ? 'WHERE activa = 1' : '';
  return base()
    .prepare(`SELECT clave, nombre, emoji, orden, activa FROM familias ${filtro} ORDER BY orden, clave`)
    .all()
    .map((f) => ({ ...f, activa: f.activa === 1 }));
}

/** Las familias con cuántos productos tiene cada una. Para configurarlas. */
export function familiasConCuenta() {
  return base().prepare(`
    SELECT f.clave, f.nombre, f.emoji, f.orden, f.activa,
           (SELECT count(*) FROM productos p WHERE p.familia = f.clave AND p.activo = 1) AS productos
      FROM familias f
     ORDER BY f.orden, f.clave
  `).all().map((f) => ({ ...f, activa: f.activa === 1 }));
}

/**
 * La `clave` es el identificador interno; el `nombre` es lo que se ve.
 * Se separan para que renombrar «Bebidas» a «Barra» no rompa los productos
 * que ya estaban dentro.
 */
function claveDesde(nombre) {
  return String(nombre)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'familia';
}

export function crearFamilia({ nombre, emoji = '🍽️' }) {
  const limpio = String(nombre ?? '').trim().replace(/\s+/g, ' ');
  if (!limpio) throw new Error('Escribe el nombre de la familia.');
  if (limpio.length > 30) throw new Error('El nombre es muy largo; usa menos de 30 letras.');

  const yaEsta = base()
    .prepare('SELECT clave FROM familias WHERE lower(nombre) = lower(?)')
    .get(limpio);
  if (yaEsta) throw new Error(`Ya existe una familia llamada «${limpio}».`);

  // Si la clave se repite, se le agrega un número.
  //
  // La comparación va en minúsculas a propósito: si una familia se llamaba
  // «Souvenirs» y se renombró a «CANCHAS», su clave interna sigue siendo
  // «Souvenirs». Sin esto, crear una familia nueva llamada «Souvenirs»
  // generaría la clave «souvenirs» —distinta para la base, igualita a la
  // vista— y quedarían dos familias imposibles de distinguir.
  const existe = base().prepare('SELECT 1 FROM familias WHERE lower(clave) = lower(?)');

  let clave = claveDesde(limpio);
  let n = 2;
  while (existe.get(clave)) clave = `${claveDesde(limpio)}-${n++}`;

  const { ultimo } = base().prepare('SELECT COALESCE(max(orden), 0) AS ultimo FROM familias').get();

  base().prepare(`
    INSERT INTO familias (clave, nombre, emoji, orden) VALUES (?, ?, ?, ?)
  `).run(clave, limpio, String(emoji || '🍽️'), ultimo + 1);

  return { clave, nombre: limpio, emoji, orden: ultimo + 1, activa: true, productos: 0 };
}

export function editarFamilia({ clave, nombre, emoji, activa }) {
  const f = base().prepare('SELECT * FROM familias WHERE clave = ?').get(clave);
  if (!f) throw new Error('Esa familia no existe.');

  if (nombre !== undefined) {
    const limpio = String(nombre).trim().replace(/\s+/g, ' ');
    if (!limpio) throw new Error('Escribe el nombre de la familia.');

    const otra = base()
      .prepare('SELECT clave FROM familias WHERE lower(nombre) = lower(?) AND clave <> ?')
      .get(limpio, clave);
    if (otra) throw new Error(`Ya existe otra familia llamada «${limpio}».`);

    base().prepare('UPDATE familias SET nombre = ? WHERE clave = ?').run(limpio, clave);
  }

  if (emoji !== undefined) {
    base().prepare('UPDATE familias SET emoji = ? WHERE clave = ?').run(String(emoji || '🍽️'), clave);
  }

  if (activa !== undefined) {
    // Apagar una familia la esconde de la pantalla de venta; sus productos
    // no se borran ni cambian de precio. Los tickets viejos siguen igual.
    base().prepare('UPDATE familias SET activa = ? WHERE clave = ?').run(activa ? 1 : 0, clave);
  }

  return familiasConCuenta().find((x) => x.clave === clave);
}

/** Sube o baja una familia en el orden de las pestañas. */
export function moverFamilia({ clave, haciaArriba = true }) {
  return enTransaccion(() => {
    const todas = base()
      .prepare('SELECT clave, orden FROM familias ORDER BY orden, clave')
      .all();

    const i = todas.findIndex((f) => f.clave === clave);
    if (i < 0) throw new Error('Esa familia no existe.');

    const j = haciaArriba ? i - 1 : i + 1;
    if (j < 0 || j >= todas.length) return familiasConCuenta();   // ya está en la orilla

    // Se reescribe TODO el orden de 1 a N. Es más simple que intercambiar
    // dos números y deja el orden limpio aunque venga desordenado de antes.
    const nuevo = [...todas];
    [nuevo[i], nuevo[j]] = [nuevo[j], nuevo[i]];

    const poner = base().prepare('UPDATE familias SET orden = ? WHERE clave = ?');
    nuevo.forEach((f, k) => poner.run(k + 1, f.clave));

    return familiasConCuenta();
  });
}

/* ── Productos ─────────────────────────────────────────────────────────── */

export function listarProductos({ soloActivos = true, familia = null } = {}) {
  const donde = [];
  const valores = [];
  if (soloActivos) donde.push('activo = 1');
  if (familia) { donde.push('familia = ?'); valores.push(familia); }
  const filtro = donde.length ? 'WHERE ' + donde.join(' AND ') : '';

  return base()
    .prepare(`SELECT * FROM productos ${filtro} ORDER BY orden, id`)
    .all(...valores)
    .map(aProducto);
}

export function buscarProducto(id) {
  return aProducto(base().prepare('SELECT * FROM productos WHERE id = ?').get(id));
}

export function contarProductos() {
  return base().prepare('SELECT count(*) AS total FROM productos').get().total;
}

/**
 * Guarda un producto nuevo.
 * Si ya existe uno con el mismo nombre en la misma familia, lo actualiza en
 * vez de duplicarlo: así importar el mismo respaldo dos veces no llena la
 * carta de repetidos.
 */
export function guardarProducto(p) {
  const opciones = p.opciones ? JSON.stringify(p.opciones) : null;

  const r = base().prepare(`
    INSERT INTO productos (familia, nombre, icono, precio, opciones, orden, activo, id_v1)
    VALUES (@familia, @nombre, @icono, @precio, @opciones, @orden, @activo, @id_v1)
    ON CONFLICT(familia, nombre) DO UPDATE SET
      icono       = excluded.icono,
      precio      = excluded.precio,
      opciones    = excluded.opciones,
      orden       = excluded.orden,
      activo      = excluded.activo,
      id_v1       = COALESCE(productos.id_v1, excluded.id_v1),
      actualizado = datetime('now','localtime')
  `).run({
    familia:  p.familia,
    nombre:   p.nombre,
    icono:    p.icono ?? '',
    precio:   p.precio,
    opciones,
    orden:    p.orden ?? 0,
    activo:   p.activo === false ? 0 : 1,
    id_v1:    p.id_v1 ?? null,
  });

  // En un UPDATE, lastInsertRowid no sirve: hay que ir por el id real.
  if (r.changes && r.lastInsertRowid) return Number(r.lastInsertRowid);
  return base()
    .prepare('SELECT id FROM productos WHERE familia = ? AND nombre = ?')
    .get(p.familia, p.nombre).id;
}

/* ── Alta y edición desde la pantalla de configuración ─────────────────── */

/** Revisa lo que se capturó y truena con un mensaje que se pueda leer. */
function revisarProducto({ nombre, precio, familia }) {
  const limpio = String(nombre ?? '').trim().replace(/\s+/g, ' ');
  if (!limpio) throw new Error('Escribe el nombre del producto.');
  if (limpio.length > 60) throw new Error('El nombre es muy largo; usa menos de 60 letras.');

  if (!Number.isInteger(precio) || precio < 0) {
    throw new Error('El precio no es válido.');
  }
  if (precio > 100_000_000) throw new Error('Ese precio es demasiado alto. ¿Sobran ceros?');

  const f = base().prepare('SELECT clave FROM familias WHERE clave = ?').get(familia);
  if (!f) throw new Error('Elige una familia para el producto.');

  return limpio;
}

/**
 * Da de alta un producto.
 * `opciones` llega como TEXTO (el submenú tal como se escribe en la
 * pantalla) y aquí se convierte. Si el texto no se entiende, el producto se
 * guarda sin submenú en vez de trunar: es preferible un producto sin
 * preguntas a no poder guardarlo.
 */
export function crearProducto({ nombre, precio, familia, icono = '🍽️', opciones = null }) {
  const limpio = revisarProducto({ nombre, precio, familia });

  const repetido = base()
    .prepare('SELECT id, activo FROM productos WHERE familia = ? AND lower(nombre) = lower(?)')
    .get(familia, limpio);

  if (repetido) {
    throw new Error(repetido.activo
      ? `«${limpio}» ya está en esa familia.`
      : `«${limpio}» ya existía en esa familia y está dado de baja. Vuélvelo a activar.`);
  }

  const { ultimo } = base()
    .prepare('SELECT COALESCE(max(orden), 0) AS ultimo FROM productos WHERE familia = ?')
    .get(familia);

  const r = base().prepare(`
    INSERT INTO productos (familia, nombre, icono, precio, opciones, orden)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(familia, limpio, String(icono || '🍽️'), precio,
         opciones ? JSON.stringify(opciones) : null, ultimo + 1);

  return buscarProducto(Number(r.lastInsertRowid));
}

/**
 * Cambia un producto.
 *
 * OJO con el precio: cambiarlo aquí NO toca las cuentas abiertas ni los
 * tickets viejos, porque cada renglón guardó su propio precio al anotarse.
 * Lo nuevo que se anote sí saldrá al precio nuevo.
 */
export function editarProducto({ id, nombre, precio, familia, icono, opciones, activo }) {
  const actual = buscarProducto(id);
  if (!actual) throw new Error('Ese producto ya no existe.');

  const nuevoNombre  = nombre  === undefined ? actual.nombre  : nombre;
  const nuevoPrecio  = precio  === undefined ? actual.precio  : precio;
  const nuevaFamilia = familia === undefined ? actual.familia : familia;

  const limpio = revisarProducto({ nombre: nuevoNombre, precio: nuevoPrecio, familia: nuevaFamilia });

  const choca = base()
    .prepare('SELECT id FROM productos WHERE familia = ? AND lower(nombre) = lower(?) AND id <> ?')
    .get(nuevaFamilia, limpio, id);
  if (choca) throw new Error(`Ya hay otro «${limpio}» en esa familia.`);

  base().prepare(`
    UPDATE productos
       SET nombre = ?, precio = ?, familia = ?, icono = ?, opciones = ?, activo = ?,
           actualizado = datetime('now','localtime')
     WHERE id = ?
  `).run(
    limpio,
    nuevoPrecio,
    nuevaFamilia,
    icono === undefined ? actual.icono : String(icono || '🍽️'),
    opciones === undefined
      ? (actual.opciones ? JSON.stringify(actual.opciones) : null)
      : (opciones ? JSON.stringify(opciones) : null),
    activo === undefined ? (actual.activo ? 1 : 0) : (activo ? 1 : 0),
    id,
  );

  return buscarProducto(id);
}

/** Vuelve a poner en la carta un producto dado de baja. */
export function encenderProducto(id) {
  base().prepare(`
    UPDATE productos SET activo = 1, actualizado = datetime('now','localtime')
     WHERE id = ?
  `).run(id);
  return buscarProducto(id);
}

/**
 * Agrega una opción nueva a un grupo del submenú de un producto.
 *
 * Esto es la petición especial del cliente: «con poco hielo», «sin sal en el
 * vaso», «bien frío». El mesero la escribe en la mesa y QUEDA GUARDADA como
 * una opción más de ese producto, así la próxima vez ya sale con un botón.
 *
 * De esa forma el menú se va llenando solo con lo que de verdad pide la
 * gente, en vez de tener que adivinarlo el día que se captura la carta.
 *
 * Devuelve el producto ya actualizado, o null si el grupo no existe.
 * Si la opción ya estaba (aunque escrita con otros acentos o mayúsculas),
 * no se duplica: se devuelve la que ya había.
 */
export function agregarOpcion({ productoId, grupo, opcion }) {
  const limpia = String(opcion ?? '').trim().replace(/\s+/g, ' ');
  if (!limpia) throw new Error('Escribe qué pidió el cliente.');
  if (limpia.length > 60) throw new Error('La petición es muy larga; resúmela en pocas palabras.');

  const p = buscarProducto(productoId);
  if (!p) throw new Error('Ese producto ya no está en la carta.');
  if (!p.opciones) throw new Error('Ese producto no pregunta nada, no se le pueden agregar opciones.');

  const g = p.opciones.find((o) => o.g === grupo);
  if (!g) throw new Error(`Ese producto no tiene la pregunta «${grupo}».`);

  const normalizar = (s) =>
    String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const yaEstaba = g.ops.find((o) => normalizar(o) === normalizar(limpia));
  if (yaEstaba) return { producto: p, opcion: yaEstaba, esNueva: false };

  g.ops.push(limpia);

  base().prepare(`
    UPDATE productos SET opciones = ?, actualizado = datetime('now','localtime')
     WHERE id = ?
  `).run(JSON.stringify(p.opciones), productoId);

  return { producto: buscarProducto(productoId), opcion: limpia, esNueva: true };
}

/**
 * Un producto que ya se usó NUNCA se borra: se apaga.
 * Si se borrara, los tickets de hace meses apuntarían a la nada y el corte
 * de ese día dejaría de cuadrar. (La única excepción vive abajo, en
 * eliminarProducto: el producto que jamás se usó.)
 */
export function apagarProducto(id) {
  base().prepare(`
    UPDATE productos SET activo = 0, actualizado = datetime('now','localtime')
    WHERE id = ?
  `).run(id);
}

/**
 * Eliminar POR COMPLETO un producto — la excepción a «nunca se borra».
 *
 * Sólo se permite cuando el producto no dejó huella: ni una venta anotada,
 * ni un movimiento de almacén, ni otro producto que gaste de él. En ese caso
 * borrarlo no rompe nada, porque nada lo recuerda: es para el producto que
 * se capturó mal o de prueba y nunca llegó a usarse.
 *
 * Si ya tiene historia, se truena con el motivo: esos tickets y esos cortes
 * lo necesitan para siempre, y para eso está la baja.
 *
 * Devuelve el producto tal como era, para que quien lo llame lo deje
 * anotado en la tabla de eventos antes de perderlo de vista.
 */
export function eliminarProducto(id) {
  const p = buscarProducto(id);
  if (!p) throw new Error('Ese producto ya no existe.');

  const ventas = base()
    .prepare('SELECT count(*) AS n FROM lineas WHERE producto_id = ?')
    .get(id).n;
  if (ventas > 0) {
    throw new Error(
      `«${p.nombre}» aparece en ${ventas === 1 ? 'una venta anotada' : `${ventas} ventas anotadas`}. ` +
      'No se puede borrar del todo porque esos tickets y sus cortes lo necesitan. ' +
      'Déjalo dado de baja: no vuelve a aparecer en la pantalla de venta.');
  }

  const almacen = base()
    .prepare('SELECT count(*) AS n FROM movimientos_stock WHERE producto_id = ?')
    .get(id).n;
  if (almacen > 0) {
    throw new Error(
      `«${p.nombre}» tiene movimientos en el almacén. No se puede borrar del ` +
      'todo porque la historia del inventario lo necesita. Déjalo dado de baja.');
  }

  const gastan = base()
    .prepare('SELECT nombre FROM productos WHERE gasta_producto_id = ?')
    .all(id);
  if (gastan.length > 0) {
    throw new Error(
      `No se puede borrar «${p.nombre}»: ` +
      `${gastan.map((g) => `«${g.nombre}»`).join(', ')} descuenta(n) su almacén de él. ` +
      'Cambia eso primero en el almacén.');
  }

  base().prepare('DELETE FROM productos WHERE id = ?').run(id);
  return p;
}

/* ── El menú completo, como lo pide la pantalla de venta ────────────────── */

export function menuCompleto() {
  // Salen TODAS las familias activas, aunque estén vacías.
  //
  // Antes se escondían las que no tenían productos, pensando que una pestaña
  // vacía le estorba al mesero. Fue un error: quien acaba de crear una
  // familia no la veía por ningún lado y no podía saber si se había guardado.
  // Si una familia molesta, se esconde a propósito desde la configuración —
  // que el sistema haga lo que uno configuró, sin filtros escondidos.
  const productos = listarProductos();

  return {
    familias: listarFamilias(),
    productos,
    total: productos.length,
  };
}
