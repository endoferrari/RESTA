/**
 * PRUEBAS · CUENTAS EN VIVO
 * ─────────────────────────────────────────────────────────────────────────────
 * Se corren con:   npm test
 *
 * Estos son los casos que, si se rompen, se notan cobrando mal o perdiendo
 * una comanda un sábado lleno.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CARPETA = mkdtempSync(join(tmpdir(), 'resta-cuentas-'));
process.env.RESTA_DATOS = CARPETA;

let abrirBase, cerrarBase, base;
let abrirCuenta, anotarLinea, quitarLinea, marcarComandado, cancelarCuenta,
    buscarCuenta, cuentasAbiertas, nombreDeCuenta;
let listarProductos, eventosDe, escribirAjuste;

// Se dan de alta de verdad en la base: la cuenta guarda quién la abrió, y
// eso tiene que apuntar a una persona que exista.
let ANA, CAJA;
let cerveza, papas;

before(async () => {
  ({ abrirBase, cerrarBase, base } = await import('../datos/conexion.js'));
  ({
    abrirCuenta, anotarLinea, quitarLinea, marcarComandado, cancelarCuenta,
    buscarCuenta, cuentasAbiertas, nombreDeCuenta,
  } = await import('../datos/repos/cuentas.js'));
  ({ listarProductos } = await import('../datos/repos/productos.js'));
  ({ eventosDe } = await import('../datos/repos/eventos.js'));
  ({ escribirAjuste } = await import('../datos/repos/ajustes.js'));
  const { crearUsuario } = await import('../datos/repos/usuarios.js');

  abrirBase({ silencioso: true });

  ANA  = crearUsuario({ nombre: 'Ana',  pin: '1111', rol: 'mesero' });
  CAJA = crearUsuario({ nombre: 'Caja', pin: '2222', rol: 'caja' });

  const bebidas = listarProductos({ familia: 'Bebidas' });
  cerveza = bebidas.find((p) => p.nombre === 'Cerveza');
  papas = listarProductos({ familia: 'Comida' }).find((p) => p.nombre === 'Papas');
});

after(() => {
  cerrarBase();
  rmSync(CARPETA, { recursive: true, force: true });
});

/* ── Abrir una mesa ────────────────────────────────────────────────────── */

test('un «4» a secas se entiende como «Mesa 4»', () => {
  assert.equal(nombreDeCuenta('4'), 'Mesa 4');
  assert.equal(nombreDeCuenta(' 12 '), 'Mesa 12');
  assert.equal(nombreDeCuenta('Sr. López'), 'Sr. López');
  assert.equal(nombreDeCuenta('   '), null);
});

test('abrir una mesa la deja lista y vacía', () => {
  const { cuenta, yaEstaba } = abrirCuenta({ nombre: '4', usuario: ANA });
  assert.equal(cuenta.nombre, 'Mesa 4');
  assert.equal(cuenta.estado, 'abierta');
  assert.equal(cuenta.abiertaPor, 'Ana');
  assert.equal(cuenta.items.length, 0);
  assert.equal(cuenta.totales.total, 0);
  assert.equal(yaEstaba, false);
});

test('si dos meseros abren la misma mesa, es la MISMA cuenta', () => {
  const primera = abrirCuenta({ nombre: '7', usuario: ANA });
  const segunda = abrirCuenta({ nombre: 'mesa 7', usuario: CAJA });

  assert.equal(segunda.yaEstaba, true);
  assert.equal(segunda.cuenta.id, primera.cuenta.id,
    'no puede haber dos «Mesa 7» abiertas: así se pierde una comanda');
});

/* ── Anotar ────────────────────────────────────────────────────────────── */

test('anotar una cerveza la deja en la cuenta con su precio', () => {
  const { cuenta } = abrirCuenta({ nombre: '10', usuario: ANA });
  const c = anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, usuario: ANA });

  assert.equal(c.items.length, 1);
  assert.equal(c.items[0].nombre, 'Cerveza');
  assert.equal(c.items[0].precio, 4000);
  assert.equal(c.items[0].cant, 1);
  assert.equal(c.items[0].anotadaPor, 'Ana');
  assert.equal(c.totales.total, 4000);
});

test('anotar dos veces lo mismo suma en un solo renglón', () => {
  const { cuenta } = abrirCuenta({ nombre: '11', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, usuario: ANA });
  const c = anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, usuario: ANA });

  assert.equal(c.items.length, 1, 'el ticket no debe llenarse de «Cerveza x1»');
  assert.equal(c.items[0].cant, 2);
  assert.equal(c.totales.total, 8000);
});

test('lo mismo con distinto detalle son renglones distintos', () => {
  const { cuenta } = abrirCuenta({ nombre: '12', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, detalle: 'Sol', usuario: ANA });
  const c = anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, detalle: 'Indio', usuario: ANA });

  assert.equal(c.items.length, 2);
  assert.deepEqual(c.items.map((i) => i.detalle), ['Sol', 'Indio']);
});

test('cada cambio sube la versión de la cuenta', () => {
  const { cuenta } = abrirCuenta({ nombre: '13', usuario: ANA });
  const v0 = cuenta.version;
  const c1 = anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, usuario: ANA });
  const c2 = anotarLinea({ cuentaId: cuenta.id, productoId: papas.id, usuario: ANA });

  assert.ok(c1.version > v0);
  assert.ok(c2.version > c1.version);
});

/* ── LA PRUEBA QUE MÁS IMPORTA ─────────────────────────────────────────── */

test('subir el precio a media noche NO cambia las cuentas ya abiertas', () => {
  const { cuenta } = abrirCuenta({ nombre: '20', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, usuario: ANA });

  // A media noche suben la cerveza de $40 a $60.
  base().prepare('UPDATE productos SET precio = 6000 WHERE id = ?').run(cerveza.id);

  try {
    const c = buscarCuenta(cuenta.id);
    assert.equal(c.items[0].precio, 4000, 'el cliente paga el precio que vio');
    assert.equal(c.totales.total, 4000);

    // Pero lo que se anote DESPUÉS ya va al precio nuevo, y en un renglón
    // aparte: si se sumara al viejo, se cobraría a $40 y el bar perdería $20
    // sin que nadie se diera cuenta.
    const despues = anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, usuario: ANA });
    assert.equal(despues.items.length, 2, 'el precio nuevo va en su propio renglón');
    assert.ok(despues.items.some((i) => i.precio === 6000), 'lo nuevo lleva el precio nuevo');
    assert.equal(despues.totales.total, 10000);
  } finally {
    // Se devuelve el precio pase lo que pase, para no descuadrar las demás pruebas.
    base().prepare('UPDATE productos SET precio = 4000 WHERE id = ?').run(cerveza.id);
  }
});

/* ── Quitar ────────────────────────────────────────────────────────────── */

test('quitar un renglón lo saca de la cuenta pero deja rastro', () => {
  const { cuenta } = abrirCuenta({ nombre: '30', usuario: ANA });
  const c = anotarLinea({ cuentaId: cuenta.id, productoId: papas.id, usuario: ANA });

  const despues = quitarLinea({
    cuentaId: cuenta.id, lineaId: c.items[0].id,
    motivo: 'el cliente se arrepintió', usuario: ANA,
  });

  assert.equal(despues.items.length, 0);
  assert.equal(despues.totales.total, 0);

  const rastro = eventosDe(cuenta.id).filter((e) => e.tipo === 'linea.quitar');
  assert.equal(rastro.length, 1);
  assert.equal(rastro[0].usuario_nom, 'Ana');
  assert.equal(rastro[0].detalle.producto, 'Papas');
  assert.equal(rastro[0].detalle.motivo, 'el cliente se arrepintió');
});

test('se puede quitar sólo una parte de la cantidad', () => {
  const { cuenta } = abrirCuenta({ nombre: '31', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, cant: 5, usuario: ANA });
  const c = buscarCuenta(cuenta.id);

  const despues = quitarLinea({
    cuentaId: cuenta.id, lineaId: c.items[0].id, cant: 2, usuario: ANA,
  });

  assert.equal(despues.items[0].cant, 3);
  assert.equal(despues.totales.total, 12000);
});

test('no se puede quitar más de lo que hay', () => {
  const { cuenta } = abrirCuenta({ nombre: '32', usuario: ANA });
  const c = anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, cant: 2, usuario: ANA });

  assert.throws(
    () => quitarLinea({ cuentaId: cuenta.id, lineaId: c.items[0].id, cant: 5, usuario: ANA }),
    /no es válida/
  );
});

/* ── Comanda ───────────────────────────────────────────────────────────── */

test('mandar la comanda marca lo que salió a barra', () => {
  const { cuenta } = abrirCuenta({ nombre: '40', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, cant: 2, usuario: ANA });

  const { cuenta: c, salieron } = marcarComandado({ cuentaId: cuenta.id, usuario: ANA });

  assert.equal(salieron.length, 1);
  assert.equal(salieron[0].cant, 2);
  assert.equal(c.items[0].porComandar, 0, 'ya no queda nada pendiente de mandar');
});

test('mandar la comanda dos veces avisa que no hay nada nuevo', () => {
  const { cuenta } = abrirCuenta({ nombre: '41', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, usuario: ANA });
  marcarComandado({ cuentaId: cuenta.id, usuario: ANA });

  assert.throws(
    () => marcarComandado({ cuentaId: cuenta.id, usuario: ANA }),
    /No hay nada nuevo/
  );
});

test('con la comanda activa, lo nuevo se anota aparte de lo ya mandado', () => {
  escribirAjuste('ticket.comanda', '1');

  const { cuenta } = abrirCuenta({ nombre: '42', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, usuario: ANA });
  marcarComandado({ cuentaId: cuenta.id, usuario: ANA });

  // Piden otra cerveza igual: NO debe sumarse al renglón que ya salió a barra.
  const c = anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, usuario: ANA });

  assert.equal(c.items.length, 2, 'lo ya comandado no se toca');
  assert.equal(c.items[0].porComandar, 0);
  assert.equal(c.items[1].porComandar, 1);

  escribirAjuste('ticket.comanda', '0');
});

/* ── Cancelar ──────────────────────────────────────────────────────────── */

test('cancelar exige motivo', () => {
  const { cuenta } = abrirCuenta({ nombre: '50', usuario: ANA });
  assert.throws(
    () => cancelarCuenta({ cuentaId: cuenta.id, motivo: '  ', usuario: CAJA }),
    /por qué se cancela/
  );
});

test('cancelar NO borra: marca, con motivo, responsable y cuánto se dejó de cobrar', () => {
  const { cuenta } = abrirCuenta({ nombre: '51', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, cant: 3, usuario: ANA });

  const c = cancelarCuenta({
    cuentaId: cuenta.id, motivo: 'se fueron sin pagar', usuario: CAJA,
  });

  assert.equal(c.estado, 'cancelada');
  assert.equal(c.motivo, 'se fueron sin pagar');
  assert.equal(c.items.length, 1, 'los productos siguen ahí, no se borran');
  assert.equal(c.items[0].cant, 3);

  const rastro = eventosDe(cuenta.id).find((e) => e.tipo === 'cuenta.cancelar');
  assert.equal(rastro.usuario_nom, 'Caja');
  assert.equal(rastro.detalle.seIba, 12000);
  assert.equal(rastro.detalle.articulos, 3);
});

test('en una cuenta cancelada ya no se puede anotar', () => {
  const { cuenta } = abrirCuenta({ nombre: '52', usuario: ANA });
  cancelarCuenta({ cuentaId: cuenta.id, motivo: 'prueba', usuario: CAJA });

  assert.throws(
    () => anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, usuario: ANA }),
    /cancelada/
  );
});

test('una cuenta cancelada desaparece de la lista de mesas abiertas', () => {
  const { cuenta } = abrirCuenta({ nombre: '53', usuario: ANA });
  assert.ok(cuentasAbiertas().some((c) => c.id === cuenta.id));

  cancelarCuenta({ cuentaId: cuenta.id, motivo: 'prueba', usuario: CAJA });
  assert.ok(!cuentasAbiertas().some((c) => c.id === cuenta.id));
});

test('la mesa se puede volver a abrir después de cancelarla', () => {
  const { cuenta } = abrirCuenta({ nombre: '60', usuario: ANA });
  cancelarCuenta({ cuentaId: cuenta.id, motivo: 'prueba', usuario: CAJA });

  const { cuenta: nueva, yaEstaba } = abrirCuenta({ nombre: '60', usuario: ANA });
  assert.equal(yaEstaba, false);
  assert.notEqual(nueva.id, cuenta.id, 'es una cuenta nueva, no la cancelada');
});

/* ── Los números los pone el núcleo ────────────────────────────────────── */

test('el total sale del núcleo, con cortesías y descuento', () => {
  const { cuenta } = abrirCuenta({ nombre: '70', usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: cerveza.id, cant: 2, usuario: ANA });
  anotarLinea({ cuentaId: cuenta.id, productoId: papas.id, usuario: ANA });

  const c = buscarCuenta(cuenta.id);
  // 2 cervezas de $40 + unas papas de $25 = $105
  assert.equal(c.totales.consumo, 10500);
  assert.equal(c.totales.total, 10500);
  assert.equal(c.totales.articulos, 3);
  assert.equal(c.totales.liquidada, false);
});
