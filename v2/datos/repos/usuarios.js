/**
 * DATOS · USUARIOS Y SESIONES
 * ─────────────────────────────────────────────────────────────────────────────
 * Los meseros y quien esté en la caja. Entran con un PIN de 4 dígitos.
 *
 * EL PIN NO SE GUARDA. Se guarda una huella suya (scrypt + sal), que sirve
 * para comprobar el PIN pero no para averiguarlo. Si alguien se roba el
 * archivo de la base, no se lleva los PIN de nadie.
 *
 * Un usuario nunca se borra: se marca como inactivo. Si se borrara, las
 * ventas de hace meses quedarían sin dueño y no se sabría quién cobró.
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { base } from '../conexion.js';

/* ── El PIN ────────────────────────────────────────────────────────────── */

/**
 * Convierte un PIN en su huella. scrypt es lento a propósito: aunque alguien
 * se llevara la base, probar los 10,000 PIN posibles le costaría tiempo real.
 */
function huella(pin, sal) {
  return scryptSync(String(pin), sal, 32).toString('hex');
}

function nuevaSal() {
  return randomBytes(16).toString('hex');
}

/**
 * Compara sin delatar en cuánto tiempo falló.
 * Comparar textos con === tarda distinto según cuántos caracteres coinciden,
 * y eso, medido muchas veces, permite adivinar. timingSafeEqual siempre tarda
 * lo mismo.
 */
function iguales(a, b) {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ── Usuarios ──────────────────────────────────────────────────────────── */

export function contarUsuarios() {
  return base().prepare('SELECT count(*) AS total FROM usuarios WHERE activo = 1').get().total;
}

export function listarUsuarios({ soloActivos = true } = {}) {
  const filtro = soloActivos ? 'WHERE activo = 1' : '';
  return base()
    .prepare(`SELECT id, nombre, rol, activo, creado FROM usuarios ${filtro} ORDER BY rol, nombre`)
    .all()
    .map((u) => ({ ...u, activo: u.activo === 1 }));
}

export function buscarUsuario(id) {
  const u = base()
    .prepare('SELECT id, nombre, rol, activo FROM usuarios WHERE id = ?')
    .get(id);
  return u ? { ...u, activo: u.activo === 1 } : null;
}

/** Crea un usuario. El PIN ya viene validado por quien llama. */
export function crearUsuario({ nombre, pin, rol }) {
  const sal = nuevaSal();
  const r = base().prepare(`
    INSERT INTO usuarios (nombre, pin_hash, pin_salt, rol)
    VALUES (?, ?, ?, ?)
  `).run(nombre.trim(), huella(pin, sal), sal, rol);

  return buscarUsuario(Number(r.lastInsertRowid));
}

export function cambiarPin(usuarioId, pin) {
  const sal = nuevaSal();
  base().prepare('UPDATE usuarios SET pin_hash = ?, pin_salt = ? WHERE id = ?')
    .run(huella(pin, sal), sal, usuarioId);
}

/** Dar de baja: se apaga, no se borra. */
export function apagarUsuario(usuarioId) {
  base().prepare('UPDATE usuarios SET activo = 0 WHERE id = ?').run(usuarioId);
  // Y se le cierran las sesiones abiertas: si le quitaron el acceso, es ahora.
  base().prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(usuarioId);
}

/**
 * ¿De quién es este PIN?
 *
 * Se revisan TODOS los usuarios activos, incluso después de encontrarlo, para
 * que el tiempo de respuesta no delate nada. Con 10 meseros como máximo,
 * esto tarda milisegundos.
 */
export function usuarioConPin(pin) {
  const usuarios = base()
    .prepare('SELECT id, nombre, rol, pin_hash, pin_salt FROM usuarios WHERE activo = 1')
    .all();

  let encontrado = null;
  for (const u of usuarios) {
    if (iguales(huella(pin, u.pin_salt), u.pin_hash)) encontrado = u;
  }

  if (!encontrado) return null;
  return { id: encontrado.id, nombre: encontrado.nombre, rol: encontrado.rol };
}

/** ¿Alguien más ya usa este PIN? Dos meseros con el mismo PIN son un lío. */
export function pinYaUsado(pin, exceptoId = null) {
  const dueño = usuarioConPin(pin);
  if (!dueño) return false;
  return dueño.id !== exceptoId;
}

/* ── Sesiones ──────────────────────────────────────────────────────────── */

export function abrirSesion(usuarioId, desde = null) {
  const token = randomBytes(24).toString('hex');
  base().prepare('INSERT INTO sesiones (token, usuario_id, desde) VALUES (?, ?, ?)')
    .run(token, usuarioId, desde);
  return token;
}

/** Devuelve el usuario de un pase, o null si el pase ya no sirve. */
export function usuarioDeSesion(token) {
  if (!token) return null;

  const fila = base().prepare(`
    SELECT u.id, u.nombre, u.rol
      FROM sesiones s
      JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token = ? AND u.activo = 1
  `).get(token);

  if (!fila) return null;

  base().prepare(`UPDATE sesiones SET ultimo_uso = datetime('now','localtime') WHERE token = ?`)
    .run(token);

  return fila;
}

export function cerrarSesion(token) {
  base().prepare('DELETE FROM sesiones WHERE token = ?').run(token);
}

/**
 * Cierra las sesiones olvidadas.
 * Una tablet que quedó prendida en la barra toda la noche no debería seguir
 * anotando a nombre de un mesero que ya se fue a su casa.
 */
export function cerrarSesionesViejas({ horas = 16 } = {}) {
  const r = base()
    .prepare(`DELETE FROM sesiones WHERE ultimo_uso < datetime('now','localtime', ?)`)
    .run(`-${horas} hours`);
  return r.changes;
}
