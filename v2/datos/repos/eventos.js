/**
 * DATOS · BITÁCORA
 * ─────────────────────────────────────────────────────────────────────────────
 * La tabla `eventos` SÓLO CRECE. Nunca se borra un renglón.
 *
 * Aquí queda escrito quién hizo qué y cuándo: quién abrió la mesa, quién
 * anotó cada producto, quién quitó una línea y por qué, quién dio la
 * cortesía, quién canceló la cuenta.
 *
 * El día que falte dinero en la caja, este es el lugar donde se va a ver.
 */

import { base } from '../conexion.js';

/**
 * A qué se refiere un evento.
 *
 * Las cuentas se guardan por su número a secas ('4'), pero los usuarios
 * llevan prefijo ('usuario:4'). Sin esto, buscar la historia de la Mesa 4
 * devolvería también las entradas y salidas del mesero número 4, que no
 * tienen nada que ver. Pasó, y ensuciaba justo la pantalla donde uno va a
 * buscar por qué falta dinero.
 */
export const refUsuario = (id) => `usuario:${id}`;

/**
 * Anota un evento.
 * @param tipo       'cuenta.abrir', 'linea.quitar', 'cobro.registrar'…
 * @param referencia a qué cuenta o ticket se refiere
 * @param detalle    cualquier cosa que ayude después (se guarda como JSON)
 * @param usuario    { id, nombre } de quien lo hizo
 */
export function anotarEvento({ tipo, referencia = null, detalle = null, usuario = null }) {
  base().prepare(`
    INSERT INTO eventos (usuario_id, usuario_nom, tipo, referencia, detalle)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    usuario?.id ?? null,
    usuario?.nombre ?? null,
    tipo,
    referencia === null ? null : String(referencia),
    detalle === null ? null : JSON.stringify(detalle),
  );
}

/** Los eventos de una cuenta, del más viejo al más nuevo. */
export function eventosDe(referencia) {
  return base().prepare(`
    SELECT momento, usuario_nom, tipo, detalle
      FROM eventos
     WHERE referencia = ?
     ORDER BY id
  `).all(String(referencia)).map((e) => ({
    ...e,
    detalle: e.detalle ? JSON.parse(e.detalle) : null,
  }));
}

/** Los últimos movimientos, para la pantalla de diagnóstico. */
export function ultimosEventos(cuantos = 50) {
  return base().prepare(`
    SELECT momento, usuario_nom, tipo, referencia, detalle
      FROM eventos
     ORDER BY id DESC
     LIMIT ?
  `).all(cuantos).map((e) => ({
    ...e,
    detalle: e.detalle ? JSON.parse(e.detalle) : null,
  }));
}
