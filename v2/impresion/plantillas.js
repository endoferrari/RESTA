/**
 * IMPRESIÓN · PLANTILLAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Los cuatro papeles que salen de la miniprinter:
 *
 *   · comanda → a barra o cocina. SIN precios: al cantinero no le importa
 *               cuánto cuesta, le importa qué preparar y para qué mesa.
 *   · cuenta  → la que pide el cliente antes de pagar. No es comprobante.
 *   · ticket  → el comprobante de que ya pagó, con su folio.
 *   · prueba  → una tira con todos los formatos, para calibrar la impresora
 *               sin tener que cobrarle a nadie.
 *
 * Todas devuelven un documento (lista de bloques). Quien lo manda a la
 * impresora, o lo vuelca a texto, es otro archivo.
 */

import { formatear } from '../nucleo/dinero.js';
import { soloImprimible } from './escpos.js';
import {
  texto, titulo, dosColumnas, separador, salto, cortar, logo,
} from './documento.js';

/** La fecha y hora como se leen en el bar, no como las guarda la base. */
function ahora() {
  const d = new Date();
  const dosDigitos = (n) => String(n).padStart(2, '0');
  return {
    fecha: `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)}/${d.getFullYear()}`,
    hora: `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`,
  };
}

/** El encabezado que llevan todos: logo, nombre del negocio y fecha. */
function encabezado(negocio, subtitulo = null) {
  const { fecha, hora } = ahora();
  const bloques = [
    logo(),
    titulo(soloImprimible(negocio)),
    salto(),
  ];
  if (subtitulo) {
    bloques.push(texto(soloImprimible(subtitulo), { alinear: 'centro', negrita: true }));
  }
  bloques.push(texto(`${fecha}   ${hora}`, { alinear: 'centro' }));
  bloques.push(separador());
  return bloques;
}

/**
 * Un renglón de producto: cantidad, nombre y (si lleva) el detalle debajo.
 * El detalle va en su propio renglón para que no empuje el importe.
 */
function renglonProducto(linea, { conPrecio = true } = {}) {
  const bloques = [];
  const nombre = `${linea.cant} ${soloImprimible(linea.nombre)}`;

  if (conPrecio) {
    const importe = linea.cortesia ? 'CORTESIA' : formatear(linea.precio * linea.cant);
    bloques.push(dosColumnas(nombre, importe));
  } else {
    bloques.push(texto(nombre, { negrita: true }));
  }

  if (linea.detalle) {
    bloques.push(texto(soloImprimible(linea.detalle), { sangria: 3 }));
  }
  return bloques;
}

/* ── COMANDA (a barra o cocina) ────────────────────────────────────────── */

/**
 * Lo que se acaba de mandar a preparar.
 *
 * La mesa va en letras grandes ARRIBA Y ABAJO. Eso lo pidió la v1.2.1 por una
 * razón muy concreta: en la barra los papeles se acumulan encimados, y si la
 * mesa sólo estuviera arriba, el cantinero tendría que separarlos para saber
 * de quién es cada bebida.
 */
export function comanda({ negocio, cuenta, salieron, mesero }) {
  const { hora } = ahora();
  const doc = [
    titulo(soloImprimible(cuenta.nombre)),
    salto(),
    texto(`${hora}   ${soloImprimible(mesero ?? '')}`, { alinear: 'centro' }),
    separador('='),
    salto(),
  ];

  for (const linea of salieron) {
    doc.push(...renglonProducto(linea, { conPrecio: false }));
    doc.push(salto());
  }

  doc.push(separador('='));
  doc.push(titulo(soloImprimible(cuenta.nombre)));
  doc.push(cortar());
  return doc;
}

/* ── CUENTA (la que pide el cliente) ───────────────────────────────────── */

export function cuenta({ negocio, cuenta: c, pie }) {
  const t = c.totales;
  const doc = [...encabezado(negocio, 'CUENTA')];

  doc.push(texto(soloImprimible(c.nombre), { negrita: true }));
  doc.push(separador());

  for (const linea of c.items) {
    doc.push(...renglonProducto(linea));
  }

  doc.push(separador());
  doc.push(...totales(t));

  doc.push(salto());
  doc.push(texto('Esta NO es su comprobante de pago.', { alinear: 'centro' }));
  doc.push(texto('Pase a la caja, por favor.', { alinear: 'centro' }));

  if (pie) {
    doc.push(salto());
    doc.push(texto(soloImprimible(pie), { alinear: 'centro' }));
  }

  doc.push(cortar());
  return doc;
}

/* ── TICKET (ya pagó) ──────────────────────────────────────────────────── */

export function ticket({ negocio, ticket: t, cuenta: c, pie }) {
  const doc = [...encabezado(negocio)];

  doc.push(dosColumnas(`Ticket ${t.folio}`, soloImprimible(t.nombre), { negrita: true }));
  if (t.cerradoPor) doc.push(texto(`Le atendió: ${soloImprimible(t.cerradoPor)}`));
  doc.push(separador());

  for (const linea of (c?.items ?? [])) {
    doc.push(...renglonProducto(linea));
  }

  doc.push(separador());
  doc.push(...totales(t.totales));

  // Cómo pagó y cuánto se le regresó.
  if (t.pagos?.length) {
    doc.push(salto());
    for (const p of t.pagos) {
      doc.push(dosColumnas(nombreMetodo(p.metodo), formatear(p.monto)));
      if (p.recibido) {
        doc.push(dosColumnas('Recibido', formatear(p.recibido), { sangria: 2 }));
        doc.push(dosColumnas('Cambio', formatear(p.cambio), { sangria: 2 }));
      }
      if (p.referencia) doc.push(texto(`Ref: ${soloImprimible(p.referencia)}`, { sangria: 2 }));
    }
  }

  doc.push(salto());
  doc.push(texto(soloImprimible(pie ?? '¡Gracias por su visita!'), { alinear: 'centro' }));
  doc.push(cortar());
  return doc;
}

const nombreMetodo = (m) => ({
  efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia',
}[m] ?? m);

/** El bloque de totales, igual en la cuenta y en el ticket. */
function totales(t) {
  const filas = [];

  filas.push(dosColumnas('Consumo', formatear(t.consumo)));
  if (t.cortesias) filas.push(dosColumnas('Cortesias', `-${formatear(t.cortesias)}`));
  if (t.descuento) filas.push(dosColumnas('Descuento', `-${formatear(t.descuento)}`));
  if (t.descuento) filas.push(dosColumnas('Subtotal', formatear(t.subtotal)));
  if (t.propina)   filas.push(dosColumnas('Propina', formatear(t.propina)));

  filas.push(separador());
  filas.push(dosColumnas('TOTAL', formatear(t.total), { negrita: true }));
  return filas;
}

/* ── PRUEBA (para calibrar) ────────────────────────────────────────────── */

/**
 * Una tira con todo lo que la impresora tiene que saber hacer.
 * Sirve para comprobar de un vistazo tres cosas que suelen fallar:
 *   · que los acentos y la ñ salgan bien (no en chino),
 *   · que el ancho del papel esté bien configurado,
 *   · que el corte no se coma el último renglón.
 */
export function prueba({ negocio, anchoMm }) {
  const { fecha, hora } = ahora();

  return [
    ...encabezado(negocio, 'PRUEBA DE IMPRESION'),

    texto('Si lees esto completo y derecho,', { alinear: 'centro' }),
    texto('la impresora esta bien configurada.', { alinear: 'centro' }),
    salto(),

    separador(),
    texto('ACENTOS Y SIGNOS', { negrita: true }),
    texto('aeiou con acento: á é í ó ú'),
    texto('la eñe: ñ Ñ  ·  Mañana, Piña, Jalapeño'),
    texto('signos: ¡Buenas! ¿Cuánto? 100°'),
    texto('Si aquí ves letras chinas, avísame.'),
    salto(),

    separador(),
    texto('ANCHO DEL PAPEL', { negrita: true }),
    texto(`Configurado en ${anchoMm} mm`),
    texto('La línea de guiones de arriba debe'),
    texto('llegar justo al borde del papel,'),
    texto('sin doblarse al siguiente renglón.'),
    salto(),

    separador(),
    texto('IMPORTES ALINEADOS', { negrita: true }),
    dosColumnas('1 Cerveza', formatear(4000)),
    dosColumnas('2 Whisky Buchanan\'s 12 años', formatear(30000)),
    dosColumnas('1 Papas a la francesa (200 g)', formatear(7000)),
    separador(),
    dosColumnas('TOTAL', formatear(41000), { negrita: true }),
    salto(),

    separador(),
    texto('LETRA GRANDE (asi sale la mesa'),
    texto('en la comanda de la barra)'),
    titulo('Mesa 4'),
    salto(),

    texto(`${fecha}  ${hora}`, { alinear: 'centro' }),
    texto('Fin de la prueba', { alinear: 'centro' }),
    cortar(),
  ];
}
