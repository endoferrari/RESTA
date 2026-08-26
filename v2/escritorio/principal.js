/**
 * ESCRITORIO · VENTANA DE WINDOWS
 * ─────────────────────────────────────────────────────────────────────────────
 * Esto es lo que ve la persona en la caja: una ventana limpia, sin barras de
 * navegador, que además lleva el servidor adentro.
 *
 * Lo que resuelve, además de mostrar la app:
 *  · Que RESTA no se abra dos veces (dos servidores en el mismo puerto = caos)
 *  · Que la laptop NO se duerma mientras el bar está abierto
 *  · Un icono junto al reloj para minimizar sin cerrar
 *  · Cerrar la base de datos correctamente al apagar
 */

import { app, BrowserWindow, Tray, Menu, dialog, shell, powerSaveBlocker } from 'electron';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { arrancar, detener } from '../servidor/index.js';
import { PUERTO } from '../servidor/config.js';
import { resumenRed } from '../servidor/red.js';
import { alPedirInstalar } from '../servidor/actualizaciones.js';

const AQUI = dirname(fileURLToPath(import.meta.url));

let ventana = null;
let bandeja = null;
let servidor = null;
let bloqueoSuspension = null;
let cerrandoDeVerdad = false;

/* ── Una sola instancia ──────────────────────────────────────────────────
   Si alguien hace doble clic al icono con RESTA ya abierto, en vez de
   levantar un segundo servidor, traemos al frente el que ya está. */
const soyLaPrimera = app.requestSingleInstanceLock();

if (!soyLaPrimera) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!ventana) return;
    if (ventana.isMinimized()) ventana.restore();
    ventana.show();
    ventana.focus();
  });
}

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    title: 'RESTA — Punto de venta',
    backgroundColor: '#f3f2ed',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(AQUI, 'precarga.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  ventana.loadURL(`http://localhost:${PUERTO}`);
  ventana.once('ready-to-show', () => {
    ventana.show();
    ventana.maximize();
  });

  // Los enlaces externos se abren en el navegador, no dentro de la caja
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // La X minimiza a la bandeja en vez de cerrar. Para cerrar de verdad hay
  // que usar el menú del icono junto al reloj: evita apagar el punto de
  // venta sin querer a media noche del sábado.
  ventana.on('close', (evento) => {
    if (cerrandoDeVerdad) return;
    evento.preventDefault();
    ventana.hide();
  });
}

function crearBandeja() {
  try {
    bandeja = new Tray(join(AQUI, 'icono-256.png'));
  } catch {
    return; // sin icono no pasa nada grave, la app funciona igual
  }

  const red = resumenRed();
  const direccion = red.hayRed ? red.principal.url : 'sin red';

  bandeja.setToolTip(`RESTA · ${direccion}`);
  bandeja.setContextMenu(Menu.buildFromTemplate([
    { label: `Tablets: ${direccion}`, enabled: false },
    { type: 'separator' },
    { label: 'Abrir RESTA', click: () => { ventana?.show(); ventana?.focus(); } },
    {
      label: 'Copiar dirección para tablets',
      enabled: red.hayRed,
      click: () => {
        const { clipboard } = require('electron');
        clipboard.writeText(direccion);
      },
    },
    { type: 'separator' },
    {
      label: 'Cerrar RESTA',
      click: async () => {
        const r = await dialog.showMessageBox(ventana, {
          type: 'question',
          buttons: ['No, seguir abierto', 'Sí, cerrar'],
          defaultId: 0,
          cancelId: 0,
          title: 'Cerrar RESTA',
          message: '¿Seguro que quieres cerrar el punto de venta?',
          detail: 'Las tablets van a dejar de funcionar hasta que lo vuelvas a abrir.',
        });
        if (r.response === 1) {
          cerrandoDeVerdad = true;
          app.quit();
        }
      },
    },
  ]));

  bandeja.on('double-click', () => { ventana?.show(); ventana?.focus(); });
}

app.whenReady().then(async () => {
  // Si RESTA ya estaba abierto, esta segunda copia NO levanta nada: la de
  // arriba ya recibió el aviso y se puso al frente.
  //
  // Sin esta línea, la segunda copia seguía adelante e intentaba levantar el
  // servidor en un puerto que ya estaba ocupado. El resultado era la ventana
  // roja de «RESTA no pudo arrancar · address already in use», que aparecía
  // cada vez que alguien le daba al acceso directo creyendo que RESTA estaba
  // cerrado — porque la ✕ no lo cierra, lo esconde junto al reloj. El
  // candado de una sola instancia estaba puesto desde el principio, pero
  // esta parte del arranque se le escapaba.
  if (!soyLaPrimera) return;

  try {
    servidor = await arrancar();
  } catch (e) {
    dialog.showErrorBox(
      'RESTA no pudo arrancar',
      `${e.message}\n\n` +
      `Lo más común es que el puerto ${PUERTO} ya esté ocupado porque RESTA ` +
      `ya está abierto en otra ventana.`
    );
    app.quit();
    return;
  }

  // Que la laptop no se duerma mientras el bar está abierto
  bloqueoSuspension = powerSaveBlocker.start('prevent-app-suspension');

  crearVentana();
  crearBandeja();
  prepararLaActualizacion();
});

/**
 * CERRAR RESTA E INSTALAR LA VERSIÓN NUEVA.
 *
 * El servidor baja el instalador y lo verifica; lo único que hace falta de
 * este lado es abrirlo y apartarse, porque el instalador no puede reemplazar
 * archivos que RESTA tenga en uso.
 *
 * Se lanza por su RUTA y no como un enlace, y ahí está toda la gracia: en la
 * laptop del bar, Windows se quedó sin saber con qué abrir una página web
 * —desapareció Chrome— y eso dejó muerto al botón viejo, que le pedía al
 * navegador que bajara el archivo. Abrir un programa por su ruta no depende
 * de nada de eso.
 */
function prepararLaActualizacion() {
  alPedirInstalar((ruta) => {
    try {
      const instalador = spawn(ruta, [], { detached: true, stdio: 'ignore' });
      // Se suelta para que siga vivo cuando RESTA ya no esté: si quedara
      // colgando de este proceso, moriría con él y no instalaría nada.
      instalador.unref();
    } catch (e) {
      dialog.showErrorBox(
        'No se pudo abrir el instalador',
        `${e.message}\n\nCierra RESTA y ábrelo a mano:\n${ruta}`
      );
      return;
    }

    cerrandoDeVerdad = true;
    app.quit();
  });
}

app.on('window-all-closed', () => { /* la bandeja mantiene la app viva */ });

app.on('before-quit', async (evento) => {
  if (cerrandoDeVerdad === 'listo') return;
  evento.preventDefault();
  if (bloqueoSuspension !== null && powerSaveBlocker.isStarted(bloqueoSuspension)) {
    powerSaveBlocker.stop(bloqueoSuspension);
  }
  await detener(servidor);
  cerrandoDeVerdad = 'listo';
  app.quit();
});
