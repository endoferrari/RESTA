/**
 * PRUEBAS · QUE EL INSTALADOR SE PUEDA COMPILAR
 * ─────────────────────────────────────────────────────────────────────────────
 * Se corren con:   npm test
 *
 * Estas pruebas no miran el negocio: vigilan que los archivos de los que
 * depende el EMPAQUETADO estén sanos.
 *
 * POR QUÉ EXISTEN: la versión 2.0.6 no llegó a compilar porque al cambiar el
 * número de versión desde PowerShell se le coló al `package.json` una marca
 * invisible al principio (el BOM, tres bytes: EF BB BF). Node la tolera
 * cuando el archivo se carga con `require()` —por eso las 359 pruebas
 * pasaban tan tranquilas— pero el empaquetador lee el archivo y hace
 * `JSON.parse`, y ahí truena.
 *
 * Resultado: media hora perdida y un instalador que nunca salió, por tres
 * bytes que no se ven en ningún editor. Aquí se ven.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_PROYECTO = join(AQUI, '..');

/** Los archivos que el empaquetador lee crudos y pasa por JSON.parse. */
const MANIFIESTOS = ['package.json', 'package-lock.json', 'cliente/manifest.webmanifest'];

for (const archivo of MANIFIESTOS) {
  test(`${archivo} no empieza con la marca invisible (BOM)`, () => {
    const bytes = readFileSync(join(RAIZ_PROYECTO, archivo));
    const tieneBom = bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;

    assert.equal(tieneBom, false,
      `${archivo} empieza con EF BB BF. Se cuela al guardarlo desde PowerShell ` +
      'con -Encoding utf8. El instalador no compila así.');
  });

  test(`${archivo} se puede leer con JSON.parse, como hace el empaquetador`, () => {
    const texto = readFileSync(join(RAIZ_PROYECTO, archivo), 'utf8');

    // A propósito JSON.parse y NO require(): require() perdona el BOM y
    // dejaría pasar justo el error que esta prueba busca.
    assert.doesNotThrow(() => JSON.parse(texto));
  });
}

test('la versión de package.json tiene la forma que espera la etiqueta de git', () => {
  const paquete = JSON.parse(readFileSync(join(RAIZ_PROYECTO, 'package.json'), 'utf8'));

  // El instalador sale como RESTA-Setup-<version>.exe y se publica con la
  // etiqueta v<version>. Si la versión trajera algo raro, el nombre del
  // archivo saldría roto y el botón 🔄 no encontraría la actualización.
  assert.match(paquete.version, /^\d+\.\d+\.\d+$/);
});
