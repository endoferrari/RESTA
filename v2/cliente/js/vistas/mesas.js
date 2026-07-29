/**
 * CLIENTE · PANTALLA DE MESAS
 * ─────────────────────────────────────────────────────────────────────────────
 * La primera pantalla de la noche: qué mesas están abiertas, cuánto lleva
 * cada una, y el campo para abrir una nueva.
 *
 * Escribir «4» abre «Mesa 4». Escribir «Sr. López» abre una cuenta a ese
 * nombre. Si esa mesa ya estaba abierta, no se crea otra: te lleva a la que
 * ya existe. Dos «Mesa 4» a la vez es como se pierde una comanda.
 */

import { api } from '../api.js';
import { estado } from '../estado.js';
import { $, esc, avisar } from '../ui.js';
import { formatear } from '/nucleo/dinero.js';

let alAbrirCuenta = null;

export function iniciarMesas(cuandoAbra) {
  alAbrirCuenta = cuandoAbra;
  $('form-nueva-mesa').addEventListener('submit', abrirMesa);
  $('lista-mesas').addEventListener('click', alTocarMesa);
}

export async function cargarMesas() {
  try {
    const { cuentas } = await api.cuentas();
    estado.cuentas = cuentas;
    pintarMesas();
  } catch (e) {
    if (e.codigo !== 401) avisar(e.message, true);
  }
}

export function pintarMesas() {
  const lista = $('lista-mesas');

  if (estado.cuentas.length === 0) {
    lista.innerHTML = `
      <div class="vacio">
        <div class="vacio-icono">🍽️</div>
        <div class="vacio-titulo">No hay mesas abiertas</div>
        <div class="vacio-nota">Escribe el número de mesa arriba para empezar.</div>
      </div>`;
    return;
  }

  lista.innerHTML = estado.cuentas.map((c) => {
    const t = c.totales;
    const pendientes = c.items.reduce((n, i) => n + i.porComandar, 0);

    return `
      <button class="mesa" data-cuenta="${c.id}">
        <div class="mesa-nombre">${esc(c.nombre)}</div>
        <div class="mesa-total dinero">${formatear(t.total)}</div>
        <div class="mesa-datos">
          ${t.articulos} ${t.articulos === 1 ? 'producto' : 'productos'}
          · abrió ${esc(c.abiertaPor ?? '—')}
        </div>
        <div class="mesa-marcas">
          ${pendientes > 0
            ? `<span class="marca marca-pendiente">🔔 ${pendientes} por mandar</span>` : ''}
          ${c.cuentaImpresa
            ? '<span class="marca marca-cuenta">🧾 pidió la cuenta</span>' : ''}
        </div>
      </button>`;
  }).join('');
}

/* ── Acciones ──────────────────────────────────────────────────────────── */

async function abrirMesa(e) {
  e.preventDefault();

  const campo = $('nueva-mesa');
  const nombre = campo.value.trim();
  if (!nombre) {
    avisar('Escribe el número de mesa o el nombre del cliente.', true);
    campo.focus();
    return;
  }

  try {
    const r = await api.abrirCuenta(nombre);
    campo.value = '';
    if (r.yaEstaba) avisar('Esa cuenta ya estaba abierta; aquí la tienes.');
    alAbrirCuenta?.(r.cuenta);
  } catch (err) {
    avisar(err.message, true);
  }
}

function alTocarMesa(e) {
  const boton = e.target.closest('[data-cuenta]');
  if (!boton) return;

  const cuenta = estado.cuentas.find((c) => c.id === Number(boton.dataset.cuenta));
  if (cuenta) alAbrirCuenta?.(cuenta);
}
