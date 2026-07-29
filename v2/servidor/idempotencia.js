/**
 * SERVIDOR · FOLIO POR ACCIÓN (no hacer dos veces lo mismo)
 * ─────────────────────────────────────────────────────────────────────────────
 * Este es el detalle que separa un punto de venta serio de uno de juguete.
 *
 * Cada acción que sale de una tablet trae una cabecera `X-Folio-Operacion` con
 * un identificador único. Si esa misma petición llega dos veces —porque el
 * mesero tocó «Cobrar» dos veces al ver que tardaba, o porque el WiFi parpadeó
 * y el navegador reintentó— aquí se reconoce el folio y se devuelve el
 * resultado de la PRIMERA vez, sin volver a ejecutar nada.
 *
 * Sin esto, tarde o temprano hay un cobro duplicado y un cliente enojado.
 */

import { base } from '../datos/conexion.js';

/**
 * Envuelve la acción de una ruta.
 *
 * `accion` debe ser una función normal (no async): se corre dentro de la
 * misma transacción que su registro, para que sea imposible que la acción se
 * haya hecho y el folio no haya quedado anotado.
 */
export function conFolio(peticion, ruta, accion) {
  const folio = peticion.headers['x-folio-operacion'];

  // Sin folio se ejecuta igual: es lo que hace un navegador entrando a mano.
  // Las tablets siempre lo mandan (lo pone cliente/js/api.js).
  if (!folio) return accion();

  const yaHecha = base()
    .prepare('SELECT resultado FROM operaciones WHERE folio = ?')
    .get(folio);

  if (yaHecha) {
    const resultado = JSON.parse(yaHecha.resultado);
    return { ...resultado, repetida: true };
  }

  const anotar = base().prepare(
    'INSERT INTO operaciones (folio, ruta, resultado) VALUES (?, ?, ?)'
  );

  // Todo junto: o se hizo la acción Y quedó anotado el folio, o no pasó nada.
  return base().transaction(() => {
    const resultado = accion();
    anotar.run(folio, ruta, JSON.stringify(resultado));
    return resultado;
  })();
}

/**
 * Borra folios viejos. Se llama al cerrar el turno.
 * Guardar folios de hace meses no sirve de nada: un reintento llega en
 * segundos, no en semanas.
 */
export function limpiarFoliosViejos({ dias = 3 } = {}) {
  const r = base()
    .prepare(`DELETE FROM operaciones WHERE momento < datetime('now','localtime', ?)`)
    .run(`-${dias} days`);
  return r.changes;
}
