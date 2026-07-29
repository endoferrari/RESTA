/**
 * SERVIDOR · RUTAS DE SALUD Y DIAGNÓSTICO
 * ─────────────────────────────────────────────────────────────────────────────
 * Estas rutas contestan "¿estás vivo y todo bien?".
 *
 * Sirven para dos cosas muy concretas:
 *  1. Las tablets preguntan cada pocos segundos; si no contesta, aparece la
 *     barra roja de "sin conexión".
 *  2. Cuando algo no funcione en el bar, abres /api/diagnostico en el
 *     navegador y te dice exactamente qué está mal, en español.
 */

import { VERSION } from '../config.js';
import { resumenRed } from '../red.js';
import { base } from '../../datos/conexion.js';
import { RAIZ, RUTA_BASE, revisarUbicacion, esWindows } from '../../datos/rutas-datos.js';
import { statSync, existsSync } from 'node:fs';

export function registrarRutasSalud(app) {

  /** Lo más ligero posible: las tablets pegan aquí todo el tiempo. */
  app.get('/api/salud', async () => ({
    ok: true,
    version: VERSION,
    momento: new Date().toISOString(),
  }));

  /** El informe completo, para cuando algo falla. */
  app.get('/api/diagnostico', async () => {
    const revisiones = [];
    const agregar = (nombre, bien, detalle) =>
      revisiones.push({ nombre, bien, detalle });

    // ¿La base responde?
    try {
      const bd = base();
      const { total } = bd.prepare('SELECT count(*) AS total FROM migraciones').get();
      agregar('Base de datos', true, `respondiendo · ${total} migración(es) aplicada(s)`);
    } catch (e) {
      agregar('Base de datos', false, e.message);
    }

    // ¿Está en modo WAL?
    try {
      const modo = base().pragma('journal_mode', { simple: true });
      agregar('Modo WAL', modo === 'wal',
        modo === 'wal'
          ? 'activo (varias pantallas pueden trabajar a la vez)'
          : `está en "${modo}" y debería estar en "wal"`);
    } catch (e) {
      agregar('Modo WAL', false, e.message);
    }

    // ¿La carpeta está en un lugar seguro?
    const ubicacion = revisarUbicacion();
    agregar('Ubicación de los datos', ubicacion === null,
      ubicacion ?? `${RAIZ} — lugar seguro`);

    // ¿Cuánto pesa la base?
    try {
      const tam = existsSync(RUTA_BASE) ? statSync(RUTA_BASE).size : 0;
      agregar('Archivo de la base', true,
        `${(tam / 1024).toFixed(1)} KB en ${RUTA_BASE}`);
    } catch (e) {
      agregar('Archivo de la base', false, e.message);
    }

    // ¿Hay red para las tablets?
    const red = resumenRed();
    agregar('Red local', red.hayRed,
      red.hayRed
        ? `las tablets deben entrar a ${red.principal.url}`
        : 'sin red: revisa que la laptop esté conectada al WiFi del local');

    return {
      ok: revisiones.every((r) => r.bien),
      version: VERSION,
      sistema: esWindows ? 'Windows' : process.platform,
      node: process.version,
      enPieDesde: Math.round(process.uptime()) + ' segundos',
      red,
      revisiones,
    };
  });

  /** Los datos de conexión, para pintar el QR de las tablets. */
  app.get('/api/red', async () => resumenRed());
}
