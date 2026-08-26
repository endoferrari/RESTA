/**
 * PRUEBAS · LOS DOS INTERRUPTORES
 * ─────────────────────────────────────────────────────────────────────────────
 * Se corren con:   npm test
 *
 * 1. EL INVENTARIO SE PUEDE APAGAR. Apagado, el almacén no se enseña por
 *    ningún lado — pero por dentro RESTA sigue anotando las salidas de lo que
 *    ya estaba marcado. Eso es lo que hace que, el día que se encienda, la
 *    lista de «qué comprar» ya sepa cuánto se vende un sábado en vez de tener
 *    que aprenderlo desde cero.
 *
 * 2. LA COMANDA PUEDE NO SALIR EN PAPEL, y sólo la comanda: el ticket del
 *    cobro tiene que seguir imprimiéndose pase lo que pase.
 *
 * Y el ARQUEO, que es la puerta de entrada al inventario: anotar una cantidad
 * da de alta el producto, para no tener que marcar cuarenta casillas antes de
 * poder contar la primera botella.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CARPETA = mkdtempSync(join(tmpdir(), 'resta-interruptores-'));
process.env.RESTA_DATOS = CARPETA;

let abrirBase, cerrarBase;
let almacenActivo, estadoDelAlmacen, cambiarAlmacenActivo, arqueoInicial,
    existenciaDe, existencias, paraElArqueo, movimientosDe;
let configuracion, guardarConfiguracion, imprimirComanda, imprimirTicket,
    estadoImpresion, vaciar;
let listarProductos;
let ADMIN;
let cerveza, papas, michelada;

before(async () => {
  ({ abrirBase, cerrarBase } = await import('../datos/conexion.js'));
  ({
    almacenActivo, estadoDelAlmacen, cambiarAlmacenActivo, arqueoInicial,
    existenciaDe, existencias, paraElArqueo, movimientosDe,
  } = await import('../datos/repos/almacen.js'));
  ({
    configuracion, guardarConfiguracion, imprimirComanda, imprimirTicket,
    estadoImpresion, vaciar,
  } = await import('../impresion/index.js'));
  ({ listarProductos } = await import('../datos/repos/productos.js'));
  const { crearUsuario } = await import('../datos/repos/usuarios.js');

  abrirBase({ silencioso: true });
  ADMIN = crearUsuario({ nombre: 'Rosendo', pin: '9999', rol: 'admin' });

  const bebidas = listarProductos({ familia: 'Bebidas' });
  cerveza   = bebidas.find((p) => p.nombre === 'Cerveza');
  michelada = bebidas.find((p) => p.nombre === 'Michelada (salsas)');
  papas     = listarProductos({ familia: 'Comida' }).find((p) => p.nombre === 'Papas');
});

after(() => {
  vaciar();
  cerrarBase();
  rmSync(CARPETA, { recursive: true, force: true });
});

/* ── El inventario ─────────────────────────────────────────────────────── */

test('de fábrica el inventario viene APAGADO', () => {
  assert.equal(almacenActivo(), false);
  assert.equal(estadoDelAlmacen().activo, false);
});

test('apagado, todavía no se ha hecho ningún arqueo', () => {
  assert.equal(estadoDelAlmacen().arqueoHecho, false);
  assert.equal(estadoDelAlmacen().arqueoFecha, null);
});

test('se enciende y se apaga, y queda dicho cuántos se controlan', () => {
  const encendido = cambiarAlmacenActivo({ activo: true, usuario: ADMIN });
  assert.equal(encendido.activo, true);
  assert.ok(encendido.controlados >= 15, 'los licores y la cerveza vienen marcados de fábrica');

  const apagado = cambiarAlmacenActivo({ activo: false, usuario: ADMIN });
  assert.equal(apagado.activo, false);
  assert.equal(apagado.controlados, encendido.controlados,
    'apagarlo NO desmarca nada: lo que ya se contó sigue ahí');

  cambiarAlmacenActivo({ activo: true, usuario: ADMIN });
});

/* ── El arqueo ─────────────────────────────────────────────────────────── */

test('el arqueo enseña TODA la carta, no sólo lo ya controlado', () => {
  const lista = paraElArqueo();

  assert.ok(lista.some((p) => p.nombre === 'Papas' && !p.controla),
    'las papas no se controlan todavía, pero salen para poder contarlas');
  assert.ok(lista.some((p) => p.nombre === 'Cerveza' && p.controla));
});

test('anotar una cantidad DA DE ALTA el producto y fija la existencia', () => {
  const r = arqueoInicial({
    conteos: [
      { productoId: cerveza.id, contado: 84 },
      { productoId: papas.id, contado: 12 },
    ],
    usuario: ADMIN,
  });

  assert.equal(existenciaDe(cerveza.id), 84);
  assert.equal(existenciaDe(papas.id), 12);

  const lasPapas = r.find((x) => x.producto === 'Papas');
  assert.equal(lasPapas.eraNuevo, true, 'no se controlaban y ahora sí');

  assert.ok(existencias().some((p) => p.nombre === 'Papas'),
    'ya aparecen en la pantalla del almacén');
});

test('el arqueo queda fechado: desde ese día los números valen', () => {
  const e = estadoDelAlmacen();
  assert.equal(e.arqueoHecho, true);
  assert.match(e.arqueoFecha, /^\d{4}-\d\d-\d\d$/);
});

test('la diferencia del arqueo queda registrada, no aparece de la nada', () => {
  const movs = movimientosDe(cerveza.id);
  const delArqueo = movs.find((m) => m.motivo === 'Arqueo inicial');

  assert.ok(delArqueo, 'tiene que poder contestarse «¿y por qué hay 84?»');
  assert.equal(delArqueo.tipo, 'conteo');
  assert.equal(delArqueo.cantidad, 84);
});

test('lo que se deja en blanco no se toca; el 0 sí cuenta', () => {
  const antesWhisky = paraElArqueo().find((p) => p.nombre === 'Whisky Chivas');
  assert.equal(antesWhisky.existencia, 0, 'nadie lo ha contado');

  arqueoInicial({ conteos: [{ productoId: papas.id, contado: 0 }], usuario: ADMIN });

  assert.equal(existenciaDe(papas.id), 0, 'el 0 significa «no queda nada»');
  assert.equal(
    paraElArqueo().find((p) => p.nombre === 'Cerveza').existencia, 84,
    'la cerveza, que no se volvió a contar, se quedó como estaba',
  );
});

test('una mezcla no se cuenta: la michelada sale de la cerveza', () => {
  const r = arqueoInicial({
    conteos: [{ productoId: michelada.id, contado: 5 }],
    usuario: ADMIN,
  });

  assert.equal(r[0].omitido, true);
  assert.equal(existenciaDe(michelada.id), 0, 'no tiene existencia propia');
});

test('un arqueo sin ninguna cantidad se rechaza con un mensaje que se entiende', () => {
  assert.throws(
    () => arqueoInicial({ conteos: [{ productoId: cerveza.id, contado: '' }], usuario: ADMIN }),
    /No anotaste ninguna cantidad/,
  );
});

/* ── La comanda sin papel ──────────────────────────────────────────────── */

const CUENTA = {
  id: 1, nombre: 'Mesa 4',
  items: [{ id: 1, nombre: 'Cerveza', cant: 2, precio: 4500, detalle: '' }],
  totales: { total: 9000 },
};

test('de fábrica la comanda SÍ sale en papel', () => {
  assert.equal(configuracion().comanda, true);
});

test('apagada, la comanda no se encola siquiera', () => {
  vaciar();
  guardarConfiguracion({ comanda: false });

  const r = imprimirComanda({
    cuenta: CUENTA, salieron: [{ nombre: 'Cerveza', cant: 2 }], mesero: 'Ana',
  });

  assert.equal(r.impreso, false);
  assert.match(r.motivo, /sin papel/);
  assert.equal(estadoImpresion().pendientes, 0,
    'no se queda esperando: no habría papel que sacar nunca');
});

test('con la comanda apagada, el TICKET del cobro sigue saliendo', () => {
  const r = imprimirTicket({
    ticket: { folio: 7, pagos: [{ metodo: 'efectivo', monto: 9000 }], totales: CUENTA.totales },
    cuenta: CUENTA,
  });

  assert.equal(r.impreso, true, 'apagar la comanda no puede dejar sin comprobante al cliente');
  vaciar();
});

test('y la impresora entera se puede apagar aparte', () => {
  guardarConfiguracion({ comanda: true, activa: false });

  const r = imprimirTicket({
    ticket: { folio: 8, pagos: [], totales: CUENTA.totales },
    cuenta: CUENTA,
  });

  assert.equal(r.impreso, false);
  assert.match(r.motivo, /apagada/);

  guardarConfiguracion({ activa: true });
});
