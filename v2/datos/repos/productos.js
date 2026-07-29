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

import { base } from '../conexion.js';

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

/**
 * Un producto NUNCA se borra: se apaga.
 * Si se borrara, los tickets de hace meses apuntarían a la nada y el corte
 * de ese día dejaría de cuadrar.
 */
export function apagarProducto(id) {
  base().prepare(`
    UPDATE productos SET activo = 0, actualizado = datetime('now','localtime')
    WHERE id = ?
  `).run(id);
}

/* ── El menú completo, como lo pide la pantalla de venta ────────────────── */

export function menuCompleto() {
  const familias = listarFamilias();
  const productos = listarProductos();

  // Sólo se muestran las pestañas que tienen algo adentro: una familia vacía
  // en la pantalla del mesero nada más estorba.
  const conProductos = familias.filter((f) => productos.some((p) => p.familia === f.clave));

  return {
    familias: conProductos,
    productos,
    total: productos.length,
  };
}
