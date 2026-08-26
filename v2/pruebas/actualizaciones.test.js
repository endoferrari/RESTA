/**
 * PRUEBAS · COMPARAR VERSIONES
 * ─────────────────────────────────────────────────────────────────────────────
 * Esto decide si al bar se le ofrece actualizar. Equivocarse tiene dos
 * formas de doler:
 *
 *  · Decir que hay algo nuevo cuando no lo hay → alguien reinstala un
 *    sábado por gusto y el punto de venta se queda abajo un rato.
 *  · Decir que no hay nada cuando sí → el arreglo que se acaba de publicar
 *    nunca llega.
 *
 * Comparar «2.0.10» con «2.0.9» como texto da lo contrario de lo correcto,
 * que es justo el error clásico. Por eso se compara número por número.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { esMasNueva } from '../servidor/actualizaciones.js';

test('una versión mayor es más nueva', () => {
  assert.equal(esMasNueva('2.1.0', '2.0.0'), true);
  assert.equal(esMasNueva('3.0.0', '2.9.9'), true);
});

test('la misma versión no es más nueva', () => {
  assert.equal(esMasNueva('2.0.0', '2.0.0'), false);
});

test('una versión vieja nunca se ofrece', () => {
  // Ofrecer la 1.3.0 a quien ya tiene la 2.0.0 sería devolverle el bar al
  // sistema que estamos reemplazando.
  assert.equal(esMasNueva('1.3.0', '2.0.0'), false);
  assert.equal(esMasNueva('2.0.0', '2.0.1'), false);
});

test('la 2.0.10 es más nueva que la 2.0.9, no al revés', () => {
  // Comparando como texto, «2.0.10» < «2.0.9» porque «1» va antes que «9».
  // Ése es el error clásico y aquí no pasa.
  assert.equal(esMasNueva('2.0.10', '2.0.9'), true);
  assert.equal(esMasNueva('2.0.9', '2.0.10'), false);
});

test('la «v» de las etiquetas de GitHub no estorba', () => {
  // Las publicaciones se etiquetan «v2.1.0», no «2.1.0».
  assert.equal(esMasNueva('v2.1.0', '2.0.0'), true);
  assert.equal(esMasNueva('v2.0.0', 'v2.0.0'), false);
});

test('una beta no se le ofrece a un bar que está trabajando', () => {
  // «2.1.0-beta» no cuenta como más nueva que «2.1.0»: los sufijos se
  // ignoran, así que quedan iguales y no se ofrece nada.
  assert.equal(esMasNueva('2.1.0-beta', '2.1.0'), false);
  assert.equal(esMasNueva('2.0.0', '2.0.0-fase6'), false);
});

test('faltar un número cuenta como cero', () => {
  assert.equal(esMasNueva('2.1', '2.0.5'), true);
  assert.equal(esMasNueva('2', '2.0.0'), false);
});

test('una etiqueta que no se entiende no ofrece nada', () => {
  // Ante la duda, callarse. Nadie quiere reinstalar por una etiqueta rara.
  assert.equal(esMasNueva('ultima', '2.0.0'), false);
  assert.equal(esMasNueva('', '2.0.0'), false);
});

/* ── Antes de EJECUTAR el instalador ───────────────────────────────────── */

/**
 * RESTA se baja su propio instalador y después lo ABRE. Eso es lo más
 * delicado que hace el programa, así que antes de tocarlo comprueba tres
 * cosas. Si cualquiera falla, el archivo se borra y no se ejecuta nada.
 */
import { revisarInstalador } from '../servidor/actualizaciones.js';

const BUENO = 'https://github.com/endoferrari/RESTA/releases/download/v2.0.9/RESTA-Setup-2.0.9.exe';
const HUELLA = 'a11d1c192b10930afdb460fc5f0dd9e7a74a26a14576014ac51a2db9371c9d84';

test('un instalador que cuadra en todo se acepta', () => {
  const r = revisarInstalador({
    url: BUENO,
    tamanoEsperado: 108022143, tamanoReal: 108022143,
    firmaEsperada: `sha256:${HUELLA}`, firmaReal: HUELLA,
  });
  assert.equal(r.bien, true);
});

test('un archivo que no viene de las publicaciones de RESTA se rechaza', () => {
  // Aunque pese lo correcto y traiga la huella correcta: si no viene de
  // donde tiene que venir, no se abre. Es un programa que se va a ejecutar
  // con permisos de administrador en la caja del bar.
  for (const url of [
    'https://otro-sitio.com/RESTA-Setup-2.0.9.exe',
    'https://github.com/otro/RESTA/releases/download/v9/RESTA-Setup.exe',
    'http://github.com/endoferrari/RESTA/releases/download/v9/x.exe',
    '',
    null,
  ]) {
    const r = revisarInstalador({
      url, tamanoEsperado: 10, tamanoReal: 10,
      firmaEsperada: `sha256:${HUELLA}`, firmaReal: HUELLA,
    });
    assert.equal(r.bien, false, `no debería aceptarse: ${url}`);
    assert.match(r.motivo, /publicaciones de RESTA/);
  }
});

test('un archivo que llegó a medias se rechaza', () => {
  const r = revisarInstalador({
    url: BUENO,
    tamanoEsperado: 108022143, tamanoReal: 40000000,
    firmaEsperada: null, firmaReal: null,
  });
  assert.equal(r.bien, false);
  assert.match(r.motivo, /incompleto/);
});

test('si la huella no coincide, no se ejecuta', () => {
  const r = revisarInstalador({
    url: BUENO,
    tamanoEsperado: 100, tamanoReal: 100,
    firmaEsperada: `sha256:${HUELLA}`,
    firmaReal: '0000000000000000000000000000000000000000000000000000000000000000',
  });
  assert.equal(r.bien, false);
  assert.match(r.motivo, /huella/);
});

test('la huella se compara sin importar mayúsculas ni el prefijo', () => {
  const r = revisarInstalador({
    url: BUENO,
    tamanoEsperado: 100, tamanoReal: 100,
    firmaEsperada: `SHA256:${HUELLA.toUpperCase()}`, firmaReal: HUELLA,
  });
  assert.equal(r.bien, true);
});

test('sin huella publicada se sigue adelante con el tamaño', () => {
  // GitHub la manda hoy; si algún día dejara de mandarla, el botón no puede
  // quedarse muerto. Es menos comprobación, pero es la que hay.
  const r = revisarInstalador({
    url: BUENO,
    tamanoEsperado: 108022143, tamanoReal: 108022143,
    firmaEsperada: null, firmaReal: null,
  });
  assert.equal(r.bien, true);
});
