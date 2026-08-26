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
import { $, esc, avisar, ventana, confirmar } from '../ui.js';
import { leerTabla, interpretar } from '../leer-tabla.js';
import { hojaExcel, hojaCSV, bajarArchivo } from '../escribir-tabla.js';
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
  $('boton-bajar-plantilla').addEventListener('click', () => bajarLaCarta('excel'));
  $('boton-bajar-csv').addEventListener('click', () => bajarLaCarta('csv'));
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
  const administra = puede('ajustes.cambiar');
  $('boton-importar').hidden = !administra;
  $('boton-bajar-plantilla').hidden = !administra;
  $('boton-bajar-csv').hidden = !administra;

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

/* ── Bajar la carta a una hoja de cálculo ──────────────────────────────── */

/**
 * La plantilla se baja LLENA, con la carta tal como está hoy.
 *
 * Capturar 137 productos en una hoja en blanco no lo hace nadie. Corregir
 * tres precios encima de lo que ya está y agregar dos renglones, sí. Esa es
 * toda la diferencia entre una plantilla que se usa y una que no.
 */
async function bajarLaCarta(formato) {
  $('resultado-carta').innerHTML = '<div class="caja-aviso">Armando el archivo…</div>';

  try {
    const r = await api.bajarPlantilla();

    const filas = [
      // La ayuda va ARRIBA de los títulos: el lector busca el renglón de
      // títulos y se salta lo que haya antes, así que la hoja se explica
      // sola justo cuando hace falta, abierta en Excel y sin nadie al lado.
      ...r.ayuda,
      r.columnas.map((c) => c.titulo),
      ...r.filas.map((f) => r.columnas.map((c) => f[c.clave] ?? '')),
    ];

    const dia = new Date().toLocaleDateString('sv-SE');
    const nombre = `carta-${r.negocio.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${dia}`;

    if (formato === 'csv') {
      bajarArchivo(hojaCSV(filas), `${nombre}.csv`);
    } else {
      bajarArchivo(
        hojaExcel(filas, { anchos: [7, 7, 34, 9, 16, 30, 11, 11, 12, 12, 10] }),
        `${nombre}.xlsx`,
      );
    }

    $('resultado-carta').innerHTML = `
      <div class="caja-exito">
        <b>Listo: ${r.filas.length} producto(s) en el archivo.</b><br>
        Búscalo en tus Descargas, ábrelo, corrige lo que quieras y vuelve con
        <b>«📤 Subir la hoja llena»</b>.
        ${r.conInventario
          ? ''
          : '<br><span class="sutil">El inventario está apagado, así que sus columnas van vacías.</span>'}
      </div>`;
  } catch (e) {
    $('resultado-carta').innerHTML =
      `<div class="caja-error">No se pudo armar el archivo: ${esc(e.message)}</div>`;
  }
}

/* ── Importar productos de una lista ───────────────────────────────────── */

/** Lee lo que teclea la gente como precio: «45», «45.50», «$1,250», «45,50». */
function precioDeTexto(valor) {
  let limpio = String(valor ?? '').replace(/[^\d.,]/g, '');
  if (!limpio) return null;

  // La coma puede ser dos cosas distintas y confundirlas cuesta dinero:
  // en «1,250» separa los miles, pero en «45,50» —como lo escribe media
  // Europa y como lo guarda un Excel configurado así— es el decimal. Se
  // distingue por lo que viene después: dos dígitos y ya, es decimal.
  if (!limpio.includes('.') && /^\d+,\d{1,2}$/.test(limpio)) {
    limpio = limpio.replace(',', '.');
  } else {
    limpio = limpio.replace(/,/g, '');
  }

  const n = Number(limpio);
  if (!Number.isFinite(n) || n < 0) return null;
  // A centavos partiendo el texto, sin multiplicar por 100: multiplicar
  // pierde un centavo en precios como 1.005.
  const [enteros, decimales = ''] = limpio.split('.');
  return Number(enteros || 0) * 100 + Number((decimales + '00').slice(0, 2));
}

async function importarRespaldo(e) {
  const archivo = e.target.files[0];
  if (!archivo) return;
  e.target.value = '';   // para poder elegir el mismo archivo otra vez

  // El respaldo de la v1 sigue funcionando: si alguien arrastra el .json
  // viejo, no tiene por qué encontrarse con un error.
  if (archivo.name.toLowerCase().endsWith('.json')) return importarRespaldoV1(archivo);

  $('resultado-carta').innerHTML = '<div class="caja-aviso">Leyendo el archivo…</div>';

  let filas;
  try {
    filas = await leerTabla(archivo);
  } catch (err) {
    $('resultado-carta').innerHTML =
      `<div class="caja-error">${esc(err.message)}</div>`;
    return;
  }

  const { productos, modo, esPlantilla } = interpretar(filas);

  // Que el archivo traiga columna «Clave» es lo que dice que salió de aquí.
  // Sólo entonces se puede saber qué productos FALTAN —y por tanto sólo
  // entonces se ofrece dar de baja alguno. La lista de precios que mandó un
  // proveedor entra por el camino de siempre, que nunca da de baja nada.
  if (esPlantilla) return subirPlantillaLlena(archivo, productos);

  // Se separa lo que sirve de lo que no. Un renglón malo no cancela todo:
  // se avisa por su nombre y los demás entran igual.
  const buenos = [];
  const malos = [];

  for (const p of productos) {
    const precio = precioDeTexto(p.precioTexto);
    if (precio === null) {
      malos.push({ nombre: p.nombre, motivo: `sin precio («${p.precioTexto}»)` });
      continue;
    }
    buenos.push({ ...p, precio });
  }

  if (buenos.length === 0) {
    $('resultado-carta').innerHTML = `
      <div class="caja-error">
        No encontré productos en ese archivo.<br>
        Necesita, al menos, una columna con el nombre y otra al lado con el precio.
      </div>`;
    return;
  }

  // ── Vista previa: nada se guarda hasta que se confirma ──
  const yaHay = (n) => estado.menu.familias.some((x) => x.nombre.toLowerCase() === n.toLowerCase());

  const familiasNuevas = [...new Set(buenos.map((b) => b.familia).filter(Boolean).filter((f) => !yaHay(f)))];
  const sinFamilia = buenos.filter((b) => !b.familia).length;

  const respuesta = await ventana({
    titulo: `Importar de ${esc(archivo.name)}`,
    cuerpo: `
      <p class="texto-ventana">
        Encontré <b>${buenos.length} producto(s)</b>${
          modo === 'cartel'
            ? ', leyendo el archivo como lista de precios: las palabras EN MAYÚSCULAS las tomé como familias.'
            : '.'}
      </p>

      ${familiasNuevas.length ? `
        <p class="texto-ventana">Se van a crear estas familias:
          <b>${familiasNuevas.map(esc).join(' · ')}</b></p>` : ''}

      ${sinFamilia ? `
        <div style="margin:4px 0 14px">
          <label class="etiqueta-campo" for="familia-huerfanos">
            ${sinFamilia} producto(s) no traen familia. Van a:
          </label>
          <select id="familia-huerfanos" class="campo">
            ${estado.menu.familias.map((f) =>
              `<option value="${esc(f.nombre)}">${esc(f.emoji)} ${esc(f.nombre)}</option>`).join('')}
            <option value="__nueva__">➕ Una familia nueva llamada «Otros»</option>
          </select>
        </div>` : ''}

      ${malos.length ? `
        <div class="caja-error" style="margin:12px 0">
          <b>${malos.length} renglón(es) NO van a entrar:</b>
          <ul>${malos.slice(0, 6).map((m) => `<li>${esc(m.nombre)} — ${esc(m.motivo)}</li>`).join('')}</ul>
          ${malos.length > 6 ? `<span class="sutil">…y ${malos.length - 6} más</span>` : ''}
        </div>` : ''}

      <div class="titulo-bloque">Así van a quedar</div>
      <div class="lista-previa">
        ${buenos.slice(0, 14).map((b) => `
          <div class="mov">
            <span class="mov-nota"><b>${esc(b.nombre)}</b>${
              b.familia ? ` <span class="sutil">· ${esc(b.familia)}</span>` : ''}</span>
            <span class="mov-cant entra">${formatear(b.precio)}</span>
          </div>`).join('')}
      </div>
      ${buenos.length > 14 ? `<p class="sutil">…y ${buenos.length - 14} más</p>` : ''}

      <p class="sutil" style="margin-top:12px">
        Si un producto ya existe con el mismo nombre en la misma familia, se le
        pone el precio del archivo. <b>Nada se borra.</b>
      </p>`,
    botones: [
      { texto: 'Cancelar', valor: null },
      {
        texto: `Importar ${buenos.length}`,
        clase: 'btn-ambar',
        // El desplegable se lee AL CONFIRMAR, no antes: si se leyera al
        // dibujar la ventana, se quedaría con la primera opción aunque
        // después se cambie.
        valor: (v) => ({ paraLosSinFamilia: v.querySelector('#familia-huerfanos')?.value ?? '' }),
      },
    ],
  });

  if (!respuesta) {
    $('resultado-carta').innerHTML = '';
    return;
  }

  // Los que no traían familia se van a la que se eligió en la ventana
  const paraHuerfanos = respuesta.paraLosSinFamilia === '__nueva__'
    ? 'Otros'
    : respuesta.paraLosSinFamilia;
  const aMandar = buenos.map(({ precioTexto, ...b }) => ({
    ...b,
    familia: b.familia || paraHuerfanos,
  }));

  $('resultado-carta').innerHTML = '<div class="caja-aviso">Guardando…</div>';

  try {
    const r = await api.importarProductos(aMandar);
    ponerMenu(r.menu);
    pintarCarta();

    const i = r.informe;
    $('resultado-carta').innerHTML = `
      <div class="caja-exito">
        <b>Listo</b>
        <ul>
          ${i.nuevos ? `<li>${i.nuevos} producto(s) nuevo(s)</li>` : ''}
          ${i.actualizados ? `<li>${i.actualizados} con el precio actualizado</li>` : ''}
          ${i.familiasCreadas.length ? `<li>Familias creadas: ${i.familiasCreadas.map(esc).join(', ')}</li>` : ''}
          ${i.omitidos.length ? `<li>${i.omitidos.length} NO entraron: ${
            i.omitidos.slice(0, 5).map((o) => `${esc(o.nombre)} (${esc(o.motivo)})`).join(', ')
          }</li>` : ''}
        </ul>
      </div>`;
    avisar(`${i.nuevos + i.actualizados} producto(s) importado(s)`);
  } catch (err) {
    $('resultado-carta').innerHTML =
      `<div class="caja-error">No se pudo importar: ${esc(err.message)}</div>`;
  }
}

/* ── Subir la plantilla llena ──────────────────────────────────────────── */

/**
 * El camino completo: precios, altas, bajas e inventario en un solo viaje.
 *
 * La regla de esta pantalla es una sola: **nada se aplica sin que alguien lo
 * haya visto escrito**. Dar de baja media carta por subir un archivo
 * incompleto es el peor accidente posible aquí, así que los productos que
 * faltan se enseñan por nombre y la casilla llega apagada. Quien la marca,
 * la marca a sabiendas.
 */
async function subirPlantillaLlena(archivo, productos) {
  const renglones = [];
  const malos = [];

  for (const p of productos) {
    const precio = precioDeTexto(p.precioTexto);
    if (precio === null) {
      malos.push({ nombre: p.nombre, motivo: `sin precio («${p.precioTexto}»)` });
      continue;
    }

    renglones.push({
      id: p.clave || null,
      nombre: p.nombre,
      precio,
      familia: p.familia,
      icono: p.icono,
      submenu: p.submenu,
      inventario: p.inventario,
      existencia: p.existencia,
      unidad: p.unidad,
      envase: p.envase,
      porciones: p.porciones,
    });
  }

  if (renglones.length === 0) {
    $('resultado-carta').innerHTML = `
      <div class="caja-error">
        Esa hoja no trae ningún producto con precio. Revisa que la columna
        <b>Precio</b> tenga números y vuelve a intentar.
      </div>`;
    return;
  }

  let revision;
  try {
    revision = await api.revisarPlantilla(renglones);
  } catch (e) {
    $('resultado-carta').innerHTML =
      `<div class="caja-error">No se pudo revisar el archivo: ${esc(e.message)}</div>`;
    return;
  }

  const { faltan, almacen } = revision;
  const yaHay = (n) => estado.menu.familias.some((x) => x.nombre.toLowerCase() === n.toLowerCase());
  const familiasNuevas = [...new Set(
    renglones.map((r) => r.familia).filter(Boolean).filter((f) => !yaHay(f))
  )];
  const conInventario = renglones.some((r) => r.inventario || r.existencia);

  const respuesta = await ventana({
    titulo: `Subir ${esc(archivo.name)}`,
    cuerpo: `
      <p class="texto-ventana">
        La hoja trae <b>${renglones.length} producto(s)</b>. Los que ya existen
        se actualizan con el precio del archivo; los que no, se dan de alta.
      </p>

      ${familiasNuevas.length ? `
        <p class="texto-ventana">Se van a crear estas familias:
          <b>${familiasNuevas.map(esc).join(' · ')}</b></p>` : ''}

      ${conInventario && !almacen.activo ? `
        <div class="caja-aviso" style="margin:10px 0">
          La hoja trae columnas de inventario, pero el inventario está
          <b>apagado</b>: esas columnas no se van a aplicar. Se enciende en
          Configuración → El sistema.
        </div>` : ''}

      ${malos.length ? `
        <div class="caja-error" style="margin:12px 0">
          <b>${malos.length} renglón(es) NO van a entrar:</b>
          <ul>${malos.slice(0, 6).map((m) => `<li>${esc(m.nombre)} — ${esc(m.motivo)}</li>`).join('')}</ul>
          ${malos.length > 6 ? `<span class="sutil">…y ${malos.length - 6} más</span>` : ''}
        </div>` : ''}

      ${faltan.length ? `
        <div class="titulo-bloque">Estos ${faltan.length} ya no vienen en la hoja</div>
        <div class="lista-previa">
          ${faltan.slice(0, 12).map((f) => `
            <div class="mov">
              <span class="mov-nota"><b>${esc(f.nombre)}</b>
                <span class="sutil">· ${esc(f.familia)}</span></span>
              <span class="mov-cant">${formatear(f.precio)}</span>
            </div>`).join('')}
        </div>
        ${faltan.length > 12 ? `<p class="sutil">…y ${faltan.length - 12} más</p>` : ''}

        <label class="casilla-linea" style="margin-top:10px">
          <input type="checkbox" id="plantilla-dar-de-baja">
          <span>
            Darlos de baja
            <span class="sutil">
              Desaparecen de la pantalla de venta. <b>No se borran</b>: los
              tickets viejos siguen enteros y se pueden volver a activar
              cuando quieras. Si subiste sólo una parte de la carta, deja
              esta casilla apagada.
            </span>
          </span>
        </label>` : ''}`,
    botones: [
      { texto: 'Cancelar', valor: null },
      {
        texto: 'Aplicar los cambios',
        clase: 'btn-ambar',
        // La casilla se lee AL CONFIRMAR: si se leyera al dibujar la ventana
        // se quedaría con el valor de entonces aunque después se cambie.
        valor: (v) => ({ baja: !!v.querySelector('#plantilla-dar-de-baja')?.checked }),
      },
    ],
  });

  if (!respuesta) { $('resultado-carta').innerHTML = ''; return; }

  $('resultado-carta').innerHTML = '<div class="caja-aviso">Aplicando…</div>';

  try {
    const r = await api.aplicarPlantilla(
      renglones,
      respuesta.baja ? faltan.map((f) => f.id) : [],
    );

    ponerMenu(r.menu);
    pintarCarta();

    const i = r.informe;
    $('resultado-carta').innerHTML = `
      <div class="caja-exito">
        <b>Carta actualizada</b>
        <ul>
          ${i.nuevos ? `<li>${i.nuevos} producto(s) nuevo(s)</li>` : ''}
          ${i.preciosCambiados.length ? `<li>${i.preciosCambiados.length} cambio(s) de precio: ${
            i.preciosCambiados.slice(0, 6).map((p) =>
              `${esc(p.nombre)} ${esc(p.antes)} → <b>${esc(p.ahora)}</b>`).join(' · ')
          }${i.preciosCambiados.length > 6 ? ' …' : ''}</li>` : ''}
          ${i.sinCambio ? `<li>${i.sinCambio} sin cambios</li>` : ''}
          ${i.familiasCreadas.length ? `<li>Familias creadas: ${i.familiasCreadas.map(esc).join(', ')}</li>` : ''}
          ${i.dadosDeBaja.length ? `<li>${i.dadosDeBaja.length} dado(s) de baja: ${
            i.dadosDeBaja.slice(0, 8).map(esc).join(', ')}${i.dadosDeBaja.length > 8 ? ' …' : ''}</li>` : ''}
          ${i.inventario.dadosDeAlta ? `<li>${i.inventario.dadosDeAlta} producto(s) empiezan a llevarse en almacén</li>` : ''}
          ${i.inventario.ajustados ? `<li>${i.inventario.ajustados} existencia(s) ajustada(s)</li>` : ''}
          ${i.omitidos.length ? `<li>${i.omitidos.length} NO entraron: ${
            i.omitidos.slice(0, 5).map((o) => `${esc(o.nombre)} (${esc(o.motivo)})`).join(', ')
          }</li>` : ''}
        </ul>
      </div>`;

    avisar('Carta actualizada desde la hoja');
  } catch (err) {
    $('resultado-carta').innerHTML = `
      <div class="caja-error">
        No se aplicó nada: ${esc(err.message)}<br>
        <span class="sutil">La carta quedó como estaba.</span>
      </div>`;
  }
}

/** El respaldo .json de la v1.3.0. Se conserva por si hace falta otra vez. */
async function importarRespaldoV1(archivo) {
  $('resultado-carta').innerHTML = '<div class="caja-aviso">Leyendo el respaldo…</div>';

  let datos;
  try {
    datos = JSON.parse(await archivo.text());
  } catch {
    $('resultado-carta').innerHTML =
      '<div class="caja-error">Ese archivo no se puede leer: no es un respaldo de RESTA.</div>';
    return;
  }

  // Si el respaldo trae ventas o mesas abiertas, se pregunta. Traerlas es lo
  // normal el día del cambio; NO traerlas es lo correcto cuando sólo se
  // quieren actualizar los precios de la carta con un respaldo más reciente.
  const ventas = Array.isArray(datos.tickets) ? datos.tickets.length : 0;
  const mesas = Array.isArray(datos.cuentas) ? datos.cuentas.length : 0;
  let conHistorial = false;

  if (ventas || mesas) {
    conHistorial = await confirmar(
      '¿Traer también las ventas?',
      `Este respaldo trae <b>${ventas} venta(s)</b> y <b>${mesas} mesa(s) abierta(s)</b>.<br><br>` +
      'Si las traes, entran al corte con las cuentas del día en que se hicieron y ' +
      'la numeración de tickets sigue donde la dejó la v1. El almacén no se mueve: ' +
      'esa mercancía ya salió en su día.<br><br>' +
      'Importar el mismo archivo dos veces no las duplica.',
      'Sí, traer las ventas',
    );
  }

  $('resultado-carta').innerHTML = '<div class="caja-aviso">Importando…</div>';

  try {
    const r = await api.importarRespaldo(datos, { conHistorial });
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
