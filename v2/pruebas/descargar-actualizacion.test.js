/**
 * PRUEBAS · RESTA SE BAJA SU PROPIA ACTUALIZACIÓN
 * ─────────────────────────────────────────────────────────────────────────────
 * Se corren con:   npm test
 *
 * Esto es lo más delicado que hace RESTA: baja un programa de internet y
 * después lo ABRE, con permisos de administrador, en la caja del bar. Así que
 * lo que se prueba aquí no es que funcione cuando todo va bien —eso es lo
 * fácil— sino que **no haga nada** cuando algo no cuadra:
 *
 *   · si el archivo llega a medias, se borra y no queda nada que abrir;
 *   · si la huella no coincide con la que publicó GitHub, tampoco;
 *   · y mientras no esté verificado, el archivo NO tiene su nombre final,
 *     para que nadie lo abra por error desde la carpeta.
 *
 * Nada de esto toca la red: la publicación y la conexión se le pasan de
 * mentira, que para eso están esos dos parámetros.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CARPETA = mkdtempSync(join(tmpdir(), 'resta-actualizar-'));
process.env.RESTA_DATOS = CARPETA;

let descargarActualizacion, estadoDeLaDescarga, DIR_ACTUALIZACIONES;

/** El instalador de mentira: unos cuantos pedazos, como los manda la red. */
const PEDAZOS = ['MZ-instalador-', 'de-mentira-', 'para-la-prueba'];
const CONTENIDO = PEDAZOS.join('');
const TAMANO = Buffer.byteLength(CONTENIDO);
const HUELLA = createHash('sha256').update(CONTENIDO).digest('hex');

const PUBLICACION = {
  sePudo: true,
  hayNueva: true,
  ultima: '9.9.9',
  nombreArchivo: 'RESTA-Setup-9.9.9.exe',
  descarga: 'https://github.com/endoferrari/RESTA/releases/download/v9.9.9/RESTA-Setup-9.9.9.exe',
  tamano: TAMANO,
  firma: `sha256:${HUELLA}`,
};

/** Una conexión de mentira que devuelve los pedazos de arriba. */
const conexionQueDevuelve = (pedazos) => async () => ({
  ok: true,
  status: 200,
  body: (async function* () {
    for (const p of pedazos) yield Buffer.from(p);
  })(),
});

before(async () => {
  ({ descargarActualizacion, estadoDeLaDescarga } =
    await import('../servidor/actualizaciones.js'));
  ({ DIR_ACTUALIZACIONES } = await import('../datos/rutas-datos.js'));
});

after(() => rmSync(CARPETA, { recursive: true, force: true }));

beforeEach(() => {
  rmSync(join(CARPETA, 'actualizaciones'), { recursive: true, force: true });
});

/* ── Cuando todo cuadra ────────────────────────────────────────────────── */

test('baja el instalador, lo verifica y lo deja listo', async () => {
  const r = await descargarActualizacion({
    publicacion: PUBLICACION,
    traer: conexionQueDevuelve(PEDAZOS),
  });

  assert.equal(r.estado, 'lista');
  assert.equal(r.porcentaje, 100);
  assert.equal(r.version, '9.9.9');

  const esperada = join(DIR_ACTUALIZACIONES, 'RESTA-Setup-9.9.9.exe');
  assert.equal(r.ruta, esperada);
  assert.ok(existsSync(esperada), 'el archivo tiene que estar en el disco');
  assert.equal(readFileSync(esperada, 'utf8'), CONTENIDO, 'y llegar entero');
});

test('no queda ningún archivo a medias tirado en la carpeta', async () => {
  await descargarActualizacion({
    publicacion: PUBLICACION, traer: conexionQueDevuelve(PEDAZOS),
  });

  assert.ok(!existsSync(join(DIR_ACTUALIZACIONES, 'RESTA-Setup-9.9.9.exe.parte')),
    'el archivo a medias sólo existe mientras baja');
});

test('si ya estaba bajado y verifica, no lo vuelve a bajar', async () => {
  await descargarActualizacion({
    publicacion: PUBLICACION, traer: conexionQueDevuelve(PEDAZOS),
  });

  let seVolvioAPedir = false;
  const r = await descargarActualizacion({
    publicacion: PUBLICACION,
    traer: async () => { seVolvioAPedir = true; throw new Error('no debería pedirlo'); },
  });

  assert.equal(seVolvioAPedir, false, 'son más de 100 MB: no se bajan dos veces');
  assert.equal(r.estado, 'lista');
});

/* ── Cuando algo no cuadra ─────────────────────────────────────────────── */

test('si llega a medias, se borra y no queda nada que abrir', async () => {
  await assert.rejects(
    () => descargarActualizacion({
      publicacion: PUBLICACION,
      traer: conexionQueDevuelve(['MZ-instalador-']),      // se corta la red
    }),
    /incompleto/,
  );

  assert.equal(estadoDeLaDescarga().estado, 'error');
  assert.equal(estadoDeLaDescarga().ruta, null);
  assert.ok(!existsSync(join(DIR_ACTUALIZACIONES, 'RESTA-Setup-9.9.9.exe')),
    'no puede quedar un instalador a medias con nombre de bueno');
  assert.ok(!existsSync(join(DIR_ACTUALIZACIONES, 'RESTA-Setup-9.9.9.exe.parte')));
});

test('si la huella no coincide, el archivo se tira', async () => {
  await assert.rejects(
    () => descargarActualizacion({
      publicacion: { ...PUBLICACION, tamano: TAMANO },
      // Pesa lo mismo pero el contenido es otro: es justo el caso que la
      // comprobación de tamaño sola no atraparía.
      traer: conexionQueDevuelve([CONTENIDO.replace('MZ', 'XX')]),
    }),
    /huella/,
  );

  assert.ok(!existsSync(join(DIR_ACTUALIZACIONES, 'RESTA-Setup-9.9.9.exe')));
});

test('un archivo que no viene de las publicaciones de RESTA no se baja', async () => {
  await assert.rejects(
    () => descargarActualizacion({
      publicacion: { ...PUBLICACION, descarga: 'https://otro-sitio.com/algo.exe' },
      traer: conexionQueDevuelve(PEDAZOS),
    }),
    /publicaciones de RESTA/,
  );
});

test('si GitHub contesta mal, se dice y no se inventa nada', async () => {
  await assert.rejects(
    () => descargarActualizacion({
      publicacion: PUBLICACION,
      traer: async () => ({ ok: false, status: 404 }),
    }),
    /404/,
  );
  assert.equal(estadoDeLaDescarga().estado, 'error');
});

test('estando al día no hay nada que bajar', async () => {
  await assert.rejects(
    () => descargarActualizacion({
      publicacion: { ...PUBLICACION, hayNueva: false },
      traer: conexionQueDevuelve(PEDAZOS),
    }),
    /última versión/,
  );
});

/* ── Instalar ──────────────────────────────────────────────────────────── */

test('no se puede instalar lo que no se ha bajado', async () => {
  const { instalarActualizacion } = await import('../servidor/actualizaciones.js');

  await assert.rejects(
    () => descargarActualizacion({
      publicacion: PUBLICACION, traer: conexionQueDevuelve(['a']),
    }),
    /incompleto/,
  );

  assert.throws(() => instalarActualizacion(), /Todavía no está bajado/);
});
