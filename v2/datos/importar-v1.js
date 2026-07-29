/**
 * DATOS · IMPORTAR EL RESPALDO DE LA v1.3.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Lee el archivo «RESTA respaldo AAAA-MM-DD.json» que descarga la versión que
 * está hoy trabajando en el bar, y mete su carta y su configuración en la
 * base de v2.
 *
 * El respaldo de la v1.3.0 es el objeto de datos completo:
 *
 *   { negocio, seq, productos:[{id, familia, icono, nombre, precio, opciones}],
 *     cuentas:[], tickets:[], turno:{fecha,hora}, impresion:{ancho,logo,pie} }
 *
 * Reglas de esta importación:
 *
 *  · El respaldo MANDA sobre el menú de fábrica. Si Rosendo subió el precio
 *    de la cerveza en marzo, gana el precio de marzo.
 *  · Se puede importar el mismo archivo dos veces sin duplicar nada.
 *  · Si un producto viene con algo raro (precio en letras, sin nombre), NO
 *    se detiene la importación: se salta ese producto y se reporta al final,
 *    por nombre, para que se pueda revisar a mano.
 *  · Las ventas y cuentas viejas TODAVÍA NO se importan: sus tablas se
 *    construyen en la fase 4. Aquí sólo se cuentan y se avisa, para que
 *    quede claro que están en el archivo y no se perdieron.
 */

import { base, enTransaccion } from './conexion.js';
import { parseOpciones } from '../nucleo/opciones.js';
import { esValido } from '../nucleo/dinero.js';
import { escribirAjuste } from './repos/ajustes.js';

/** Revisa que el archivo sea de verdad un respaldo de RESTA. */
export function revisarRespaldo(datos) {
  if (!datos || typeof datos !== 'object') {
    return 'Ese archivo no tiene forma de respaldo de RESTA.';
  }
  if (!Array.isArray(datos.productos)) {
    return 'Ese archivo no trae la lista de productos: no parece un respaldo de RESTA.';
  }
  if (!Array.isArray(datos.tickets)) {
    return 'Ese archivo no trae el historial de ventas: no parece un respaldo de RESTA.';
  }
  return null;
}

/**
 * El submenú puede venir de dos formas según de dónde salió el respaldo:
 * ya convertido (lista de preguntas) o todavía como texto. Aceptamos las dos.
 */
function normalizarOpciones(opciones) {
  if (!opciones) return null;
  if (Array.isArray(opciones)) {
    // Ya viene convertido; lo validamos dándole una vuelta completa.
    const bien = opciones.every((o) => o && typeof o.g === 'string' && Array.isArray(o.ops));
    return bien && opciones.length ? opciones : null;
  }
  return parseOpciones(opciones);
}

/** Crea la familia si el respaldo trae una que v2 no conocía. */
function asegurarFamilia(clave, orden) {
  base().prepare(`
    INSERT INTO familias (clave, nombre, emoji, orden)
    VALUES (?, ?, '🍽️', ?)
    ON CONFLICT(clave) DO NOTHING
  `).run(clave, clave, orden);
}

/**
 * Importa el respaldo. Todo o nada: si algo truena a la mitad, la base queda
 * como estaba. Nunca a medias.
 */
export function importarV1(datos, { origen = 'respaldo v1.3.0' } = {}) {
  const problema = revisarRespaldo(datos);
  if (problema) throw new Error(problema);

  const informe = {
    productos: { nuevos: 0, actualizados: 0, omitidos: [] },
    ajustes: [],
    sinImportar: {
      tickets: Array.isArray(datos.tickets) ? datos.tickets.length : 0,
      cuentas: Array.isArray(datos.cuentas) ? datos.cuentas.length : 0,
    },
  };

  const yaExiste = base().prepare(
    'SELECT id FROM productos WHERE familia = ? AND nombre = ?'
  );

  const guardar = base().prepare(`
    INSERT INTO productos (familia, nombre, icono, precio, opciones, orden, id_v1)
    VALUES (@familia, @nombre, @icono, @precio, @opciones, @orden, @id_v1)
    ON CONFLICT(familia, nombre) DO UPDATE SET
      icono       = excluded.icono,
      precio      = excluded.precio,
      opciones    = excluded.opciones,
      activo      = 1,
      id_v1       = COALESCE(productos.id_v1, excluded.id_v1),
      actualizado = datetime('now','localtime')
  `);

  enTransaccion(() => {
    datos.productos.forEach((p, i) => {
      const nombre = String(p?.nombre ?? '').trim();
      const familia = String(p?.familia ?? '').trim() || 'Comida';

      if (!nombre) {
        informe.productos.omitidos.push({
          nombre: `(producto #${i + 1} sin nombre)`,
          motivo: 'no trae nombre',
        });
        return;
      }

      // El precio de la v1 ya viene en centavos enteros. Si no lo es, algo
      // se corrompió en el archivo y ese producto no entra: más vale que
      // falte a que quede cobrando mal.
      if (!Number.isInteger(p?.precio) || !esValido(p.precio)) {
        informe.productos.omitidos.push({
          nombre,
          motivo: `el precio viene raro (${JSON.stringify(p?.precio)})`,
        });
        return;
      }

      asegurarFamilia(familia, 90 + i);

      const existia = yaExiste.get(familia, nombre);
      const opciones = normalizarOpciones(p.opciones);

      guardar.run({
        familia,
        nombre,
        icono: String(p.icono ?? ''),
        precio: p.precio,
        opciones: opciones ? JSON.stringify(opciones) : null,
        orden: i,
        id_v1: p.id ? String(p.id) : null,
      });

      if (existia) informe.productos.actualizados++;
      else informe.productos.nuevos++;
    });

    // ── Configuración del negocio ──────────────────────────────────────
    if (typeof datos.negocio === 'string' && datos.negocio.trim()) {
      escribirAjuste('negocio.nombre', datos.negocio.trim());
      informe.ajustes.push('nombre del negocio');
    }

    const imp = datos.impresion;
    if (imp && typeof imp === 'object') {
      if (imp.ancho === 58 || imp.ancho === 80) {
        escribirAjuste('ticket.ancho_mm', imp.ancho);
        informe.ajustes.push(`ancho del ticket (${imp.ancho} mm)`);
      }
      if (typeof imp.pie === 'string') {
        escribirAjuste('ticket.pie', imp.pie);
        informe.ajustes.push('mensaje al pie del ticket');
      }
      if (typeof imp.logo === 'string' && imp.logo) {
        escribirAjuste('ticket.logo', imp.logo);
        informe.ajustes.push('logo del ticket');
      }
      if (typeof imp.comanda === 'boolean') {
        escribirAjuste('ticket.comanda', imp.comanda ? '1' : '0');
        informe.ajustes.push('comanda a barra/cocina');
      }
    }

    escribirAjuste('menu.origen', origen);
  });

  return informe;
}

/** Resume el informe en frases que Rosendo pueda leer de un vistazo. */
export function resumirImportacion(informe) {
  const lineas = [];
  const { nuevos, actualizados, omitidos } = informe.productos;

  if (nuevos) lineas.push(`${nuevos} producto(s) nuevo(s) agregado(s)`);
  if (actualizados) lineas.push(`${actualizados} producto(s) actualizado(s) con el precio del respaldo`);
  if (!nuevos && !actualizados) lineas.push('No entró ningún producto');

  if (omitidos.length) {
    lineas.push(`${omitidos.length} producto(s) NO entraron: ` +
      omitidos.map((o) => `${o.nombre} (${o.motivo})`).join(', '));
  }

  if (informe.ajustes.length) {
    lineas.push('Se trajo también: ' + informe.ajustes.join(', '));
  }

  const { tickets, cuentas } = informe.sinImportar;
  if (tickets || cuentas) {
    lineas.push(
      `El archivo trae ${tickets} venta(s) y ${cuentas} cuenta(s) abierta(s) que ` +
      'todavía no se importan: eso llega en la fase de cobro. No se perdieron, ' +
      'siguen en el archivo.'
    );
  }

  return lineas;
}
