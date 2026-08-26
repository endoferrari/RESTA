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
import { parseOpciones } from '/nucleo/opciones.js';

let alVolver = null;
let alAlmacen = null;               // para mandar al arqueo recién encendido
let revision = null;                // lo último que contestó GitHub
let seccion = 'productos';          // 'productos' · 'familias' · 'personas'
let datos = { familias: [], productos: [], usuarios: [] };
let editando = null;                 // id del producto que se está cambiando
let familiaFiltro = null;

const EMOJIS = [
  '🍽️','🍺','🍻','🥃','🍸','🍹','🍷','🍶','☕','🍵','🥤','🧃','💧','🫧','⚡',
  '🍔','🌮','🌯','🍕','🍟','🥔','🍗','🍖','🧀','🥜','🍪','🍧','🍨','🍰','🍎',
  '🥒','🫒','🥗','🍤','🎱','🎯','🎮','🎤','🎁','👕','🧢','🚬','🔥','⭐',
];

export function iniciarConfiguracion(cuandoVuelva, cuandoVayaAlAlmacen = null) {
  alVolver = cuandoVuelva;
  alAlmacen = cuandoVayaAlAlmacen;

  $('volver-de-config').addEventListener('click', () => alVolver?.());
  $('sistema-almacen').addEventListener('click', alTocarAlmacen);
  $('sistema-actualizacion').addEventListener('click', alTocarActualizacion);
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
  $('boton-buscar-actualizacion').addEventListener('click', () => buscarActualizacion(true));
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
    ['sistema', 'ℹ️ El sistema'],
  ];

  $('config-secciones').innerHTML = secciones.map(([clave, texto]) =>
    `<button class="op ${seccion === clave ? 'activo' : ''}" data-seccion="${clave}">${texto}</button>`
  ).join('');

  $('config-productos').hidden = seccion !== 'productos';
  $('config-familias').hidden  = seccion !== 'familias';
  $('config-personas').hidden  = seccion !== 'personas';
  $('config-sistema').hidden   = seccion !== 'sistema';

  if (seccion === 'productos') { pintarFormulario(); pintarProductos(); }
  if (seccion === 'familias')  pintarFamilias();
  if (seccion === 'personas')  pintarPersonas();
  if (seccion === 'sistema')   pintarSistema();
}

/* ── El sistema ────────────────────────────────────────────────────────── */

/**
 * Dónde vive todo y qué versión es.
 *
 * No es adorno: es lo primero que hace falta cuando algo va mal por teléfono
 * —«¿qué versión tienes?», «¿dónde está la base?»— y ahora se lee en la
 * pantalla en vez de tener que abrir carpetas.
 */
async function pintarSistema() {
  try {
    const d = await api.diagnostico();

    $('sistema-datos').innerHTML = `
      <div class="fila-total"><span>Versión instalada</span>
        <span><b>${esc(d.version ?? '—')}</b></span></div>
      <div class="fila-total"><span>Los datos y respaldos viven en</span>
        <span class="sutil">${esc(d.carpeta ?? d.raiz ?? '—')}</span></div>
      <div class="fila-total"><span>Para las tablets</span>
        <span class="sutil">${esc(d.red?.principal?.url ?? 'sin red')}</span></div>`;

    $('sistema-version').innerHTML =
      `Estás en la versión <b>${esc(d.version ?? '—')}</b>.`;
  } catch (e) {
    $('sistema-datos').innerHTML = `<div class="caja-error">${esc(e.message)}</div>`;
  }

  pintarInterruptorDeAlmacen();
  buscarActualizacion(false);
}

/* ── Llevar inventario, o no ───────────────────────────────────────────── */

/**
 * El interruptor general del almacén.
 *
 * Llevar inventario no es marcar una casilla: es un hábito. Hay que anotar la
 * merma, recibir los pedidos y contar cada tanto. Encenderlo el primer día,
 * cuando todavía se está aprendiendo a cobrar, es la forma más rápida de
 * terminar con un inventario que miente — y un inventario que miente es peor
 * que no tener ninguno, porque se toman decisiones de compra con él.
 */
function pintarInterruptorDeAlmacen() {
  const a = estado.almacen;

  $('sistema-almacen').innerHTML = `
    <div class="fila-total">
      <span>Ahora mismo</span>
      <span><b>${a.activo ? '📦 Sí se lleva inventario' : 'No se lleva inventario'}</b></span>
    </div>

    ${a.activo ? `
      <div class="fila-total sutil">
        <span>Productos que se controlan</span>
        <span>${a.controlados}</span>
      </div>
      <div class="fila-total sutil">
        <span>Último arqueo</span>
        <span>${a.arqueoHecho ? esc(a.arqueoFecha) : 'todavía no se ha hecho'}</span>
      </div>` : ''}

    <p class="sutil" style="margin-top:10px">
      ${a.activo
        ? `Con el inventario encendido aparece el botón <b>📦 Almacén</b> en la
           barra de la izquierda, para ti y para la caja. Ahí se ve qué hay,
           para cuántos días alcanza y qué hay que comprar.`
        : `Enciéndelo cuando el bar ya esté cómodo cobrando. RESTA te va a
           pedir un <b>arqueo</b>: caminar la bodega y anotar cuántos hay de
           cada cosa. A partir de ese día lleva la cuenta sola con cada venta.`}
    </p>

    <div class="botones-form">
      <button class="btn ${a.activo ? '' : 'btn-ambar'}" data-almacen="${a.activo ? 'apagar' : 'encender'}">
        ${a.activo ? 'Dejar de llevar inventario' : '📦 Empezar a llevar inventario'}
      </button>
      ${a.activo && !a.arqueoHecho
        ? '<button class="btn btn-ambar" data-almacen="arqueo">🔢 Hacer el arqueo</button>'
        : ''}
    </div>`;
}

async function alTocarAlmacen(e) {
  const b = e.target.closest('[data-almacen]');
  if (!b) return;

  if (b.dataset.almacen === 'arqueo') return alAlmacen?.();

  const encender = b.dataset.almacen === 'encender';

  if (!encender) {
    const seguro = await confirmar(
      'Dejar de llevar inventario',
      'El almacén va a desaparecer de la barra de la izquierda, para ti y ' +
      'para la caja.<br><br>' +
      '<b>No se borra nada.</b> Lo que ya contaste, las mermas y las entradas ' +
      'siguen guardadas, y RESTA sigue anotando por dentro lo que se vende. ' +
      'El día que lo vuelvas a encender, todo sigue ahí.',
      'Sí, apagarlo',
    );
    if (!seguro) return;
  }

  try {
    const r = await api.encenderAlmacen(encender);
    estado.almacen = {
      activo: r.activo, arqueoHecho: r.arqueoHecho,
      arqueoFecha: r.arqueoFecha, controlados: r.controlados,
    };
    pintarInterruptorDeAlmacen();

    // La barra lateral tiene que enterarse ya, sin esperar a que rebote el
    // aviso del servidor: si el WiFi anda lento, el botón del almacén
    // aparecería medio minuto después de encenderlo y parecería que no sirvió.
    globalThis.dispatchEvent(new CustomEvent('resta:almacen-cambio'));

    if (!encender) { avisar('El inventario quedó apagado'); return; }

    // Recién encendido y sin haber contado nunca, los números no valen nada.
    // En vez de dejarlo en una pantalla de ceros, se ofrece ir a contar ya.
    if (!r.arqueoHecho) {
      const ir = await confirmar(
        'Inventario encendido',
        'Falta lo importante: <b>el arqueo</b>. Camina la bodega y anota ' +
        'cuántos hay de cada cosa. Lo que anotes queda dado de alta solo, ' +
        'sin tener que marcar nada antes.<br><br>' +
        'Puedes hacerlo ahora o cuando tengas un rato tranquilo.',
        'Vamos a contar',
      );
      if (ir) alAlmacen?.();
      return;
    }

    avisar('El inventario quedó encendido');
  } catch (err) {
    avisar(err.message, true);
  }
}

/**
 * El botón 🔄 de la v1.3.0.
 *
 * Aquí NO se instala nada. La v1 era un solo archivo y se podía escribir
 * encima; la v2 son varios archivos, una base de datos y una biblioteca
 * compilada, y reemplazarlos con el punto de venta corriendo es la mejor
 * forma de dejarlo inservible un sábado. Se avisa y se abre la descarga; el
 * instalador se corre con RESTA cerrado.
 */
async function buscarActualizacion(forzar) {
  const caja = $('sistema-actualizacion');
  caja.innerHTML = '<p class="sutil">Preguntando a GitHub…</p>';

  let r;
  try {
    r = await api.actualizacion(forzar);
  } catch (e) {
    caja.innerHTML = `<div class="caja-error">${esc(e.message)}</div>`;
    return;
  }

  if (!r.sePudo) {
    caja.innerHTML = `
      <div class="caja-aviso">
        ${esc(r.motivo)}<br>
        <span class="sutil">RESTA funciona igual sin internet; sólo no puede avisarte
        si hay algo nuevo.</span>
      </div>`;
    return;
  }

  if (!r.hayNueva) {
    caja.innerHTML = `
      <div class="caja-exito">
        ✔ Estás al día${r.ultima ? ` — la última publicada es la ${esc(r.ultima)}` : ''}.
        ${r.motivo ? `<br><span class="sutil">${esc(r.motivo)}</span>` : ''}
      </div>`;
    return;
  }

  revision = r;
  pintarActualizacion();
}

/**
 * Las notas de la versión vienen escritas en el formato de GitHub, con
 * almohadillas y asteriscos. Ahí se ven bien; en esta pantalla salían tal
 * cual —«## Instalación», «**Más información**»— y se leían como si algo se
 * hubiera roto. Se les quitan las marcas y se queda el texto.
 */
function sinMarcas(texto) {
  return String(texto)
    .replace(/^#{1,6}\s*/gm, '')          // ## Título
    .replace(/\*\*(.+?)\*\*/g, '$1')      // **negritas**
    .replace(/`([^`]+)`/g, '$1')          // `código`
    .replace(/^\s*[-*]\s+/gm, '· ')       // - viñetas
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const enMegas = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

/**
 * El bloque de «hay una versión nueva».
 *
 * Antes esto era un enlace que le pedía al navegador que bajara el archivo.
 * El 25-ago-2026 eso dejó de funcionar en la laptop del bar —desapareció
 * Chrome y Windows se quedó sin saber con qué abrir un enlace—, y el botón
 * simplemente no hacía nada: sin aviso, sin error, sin nada que mirar.
 *
 * Ahora lo baja RESTA. Y por si algún día también eso falla, la dirección
 * queda escrita a la vista para poder copiarla a mano.
 */
function pintarActualizacion() {
  const r = revision;
  if (!r?.hayNueva) return;

  // `r.descarga` es la DIRECCIÓN de donde se baja; `r.avance` es cómo va la
  // bajada. Son dos cosas distintas y se parecen demasiado de nombre.
  const d = r.avance ?? { estado: 'quieta' };
  const caja = $('sistema-actualizacion');

  const cuerpo = {
    quieta: () => `
      <div class="botones-form">
        <button class="btn btn-ambar" data-act="bajar">
          ⬇️ Bajar la ${esc(r.ultima)}${r.tamano ? ` · ${enMegas(r.tamano)}` : ''}
        </button>
      </div>
      <p class="sutil">La baja RESTA solo. No hace falta abrir el navegador.</p>`,

    bajando: () => `
      <div class="barra-progreso"><span style="width:${d.porcentaje}%"></span></div>
      <p class="sutil">
        Bajando… <b>${d.porcentaje}%</b>
        ${d.total ? ` · ${enMegas(d.bajado)} de ${enMegas(d.total)}` : ''}<br>
        Puedes seguir cobrando mientras tanto; se baja por detrás.
      </p>`,

    lista: () => `
      <div class="caja-exito" style="margin:8px 0">
        ✔ <b>La ${esc(d.version ?? r.ultima)} ya está bajada</b> y comprobada.
      </div>
      <p class="sutil">
        Al instalar, RESTA se cierra y se abre el instalador. <b>Las tablets se
        quedan sin servicio unos minutos.</b> Tus ventas, tu carta y tus
        respaldos no se tocan: viven aparte de la carpeta del programa.
      </p>
      <div class="botones-form">
        ${d.sePuedeInstalarSolo
          ? '<button class="btn btn-rojo" data-act="instalar">🔄 Cerrar RESTA e instalar</button>'
          : ''}
      </div>
      <p class="sutil">El archivo quedó en <code>${esc(d.ruta ?? '')}</code></p>`,

    error: () => `
      <div class="caja-error" style="margin:8px 0">
        No se pudo bajar: ${esc(d.error ?? '')}
      </div>
      <div class="botones-form">
        <button class="btn btn-ambar" data-act="bajar">Volver a intentar</button>
      </div>`,
  }[d.estado] ?? (() => '');

  // El botón va ARRIBA de las notas. Con las notas primero, la única cosa
  // que hay que tocar quedaba empujada media pantalla hacia abajo por un
  // texto que se lee una vez.
  caja.innerHTML = `
    <div class="caja-aviso">
      <b>Hay una versión nueva: la ${esc(r.ultima)}</b>
      ${cuerpo()}
      ${r.notas ? `
        <details style="margin-top:12px">
          <summary class="sutil">Qué trae esta versión</summary>
          <p class="sutil" style="white-space:pre-line">${esc(sinMarcas(r.notas).slice(0, 600))}</p>
        </details>` : ''}
      <p class="sutil" style="margin-top:10px">
        Si algo falla, también se puede bajar a mano desde:<br>
        <code>${esc(r.descarga ?? '')}</code>
      </p>
    </div>`;
}

/** Lo llama la app cuando el servidor avisa cómo va la descarga. */
export function ponerAvanceDeActualizacion(avance) {
  if (!revision || !avance) return;
  revision.avance = avance;
  if (estado.vista === 'config') pintarActualizacion();
}

async function alTocarActualizacion(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;

  if (b.dataset.act === 'bajar') {
    b.disabled = true;
    try {
      const r = await api.descargarActualizacion();
      ponerAvanceDeActualizacion(r.avance);
    } catch (err) {
      avisar(err.message, true);
      b.disabled = false;
    }
    return;
  }

  if (b.dataset.act === 'instalar') {
    const seguro = await confirmar(
      'Cerrar RESTA e instalar',
      'RESTA se va a cerrar y se va a abrir el instalador.<br><br>' +
      '<b>Las tablets se quedan sin servicio</b> hasta que termine y RESTA ' +
      'vuelva a abrir — unos minutos. Si hay mesas cobrando, espérate.<br><br>' +
      'Tus ventas, tu carta y tus respaldos no se tocan.',
      'Sí, instalar ahora',
    );
    if (!seguro) return;

    try {
      await api.instalarActualizacion();
      $('sistema-actualizacion').innerHTML = `
        <div class="caja-aviso">
          <b>Cerrando RESTA…</b><br>
          En un momento se abre el instalador. Dale <b>siguiente, siguiente,
          instalar</b> y al terminar RESTA se abre solo.
        </div>`;
    } catch (err) {
      avisar(err.message, true);
    }
  }
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

  // El submenú se revisa AQUÍ y no al guardar.
  //
  // Antes, un renglón que no se entendía tiraba el submenú entero y el
  // producto se guardaba sin él, sin decir nada. Se escribía «Pala 1»,
  // se guardaba, y no pasaba nada: ni submenú ni explicación.
  if (opcionesTexto.trim() && parseOpciones(opcionesTexto) === null) {
    const mala = opcionesTexto.split('\n').map((l) => l.trim()).filter(Boolean)
      .find((l) => !l.replace(/\[[^\]]*\]/g, '').includes(':'));

    avisar(
      mala
        ? `«${mala}» no se entiende: falta el «:». Se escribe ` +
          'PREGUNTA: opción, opción — por ejemplo «Pala: Pala 1, Pala 2».'
        : 'Cada renglón del submenú va como PREGUNTA: opción, opción',
      true,
    );
    $('prod-opciones').focus();
    return;
  }

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

  // pintarFormulario() vuelve a escribir la lista de familias, y al hacerlo
  // el desplegable se va a la primera opción. Si se pone la familia ANTES,
  // se pierde: al abrir «CANCHA 1» decía «Bebidas», y guardar sin darse
  // cuenta le cambiaba la familia al producto. Primero se pinta, luego se
  // elige.
  pintarFormulario();

  $('prod-nombre').value = p.nombre;
  $('prod-precio').value = (p.precio / 100).toFixed(2);
  $('prod-familia').value = p.familia;
  $('prod-icono').textContent = p.icono || '🍽️';
  $('prod-opciones').value = p.opcionesTexto ?? '';

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
        <button class="btn btn-chico" data-editar-persona="${u.id}" title="Cambiar nombre o puesto">✏️</button>
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

/** La misma ventana del alta, pero para corregir nombre o puesto. Sin PIN. */
function preguntarEdicionPersona(u) {
  return ventana({
    titulo: `Cambiar a ${esc(u.nombre)}`,
    cuerpo: `
      <label class="etiqueta-campo" for="ep-nombre">Nombre</label>
      <input class="campo" id="ep-nombre" type="text" maxlength="40" autocomplete="off"
             value="${esc(u.nombre)}">

      <label class="etiqueta-campo">Qué puede hacer</label>
      <div class="grupo-botones" id="ep-rol">
        <button type="button" class="op ${u.rol === 'mesero' ? 'activo' : ''}" data-rol="mesero">Mesero</button>
        <button type="button" class="op ${u.rol === 'caja' ? 'activo' : ''}" data-rol="caja">Caja</button>
        <button type="button" class="op ${u.rol === 'admin' ? 'activo' : ''}" data-rol="admin">Administrador</button>
      </div>
      <div class="error-campo" id="ep-error" hidden></div>`,
    botones: [
      { texto: 'Cancelar', valor: null },
      {
        texto: 'Guardar', clase: 'btn-ambar',
        valor: (fondo) => {
          const nombre = fondo.querySelector('#ep-nombre').value.trim();
          const rol = fondo.querySelector('#ep-rol .activo')?.dataset.rol;
          const error = fondo.querySelector('#ep-error');

          if (!nombre) {
            error.textContent = 'Escribe el nombre.';
            error.hidden = false;
            return undefined;
          }
          return { nombre, rol };
        },
      },
    ],
    alAbrir(fondo) {
      fondo.querySelector('#ep-rol').addEventListener('click', (e) => {
        const b = e.target.closest('[data-rol]');
        if (!b) return;
        for (const otro of fondo.querySelectorAll('#ep-rol .op')) {
          otro.classList.toggle('activo', otro === b);
        }
      });
      fondo.querySelector('#ep-nombre').focus();
    },
  });
}

async function alTocarPersona(e) {
  const editarP = e.target.closest('[data-editar-persona]');
  if (editarP) {
    const u = datos.usuarios.find((x) => x.id === Number(editarP.dataset.editarPersona));
    const cambio = await preguntarEdicionPersona(u);
    if (!cambio) return;

    try {
      await api.editarUsuario(u.id, cambio.nombre, cambio.rol);
      await cargarConfiguracion();
      avisar(`${cambio.nombre} quedó actualizado`);
    } catch (err) { avisar(err.message, true); }
    return;
  }

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
