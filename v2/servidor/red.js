/**
 * SERVIDOR · RED LOCAL
 * ─────────────────────────────────────────────────────────────────────────────
 * Averigua con qué dirección deben entrar las tablets.
 *
 * Esto resuelve una molestia real: nadie sabe cuál es la IP de la laptop,
 * y cuando el router se la cambia, todas las tablets dejan de conectar sin
 * explicación. RESTA la muestra en pantalla y avisa cuando cambió.
 */

import { networkInterfaces, hostname } from 'node:os';
import { PUERTO } from './config.js';

/**
 * Devuelve las direcciones por las que se puede entrar a RESTA desde la red.
 * Descarta la interna (127.0.0.1) y las virtuales de Docker/VPN.
 */
export function direccionesLocales() {
  const encontradas = [];
  const interfaces = networkInterfaces();

  for (const [nombre, lista] of Object.entries(interfaces)) {
    if (!lista) continue;
    // Interfaces que no sirven para que entre una tablet
    if (/^(docker|br-|veth|vmnet|vbox|lo)/i.test(nombre)) continue;

    for (const dir of lista) {
      if (dir.family !== 'IPv4') continue;
      if (dir.internal) continue;
      encontradas.push({
        interfaz: nombre,
        ip: dir.address,
        url: `http://${dir.address}:${PUERTO}`,
        // Las 192.168.x / 10.x / 172.16-31.x son las típicas de un WiFi de local
        esPrivada: /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(dir.address),
      });
    }
  }

  // Primero las privadas: son las que sirven en el bar
  encontradas.sort((a, b) => Number(b.esPrivada) - Number(a.esPrivada));
  return encontradas;
}

/** La dirección que hay que darle a los meseros. null si no hay red. */
export function direccionPrincipal() {
  return direccionesLocales()[0] ?? null;
}

/** Resumen para mostrar en pantalla y en la bitácora. */
export function resumenRed() {
  const principal = direccionPrincipal();
  return {
    equipo: hostname(),
    puerto: PUERTO,
    principal,
    todas: direccionesLocales(),
    hayRed: Boolean(principal),
  };
}
