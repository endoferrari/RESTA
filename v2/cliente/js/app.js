/**
 * CLIENTE · APLICACIÓN
 * ─────────────────────────────────────────────────────────────────────────────
 * Junta las piezas de la pantalla: la línea con la caja, la carta y el
 * diagnóstico.
 *
 * FASE 1: la pantalla principal es la carta de ONCE. El diagnóstico de la
 * fase 0 sigue ahí, guardado en la sección de abajo, para cuando algo falle.
 * En la fase 3 la pantalla principal pasa a ser Mesas.
 */

import { api } from './api.js';
import { conectar } from './conexion.js';
import { cargarMenu } from './menu.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/* ── Línea con la caja ──────────────────────────────────────────────────── */

conectar({
  alCambiarEstado(conectado) {
    $('sin-conexion').hidden = conectado;
    if (conectado) {
      revisar();
      cargarMenu();
    }
  },

  // Si otra pantalla importa un respaldo o cambia un precio, esta se entera.
  alRecibir(mensaje) {
    if (mensaje.tipo === 'menu.cambio') cargarMenu();
  },
});

/* ── Nombre del negocio ─────────────────────────────────────────────────── */

async function pintarNegocio() {
  try {
    const { ajustes } = await api.ajustes();
    if (ajustes['negocio.nombre']) {
      $('nombre-negocio').textContent = ajustes['negocio.nombre'];
      document.title = ajustes['negocio.nombre'] + ' — RESTA';
    }
  } catch { /* si falla, se queda el nombre de fábrica */ }
}

/* ── Revisión del sistema ───────────────────────────────────────────────── */

async function revisar() {
  try {
    const d = await api.diagnostico();
    $('version').textContent = d.version;
    pintarRevisiones(d.revisiones);
    pintarRed(d.red);
    pintarNotas(d);

    // Si algo está mal, la sección de diagnóstico se abre sola: más vale que
    // salte a la vista que esperar a que alguien la busque.
    if (!d.ok) $('caja-diagnostico').open = true;
  } catch (e) {
    $('revisiones').innerHTML =
      `<div class="revision mal"><span class="marca-estado">✗</span>
        <span class="texto"><span class="nombre">No pude hablar con la caja</span>
        <span class="detalle">${esc(e.message)}</span></span></div>`;
    $('caja-diagnostico').open = true;
  }
}

function pintarRevisiones(revisiones) {
  $('revisiones').innerHTML = revisiones.map((r) => `
    <div class="revision ${r.bien ? '' : 'mal'}">
      <span class="marca-estado">${r.bien ? '✅' : '❌'}</span>
      <span class="texto">
        <span class="nombre">${esc(r.nombre)}</span>
        <span class="detalle">${esc(r.detalle)}</span>
      </span>
    </div>`).join('');
}

function pintarRed(red) {
  if (!red?.hayRed) {
    $('red').innerHTML = `
      <div class="caja-aviso">
        La laptop no está conectada a ninguna red. Conéctala al WiFi del local
        para que las tablets puedan entrar.
      </div>`;
    return;
  }
  $('red').innerHTML = `
    <div class="caja-red">
      <div class="et">Escribe esto en el navegador de la tablet</div>
      <div class="url">${esc(red.principal.url)}</div>
      <div class="nota">
        Equipo: ${esc(red.equipo)} · Red: ${esc(red.principal.interfaz)}
      </div>
    </div>`;
}

function pintarNotas(d) {
  const notas = [];

  if (!d.ok) {
    notas.push('Hay algo marcado en rojo arriba. RESTA funciona, pero conviene revisarlo.');
  }
  if (d.sistema !== 'Windows') {
    notas.push(`Estás en <b>${esc(d.sistema)}</b>, o sea la computadora de desarrollo. ` +
      'La impresora y el instalador sólo se prueban de verdad en la laptop con Windows.');
  }

  $('notas').innerHTML = notas.length
    ? `<div class="caja-aviso">${notas.join('<br><br>')}</div>`
    : '';
}

/* ── Arranque ───────────────────────────────────────────────────────────── */

revisar();
pintarNegocio();
cargarMenu();
