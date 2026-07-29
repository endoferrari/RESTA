/**
 * DATOS · DÓNDE VIVE TODO
 * ─────────────────────────────────────────────────────────────────────────────
 * Un solo lugar decide en qué carpeta se guardan la base de datos, los
 * respaldos y la bitácora. Así nunca hay dos partes del código apuntando
 * a rutas distintas.
 *
 * REGLA CRÍTICA: la base de datos NUNCA debe quedar dentro de OneDrive,
 * Dropbox, Google Drive ni una unidad de red. SQLite se corrompe ahí.
 * No es exageración: es la causa #1 de bases rotas.
 */

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

/** true si estamos en la laptop del bar (Windows), false si es la PC de desarrollo */
export const esWindows = process.platform === 'win32';

/**
 * Carpeta raíz de los datos.
 *  · Windows  → C:\RESTA
 *  · Linux/Mac (desarrollo) → ./datos-dev  dentro del proyecto
 *  · Se puede forzar con la variable de entorno RESTA_DATOS
 */
export const RAIZ = resolve(
  process.env.RESTA_DATOS ||
  (esWindows ? join('C:', 'RESTA') : join(process.cwd(), 'datos-dev'))
);

export const RUTA_BASE = join(RAIZ, 'resta.db');
export const DIR_RESPALDOS = join(RAIZ, 'respaldos');
export const DIR_BITACORA = join(RAIZ, 'bitacora');

/**
 * Donde caen los tickets cuando la impresora está en modo «simulada».
 * Es la forma de revisar que el ticket salga bien formado sin gastar papel
 * —y la única manera de probarlo en la computadora de desarrollo, que no
 * tiene la térmica conectada.
 */
export const DIR_TICKETS = join(RAIZ, 'tickets');

/** Crea las carpetas si no existen. Se llama una vez al arrancar. */
export function prepararCarpetas() {
  for (const dir of [RAIZ, DIR_RESPALDOS, DIR_BITACORA, DIR_TICKETS]) {
    mkdirSync(dir, { recursive: true });
  }
  return { RAIZ, RUTA_BASE, DIR_RESPALDOS, DIR_BITACORA, DIR_TICKETS };
}

/**
 * Avisa si la carpeta de datos está en un lugar peligroso.
 * Devuelve un texto de advertencia, o null si todo bien.
 */
export function revisarUbicacion() {
  const r = RAIZ.toLowerCase();
  const peligrosas = ['onedrive', 'dropbox', 'google drive', 'googledrive', 'icloud'];
  for (const p of peligrosas) {
    if (r.includes(p)) {
      return `La base de datos está dentro de ${p}. SQLite se corrompe en carpetas ` +
             `que se sincronizan solas. Muévela a C:\\RESTA.`;
    }
  }
  if (esWindows && r.startsWith('\\\\')) {
    return 'La base de datos está en una unidad de red. Muévela a un disco local.';
  }
  if (!esWindows && r.startsWith(join(homedir(), 'OneDrive').toLowerCase())) {
    return 'La base de datos está dentro de OneDrive. Muévela fuera.';
  }
  return null;
}
