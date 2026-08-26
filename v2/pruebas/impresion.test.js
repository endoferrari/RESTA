/**
 * PRUEBAS · IMPRESIÓN
 * ─────────────────────────────────────────────────────────────────────────────
 * Se corren con:   npm test
 *
 * La impresora de verdad está en Windows y aquí estamos en Linux, así que lo
 * que se prueba es lo que SÍ se puede probar sin papel:
 *
 *   · que el ticket quepa en el ancho del papel,
 *   · que los importes queden pegados a la derecha,
 *   · que los emojis no lleguen a la térmica (saldrían como basura),
 *   · que los acentos se conviertan a la tabla que entiende la impresora,
 *   · que los comandos de inicio sean EXACTAMENTE los que funcionaron en la
 *     v1.3.0, incluido el que cancela el modo chino.
 *
 * Lo único que no se puede probar aquí es que salga papel. Para eso está el
 * botón de prueba, en la laptop del bar.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  columnas, partirEnRenglones, alinearDosColumnas, centrar, aTexto,
  texto, titulo, dosColumnas, separador, salto, cortar,
} from '../impresion/documento.js';
import { aBytes, byteCP850, soloImprimible, rasterABytes, puntosDelLogo } from '../impresion/escpos.js';
import { comanda, cuenta, ticket, prueba } from '../impresion/plantillas.js';

/* ── El ancho del papel ────────────────────────────────────────────────── */

test('el papel de 80 mm son 48 caracteres y el de 58 mm son 32', () => {
  assert.equal(columnas(80), 48);
  assert.equal(columnas(58), 32);
  assert.equal(columnas(undefined), 48, 'si no se sabe, se asume el de 80');
});

/* ── Que nada se salga del papel ───────────────────────────────────────── */

test('un nombre largo se parte en renglones sin cortar palabras', () => {
  const r = partirEnRenglones('Whisky Buchanan\'s 12 años en las rocas', 20);
  assert.ok(r.every((l) => l.length <= 20), 'ningún renglón se pasa del ancho');
  assert.equal(r.join(' '), 'Whisky Buchanan\'s 12 años en las rocas');
});

test('una palabra más larga que el papel se parte, no se pierde', () => {
  const r = partirEnRenglones('Supercalifragilisticoespialidoso', 10);
  assert.ok(r.every((l) => l.length <= 10));
  assert.equal(r.join(''), 'Supercalifragilisticoespialidoso');
});

/* ── Los importes, pegados a la derecha ────────────────────────────────── */

test('el importe queda pegado a la derecha del renglón', () => {
  const r = alinearDosColumnas('2 Cerveza', '$80.00', 30);
  assert.equal(r.length, 30);
  assert.ok(r.endsWith('$80.00'));
  assert.ok(r.startsWith('2 Cerveza'));
});

test('si el concepto no cabe se recorta el concepto, NUNCA el importe', () => {
  const r = alinearDosColumnas('1 Whisky Buchanan\'s 12 años con hielo', '$150.00', 24);
  assert.equal(r.length, 24);
  assert.ok(r.endsWith('$150.00'), 'el precio se lee completo o el cliente reclama');
});

/* ── La tabla de caracteres de la térmica ──────────────────────────────── */

test('los acentos y la ñ se convierten a lo que entiende la impresora', () => {
  assert.equal(byteCP850('á'), 160);
  assert.equal(byteCP850('ñ'), 164);
  assert.equal(byteCP850('Ñ'), 165);
  assert.equal(byteCP850('¡'), 173);
  assert.equal(byteCP850('¿'), 168);
  assert.equal(byteCP850('A'), 65);
});

test('los emojis se omiten: la térmica no los sabe pintar', () => {
  assert.equal(byteCP850('🍺'), null);
  assert.equal(soloImprimible('🍺 Cerveza'), 'Cerveza');
  assert.equal(soloImprimible('🥃 Whisky Chivas'), 'Whisky Chivas');
});

test('soloImprimible no deja huecos dobles al quitar los emojis', () => {
  assert.equal(soloImprimible('🍧  Bolis  de  leche  🍧'), 'Bolis de leche');
});

/* ── Los comandos que costó encontrar ──────────────────────────────────── */

test('el ticket empieza con reiniciar, cancelar modo chino y CP850', () => {
  const bytes = aBytes([texto('hola')], { anchoMm: 80 });

  // ESC @ = reiniciar · FS . = cancelar modo chino · ESC t 2 = CP850
  assert.deepEqual(
    [...bytes.subarray(0, 7)],
    [0x1B, 0x40, 0x1C, 0x2E, 0x1B, 0x74, 0x02],
    'sin FS . un «¡» y la letra siguiente salen como un carácter chino'
  );
});

test('cortar alimenta papel antes del corte, para no morder el último renglón', () => {
  const bytes = aBytes([cortar()], { anchoMm: 80 });
  const cola = [...bytes.subarray(bytes.length - 7)];
  assert.deepEqual(cola, [0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x42, 0x00]);
});

test('el texto en negritas se abre y se cierra', () => {
  const bytes = [...aBytes([texto('X', { negrita: true })], { anchoMm: 80 })];
  const abre = bytes.join(',').includes('27,69,1');
  const cierra = bytes.join(',').includes('27,69,0');
  assert.ok(abre && cierra, 'si no se cierra, todo el ticket sale en negritas');
});

/* ── Los documentos completos ──────────────────────────────────────────── */

const CUENTA = {
  nombre: 'Mesa 4',
  items: [
    { cant: 1, nombre: 'Whisky Chivas', icono: '🥃', detalle: 'Puesto · Coca · Con hielo', precio: 15000, cortesia: false },
    { cant: 2, nombre: 'Cerveza', icono: '🍺', detalle: 'Sol', precio: 4000, cortesia: false },
    { cant: 1, nombre: 'Papas a la francesa (200 g)', icono: '🍟', detalle: '', precio: 7000, cortesia: true },
  ],
  totales: {
    bruto: 30000, cortesias: 7000, consumo: 23000, descuento: 2300,
    subtotal: 20700, propina: 2070, total: 22770, articulos: 4,
  },
};

test('la cuenta cabe en el papel de 80 mm', () => {
  const t = aTexto(cuenta({ negocio: 'ONCE Social Lounge', cuenta: CUENTA, pie: 'Gracias' }), { anchoMm: 80 });
  for (const renglon of t.split('\n')) {
    assert.ok(renglon.length <= 48, `este renglón se sale del papel: «${renglon}»`);
  }
});

test('la cuenta también cabe en el papel angosto de 58 mm', () => {
  const t = aTexto(cuenta({ negocio: 'ONCE Social Lounge', cuenta: CUENTA, pie: 'Gracias' }), { anchoMm: 58 });
  for (const renglon of t.split('\n')) {
    assert.ok(renglon.length <= 32, `este renglón se sale del papel angosto: «${renglon}»`);
  }
});

test('la cuenta enseña los totales y avisa que no es comprobante', () => {
  const t = aTexto(cuenta({ negocio: 'ONCE Social Lounge', cuenta: CUENTA, pie: 'Gracias' }));
  assert.match(t, /Mesa 4/);
  assert.match(t, /Consumo/);
  assert.match(t, /Cortesias/);
  assert.match(t, /Descuento/);
  assert.match(t, /Propina/);
  assert.match(t, /TOTAL.*\$227\.70/);
  assert.match(t, /NO es su comprobante/);
});

test('la cortesía sale en la cuenta pero sin importe que cobrar', () => {
  const t = aTexto(cuenta({ negocio: 'ONCE', cuenta: CUENTA }));
  assert.match(t, /Papas a la francesa.*CORTESIA/);
});

test('en el papel no queda ni un emoji', () => {
  const t = aTexto(cuenta({ negocio: 'ONCE Social Lounge', cuenta: CUENTA }));
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(t), 'un emoji en la térmica sale como basura');
});

/* ── La comanda ────────────────────────────────────────────────────────── */

const SALIERON = [
  { cant: 2, nombre: 'Cerveza', icono: '🍺', detalle: 'Sol' },
  { cant: 1, nombre: 'Whisky Chivas', icono: '🥃', detalle: 'Derecho · Sin hielo' },
];

test('la comanda lleva la mesa arriba Y abajo', () => {
  const t = aTexto(comanda({
    negocio: 'ONCE', cuenta: { nombre: 'Mesa 7' }, salieron: SALIERON, mesero: 'Ana',
  }));

  const renglones = t.split('\n').filter((l) => l.includes('Mesa 7'));
  assert.equal(renglones.length, 2,
    'en la barra los papeles se enciman; la mesa tiene que verse por los dos lados');
});

test('la comanda NO lleva precios: al cantinero no le sirven', () => {
  const t = aTexto(comanda({
    negocio: 'ONCE', cuenta: { nombre: 'Mesa 7' }, salieron: SALIERON, mesero: 'Ana',
  }));
  assert.ok(!t.includes('$'), 'un precio en la comanda sólo estorba');
});

test('la comanda dice qué preparar, con su detalle y quién lo pidió', () => {
  const t = aTexto(comanda({
    negocio: 'ONCE', cuenta: { nombre: 'Mesa 7' }, salieron: SALIERON, mesero: 'Ana',
  }));
  assert.match(t, /2 Cerveza/);
  assert.match(t, /Sol/);
  assert.match(t, /Derecho . Sin hielo/);
  assert.match(t, /Ana/);
});

/* ── El ticket ─────────────────────────────────────────────────────────── */

const TICKET = {
  folio: 47,
  nombre: 'Mesa 4',
  cerradoPor: 'Caja',
  totales: CUENTA.totales,
  pagos: [
    { metodo: 'efectivo', monto: 12770, recibido: 20000, cambio: 7230, referencia: null },
    { metodo: 'tarjeta', monto: 10000, recibido: null, cambio: 0, referencia: '4421' },
  ],
};

test('el ticket lleva folio, lo que se pagó y el cambio', () => {
  const t = aTexto(ticket({ negocio: 'ONCE Social Lounge', ticket: TICKET, cuenta: CUENTA, pie: '¡Gracias!' }));

  assert.match(t, /Ticket 47/);
  assert.match(t, /Mesa 4/);
  assert.match(t, /Efectivo/);
  assert.match(t, /Recibido.*\$200\.00/);
  assert.match(t, /Cambio.*\$72\.30/);
  assert.match(t, /Tarjeta/);
  assert.match(t, /Ref: 4421/);
});

test('el ticket cabe en los dos anchos de papel', () => {
  for (const [anchoMm, tope] of [[80, 48], [58, 32]]) {
    const t = aTexto(ticket({ negocio: 'ONCE Social Lounge', ticket: TICKET, cuenta: CUENTA }), { anchoMm });
    for (const renglon of t.split('\n')) {
      assert.ok(renglon.length <= tope, `se sale en ${anchoMm} mm: «${renglon}»`);
    }
  }
});

/* ── La tira de prueba ─────────────────────────────────────────────────── */

test('la tira de prueba revisa acentos, ancho e importes', () => {
  const t = aTexto(prueba({ negocio: 'ONCE Social Lounge', anchoMm: 80 }));
  assert.match(t, /PRUEBA DE IMPRESION/);
  assert.match(t, /á é í ó ú/);
  assert.match(t, /ñ Ñ/);
  assert.match(t, /¡Buenas! ¿Cuánto\?/);
  assert.match(t, /80 mm/);
  assert.match(t, /letras chinas/);
});

test('la tira de prueba también cabe en el papel', () => {
  const t = aTexto(prueba({ negocio: 'ONCE Social Lounge', anchoMm: 58 }), { anchoMm: 58 });
  for (const renglon of t.split('\n')) {
    assert.ok(renglon.length <= 32, `se sale del papel angosto: «${renglon}»`);
  }
});

/* ── Detalles ──────────────────────────────────────────────────────────── */

test('el separador llega justo al borde del papel', () => {
  assert.equal(aTexto([separador()], { anchoMm: 80 }), '-'.repeat(48));
  assert.equal(aTexto([separador('=')], { anchoMm: 58 }), '='.repeat(32));
});

test('el texto centrado va centrado', () => {
  assert.equal(centrar('hola', 10), '   hola');
});

test('un bloque desconocido no truena la impresión', () => {
  const t = aTexto([texto('antes'), { tipo: 'inventado' }, texto('después')]);
  assert.equal(t, 'antes\ndespués');
});

/* ── El logo del ticket ────────────────────────────────────────────────── */
/* Hasta la v2.0.5 el logo salía en blanco: la pantalla lo manda como TEXTO
   en base64 y aquí se recorría letra por letra creyendo que eran números,
   así que todos los puntos acababan en cero. Salía papel, sin dibujo y sin
   ningún aviso. Estas pruebas son para que no vuelva a pasar callado. */

test('los puntos del logo se descifran del texto que manda la pantalla', () => {
  // Cuatro puntos conocidos, en base64 igual que los manda el navegador
  const enTexto = Buffer.from([0xFF, 0x00, 0xA5, 0x3C]).toString('base64');
  assert.deepEqual([...puntosDelLogo(enTexto)], [0xFF, 0x00, 0xA5, 0x3C]);
});

test('el logo NO sale en blanco: los puntos negros llegan a la impresora', () => {
  // Una franja negra de 8 puntos de ancho por 2 de alto
  const bytes = Buffer.from([0xFF, 0xFF]).toString('base64');
  const salida = rasterABytes({ bytes, anchoEnBytes: 1, alto: 2 });

  // GS v 0 m xL xH yL yH, y luego los puntos
  assert.deepEqual([...salida.slice(0, 8)], [0x1D, 0x76, 0x30, 0x00, 1, 0, 2, 0]);
  assert.deepEqual([...salida.slice(8, 10)], [0xFF, 0xFF]);

  // Lo que fallaba: que los puntos salieran todos en cero
  assert.ok(salida.slice(8, 10).some((b) => b !== 0), 'el logo salió en blanco');
});

test('un logo con menos puntos de los que dice se rechaza al guardarlo', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir: carpetaTemporal } = await import('node:os');
  const { join: unir } = await import('node:path');

  const carpeta = mkdtempSync(unir(carpetaTemporal(), 'resta-logo-'));
  process.env.RESTA_DATOS = carpeta;

  const { abrirBase, cerrarBase } = await import('../datos/conexion.js');
  const { guardarLogo } = await import('../impresion/index.js');
  abrirBase({ silencioso: true });

  try {
    // Dice 72×161 pero sólo trae 4 puntos: antes se guardaba tan campante
    const bytes = Buffer.from([1, 2, 3, 4]).toString('base64');
    assert.throws(
      () => guardarLogo({ bytes, anchoEnBytes: 72, alto: 161 }),
      /incompleto/,
    );

    // Y uno bien formado sí pasa
    const buenos = Buffer.alloc(72 * 161, 0x0F).toString('base64');
    const r = guardarLogo({ bytes: buenos, anchoEnBytes: 72, alto: 161 });
    assert.equal(r.guardado, true);
    assert.equal(r.puntos, 72 * 161);
  } finally {
    cerrarBase();
    rmSync(carpeta, { recursive: true, force: true });
  }
});
