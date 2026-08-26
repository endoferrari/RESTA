/**
 * IMPRESIÓN · TRADUCTOR A ESC/POS
 * ─────────────────────────────────────────────────────────────────────────────
 * Convierte un documento (ver documento.js) en los bytes crudos que entiende
 * una miniprinter térmica.
 *
 * Estos bytes son el resultado de que la v1.3.0 se peleara con la XPRINTER
 * XP-Q200II hasta que salió bien. No se tocan a la ligera:
 *
 *  · `ESC @`  (1B 40) — reinicia la impresora y borra lo que quedó colgado.
 *
 *  · `FS .`   (1C 2E) — cancela el modo chino multibyte. SIN ESTO, un «¡» y
 *    la letra que le sigue se imprimen como UN carácter chino. Es el error
 *    más desconcertante de estas térmicas clonadas y costó encontrarlo.
 *
 *  · `ESC t 2` (1B 74 02) — página de caracteres CP850, que es la que trae
 *    acentos, la ñ y los signos ¡ ¿. Sin esto «Michelada picositas» sale
 *    bien pero «Jarochito Toronja… ¿algo?» sale con basura.
 *
 * El texto se convierte carácter por carácter a CP850. Lo que no existe en
 * esa tabla (los emojis de los productos) simplemente se omite: es preferible
 * «Cerveza» a «??Cerveza».
 */

import {
  columnas, partirEnRenglones, centrar, alinearDosColumnas,
} from './documento.js';

/* ── La tabla de caracteres de la térmica ──────────────────────────────── */

const MAPA_CP850 = {
  'á': 160, 'é': 130, 'í': 161, 'ó': 162, 'ú': 163, 'ñ': 164, 'Ñ': 165,
  'ü': 129, 'Ü': 154, 'Á': 181, 'É': 144, 'Í': 214, 'Ó': 224, 'Ú': 233,
  '¡': 173, '¿': 168, '°': 248, 'ª': 166, 'º': 167, '·': 250, '×': 120,
  '“': 34, '”': 34, '‘': 39, '’': 39, '–': 45, '—': 45, '•': 42, '€': 213,
};

/** El byte de un carácter, o null si la impresora no lo sabe pintar. */
export function byteCP850(caracter) {
  const punto = caracter.codePointAt(0);
  if (punto === 10) return 10;                       // salto de línea
  if (punto >= 32 && punto < 127) return punto;      // ASCII de siempre
  if (MAPA_CP850[caracter] !== undefined) return MAPA_CP850[caracter];
  return null;                                       // emoji u otro: se omite
}

/**
 * Quita de un texto lo que la térmica no sabe imprimir.
 * Las plantillas la usan para no mandar emojis al papel.
 */
export function soloImprimible(texto) {
  return Array.from(String(texto ?? ''))
    .filter((c) => byteCP850(c) !== null)
    .join('')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/* ── Los comandos ──────────────────────────────────────────────────────── */

const ESC = 0x1B;
const GS  = 0x1D;
const FS  = 0x1C;

const COMANDOS = {
  // Reiniciar + cancelar modo chino + página CP850. Siempre van juntos.
  inicio:      [ESC, 0x40, FS, 0x2E, ESC, 0x74, 0x02],
  izquierda:   [ESC, 0x61, 0x00],
  centro:      [ESC, 0x61, 0x01],
  negritaSi:   [ESC, 0x45, 0x01],
  negritaNo:   [ESC, 0x45, 0x00],
  tamañoNormal:[GS, 0x21, 0x00],
  tamañoDoble: [GS, 0x21, 0x11],      // doble ancho y doble alto
  // Alimenta tres renglones antes de cortar, para que el corte no se coma
  // la última línea del ticket.
  corte:       [0x0A, 0x0A, 0x0A, GS, 0x56, 0x42, 0x00],
  // Abre el cajón de dinero, si hay uno conectado a la impresora.
  cajon:       [ESC, 0x70, 0x00, 0x19, 0xFA],
};

/* ── El traductor ──────────────────────────────────────────────────────── */

class Cinta {
  constructor() { this.bytes = []; }

  meter(...valores) {
    for (const v of valores) this.bytes.push(v & 0xFF);
    return this;
  }

  comando(nombre) { return this.meter(...COMANDOS[nombre]); }

  /** Escribe texto convertido a CP850, omitiendo lo que no se puede. */
  escribir(texto) {
    for (const caracter of String(texto ?? '')) {
      const byte = byteCP850(caracter);
      if (byte !== null) this.bytes.push(byte);
    }
    return this;
  }

  renglon(texto) { return this.escribir(texto).meter(0x0A); }

  terminar() { return Buffer.from(this.bytes); }
}

/**
 * Documento → bytes para la impresora.
 *
 * @param documento lista de bloques (ver documento.js)
 * @param anchoMm   80 o 58
 * @param abrirCajon si al final se abre el cajón de dinero
 */
export function aBytes(documento, { anchoMm = 80, abrirCajon = false } = {}) {
  const ancho = columnas(anchoMm);
  const cinta = new Cinta();

  cinta.comando('inicio');

  for (const bloque of documento) {
    switch (bloque.tipo) {
      case 'texto': {
        if (bloque.alinear === 'centro') cinta.comando('centro');
        if (bloque.negrita) cinta.comando('negritaSi');
        if (bloque.doble) cinta.comando('tamañoDoble');

        const sangria = ' '.repeat(bloque.sangria ?? 0);
        // Con letra doble caben la mitad de caracteres por renglón.
        const anchoUtil = (bloque.doble ? Math.floor(ancho / 2) : ancho) - sangria.length;

        for (const renglon of partirEnRenglones(bloque.contenido, anchoUtil)) {
          // La impresora ya centra sola (ESC a 1); aquí sólo se limpia.
          cinta.renglon(bloque.alinear === 'centro' ? renglon.trim() : sangria + renglon);
        }

        if (bloque.doble) cinta.comando('tamañoNormal');
        if (bloque.negrita) cinta.comando('negritaNo');
        if (bloque.alinear === 'centro') cinta.comando('izquierda');
        break;
      }

      case 'dosColumnas': {
        if (bloque.negrita) cinta.comando('negritaSi');
        cinta.renglon(alinearDosColumnas(bloque.izquierda, bloque.derecha, ancho, bloque.sangria ?? 0));
        if (bloque.negrita) cinta.comando('negritaNo');
        break;
      }

      case 'separador':
        cinta.renglon(String(bloque.caracter).repeat(ancho));
        break;

      case 'salto':
        for (let i = 0; i < bloque.cuantos; i++) cinta.meter(0x0A);
        break;

      case 'logo': {
        // Los puntos los dibujó el navegador una sola vez y se guardaron.
        // Aquí sólo se mandan. Si no hay logo guardado, no se imprime nada.
        if (!bloque.raster?.bytes) break;

        cinta.comando('centro');
        for (const b of rasterABytes(bloque.raster)) cinta.bytes.push(b);
        cinta.comando('izquierda');
        break;
      }

      case 'cortar':
        cinta.comando('corte');
        break;

      default:
        break;
    }
  }

  if (abrirCajon) cinta.comando('cajon');

  return cinta.terminar();
}

/**
 * Los puntos del logo, que el navegador manda como texto en base64.
 *
 * Esto tiene que estar aquí y no darse por hecho: el logo viaja por la red y
 * se guarda en la base como TEXTO. Si se recorriera ese texto letra por letra
 * creyendo que son números, cada punto saldría en cero y la impresora
 * imprimiría un rectángulo en blanco —papel gastado y ni una queja del
 * sistema—. Fue exactamente lo que pasó hasta la v2.0.5.
 */
export function puntosDelLogo(bytes) {
  if (typeof bytes === 'string') return Buffer.from(bytes, 'base64');
  return Uint8Array.from(bytes);
}

/**
 * Los bytes de una imagen en blanco y negro (GS v 0).
 * Recibe los puntos como los manda la pantalla (texto base64) o ya sueltos.
 */
export function rasterABytes({ bytes, anchoEnBytes, alto }) {
  const puntos = puntosDelLogo(bytes);
  const cinta = new Cinta();
  cinta.meter(
    GS, 0x76, 0x30, 0x00,
    anchoEnBytes & 0xFF, (anchoEnBytes >> 8) & 0xFF,
    alto & 0xFF, (alto >> 8) & 0xFF,
  );
  for (const b of puntos) cinta.meter(b);
  cinta.meter(0x0A);
  return cinta.terminar();
}
