/**
 * DATOS · TURNOS Y CORTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Abrir la caja, ver cómo va el turno, y cerrarlo contando el dinero.
 *
 * Los números NO se calculan aquí: se juntan los tickets del turno y se le
 * pasan a `nucleo/corte.js`, que es cálculo puro y está probado. Este archivo
 * sólo consulta y guarda.
 */

import { base, enTransaccion } from '../conexion.js';
import { calcularCorte, loMasVendido } from '../../nucleo/corte.js';
import { buscarTicket } from './cobro.js';
import { anotarEvento, eventosDe } from './eventos.js';
import { leerAjuste } from './ajustes.js';

const hoy = () => new Date().toLocaleDateString('sv-SE');   // AAAA-MM-DD

function armar(fila) {
  if (!fila) return null;
  return {
    id: fila.id,
    fecha: fila.fecha,
    abierto: fila.abierto,
    abiertoPor: fila.abierto_nom,
    fondo: fila.fondo,
    cerrado: fila.cerrado,
    cerradoPor: fila.cerrado_nom,
    efectivoContado: fila.efectivo_contado,
    diferencia: fila.diferencia,
    notas: fila.notas,
    estaAbierto: fila.cerrado === null,
  };
}

/* ── Abrir y consultar ─────────────────────────────────────────────────── */

export function turnoAbierto() {
  return armar(base().prepare('SELECT * FROM turnos WHERE cerrado IS NULL').get());
}

export function buscarTurno(id) {
  return armar(base().prepare('SELECT * FROM turnos WHERE id = ?').get(id));
}

export function ultimosTurnos(cuantos = 20) {
  return base()
    .prepare('SELECT * FROM turnos ORDER BY id DESC LIMIT ?')
    .all(cuantos)
    .map(armar);
}

/**
 * Abre la caja.
 * El fondo es el dinero que se deja para dar cambio. Si no se anota, al
 * final del turno no hay contra qué comparar lo que se contó.
 */
export function abrirTurno({ fondo = null, usuario }) {
  return enTransaccion(() => {
    if (turnoAbierto()) {
      throw new Error('Ya hay un turno abierto. Ciérralo antes de abrir otro.');
    }

    const cantidad = fondo === null
      ? Number(leerAjuste('turno.fondo_sugerido', '0'))
      : Math.trunc(fondo);

    if (!Number.isInteger(cantidad) || cantidad < 0) {
      throw new Error('El fondo de caja no es una cantidad válida.');
    }

    const r = base().prepare(`
      INSERT INTO turnos (fecha, abierto_por, abierto_nom, fondo)
      VALUES (?, ?, ?, ?)
    `).run(hoy(), usuario?.id ?? null, usuario?.nombre ?? null, cantidad);

    const id = Number(r.lastInsertRowid);
    anotarEvento({ tipo: 'turno.abrir', referencia: `turno:${id}`, usuario, detalle: { fondo: cantidad } });

    return buscarTurno(id);
  });
}

/* ── El corte ──────────────────────────────────────────────────────────── */

/** Los tickets de un turno, con todo lo que el corte necesita. */
function ticketsDelTurno(turnoId) {
  return base()
    .prepare('SELECT folio FROM tickets WHERE turno_id = ? ORDER BY folio')
    .all(turnoId)
    .map((t) => buscarTicket(t.folio));
}

/** Los renglones vendidos en el turno, para saber qué se fue más. */
function lineasDelTurno(turnoId) {
  return base().prepare(`
    SELECT l.nombre, l.cant, l.precio, l.cortesia
      FROM lineas l
      JOIN cuentas c  ON c.id = l.cuenta_id
      JOIN tickets t  ON t.cuenta_id = c.id AND t.anulado = 0
     WHERE t.turno_id = ?
  `).all(turnoId).map((l) => ({ ...l, cortesia: l.cortesia === 1 }));
}

/** Las cuentas que se cancelaron durante el turno, con su motivo. */
function canceladasDelTurno(turno) {
  const hasta = turno.cerrado ?? '9999-12-31';

  return base().prepare(`
    SELECT id, nombre, motivo, cerrada FROM cuentas
     WHERE estado = 'cancelada' AND cerrada >= ? AND cerrada <= ?
     ORDER BY cerrada
  `).all(turno.abierto, hasta).map((c) => {
    // Cuánto se dejó de cobrar quedó anotado en el evento de la cancelación.
    const evento = eventosDe(c.id).find((e) => e.tipo === 'cuenta.cancelar');
    return {
      nombre: c.nombre,
      motivo: c.motivo,
      total: evento?.detalle?.seIba ?? 0,
      usuario: evento?.usuario_nom ?? null,
      momento: c.cerrada,
    };
  });
}

/**
 * EL CORTE del turno.
 * Se puede pedir en cualquier momento, con el turno abierto: sirve para ver
 * cómo va la noche sin tener que cerrar nada.
 */
export function corteDeTurno(turnoId) {
  const turno = buscarTurno(turnoId);
  if (!turno) throw new Error('Ese turno no existe.');

  const tickets = ticketsDelTurno(turnoId);

  const numeros = calcularCorte({
    tickets,
    cancelados: canceladasDelTurno(turno),
    fondo: turno.fondo,
    efectivoContado: turno.efectivoContado,
  });

  // La lista se saca UNA vez y se corta en dos: el papel lleva los diez
  // primeros —el rollo cuesta— y la pantalla los enseña todos, que es lo que
  // pidió Rosendo para saber qué se movió en el turno.
  //
  // Sale de los renglones de los tickets, NO de los movimientos de almacén:
  // el almacén sólo sigue 17 productos y aquí tienen que salir los 137.
  const vendido = loMasVendido(lineasDelTurno(turnoId), Infinity);

  return {
    turno,
    ...numeros,
    vendido,
    masVendido: vendido.slice(0, 10),
    // Las mesas que siguen abiertas: si se cierra el turno con cuentas
    // abiertas, ese dinero todavía no ha entrado y hay que saberlo.
    cuentasAbiertas: base()
      .prepare(`SELECT count(*) AS total FROM cuentas WHERE estado = 'abierta'`)
      .get().total,
  };
}

/* ── Cerrar ────────────────────────────────────────────────────────────── */

/**
 * Cierra el turno.
 *
 * Se exige contar el efectivo. No es burocracia: es el único momento del día
 * en que se puede descubrir un faltante mientras todavía se sabe quién estuvo
 * en la caja.
 *
 * Si quedan mesas abiertas, no se cierra: ese dinero no ha entrado y el corte
 * saldría mal. Hay que cobrarlas o cancelarlas primero.
 */
export function cerrarTurno({ turnoId, efectivoContado, notas = null, usuario }) {
  return enTransaccion(() => {
    const turno = buscarTurno(turnoId);
    if (!turno) throw new Error('Ese turno no existe.');
    if (!turno.estaAbierto) throw new Error('Ese turno ya estaba cerrado.');

    if (!Number.isInteger(efectivoContado) || efectivoContado < 0) {
      throw new Error('Cuenta el efectivo del cajón antes de cerrar.');
    }

    const abiertas = base()
      .prepare(`SELECT count(*) AS total FROM cuentas WHERE estado = 'abierta'`)
      .get().total;

    if (abiertas > 0) {
      throw new Error(
        `Todavía hay ${abiertas} mesa(s) abierta(s). Cóbralas o cancélalas antes de cerrar el turno.`
      );
    }

    const corte = corteDeTurno(turnoId);
    const diferencia = efectivoContado - corte.efectivoEsperado;

    base().prepare(`
      UPDATE turnos
         SET cerrado = datetime('now','localtime'),
             cerrado_por = ?, cerrado_nom = ?,
             efectivo_contado = ?, diferencia = ?, notas = ?
       WHERE id = ?
    `).run(usuario?.id ?? null, usuario?.nombre ?? null,
           efectivoContado, diferencia, notas, turnoId);

    anotarEvento({
      tipo: 'turno.cerrar', referencia: `turno:${turnoId}`, usuario,
      detalle: {
        fondo: turno.fondo,
        esperado: corte.efectivoEsperado,
        contado: efectivoContado,
        diferencia,
        tickets: corte.tickets,
        total: corte.total,
        notas,
      },
    });

    return corteDeTurno(turnoId);
  });
}

/**
 * Los tickets que se cobraron SIN turno abierto.
 *
 * No debería pasar —la caja se abre antes de vender— pero si alguien empieza
 * a cobrar sin abrir turno, ese dinero no aparecería en ningún corte y se
 * perdería de vista. Aquí se puede ver y arreglar.
 */
export function ticketsSinTurno() {
  return base()
    .prepare('SELECT folio FROM tickets WHERE turno_id IS NULL AND anulado = 0 ORDER BY folio')
    .all()
    .map((t) => buscarTicket(t.folio));
}
