/**
 * CLIENTE · ESCRIBIR UNA TABLA (Excel o CSV)
 * ─────────────────────────────────────────────────────────────────────────────
 * Lo contrario de `leer-tabla.js`: aquí se arma el archivo que se baja.
 *
 * Se hace en el NAVEGADOR y no en el servidor por la misma razón que la
 * lectura: un .xlsx es un ZIP con unos XML adentro, el navegador ya sabe
 * comprimir y el archivo cae directo en las Descargas de quien lo pidió —
 * aunque sea una tablet del otro lado del bar. Sin librerías y sin internet,
 * que el bar no tiene.
 *
 * Los archivos se escriben SIN COMPRIMIR (método «guardado» del ZIP). Es
 * válido, lo abre Excel igual, y ahorra la parte más delicada del formato.
 * La carta de ONCE entera pesa unos 40 KB así: nada.
 */

/* ── CRC32, que es lo único que el ZIP exige calcular ──────────────────── */

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ── Armar el ZIP ──────────────────────────────────────────────────────── */

/**
 * @param archivos { 'ruta/dentro.xml': 'contenido' }
 * @returns Blob listo para bajar
 */
function armarZip(archivos) {
  const codificador = new TextEncoder();
  const trozos = [];
  const indice = [];
  let posicion = 0;

  const escribirCorto = (v) => new Uint8Array([v & 0xff, (v >> 8) & 0xff]);
  const escribirLargo = (v) => new Uint8Array([
    v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff,
  ]);

  for (const [nombre, contenido] of Object.entries(archivos)) {
    const datos = codificador.encode(contenido);
    const nom = codificador.encode(nombre);
    const suma = crc32(datos);

    // Cabecera local del archivo
    const cabecera = [
      escribirLargo(0x04034b50),
      escribirCorto(20),            // versión necesaria
      escribirCorto(0x0800),        // el nombre va en UTF-8
      escribirCorto(0),             // método: guardado, sin comprimir
      escribirCorto(0), escribirCorto(0),   // hora y fecha: no importan
      escribirLargo(suma),
      escribirLargo(datos.length),  // tamaño comprimido
      escribirLargo(datos.length),  // tamaño real
      escribirCorto(nom.length),
      escribirCorto(0),             // sin campos extra
      nom,
    ];

    indice.push({ nombre: nom, suma, largo: datos.length, donde: posicion });

    for (const t of cabecera) { trozos.push(t); posicion += t.length; }
    trozos.push(datos); posicion += datos.length;
  }

  // El índice del ZIP, que va al final y es lo que primero lee quien lo abre
  const empiezaElIndice = posicion;

  for (const e of indice) {
    const entrada = [
      escribirLargo(0x02014b50),
      escribirCorto(20), escribirCorto(20),
      escribirCorto(0x0800), escribirCorto(0),
      escribirCorto(0), escribirCorto(0),
      escribirLargo(e.suma),
      escribirLargo(e.largo), escribirLargo(e.largo),
      escribirCorto(e.nombre.length),
      escribirCorto(0), escribirCorto(0),    // sin extra, sin comentario
      escribirCorto(0), escribirCorto(0),    // disco 0, atributos internos
      escribirLargo(0),                      // atributos externos
      escribirLargo(e.donde),
      e.nombre,
    ];
    for (const t of entrada) { trozos.push(t); posicion += t.length; }
  }

  const cierre = [
    escribirLargo(0x06054b50),
    escribirCorto(0), escribirCorto(0),
    escribirCorto(indice.length), escribirCorto(indice.length),
    escribirLargo(posicion - empiezaElIndice),
    escribirLargo(empiezaElIndice),
    escribirCorto(0),
  ];
  for (const t of cierre) trozos.push(t);

  return new Blob(trozos, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/* ── La hoja ───────────────────────────────────────────────────────────── */

const escaparXML = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  // Excel se niega a abrir un archivo con caracteres de control adentro
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** «A», «B»… «AA». Excel numera las columnas con letras. */
function letraDeColumna(n) {
  let s = '';
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
}

/** ¿Esta celda se escribe como número? Sólo si lo es de verdad y entero-punto. */
const esNumero = (v) => typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) && v.trim() !== '';

function celda(referencia, valor) {
  const t = String(valor ?? '');
  if (t === '') return '';

  // Los números van como número para que Excel los pueda sumar y para que no
  // aparezca el triangulito verde de «esto parece un número guardado como
  // texto» en toda la columna de precios.
  if (esNumero(t)) return `<c r="${referencia}"><v>${t.trim()}</v></c>`;

  return `<c r="${referencia}" t="inlineStr"><is><t xml:space="preserve">${escaparXML(t)}</t></is></c>`;
}

/**
 * Arma el .xlsx.
 * @param filas  array de arrays de texto (la primera fila que toque es la que
 *               toque: aquí no se decide nada, sólo se escribe)
 */
export function hojaExcel(filas, { anchos = [] } = {}) {
  const renglones = filas.map((fila, i) => {
    const celdas = fila
      .map((v, c) => celda(`${letraDeColumna(c)}${i + 1}`, v))
      .join('');
    return `<row r="${i + 1}">${celdas}</row>`;
  }).join('');

  const cols = anchos.length
    ? `<cols>${anchos.map((a, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${a}" customWidth="1"/>`).join('')}</cols>`
    : '';

  return armarZip({
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>',

    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',

    'xl/workbook.xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="La carta" sheetId="1" r:id="rId1"/></sheets></workbook>',

    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '</Relationships>',

    'xl/worksheets/sheet1.xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      cols + `<sheetData>${renglones}</sheetData></worksheet>`,
  });
}

/* ── CSV, para quien no tenga Excel ────────────────────────────────────── */

/**
 * El separador es el punto y coma a propósito: es el que usa Excel en
 * español. Con comas, un Excel configurado en México abre todo el archivo
 * apretado en la columna A y parece que la plantilla está rota.
 */
export function hojaCSV(filas) {
  const entreComillas = (v) => {
    const t = String(v ?? '');
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };

  // La marca del principio (BOM) es lo que hace que Excel entienda los
  // acentos y los dibujitos. Sin ella, «Sidrá» sale como «SidrÃ¡».
  return new Blob(
    ['﻿' + filas.map((f) => f.map(entreComillas).join(';')).join('\r\n')],
    { type: 'text/csv;charset=utf-8' },
  );
}

/* ── Bajarlo ───────────────────────────────────────────────────────────── */

export function bajarArchivo(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Se suelta al rato: si se libera de inmediato, algún navegador cancela la
  // descarga antes de haberla empezado.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
