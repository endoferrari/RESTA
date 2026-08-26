/**
 * NÚCLEO · CUENTA
 * ─────────────────────────────────────────────────────────────────────────────
 * El cálculo de una cuenta, de principio a fin.
 *
 * Este archivo NO sabe de pantallas, ni de base de datos, ni de internet.
 * Recibe una cuenta y devuelve los números. Nada más.
 * Por eso se puede probar entero sin abrir el programa.
 *
 * EL ORDEN DEL CÁLCULO — esto es una decisión, no un accidente:
 *
 *   1. Consumo bruto ....... todo lo que se anotó
 *   2. − Cortesías ......... lo que se regaló (no se cobra, pero se registra)
 *   3. = Consumo
 *   4. − Descuento ......... por porcentaje o por cantidad fija
 *   5. = Subtotal
 *   6. + Propina ........... calculada SOBRE EL SUBTOTAL, no sobre el bruto
 *   7. = TOTAL
 *   8. − Pagos recibidos
 *   9. = Restante
 *
 * El punto 6 importa: la propina se calcula sobre lo que el cliente
 * realmente va a pagar. Cobrar propina sobre una cortesía sería cobrarle
 * al cliente por algo que le regalaste.
 */

import { sumar, porcentaje, redondear, repartir } from './dinero.js';

/**
 * Una línea de la cuenta.
 * @typedef {Object} Linea
 * @property {string}  id
 * @property {string}  nombre
 * @property {number}  precio    centavos, congelado al momento de anotar
 * @property {number}  cant
 * @property {boolean} [cortesia] si es true, no se cobra
 * @property {boolean} [pagado]   si ya se cobró en un pago parcial
 */

/** Cuánto vale una línea. */
export function importeLinea(linea) {
  return Math.trunc(linea.precio) * Math.trunc(linea.cant);
}

/**
 * El descuento aplicado, en centavos.
 * Acepta dos formas y nunca puede pasarse del consumo:
 *   { tipo:'porcentaje', valor:15 }  →  15% del consumo
 *   { tipo:'monto',      valor:5000 } →  $50.00 fijos
 */
export function calcularDescuento(consumo, descuento) {
  if (!descuento || !descuento.valor) return 0;

  let centavos;
  if (descuento.tipo === 'porcentaje') {
    centavos = porcentaje(consumo, descuento.valor);
  } else if (descuento.tipo === 'monto') {
    centavos = Math.trunc(descuento.valor);
  } else {
    return 0;
  }

  if (centavos < 0) return 0;
  // Nunca se descuenta más de lo que se consumió: la cuenta no puede
  // quedar en negativo y el bar terminar debiéndole al cliente.
  return Math.min(centavos, consumo);
}

/**
 * La propina, en centavos.
 *   { tipo:'porcentaje', valor:10 }   →  10% del subtotal
 *   { tipo:'monto',      valor:5000 } →  $50.00 fijos
 */
export function calcularPropina(subtotal, propina) {
  if (!propina || !propina.valor) return 0;

  let centavos;
  if (propina.tipo === 'porcentaje') {
    centavos = porcentaje(subtotal, propina.valor);
  } else if (propina.tipo === 'monto') {
    centavos = Math.trunc(propina.valor);
  } else {
    return 0;
  }

  return centavos < 0 ? 0 : centavos;
}

/**
 * EL CÁLCULO COMPLETO DE UNA CUENTA.
 *
 * @param {Object}   cuenta
 * @param {Linea[]}  cuenta.items
 * @param {Object[]} [cuenta.pagos]      [{ monto }]
 * @param {Object}   [cuenta.descuento]  { tipo, valor }
 * @param {Object}   [cuenta.propina]    { tipo, valor }
 * @returns el desglose completo, todo en centavos enteros
 */
export function calcularCuenta(cuenta) {
  const items = cuenta?.items ?? [];

  const cobrables = items.filter((i) => !i.cortesia);
  const regalados = items.filter((i) => i.cortesia);

  const consumo   = sumar(cobrables.map(importeLinea));
  const cortesias = sumar(regalados.map(importeLinea));
  const bruto     = consumo + cortesias;

  const descuento = calcularDescuento(consumo, cuenta?.descuento);
  const subtotal  = consumo - descuento;
  const propina   = calcularPropina(subtotal, cuenta?.propina);
  const total     = subtotal + propina;

  const pagado    = sumar((cuenta?.pagos ?? []).map((p) => Math.trunc(p.monto)));
  const restante  = total - pagado;

  return {
    bruto,          // todo lo anotado, incluidas cortesías
    cortesias,      // lo regalado
    consumo,        // lo que sí se cobra, antes de descuento
    descuento,
    subtotal,       // consumo − descuento
    propina,
    total,          // lo que debe pagar el cliente
    pagado,
    restante,       // lo que falta por cobrar
    // Banderas listas para que la pantalla no tenga que pensar
    liquidada:      restante <= 0,
    tienePagoParcial: pagado > 0 && restante > 0,
    articulos:      sumar(items.map((i) => Math.trunc(i.cant))),
  };
}

/**
 * Cuánto le toca a cada persona de lo que FALTA por pagar.
 * Usa repartir(), así que los centavos sobrantes nunca se pierden.
 */
export function dividirRestante(cuenta, personas) {
  const { restante } = calcularCuenta(cuenta);
  return repartir(Math.max(0, restante), personas);
}

/**
 * ¿Se puede cobrar esta cantidad ahora?
 * Devuelve { valido, monto, motivo }.
 * Si se pasa de lo que falta, lo ajusta en vez de rechazarlo: es lo que
 * espera quien está en la caja con gente formada.
 */
export function revisarCobro(cuenta, montoPedido) {
  const { restante } = calcularCuenta(cuenta);

  if (!Number.isInteger(montoPedido) || montoPedido <= 0) {
    return { valido: false, monto: 0, motivo: 'Escribe la cantidad a cobrar' };
  }
  if (restante <= 0) {
    return { valido: false, monto: 0, motivo: 'Esta cuenta ya está pagada' };
  }
  if (montoPedido > restante) {
    return {
      valido: true,
      monto: restante,
      motivo: 'La cantidad era mayor a lo que falta; se ajustó',
      ajustado: true,
    };
  }
  return { valido: true, monto: montoPedido, motivo: null };
}

/**
 * El cambio a entregar en un pago en efectivo.
 * Devuelve { valido, cambio, motivo }.
 */
export function calcularCambio(montoACobrar, recibido) {
  if (recibido === null || recibido === undefined) {
    return { valido: true, cambio: 0, motivo: null }; // pagó exacto
  }
  if (!Number.isInteger(recibido) || recibido < 0) {
    return { valido: false, cambio: 0, motivo: 'La cantidad recibida no es válida' };
  }
  if (recibido < montoACobrar) {
    return {
      valido: false,
      cambio: 0,
      motivo: 'El cliente dio menos de lo que se cobra',
    };
  }
  return { valido: true, cambio: recibido - montoACobrar, motivo: null };
}

/**
 * Suma el importe de las líneas seleccionadas ("cada quien lo suyo").
 * @param {Linea[]} items
 * @param {Set<string>|string[]} seleccionados ids
 */
export function importeSeleccion(items, seleccionados) {
  const ids = seleccionados instanceof Set ? seleccionados : new Set(seleccionados);
  return sumar(
    items.filter((i) => ids.has(i.id) && !i.cortesia).map(importeLinea)
  );
}

/**
 * Reparte proporcionalmente el descuento y la propina sobre una selección
 * de productos, para que "cada quien lo suyo" cuadre exacto con el total.
 *
 * Sin esto, si una cuenta con 15% de descuento se paga producto por
 * producto, la suma de los pagos NO da el total y la caja no cuadra.
 */
export function totalDeSeleccion(cuenta, seleccionados) {
  const { consumo, descuento, propina, total } = calcularCuenta(cuenta);
  if (consumo === 0) return 0;

  const parte = importeSeleccion(cuenta.items ?? [], seleccionados);
  if (parte === 0) return 0;

  // Si eligieron todo, devolvemos el total exacto y evitamos redondeos.
  if (parte === consumo) return total;

  const proporcion   = parte / consumo;
  const suDescuento  = redondear(descuento * proporcion);
  const suPropina    = redondear(propina * proporcion);

  return parte - suDescuento + suPropina;
}
