/**
 * PRUEBAS · CÓDIGO QR
 * ─────────────────────────────────────────────────────────────────────────────
 * Se corren con:   npm test
 *
 * Un QR que no se deja escanear no sirve de nada, y mirarlo no dice si está
 * bien. Así que aquí se hace lo único que de verdad lo demuestra: se genera
 * el dibujo y **se vuelve a leer desde cero**, como haría la cámara de un
 * teléfono — quitando la máscara, siguiendo el zigzag, desentrelazando los
 * bloques y sacando el texto. Si sale la misma dirección, está bien hecho.
 *
 * Se comprueba además que los cuadrados de las esquinas y las líneas de
 * regla estén donde manda la norma, porque es lo primero que busca la cámara.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuadriculaQR, svgQR } from '../cliente/js/qr.js';

/* ── Un lector de QR, sólo para estas pruebas ──────────────────────────── */

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

const DATOS = [16, 28, 44, 64, 86, 108, 124, 154, 182, 216];
const BLOQUES = [
  [[1, 16]], [[1, 28]], [[1, 44]], [[2, 32]], [[2, 43]],
  [[4, 27]], [[4, 31]], [[2, 38], [2, 39]], [[3, 36], [2, 37]], [[4, 43], [1, 44]],
];
const ALINEACION = [
  [], [6, 18], [6, 22], [6, 26], [6, 30],
  [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

/** Marca qué celdas son patrón fijo o formato (o sea, NO llevan datos). */
function mapaReservado(lado, version) {
  const r = Array.from({ length: lado }, () => new Array(lado).fill(false));
  const marcar = (f, c) => { if (f >= 0 && c >= 0 && f < lado && c < lado) r[f][c] = true; };

  const ojo = (fila, col) => {
    for (let f = -1; f <= 7; f++) for (let c = -1; c <= 7; c++) marcar(fila + f, col + c);
  };
  ojo(0, 0); ojo(0, lado - 7); ojo(lado - 7, 0);

  for (let i = 0; i < lado; i++) { marcar(6, i); marcar(i, 6); }

  for (const f of ALINEACION[version - 1]) {
    for (const c of ALINEACION[version - 1]) {
      if ((f <= 8 && c <= 8) || (f <= 8 && c >= lado - 9) || (f >= lado - 9 && c <= 8)) continue;
      for (let df = -2; df <= 2; df++) for (let dc = -2; dc <= 2; dc++) marcar(f + df, c + dc);
    }
  }

  for (let i = 0; i < 9; i++) { marcar(8, i); marcar(i, 8); }
  for (let i = 0; i < 8; i++) { marcar(8, lado - 1 - i); marcar(lado - 1 - i, 8); }
  marcar(lado - 8, 8);

  if (version >= 7) {
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      marcar(lado - 11 + j, i); marcar(i, lado - 11 + j);
    }
  }
  return r;
}

/** Lee la máscara que se usó, de los 15 bits de formato. */
function leerMascara(m) {
  const bits = [];
  for (let i = 0; i <= 5; i++) bits[i] = m[8][i];
  bits[6] = m[8][7]; bits[7] = m[8][8]; bits[8] = m[7][8];
  for (let i = 9; i <= 14; i++) bits[i] = m[14 - i][8];

  let valor = 0;
  for (let i = 14; i >= 0; i--) valor = (valor << 1) | bits[i];
  const sinMascara = valor ^ 0b101010000010010;

  // Los 15 bits son: 5 de datos (2 de corrección + 3 de máscara) y 10 de
  // comprobación. La máscara está ARRIBA, en los bits 12 a 10, no abajo.
  return (sinMascara >> 10) & 0b111;
}

/** El lector completo: cuadrícula → texto. */
function leerQR(m) {
  const lado = m.length;
  const version = (lado - 17) / 4;
  const reservado = mapaReservado(lado, version);
  const mascara = MASCARAS[leerMascara(m)];

  // Se quita la máscara sólo de las celdas con datos
  const limpio = m.map((f, i) => f.map((v, j) => (reservado[i][j] ? v : v ^ (mascara(i, j) ? 1 : 0))));

  // Se recorre el zigzag igual que al escribir
  const bits = [];
  let subiendo = true;
  for (let col = lado - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let f = 0; f < lado; f++) {
      const fila = subiendo ? lado - 1 - f : f;
      for (const c of [col, col - 1]) {
        if (reservado[fila][c]) continue;
        bits.push(limpio[fila][c]);
      }
    }
    subiendo = !subiendo;
  }

  const codigos = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    codigos.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  }

  // Desentrelazar: se rehacen los bloques tal como se repartieron
  const tamaños = [];
  for (const [cuantos, tamaño] of BLOQUES[version - 1]) {
    for (let b = 0; b < cuantos; b++) tamaños.push(tamaño);
  }

  const bloques = tamaños.map(() => []);
  let i = 0;
  const masLargo = Math.max(...tamaños);
  for (let j = 0; j < masLargo; j++) {
    for (let b = 0; b < bloques.length; b++) {
      if (j < tamaños[b]) bloques[b].push(codigos[i++]);
    }
  }

  const datos = bloques.flat();

  // Sacar el texto: 4 bits de modo, 8 o 16 de longitud, y los bytes
  let pos = 0;
  const tomar = (cuantos) => {
    let v = 0;
    for (let k = 0; k < cuantos; k++) {
      const byte = datos[Math.floor(pos / 8)];
      v = (v << 1) | ((byte >> (7 - (pos % 8))) & 1);
      pos++;
    }
    return v;
  };

  const modo = tomar(4);
  assert.equal(modo, 0b0100, 'debe ser modo byte');
  const largo = tomar(version < 10 ? 8 : 16);

  const bytes = [];
  for (let k = 0; k < largo; k++) bytes.push(tomar(8));

  return new TextDecoder().decode(new Uint8Array(bytes));
}

/* ── La prueba que importa: ida y vuelta ───────────────────────────────── */

const DIRECCIONES = [
  'http://192.168.1.120:8080',
  'http://10.0.0.5:8080',
  'http://192.168.100.254:8080',
  'RESTA',
  'http://192.168.1.120:8080/?mesa=4&mesero=Ana',
];

for (const texto of DIRECCIONES) {
  test(`el QR de «${texto}» se puede volver a leer`, () => {
    assert.equal(leerQR(cuadriculaQR(texto)), texto);
  });
}

test('aguanta acentos y la ñe', () => {
  const texto = 'ONCE Social Lounge — Mañana, ¿café?';
  assert.equal(leerQR(cuadriculaQR(texto)), texto);
});

test('aguanta una dirección larga (varias versiones de QR)', () => {
  const texto = 'http://192.168.1.120:8080/' + 'x'.repeat(100);
  assert.equal(leerQR(cuadriculaQR(texto)), texto);
});

/* ── Lo que busca la cámara ────────────────────────────────────────────── */

test('los tres cuadrados de las esquinas están donde deben', () => {
  const m = cuadriculaQR('http://192.168.1.120:8080');
  const lado = m.length;

  // El cuadrado es: borde negro de 7×7 con un cuadro negro de 3×3 al centro
  const esOjo = (f0, c0) => {
    for (let f = 0; f < 7; f++) {
      for (let c = 0; c < 7; c++) {
        const borde = f === 0 || f === 6 || c === 0 || c === 6;
        const centro = f >= 2 && f <= 4 && c >= 2 && c <= 4;
        if (m[f0 + f][c0 + c] !== (borde || centro ? 1 : 0)) return false;
      }
    }
    return true;
  };

  assert.ok(esOjo(0, 0), 'falta el de arriba a la izquierda');
  assert.ok(esOjo(0, lado - 7), 'falta el de arriba a la derecha');
  assert.ok(esOjo(lado - 7, 0), 'falta el de abajo a la izquierda');
});

test('las líneas de regla van alternando', () => {
  const m = cuadriculaQR('http://192.168.1.120:8080');
  for (let i = 8; i < m.length - 8; i++) {
    assert.equal(m[6][i], i % 2 === 0 ? 1 : 0);
    assert.equal(m[i][6], i % 2 === 0 ? 1 : 0);
  }
});

test('el tamaño corresponde a una versión válida', () => {
  const m = cuadriculaQR('http://192.168.1.120:8080');
  assert.equal((m.length - 17) % 4, 0);
  assert.ok(m.length >= 21 && m.length <= 57);
});

/* ── El dibujo ─────────────────────────────────────────────────────────── */

test('el SVG sale con su margen blanco alrededor', () => {
  const svg = svgQR('http://192.168.1.120:8080');
  const lado = cuadriculaQR('http://192.168.1.120:8080').length;

  assert.match(svg, /^<svg/);
  // El margen es obligatorio: sin él, muchas cámaras no encuentran el código
  assert.ok(svg.includes(`viewBox="0 0 ${lado + 8} ${lado + 8}"`));
  assert.match(svg, /fill="#fff"/);
});

test('un texto imposible de meter avisa en español', () => {
  assert.throws(() => cuadriculaQR('x'.repeat(600)), /demasiado largo/);
});
