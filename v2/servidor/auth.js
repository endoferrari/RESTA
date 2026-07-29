/**
 * SERVIDOR · QUIÉN ESTÁ USANDO CADA TABLET
 * ─────────────────────────────────────────────────────────────────────────────
 * El mesero teclea su PIN de 4 dígitos y la tablet recibe un pase. Ese pase
 * viaja en cada petición (cabecera `X-Pase`), y por eso el servidor siempre
 * sabe quién anotó cada cerveza.
 *
 * Dos cosas que aquí se cuidan:
 *
 *  1. El PIN nunca viaja más que al entrar, y nunca se guarda (ver
 *     datos/repos/usuarios.js).
 *  2. Nadie puede sentarse a probar PIN uno por uno. Son sólo 10,000
 *     combinaciones: a mano, alguien podría probarlas todas en una noche.
 *     Por eso, tras varios intentos fallidos desde la misma tablet, se frena.
 */

import { usuarioDeSesion } from '../datos/repos/usuarios.js';
import { puede, motivoNegado } from '../nucleo/permisos.js';

/* ── Freno a los intentos de PIN ───────────────────────────────────────── */

const INTENTOS_LIBRES = 5;
const VENTANA_MS      = 60_000;   // los intentos se olvidan al minuto
const CASTIGO_MS      = 30_000;   // y si se pasa, espera medio minuto

// En memoria a propósito: si se reinicia el servidor el castigo se pierde,
// pero también se pierde el ataque. No vale la pena ensuciar la base.
const intentos = new Map();

export function frenoActivo(desde) {
  const r = intentos.get(desde);
  if (!r) return 0;
  if (r.bloqueadoHasta && r.bloqueadoHasta > Date.now()) {
    return Math.ceil((r.bloqueadoHasta - Date.now()) / 1000);
  }
  return 0;
}

export function anotarIntentoFallido(desde) {
  const ahora = Date.now();
  const r = intentos.get(desde) ?? { fallos: 0, desde: ahora };

  // Si el último intento fue hace rato, se empieza a contar de nuevo.
  if (ahora - r.desde > VENTANA_MS) {
    r.fallos = 0;
    r.desde = ahora;
  }

  r.fallos++;
  if (r.fallos >= INTENTOS_LIBRES) {
    r.bloqueadoHasta = ahora + CASTIGO_MS;
    r.fallos = 0;
    r.desde = ahora;
  }

  intentos.set(desde, r);
}

export function limpiarIntentos(desde) {
  intentos.delete(desde);
}

/* ── Quién manda esta petición ─────────────────────────────────────────── */

/** Lee el pase de la petición y devuelve el usuario, o null si no hay. */
export function usuarioDe(peticion) {
  const pase = peticion.headers['x-pase'];
  if (!pase) return null;
  return usuarioDeSesion(pase);
}

/**
 * Exige que quien manda la petición tenga permiso para esta acción.
 * Si no, corta con un mensaje en español que se le puede enseñar tal cual
 * a quien esté en la tablet.
 *
 * Devuelve el usuario, para que la ruta lo use al registrar el evento.
 */
export function exigir(peticion, accion) {
  const usuario = usuarioDe(peticion);

  if (!usuario) {
    const e = new Error('Entra con tu PIN para continuar.');
    e.statusCode = 401;
    throw e;
  }

  if (!puede(usuario.rol, accion)) {
    const e = new Error(motivoNegado(usuario.rol, accion));
    e.statusCode = 403;
    throw e;
  }

  return usuario;
}
