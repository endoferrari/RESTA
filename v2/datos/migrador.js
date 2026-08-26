/**
 * DATOS · MIGRADOR
 * ─────────────────────────────────────────────────────────────────────────────
 * Lee los archivos .sql de datos/migraciones/ y aplica los que falten,
 * en orden, una sola vez cada uno.
 *
 * Por qué importa: cuando le instalemos la versión 2.1 a la laptop del bar,
 * la base ya va a tener meses de ventas. El migrador agrega lo nuevo SIN
 * tocar lo que ya está. Nadie tiene que borrar y empezar de cero.
 *
 * Cada migración corre dentro de una transacción: si el .sql tiene un error,
 * no se aplica a medias — se cancela completa y la base queda como estaba.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR_MIGRACIONES = join(AQUI, 'migraciones');

export function aplicarMigraciones(bd, { silencioso = false } = {}) {
  bd.exec(`
    CREATE TABLE IF NOT EXISTS migraciones (
      archivo  TEXT PRIMARY KEY,
      aplicada TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);

  const yaAplicadas = new Set(
    bd.prepare('SELECT archivo FROM migraciones').all().map((f) => f.archivo)
  );

  const pendientes = readdirSync(DIR_MIGRACIONES)
    .filter((f) => f.endsWith('.sql'))
    .sort()                                  // 001_, 002_, 003_… en orden
    .filter((f) => !yaAplicadas.has(f));

  if (pendientes.length === 0) {
    if (!silencioso) console.log('   Base de datos al día (nada que migrar)');
    return { aplicadas: [] };
  }

  const registrar = bd.prepare('INSERT INTO migraciones (archivo) VALUES (?)');

  for (const archivo of pendientes) {
    const sql = readFileSync(join(DIR_MIGRACIONES, archivo), 'utf8');
    const correr = bd.transaction(() => {
      bd.exec(sql);
      registrar.run(archivo);
    });
    try {
      correr();
      if (!silencioso) console.log(`   ✓ migración aplicada: ${archivo}`);
    } catch (e) {
      throw new Error(`La migración ${archivo} falló y se canceló completa: ${e.message}`);
    }
  }

  return { aplicadas: pendientes };
}
