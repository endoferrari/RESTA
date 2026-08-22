/**
 * DATOS · COBRO
 * ─────────────────────────────────────────────────────────────────────────────
 * Registrar el dinero que entra y cerrar la cuenta cuando ya no falta nada.
 *
 * Una cuenta puede recibir varios pagos: la mitad en efectivo y la mitad con
 * tarjeta, o de tres personas por separado. Mientras falte algo, la cuenta
 * sigue abierta. En cuanto el restante llega a cero, se cierra y nace su
 * ticket con la fotografía de los números de ese momento.
 *
 * TODOS los números salen de `nucleo/cuenta.js`. Aquí no se suma ni se resta
 * nada a mano: este archivo guarda y consulta, el núcleo calcula.
 */

import { base, enTransaccion } from '../conexion.js';
import { revisarCobro, calcularCambio, totalDeSeleccion } from '../../nucleo/cuenta.js';
import { buscarCuenta, exigirAbierta, tocar } from './cuentas.js';
import { anotarEvento } from './eventos.js';
import { leerAjuste, escribirAjuste } from './ajustes.js';
import { descontarVenta } from './almacen.js';

export const METODOS = ['efectivo', 'tarjeta', 'transferencia'];

/** Toma el siguiente folio y lo aparta. Va dentro de la transacción del cobro. */
function siguienteFolio() {
  const folio = Number(leerAjuste('folio.siguiente', '1'));
  escribirAjuste('folio.siguiente', folio + 1);
  return folio;
}

/**
 * REGISTRA UN PAGO.
 *
 * Tres formas de decir cuánto se cobra, por orden de precedencia:
 *
 *   · `lineas`  → "cada quien lo suyo": se cobran esos renglones. El núcleo
 *                 reparte el descuento y la propina en proporción, para que
 *                 la suma de los pagos cuadre EXACTO con el total.
 *   · `monto`   → una cantidad suelta (un pago parcial, o dividido entre N).
 *   · nada      → se cobra todo lo que falta.
 *
 * Si la cantidad es mayor que lo que falta, NO se rechaza: se ajusta a lo que
 * falta y se avisa. Es lo que espera quien está en la caja con gente formada.
 */
export function registrarCobro({
  cuentaId, metodo, monto = null, recibido = null,
  lineas = null, referencia = null, usuario,
}) {
  return enTransaccion(() => {
    exigirAbierta(cuentaId);

    if (!METODOS.includes(metodo)) {
      throw new Error('Elige cómo va a pagar: efectivo, tarjeta o transferencia.');
    }

    const cuenta = buscarCuenta(cuentaId);

    // ── Cuánto se cobra ──────────────────────────────────────────────
    let pedido;
    let idsCobradas = null;

    if (Array.isArray(lineas) && lineas.length) {
      idsCobradas = lineas.map(Number);

      const yaPagada = cuenta.items.find((i) => idsCobradas.includes(i.id) && i.pagado);
      if (yaPagada) throw new Error(`«${yaPagada.nombre}» ya se había cobrado.`);

      const todasSonDeLaCuenta = idsCobradas
        .every((id) => cuenta.items.some((i) => i.id === id));
      if (!todasSonDeLaCuenta) throw new Error('Alguno de esos renglones ya no está en la cuenta.');

      pedido = totalDeSeleccion(cuenta, idsCobradas);
      if (pedido <= 0) throw new Error('Lo que elegiste no suma nada que cobrar.');
    } else {
      pedido = monto === null ? cuenta.totales.restante : Math.trunc(monto);
    }

    const revision = revisarCobro(cuenta, pedido);
    if (!revision.valido) throw new Error(revision.motivo);

    const aCobrar = revision.monto;

    // ── El cambio (sólo en efectivo) ─────────────────────────────────
    let cambio = 0;
    if (metodo === 'efectivo' && recibido !== null) {
      const r = calcularCambio(aCobrar, Math.trunc(recibido));
      if (!r.valido) throw new Error(r.motivo);
      cambio = r.cambio;
    }

    // ── Se guarda ────────────────────────────────────────────────────
    base().prepare(`
      INSERT INTO pagos (cuenta_id, metodo, monto, recibido, cambio, referencia,
                         lineas, cobrado_por, cobrado_nom)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      cuentaId, metodo, aCobrar,
      metodo === 'efectivo' ? (recibido === null ? null : Math.trunc(recibido)) : null,
      cambio, referencia,
      idsCobradas ? JSON.stringify(idsCobradas) : null,
      usuario?.id ?? null, usuario?.nombre ?? null,
    );

    // Los renglones que se pagaron quedan marcados, para que la pantalla
    // muestre qué falta cuando la mesa paga por partes.
    if (idsCobradas) {
      const marcar = base().prepare('UPDATE lineas SET pagado = 1 WHERE id = ? AND cuenta_id = ?');
      for (const id of idsCobradas) marcar.run(id, cuentaId);
    }

    tocar(cuentaId);

    anotarEvento({
      tipo: 'cobro.registrar', referencia: cuentaId, usuario,
      detalle: {
        metodo, monto: aCobrar, recibido, cambio, referencia,
        renglones: idsCobradas?.length ?? null,
        ajustado: revision.ajustado ?? false,
      },
    });

    // ── ¿Ya quedó liquidada? ─────────────────────────────────────────
    const despues = buscarCuenta(cuentaId);
    let ticket = null;

    if (despues.totales.restante <= 0) {
      ticket = cerrarCuenta({ cuenta: despues, usuario });
    }

    return {
      cuenta: buscarCuenta(cuentaId),
      pago: { metodo, monto: aCobrar, recibido, cambio },
      ticket,
      aviso: revision.ajustado ? revision.motivo : null,
    };
  });
}

/**
 * CERRAR UNA CUENTA QUE NO SE COBRA.
 *
 * Pasa de verdad: la mesa del dueño, la ronda del cumpleaños, el proveedor.
 * Todo va como cortesía y el total queda en cero.
 *
 * Sin esto la mesa se quedaba abierta para siempre —cobrar cero no se puede,
 * y no hay nada que cobrar— y, lo peor, **la mercancía nunca salía del
 * almacén**: esas cervezas salieron del refrigerador igual que las vendidas,
 * pero el inventario seguía contándolas.
 */
export function cerrarSinCobro({ cuentaId, motivo = null, usuario }) {
  return enTransaccion(() => {
    exigirAbierta(cuentaId);

    const cuenta = buscarCuenta(cuentaId);

    if (cuenta.items.length === 0) {
      throw new Error('Esta cuenta no tiene nada anotado. Ciérrala cancelándola.');
    }
    // El freno importa: si quedara un peso por cobrar, esto sería una puerta
    // para cerrar cuentas sin pagarlas.
    if (cuenta.totales.total > 0) {
      throw new Error(
        `Esta cuenta todavía debe ${cuenta.totales.total / 100}. Sólo se puede ` +
        'cerrar así cuando TODO va de cortesía.'
      );
    }

    anotarEvento({
      tipo: 'cuenta.cortesia_total', referencia: cuentaId, usuario,
      detalle: { renglones: cuenta.items.length, bruto: cuenta.totales.bruto, motivo },
    });

    return { cuenta: buscarCuenta(cuentaId), ticket: cerrarCuenta({ cuenta, usuario }) };
  });
}

/**
 * Cierra la cuenta y le hace su ticket.
 * Los números se copian tal cual están AHORA. No se vuelven a calcular nunca:
 * el corte de hace tres meses tiene que dar lo mismo aunque después se hayan
 * cambiado precios o dado de baja productos.
 */
function cerrarCuenta({ cuenta, usuario }) {
  const t = cuenta.totales;
  const folio = siguienteFolio();

  base().prepare(`
    INSERT INTO tickets (folio, cuenta_id, nombre, fecha,
                         bruto, cortesias, consumo, descuento, subtotal,
                         propina, total, articulos, cerrado_por, cerrado_nom)
    VALUES (@folio, @cuenta_id, @nombre, @fecha,
            @bruto, @cortesias, @consumo, @descuento, @subtotal,
            @propina, @total, @articulos, @cerrado_por, @cerrado_nom)
  `).run({
    folio,
    cuenta_id: cuenta.id,
    nombre: cuenta.nombre,
    fecha: cuenta.fecha,
    bruto: t.bruto,
    cortesias: t.cortesias,
    consumo: t.consumo,
    descuento: t.descuento,
    subtotal: t.subtotal,
    propina: t.propina,
    total: t.total,
    articulos: t.articulos,
    cerrado_por: usuario?.id ?? null,
    cerrado_nom: usuario?.nombre ?? null,
  });

  // Se le pega el turno al ticket. Podría deducirse comparando horas, pero
  // un turno que cruza la medianoche —lo normal en un bar— haría de eso un
  // lío. Se busca aquí con una consulta suelta y no importando el módulo de
  // turnos, para no cruzar las importaciones entre los dos archivos.
  const turno = base().prepare('SELECT id FROM turnos WHERE cerrado IS NULL').get();
  if (turno) {
    base().prepare('UPDATE tickets SET turno_id = ? WHERE folio = ?').run(turno.id, folio);
  }

  base().prepare(`
    UPDATE cuentas
       SET estado = 'cobrada', cerrada = datetime('now','localtime'), version = version + 1
     WHERE id = ?
  `).run(cuenta.id);

  anotarEvento({
    tipo: 'cuenta.cerrar', referencia: cuenta.id, usuario,
    detalle: { folio, nombre: cuenta.nombre, total: t.total, articulos: t.articulos },
  });

  // El almacén baja solo al cerrar el ticket: nadie captura la salida de
  // mercancía, ya quedó registrada al cobrar. Va dentro de la misma
  // transacción que el ticket, así es imposible que se cobre y no baje el
  // inventario, o al revés.
  //
  // Se hace aquí y no al anotar porque una cuenta cancelada NO debe descontar:
  // si además se sirvió, eso es una merma y se registra como tal.
  descontarVenta({ cuenta, folio, usuario });

  return buscarTicket(folio);
}

/* ── Consultar ─────────────────────────────────────────────────────────── */

export function buscarTicket(folio) {
  const t = base().prepare('SELECT * FROM tickets WHERE folio = ?').get(folio);
  if (!t) return null;

  return {
    folio: t.folio,
    cuentaId: t.cuenta_id,
    nombre: t.nombre,
    fecha: t.fecha,
    momento: t.momento,
    cerradoPor: t.cerrado_nom,
    anulado: t.anulado === 1,
    anuladoMotivo: t.anulado_motivo,
    anuladoPor: t.anulado_por,
    totales: {
      bruto: t.bruto, cortesias: t.cortesias, consumo: t.consumo,
      descuento: t.descuento, subtotal: t.subtotal, propina: t.propina,
      total: t.total, articulos: t.articulos,
    },
    pagos: base().prepare(`
      SELECT metodo, monto, recibido, cambio, referencia, cobrado_nom, momento
        FROM pagos WHERE cuenta_id = ? ORDER BY id
    `).all(t.cuenta_id),
  };
}

/**
 * Los tickets de un día, para el corte (fase 6).
 * Los anulados NO cuentan para el dinero, pero se pueden pedir aparte con
 * `incluirAnulados` para revisar qué se anuló y quién lo anuló.
 */
export function ticketsDelDia(fecha, { incluirAnulados = false } = {}) {
  const filtro = incluirAnulados ? '' : 'AND anulado = 0';
  return base()
    .prepare(`SELECT folio FROM tickets WHERE fecha = ? ${filtro} ORDER BY folio`)
    .all(fecha)
    .map((t) => buscarTicket(t.folio));
}

/**
 * TODO LO VENDIDO EN UN DÍA, con sus totales sumados.
 *
 * El corte de la pantalla es por TURNO, que es lo correcto para cuadrar el
 * cajón de esa noche. Pero hay dos cosas que un corte por turno no puede
 * enseñar:
 *
 *   · las ventas importadas de la v1, que no pertenecen a ningún turno
 *     porque la v1 no sabía de turnos;
 *   · un día pasado que se quiere revisar sin buscar a qué turno tocaba.
 *
 * Es también con lo que se comprueba una migración: este total tiene que dar
 * exactamente lo mismo que el corte de ese día en la v1.
 */
export function resumenDelDia(fecha) {
  const tickets = ticketsDelDia(fecha);

  const totales = tickets.reduce((s, t) => ({
    bruto:     s.bruto     + t.totales.bruto,
    cortesias: s.cortesias + t.totales.cortesias,
    consumo:   s.consumo   + t.totales.consumo,
    descuento: s.descuento + t.totales.descuento,
    subtotal:  s.subtotal  + t.totales.subtotal,
    propina:   s.propina   + t.totales.propina,
    total:     s.total     + t.totales.total,
    articulos: s.articulos + t.totales.articulos,
  }), { bruto: 0, cortesias: 0, consumo: 0, descuento: 0,
        subtotal: 0, propina: 0, total: 0, articulos: 0 });

  // Cómo pagaron, sumado por método.
  const porMetodo = {};
  for (const t of tickets) {
    for (const p of t.pagos) {
      porMetodo[p.metodo] = (porMetodo[p.metodo] ?? 0) + p.monto;
    }
  }

  return {
    fecha,
    ventas: tickets.length,
    totales,
    porMetodo,
    tickets: tickets.map((t) => ({
      folio: t.folio,
      nombre: t.nombre,
      momento: t.momento,
      total: t.totales.total,
      articulos: t.totales.articulos,
      importado: t.cerradoPor === 'importado de la v1',
    })),
  };
}

/**
 * Deshace el último pago: se tecleó de más, o se cobró en la mesa equivocada.
 *
 * Se puede aunque la cuenta ya se haya cerrado, y a propósito: el error más
 * común en la caja es justo en el ÚLTIMO pago, el que cierra la cuenta. Si
 * eso no se pudiera arreglar, la gente terminaría apuntando las correcciones
 * en un papel aparte y el sistema dejaría de servir.
 *
 * Cuando la cuenta ya estaba cerrada:
 *   · su ticket se ANULA, no se borra. El folio se queda usado para siempre;
 *     si desaparecieran folios, cualquiera podría sacar dinero de la caja y
 *     borrar el ticket sin dejar hueco.
 *   · la cuenta se vuelve a abrir para poder cobrarla bien.
 */
export function anularUltimoPago({ cuentaId, motivo, usuario }) {
  return enTransaccion(() => {
    const fila = base().prepare('SELECT * FROM cuentas WHERE id = ?').get(cuentaId);
    if (!fila) throw new Error('Esa cuenta no existe.');
    if (fila.estado === 'cancelada') throw new Error('Esa cuenta está cancelada.');

    if (!motivo?.trim()) throw new Error('Escribe por qué se anula el pago.');

    const ultimo = base()
      .prepare('SELECT * FROM pagos WHERE cuenta_id = ? ORDER BY id DESC LIMIT 1')
      .get(cuentaId);
    if (!ultimo) throw new Error('Esta cuenta no tiene ningún pago registrado.');

    base().prepare('DELETE FROM pagos WHERE id = ?').run(ultimo.id);

    // Vuelven a estar pendientes SÓLO los renglones que liquidó este pago.
    // Los que pagó alguien más se quedan como estaban.
    if (ultimo.lineas) {
      const devolver = base().prepare('UPDATE lineas SET pagado = 0 WHERE id = ? AND cuenta_id = ?');
      for (const id of JSON.parse(ultimo.lineas)) devolver.run(id, cuentaId);
    }

    // Si la cuenta ya se había cerrado, se anula su ticket y se reabre.
    let folioAnulado = null;
    if (fila.estado === 'cobrada') {
      const ticket = base().prepare(`
        SELECT folio FROM tickets
         WHERE cuenta_id = ? AND anulado = 0
         ORDER BY folio DESC LIMIT 1
      `).get(cuentaId);

      if (ticket) {
        folioAnulado = ticket.folio;
        base().prepare(`
          UPDATE tickets
             SET anulado = 1, anulado_motivo = ?, anulado_por = ?,
                 anulado_momento = datetime('now','localtime')
           WHERE folio = ?
        `).run(motivo.trim(), usuario?.nombre ?? null, ticket.folio);
      }

      base().prepare(`
        UPDATE cuentas SET estado = 'abierta', cerrada = NULL WHERE id = ?
      `).run(cuentaId);
    }

    tocar(cuentaId);
    anotarEvento({
      tipo: 'cobro.anular', referencia: cuentaId, usuario,
      detalle: {
        metodo: ultimo.metodo, monto: ultimo.monto,
        cobradoPor: ultimo.cobrado_nom, motivo: motivo.trim(),
        ticketAnulado: folioAnulado,
        seReabrio: fila.estado === 'cobrada',
      },
    });

    return buscarCuenta(cuentaId);
  });
}
