/**
 * CLIENTE · APLICACIÓN
 * ─────────────────────────────────────────────────────────────────────────────
 * Junta las piezas: la línea con la caja, quién entró y qué pantalla se ve.
 *
 * El recorrido de una noche:
 *   PIN → Mesas → Cuenta → (mandar comanda) → Mesas → …
 *
 * Todas las pantallas viven la misma realidad: cuando alguien anota algo en
 * su tablet, el servidor avisa por la línea abierta y las demás pantallas se
 * actualizan solas, sin que nadie recargue nada.
 */

import { api, paseGuardado, guardarPase } from './api.js';
import { conectar } from './conexion.js';
import { estado, ponerMenu } from './estado.js';
import { $, esc, avisar, cerrarVentana } from './ui.js';
import { svgQR } from './qr.js';
import { LOGO_COLOR } from './logo-once.js';

import { iniciarPin, pintarPin } from './vistas/pin.js';
import { iniciarMesas, cargarMesas, pintarMesas } from './vistas/mesas.js';
import { iniciarCuenta, pintarCuenta } from './vistas/cuenta.js';
import { iniciarCarta, cargarCarta, pintarCarta, limpiarResultadoCarta } from './vistas/carta.js';
import { iniciarCobro, empezarCobro, pintarCobro } from './vistas/cobro.js';
import {
  iniciarImpresora, iniciarAncho, cargarImpresora, pintarImpresora,
  ponerEstadoImpresion, alTocarFoquito, puedeVerImpresora,
} from './vistas/impresora.js';
import {
  iniciarCorte, cargarCorte, pintarCorte, pintarAvisoDeCaja, hayCaja,
} from './vistas/corte.js';
import {
  iniciarConfiguracion, cargarConfiguracion, pintarConfiguracion,
  ponerAvanceDeActualizacion,
} from './vistas/configuracion.js';
import { iniciarAlmacen, cargarAlmacen, pintarAlmacen } from './vistas/almacen.js';

/* ── Cambiar de pantalla ────────────────────────────────────────────────── */

const PANTALLAS = ['pin', 'mesas', 'cuenta', 'cobro', 'carta', 'impresora', 'corte', 'config', 'almacen'];

function ir(vista) {
  estado.vista = vista;

  // Ojo: aquí NO se cierran las ventanitas abiertas.
  // Al cobrar, el servidor avisa por la línea que la cuenta se cerró y esta
  // pantalla se va sola a Mesas; si eso cerrara la ventana, el cambio para
  // el cliente desaparecería antes de que a nadie le diera tiempo de leerlo.
  // Las ventanas se cierran solas al contestarlas, o al salir de la sesión.

  for (const p of PANTALLAS) {
    $(`pantalla-${p}`).hidden = p !== vista;
  }

  // La barra lateral no se enseña en la pantalla del PIN: quien no ha
  // entrado no tiene por qué ver el nombre de nadie.
  $('lateral').hidden = vista === 'pin';
  aplicarBarra();

  // Se marca en ámbar dónde estás. Sin esto, con la barra a un lado uno se
  // pierde: todas las pantallas se parecen desde lejos.
  const DONDE_ESTOY = {
    mesas: 'boton-ir-mesas', cuenta: 'boton-ir-mesas', cobro: 'boton-ir-mesas',
    corte: 'boton-ir-corte', carta: 'boton-ir-carta', config: 'boton-ir-config',
    almacen: 'boton-ir-almacen',
  };
  for (const id of ['boton-ir-mesas', 'boton-ir-corte', 'boton-ir-almacen',
                    'boton-ir-carta', 'boton-ir-config']) {
    $(id).classList.toggle('activo', DONDE_ESTOY[vista] === id);
  }

  if (vista === 'pin')    pintarPin();
  if (vista === 'mesas')  pintarMesas();
  if (vista === 'cuenta') pintarCuenta();
  if (vista === 'cobro')  pintarCobro();
  if (vista === 'carta')  pintarCarta();
  if (vista === 'impresora') pintarImpresora();
  if (vista === 'corte') pintarCorte();
  if (vista === 'config') pintarConfiguracion();
  if (vista === 'almacen') pintarAlmacen();
}

async function irACuenta(cuenta) {
  estado.cuenta = cuenta;
  ir('cuenta');
  // Se vuelve a pedir al servidor por si cambió entre el clic y ahora.
  await refrescarCuenta();
}

async function volverAMesas() {
  estado.cuenta = null;
  await cargarMesas();
  pintarAvisoDeCaja();
  ir('mesas');
}

/* ── Quién entró ───────────────────────────────────────────────────────── */

function ponerUsuario(r) {
  estado.usuario  = r.usuario;
  estado.permisos = r.permisos ?? [];
  $('quien-soy').innerHTML =
    `<b>${esc(r.usuario.nombre)}</b> <span class="rol">${esc(r.usuario.rol)}</span>`;

  // La carta sólo la administra quien puede tocarla.
  $('boton-ir-carta').hidden = !estado.permisos.includes('menu.ver');
  // El foquito de la impresora sólo le sirve a quien puede hacer algo con él.
  if (!puedeVerImpresora()) $('foquito').hidden = true;
  // El corte es de caja y administración: el mesero no lo ve.
  $('boton-ir-corte').hidden = !estado.permisos.includes('corte.ver');
  // Configurar la carta y dar de alta gente es sólo del administrador.
  $('boton-ir-config').hidden = !estado.permisos.includes('ajustes.cambiar');
  aplicarBotonAlmacen();
}

/**
 * El botón del almacén aparece si se cumplen DOS cosas: que este bar lleve
 * inventario y que la persona sea de caja o administración (es quien está de
 * noche y necesita saber si aguanta hasta mañana).
 *
 * Con el inventario apagado no se enseña a nadie: un bar que apenas está
 * aprendiendo a cobrar no tiene por qué cargar con un módulo que todavía no
 * puede mantener. Se enciende en Configuración → El sistema.
 */
function aplicarBotonAlmacen() {
  $('boton-ir-almacen').hidden =
    !estado.almacen.activo || !estado.permisos.includes('corte.ver');
}

/** Le pregunta al servidor si este bar lleva inventario. */
export async function cargarEstadoAlmacen() {
  try {
    const r = await api.estadoAlmacen();
    estado.almacen = {
      activo: r.activo, arqueoHecho: r.arqueoHecho,
      arqueoFecha: r.arqueoFecha, controlados: r.controlados,
    };
  } catch { /* si no se pudo preguntar, se queda como estaba */ }

  aplicarBotonAlmacen();

  // Si estaba mirando el almacén justo cuando lo apagaron desde otra tablet,
  // no puede quedarse ahí: se va a Mesas, que siempre existe.
  if (!estado.almacen.activo && estado.vista === 'almacen') volverAMesas();
}

async function entrar(r) {
  ponerUsuario(r);
  await Promise.all([
    cargarCarta(), cargarMesas(), cargarImpresora(), cargarCorte(),
    cargarEstadoAlmacen(),
  ]);

  // Si la caja no está abierta, no tiene sentido enseñar las mesas: lo
  // primero de la noche es abrir la caja. Se entra directo a esa pantalla,
  // y en cuanto se abre, la app se va sola a Mesas.
  if (!hayCaja() && estado.permisos.includes('turno.cerrar')) {
    ir('corte');
    return;
  }

  ir('mesas');
}

async function salir() {
  try { await api.salir(); } catch { /* si no se pudo avisar, igual salimos */ }
  cerrarVentana();
  guardarPase(null);
  estado.usuario = null;
  estado.permisos = [];
  estado.cuenta = null;
  ir('pin');
}

/* ── La línea con la caja ──────────────────────────────────────────────── */

conectar({
  alCambiarEstado(conectado) {
    $('sin-conexion').hidden = conectado;
    if (conectado && estado.usuario) refrescarTodo();
  },

  alRecibir(mensaje) {
    if (!estado.usuario) return;

    // Otra pantalla cambió la carta (o se importó un respaldo).
    if (mensaje.tipo === 'menu.cambio') cargarCarta();

    // La impresora cambió de estado: se apagó, se quedó sin papel, o ya salió.
    if (mensaje.tipo === 'impresion.estado') ponerEstadoImpresion(mensaje.estado);

    // Va bajando la versión nueva. La barra se mueve sola: bajar 100 MB por
    // el WiFi del bar tarda, y sin verla moverse cualquiera supone que se
    // atoró y le da otra vez al botón.
    if (mensaje.tipo === 'actualizacion.avance') ponerAvanceDeActualizacion(mensaje.avance);

    // Se abrió o se cerró la caja desde otra pantalla.
    if (mensaje.tipo === 'turno.cambio') cargarCorte();

    // Otra pantalla movió el almacén (llegó un pedido, se anotó una merma).
    if (mensaje.tipo === 'almacen.cambio') {
      // Si lo que cambió fue el interruptor —lo encendieron o lo apagaron—,
      // la barra lateral de TODAS las tablets tiene que enterarse, estén
      // donde estén.
      if ('activo' in mensaje) cargarEstadoAlmacen();
      else if (estado.vista === 'almacen') cargarAlmacen();
    }

    // Se abrió o se cerró una mesa.
    if (mensaje.tipo === 'cuentas.cambio') cargarMesas();

    // Cambió una cuenta: si es la que tengo abierta, la refresco; si no,
    // basta con actualizar la lista de mesas.
    if (mensaje.tipo === 'cuenta.cambio') {
      if (estado.cuenta && mensaje.cuentaId === estado.cuenta.id) refrescarCuenta();
      else cargarMesas();
    }

    // Si alguien está mirando el corte mientras en la caja se cobra, los
    // números tienen que moverse solos. Si no, se cerraría la caja contra un
    // total viejo y parecería que falta dinero.
    if (estado.vista === 'corte' &&
        ['cuenta.cambio', 'cuentas.cambio'].includes(mensaje.tipo)) {
      cargarCorte();
    }
  },
});

async function refrescarCuenta() {
  if (!estado.cuenta) return;
  try {
    const { cuenta } = await api.cuenta(estado.cuenta.id);
    estado.cuenta = cuenta;

    // Otra pantalla pudo cobrarla o cancelarla mientras esta la tenía
    // abierta. En ese caso no tiene sentido quedarse ahí.
    if (cuenta.estado !== 'abierta' && ['cuenta', 'cobro'].includes(estado.vista)) {
      avisar(cuenta.estado === 'cobrada'
        ? `${cuenta.nombre} ya se cobró desde otra pantalla.`
        : `${cuenta.nombre} se canceló desde otra pantalla.`);
      volverAMesas();
      return;
    }

    if (estado.vista === 'cuenta') pintarCuenta();
    if (estado.vista === 'cobro')  pintarCobro();
  } catch (e) {
    if (e.codigo === 404) {
      avisar('Esa cuenta ya no está abierta.', true);
      volverAMesas();
    }
  }
}

async function refrescarTodo() {
  await Promise.all([cargarMesas(), refrescarCuenta()]);
  if (estado.vista === 'mesas') pintarMesas();
}

/* ── Si la sesión se cae, se vuelve al PIN ─────────────────────────────── */

globalThis.addEventListener('resta:sesion-caida', () => {
  if (estado.vista === 'pin') return;
  cerrarVentana();
  estado.usuario = null;
  estado.permisos = [];
  estado.cuenta = null;
  avisar('Tu sesión terminó. Vuelve a entrar con tu PIN.', true);
  ir('pin');
});

/* ── Diagnóstico (lo de la fase 0, ahora guardado abajo) ───────────────── */

async function revisar() {
  try {
    const d = await api.diagnostico();
    $('version').textContent = d.version;

    $('revisiones').innerHTML = d.revisiones.map((r) => `
      <div class="revision ${r.bien ? '' : 'mal'}">
        <span class="marca-estado">${r.bien ? '✅' : '❌'}</span>
        <span class="texto">
          <span class="nombre">${esc(r.nombre)}</span>
          <span class="detalle">${esc(r.detalle)}</span>
        </span>
      </div>`).join('');

    // El QR se calcula aquí dentro, sin internet: el día de la instalación
    // es justo cuando no hay red y cuando más falta hace.
    $('red').innerHTML = d.red?.hayRed
      ? `<div class="caja-red">
           <div class="et">Apúntale la cámara de la tablet</div>
           <div class="qr-tablet">${svgQR(d.red.principal.url)}</div>
           <div class="url">${esc(d.red.principal.url)}</div>
           <div class="nota">
             Si la cámara no lo lee, escribe esa dirección en el navegador.<br>
             Equipo: ${esc(d.red.equipo)} · Red: ${esc(d.red.principal.interfaz)}
           </div>
         </div>`
      : `<div class="caja-aviso">
           La laptop no está conectada a ninguna red. Conéctala al WiFi del local
           para que las tablets puedan entrar.
         </div>`;

    if (!d.ok) $('caja-diagnostico').open = true;
  } catch (e) {
    $('revisiones').innerHTML =
      `<div class="revision mal"><span class="marca-estado">✗</span>
        <span class="texto"><span class="nombre">No pude hablar con la caja</span>
        <span class="detalle">${esc(e.message)}</span></span></div>`;
    $('caja-diagnostico').open = true;
  }
}

/* ── Arranque ───────────────────────────────────────────────────────────── */

iniciarPin(entrar);
iniciarMesas(irACuenta);
iniciarCuenta(volverAMesas);
iniciarCarta(volverAMesas);
iniciarCobro(() => ir('cuenta'), volverAMesas);
iniciarImpresora(volverAMesas);
iniciarAncho();
alTocarFoquito(() => { cargarImpresora(); ir('impresora'); });
iniciarCorte(volverAMesas, volverAMesas);
iniciarConfiguracion(volverAMesas, async () => {
  await cargarAlmacen();
  ir('almacen');
});
iniciarAlmacen(volverAMesas);

// Alguien encendió o apagó el inventario desde Configuración: la barra
// lateral se rehace en el acto.
globalThis.addEventListener('resta:almacen-cambio', () => { cargarEstadoAlmacen(); });

$('boton-ir-almacen').addEventListener('click', async () => {
  await cargarAlmacen();
  ir('almacen');
});

$('boton-ir-config').addEventListener('click', async () => {
  await cargarConfiguracion();
  ir('config');
});

$('boton-ir-corte').addEventListener('click', async () => {
  await cargarCorte();
  ir('corte');
});

$('boton-ir-cobrar').addEventListener('click', () => {
  empezarCobro();
  ir('cobro');
});

// Pantalla completa: en la tablet quita la barra del navegador, que roba
// espacio y por la que un dedo distraído se sale de RESTA a media venta.
// Instalada desde «Agregar a pantalla principal» ya abre así sola; estos
// botones son para cuando se usa el navegador normal.
/* ── La barra lateral se puede guardar ─────────────────────────────────── */
/* Anotando en la carta, el menú de la izquierda estorba toda la noche y se
   usa una vez cada media hora. Cada tablet recuerda cómo la dejó su dueño:
   la de la barra la quiere guardada, la de la caja la quiere a la vista. */

const LLAVE_BARRA = 'resta_barra_guardada';

function barraGuardada() {
  try { return localStorage.getItem(LLAVE_BARRA) === '1'; } catch { return false; }
}

function aplicarBarra() {
  const guardada = barraGuardada();
  $('app').classList.toggle('barra-guardada', guardada);

  // El botón redondo sólo aparece si de verdad hace falta: con la barra a la
  // vista sobra, y en la pantalla del PIN no hay adónde navegar todavía.
  $('boton-mostrar-barra').hidden = !guardada || estado.vista === 'pin';
}

function alternarBarra() {
  try {
    if (barraGuardada()) localStorage.removeItem(LLAVE_BARRA);
    else localStorage.setItem(LLAVE_BARRA, '1');
  } catch { /* si el navegador no deja guardar, al menos cambia ahora */ }
  aplicarBarra();
}

$('boton-ocultar-barra').addEventListener('click', alternarBarra);
$('boton-mostrar-barra').addEventListener('click', alternarBarra);

const LLAVE_PANTALLA = 'resta_pantalla_completa';

function alternarPantallaCompleta() {
  if (document.fullscreenElement) {
    try { localStorage.removeItem(LLAVE_PANTALLA); } catch { /* da igual */ }
    document.exitFullscreen();
  } else {
    try { localStorage.setItem(LLAVE_PANTALLA, '1'); } catch { /* da igual */ }
    document.documentElement.requestFullscreen().catch(() => {});
  }
}
$('boton-pantalla-completa').addEventListener('click', alternarPantallaCompleta);
$('boton-pantalla-completa-pin').addEventListener('click', alternarPantallaCompleta);

// La pantalla completa se pierde al recargar o al apagarse la tablet, y el
// navegador sólo deja volver a entrar en respuesta a un toque. Así que si
// esta tablet la tenía puesta, el PRIMER toque donde sea la recupera: el
// mesero toca su primera tecla del PIN y la pantalla ya está completa.
document.addEventListener('pointerdown', () => {
  try {
    if (localStorage.getItem(LLAVE_PANTALLA) && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  } catch { /* navegador sin permiso: se queda como está */ }
});

$('boton-salir').addEventListener('click', salir);
$('boton-ir-carta').addEventListener('click', () => {
  // Se entra limpio: el aviso de la vez pasada no tiene por qué seguir ahí.
  limpiarResultadoCarta();
  cargarCarta();
  ir('carta');
});
$('boton-ir-mesas').addEventListener('click', volverAMesas);

async function arrancar() {
  // El logo de ONCE, dibujado. No es un archivo: no hay nada que se pueda
  // perder ni que se vea borroso en una pantalla grande.
  $('logo-lateral').innerHTML = LOGO_COLOR;

  // La pantalla del PIN se enseña ANTES de preguntarle nada al servidor.
  // Si la red anda mal, lo peor que se ve es el teclado unos segundos antes
  // de que entre la sesión guardada; lo que nunca se vuelve a ver es una
  // pantalla vacía y muda mientras una llamada se atora.
  ir('pin');

  // Señal para el vigilante de index.html: la aplicación sí llegó a arrancar.
  globalThis.__restaArranco = true;

  revisar();

  try {
    const { ajustes } = await api.ajustes();
    if (ajustes['negocio.nombre']) {
      estado.negocio = ajustes['negocio.nombre'];
      $('nombre-negocio').textContent = estado.negocio;
      document.title = estado.negocio + ' — RESTA';
    }
  } catch { /* si falla, se queda el nombre de fábrica */ }

  try {
    const quien = await api.quienSoy();
    estado.hayUsuarios = quien.hayUsuarios;

    // Si la tablet ya tenía pase guardado y sigue sirviendo, entra directo:
    // el mesero no teclea su PIN cada vez que se recarga la pantalla.
    if (quien.usuario) {
      await entrar(quien);
      return;
    }
  } catch { /* sin conexión: la barra roja ya lo está avisando */ }

  guardarPase(null);
  // Si resultó ser una instalación nueva, la misma pantalla del PIN cambia
  // sola al formulario de crear al administrador.
  if (estado.vista === 'pin') pintarPin();
}

arrancar();
