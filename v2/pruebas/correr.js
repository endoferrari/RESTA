/**
 * PRUEBAS · EL ARRANCADOR
 * ─────────────────────────────────────────────────────────────────────────────
 * Esto es lo que hace `npm test`. No corre ninguna prueba: lo único que hace
 * es apartar las pruebas de los datos de verdad ANTES de que empiecen.
 *
 * POR QUÉ EXISTE:
 *
 * En la laptop del bar los datos de la v2 viven en `C:\RESTA-V2`, y eso se le
 * dice a RESTA con la variable de entorno `RESTA_DATOS`. Esa variable la lee
 * `datos/rutas-datos.js` UNA VEZ, en cuanto el módulo se carga. Cualquier
 * prueba que importe algo del proyecto arriba del archivo —aunque sea para
 * una función suelta que no toca la base— ya deja la ruta apuntando a la base
 * de producción, y ninguna línea posterior la puede mover de ahí.
 *
 * El 2-sep-2026 eso borró el logo del ticket DOS VECES: una prueba guardaba
 * un logo de mentira (11.592 bytes iguales, que en el papel salen como rayas)
 * y lo escribía en la base del bar. Las dos veces se culpó a la impresora, y
 * se perdieron horas mirando el aparato equivocado.
 *
 * La regla del proyecto es que `npm test` se corre antes de cada commit. Es
 * decir: la única forma de que esto no vuelva a pasar es que sea IMPOSIBLE,
 * no que haya que acordarse. Por eso la variable se fija aquí, antes de que
 * arranque nada, y las pruebas heredan una carpeta desechable.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const carpeta = mkdtempSync(join(tmpdir(), 'resta-pruebas-'));

const resultado = spawnSync(
  process.execPath,
  // El patrón con estrella, no la carpeta: «node --test pruebas/» hace que
  // Node trate «pruebas» como si fuera un módulo suelto y truene con
  // «Cannot find module» antes de correr una sola prueba.
  ['--test', 'pruebas/*.test.js'],
  {
    stdio: 'inherit',
    env: { ...process.env, RESTA_DATOS: carpeta },
  },
);

// La carpeta se tira siempre, salgan bien o mal las pruebas.
rmSync(carpeta, { recursive: true, force: true });

process.exit(resultado.status ?? 1);
