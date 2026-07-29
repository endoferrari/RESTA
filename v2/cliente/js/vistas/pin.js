/**
 * CLIENTE · PANTALLA DE ENTRADA (PIN)
 * ─────────────────────────────────────────────────────────────────────────────
 * El teclado de 4 números con el que entra cada mesero.
 *
 * Es a propósito un teclado en pantalla y no el del sistema: en una tablet
 * apoyada en la barra, con las manos ocupadas, tocar botones grandes es más
 * rápido y no se equivoca uno de tecla.
 *
 * La primera vez que se instala RESTA no hay ningún usuario. En vez de dejar
 * un PIN de fábrica escrito en un manual (que nadie cambia nunca), esta misma
 * pantalla pide crear al administrador.
 */

import { api, guardarPase } from '../api.js';
import { estado } from '../estado.js';
import { $, esc, avisar } from '../ui.js';

let tecleado = '';
let ocupado = false;
let alEntrar = null;          // se avisa a la app cuando alguien entra

export function iniciarPin(cuandoEntre) {
  alEntrar = cuandoEntre;
  $('teclado-pin').addEventListener('click', alTocarTecla);
  document.addEventListener('keydown', alTeclarFisico);
  $('form-primera-vez').addEventListener('submit', crearPrimerUsuario);
}

/* ── Pintar ────────────────────────────────────────────────────────────── */

export function pintarPin() {
  const primeraVez = !estado.hayUsuarios;

  $('caja-pin').hidden = primeraVez;
  $('caja-primera-vez').hidden = !primeraVez;

  if (primeraVez) {
    $('nombre-primero').focus();
    return;
  }

  tecleado = '';
  pintarPuntos();
}

function pintarPuntos() {
  $('puntos-pin').innerHTML = [0, 1, 2, 3]
    .map((i) => `<span class="punto ${i < tecleado.length ? 'lleno' : ''}"></span>`)
    .join('');
}

/* ── Teclear ───────────────────────────────────────────────────────────── */

function alTocarTecla(e) {
  const tecla = e.target.closest('[data-tecla]');
  if (!tecla) return;
  meter(tecla.dataset.tecla);
}

function alTeclarFisico(e) {
  // Sólo cuando la pantalla del PIN está a la vista, para no robarle las
  // teclas a las demás pantallas.
  if (estado.vista !== 'pin') return;
  if (/^\d$/.test(e.key)) meter(e.key);
  else if (e.key === 'Backspace') meter('borrar');
}

function meter(tecla) {
  if (ocupado) return;

  if (tecla === 'borrar') {
    tecleado = tecleado.slice(0, -1);
  } else if (/^\d$/.test(tecla) && tecleado.length < 4) {
    tecleado += tecla;
  }

  pintarPuntos();

  // Con 4 números ya se intenta entrar: nadie tiene que buscar el botón de
  // "aceptar" con una charola en la otra mano.
  if (tecleado.length === 4) entrar();
}

async function entrar() {
  ocupado = true;
  $('caja-pin').classList.add('probando');

  try {
    const r = await api.entrar(tecleado);
    guardarPase(r.pase);
    avisar(`Hola, ${r.usuario.nombre}`);
    alEntrar?.(r);
  } catch (e) {
    // Sacudida corta: se entiende sin leer que el PIN no era.
    $('caja-pin').classList.add('malo');
    setTimeout(() => $('caja-pin').classList.remove('malo'), 400);
    avisar(e.message, true);
  } finally {
    ocupado = false;
    $('caja-pin').classList.remove('probando');
    tecleado = '';
    pintarPuntos();
  }
}

/* ── La primera vez ────────────────────────────────────────────────────── */

async function crearPrimerUsuario(e) {
  e.preventDefault();

  const nombre = $('nombre-primero').value.trim();
  const pin    = $('pin-primero').value.trim();
  const otra   = $('pin-primero-2').value.trim();

  if (!nombre) return avisar('Escribe tu nombre.', true);
  if (!/^\d{4}$/.test(pin)) return avisar('El PIN son 4 números.', true);
  if (pin !== otra) return avisar('Los dos PIN no son iguales.', true);

  try {
    const r = await api.crearPrimero(nombre, pin);
    guardarPase(r.pase);
    avisar(`Listo, ${r.usuario.nombre}. Eres el administrador.`);
    alEntrar?.(r);
  } catch (err) {
    avisar(err.message, true);
  }
}
