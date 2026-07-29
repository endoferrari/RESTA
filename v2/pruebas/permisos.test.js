/**
 * PRUEBAS · PERMISOS
 * ─────────────────────────────────────────────────────────────────────────────
 * Se corren con:   npm test
 *
 * La regla del bar: el mesero anota, la caja cobra. Si esto se rompe, un
 * mesero podría aplicarse descuentos a sí mismo y nadie se enteraría.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puede, motivoNegado, permisosDe, pinValido } from '../nucleo/permisos.js';

/* ── Lo que sí puede el mesero ─────────────────────────────────────────── */

test('el mesero abre mesas, anota y manda la comanda', () => {
  assert.equal(puede('mesero', 'cuenta.abrir'), true);
  assert.equal(puede('mesero', 'cuenta.anotar'), true);
  assert.equal(puede('mesero', 'cuenta.comandar'), true);
  assert.equal(puede('mesero', 'cuenta.ver'), true);
});

/* ── Lo que NO puede el mesero (esto es lo importante) ─────────────────── */

test('el mesero NO toca dinero', () => {
  assert.equal(puede('mesero', 'cobro.registrar'), false);
  assert.equal(puede('mesero', 'cuenta.descuento'), false);
  assert.equal(puede('mesero', 'cuenta.cortesia'), false);
  assert.equal(puede('mesero', 'cuenta.cancelar'), false);
  assert.equal(puede('mesero', 'turno.cerrar'), false);
});

test('al mesero se le explica a quién acudir, no un error técnico', () => {
  assert.equal(motivoNegado('mesero', 'cobro.registrar'),
    'Eso lo hace la caja. Avísale a quien esté cobrando.');
  assert.equal(motivoNegado('mesero', 'cuenta.cancelar'),
    'Eso lo hace la caja. Avísale a quien esté cobrando.');
});

/* ── Caja ──────────────────────────────────────────────────────────────── */

test('la caja cobra, descuenta y cancela', () => {
  assert.equal(puede('caja', 'cobro.registrar'), true);
  assert.equal(puede('caja', 'cuenta.descuento'), true);
  assert.equal(puede('caja', 'cuenta.cancelar'), true);
  assert.equal(puede('caja', 'turno.cerrar'), true);
});

test('la caja también anota: puede hacer todo lo del mesero', () => {
  for (const accion of permisosDe('mesero')) {
    assert.equal(puede('caja', accion), true, `la caja debería poder ${accion}`);
  }
});

test('la caja no administra usuarios ni el menú', () => {
  assert.equal(puede('caja', 'usuarios.administrar'), false);
  assert.equal(motivoNegado('caja', 'usuarios.administrar'), 'Eso lo hace el administrador.');
});

/* ── Admin ─────────────────────────────────────────────────────────────── */

test('el administrador puede todo', () => {
  assert.equal(puede('admin', 'cobro.registrar'), true);
  assert.equal(puede('admin', 'usuarios.administrar'), true);
  assert.equal(puede('admin', 'cualquier.cosa.nueva'), true);
  assert.equal(motivoNegado('admin', 'lo.que.sea'), null);
});

/* ── Rol inválido ──────────────────────────────────────────────────────── */

test('un rol desconocido no puede nada', () => {
  assert.equal(puede('cocinero', 'cuenta.ver'), false);
  assert.equal(puede(undefined, 'cuenta.ver'), false);
  assert.equal(puede(null, 'cuenta.anotar'), false);
  assert.deepEqual(permisosDe('cocinero'), []);
  assert.match(motivoNegado('cocinero', 'cuenta.ver'), /vuelve a entrar con tu PIN/);
});

/* ── El PIN ────────────────────────────────────────────────────────────── */

test('un PIN son exactamente 4 números', () => {
  assert.equal(pinValido('1234'), true);
  assert.equal(pinValido('0000'), true);
  assert.equal(pinValido('123'), false);
  assert.equal(pinValido('12345'), false);
  assert.equal(pinValido('12a4'), false);
  assert.equal(pinValido(1234), false);        // número, no texto: el 0 inicial se perdería
  assert.equal(pinValido(''), false);
  assert.equal(pinValido(null), false);
});
