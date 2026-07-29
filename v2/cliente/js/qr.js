/**
 * CLIENTE · CÓDIGO QR
 * ─────────────────────────────────────────────────────────────────────────────
 * Genera el QR con la dirección de RESTA, para que una tablet nueva sólo tenga
 * que apuntarle la cámara en vez de teclear «http://192.168.1.120:8080».
 *
 * ¿Por qué está escrito aquí y no se usa una librería?
 * Porque el bar NO TIENE INTERNET. Todos los generadores de QR que se usan
 * normalmente son un servicio de fuera o un archivo que se descarga de la
 * red. Si RESTA dependiera de eso, el día de la instalación —justo cuando se
 * conectan las tablets— el QR no aparecería.
 *
 * Es cálculo puro: entra un texto, sale un dibujo. Sin red, sin archivos.
 *
 * Sólo se usa el modo «byte» y corrección de errores M (recupera ~15% del
 * dibujo si se ensucia o se dobla el papel), que es de sobra para una
 * dirección corta.
 */

/* ── Aritmética del campo de Galois (GF 256) ───────────────────────────────
   La corrección de errores del QR se calcula en una aritmética especial donde
   sumar es un XOR. Estas dos tablas convierten multiplicaciones en sumas de
   exponentes, que es lo que la hace rápida. */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11D;      // polinomio primitivo del QR
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const multiplicar = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

/** El polinomio generador para `grado` bytes de corrección. */
function generador(grado) {
  let p = [1];
  for (let i = 0; i < grado; i++) {
    const q = [1, EXP[i]];
    const r = new Array(p.length + 1).fill(0);
    for (let j = 0; j < p.length; j++) {
      for (let k = 0; k < q.length; k++) {
        r[j + k] ^= multiplicar(p[j], q[k]);
      }
    }
    p = r;
  }
  return p;
}

/** Los bytes de corrección de un bloque de datos (Reed-Solomon). */
function corregir(datos, cuantos) {
  const gen = generador(cuantos);
  const resto = new Array(datos.length + cuantos).fill(0);
  datos.forEach((b, i) => { resto[i] = b; });

  for (let i = 0; i < datos.length; i++) {
    const coef = resto[i];
    if (coef === 0) continue;
    for (let j = 0; j < gen.length; j++) {
      resto[i + j] ^= multiplicar(gen[j], coef);
    }
  }
  return resto.slice(datos.length);
}

/* ── Tablas del formato QR (versiones 1 a 10, corrección M) ────────────── */

// Cuántos bytes de datos caben en cada versión
const DATOS = [16, 28, 44, 64, 86, 108, 124, 154, 182, 216];

// Cuántos bytes de corrección lleva cada bloque
const CORRECCION = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];

// Cómo se reparten los datos en bloques: [cuántos, de qué tamaño, …]
const BLOQUES = [
  [[1, 16]], [[1, 28]], [[1, 44]], [[2, 32]], [[2, 43]],
  [[4, 27]], [[4, 31]], [[2, 38], [2, 39]], [[3, 36], [2, 37]], [[4, 43], [1, 44]],
];

// Dónde van los cuadritos de alineación de cada versión
const ALINEACION = [
  [], [6, 18], [6, 22], [6, 26], [6, 30],
  [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

/* ── Armar los datos ───────────────────────────────────────────────────── */

function versionQueCabe(largo) {
  for (let v = 1; v <= 10; v++) {
    // 4 bits de modo + 8 o 16 de longitud + los datos
    const bitsCabecera = 4 + (v < 10 ? 8 : 16);
    if (DATOS[v - 1] * 8 >= bitsCabecera + largo * 8) return v;
  }
  throw new Error('El texto es demasiado largo para este QR.');
}

function aBytesDeDatos(texto, version) {
  const bytes = new TextEncoder().encode(texto);
  const bits = [];
  const meter = (valor, cuantos) => {
    for (let i = cuantos - 1; i >= 0; i--) bits.push((valor >> i) & 1);
  };

  meter(0b0100, 4);                              // modo byte
  meter(bytes.length, version < 10 ? 8 : 16);    // cuántos bytes
  for (const b of bytes) meter(b, 8);

  const tope = DATOS[version - 1] * 8;
  for (let i = 0; i < 4 && bits.length < tope; i++) bits.push(0);   // terminador
  while (bits.length % 8 !== 0) bits.push(0);

  const codigos = [];
  for (let i = 0; i < bits.length; i += 8) {
    codigos.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  }
  // Relleno alternando estos dos valores, que es lo que manda la norma
  const RELLENO = [0xEC, 0x11];
  while (codigos.length < DATOS[version - 1]) {
    codigos.push(RELLENO[(codigos.length - bits.length / 8) % 2]);
  }
  return codigos;
}

/** Reparte en bloques, calcula la corrección y los entrelaza. */
function entrelazar(codigos, version) {
  const bloques = [];
  let i = 0;
  for (const [cuantos, tamaño] of BLOQUES[version - 1]) {
    for (let b = 0; b < cuantos; b++) {
      bloques.push(codigos.slice(i, i + tamaño));
      i += tamaño;
    }
  }

  const correcciones = bloques.map((b) => corregir(b, CORRECCION[version - 1]));
  const salida = [];

  const masLargo = Math.max(...bloques.map((b) => b.length));
  for (let j = 0; j < masLargo; j++) {
    for (const b of bloques) if (j < b.length) salida.push(b[j]);
  }
  for (let j = 0; j < CORRECCION[version - 1]; j++) {
    for (const c of correcciones) salida.push(c[j]);
  }

  return salida;
}

/* ── Dibujar la cuadrícula ─────────────────────────────────────────────── */

function nuevaCuadricula(lado) {
  return Array.from({ length: lado }, () => new Array(lado).fill(null));
}

function ponerPatronesFijos(m, version) {
  const lado = m.length;

  // Los tres cuadrados grandes de las esquinas, que es lo que busca la cámara
  const ojo = (fila, col) => {
    for (let f = -1; f <= 7; f++) {
      for (let c = -1; c <= 7; c++) {
        const ff = fila + f, cc = col + c;
        if (ff < 0 || cc < 0 || ff >= lado || cc >= lado) continue;
        const borde = f === 0 || f === 6 || c === 0 || c === 6;
        const centro = f >= 2 && f <= 4 && c >= 2 && c <= 4;
        m[ff][cc] = (borde || centro) ? 1 : 0;
      }
    }
  };
  ojo(0, 0); ojo(0, lado - 7); ojo(lado - 7, 0);

  // Las líneas punteadas que sirven de regla
  for (let i = 8; i < lado - 8; i++) {
    m[6][i] = i % 2 === 0 ? 1 : 0;
    m[i][6] = i % 2 === 0 ? 1 : 0;
  }

  // Los cuadritos de alineación
  const centros = ALINEACION[version - 1];
  for (const f of centros) {
    for (const c of centros) {
      // No van encima de los cuadrados grandes
      if ((f <= 8 && c <= 8) || (f <= 8 && c >= lado - 9) || (f >= lado - 9 && c <= 8)) continue;
      for (let df = -2; df <= 2; df++) {
        for (let dc = -2; dc <= 2; dc++) {
          const borde = Math.abs(df) === 2 || Math.abs(dc) === 2;
          m[f + df][c + dc] = (borde || (df === 0 && dc === 0)) ? 1 : 0;
        }
      }
    }
  }

  m[lado - 8][8] = 1;   // un módulo que siempre va negro
}

/** Reserva el sitio del formato y la versión para no escribir datos ahí. */
function reservar(m, version) {
  const lado = m.length;
  for (let i = 0; i < 9; i++) {
    if (m[8][i] === null) m[8][i] = 0;
    if (m[i][8] === null) m[i][8] = 0;
  }
  for (let i = 0; i < 8; i++) {
    if (m[8][lado - 1 - i] === null) m[8][lado - 1 - i] = 0;
    if (m[lado - 1 - i][8] === null) m[lado - 1 - i][8] = 0;
  }
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        m[lado - 11 + j][i] = 0;
        m[i][lado - 11 + j] = 0;
      }
    }
  }
}

/** Escribe los datos en zigzag, de abajo a la derecha hacia arriba. */
function escribirDatos(m, datos) {
  const lado = m.length;
  const bits = [];
  for (const b of datos) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);

  let i = 0, subiendo = true;
  for (let col = lado - 1; col > 0; col -= 2) {
    if (col === 6) col--;                      // la columna de la regla se salta
    for (let f = 0; f < lado; f++) {
      const fila = subiendo ? lado - 1 - f : f;
      for (const c of [col, col - 1]) {
        if (m[fila][c] !== null) continue;
        m[fila][c] = i < bits.length ? bits[i] : 0;
        i++;
      }
    }
    subiendo = !subiendo;
  }
}

/** Las ocho máscaras que define la norma. */
const MASCARAS = [
  (f, c) => (f + c) % 2 === 0,
  (f) => f % 2 === 0,
  (f, c) => c % 3 === 0,
  (f, c) => (f + c) % 3 === 0,
  (f, c) => (Math.floor(f / 2) + Math.floor(c / 3)) % 2 === 0,
  (f, c) => ((f * c) % 2) + ((f * c) % 3) === 0,
  (f, c) => (((f * c) % 2) + ((f * c) % 3)) % 2 === 0,
  (f, c) => (((f + c) % 2) + ((f * c) % 3)) % 2 === 0,
];

/** Cuenta lo «fea» que queda una máscara. Se elige la de menos castigo. */
function castigo(m) {
  const lado = m.length;
  let total = 0;

  // Rachas de 5 o más del mismo color
  for (let f = 0; f < lado; f++) {
    for (const porFilas of [true, false]) {
      let racha = 1;
      for (let c = 1; c < lado; c++) {
        const a = porFilas ? m[f][c] : m[c][f];
        const b = porFilas ? m[f][c - 1] : m[c - 1][f];
        if (a === b) { racha++; } else { if (racha >= 5) total += racha - 2; racha = 1; }
      }
      if (racha >= 5) total += racha - 2;
    }
  }

  // Cuadros de 2×2 del mismo color
  for (let f = 0; f < lado - 1; f++) {
    for (let c = 0; c < lado - 1; c++) {
      const v = m[f][c];
      if (v === m[f][c + 1] && v === m[f + 1][c] && v === m[f + 1][c + 1]) total += 3;
    }
  }

  // Dibujos que se parecen al cuadrado de las esquinas (confunden a la cámara)
  const PATRON = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  for (let f = 0; f < lado; f++) {
    for (let c = 0; c <= lado - 11; c++) {
      const fila = PATRON.every((v, k) => m[f][c + k] === v);
      const alRevés = PATRON.every((v, k) => m[f][c + 10 - k] === v);
      if (fila || alRevés) total += 40;

      const col = PATRON.every((v, k) => m[c + k][f] === v);
      const colAlRevés = PATRON.every((v, k) => m[c + 10 - k][f] === v);
      if (col || colAlRevés) total += 40;
    }
  }

  // Que haya más o menos mitad y mitad de negro y blanco
  let negros = 0;
  for (const fila of m) for (const v of fila) if (v) negros++;
  const porcentaje = (negros * 100) / (lado * lado);
  total += Math.floor(Math.abs(porcentaje - 50) / 5) * 10;

  return total;
}

/** Los 15 bits del formato: nivel de corrección + máscara, con su BCH. */
function bitsDeFormato(mascara) {
  const datos = (0b00 << 3) | mascara;          // 00 = corrección M
  let resto = datos << 10;
  for (let i = 14; i >= 10; i--) {
    if ((resto >> i) & 1) resto ^= 0b10100110111 << (i - 10);
  }
  return ((datos << 10) | resto) ^ 0b101010000010010;
}

function ponerFormato(m, mascara) {
  const lado = m.length;
  const bits = bitsDeFormato(mascara);
  const bit = (i) => (bits >> i) & 1;

  for (let i = 0; i <= 5; i++) m[8][i] = bit(i);
  m[8][7] = bit(6);
  m[8][8] = bit(7);
  m[7][8] = bit(8);
  for (let i = 9; i <= 14; i++) m[14 - i][8] = bit(i);

  for (let i = 0; i <= 7; i++) m[lado - 1 - i][8] = bit(i);
  for (let i = 8; i <= 14; i++) m[8][lado - 15 + i] = bit(i);
}

function ponerVersion(m, version) {
  if (version < 7) return;
  const lado = m.length;

  let resto = version << 12;
  for (let i = 17; i >= 12; i--) {
    if ((resto >> i) & 1) resto ^= 0b1111100100101 << (i - 12);
  }
  const bits = (version << 12) | resto;

  for (let i = 0; i < 18; i++) {
    const b = (bits >> i) & 1;
    m[Math.floor(i / 3)][lado - 11 + (i % 3)] = b;
    m[lado - 11 + (i % 3)][Math.floor(i / 3)] = b;
  }
}

/* ── La puerta de entrada ──────────────────────────────────────────────── */

/** Devuelve la cuadrícula del QR: una matriz de 0 y 1. */
export function cuadriculaQR(texto) {
  const bytes = new TextEncoder().encode(String(texto));
  const version = versionQueCabe(bytes.length);
  const lado = 17 + version * 4;

  const datos = entrelazar(aBytesDeDatos(String(texto), version), version);

  // Se prueban las ocho máscaras y se queda la que menos confunda a la cámara
  let mejor = null, mejorCastigo = Infinity;

  for (let mascara = 0; mascara < 8; mascara++) {
    const m = nuevaCuadricula(lado);
    ponerPatronesFijos(m, version);

    const reservado = nuevaCuadricula(lado);
    ponerPatronesFijos(reservado, version);
    reservar(reservado, version);

    // Se marca lo reservado para que los datos no lo pisen
    for (let f = 0; f < lado; f++) {
      for (let c = 0; c < lado; c++) if (reservado[f][c] !== null) m[f][c] ??= -1;
    }

    escribirDatos(m, datos);

    for (let f = 0; f < lado; f++) {
      for (let c = 0; c < lado; c++) {
        if (m[f][c] === -1) { m[f][c] = null; continue; }
        if (reservado[f][c] === null && MASCARAS[mascara](f, c)) m[f][c] ^= 1;
      }
    }

    ponerFormato(m, mascara);
    ponerVersion(m, version);

    for (let f = 0; f < lado; f++) {
      for (let c = 0; c < lado; c++) if (m[f][c] === null) m[f][c] = 0;
    }

    const c = castigo(m);
    if (c < mejorCastigo) { mejorCastigo = c; mejor = m; }
  }

  return mejor;
}

/**
 * El QR como dibujo SVG, listo para meter en la pantalla.
 * Sale nítido a cualquier tamaño y se puede imprimir.
 */
export function svgQR(texto, { margen = 4 } = {}) {
  const m = cuadriculaQR(texto);
  const lado = m.length;
  const total = lado + margen * 2;

  let camino = '';
  for (let f = 0; f < lado; f++) {
    for (let c = 0; c < lado; c++) {
      if (m[f][c]) camino += `M${c + margen} ${f + margen}h1v1h-1z`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}"
    shape-rendering="crispEdges" role="img" aria-label="Código QR con la dirección de RESTA">
    <rect width="${total}" height="${total}" fill="#fff"/>
    <path d="${camino}" fill="#000"/>
  </svg>`;
}
