/**
 * DATOS · RESPALDOS
 * ─────────────────────────────────────────────────────────────────────────────
 * Copias de seguridad de `resta.db`.
 *
 * Esta es LA razón de ser de la v2. Hoy, en la v1, todo vive en el
 * localStorage de Chrome: si alguien limpia el historial o cambia de perfil,
 * se borran todas las ventas y no hay nada que hacer.
 *
 * Aquí se copia el archivo completo, EN CALIENTE —con el bar lleno, sin
 * detener nada— usando la copia que trae SQLite. No es un `cp`: SQLite se
 * encarga de que la copia quede íntegra aunque se esté escribiendo en ese
 * mismo momento.
 *
 * Cuándo se respalda:
 *   · al cerrar el turno (el momento más importante del día),
 *   · cada hora mientras RESTA esté prendido,
 *   · al apagar la aplicación.
 *
 * Se guardan 30 días. Un respaldo diario de un bar pesa poco, pero tampoco
 * tiene sentido acumular tres años de copias en la laptop.
 */

import { readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { base } from './conexion.js';
import { DIR_RESPALDOS } from './rutas-datos.js';
import { leerAjuste } from './repos/ajustes.js';

const PREFIJO = 'resta-';

/** Nombre con fecha y hora, para que se ordenen solos y no se pisen. */
function nombreDeRespaldo(motivo) {
  const d = new Date();
  const dd = (n) => String(n).padStart(2, '0');
  const marca = `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}` +
                `_${dd(d.getHours())}-${dd(d.getMinutes())}-${dd(d.getSeconds())}`;
  return `${PREFIJO}${marca}_${motivo}.db`;
}

/**
 * Hace un respaldo AHORA.
 *
 * Devuelve una promesa: la copia de SQLite es asíncrona a propósito, para no
 * congelar la caja mientras se copia una base grande.
 */
export async function respaldarAhora(motivo = 'manual') {
  const destino = join(DIR_RESPALDOS, nombreDeRespaldo(motivo));

  // `.backup()` de SQLite copia la base página por página y espera si alguien
  // está escribiendo. Por eso se puede hacer con el bar lleno.
  await base().backup(destino);

  const tam = existsSync(destino) ? statSync(destino).size : 0;
  const borrados = limpiarViejos();

  return { archivo: destino, bytes: tam, borrados };
}

/** Tira los respaldos más viejos que el plazo configurado. */
export function limpiarViejos() {
  const dias = Number(leerAjuste('respaldo.dias_a_guardar', '30'));
  if (!Number.isFinite(dias) || dias <= 0) return 0;

  const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
  let borrados = 0;

  for (const archivo of listar()) {
    if (archivo.momento < limite) {
      try { unlinkSync(archivo.ruta); borrados++; } catch { /* si no se pudo, será la próxima */ }
    }
  }

  return borrados;
}

/** Los respaldos que hay, del más nuevo al más viejo. */
export function listar() {
  if (!existsSync(DIR_RESPALDOS)) return [];

  return readdirSync(DIR_RESPALDOS)
    .filter((f) => f.startsWith(PREFIJO) && f.endsWith('.db'))
    .map((f) => {
      const ruta = join(DIR_RESPALDOS, f);
      const s = statSync(ruta);
      return { nombre: f, ruta, bytes: s.size, momento: s.mtimeMs };
    })
    .sort((a, b) => b.momento - a.momento);
}

/** Un resumen para la pantalla de diagnóstico. */
export function resumenRespaldos() {
  const todos = listar();
  const ultimo = todos[0] ?? null;

  return {
    carpeta: DIR_RESPALDOS,
    cuantos: todos.length,
    ultimo: ultimo && {
      nombre: ultimo.nombre,
      cuando: new Date(ultimo.momento).toISOString(),
      kb: Math.round(ultimo.bytes / 1024),
    },
  };
}

/* ── El reloj ──────────────────────────────────────────────────────────── */

let reloj = null;

/**
 * Empieza a respaldar cada hora.
 * Se llama al arrancar el servidor y se detiene al apagarlo.
 */
export function arrancarRespaldoAutomatico({ cadaMinutos = 60, silencioso = false } = {}) {
  detenerRespaldoAutomatico();

  reloj = setInterval(async () => {
    try {
      const r = await respaldarAhora('automatico');
      if (!silencioso) console.log(`   ✓ respaldo automático: ${r.archivo}`);
    } catch (e) {
      // Que falle un respaldo NO puede tumbar el punto de venta.
      console.error('✗ No se pudo respaldar:', e.message);
    }
  }, cadaMinutos * 60_000);

  // Que el respaldo no impida que la aplicación se cierre.
  reloj.unref?.();
  return reloj;
}

export function detenerRespaldoAutomatico() {
  if (reloj) clearInterval(reloj);
  reloj = null;
}
