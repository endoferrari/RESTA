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
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { arrancar, detener } from '../servidor/index.js';
import { PUERTO } from '../servidor/config.js';
import { resumenRed } from '../servidor/red.js';

const AQUI = dirname(fileURLToPath(import.meta.url));

let ventana = null;
let bandeja = null;
let servidor = null;
let bloqueoSuspension = null;
let cerrandoDeVerdad = false;

/* ── Una sola instancia ──────────────────────────────────────────────────
   Si alguien hace doble clic al icono con RESTA ya abierto, en vez de
   levantar un segundo servidor, traemos al frente el que ya está. */
if (!app.requestSingleInstanceLock()) {
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
});

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
