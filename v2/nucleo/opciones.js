/**
 * NÚCLEO · OPCIONES DE UN PRODUCTO (el submenú del mesero)
 * ─────────────────────────────────────────────────────────────────────────────
 * En el bar, "un whisky" no basta: hay que saber si va derecho, puesto,
 * campechano; con qué refresco; con o sin hielo. Eso es el submenú que sale
 * cuando el mesero toca el producto.
 *
 * Cada producto guarda su submenú como un texto sencillo, una línea por
 * pregunta, para que se pueda editar desde la pantalla sin tocar código:
 *
 *     Mezcla: Puesto, Campechano, Derecho
 *     Aparte [varias] [si: Divorciado]: Agua mineral, Refresco
 *     Hielo: Con hielo, Sin hielo
 *
 *   · `[varias]`     → el mesero puede marcar más de una respuesta.
 *   · `[si: A, B]`   → esa pregunta sólo aparece si antes contestó A o B.
 *                      Así no se le pregunta el refresco a quien pidió derecho.
 *
 * Este archivo es cálculo puro: no sabe de pantallas ni de base de datos.
 * Es la misma regla que usaba la v1.3.0, portada tal cual para que los
 * submenús que Rosendo ya tiene capturados sigan significando lo mismo.
 */

/** Quita acentos y mayúsculas, para comparar sin que importe cómo se escribió. */
const normalizar = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Convierte el texto del submenú en la lista de preguntas.
 * Devuelve null si el texto no se entiende: en ese caso el producto
 * simplemente no lleva submenú, que es preferible a mostrar uno a medias.
 */
export function parseOpciones(texto) {
  if (texto === null || texto === undefined) return null;

  const lineas = String(texto).split('\n').map((l) => l.trim()).filter(Boolean);
  const preguntas = [];

  for (const linea of lineas) {
    let multi = false;
    let si = null;

    // Saca los marcadores [varias] y [si: ...] y deja la línea limpia.
    const limpia = linea.replace(/\[([^\]]*)\]/g, (_, dentro) => {
      const d = dentro.trim();
      if (normalizar(d) === 'varias') {
        multi = true;
      } else if (/^si\b/.test(normalizar(d))) {
        si = d.replace(/^si\s*:?\s*/i, '').split(',').map((s) => s.trim()).filter(Boolean);
        if (si.length === 0) si = null;
      }
      return '';
    });

    // El primer ":" separa la pregunta de sus respuestas.
    const corte = limpia.indexOf(':');
    if (corte < 1) return null;

    const g = limpia.slice(0, corte).trim();
    const ops = limpia.slice(corte + 1).split(',').map((s) => s.trim()).filter(Boolean);
    if (!g || ops.length === 0) return null;

    const pregunta = { g, ops };
    if (multi) pregunta.multi = true;
    if (si) pregunta.si = si;
    preguntas.push(pregunta);
  }

  return preguntas.length ? preguntas : null;
}

/**
 * El camino de regreso: de la lista de preguntas al texto editable.
 * Sirve para que la pantalla de Productos muestre el submenú tal como se
 * escribió. parseOpciones(textoOpciones(x)) devuelve x.
 */
export function textoOpciones(preguntas) {
  return (preguntas || [])
    .map((o) =>
      o.g +
      (o.multi ? ' [varias]' : '') +
      (o.si ? ' [si: ' + o.si.join(', ') + ']' : '') +
      ': ' + o.ops.join(', '))
    .join('\n');
}

/**
 * ¿Esta pregunta le toca al mesero, según lo que ya contestó?
 * Una pregunta con `si` sólo aparece si alguna de sus condiciones fue elegida.
 */
export function preguntaAplica(pregunta, elegidas) {
  if (!pregunta.si) return true;
  const marcadas = new Set((elegidas || []).map(normalizar));
  return pregunta.si.some((cond) => marcadas.has(normalizar(cond)));
}

/**
 * Resume las respuestas del mesero en una línea, como se ve en la cuenta
 * y como se imprime en la comanda: «Puesto · Coca · Con hielo».
 */
export function resumirEleccion(elegidas) {
  return (elegidas || []).filter(Boolean).join(' · ');
}
