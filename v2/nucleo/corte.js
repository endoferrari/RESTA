/**
 * NÚCLEO · CORTE DE CAJA
 * ─────────────────────────────────────────────────────────────────────────────
 * Las cuentas del día, o del turno: cuánto se vendió, cómo pagó la gente,
 * cuánto se regaló, y —lo que de verdad importa— **cuánto dinero debería
 * haber en el cajón**.
 *
 * La pregunta que este archivo contesta es siempre la misma:
 *
 *      fondo con el que se abrió
 *    + todo lo que entró en efectivo
 *    = lo que debe haber
 *
 * Si lo que hay es menos, falta dinero. Y como cada peso viene de un ticket
 * con folio, y cada cortesía y cada cancelación quedaron registradas con
 * nombre y motivo, siempre hay a dónde ir a ver.
 *
 * Este archivo NO sabe de base de datos ni de impresora. Recibe la lista de
 * tickets y devuelve números. Por eso se puede probar entero sin vender nada.
 */

import { sumar } from './dinero.js';

export const METODOS = ['efectivo', 'tarjeta', 'transferencia'];

/**
 * EL CORTE.
 *
 * @param tickets       los tickets del periodo (los anulados NO se pasan)
 * @param cancelados    [{ nombre, motivo, total, usuario }] cuentas canceladas
 * @param fondo         con cuánto se abrió la caja, en centavos
 * @param efectivoContado lo que se contó al cerrar (null si aún no se cierra)
 */
export function calcularCorte({
  tickets = [], cancelados = [], fondo = 0, efectivoContado = null,
} = {}) {
  const buenos = tickets.filter((t) => !t.anulado);

  /* ── Lo que se vendió ────────────────────────────────────────────── */
  const consumo   = sumar(buenos.map((t) => t.totales.consumo));
  const cortesias = sumar(buenos.map((t) => t.totales.cortesias));
  const descuento = sumar(buenos.map((t) => t.totales.descuento));
  const propina   = sumar(buenos.map((t) => t.totales.propina));
  const total     = sumar(buenos.map((t) => t.totales.total));
  const articulos = sumar(buenos.map((t) => t.totales.articulos));

  /* ── Cómo pagó la gente ──────────────────────────────────────────── */
  const porMetodo = Object.fromEntries(METODOS.map((m) => [m, 0]));
  let cambioEntregado = 0;

  for (const t of buenos) {
    for (const p of (t.pagos ?? [])) {
      if (porMetodo[p.metodo] === undefined) porMetodo[p.metodo] = 0;
      porMetodo[p.metodo] += Math.trunc(p.monto);
      cambioEntregado += Math.trunc(p.cambio ?? 0);
    }
  }

  /* ── El cajón ────────────────────────────────────────────────────── */
  // El cambio NO se resta: `monto` es lo que se quedó el bar. Si el cliente
  // dio $200 por una cuenta de $150, entraron $200 y salieron $50 — al final
  // en el cajón quedaron los $150 que dice `monto`.
  const efectivoEsperado = Math.trunc(fondo) + porMetodo.efectivo;

  const seContó = Number.isInteger(efectivoContado);
  const diferencia = seContó ? efectivoContado - efectivoEsperado : null;

  /* ── Lo que no se cobró ──────────────────────────────────────────── */
  const canceladas = {
    cuantas: cancelados.length,
    monto: sumar(cancelados.map((c) => Math.trunc(c.total ?? 0))),
    lista: cancelados,
  };

  return {
    tickets: buenos.length,
    anulados: tickets.length - buenos.length,
    articulos,

    consumo,
    cortesias,
    descuento,
    propina,
    total,

    porMetodo,
    cambioEntregado,

    fondo: Math.trunc(fondo),
    efectivoEsperado,
    efectivoContado: seContó ? efectivoContado : null,
    diferencia,
    // Banderas listas, para que la pantalla no tenga que pensar
    cuadra: seContó ? diferencia === 0 : null,
    falta: seContó ? diferencia < 0 : null,

    canceladas,
  };
}

/**
 * Lo más vendido, de mayor a menor.
 *
 * Se cuenta por PIEZAS, no por dinero: al bar le sirve saber que se fueron
 * 80 cervezas para pedirle al proveedor, aunque el whisky haya dejado más.
 * El importe va incluido para poder ver las dos cosas.
 *
 * @param lineas [{ nombre, cant, precio, cortesia }]
 */
export function loMasVendido(lineas = [], cuantos = 10) {
  const por = new Map();

  for (const l of lineas) {
    const clave = l.nombre;
    const actual = por.get(clave) ?? { nombre: clave, piezas: 0, importe: 0, regaladas: 0 };

    actual.piezas += Math.trunc(l.cant);
    if (l.cortesia) actual.regaladas += Math.trunc(l.cant);
    else actual.importe += Math.trunc(l.precio) * Math.trunc(l.cant);

    por.set(clave, actual);
  }

  return [...por.values()]
    .sort((a, b) => b.piezas - a.piezas || b.importe - a.importe)
    .slice(0, cuantos);
}

/**
 * Un resumen en frases, para leerlo de un vistazo.
 * Lo usa la pantalla y también el ticket del corte.
 */
export function resumirCorte(corte) {
  const lineas = [];

  lineas.push(`${corte.tickets} cuenta(s) cobrada(s), ${corte.articulos} producto(s)`);

  if (corte.cortesias) lineas.push(`Se regalaron ${(corte.cortesias / 100).toFixed(2)} en cortesías`);
  if (corte.descuento) lineas.push(`Se descontaron ${(corte.descuento / 100).toFixed(2)}`);
  if (corte.canceladas.cuantas) {
    lineas.push(`${corte.canceladas.cuantas} cuenta(s) cancelada(s) por ${(corte.canceladas.monto / 100).toFixed(2)}`);
  }
  if (corte.anulados) lineas.push(`${corte.anulados} ticket(s) anulado(s)`);

  if (corte.diferencia === null) {
    lineas.push('Falta contar el efectivo del cajón');
  } else if (corte.diferencia === 0) {
    lineas.push('La caja cuadra exacto');
  } else if (corte.diferencia < 0) {
    lineas.push(`FALTAN ${(Math.abs(corte.diferencia) / 100).toFixed(2)} en el cajón`);
  } else {
    lineas.push(`SOBRAN ${(corte.diferencia / 100).toFixed(2)} en el cajón`);
  }

  return lineas;
}
