/**
 * SERVIDOR · CONFIGURACIÓN
 * ─────────────────────────────────────────────────────────────────────────────
 * Todo lo que se puede cambiar sin tocar código vive aquí.
 */

export const VERSION = '2.0.0-fase0';

/** Puerto donde escucha RESTA. Las tablets entran a http://IP-DE-LA-LAPTOP:8080 */
export const PUERTO = Number(process.env.RESTA_PUERTO) || 8080;

/**
 * 0.0.0.0 significa "acepta conexiones de toda la red del local", que es
 * justo lo que necesitamos para las tablets.
 * Si algún día quieres que SOLO funcione en la laptop, pon 127.0.0.1
 */
export const DIRECCION = process.env.RESTA_DIRECCION || '0.0.0.0';

/** En desarrollo mostramos más detalle en la consola. */
export const ES_DESARROLLO = process.env.NODE_ENV !== 'production';
