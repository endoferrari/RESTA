/**
 * DATOS · AJUSTES
 * ─────────────────────────────────────────────────────────────────────────────
 * Todo lo configurable del negocio en una sola tabla llave/valor: el nombre
 * del bar, el ancho del ticket, el pie del ticket, qué impresora usar.
 *
 * Está aparte para que no haya SQL suelto por todo el proyecto. Si algún día
 * cambia la forma de guardar los ajustes, se cambia aquí y nada más.
 */

import { base } from '../conexion.js';

/** Lee un ajuste. Si no existe, devuelve lo que se le pase como respaldo. */
export function leerAjuste(clave, siNoHay = null) {
  const fila = base().prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave);
  return fila ? fila.valor : siNoHay;
}

/** Escribe un ajuste (lo crea si no existía). */
export function escribirAjuste(clave, valor) {
  base().prepare(`
    INSERT INTO ajustes (clave, valor, actualizado)
    VALUES (?, ?, datetime('now','localtime'))
    ON CONFLICT(clave) DO UPDATE
      SET valor = excluded.valor, actualizado = excluded.actualizado
  `).run(clave, String(valor));
}

/** Todos los ajustes de golpe, como objeto. Para la pantalla de configuración. */
export function todosLosAjustes() {
  const filas = base().prepare('SELECT clave, valor FROM ajustes ORDER BY clave').all();
  return Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
}
