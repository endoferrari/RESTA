/**
 * SERVIDOR · CONFIGURACIÓN
 * ─────────────────────────────────────────────────────────────────────────────
 * Todo lo que se puede cambiar sin tocar código vive aquí.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * La versión se lee de package.json, NO se escribe aquí a mano.
 * Estaba escrita a mano y se quedó en «fase0» hasta la fase 6: el letrero
 * del arranque y la pantalla de diagnóstico mentían sobre qué versión estaba
 * corriendo, que es justo el dato que uno necesita cuando algo falla en el bar.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));

export const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(join(AQUI, '..', 'package.json'), 'utf8')).version;
  } catch {
    return 'desconocida';
  }
})();

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
