/**
 * ESCRITORIO · PUENTE SEGURO
 * ─────────────────────────────────────────────────────────────────────────────
 * El único punto de contacto entre la pantalla y Windows.
 *
 * La pantalla NO tiene acceso al sistema de archivos ni a nada de la máquina.
 * Sólo puede llamar a lo que expongamos aquí, a propósito. Así, aunque la
 * misma pantalla se abra en la tablet de un mesero, no hay diferencia de
 * permisos: las dos hablan con el servidor y nada más.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('resta', {
  /** true cuando la pantalla corre dentro de la ventana de la caja */
  esCaja: true,

  /** Versión de la aplicación instalada */
  version: () => ipcRenderer.invoke('resta:version'),
});
