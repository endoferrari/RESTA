/**
 * CLIENTE · CONFIGURACIÓN
 * ─────────────────────────────────────────────────────────────────────────────
 * Donde se arma la carta: las familias (Bebidas, Comida, Canchas…), los
 * productos con su precio y su submenú, y quién puede entrar al sistema.
 *
 * Esto se toca poco —al instalar, y cuando cambia un precio— pero cuando se
 * toca hay que poder hacerlo rápido y sin miedo. Por eso:
 *
 *  · Un producto NO se borra: se da de baja. Desaparece de la pantalla de
 *    venta pero los tickets de hace meses siguen enteros. Y se puede volver
 *    a activar cuando el producto regrese a la carta.
 *  · Cambiar un precio NO toca las cuentas abiertas. Lo que ya se anotó
 *    conserva su precio; lo nuevo sale con el nuevo.
 */

import { api } from '../api.js';
import { estado } from '../estado.js';
import { $, esc, avisar, confirmar, ventana, pedirTexto } from '../ui.js';
import { formatear, aCentavos } from '/nucleo/dinero.js';

let alVolver = null;
let seccion = 'productos';          // 'productos' · 'familias' · 'personas'
let datos = { familias: [], productos: [], usuarios: [] };
let editando = null;                 // id del producto que se está cambiando
let familiaFiltro = null;

const EMOJIS = [
  '🍽️','🍺','🍻','🥃','🍸','🍹','🍷','🍶','☕','🍵','🥤','🧃','💧','🫧','⚡',
  '🍔','🌮','🌯','🍕','🍟','🥔','🍗','🍖','🧀','🥜','🍪','🍧','🍨','🍰','🍎',
  '🥒','🫒','🥗','🍤','🎱','🎯','🎮','🎤','🎁','👕','🧢','🚬','🔥','⭐',
];

export function iniciarConfiguracion(cuandoVuelva) {
  alVolver = cuandoVuelva;

  $('volver-de-config').addEventListener('click', () => alVolver?.());
  $('config-secciones').addEventListener('click', alTocarSeccion);
  $('form-producto').addEventListener('submit', guardarProducto);
  $('boton-cancelar-producto').addEventListener('click', limpiarFormulario);
  $('prod-icono').addEventListener('click', elegirEmoji);
  $('lista-productos').addEventListener('click', alTocarProducto);
  $('lista-familias').addEventListener('click', alTocarFamilia);
  $('boton-nueva-familia').addEventListener('click', nuevaFamilia);
  $('lista-personas').addEventListener('click', alTocarPersona);
  $('boton-nueva-persona').addEventListener('click', nuevaPersona);
  $('filtro-familia').addEventListener('click', alTocarFiltro);
}

/* ── Cargar ────────────────────────────────────────────────────────────── */

export async function cargarConfiguracion() {
  try {
    const r = await api.productos();
    datos.familias = r.familias;
    datos.productos = r.productos;

    try {
      datos.usuarios = (await api.usuarios()).usuarios;
    } catch { datos.usuarios = []; }

    pintarConfiguracion();
  } catch (e) {
    if (e.codigo !== 401 && e.codigo !== 403) avisar(e.message, true);
  }
}

/* ── Pintar ────────────────────────────────────────────────────────────── */

export function pintarConfiguracion() {
  const secciones = [
    ['productos', '📋 Productos'],
    ['familias', '🗂️ Familias'],
    ['personas', '👥 Quién entra'],
  ];

  $('config-secciones').innerHTML = secciones.map(([clave, texto]) =>
    `<button class="op ${seccion === clave ? 'activo' : ''}" data-seccion="${clave}">${texto}</button>`
  ).join('');

  $('config-productos').hidden = seccion !== 'productos';
  $('config-familias').hidden  = seccion !== 'familias';
  $('config-personas').hidden  = seccion !== 'personas';

  if (seccion === 'productos') { pintarFormulario(); pintarProductos(); }
  if (seccion === 'familias')  pintarFamilias();
  if (seccion === 'personas')  pintarPersonas();
}

/* ── Productos ─────────────────────────────────────────────────────────── */

function pintarFormulario() {
  const familias = datos.familias.filter((f) => f.activa);

  $('prod-familia').innerHTML = familias
    .map((f) => `<option value="${esc(f.clave)}">${esc(f.emoji)} ${esc(f.nombre)}</option>`)
    .join('');

  $('titulo-formulario').textContent = editando ? 'Cambiar producto' : 'Producto nuevo';
  $('boton-guardar-producto').textContent = editando ? 'Guardar cambios' : 'Agregar';
  $('boton-cancelar-producto').hidden = !editando;
}

function pintarFiltro() {
  const conProductos = datos.familias.filter((f) =>
    datos.productos.some((p) => p.familia === f.clave));

  $('filtro-familia').innerHTML =
    `<button class="op ${familiaFiltro === null ? 'activo' : ''}" data-filtro="">Todas</button>` +
    conProductos.map((f) =>
      `<button class="op ${familiaFiltro === f.clave ? 'activo' : ''}" data-filtro="${esc(f.clave)}">
         ${esc(f.emoji)} ${esc(f.nombre)}
       </button>`).join('');
}

function pintarProductos() {
  pintarFiltro();

  const familias = datos.familias.filter((f) =>
    (!familiaFiltro || f.clave === familiaFiltro) &&
    datos.productos.some((p) => p.familia === f.clave));

  if (datos.productos.length === 0) {
    $('lista-productos').innerHTML = `
      <div class="vacio">
        <div class="vacio-icono">📋</div>
        <div class="vacio-titulo">La carta está vacía</div>
        <div class="vacio-nota">Captura arriba el primer producto.</div>
      </div>`;
    return;
  }

  $('lista-productos').innerHTML = familias.map((f) => {
    const suyos = datos.productos.filter((p) => p.familia === f.clave);
    return `
      <div class="grupo-config">
        <div class="titulo-bloque">${esc(f.emoji)} ${esc(f.nombre)} · ${suyos.length}</div>
        ${suyos.map((p) => `
          <div class="fila-config ${p.activo ? '' : 'de-baja'}" data-producto="${p.id}">
            <span class="fila-icono">${esc(p.icono || '🍽️')}</span>
            <span class="fila-texto">
              <span class="fila-nombre">${esc(p.nombre)}</span>
              ${p.opciones ? '<span class="etiqueta-submenu">⚙️ submenú</span>' : ''}
              ${p.activo ? '' : '<span class="etiqueta-baja">dado de baja</span>'}
            </span>
            <span class="fila-precio dinero">${formatear(p.precio)}</span>
            <span class="fila-acciones">
              <button class="btn btn-chico" data-editar="${p.id}" title="Cambiar">✏️</button>
              ${p.activo
                ? `<button class="btn btn-chico" data-baja="${p.id}" title="Quitar de la carta">🗑️</button>`
                : `<button class="btn btn-chico" data-alta="${p.id}" title="Volver a ponerlo">↩️</button>`}
            </span>
          </div>`).join('')}
      </div>`;
  }).join('');
}

async function guardarProducto(e) {
  e.preventDefault();

  const nombre = $('prod-nombre').value.trim();
  const precioTexto = $('prod-precio').value.trim();
  const familia = $('prod-familia').value;
  const icono = $('prod-icono').textContent.trim();
  const opcionesTexto = $('prod-opciones').value;

  if (!nombre) { avisar('Escribe el nombre del producto.', true); $('prod-nombre').focus(); return; }

  // El precio lo lee el núcleo, que nunca multiplica por 100 (ahí se perdía
  // un centavo con precios como 1.005).
  let precio;
  try {
    precio = aCentavos(precioTexto);
  } catch {
    avisar('El precio no se entiende. Escríbelo como 45 o 45.50', true);
    $('prod-precio').focus();
    return;
  }

  try {
    if (editando) {
      await api.editarProducto(editando, { nombre, precio, familia, icono, opcionesTexto });
      avisar('Producto actualizado');
    } else {
      await api.crearProducto({ nombre, precio, familia, icono, opcionesTexto });
      avisar('Producto agregado');
    }
    limpiarFormulario();
    await cargarConfiguracion();
    $('prod-nombre').focus();
  } catch (err) {
    avisar(err.message, true);
  }
}

function limpiarFormulario() {
  editando = null;
  $('prod-nombre').value = '';
  $('prod-precio').value = '';
  $('prod-opciones').value = '';
  $('prod-icono').textContent = '🍽️';
  pintarFormulario();
}

function cargarEnFormulario(p) {
  editando = p.id;
  $('prod-nombre').value = p.nombre;
  $('prod-precio').value = (p.precio / 100).toFixed(2);
  $('prod-familia').value = p.familia;
  $('prod-icono').textContent = p.icono || '🍽️';
  $('prod-opciones').value = p.opcionesTexto ?? '';
  pintarFormulario();
  $('prod-nombre').focus();
  $('prod-nombre').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function alTocarProducto(e) {
  const editar = e.target.closest('[data-editar]');
  if (editar) {
    const p = datos.productos.find((x) => x.id === Number(editar.dataset.editar));
    if (p) cargarEnFormulario(p);
    return;
  }

  const baja = e.target.closest('[data-baja]');
  if (baja) {
    const p = datos.productos.find((x) => x.id === Number(baja.dataset.baja));
    const seguro = await confirmar(
      'Quitar de la carta',
      `«${esc(p.icono)} ${esc(p.nombre)}» dejará de aparecer en la pantalla de venta.` +
      '<br><br>Los tickets y las cuentas de antes NO cambian. Lo puedes volver a poner cuando quieras.',
      'Quitar',
    );
    if (!seguro) return;

    try {
      await api.darDeBajaProducto(p.id);
      await cargarConfiguracion();
      avisar('Producto quitado de la carta');
    } catch (err) { avisar(err.message, true); }
    return;
  }

  const alta = e.target.closest('[data-alta]');
  if (alta) {
    try {
      await api.activarProducto(Number(alta.dataset.alta));
      await cargarConfiguracion();
      avisar('Producto de vuelta en la carta');
    } catch (err) { avisar(err.message, true); }
  }
}

function alTocarFiltro(e) {
  const b = e.target.closest('[data-filtro]');
  if (!b) return;
  familiaFiltro = b.dataset.filtro || null;
  pintarProductos();
}

/* ── El icono ──────────────────────────────────────────────────────────── */

async function elegirEmoji() {
  const elegido = await ventana({
    titulo: 'Elige un dibujo',
    cuerpo: `<div class="rejilla-emojis" id="emojis">
      ${EMOJIS.map((x) => `<button type="button" data-emoji="${x}">${x}</button>`).join('')}
    </div>`,
    botones: [{ texto: 'Cancelar', valor: null }],
    alAbrir(fondo, terminar) {
      fondo.querySelector('#emojis').addEventListener('click', (e) => {
        const b = e.target.closest('[data-emoji]');
        if (b) terminar(b.dataset.emoji);
      });
    },
  });

  if (elegido) $('prod-icono').textContent = elegido;
}

/* ── Familias ──────────────────────────────────────────────────────────── */

function pintarFamilias() {
  $('lista-familias').innerHTML = datos.familias.map((f, i) => `
    <div class="fila-config ${f.activa ? '' : 'de-baja'}" data-familia="${esc(f.clave)}">
      <span class="fila-icono">${esc(f.emoji)}</span>
      <span class="fila-texto">
        <span class="fila-nombre">${esc(f.nombre)}</span>
        <span class="fila-nota">${f.productos} producto(s)</span>
        ${f.activa ? '' : '<span class="etiqueta-baja">escondida</span>'}
      </span>
      <span class="fila-acciones">
        <button class="btn btn-chico" data-subir="${esc(f.clave)}" ${i === 0 ? 'disabled' : ''} title="Subir">↑</button>
        <button class="btn btn-chico" data-bajar="${esc(f.clave)}" ${i === datos.familias.length - 1 ? 'disabled' : ''} title="Bajar">↓</button>
        <button class="btn btn-chico" data-renombrar="${esc(f.clave)}" title="Cambiar nombre">✏️</button>
        <button class="btn btn-chico" data-emoji-fam="${esc(f.clave)}" title="Cambiar dibujo">🎨</button>
        <button class="btn btn-chico" data-esconder="${esc(f.clave)}" title="${f.activa ? 'Esconder' : 'Mostrar'}">
          ${f.activa ? '🚫' : '↩️'}
        </button>
      </span>
    </div>`).join('');
}

async function nuevaFamilia() {
  const nombre = await pedirTexto(
    'Familia nueva',
    '¿Cómo se llama? (Bebidas, Comida, Canchas…)',
    { sugerencias: ['Canchas', 'Postres', 'Souvenirs', 'Cocteles'] },
  );
  if (!nombre) return;

  try {
    await api.crearFamilia(nombre, '🍽️');
    await cargarConfiguracion();
    avisar(`Familia «${nombre}» creada`);
  } catch (e) { avisar(e.message, true); }
}

async function alTocarFamilia(e) {
  const subir = e.target.closest('[data-subir]');
  const bajar = e.target.closest('[data-bajar]');
  if (subir || bajar) {
    try {
      await api.moverFamilia((subir ?? bajar).dataset[subir ? 'subir' : 'bajar'], !!subir);
      await cargarConfiguracion();
    } catch (err) { avisar(err.message, true); }
    return;
  }

  const renombrar = e.target.closest('[data-renombrar]');
  if (renombrar) {
    const f = datos.familias.find((x) => x.clave === renombrar.dataset.renombrar);
    const nombre = await pedirTexto('Cambiar nombre', `Se llama «${f.nombre}». ¿Cómo se va a llamar?`);
    if (!nombre) return;
    try {
      await api.editarFamilia(f.clave, { nombre });
      await cargarConfiguracion();
      avisar('Familia renombrada');
    } catch (err) { avisar(err.message, true); }
    return;
  }

  const emojiFam = e.target.closest('[data-emoji-fam]');
  if (emojiFam) {
    const clave = emojiFam.dataset.emojiFam;
    const elegido = await ventana({
      titulo: 'Dibujo de la familia',
      cuerpo: `<div class="rejilla-emojis" id="emojis-fam">
        ${EMOJIS.map((x) => `<button type="button" data-emoji="${x}">${x}</button>`).join('')}
      </div>`,
      botones: [{ texto: 'Cancelar', valor: null }],
      alAbrir(fondo, terminar) {
        fondo.querySelector('#emojis-fam').addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-emoji]');
          if (b) terminar(b.dataset.emoji);
        });
      },
    });
    if (!elegido) return;
    try {
      await api.editarFamilia(clave, { emoji: elegido });
      await cargarConfiguracion();
    } catch (err) { avisar(err.message, true); }
    return;
  }

  const esconder = e.target.closest('[data-esconder]');
  if (esconder) {
    const f = datos.familias.find((x) => x.clave === esconder.dataset.esconder);

    if (f.activa) {
      const seguro = await confirmar(
        'Esconder la familia',
        `«${esc(f.nombre)}» y sus ${f.productos} producto(s) dejarán de aparecer en la venta.` +
        '<br><br>No se borra nada: la puedes volver a mostrar cuando quieras.',
        'Esconder',
      );
      if (!seguro) return;
    }

    try {
      await api.editarFamilia(f.clave, { activa: !f.activa });
      await cargarConfiguracion();
    } catch (err) { avisar(err.message, true); }
  }
}

/* ── Quién entra ───────────────────────────────────────────────────────── */

const NOMBRE_ROL = { admin: 'Administrador', caja: 'Caja', mesero: 'Mesero' };

function pintarPersonas() {
  if (datos.usuarios.length === 0) {
    $('lista-personas').innerHTML =
      '<div class="caja-aviso">No pude leer la lista. ¿Entraste como administrador?</div>';
    return;
  }

  $('lista-personas').innerHTML = datos.usuarios.map((u) => `
    <div class="fila-config" data-persona="${u.id}">
      <span class="fila-icono">${u.rol === 'mesero' ? '🧑‍🍳' : u.rol === 'caja' ? '💵' : '🔑'}</span>
      <span class="fila-texto">
        <span class="fila-nombre">${esc(u.nombre)}</span>
        <span class="fila-nota">${NOMBRE_ROL[u.rol] ?? u.rol}</span>
      </span>
      <span class="fila-acciones">
        <button class="btn btn-chico" data-pin="${u.id}" title="Cambiarle el PIN">🔢 PIN</button>
        <button class="btn btn-chico" data-baja-persona="${u.id}" title="Dar de baja">🚫</button>
      </span>
    </div>`).join('');
}

/** Pide nombre, PIN y rol en una sola ventana. */
function preguntarPersona() {
  return ventana({
    titulo: 'Dar de alta a alguien',
    cuerpo: `
      <label class="etiqueta-campo" for="np-nombre">Nombre</label>
      <input class="campo" id="np-nombre" type="text" maxlength="40" autocomplete="off">

      <label class="etiqueta-campo" for="np-pin">Su PIN (4 números)</label>
      <input class="campo" id="np-pin" type="text" inputmode="numeric" maxlength="4" autocomplete="off">

      <label class="etiqueta-campo">Qué puede hacer</label>
      <div class="grupo-botones" id="np-rol">
        <button type="button" class="op activo" data-rol="mesero">Mesero</button>
        <button type="button" class="op" data-rol="caja">Caja</button>
        <button type="button" class="op" data-rol="admin">Administrador</button>
      </div>
      <p class="sutil" id="np-explica">
        Abre mesas, anota y manda la comanda. No cobra, no descuenta, no cancela.
      </p>
      <div class="error-campo" id="np-error" hidden></div>`,
    botones: [
      { texto: 'Cancelar', valor: null },
      {
        texto: 'Dar de alta', clase: 'btn-ambar',
        valor: (fondo) => {
          const nombre = fondo.querySelector('#np-nombre').value.trim();
          const pin = fondo.querySelector('#np-pin').value.trim();
          const rol = fondo.querySelector('#np-rol .activo').dataset.rol;
          const error = fondo.querySelector('#np-error');

          const fallar = (t) => { error.textContent = t; error.hidden = false; return undefined; };

          if (!nombre) return fallar('Escribe el nombre.');
          if (!/^\d{4}$/.test(pin)) return fallar('El PIN son 4 números.');

          return { nombre, pin, rol };
        },
      },
    ],
    alAbrir(fondo) {
      const explica = {
        mesero: 'Abre mesas, anota y manda la comanda. No cobra, no descuenta, no cancela.',
        caja: 'Todo lo del mesero, más el dinero: cobrar, descuentos, cortesías y cerrar la caja.',
        admin: 'Todo, incluido configurar la carta, la impresora y dar de alta gente.',
      };

      fondo.querySelector('#np-rol').addEventListener('click', (e) => {
        const b = e.target.closest('[data-rol]');
        if (!b) return;
        for (const otro of fondo.querySelectorAll('#np-rol .op')) {
          otro.classList.toggle('activo', otro === b);
        }
        fondo.querySelector('#np-explica').textContent = explica[b.dataset.rol];
      });

      fondo.querySelector('#np-nombre').focus();
    },
  });
}

async function nuevaPersona() {
  const datosPersona = await preguntarPersona();
  if (!datosPersona) return;

  try {
    await api.crearUsuario(datosPersona.nombre, datosPersona.pin, datosPersona.rol);
    await cargarConfiguracion();
    avisar(`${datosPersona.nombre} ya puede entrar`);
  } catch (e) { avisar(e.message, true); }
}

async function alTocarPersona(e) {
  const pin = e.target.closest('[data-pin]');
  if (pin) {
    const u = datos.usuarios.find((x) => x.id === Number(pin.dataset.pin));
    const nuevo = await pedirTexto('Cambiar PIN', `PIN nuevo para ${u.nombre} (4 números)`);
    if (!nuevo) return;

    if (!/^\d{4}$/.test(nuevo)) return avisar('El PIN son 4 números.', true);

    try {
      await api.cambiarPin(u.id, nuevo);
      avisar(`PIN de ${u.nombre} cambiado`);
    } catch (err) { avisar(err.message, true); }
    return;
  }

  const baja = e.target.closest('[data-baja-persona]');
  if (baja) {
    const u = datos.usuarios.find((x) => x.id === Number(baja.dataset.bajaPersona));
    const seguro = await confirmar(
      'Dar de baja',
      `${esc(u.nombre)} ya no va a poder entrar.` +
      '<br><br>No se borra: su historial sigue teniendo dueño.',
      'Dar de baja',
    );
    if (!seguro) return;

    try {
      await api.darDeBaja(u.id);
      await cargarConfiguracion();
      avisar(`${u.nombre} dado de baja`);
    } catch (err) { avisar(err.message, true); }
  }
}

/* ── Cambiar de sección ────────────────────────────────────────────────── */

function alTocarSeccion(e) {
  const b = e.target.closest('[data-seccion]');
  if (!b) return;
  seccion = b.dataset.seccion;
  pintarConfiguracion();
}
