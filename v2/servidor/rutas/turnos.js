/**
 * SERVIDOR · RUTAS DE TURNO Y CORTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Abrir la caja, ver cómo va la noche, y cerrarla contando el dinero.
 *
 * El corte se puede consultar en cualquier momento con el turno abierto: sirve
 * para ver cómo va sin tener que cerrar nada. Cerrar es lo irreversible, y por
 * eso pide contar el efectivo y no deja hacerlo con mesas abiertas.
 */

import {
  turnoAbierto, buscarTurno, ultimosTurnos, abrirTurno, cerrarTurno,
  corteDeTurno, ticketsSinTurno,
} from '../../datos/repos/turnos.js';
import { respaldarAhora, resumenRespaldos } from '../../datos/respaldo.js';
import { leerAjuste } from '../../datos/repos/ajustes.js';
import { imprimirCorte } from '../../impresion/index.js';
import { exigir } from '../auth.js';
import { conFolio } from '../idempotencia.js';
import { avisarATodos } from '../tiempo-real.js';

function alto(mensaje, codigo = 400) {
  const e = new Error(mensaje);
  e.statusCode = codigo;
  return e;
}

export function registrarRutasTurnos(app) {

  /** ¿Hay caja abierta? Lo consulta la pantalla al entrar. */
  app.get('/api/turno', async (peticion) => {
    exigir(peticion, 'cuenta.ver');
    const turno = turnoAbierto();
    return {
      ok: true,
      turno,
      fondoSugerido: Number(leerAjuste('turno.fondo_sugerido', '0')),
      sinTurno: turno ? 0 : ticketsSinTurno().length,
    };
  });

  /** Abrir la caja. */
  app.post('/api/turno', async (peticion) => {
    const usuario = exigir(peticion, 'turno.cerrar');
    const { fondo = null } = peticion.body ?? {};

    const turno = conFolio(peticion, '/api/turno', () =>
      abrirTurno({ fondo: fondo === null ? null : Math.trunc(fondo), usuario }));

    avisarATodos('turno.cambio', { turnoId: turno.id, abierto: true });
    return { ok: true, turno };
  });

  /** Cómo va el turno. Se puede pedir cuantas veces se quiera. */
  app.get('/api/corte', async (peticion) => {
    exigir(peticion, 'corte.ver');

    const id = peticion.query.turno ? Number(peticion.query.turno) : turnoAbierto()?.id;
    if (!id) throw alto('No hay ningún turno abierto.', 404);

    return { ok: true, corte: corteDeTurno(id) };
  });

  /** Los turnos anteriores, para volver a ver un corte pasado. */
  app.get('/api/turnos', async (peticion) => {
    exigir(peticion, 'corte.ver');
    return { ok: true, turnos: ultimosTurnos(30) };
  });

  /**
   * Cerrar la caja.
   * Al cerrar se hacen tres cosas juntas: se guarda el corte, se respalda la
   * base y sale el papel. Es el momento del día en que más importa que quede
   * todo asentado.
   */
  app.post('/api/turno/cerrar', async (peticion) => {
    const usuario = exigir(peticion, 'turno.cerrar');
    const { efectivoContado, notas = null } = peticion.body ?? {};

    const turno = turnoAbierto();
    if (!turno) throw alto('No hay ningún turno abierto.', 404);

    if (efectivoContado === undefined || efectivoContado === null) {
      throw alto('Cuenta el efectivo del cajón antes de cerrar.');
    }

    const corte = conFolio(peticion, '/api/turno/cerrar', () =>
      cerrarTurno({
        turnoId: turno.id,
        efectivoContado: Math.trunc(efectivoContado),
        notas,
        usuario,
      }));

    const impresion = imprimirCorte({ corte });

    // El respaldo va después y sin esperarlo: si el disco está lento, que no
    // se quede nadie mirando la pantalla con el corte ya hecho.
    let respaldo = null;
    try {
      respaldo = await respaldarAhora('cierre-de-turno');
    } catch (e) {
      respaldo = { error: e.message };
    }

    avisarATodos('turno.cambio', { turnoId: turno.id, abierto: false });

    return { ok: true, corte, impresion, respaldo };
  });

  /** Volver a imprimir un corte. */
  app.post('/api/turno/:id/imprimir', async (peticion) => {
    exigir(peticion, 'corte.ver');
    const id = Number(peticion.params.id);

    if (!buscarTurno(id)) throw alto('Ese turno no existe.', 404);

    const impresion = imprimirCorte({ corte: corteDeTurno(id) });
    return { ok: true, impresion };
  });

  /* ── Respaldos ───────────────────────────────────────────────────────── */

  app.get('/api/respaldos', async (peticion) => {
    exigir(peticion, 'corte.ver');
    return { ok: true, ...resumenRespaldos() };
  });

  /** Respaldar ahora mismo, a mano. */
  app.post('/api/respaldos', async (peticion) => {
    exigir(peticion, 'ajustes.cambiar');
    try {
      return { ok: true, respaldo: await respaldarAhora('manual') };
    } catch (e) {
      throw alto(`No se pudo respaldar: ${e.message}`, 500);
    }
  });
}
