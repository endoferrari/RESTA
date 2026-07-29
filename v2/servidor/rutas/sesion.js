/**
 * SERVIDOR · ENTRAR CON PIN Y ADMINISTRAR MESEROS
 * ─────────────────────────────────────────────────────────────────────────────
 * La primera vez que se instala RESTA no hay ningún usuario. En vez de dejar
 * un PIN de fábrica escrito en un manual (que nadie cambia nunca), la primera
 * pantalla pide crear el administrador. Así el único que conoce ese PIN es
 * quien instaló el sistema.
 */

import {
  contarUsuarios, listarUsuarios, crearUsuario, apagarUsuario, cambiarPin,
  usuarioConPin, pinYaUsado, abrirSesion, cerrarSesion, buscarUsuario,
} from '../../datos/repos/usuarios.js';
import { anotarEvento } from '../../datos/repos/eventos.js';
import { permisosDe, pinValido } from '../../nucleo/permisos.js';
import { usuarioDe, exigir, frenoActivo, anotarIntentoFallido, limpiarIntentos } from '../auth.js';

/** Error con mensaje que se le puede enseñar tal cual a la persona. */
function alto(mensaje, codigo = 400) {
  const e = new Error(mensaje);
  e.statusCode = codigo;
  return e;
}

export function registrarRutasSesion(app) {

  /** ¿Quién soy? También dice si el sistema todavía no tiene usuarios. */
  app.get('/api/sesion', async (peticion) => {
    const usuario = usuarioDe(peticion);
    return {
      ok: true,
      hayUsuarios: contarUsuarios() > 0,
      usuario,
      permisos: usuario ? permisosDe(usuario.rol) : [],
    };
  });

  /** Entrar con el PIN. */
  app.post('/api/sesion', async (peticion) => {
    const { pin } = peticion.body ?? {};
    const desde = peticion.ip;

    const esperar = frenoActivo(desde);
    if (esperar) {
      throw alto(`Demasiados intentos. Espera ${esperar} segundos y vuelve a probar.`, 429);
    }

    if (!pinValido(pin)) {
      throw alto('El PIN son 4 números.');
    }

    const usuario = usuarioConPin(pin);
    if (!usuario) {
      anotarIntentoFallido(desde);
      // A propósito NO se dice si el PIN no existe o si el usuario está
      // dado de baja: eso ayudaría a quien esté adivinando.
      throw alto('Ese PIN no es de nadie. Revísalo.', 401);
    }

    limpiarIntentos(desde);
    const token = abrirSesion(usuario.id, desde);

    anotarEvento({ tipo: 'sesion.entrar', referencia: usuario.id, usuario, detalle: { desde } });

    return { ok: true, pase: token, usuario, permisos: permisosDe(usuario.rol) };
  });

  /** Salir. */
  app.delete('/api/sesion', async (peticion) => {
    const pase = peticion.headers['x-pase'];
    const usuario = usuarioDe(peticion);
    if (pase) cerrarSesion(pase);
    if (usuario) anotarEvento({ tipo: 'sesion.salir', referencia: usuario.id, usuario });
    return { ok: true };
  });

  /**
   * Crear el PRIMER usuario (administrador).
   * Sólo funciona mientras no haya ninguno: después de eso, esta puerta se
   * cierra sola y los usuarios los da de alta el administrador.
   */
  app.post('/api/usuarios/primero', async (peticion) => {
    if (contarUsuarios() > 0) {
      throw alto('El sistema ya tiene usuarios. Pídele al administrador que te dé de alta.', 409);
    }

    const { nombre, pin } = peticion.body ?? {};
    if (!nombre?.trim()) throw alto('Escribe tu nombre.');
    if (!pinValido(pin)) throw alto('El PIN son 4 números.');

    const usuario = crearUsuario({ nombre: nombre.trim(), pin, rol: 'admin' });
    const token = abrirSesion(usuario.id, peticion.ip);

    anotarEvento({ tipo: 'usuario.crear', referencia: usuario.id, usuario,
      detalle: { nombre: usuario.nombre, rol: 'admin', primero: true } });

    return { ok: true, pase: token, usuario, permisos: permisosDe(usuario.rol) };
  });

  /** La lista de quién puede entrar. */
  app.get('/api/usuarios', async (peticion) => {
    exigir(peticion, 'usuarios.administrar');
    return { ok: true, usuarios: listarUsuarios() };
  });

  /** Dar de alta un mesero (o alguien de caja). */
  app.post('/api/usuarios', async (peticion) => {
    const quien = exigir(peticion, 'usuarios.administrar');
    const { nombre, pin, rol } = peticion.body ?? {};

    if (!nombre?.trim()) throw alto('Escribe el nombre de la persona.');
    if (!pinValido(pin)) throw alto('El PIN son 4 números.');
    if (!['admin', 'caja', 'mesero'].includes(rol)) throw alto('Elige si es mesero, caja o administrador.');

    // Dos personas con el mismo PIN sería imposible de auditar después.
    if (pinYaUsado(pin)) throw alto('Ese PIN ya es de otra persona. Pon otro.');

    const existe = listarUsuarios()
      .some((u) => u.nombre.toLowerCase() === nombre.trim().toLowerCase());
    if (existe) throw alto('Ya hay alguien con ese nombre.');

    const usuario = crearUsuario({ nombre: nombre.trim(), pin, rol });

    anotarEvento({ tipo: 'usuario.crear', referencia: usuario.id, usuario: quien,
      detalle: { nombre: usuario.nombre, rol } });

    return { ok: true, usuario };
  });

  /** Cambiarle el PIN a alguien (por ejemplo, cuando se le olvidó). */
  app.post('/api/usuarios/:id/pin', async (peticion) => {
    const quien = exigir(peticion, 'usuarios.administrar');
    const id = Number(peticion.params.id);
    const { pin } = peticion.body ?? {};

    const usuario = buscarUsuario(id);
    if (!usuario) throw alto('Esa persona no existe.', 404);
    if (!pinValido(pin)) throw alto('El PIN son 4 números.');
    if (pinYaUsado(pin, id)) throw alto('Ese PIN ya es de otra persona. Pon otro.');

    cambiarPin(id, pin);
    anotarEvento({ tipo: 'usuario.pin', referencia: id, usuario: quien,
      detalle: { nombre: usuario.nombre } });

    return { ok: true };
  });

  /** Dar de baja. No se borra: se apaga, para que su historial siga teniendo dueño. */
  app.delete('/api/usuarios/:id', async (peticion) => {
    const quien = exigir(peticion, 'usuarios.administrar');
    const id = Number(peticion.params.id);

    const usuario = buscarUsuario(id);
    if (!usuario) throw alto('Esa persona no existe.', 404);

    // Que nadie se deje a sí mismo fuera del sistema por accidente.
    if (id === quien.id) throw alto('No te puedes dar de baja a ti mismo.');

    const admins = listarUsuarios().filter((u) => u.rol === 'admin');
    if (usuario.rol === 'admin' && admins.length <= 1) {
      throw alto('Es el único administrador. Da de alta a otro antes de quitar a este.');
    }

    apagarUsuario(id);
    anotarEvento({ tipo: 'usuario.baja', referencia: id, usuario: quien,
      detalle: { nombre: usuario.nombre, rol: usuario.rol } });

    return { ok: true };
  });
}
