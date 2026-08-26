/**
 * PRUEBAS · MESEROS: EDITAR Y REUTILIZAR NOMBRES
 * ─────────────────────────────────────────────────────────────────────────────
 * Se corren con:   npm test
 *
 * Lo que más se vigila aquí: que **dar de baja a alguien no deje su nombre
 * secuestrado para siempre**. En el bar la gente va y viene, y antes dar de
 * alta a un «Juan» nuevo después de dar de baja al anterior tronaba con un
 * error sin explicación (el candado único contaba también a los inactivos).
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CARPETA = mkdtempSync(join(tmpdir(), 'resta-usuarios-'));
process.env.RESTA_DATOS = CARPETA;

let abrirBase, cerrarBase;
let crearUsuario, editarUsuario, apagarUsuario, buscarUsuario;
let listarUsuarios, usuarioConPin, pinYaUsado;

before(async () => {
  ({ abrirBase, cerrarBase } = await import('../datos/conexion.js'));
  ({
    crearUsuario, editarUsuario, apagarUsuario, buscarUsuario,
    listarUsuarios, usuarioConPin, pinYaUsado,
  } = await import('../datos/repos/usuarios.js'));

  abrirBase({ silencioso: true });
});

after(() => {
  cerrarBase();
  rmSync(CARPETA, { recursive: true, force: true });
});

/* ── Editar sin perder el historial ────────────────────────────────────── */

test('editar cambia nombre y rol pero conserva el mismo id', () => {
  const ana = crearUsuario({ nombre: 'Ana', pin: '1111', rol: 'mesero' });

  const editada = editarUsuario(ana.id, { nombre: 'Ana Laura', rol: 'caja' });

  assert.equal(editada.id, ana.id);          // misma persona, mismo historial
  assert.equal(editada.nombre, 'Ana Laura');
  assert.equal(editada.rol, 'caja');
});

test('después de editar, el PIN sigue siendo el mismo', () => {
  const beto = crearUsuario({ nombre: 'Beto', pin: '2222', rol: 'mesero' });

  editarUsuario(beto.id, { nombre: 'Roberto', rol: 'mesero' });

  const quien = usuarioConPin('2222');
  assert.equal(quien.id, beto.id);
  assert.equal(quien.nombre, 'Roberto');
});

/* ── El nombre de un dado de baja se puede volver a usar ───────────────── */

test('dar de baja a Juan y dar de alta a otro Juan ya no truena', () => {
  const juan1 = crearUsuario({ nombre: 'Juan', pin: '3333', rol: 'mesero' });
  apagarUsuario(juan1.id);

  // Esto era lo que fallaba con «Algo falló en el servidor».
  const juan2 = crearUsuario({ nombre: 'Juan', pin: '4444', rol: 'mesero' });

  assert.notEqual(juan2.id, juan1.id);       // son personas distintas
  assert.equal(buscarUsuario(juan1.id).activo, false);
  assert.equal(buscarUsuario(juan2.id).activo, true);

  // El historial del primero sigue teniendo dueño.
  assert.equal(buscarUsuario(juan1.id).nombre, 'Juan');
});

test('dos personas ACTIVAS con el mismo nombre siguen prohibidas', () => {
  crearUsuario({ nombre: 'Carmen', pin: '5555', rol: 'caja' });

  assert.throws(() => crearUsuario({ nombre: 'Carmen', pin: '6666', rol: 'mesero' }));
});

test('el PIN de un dado de baja queda libre', () => {
  const memo = crearUsuario({ nombre: 'Memo', pin: '7777', rol: 'mesero' });
  apagarUsuario(memo.id);

  assert.equal(pinYaUsado('7777'), false);   // ya nadie entra con él
  assert.equal(usuarioConPin('7777'), null);
});

test('la lista normal sólo enseña a los activos', () => {
  const nombres = listarUsuarios().map((u) => u.nombre);
  assert.ok(!nombres.includes('Memo'));      // dado de baja: fuera de la lista
  assert.ok(nombres.includes('Carmen'));
});
