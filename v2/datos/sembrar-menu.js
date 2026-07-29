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

/**
 * Cómo arranca el almacén con la carta de ONCE.
 *
 * Se deja controlado lo que de verdad duele —licores y cerveza— y el resto
 * apagado. Empezar controlando 55 productos es la forma más rápida de
 * abandonar un inventario. Todo esto se cambia desde la pantalla.
 *
 * Vive aquí y NO sólo en la migración 006 porque el orden importa: en una
 * instalación nueva las migraciones corren ANTES de que existan los
 * productos, así que allá los UPDATE no encuentran nada. La migración sirve
 * para las bases que ya tenían la carta; esto, para las nuevas.
 */
const DESTILADOS = [
  'Whisky Etiqueta Negra', "Whisky Buchanan's 12 años", 'Whisky Chivas',
  'Ron Bacardí blanco', 'Ron Matusalem clásico',
  'Brandy Torres 10', 'Brandy Azteca de Oro',
  'Tequila Maestro Tequilero', 'Tequila Don Julio 70',
  'Ginebra Beefeater', 'Vodka Absolut Azul', 'Vodka Stolichnaya',
  'Licor 43', 'Baileys', 'Sambuca Vaccari',
];

const CON_CERVEZA = ['Chelada (limón y sal)', 'Michelada (salsas)', 'Chelato (salsas y clamato)'];

export function configurarAlmacenDeFabrica(bd) {
  const porNombre = bd.prepare(`
    UPDATE productos
       SET controla_stock = 1, porciones_por_envase = ?, envase = ?, unidad = ?
     WHERE familia = 'Bebidas' AND nombre = ?
  `);

  // Los destilados se venden por copa: 1 botella = 15 copas (≈50 ml).
  for (const nombre of DESTILADOS) porNombre.run(15, 'botella', 'copa', nombre);

  // La cerveza se compra por caja de 24 y se vende de una en una.
  porNombre.run(24, 'caja', 'cerveza', 'Cerveza');

  // El vino se vende por botella completa.
  porNombre.run(1, 'botella', 'botella', 'Vino Cune Crianza (botella)');

  // Las mezclas no tienen existencia propia: gastan una cerveza cada una.
  const cerveza = bd.prepare(
    `SELECT id FROM productos WHERE familia = 'Bebidas' AND nombre = 'Cerveza'`
  ).get();

  if (cerveza) {
    const apuntar = bd.prepare(`
      UPDATE productos SET gasta_producto_id = ?
       WHERE familia = 'Bebidas' AND nombre = ?
    `);
    for (const nombre of CON_CERVEZA) apuntar.run(cerveza.id, nombre);
  }
}

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

    // El almacén arranca con lo que de verdad duele ya controlado.
    configurarAlmacenDeFabrica(bd);
  });

  sembrar();

  if (!silencioso) {
    console.log(`   ✓ menú de ONCE sembrado: ${MENU_ONCE.length} productos`);
  }

  return { sembrados: MENU_ONCE.length };
}
