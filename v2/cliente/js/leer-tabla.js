/**
 * CLIENTE · LEER UNA TABLA (CSV o Excel)
 * ─────────────────────────────────────────────────────────────────────────────
 * Para capturar la carta desde un archivo en vez de a mano.
 *
 * Lee los dos formatos en que suele estar una lista de precios:
 *   · CSV  — texto separado por comas o punto y coma
 *   · XLSX — el Excel de toda la vida
 *
 * ¿Por qué se lee el Excel aquí y no se pide convertirlo a CSV?
 * Porque «guárdalo como CSV» suena fácil hasta que hay que hacerlo con
 * prisa, y porque un .xlsx no es más que un ZIP con unos XML adentro. El
 * navegador ya sabe descomprimir y leer XML, así que se lee tal cual.
 *
 * Sin librerías, sin internet: el bar no tiene.
 */

/* ── ZIP ───────────────────────────────────────────────────────────────── */

/**
 * Saca los archivos de un ZIP.
 * Un .xlsx es exactamente eso: un ZIP con `xl/worksheets/sheet1.xml` y
 * compañía adentro.
 */
async function abrirZip(buffer) {
  const vista = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // El índice del ZIP está AL FINAL. Se busca su marca hacia atrás.
  let finDelIndice = -1;
  for (let i = buffer.byteLength - 22; i >= 0 && i > buffer.byteLength - 65558; i--) {
    if (vista.getUint32(i, true) === 0x06054b50) { finDelIndice = i; break; }
  }
  if (finDelIndice < 0) throw new Error('Ese archivo de Excel no se pudo abrir.');

  const cuantos = vista.getUint16(finDelIndice + 10, true);
  let pos = vista.getUint32(finDelIndice + 16, true);

  const archivos = {};

  for (let n = 0; n < cuantos; n++) {
    if (vista.getUint32(pos, true) !== 0x02014b50) break;

    const metodo    = vista.getUint16(pos + 10, true);
    const comprimido = vista.getUint32(pos + 20, true);
    const largoNombre = vista.getUint16(pos + 28, true);
    const largoExtra  = vista.getUint16(pos + 30, true);
    const largoNota   = vista.getUint16(pos + 32, true);
    const dondeEmpieza = vista.getUint32(pos + 42, true);

    const nombre = new TextDecoder().decode(
      bytes.subarray(pos + 46, pos + 46 + largoNombre)
    );

    // En la cabecera de cada archivo hay que saltarse su nombre y sus extras
    const nombreLocal = vista.getUint16(dondeEmpieza + 26, true);
    const extraLocal  = vista.getUint16(dondeEmpieza + 28, true);
    const datos = bytes.subarray(
      dondeEmpieza + 30 + nombreLocal + extraLocal,
      dondeEmpieza + 30 + nombreLocal + extraLocal + comprimido
    );

    archivos[nombre] = metodo === 0 ? datos : await inflar(datos);
    pos += 46 + largoNombre + largoExtra + largoNota;
  }

  return archivos;
}

/** Descomprime. El navegador ya sabe hacerlo; no hace falta librería. */
async function inflar(datos) {
  const flujo = new Blob([datos]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

/* ── Excel ─────────────────────────────────────────────────────────────── */

/** La letra de la columna: «C7» → 2 (la tercera, contando desde cero). */
function columnaDe(referencia) {
  const letras = String(referencia).match(/^[A-Z]+/)?.[0] ?? 'A';
  let n = 0;
  for (const l of letras) n = n * 26 + (l.charCodeAt(0) - 64);
  return n - 1;
}

async function leerExcel(archivo) {
  const zip = await abrirZip(await archivo.arrayBuffer());
  const texto = (nombre) => zip[nombre] ? new TextDecoder().decode(zip[nombre]) : null;

  const xml = new DOMParser();

  // Excel guarda los textos repetidos en una lista aparte, para no repetirlos
  const compartidos = [];
  const hojaTextos = texto('xl/sharedStrings.xml');
  if (hojaTextos) {
    const doc = xml.parseFromString(hojaTextos, 'application/xml');
    for (const si of doc.getElementsByTagName('si')) {
      // Un texto puede venir partido en pedazos con distinto formato
      const pedazos = [...si.getElementsByTagName('t')].map((t) => t.textContent);
      compartidos.push(pedazos.join(''));
    }
  }

  // Se toma la primera hoja
  const nombreHoja = Object.keys(zip).find((n) => /^xl\/worksheets\/sheet1\.xml$/.test(n))
    ?? Object.keys(zip).find((n) => /^xl\/worksheets\/.*\.xml$/.test(n));
  if (!nombreHoja) throw new Error('Ese Excel no tiene ninguna hoja que se pueda leer.');

  const doc = xml.parseFromString(texto(nombreHoja), 'application/xml');
  const filas = [];

  for (const fila of doc.getElementsByTagName('row')) {
    const celdas = [];
    for (const c of fila.getElementsByTagName('c')) {
      const donde = columnaDe(c.getAttribute('r') ?? 'A');
      const v = c.getElementsByTagName('v')[0];

      let valor = '';
      if (c.getAttribute('t') === 'inlineStr') {
        valor = [...c.getElementsByTagName('t')].map((t) => t.textContent).join('');
      } else if (v) {
        valor = c.getAttribute('t') === 's' ? (compartidos[Number(v.textContent)] ?? '') : v.textContent;
      }

      celdas[donde] = String(valor).trim();
    }
    filas.push([...celdas].map((x) => x ?? ''));
  }

  return filas;
}

/* ── CSV ───────────────────────────────────────────────────────────────── */

/**
 * Lee un CSV respetando las comillas.
 * Detecta solo el separador: Excel en español guarda con punto y coma,
 * y quien lo exporta desde otro lado usa coma.
 */
export function leerCSV(texto) {
  const limpio = texto.replace(/^﻿/, '');    // la marca que mete Excel

  // El separador se busca en las PRIMERAS VEINTE LÍNEAS, no en la primera.
  //
  // Antes se miraba sólo la primera y eso rompía la plantilla de RESTA: su
  // primer renglón es una línea de ayuda de una sola celda, sin un solo
  // separador, así que se elegía la coma y el archivo entero se leía como una
  // columna. Con el archivo enfrente parecía que la plantilla estaba rota.
  const lineas = limpio.split(/\r?\n/).slice(0, 20);
  const cuantos = (signo) =>
    lineas.reduce((n, l) => n + (l.split(signo).length - 1), 0);

  const separador = cuantos(';') > cuantos(',') ? ';' : ',';

  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];

    if (entreComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') { campo += '"'; i++; }   // comilla escapada
        else entreComillas = false;
      } else campo += c;
      continue;
    }

    if (c === '"') { entreComillas = true; continue; }
    if (c === separador) { fila.push(campo.trim()); campo = ''; continue; }
    if (c === '\n') { fila.push(campo.trim()); filas.push(fila); fila = []; campo = ''; continue; }
    if (c === '\r') continue;
    campo += c;
  }

  if (campo || fila.length) { fila.push(campo.trim()); filas.push(fila); }
  return filas;
}

/* ── La puerta de entrada ──────────────────────────────────────────────── */

/** Lee el archivo y devuelve las filas, vengan de donde vengan. */
export async function leerTabla(archivo) {
  const nombre = archivo.name.toLowerCase();

  if (nombre.endsWith('.xlsx')) return leerExcel(archivo);

  if (nombre.endsWith('.xls')) {
    throw new Error(
      'Ese Excel es de un formato viejo (.xls). Ábrelo y guárdalo como .xlsx o como CSV.'
    );
  }

  return leerCSV(await archivo.text());
}

/* ── Entender qué columna es qué ───────────────────────────────────────── */

const sinAcentos = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/**
 * Un título de columna, dejado en su forma más simple.
 * Sirve para que «¿Inventario?», «Inventario:» e «inventario» sean lo mismo:
 * la gente le pone signos a los encabezados y no tiene por qué saber que eso
 * importa.
 */
const tituloLlano = (s) =>
  sinAcentos(s).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

/** Las formas en que la gente titula cada columna. */
const TITULOS = {
  nombre:  ['nombre', 'producto', 'descripcion', 'articulo', 'concepto', 'platillo'],
  precio:  ['precio', 'importe', 'costo', 'valor', 'pvp', 'precio venta'],
  familia: ['familia', 'categoria', 'grupo', 'tipo', 'seccion', 'linea'],
  icono:   ['icono', 'emoji', 'dibujo', 'imagen'],
  submenu: ['submenu', 'opciones', 'preguntas', 'variantes'],

  // ── Las que estrena la plantilla de RESTA ──
  // La clave es la que permite renombrar un producto sin que RESTA crea que
  // es otro distinto, y la que distingue «esta es mi carta completa» de «esta
  // es la lista de precios que me pasó el proveedor».
  clave:      ['clave', 'id', 'codigo', 'clave resta'],
  inventario: ['inventario', 'almacen', 'controla', 'se controla', 'lleva inventario'],
  existencia: ['existencia', 'cuantos hay', 'hay', 'stock', 'existencias'],
  unidad:     ['unidad', 'lo que vendes', 'se vende en'],
  envase:     ['envase', 'lo que compras', 'se compra en'],
  porciones:  ['porciones', 'porciones por envase', 'cuantas trae', 'trae'],
};

/**
 * Busca el renglón de títulos y de ahí deduce qué columna es cuál.
 * Devuelve null si el archivo no trae títulos reconocibles.
 */
export function entenderColumnas(filas) {
  // Se buscan los títulos entre los primeros veinticinco renglones: la
  // plantilla de RESTA lleva sus instrucciones ARRIBA de la tabla, y quien la
  // llene puede agregar dos notas más sin que deje de reconocerse.
  for (let i = 0; i < Math.min(filas.length, 25); i++) {
    const fila = (filas[i] ?? []).map(tituloLlano);
    const columnas = {};

    for (const [campo, nombres] of Object.entries(TITULOS)) {
      const donde = fila.findIndex((c) => nombres.includes(c));
      if (donde >= 0) columnas[campo] = donde;
    }

    // Con nombre y precio ya se puede trabajar; lo demás es opcional
    if (columnas.nombre !== undefined && columnas.precio !== undefined) {
      return { columnas, desdeLaFila: i + 1 };
    }
  }

  return null;
}

/* ── Leer una lista con forma de cartel ────────────────────────────────── */

/** ¿Esta celda es un precio? «45», «45.50», «$1,250». */
export function esPrecio(celda) {
  const t = String(celda ?? '').trim();
  return t !== '' && /^[$\s]*\d[\d\s.,]*$/.test(t);
}

/**
 * ¿Este texto es el título de una familia y no un producto?
 *
 * Va TODO EN MAYÚSCULAS, como en la lista de precios de ONCE: BEBIDAS,
 * CERVEZA, WHISKY, RON. Esa es justo la señal que usa el ojo al leerla.
 * Sirve además para descartar las notas al pie —«(con salsas y agua
 * mineral)»—, que van en minúsculas y no son ni producto ni familia.
 */
function esTituloDeFamilia(texto) {
  const t = String(texto).trim();
  return t.length > 1 && t.length <= 30
    && /[A-ZÁÉÍÓÚÜÑ]/.test(t)
    && t === t.toLocaleUpperCase('es');
}

/** «BEBIDAS» → «Bebidas». Se guarda como se lee, no gritando. */
function comoTitulo(texto) {
  const t = String(texto).trim().toLocaleLowerCase('es');
  return t.charAt(0).toLocaleUpperCase('es') + t.slice(1);
}

/**
 * Encuentra los bloques «nombre · precio» que hay lado a lado.
 *
 * Una lista de precios de verdad casi nunca es una tabla de tres columnas:
 * es un cartel con dos o tres listas en paralelo para que quepa en una hoja.
 * Aquí se busca cada par de columnas donde la izquierda trae texto y la de
 * al lado trae un número, que es exactamente lo que hace la vista.
 */
function bloquesDe(filas) {
  const ancho = Math.max(0, ...filas.map((f) => f.length));
  const bloques = [];

  for (let c = 0; c < ancho - 1; c++) {
    // Si la columna anterior ya se tomó como nombre, ésta es su precio
    if (bloques.at(-1) === c - 1) continue;

    let cuantos = 0;
    for (const fila of filas) {
      if (String(fila[c] ?? '').trim() && esPrecio(fila[c + 1])) cuantos++;
    }

    // Tres aciertos: menos que eso puede ser casualidad
    if (cuantos >= 3) bloques.push(c);
  }

  return bloques;
}

/**
 * Lee la hoja y saca los productos, venga como venga.
 *
 * Primero se intenta como tabla con títulos, que es lo que produce cualquier
 * sistema al exportar. Si no los trae, se lee como cartel.
 */
export function interpretar(filas) {
  const conTitulos = entenderColumnas(filas);

  if (conTitulos) {
    const { columnas, desdeLaFila } = conTitulos;
    const productos = [];

    for (let i = desdeLaFila; i < filas.length; i++) {
      const dame = (campo) =>
        columnas[campo] === undefined ? '' : String(filas[i][columnas[campo]] ?? '').trim();

      const nombre = dame('nombre');
      if (!nombre) continue;

      productos.push({
        nombre,
        precioTexto: dame('precio'),
        familia: dame('familia'),
        icono: dame('icono'),
        submenu: dame('submenu'),
        // Las de la plantilla de RESTA. En un archivo ajeno vienen vacías y
        // no estorban: el importador de siempre las ignora.
        clave: dame('clave'),
        inventario: dame('inventario'),
        existencia: dame('existencia'),
        unidad: dame('unidad'),
        envase: dame('envase'),
        porciones: dame('porciones'),
      });
    }

    // Que el archivo traiga columna de clave es lo que dice si salió de aquí.
    // Sólo entonces se puede saber qué productos FALTAN, y por tanto sólo
    // entonces se ofrece dar de baja nada.
    return { productos, modo: 'tabla', esPlantilla: columnas.clave !== undefined };
  }

  // ── Cartel ──
  const productos = [];

  for (const c of bloquesDe(filas)) {
    let familia = '';                    // la última que se leyó en ESTE bloque

    for (const fila of filas) {
      const texto = String(fila[c] ?? '').trim();
      if (!texto) continue;

      if (esPrecio(fila[c + 1])) {
        productos.push({ nombre: texto, precioTexto: String(fila[c + 1]).trim(), familia });
      } else if (esTituloDeFamilia(texto)) {
        familia = comoTitulo(texto);
      }
      // Lo demás son notas al pie; no son producto ni familia.
    }
  }

  return { productos, modo: 'cartel', esPlantilla: false };
}
