/**
 * DATOS · IMPORTAR LAS VENTAS Y LAS MESAS ABIERTAS DE LA v1.3.0
 * ─────────────────────────────────────────────────────────────────────────────
 * La otra mitad de la importación. `importar-v1.js` trae la carta y la
 * configuración; esto trae el dinero: las ventas ya cobradas, sus pagos, las
 * mesas que quedaron abiertas y la bitácora de cada una.
 *
 * TRES DECISIONES QUE NO SON OBVIAS:
 *
 * 1. NO SE PASA POR `registrarCobro()`. Cobrar en la v2 descuenta del almacén.
 *    Si tres meses de ventas viejas entraran por ahí, el inventario de hoy
 *    quedaría en negativo y la lista de compras del lunes pediría de más para
 *    siempre. Aquí se insertan las filas directo: el histórico es historia,
 *    no mercancía que sale hoy del refrigerador.
 *
 * 2. LOS TOTALES SE RECALCULAN, NO SE COPIAN. La v1 y la v2 no suman igual:
 *    en la v1 el total del ticket NO incluye la propina —va aparte, en los
 *    pagos—, y en la v2 sí. Copiar el total tal cual descuadraría todos los
 *    cortes. Se reconstruyen las líneas y se le pasan al mismo `calcularCuenta()`
 *    que usa la caja todos los días, así que el histórico queda calculado con
 *    las reglas de la v2, no con una segunda versión de la aritmética.
 *
 * 3. SIN TURNO. Las ventas de la v1 no saben de turnos, y no hay forma de
 *    inventárselos sin mentir. Entran con `turno_id` NULL, que es justo lo que
 *    la v2 ya contempla (`ticketsSinTurno()`). Cuentan para el corte del DÍA,
 *    no para el corte de un turno que nunca existió.
 *
 * Además: importar dos veces el mismo respaldo no duplica nada. Cada cuenta y
 * cada ticket llevan el `id_v1` que traían, con índice único (migración 007).
 * Eso es lo que permite corregir la carta y volver a importar sin miedo.
 *
 * Todo corre dentro de la transacción que abre `importarV1()`: o entra el
 * respaldo completo, o no entra nada.
 */

import { base } from './conexion.js';
import { calcularCuenta } from '../nucleo/cuenta.js';
import { claveDeCuenta, nombreDeCuenta } from './repos/cuentas.js';
import { escribirAjuste, leerAjuste } from './repos/ajustes.js';

/** Los mismos que acepta la tabla `pagos`. Se repiten aquí para no arrastrar
 *  `repos/cobro.js` —y con él todo el almacén— dentro del importador. */
const METODOS = ['efectivo', 'tarjeta', 'transferencia'];

const HORA_VACIA = '00:00:00';
/* Va en «quién abrió» y «quién cobró» de todo lo importado. Corto a propósito:
   la pantalla de mesas lo pega detrás de «abrió», y «abrió la v1» se lee;
   «abrió importado de la v1» no. */
const QUIEN = 'la v1';

const entero = (v) => (Number.isInteger(v) ? v : null);

/** «2026-07-29» + «21:34:05» → «2026-07-29 21:34:05», que es como guarda SQLite. */
function momento(fecha, hora) {
  const f = /^\d{4}-\d{2}-\d{2}$/.test(String(fecha ?? '')) ? fecha : null;
  if (!f) return null;
  const h = /^\d{2}:\d{2}(:\d{2})?$/.test(String(hora ?? '')) ? hora : HORA_VACIA;
  return `${f} ${h.length === 5 ? `${h}:00` : h}`;
}

/**
 * Una línea de la v1 traducida a como la entiende el núcleo de la v2.
 *
 * En la v1 una cortesía es un renglón con `precio` en 0 que guarda su valor
 * real en `precioOriginal`. En la v2 la cortesía conserva su precio y lleva
 * una bandera: así el ticket puede enseñar «te regalamos $120» en vez de un
 * renglón en cero, que es lo que el cliente agradece.
 *
 * Devuelve null si el renglón viene corrupto. Quien llama decide qué hacer.
 */
function lineaDeV1(i) {
  const nombre = String(i?.nombre ?? '').trim();
  if (!nombre) return null;

  const cortesia = Boolean(i?.precioOriginal) && i?.precio === 0;
  const precio = entero(cortesia ? i.precioOriginal : i?.precio);
  const cant = entero(i?.cant);

  // Los CHECK de la tabla no admiten otra cosa, y un precio en letras o una
  // cantidad en cero significan que el archivo se corrompió.
  if (precio === null || precio < 0) return null;
  if (cant === null || cant <= 0) return null;

  return {
    prodId: i?.prodId ? String(i.prodId) : null,
    nombre,
    icono: String(i?.icono ?? ''),
    familia: i?.familia ? String(i.familia) : null,
    detalle: String(i?.detalle ?? ''),
    precio,
    cant,
    cortesia,
    cortesiaMotivo: cortesia ? (String(i?.motivoCortesia ?? '').trim() || null) : null,
    pagado: Boolean(i?.pagado),
    comandadaCant: entero(i?.comandadoCant) ?? 0,
  };
}

/** Los pagos de la v1, ya con la propina metida en el monto (ver abajo). */
function pagosDeV1(lista, fechaCuenta) {
  return (Array.isArray(lista) ? lista : []).map((p) => {
    const propina = entero(p?.propina) ?? 0;
    const monto = entero(p?.monto) ?? 0;

    // En la v1 la propina viaja aparte del monto; en la v2 el total de la
    // cuenta YA la incluye. Si no se sumara aquí, cada cuenta importada
    // quedaría debiendo justo la propina y aparecería como no liquidada.
    const total = monto + propina;

    let metodo = String(p?.metodo ?? '').toLowerCase();
    let nota = null;
    if (!METODOS.includes(metodo)) {
      // Se registra como efectivo para que el dinero contado siga cuadrando,
      // pero queda escrito de qué venía marcado.
      nota = `método original: ${p?.metodo ?? '(vacío)'}`;
      metodo = 'efectivo';
    }

    const digitos = String(p?.digitos ?? '').trim();
    const tarjeta = String(p?.nombreTarjeta ?? '').trim();
    const referencia = [tarjeta, digitos && `····${digitos}`, nota]
      .filter(Boolean).join(' · ') || null;

    return {
      metodo,
      monto: total,
      propina,
      recibido: entero(p?.recibido),
      cambio: entero(p?.cambio) ?? 0,
      referencia,
      momento: momento(p?.fecha ?? fechaCuenta, p?.hora),
    };
  }).filter((p) => p.monto > 0);   // la tabla exige monto > 0
}

/** El descuento de la v1 ya viene resuelto en centavos. */
const descuentoDeV1 = (d) => {
  const monto = entero(d?.monto);
  return monto && monto > 0 ? { tipo: 'monto', valor: monto } : null;
};

/* ── Escrituras ────────────────────────────────────────────────────────── */

function insertarCuenta({ nombre, clave, estado, fecha, creada, cerrada, descuento,
                          propina, cuentaImpresa, idV1 }) {
  const r = base().prepare(`
    INSERT INTO cuentas (nombre, nombre_clave, estado, abierta_nom, fecha, creada,
                         cerrada, descuento_tipo, descuento_valor,
                         propina_tipo, propina_valor, cuenta_impresa, id_v1)
    VALUES (@nombre, @clave, @estado, @quien, @fecha, @creada,
            @cerrada, @descuento_tipo, @descuento_valor,
            @propina_tipo, @propina_valor, @cuenta_impresa, @id_v1)
  `).run({
    nombre,
    clave,
    estado,
    quien: QUIEN,
    fecha,
    creada: creada ?? `${fecha} ${HORA_VACIA}`,
    cerrada: cerrada ?? null,
    descuento_tipo: descuento?.tipo ?? null,
    descuento_valor: descuento?.valor ?? 0,
    propina_tipo: propina?.tipo ?? null,
    propina_valor: propina?.valor ?? 0,
    cuenta_impresa: cuentaImpresa ?? null,
    id_v1: idV1,
  });
  return Number(r.lastInsertRowid);
}

function insertarLineas(cuentaId, lineas, creada) {
  const buscarProducto = base().prepare('SELECT id FROM productos WHERE id_v1 = ?');
  const meter = base().prepare(`
    INSERT INTO lineas (cuenta_id, producto_id, nombre, icono, familia, detalle,
                        precio, cant, cortesia, cortesia_motivo, cortesia_por,
                        pagado, comandada_cant, anotada_nom, creada)
    VALUES (@cuenta_id, @producto_id, @nombre, @icono, @familia, @detalle,
            @precio, @cant, @cortesia, @cortesia_motivo, @cortesia_por,
            @pagado, @comandada_cant, @quien, @creada)
  `);

  for (const l of lineas) {
    // Los renglones de un ticket de la v1 ya no guardan a qué producto
    // apuntaban; los de una mesa abierta sí. Cuando se puede, se vuelve a
    // enlazar para que el almacén sepa de qué producto habla.
    const prod = l.prodId ? buscarProducto.get(l.prodId) : null;

    meter.run({
      cuenta_id: cuentaId,
      producto_id: prod?.id ?? null,
      nombre: l.nombre,
      icono: l.icono,
      familia: l.familia,
      detalle: l.detalle,
      precio: l.precio,
      cant: l.cant,
      cortesia: l.cortesia ? 1 : 0,
      cortesia_motivo: l.cortesiaMotivo,
      cortesia_por: l.cortesia ? QUIEN : null,
      pagado: l.pagado ? 1 : 0,
      comandada_cant: Math.min(l.comandadaCant, l.cant),
      quien: QUIEN,
      creada,
    });
  }
}

function insertarPagos(cuentaId, pagos) {
  const meter = base().prepare(`
    INSERT INTO pagos (cuenta_id, metodo, monto, recibido, cambio, referencia,
                       cobrado_nom, momento)
    VALUES (@cuenta_id, @metodo, @monto, @recibido, @cambio, @referencia,
            @quien, @momento)
  `);
  for (const p of pagos) {
    meter.run({
      cuenta_id: cuentaId,
      metodo: p.metodo,
      monto: p.monto,
      recibido: p.recibido,
      cambio: p.cambio,
      referencia: p.referencia,
      quien: QUIEN,
      momento: p.momento ?? null,
    });
  }
}

/** La bitácora que la v1 llevaba por cuenta: quién abrió, qué se canceló. */
function insertarBitacora(cuentaId, eventos, fechaCuenta) {
  if (!Array.isArray(eventos) || !eventos.length) return;
  const meter = base().prepare(`
    INSERT INTO eventos (momento, usuario_nom, tipo, referencia, detalle)
    VALUES (?, ?, 'v1.bitacora', ?, ?)
  `);
  for (const e of eventos) {
    const texto = String(e?.texto ?? '').trim();
    if (!texto) continue;
    meter.run(
      momento(e?.fecha ?? fechaCuenta, e?.hora) ?? `${fechaCuenta} ${HORA_VACIA}`,
      QUIEN,
      String(cuentaId),
      JSON.stringify({ texto }),
    );
  }
}

/* ── Lo de fuera ───────────────────────────────────────────────────────── */

/**
 * Importa ventas, mesas abiertas y bitácora del respaldo de la v1.
 *
 * Se llama DENTRO de la transacción de `importarV1()`, después de la carta:
 * los renglones se enlazan a los productos por su id de la v1, y para eso los
 * productos tienen que estar ya adentro.
 *
 * @param datos    el respaldo .json completo de la v1
 * @param informe  el informe de `importarV1()`, al que se le agrega lo de aquí
 */
export function importarHistorial(datos, informe) {
  const resumen = {
    ventas: { nuevas: 0, repetidas: 0, omitidas: [] },
    cuentas: { nuevas: 0, repetidas: 0, renombradas: [], omitidas: [] },
    dinero: { ventas: 0, propinas: 0, porCobrar: 0 },
    folioSiguiente: null,
  };
  informe.historial = resumen;

  const yaEstaCuenta = base().prepare('SELECT id FROM cuentas WHERE id_v1 = ?');
  const yaEstaTicket = base().prepare('SELECT id FROM tickets WHERE id_v1 = ?');
  const folioOcupado = base().prepare('SELECT id FROM tickets WHERE folio = ?');
  const claveOcupada = base().prepare(
    `SELECT id FROM cuentas WHERE nombre_clave = ? AND estado = 'abierta'`
  );

  const meterTicket = base().prepare(`
    INSERT INTO tickets (folio, cuenta_id, nombre, fecha,
                         bruto, cortesias, consumo, descuento, subtotal,
                         propina, total, articulos, cerrado_nom, momento,
                         turno_id, id_v1)
    VALUES (@folio, @cuenta_id, @nombre, @fecha,
            @bruto, @cortesias, @consumo, @descuento, @subtotal,
            @propina, @total, @articulos, @quien, @momento,
            NULL, @id_v1)
  `);

  /* ── Ventas ya cobradas ─────────────────────────────────────────────── */
  const ventas = (Array.isArray(datos.tickets) ? datos.tickets : [])
    .slice()
    .sort((a, b) => (entero(a?.folio) ?? 0) - (entero(b?.folio) ?? 0));

  let folioMayor = 0;

  for (const t of ventas) {
    const folio = entero(t?.folio);
    const etiqueta = folio ? `folio ${String(folio).padStart(4, '0')}` : '(venta sin folio)';
    const idV1 = t?.id ? String(t.id) : (folio ? `folio-${folio}` : null);

    if (!folio || folio <= 0 || !idV1) {
      resumen.ventas.omitidas.push({ etiqueta, motivo: 'no trae folio' });
      continue;
    }
    if (folio > folioMayor) folioMayor = folio;

    if (yaEstaTicket.get(idV1)) { resumen.ventas.repetidas++; continue; }

    // Mismo folio con otro origen: es una venta de la v2, no se pisa.
    if (folioOcupado.get(folio)) {
      resumen.ventas.omitidas.push({
        etiqueta,
        motivo: 'ese folio ya lo usó una venta hecha en la v2',
      });
      continue;
    }

    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(t?.fecha ?? '')) ? t.fecha : null;
    if (!fecha) {
      resumen.ventas.omitidas.push({ etiqueta, motivo: 'no trae fecha' });
      continue;
    }

    const crudas = Array.isArray(t?.items) ? t.items : [];
    const lineas = crudas.map(lineaDeV1);
    if (!lineas.length || lineas.some((l) => l === null)) {
      // Media venta no se importa: los renglones malos harían que el corte
      // de ese día diera menos de lo que de verdad entró a la caja.
      resumen.ventas.omitidas.push({
        etiqueta,
        motivo: lineas.length ? 'trae renglones con precios o cantidades corruptos'
                              : 'no trae ningún renglón',
      });
      continue;
    }

    const pagos = pagosDeV1(t?.pagos, fecha);
    const propinaTotal = pagos.reduce((s, p) => s + p.propina, 0);
    const descuento = descuentoDeV1(t?.descuento);

    // Los mismos números que sacaría la caja hoy, con el mismo código.
    const totales = calcularCuenta({
      items: lineas,
      descuento,
      propina: propinaTotal ? { tipo: 'monto', valor: propinaTotal } : null,
      pagos,
    });

    const cerrada = momento(fecha, t?.hora);
    const cuentaId = insertarCuenta({
      nombre: nombreDeCuenta(t?.nombre) ?? 'Cuenta sin nombre',
      clave: claveDeCuenta(t?.nombre ?? 'cuenta sin nombre'),
      estado: 'cobrada',
      fecha,
      creada: momento(fecha, t?.abierta) ?? cerrada,
      cerrada,
      descuento,
      propina: propinaTotal ? { tipo: 'monto', valor: propinaTotal } : null,
      idV1: `cuenta:${idV1}`,
    });

    insertarLineas(cuentaId, lineas, momento(fecha, t?.abierta) ?? cerrada);
    insertarPagos(cuentaId, pagos);
    insertarBitacora(cuentaId, t?.eventos, fecha);

    meterTicket.run({
      folio,
      cuenta_id: cuentaId,
      nombre: nombreDeCuenta(t?.nombre) ?? 'Cuenta sin nombre',
      fecha,
      bruto: totales.bruto,
      cortesias: totales.cortesias,
      consumo: totales.consumo,
      descuento: totales.descuento,
      subtotal: totales.subtotal,
      propina: totales.propina,
      total: totales.total,
      articulos: totales.articulos,
      quien: QUIEN,
      momento: cerrada,
      id_v1: idV1,
    });

    resumen.ventas.nuevas++;
    resumen.dinero.ventas += totales.subtotal;
    resumen.dinero.propinas += totales.propina;
  }

  /* ── Mesas que quedaron abiertas ────────────────────────────────────── */
  for (const c of (Array.isArray(datos.cuentas) ? datos.cuentas : [])) {
    const nombre = nombreDeCuenta(c?.nombre);
    const idV1 = c?.id ? String(c.id) : null;
    const etiqueta = nombre ?? '(cuenta sin nombre)';

    if (!nombre || !idV1) {
      resumen.cuentas.omitidas.push({ etiqueta, motivo: 'no trae nombre o identificador' });
      continue;
    }
    if (yaEstaCuenta.get(idV1)) { resumen.cuentas.repetidas++; continue; }

    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(c?.fecha ?? '')) ? c.fecha : null;
    if (!fecha) {
      resumen.cuentas.omitidas.push({ etiqueta, motivo: 'no trae fecha' });
      continue;
    }

    const lineas = (Array.isArray(c?.items) ? c.items : []).map(lineaDeV1);
    if (lineas.some((l) => l === null)) {
      resumen.cuentas.omitidas.push({
        etiqueta,
        motivo: 'trae renglones con precios o cantidades corruptos',
      });
      continue;
    }

    // No puede haber dos «Mesa 4» abiertas: si la v2 ya tiene una, la que
    // llega del respaldo entra marcada, para que se vean las dos y sea quien
    // esté en la caja el que decida cuál se cobra.
    let nombreFinal = nombre;
    let clave = claveDeCuenta(nombre);
    if (claveOcupada.get(clave)) {
      nombreFinal = `${nombre} (v1)`;
      clave = claveDeCuenta(nombreFinal);
      let n = 2;
      while (claveOcupada.get(clave)) {
        nombreFinal = `${nombre} (v1 ${n++})`;
        clave = claveDeCuenta(nombreFinal);
      }
      resumen.cuentas.renombradas.push({ de: nombre, a: nombreFinal });
    }

    const pagos = pagosDeV1(c?.pagos, fecha);
    const propinaTotal = pagos.reduce((s, p) => s + p.propina, 0);
    const descuento = descuentoDeV1(c?.descuento);

    const totales = calcularCuenta({
      items: lineas,
      descuento,
      propina: propinaTotal ? { tipo: 'monto', valor: propinaTotal } : null,
      pagos,
    });

    const creada = momento(fecha, c?.creada);
    const cuentaId = insertarCuenta({
      nombre: nombreFinal,
      clave,
      estado: 'abierta',
      fecha,
      creada,
      cerrada: null,
      descuento,
      propina: propinaTotal ? { tipo: 'monto', valor: propinaTotal } : null,
      cuentaImpresa: c?.cuentaImpresa ? (momento(fecha, c.cuentaImpresa) ?? null) : null,
      idV1,
    });

    insertarLineas(cuentaId, lineas, creada);
    insertarPagos(cuentaId, pagos);
    insertarBitacora(cuentaId, c?.eventos, fecha);

    resumen.cuentas.nuevas++;
    resumen.dinero.porCobrar += Math.max(0, totales.restante);
  }

  /* ── Cancelaciones sueltas (control de merma de la v1) ──────────────── */
  const cancelaciones = Array.isArray(datos.cancelaciones) ? datos.cancelaciones : [];
  if (cancelaciones.length) {
    const meter = base().prepare(`
      INSERT INTO eventos (momento, usuario_nom, tipo, referencia, detalle)
      VALUES (?, ?, 'v1.cancelacion', NULL, ?)
    `);
    for (const x of cancelaciones) {
      meter.run(
        momento(x?.fecha, x?.hora) ?? null,
        QUIEN,
        JSON.stringify({
          cuenta: x?.cuenta ?? null,
          nombre: x?.nombre ?? null,
          detalle: x?.detalle ?? '',
          cant: entero(x?.cant) ?? 0,
          importe: entero(x?.importe) ?? 0,
          motivo: x?.motivo ?? null,
        }),
      );
    }
    resumen.cancelaciones = cancelaciones.length;
  }

  /* ── Que la v2 siga numerando donde la v1 se quedó ──────────────────── */
  // Si la v2 volviera a repartir folios desde el 1, chocarían con los
  // importados —y un folio repetido en dos tickets distintos es la forma más
  // rápida de que un corte deje de poder auditarse.
  const actual = Number(leerAjuste('folio.siguiente', '1')) || 1;
  const deLaV1 = entero(datos?.seq) ?? 0;
  const siguiente = Math.max(actual, folioMayor + 1, deLaV1);
  if (siguiente !== actual) escribirAjuste('folio.siguiente', siguiente);
  resumen.folioSiguiente = siguiente;

  return resumen;
}

/** El resumen del historial, en frases que se puedan leer de un vistazo. */
export function resumirHistorial(resumen) {
  if (!resumen) return [];
  const lineas = [];
  const pesos = (c) => `$${(c / 100).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

  const v = resumen.ventas;
  if (v.nuevas) {
    lineas.push(
      `${v.nuevas} venta(s) importada(s) por ${pesos(resumen.dinero.ventas)}` +
      (resumen.dinero.propinas ? ` más ${pesos(resumen.dinero.propinas)} de propinas` : '')
    );
  }
  if (v.repetidas) lineas.push(`${v.repetidas} venta(s) ya estaban importadas; no se duplicaron`);
  if (v.omitidas.length) {
    lineas.push(`${v.omitidas.length} venta(s) NO entraron: ` +
      v.omitidas.map((o) => `${o.etiqueta} (${o.motivo})`).join(', '));
  }

  const c = resumen.cuentas;
  if (c.nuevas) {
    lineas.push(`${c.nuevas} mesa(s) abierta(s) con ${pesos(resumen.dinero.porCobrar)} por cobrar`);
  }
  if (c.repetidas) lineas.push(`${c.repetidas} mesa(s) abierta(s) ya estaban importadas`);
  if (c.renombradas.length) {
    lineas.push('Ya había una mesa abierta con ese nombre, así que entraron como: ' +
      c.renombradas.map((r) => `${r.de} → ${r.a}`).join(', '));
  }
  if (c.omitidas.length) {
    lineas.push(`${c.omitidas.length} mesa(s) NO entraron: ` +
      c.omitidas.map((o) => `${o.etiqueta} (${o.motivo})`).join(', '));
  }

  if (resumen.cancelaciones) {
    lineas.push(`${resumen.cancelaciones} cancelación(es) de la v1 quedaron en la bitácora`);
  }
  if (resumen.folioSiguiente) {
    lineas.push(`La numeración de tickets sigue en el folio ${resumen.folioSiguiente}`);
  }

  lineas.push('El almacén NO se movió: estas ventas ya salieron del refrigerador en su día.');
  return lineas;
}
