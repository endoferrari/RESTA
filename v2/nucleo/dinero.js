/**
 * NÚCLEO · DINERO
 * ─────────────────────────────────────────────────────────────────────────────
 * Todo el dinero de RESTA se guarda y se calcula en CENTAVOS ENTEROS.
 * Nunca en decimales.
 *
 * ¿Por qué? Porque las computadoras no saben sumar decimales bien:
 *   0.1 + 0.2  da  0.30000000000000004
 * En un punto de venta eso significa cuentas que no cuadran al final del día.
 * Trabajando en centavos enteros, $45.50 es simplemente 4550 y nunca falla.
 *
 * Este archivo NO sabe nada de pantallas ni de base de datos.
 * Sólo recibe números y devuelve números. Por eso se puede probar solo.
 */

/** Máximo razonable para una cuenta: $1,000,000. Más que eso es un error de captura. */
export const MAXIMO_CENTAVOS = 100_000_000;

/**
 * Convierte lo que escribió una persona a centavos enteros.
 * Acepta "45.50", "$45.50", "1,250", " 45 ", 45.5
 * Devuelve null si no es un número de dinero válido.
 *
 * OJO — detalle importante: NO multiplicamos por 100.
 * Hacer `1.005 * 100` da 100.49999999999999 y se pierde un centavo.
 * En vez de eso partimos el texto en pesos y centavos y sumamos enteros.
 * Nunca pasamos por un decimal. (Esto lo cazó la prueba
 * "precios con decimal medio no se pierden" — no fue teoría.)
 */
export function aCentavos(entrada) {
  if (entrada === null || entrada === undefined) return null;
  if (typeof entrada === 'number' && !Number.isFinite(entrada)) return null;

  const limpio = String(entrada).replace(/[$\s,]/g, '');
  if (limpio === '' || limpio === '.') return null;
  if (!/^\d*\.?\d*$/.test(limpio)) return null;

  const [pesos, decimales = ''] = limpio.split('.');
  // Tomamos 3 decimales: dos son centavos y el tercero decide si sube.
  const dec = (decimales + '000').slice(0, 3);

  let centavos = Number(pesos || '0') * 100 + Number(dec.slice(0, 2));
  if (Number(dec[2]) >= 5) centavos += 1;

  if (!Number.isSafeInteger(centavos) || centavos < 0) return null;
  if (centavos > MAXIMO_CENTAVOS) return null;
  return centavos;
}

/**
 * Redondea a entero. Se usa SÓLO para porcentajes (propina, descuento),
 * donde el decimal es inevitable. Para leer dinero tecleado usamos
 * aCentavos(), que nunca toca un decimal.
 */
export function redondear(n) {
  return Math.round(n);
}

/** Formatea centavos para mostrar: 4550 → "$45.50" */
export function formatear(centavos) {
  const n = (centavos ?? 0) / 100;
  return '$' + n.toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Formatea sin el signo de pesos, para tickets angostos: 4550 → "45.50" */
export function formatearSeco(centavos) {
  return ((centavos ?? 0) / 100).toFixed(2);
}

/**
 * Suma una lista de centavos. Existe para que nunca aparezca
 * un `.reduce()` suelto en el código de negocio.
 */
export function sumar(lista) {
  let total = 0;
  for (const n of lista) total += Math.trunc(n);
  return total;
}

/** Calcula un porcentaje sobre centavos. 10% de 4550 = 455 */
export function porcentaje(centavos, pct) {
  if (!Number.isFinite(pct) || pct < 0) return 0;
  return redondear(centavos * (pct / 100));
}

/**
 * Reparte centavos entre N personas SIN perder ni inventar centavos.
 *
 * Esto importa de verdad: $100.00 entre 3 no es $33.33 tres veces
 * (eso suma $99.99 y falta un centavo en la caja).
 * Devuelve [3334, 3333, 3333] — los centavos sobrantes se reparten
 * uno por uno entre las primeras personas.
 */
export function repartir(centavos, personas) {
  const n = Math.trunc(personas);
  if (n < 1) return [centavos];
  const base = Math.floor(centavos / n);
  const sobrante = centavos - base * n;
  const partes = new Array(n).fill(base);
  for (let i = 0; i < sobrante; i++) partes[i] += 1;
  return partes;
}

/** ¿Este valor sirve como cantidad de dinero para guardar? */
export function esValido(centavos) {
  return Number.isInteger(centavos) && centavos >= 0 && centavos <= MAXIMO_CENTAVOS;
}
