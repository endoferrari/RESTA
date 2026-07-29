/**
 * SERVIDOR · ARRANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * El corazón de RESTA. Levanta el servidor que atiende a la caja y a las
 * tablets, abre la base de datos y se apaga limpio cuando se lo piden.
 *
 * Se puede correr solo (para desarrollo):   npm run servidor
 * O dentro de la ventana de Windows:        npm run dev
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Fastify from 'fastify';
import estaticos from '@fastify/static';
import websocket from '@fastify/websocket';

import { PUERTO, DIRECCION, VERSION, ES_DESARROLLO } from './config.js';
import { resumenRed } from './red.js';
import { abrirBase, cerrarBase } from '../datos/conexion.js';
import { RAIZ, RUTA_BASE } from '../datos/rutas-datos.js';
import { registrarRutasSalud } from './rutas/salud.js';
import { registrarRutasMenu } from './rutas/menu.js';
import { registrarRutasSesion } from './rutas/sesion.js';
import { registrarRutasCuentas } from './rutas/cuentas.js';
import { registrarRutasCobro } from './rutas/cobro.js';
import { registrarRutasImpresion } from './rutas/impresion.js';
import { registrarRutasTurnos } from './rutas/turnos.js';
import {
  arrancarRespaldoAutomatico, detenerRespaldoAutomatico, respaldarAhora,
} from '../datos/respaldo.js';
import { alCambiarEstado } from '../impresion/index.js';
import { registrarTiempoReal, avisarATodos } from './tiempo-real.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR_CLIENTE = join(AQUI, '..', 'cliente');
const DIR_NUCLEO = join(AQUI, '..', 'nucleo');

export async function crearServidor() {
  const app = Fastify({
    logger: ES_DESARROLLO
      ? { transport: undefined, level: 'warn' }
      : { level: 'error' },
    // Si una tablet manda algo enorme, lo cortamos. Un pedido no pesa 1 MB.
    bodyLimit: 1_048_576,
  });

  // ── Errores: nunca dejamos que un error tumbe el servidor ──────────────
  app.setErrorHandler((error, peticion, respuesta) => {
    const codigo = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    if (codigo >= 500) {
      console.error(`✗ Error en ${peticion.method} ${peticion.url}:`, error.message);
    }
    const cuerpo = {
      ok: false,
      error: codigo >= 500 ? 'Algo falló en el servidor' : error.message,
    };

    // Cuando dos meseros tocan la misma cuenta, además del aviso se manda la
    // cuenta como está AHORA, para que la pantalla se corrija sola en vez de
    // dejar a la persona mirando datos viejos.
    if (error.cuenta) cuerpo.cuenta = error.cuenta;

    respuesta.code(codigo).send(cuerpo);
  });

  app.setNotFoundHandler((peticion, respuesta) => {
    // Las rutas del API responden JSON; cualquier otra cosa devuelve la app
    // (para que funcionen las direcciones internas del cliente).
    if (peticion.url.startsWith('/api/')) {
      return respuesta.code(404).send({ ok: false, error: 'Esa ruta no existe' });
    }
    return respuesta.sendFile('index.html');
  });

  await app.register(websocket);
  await app.register(estaticos, { root: DIR_CLIENTE, prefix: '/' });

  // El núcleo también se sirve al navegador. NO es para que el cliente calcule
  // cobros —eso lo decide siempre el servidor—, sino para que el formato del
  // dinero y el submenú del mesero salgan del MISMO archivo en la pantalla y
  // en la caja. Si estuvieran duplicados, un día mostrarían cosas distintas.
  await app.register(estaticos, {
    root: DIR_NUCLEO,
    prefix: '/nucleo/',
    decorateReply: false,        // ya lo decoró el registro de arriba
  });

  registrarRutasSalud(app);
  registrarRutasMenu(app);
  registrarRutasSesion(app);
  registrarRutasCuentas(app);
  registrarRutasCobro(app);
  registrarRutasImpresion(app);
  registrarRutasTurnos(app);
  registrarTiempoReal(app);

  // El foquito de la impresora se enciende y se apaga solo en todas las
  // pantallas: quien esté en la caja se entera de que falta papel sin tener
  // que ir a ver la impresora.
  alCambiarEstado((estado) => avisarATodos('impresion.estado', { estado }));

  return app;
}

export async function arrancar() {
  console.log('');
  console.log('  ╭──────────────────────────────────────────╮');
  console.log('  │  RESTA · Punto de venta                  │');
  console.log(`  │  versión ${VERSION.padEnd(31)}│`);
  console.log('  ╰──────────────────────────────────────────╯');
  console.log('');

  console.log('▸ Base de datos');
  console.log(`   carpeta: ${RAIZ}`);
  abrirBase();
  console.log(`   archivo: ${RUTA_BASE}`);

  // Copia de seguridad cada hora, mientras RESTA esté prendido.
  arrancarRespaldoAutomatico({ cadaMinutos: 60 });
  console.log('   respaldo automático: cada hora');

  const app = await crearServidor();
  await app.listen({ port: PUERTO, host: DIRECCION });

  const red = resumenRed();
  console.log('');
  console.log('▸ RESTA está funcionando');
  console.log(`   en esta computadora ... http://localhost:${PUERTO}`);
  if (red.hayRed) {
    console.log(`   para las tablets ...... ${red.principal.url}`);
  } else {
    console.log('   ⚠️  Sin red: las tablets no van a poder conectarse.');
  }
  console.log('');
  console.log('   (Ctrl+C para detener)');
  console.log('');

  return app;
}

/** Apaga todo en orden: primero deja de aceptar peticiones, luego cierra la base. */
export async function detener(app) {
  console.log('\n▸ Cerrando RESTA…');
  try {
    if (app) await app.close();
    console.log('   servidor detenido');
  } catch (e) {
    console.error('   el servidor no cerró limpio:', e.message);
  }
  detenerRespaldoAutomatico();

  // Un último respaldo antes de apagar. Si algo le pasa a la laptop mientras
  // está apagada, la copia ya está hecha.
  try {
    const r = await respaldarAhora('al-apagar');
    console.log(`   respaldo guardado: ${r.archivo}`);
  } catch (e) {
    console.error('   no se pudo respaldar al apagar:', e.message);
  }

  cerrarBase();
  console.log('   base de datos cerrada correctamente');
}

// ── Si este archivo se ejecuta directamente (npm run servidor) ────────────
const ejecutadoDirecto =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (ejecutadoDirecto) {
  const app = await arrancar();

  let cerrando = false;
  const salir = async () => {
    if (cerrando) return;
    cerrando = true;
    await detener(app);
    process.exit(0);
  };

  process.on('SIGINT', salir);
  process.on('SIGTERM', salir);

  // Si algo truena sin que nadie lo atrape, lo anotamos pero NO nos caemos:
  // en un bar, que el punto de venta se cierre solo es peor que un error.
  process.on('uncaughtException', (e) => {
    console.error('✗ Error no atrapado (RESTA sigue funcionando):', e);
  });
  process.on('unhandledRejection', (e) => {
    console.error('✗ Promesa rechazada sin atender (RESTA sigue funcionando):', e);
  });
}
