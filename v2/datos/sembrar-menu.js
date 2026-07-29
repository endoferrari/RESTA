/**
 * DATOS · SEMBRAR EL MENÚ
 * ─────────────────────────────────────────────────────────────────────────────
 * La primera vez que RESTA arranca, la carta está vacía. En vez de dejar a
 * Rosendo capturando 59 productos a mano, se siembra el menú real de ONCE.
 *
 * Sólo siembra si NO hay ningún producto. En cuanto haya uno —porque se
 * importó el respaldo o porque se capturó a mano— esta función no vuelve a
 * tocar nada nunca. No puede pisar precios que ya estén trabajando.
 *
 * Recibe la base como parámetro (en vez de pedirla) para poder llamarse desde
 * dentro de la propia apertura de la base, sin importaciones en círculo.
 */

import { MENU_ONCE } from './menu-once.js';
import { parseOpciones } from '../nucleo/opciones.js';

export function sembrarMenu(bd, { silencioso = false } = {}) {
  const { total } = bd.prepare('SELECT count(*) AS total FROM productos').get();

  if (total > 0) return { sembrados: 0, motivo: 'ya había productos' };

  const insertar = bd.prepare(`
    INSERT INTO productos (familia, nombre, icono, precio, opciones, orden)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const marcarOrigen = bd.prepare(`
    UPDATE ajustes SET valor = ?, actualizado = datetime('now','localtime')
    WHERE clave = 'menu.origen'
  `);

  // Todo o nada: si un renglón del menú estuviera mal, no queremos media
  // carta sembrada.
  const sembrar = bd.transaction(() => {
    MENU_ONCE.forEach(([familia, icono, nombre, precio, submenu], i) => {
      const opciones = parseOpciones(submenu);
      insertar.run(familia, nombre, icono, precio, opciones ? JSON.stringify(opciones) : null, i);
    });
    marcarOrigen.run('menú de fábrica');
  });

  sembrar();

  if (!silencioso) {
    console.log(`   ✓ menú de ONCE sembrado: ${MENU_ONCE.length} productos`);
  }

  return { sembrados: MENU_ONCE.length };
}
