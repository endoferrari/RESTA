/**
 * IMPRESIÓN · EL DOCUMENTO
 * ─────────────────────────────────────────────────────────────────────────────
 * Un ticket no se arma en bytes directamente. Primero se describe en bloques
 * («este renglón va centrado y en negritas», «esta línea lleva concepto a la
 * izquierda e importe a la derecha»), y después se traduce.
 *
 * ¿Por qué dar esa vuelta? Por dos razones muy prácticas:
 *
 *  1. El mismo documento se puede volcar a TEXTO. Eso es lo que permite
 *     probar el formato del ticket sin impresora, en Linux, con pruebas
 *     automáticas, y también lo que hace posible el modo «simulada».
 *
 *  2. El día que la impresora cambie (o se imprima en una de 58 mm en vez de
 *     80 mm), sólo cambia la traducción, no las plantillas.
 *
 * Este archivo es cálculo puro: texto entra, texto sale. Sin impresora.
 */

/** Cuántos caracteres caben por renglón según el ancho del papel. */
export function columnas(anchoMm) {
  return Number(anchoMm) === 58 ? 32 : 48;
}

/* ── Los bloques ───────────────────────────────────────────────────────── */

export const texto = (contenido, opciones = {}) =>
  ({ tipo: 'texto', contenido: String(contenido ?? ''), ...opciones });

export const titulo = (contenido) =>
  ({ tipo: 'texto', contenido: String(contenido ?? ''), alinear: 'centro', negrita: true, doble: true });

/** Concepto a la izquierda, importe a la derecha, con los puntos suspensivos justos. */
export const dosColumnas = (izquierda, derecha, opciones = {}) =>
  ({ tipo: 'dosColumnas', izquierda: String(izquierda ?? ''), derecha: String(derecha ?? ''), ...opciones });

export const separador = (caracter = '-') => ({ tipo: 'separador', caracter });
export const salto = (cuantos = 1) => ({ tipo: 'salto', cuantos });
export const cortar = () => ({ tipo: 'cortar' });

/**
 * El logo del ticket.
 * `raster` son los puntos ya calculados (los dibuja el navegador una vez y
 * se guardan). Si no hay, el bloque no imprime nada: más vale un ticket sin
 * logo que un ticket con basura.
 */
export const logo = (raster = null) => ({ tipo: 'logo', raster });

/* ── Acomodar el texto ─────────────────────────────────────────────────── */

/**
 * Parte un texto largo en renglones que quepan, sin cortar palabras a la
 * mitad. Un nombre de producto largo no debe quedar mochado en el ticket.
 */
export function partirEnRenglones(contenido, ancho) {
  const renglones = [];

  for (const parrafo of String(contenido).split('\n')) {
    const palabras = parrafo.split(/\s+/).filter(Boolean);
    if (palabras.length === 0) { renglones.push(''); continue; }

    let actual = '';
    for (const palabra of palabras) {
      // Una palabra sola más larga que el papel: no queda de otra que partirla.
      if (palabra.length > ancho) {
        if (actual) { renglones.push(actual); actual = ''; }
        for (let i = 0; i < palabra.length; i += ancho) {
          renglones.push(palabra.slice(i, i + ancho));
        }
        continue;
      }
      if (!actual) actual = palabra;
      else if (actual.length + 1 + palabra.length <= ancho) actual += ' ' + palabra;
      else { renglones.push(actual); actual = palabra; }
    }
    if (actual) renglones.push(actual);
  }

  return renglones;
}

export function centrar(renglon, ancho) {
  const t = renglon.trim();
  if (t.length >= ancho) return t.slice(0, ancho);
  return ' '.repeat(Math.floor((ancho - t.length) / 2)) + t;
}

/**
 * Concepto e importe en el mismo renglón, con el importe pegado a la derecha.
 * Si el concepto no cabe, se recorta: lo que NUNCA se recorta es el importe.
 */
export function alinearDosColumnas(izquierda, derecha, ancho, sangria = 0) {
  const margen = ' '.repeat(sangria);
  const der = String(derecha).replace(/\s+/g, ' ').trim();
  let izq = margen + String(izquierda).replace(/\s+/g, ' ').trim();

  if (!der) return izq.slice(0, ancho);

  const libre = Math.max(1, ancho - der.length - 1);
  if (izq.length > libre) izq = izq.slice(0, libre);

  const hueco = Math.max(1, ancho - izq.length - der.length);
  return izq + ' '.repeat(hueco) + der;
}

/* ── Vista en texto ────────────────────────────────────────────────────── */

/**
 * Convierte el documento en texto plano, tal como se va a ver en el papel.
 *
 * Esto es lo que escribe el modo «simulada» a un archivo, y lo que revisan
 * las pruebas. Si el ticket se ve bien aquí, se ve bien en la térmica: el
 * ancho es el mismo y la letra es de paso fijo.
 */
export function aTexto(documento, { anchoMm = 80 } = {}) {
  const ancho = columnas(anchoMm);
  const salida = [];

  for (const bloque of documento) {
    switch (bloque.tipo) {
      case 'texto': {
        const sangria = ' '.repeat(bloque.sangria ?? 0);
        // Las letras dobles ocupan el doble de espacio, así que caben la mitad.
        const anchoUtil = (bloque.doble ? Math.floor(ancho / 2) : ancho) - sangria.length;

        for (const renglon of partirEnRenglones(bloque.contenido, anchoUtil)) {
          if (bloque.alinear !== 'centro') {
            salida.push(sangria + renglon);
            continue;
          }
          // Con letra doble, cada carácter ocupa DOS columnas del papel. Para
          // que la vista en texto se parezca al papel de verdad, se centra
          // contando ese doble ancho.
          const columnasQueOcupa = bloque.doble ? renglon.trim().length * 2 : renglon.trim().length;
          const margen = Math.max(0, Math.floor((ancho - columnasQueOcupa) / 2));
          salida.push(' '.repeat(margen) + renglon.trim());
        }
        break;
      }
      case 'dosColumnas':
        salida.push(alinearDosColumnas(bloque.izquierda, bloque.derecha, ancho, bloque.sangria ?? 0));
        break;
      case 'separador':
        salida.push(String(bloque.caracter).repeat(ancho));
        break;
      case 'salto':
        for (let i = 0; i < bloque.cuantos; i++) salida.push('');
        break;
      case 'logo':
        salida.push(centrar('[ logo ]', ancho));
        break;
      case 'cortar':
        salida.push('');
        salida.push(centrar('- - - - - corte - - - - -', ancho));
        break;
      default:
        break;   // un bloque que no conocemos se ignora, nunca truena
    }
  }

  return salida.join('\n');
}
