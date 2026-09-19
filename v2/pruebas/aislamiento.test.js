/**
 * PRUEBAS · QUE LAS PRUEBAS NO TOQUEN LOS DATOS DE VERDAD
 * ─────────────────────────────────────────────────────────────────────────────
 * Esta prueba no comprueba nada de RESTA: comprueba a las OTRAS pruebas.
 *
 * El 2-sep-2026, `npm test` corrido en la laptop del bar escribió en
 * `C:\RESTA-V2\resta.db` y machacó el logo del ticket con un logo de mentira.
 * Salió papel con rayas en vez del logo de ONCE, dos veces, y las dos se
 * buscó el fallo en la impresora —que estaba perfecta— porque nada avisó de
 * que la base que se estaba mirando ya no tenía el logo bueno.
 *
 * Si esta prueba falla, NO la arregles cambiando lo que compara: significa que
 * las pruebas están escribiendo donde están las ventas del bar.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

test('las pruebas trabajan en una carpeta desechable, nunca en la del bar', async () => {
  const { RAIZ } = await import('../datos/rutas-datos.js');

  const temporal = resolve(tmpdir());
  const raiz = resolve(RAIZ);

  assert.ok(
    raiz.startsWith(temporal),
    `Las pruebas están apuntando a «${raiz}», que NO es una carpeta temporal.\n` +
    'En la laptop del bar eso es la base de producción y las pruebas la\n' +
    'machacan. Se corren con «npm test», que las aparta; correr\n' +
    '«node --test» a mano se salta esa protección.',
  );
});
