/**
 * DATOS · CONEXIÓN A LA BASE
 * ─────────────────────────────────────────────────────────────────────────────
 * Abre resta.db y la deja lista para trabajar en un bar: varias pantallas
 * escribiendo al mismo tiempo, sin corromperse si se va la luz.
 *
 * Los "PRAGMA" de abajo son la diferencia entre una base que aguanta un
 * sábado lleno y una que se rompe. Cada uno está explicado.
 */

import Database from 'better-sqlite3';
import { prepararCarpetas, revisarUbicacion, RUTA_BASE } from './rutas-datos.js';
import { aplicarMigraciones } from './migrador.js';
import { sembrarMenu } from './sembrar-menu.js';

let bd = null;

/** Abre (o crea) la base y aplica las migraciones pendientes. */
export function abrirBase({ ruta = RUTA_BASE, silencioso = false } = {}) {
  if (bd) return bd;

  prepararCarpetas();

  const advertencia = revisarUbicacion();
  if (advertencia && !silencioso) {
    console.warn('⚠️  ' + advertencia);
  }

  bd = new Database(ruta);

  // WAL: permite que la caja lea mientras una tablet escribe, sin trabarse.
  // Es el modo que hace a SQLite viable para varios usuarios a la vez.
  bd.pragma('journal_mode = WAL');

  // NORMAL: escribe a disco de forma segura sin esperar al disco en cada
  // operación. Con WAL, es seguro ante caída de la app y ante apagón:
  // la base queda íntegra, a lo mucho se pierde la última transacción.
  bd.pragma('synchronous = NORMAL');

  // Si dos pantallas escriben exactamente al mismo tiempo, en vez de fallar
  // al instante, espera hasta 5 segundos a que se libere. En la práctica
  // nunca se nota, pero evita errores en horas pico.
  bd.pragma('busy_timeout = 5000');

  // Hace que SQLite respete las relaciones entre tablas. Sin esto se pueden
  // guardar pagos de cuentas que no existen.
  bd.pragma('foreign_keys = ON');

  // Guarda los datos temporales en memoria: más rápido y no ensucia el disco.
  bd.pragma('temp_store = MEMORY');

  aplicarMigraciones(bd, { silencioso });

  // Si la carta está vacía (instalación nueva), se pone el menú real de ONCE.
  // Si ya hay productos, no toca nada.
  sembrarMenu(bd, { silencioso });

  return bd;
}

/** Devuelve la base ya abierta. Truena si nadie la abrió: eso es a propósito. */
export function base() {
  if (!bd) throw new Error('La base de datos no está abierta. Llama a abrirBase() primero.');
  return bd;
}

/**
 * Cierra la base dejándola en buen estado.
 * Se llama al apagar la app. El checkpoint mete el WAL al archivo principal
 * para que un respaldo hecho justo después esté completo.
 */
export function cerrarBase() {
  if (!bd) return;
  try {
    bd.pragma('wal_checkpoint(TRUNCATE)');
  } catch { /* si falla, cerramos igual */ }
  bd.close();
  bd = null;
}

/**
 * Envuelve varias operaciones en una transacción.
 * O se guardan TODAS o no se guarda NINGUNA. Nunca a medias.
 * Así es como un cobro nunca queda "el pago sí, el ticket no".
 */
export function enTransaccion(fn) {
  return base().transaction(fn)();
}
