/**
 * CLIENTE · PANTALLA DEL MENÚ
 * ─────────────────────────────────────────────────────────────────────────────
 * Muestra la carta de ONCE: las pestañas de familia arriba y los mosaicos de
 * producto abajo, igual que en la v1.
 *
 * En la fase 3, tocar un mosaico va a anotar el producto en la cuenta. Por
 * ahora sólo enseña la carta y sirve para una cosa muy concreta: que Rosendo
 * abra el navegador y vea sus productos, con sus precios, con sus colores.
 *
 * El precio que se pinta aquí es SÓLO para que se vea. Cuando se empiece a
 * cobrar, el precio bueno lo pone el servidor: una tablet con el menú viejo
 * en pantalla no puede cobrar de menos.
 */

import { api } from './api.js';
import { formatear } from '/nucleo/dinero.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

let menu = { familias: [], productos: [], total: 0 };
let familiaActiva = null;

/* ── Cargar y pintar ───────────────────────────────────────────────────── */

export async function cargarMenu() {
  try {
    menu = await api.menu();
    if (!menu.familias.some((f) => f.clave === familiaActiva)) {
      familiaActiva = menu.familias[0]?.clave ?? null;
    }
    pintar();
  } catch (e) {
    $('menu-error').innerHTML =
      `<div class="caja-error">No pude traer la carta: ${esc(e.message)}</div>`;
  }
}

function pintar() {
  pintarFamilias();
  pintarProductos();
  pintarPie();
}

function pintarFamilias() {
  $('familias').innerHTML = menu.familias.map((f) => `
    <button data-familia="${esc(f.clave)}" class="${f.clave === familiaActiva ? 'activo' : ''}">
      ${esc(f.emoji)} ${esc(f.nombre)}
    </button>`).join('');
}

function pintarProductos() {
  const dela = menu.productos.filter((p) => p.familia === familiaActiva);

  if (dela.length === 0) {
    $('productos').innerHTML =
      '<div class="caja-aviso">Esta familia no tiene productos todavía.</div>';
    return;
  }

  $('productos').innerHTML = dela.map((p, i) => `
    <button class="prod-tile c${(i % 8) + 1}" data-producto="${p.id}">
      ${p.opciones ? '<span class="tiene-submenu" title="Este producto pregunta cómo va">⚙️</span>' : ''}
      <span class="ic">${esc(p.icono || '🍽️')}</span>
      <span class="nm">${esc(p.nombre)}</span>
      <span class="pr dinero">${formatear(p.precio)}</span>
    </button>`).join('');
}

function pintarPie() {
  const conSubmenu = menu.productos.filter((p) => p.opciones).length;
  $('pie-menu').innerHTML =
    `<span><b>${menu.total}</b> productos en <b>${menu.familias.length}</b> familias</span>` +
    `<span>·</span>` +
    `<span><b>${conSubmenu}</b> preguntan cómo van (⚙️)</span>`;
}

/* ── Cambiar de pestaña ────────────────────────────────────────────────── */

$('familias').addEventListener('click', (e) => {
  const boton = e.target.closest('[data-familia]');
  if (!boton) return;
  familiaActiva = boton.dataset.familia;
  pintar();
});

/* ── Ver el submenú de un producto ─────────────────────────────────────── */

$('productos').addEventListener('click', (e) => {
  const boton = e.target.closest('[data-producto]');
  if (!boton) return;

  const p = menu.productos.find((x) => x.id === Number(boton.dataset.producto));
  if (!p) return;

  // Todavía no se puede anotar en una cuenta (eso es la fase 3). Mientras
  // tanto, tocar un producto sirve para revisar que su submenú esté bien.
  if (!p.opciones) {
    aviso(`${p.icono} ${p.nombre} — ${formatear(p.precio)}. Este producto no pregunta nada.`);
    return;
  }

  const preguntas = p.opciones
    .map((o) => `• ${o.g}${o.multi ? ' (varias)' : ''}: ${o.ops.join(', ')}`)
    .join('\n');

  aviso(`${p.icono} ${p.nombre} — ${formatear(p.precio)}\n\nLe pregunta al mesero:\n${preguntas}`);
});

function aviso(texto) {
  $('menu-error').innerHTML =
    `<div class="caja-exito" style="white-space:pre-line">${esc(texto)}</div>`;
}

/* ── Importar el respaldo de la v1.3.0 ─────────────────────────────────── */

$('boton-importar').addEventListener('click', () => $('archivo-respaldo').click());

$('archivo-respaldo').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  e.target.value = '';   // para poder elegir el mismo archivo otra vez

  $('menu-error').innerHTML = '<div class="caja-aviso">Leyendo el respaldo…</div>';

  let datos;
  try {
    datos = JSON.parse(await archivo.text());
  } catch {
    $('menu-error').innerHTML =
      '<div class="caja-error">Ese archivo no se puede leer: no es un respaldo de RESTA.</div>';
    return;
  }

  try {
    const r = await api.importarRespaldo(datos);
    menu = r.menu;
    if (!menu.familias.some((f) => f.clave === familiaActiva)) {
      familiaActiva = menu.familias[0]?.clave ?? null;
    }
    pintar();
    $('menu-error').innerHTML = `
      <div class="caja-exito">
        <b>Respaldo importado</b>
        <ul>${r.resumen.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      </div>`;
  } catch (err) {
    $('menu-error').innerHTML =
      `<div class="caja-error">No se pudo importar: ${esc(err.message)}</div>`;
  }
});

$('boton-recargar').addEventListener('click', cargarMenu);
