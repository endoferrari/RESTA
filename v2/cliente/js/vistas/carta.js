/**
 * CLIENTE · PANTALLA DE LA CARTA
 * ─────────────────────────────────────────────────────────────────────────────
 * La lista completa de productos, para revisarla y para importar el respaldo
 * de la v1.3.0. No es la pantalla de venta (esa es la de la cuenta): aquí sólo
 * se mira y se comprueba.
 *
 * Tocar un producto muestra qué le pregunta al mesero, para poder revisar que
 * los submenús estén bien sin tener que abrir una mesa.
 */

import { api } from '../api.js';
import { estado, ponerMenu, puede } from '../estado.js';
import { $, esc, avisar } from '../ui.js';
import { formatear } from '/nucleo/dinero.js';

let alVolver = null;

export function iniciarCarta(cuandoVuelva) {
  alVolver = cuandoVuelva;

  $('familias-carta').addEventListener('click', (e) => {
    const b = e.target.closest('[data-familia]');
    if (!b) return;
    estado.familiaActiva = b.dataset.familia;
    pintarCarta();
  });

  $('productos-carta').addEventListener('click', alTocarProducto);
  $('volver-de-carta').addEventListener('click', () => alVolver?.());
  $('boton-importar').addEventListener('click', () => $('archivo-respaldo').click());
  $('archivo-respaldo').addEventListener('change', importarRespaldo);
  $('boton-recargar-carta').addEventListener('click', cargarCarta);
}

export async function cargarCarta() {
  try {
    ponerMenu(await api.menu());
    pintarCarta();
  } catch (e) {
    $('resultado-carta').innerHTML =
      `<div class="caja-error">No pude traer la carta: ${esc(e.message)}</div>`;
  }
}

export function pintarCarta() {
  const m = estado.menu;

  // Importar un respaldo reescribe TODOS los precios. Un mesero puede mirar
  // la carta —le sirve para consultar precios— pero no tocarla.
  $('boton-importar').hidden = !puede('ajustes.cambiar');

  $('familias-carta').innerHTML = m.familias.map((f) => `
    <button data-familia="${esc(f.clave)}" class="${f.clave === estado.familiaActiva ? 'activo' : ''}">
      ${esc(f.emoji)} ${esc(f.nombre)}
    </button>`).join('');

  const dela = m.productos.filter((p) => p.familia === estado.familiaActiva);

  $('productos-carta').innerHTML = dela.length === 0
    ? '<div class="caja-aviso">Esta familia no tiene productos todavía.</div>'
    : dela.map((p, i) => `
        <button class="prod-tile c${(i % 8) + 1}" data-producto="${p.id}">
          ${p.opciones ? '<span class="tiene-submenu">⚙️</span>' : ''}
          <span class="ic">${esc(p.icono || '🍽️')}</span>
          <span class="nm">${esc(p.nombre)}</span>
          <span class="pr dinero">${formatear(p.precio)}</span>
        </button>`).join('');

  const conSubmenu = m.productos.filter((p) => p.opciones).length;
  $('pie-carta').innerHTML =
    `<span><b>${m.total}</b> productos en <b>${m.familias.length}</b> familias</span>` +
    '<span>·</span>' +
    `<span><b>${conSubmenu}</b> preguntan cómo van (⚙️)</span>`;
}

function alTocarProducto(e) {
  const b = e.target.closest('[data-producto]');
  if (!b) return;

  const p = estado.menu.productos.find((x) => x.id === Number(b.dataset.producto));
  if (!p) return;

  if (!p.opciones) {
    mostrar(`${p.icono} ${p.nombre} — ${formatear(p.precio)}. Este producto no pregunta nada.`);
    return;
  }

  const preguntas = p.opciones
    .map((o) => `• ${o.g}${o.multi ? ' (varias)' : ''}: ${o.ops.join(', ')}`)
    .join('\n');

  mostrar(`${p.icono} ${p.nombre} — ${formatear(p.precio)}\n\nLe pregunta al mesero:\n${preguntas}`);
}

function mostrar(texto) {
  $('resultado-carta').innerHTML =
    `<div class="caja-exito" style="white-space:pre-line">${esc(texto)}</div>`;
}

/* ── Importar el respaldo de la v1.3.0 ─────────────────────────────────── */

async function importarRespaldo(e) {
  const archivo = e.target.files[0];
  if (!archivo) return;
  e.target.value = '';   // para poder elegir el mismo archivo otra vez

  $('resultado-carta').innerHTML = '<div class="caja-aviso">Leyendo el respaldo…</div>';

  let datos;
  try {
    datos = JSON.parse(await archivo.text());
  } catch {
    $('resultado-carta').innerHTML =
      '<div class="caja-error">Ese archivo no se puede leer: no es un respaldo de RESTA.</div>';
    return;
  }

  try {
    const r = await api.importarRespaldo(datos);
    ponerMenu(r.menu);
    pintarCarta();
    $('resultado-carta').innerHTML = `
      <div class="caja-exito">
        <b>Respaldo importado</b>
        <ul>${r.resumen.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      </div>`;
    avisar('Respaldo importado');
  } catch (err) {
    $('resultado-carta').innerHTML =
      `<div class="caja-error">No se pudo importar: ${esc(err.message)}</div>`;
  }
}
