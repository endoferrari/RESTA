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
 * 2. LA COMANDA PUEDE NO SALIR EN PAPEL, y sólo la comanda: apagarla no
 *    puede dejar sin comprobante al cliente.
 *
 * 3. EL COMPROBANTE DEL COBRO TAMBIÉN SE PUEDE APAGAR, y entonces el papel
 *    sólo sale para quien lo pide. Lo que NO se puede perder por ahorrar
 *    papel es el cajón de dinero —hay que dar el cambio— ni la copia, que
 *    tiene que salir marcada para que dos papeles con el mismo folio no se
 *    cuenten dos veces al cuadrar la caja.
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
let plantillaTicket, aTexto;
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
  ({ ticket: plantillaTicket } = await import('../impresion/plantillas.js'));
  ({ aTexto } = await import('../impresion/documento.js'));
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

/* ── El comprobante del cobro ──────────────────────────────────────────── */

/** El papel que se encoló, para comprobar qué salió y qué no. */
const enLaCola = (nombre) => estadoImpresion().cola.some((t) => t.nombre === nombre);

test('de fábrica el comprobante SÍ sale al cobrar', () => {
  guardarConfiguracion({ activa: true, comanda: true });
  assert.equal(configuracion().ticket, true,
    'nadie se queda sin ticket por instalar RESTA: se apaga a propósito o no se apaga');
});

test('apagado el comprobante, no sale papel pero el cajón sí se abre', () => {
  vaciar();
  guardarConfiguracion({ ticket: false });

  const r = imprimirTicket({
    ticket: { folio: 20, pagos: [{ metodo: 'efectivo', monto: 9000 }], totales: CUENTA.totales },
    cuenta: CUENTA,
  });

  assert.equal(r.impreso, false);
  assert.match(r.motivo, /sólo si lo piden/);
  assert.equal(enLaCola('ticket'), false, 'no se gasta papel');
  // Esto es lo que no se puede perder por ahorrar rollo: quien cobra en
  // efectivo necesita el cajón abierto para dar el cambio.
  assert.equal(r.cajon, true);
  vaciar();
});

test('si pagó con tarjeta y el comprobante está apagado, no se manda nada', () => {
  vaciar();

  const r = imprimirTicket({
    ticket: { folio: 21, pagos: [{ metodo: 'tarjeta', monto: 9000 }], totales: CUENTA.totales },
    cuenta: CUENTA,
  });

  assert.equal(r.impreso, false);
  assert.equal(r.cajon, false, 'no hay cambio que dar: el cajón se queda cerrado');
  assert.equal(estadoImpresion().pendientes, 0);
});

test('el comprobante que pide el cliente sale AUNQUE esté apagado', () => {
  vaciar();

  const r = imprimirTicket({
    ticket: { folio: 22, pagos: [{ metodo: 'efectivo', monto: 9000 }], totales: CUENTA.totales },
    cuenta: CUENTA, copia: true, forzar: true,
  });

  assert.equal(r.impreso, true,
    'si respetara el interruptor, el botón no haría nada justo cuando hace falta');

  vaciar();
  guardarConfiguracion({ ticket: true });
});

/** Un ticket de mentiras para mirar el papel sin tocar la base. */
const TICKET_FALSO = {
  folio: 23, nombre: 'Mesa 4', momento: '2026-08-30 21:34:07',
  cerradoPor: 'Ana', pagos: [{ metodo: 'efectivo', monto: 9000 }],
  totales: { consumo: 9000, cortesias: 0, descuento: 0, subtotal: 9000, propina: 0, total: 9000 },
};

test('la copia sale marcada, y con la fecha del cobro y no la de hoy', () => {
  const papel = aTexto(plantillaTicket({
    negocio: 'ONCE', pie: 'Gracias', ticket: TICKET_FALSO, cuenta: CUENTA, copia: true,
  }));

  assert.match(papel, /COPIA/,
    'sin la marca, dos papeles con el mismo folio se cuentan dos veces al cuadrar');
  assert.ok(papel.includes('30/08/2026 21:34'),
    'si el cliente vuelve al día siguiente, la fecha que vale es la del cobro');
  assert.match(papel, /No es un cobro nuevo/);
});

test('el ticket normal NO lleva esa marca', () => {
  const papel = aTexto(plantillaTicket({
    negocio: 'ONCE', pie: 'Gracias', ticket: TICKET_FALSO, cuenta: CUENTA,
  }));

  assert.doesNotMatch(papel, /COPIA/);
  assert.doesNotMatch(papel, /No es un cobro nuevo/);
});

test('un ticket anulado se marca ANULADO, que pesa más que la copia', () => {
  const papel = aTexto(plantillaTicket({
    negocio: 'ONCE', pie: 'Gracias', copia: true, cuenta: CUENTA,
    ticket: { ...TICKET_FALSO, folio: 24, anulado: true },
  }));

  // Ese cobro se deshizo: el papel no puede parecer un comprobante bueno.
  assert.match(papel, /ANULADO/);
});
