/**
 * DATOS · EL MENÚ DE FÁBRICA DE ONCE SOCIAL LOUNGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Estos son los 55 productos reales del bar, con sus precios reales, copiados
 * de la v1.3.0 (que a su vez los sacó de LISTA DE PRECIOS.xlsx).
 *
 * Sirven para dos cosas:
 *   1. Que RESTA v2 arranque con la carta puesta, sin capturar nada a mano.
 *   2. Que haya con qué probar las pantallas mientras llega el respaldo real.
 *
 * Cuando se importe el respaldo .json de la laptop del bar, ESE manda: si
 * Rosendo subió el precio de la cerveza en marzo, el respaldo trae el precio
 * de marzo y este archivo se queda como estaba.
 *
 * ⚠️ Los precios están en CENTAVOS ENTEROS. Una cerveza de $40 son 4000.
 */

/* ── Submenús que se repiten en muchos productos ───────────────────────── */

/* El submenú típico de una copa en el bar:
   derecho (caballito solo) · puesto (servida en el vaso) · campechano (mitad
   agua mineral, mitad refresco) · pintado (agua mineral con un chorrito de
   refresco) · divorciado (todo aparte: caballito + vaso con hielo + sus aguas) */
export const OPS_COPA =
  'Mezcla: Puesto, Campechano, Pintado, Divorciado, Derecho\n' +
  'Con qué va [si: Puesto]: Agua mineral, Refresco, Agua y refresco (pintado)\n' +
  'Aparte [varias] [si: Divorciado]: Agua mineral, Agua natural, Refresco\n' +
  'Refresco [si: Refresco, Agua y refresco (pintado), Campechano, Pintado]: Coca, Coca Light\n' +
  'Hielo: Con hielo, Sin hielo';

export const OPS_CERVEZA =
  'Marca: Tecate Light, Heineken, Amstel Ultra, XX Ámbar, XX Lager, Sol, Indio, Heineken 0.0';

export const OPS_DIGESTIVO = 'Cómo va: Derecho, En las rocas, Shakereado';

export const SABORES_LECHE =
  'Sabor: Oreo, Nutella, Vainilla, Cajeta, Mazapán, Fresa, Coco, Rompope';

export const SABORES_AGUA =
  'Sabor: Mango con chamoy, Limón, Uva, Tamarindo, Mandarina, Grosella, Picafresa';


/* ── La carta ──────────────────────────────────────────────────────────── */
/* Cada renglón es: [familia, icono, nombre, precio en centavos, submenú] */

export const MENU_ONCE = [
  /* ── Refrescos: bebidas sin alcohol y café ── */
  ['Refrescos', '💧', 'Agua 500 ml', 1500, null],
  ['Refrescos', '💧', 'Agua 1 litro', 2500, null],
  ['Refrescos', '🫧', 'Agua mineral', 2500, null],
  ['Refrescos', '⚡', 'Electrolit', 3000, 'Sabor: Uva, Piña, Naranja-Mandarina, Ponche de Frutas, Lima-Limón, Fresa-Kiwi'],
  ['Refrescos', '⚡', 'Electrolit Zero', 3500, 'Sabor: Ponche de Frutas, Naranja-Mandarina, Uva, Frambuesa Azul, Fresa-Kiwi, Coco'],
  ['Refrescos', '🥤', 'Zaraza', 2500, null],
  ['Refrescos', '🧃', 'Jarochito botella', 2000, null],
  ['Refrescos', '🧃', 'Jarochito de sabor', 2500, 'Sabor: Fresa, Naranja, Toronja'],
  ['Refrescos', '🥤', 'Coca-Cola', 3500, 'Tipo: Regular, Light'],
  ['Refrescos', '🍅', 'Clamato natural', 5500, null],
  ['Refrescos', '🍋', 'Limonada / Rusa', 4000, 'Tipo: Limonada, Rusa'],
  ['Refrescos', '☕', 'Café americano', 3000, null],
  ['Refrescos', '☕', 'Capuchino', 4500, null],
  ['Refrescos', '☕', 'Café latte', 4000, null],
  ['Refrescos', '☕', 'Expresso', 3000, null],
  ['Refrescos', '🍵', 'Té chai latte', 5000, null],

  /* ── Comida: snacks y botanas ── */
  ['Comida', '🍧', 'Bolis de leche', 3000, SABORES_LECHE],
  ['Comida', '🍧', 'Bolis de agua', 2500, SABORES_AGUA],
  ['Comida', '🍨', 'Cubito de leche', 3000, SABORES_LECHE],
  ['Comida', '🍨', 'Cubito de agua', 2500, SABORES_AGUA],
  ['Comida', '🍎', 'Manzana cubierta', 4500, null],
  ['Comida', '🥔', 'Papas', 2500, null],
  ['Comida', '🥔', 'Papas preparadas', 3500, null],
  ['Comida', '🥜', 'Cacahuates', 2500, null],
  ['Comida', '🥜', 'Cacahuates preparados', 3500, null],
  ['Comida', '🍟', 'Sabritas', 2500, null],
  ['Comida', '🍪', 'Galletas', 2500, null],
  ['Comida', '🥒', 'Verduras chile y limón', 6000, null],
  ['Comida', '🫒', 'Aceitunas preparadas', 5500, null],
  ['Comida', '🍟', 'Papas a la francesa (200 g)', 7000, null],
  ['Comida', '🧀', 'Dedos de queso (6 pzas)', 8500, null],
  ['Comida', '🍗', 'Boneless Búfalo (250 g)', 14000, null],
  ['Comida', '🍗', 'Palomitas de pollo (250 g)', 9000, null],
  ['Comida', '🍗', 'Alitas picositas (10 pzas)', 14000, null],

  /* ── Bebidas: cerveza y licores ── */
  ['Bebidas', '🍺', 'Cerveza', 4000, OPS_CERVEZA],
  ['Bebidas', '🍺', 'Chelada (limón y sal)', 5000, OPS_CERVEZA],
  ['Bebidas', '🍹', 'Michelada (salsas)', 6000, OPS_CERVEZA],
  ['Bebidas', '🍹', 'Chelato (salsas y clamato)', 7000, OPS_CERVEZA],
  ['Bebidas', '🥃', 'Whisky Etiqueta Negra', 15000, OPS_COPA],
  ['Bebidas', '🥃', "Whisky Buchanan's 12 años", 15000, OPS_COPA],
  ['Bebidas', '🥃', 'Whisky Chivas', 15000, OPS_COPA],
  ['Bebidas', '🥃', 'Ron Bacardí blanco', 7000, OPS_COPA],
  ['Bebidas', '🥃', 'Ron Matusalem clásico', 7000, OPS_COPA],
  ['Bebidas', '🥃', 'Brandy Torres 10', 10000, OPS_COPA],
  ['Bebidas', '🥃', 'Brandy Azteca de Oro', 8000, OPS_COPA],
  ['Bebidas', '🥃', 'Tequila Maestro Tequilero', 12000, OPS_COPA],
  ['Bebidas', '🥃', 'Tequila Don Julio 70', 15000, OPS_COPA],
  ['Bebidas', '🍸', 'Ginebra Beefeater', 10000, OPS_COPA],
  ['Bebidas', '🍸', 'Vodka Absolut Azul', 7000, OPS_COPA],
  ['Bebidas', '🍸', 'Vodka Stolichnaya', 8000, OPS_COPA],
  ['Bebidas', '🍮', 'Licor 43', 9000, OPS_DIGESTIVO],
  ['Bebidas', '🥛', 'Baileys', 9000, OPS_DIGESTIVO],
  ['Bebidas', '☕', 'Carajillo', 12000, 'Preparación: En las rocas, Shakereado'],
  ['Bebidas', '🍶', 'Sambuca Vaccari', 8000, OPS_DIGESTIVO],
  ['Bebidas', '🍷', 'Vino Cune Crianza (botella)', 50000, null],
];
