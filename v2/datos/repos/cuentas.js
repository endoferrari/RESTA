/**
 * DATOS · CUENTAS ABIERTAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Una cuenta es una mesa abierta. Aquí se abre, se le anota, se le quita y se
 * manda su comanda a barra/cocina.
 *
 * Tres cosas que este archivo cuida y que son la razón de que exista v2:
 *
 *  1. **El precio se congela al anotar.** Si a media noche sube el precio de
 *     la cerveza, las cuentas ya abiertas conservan el precio de cuando se
 *     anotaron. El cliente paga lo que vio.
 *
 *  2. **Cada cambio sube la versión de la cuenta.** Es lo que permite avisar
 *     "esta cuenta cambió" cuando dos meseros la tocan a la vez, en vez de
 *     que uno le pise la comanda al otro.
 *
 *  3. **Nada se borra.** Quitar una línea la borra de la cuenta pero deja el
 *     renglón en `eventos`, con quién la quitó y por qué.
 */

import { base, enTransaccion } from '../conexion.js';
import { calcularCuenta } from '../../nucleo/cuenta.js';
import { anotarEvento } from './eventos.js';
import { descontarPorCancelacion } from './almacen.js';
import { leerAjuste } from './ajustes.js';

/** Quita acentos y mayúsculas, para que «Mesa 4» y «mesa 4» sean la misma.
 *  Se exporta porque el importador de la v1 tiene que calcular la misma clave:
 *  si ahí se normalizara distinto, una «Mesa 4» importada podría convivir con
 *  otra «mesa 4» abierta en la v2 y la comanda se partiría en dos. */
export const claveDeCuenta = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** El día de hoy en la laptop, no en hora del meridiano. */
const hoy = () => new Date().toLocaleDateString('sv-SE');   // 'sv-SE' da AAAA-MM-DD

/**
 * Un «4» a secas se entiende como «Mesa 4»: es lo que teclea un mesero con
 * prisa. Un nombre de persona se respeta tal cual.
 */
export function nombreDeCuenta(texto) {
  const limpio = String(texto ?? '').trim().replace(/\s+/g, ' ');
  if (!limpio) return null;
  return /^\d+$/.test(limpio) ? `Mesa ${limpio}` : limpio;
}

/* ── Leer ──────────────────────────────────────────────────────────────── */

function lineasDe(cuentaId) {
  return base().prepare(`
    SELECT id, producto_id, nombre, icono, familia, detalle, precio, cant,
           cortesia, cortesia_motivo, pagado, comandada_cant, anotada_nom, creada
      FROM lineas
     WHERE cuenta_id = ?
     ORDER BY id
  `).all(cuentaId).map((l) => ({
    id: l.id,
    productoId: l.producto_id,
    nombre: l.nombre,
    icono: l.icono,
    familia: l.familia,
    detalle: l.detalle,
    precio: l.precio,
    cant: l.cant,
    cortesia: l.cortesia === 1,
    cortesiaMotivo: l.cortesia_motivo,
    pagado: l.pagado === 1,
    comandadaCant: l.comandada_cant,
    // Lo que todavía NO ha salido a barra/cocina
    porComandar: l.cant - l.comandada_cant,
    anotadaPor: l.anotada_nom,
    creada: l.creada,
  }));
}

function pagosDe(cuentaId) {
  return base().prepare(`
    SELECT id, metodo, monto, recibido, cambio, referencia, cobrado_nom, momento
      FROM pagos
     WHERE cuenta_id = ?
     ORDER BY id
  `).all(cuentaId).map((p) => ({
    id: p.id,
    metodo: p.metodo,
    monto: p.monto,
    recibido: p.recibido,
    cambio: p.cambio,
    referencia: p.referencia,
    cobradoPor: p.cobrado_nom,
    momento: p.momento,
  }));
}

function armar(fila) {
  if (!fila) return null;

  const items = lineasDe(fila.id);

  const cuenta = {
    id: fila.id,
    nombre: fila.nombre,
    estado: fila.estado,
    version: fila.version,
    abiertaPor: fila.abierta_nom,
    fecha: fila.fecha,
    creada: fila.creada,
    cerrada: fila.cerrada,
    motivo: fila.motivo,
    cuentaImpresa: fila.cuenta_impresa,
    items,
    pagos: pagosDe(fila.id),
    descuento: fila.descuento_tipo
      ? { tipo: fila.descuento_tipo, valor: fila.descuento_valor } : null,
    propina: fila.propina_tipo
      ? { tipo: fila.propina_tipo, valor: fila.propina_valor } : null,
  };

  // Los números los calcula SIEMPRE el núcleo, nunca la pantalla.
  cuenta.totales = calcularCuenta(cuenta);
  return cuenta;
}

export function buscarCuenta(id) {
  return armar(base().prepare('SELECT * FROM cuentas WHERE id = ?').get(id));
}

/** Las mesas que están abiertas ahora mismo, como las pinta la pantalla. */
export function cuentasAbiertas() {
  return base()
    .prepare(`SELECT * FROM cuentas WHERE estado = 'abierta' ORDER BY id`)
    .all()
    .map(armar);
}

/* ── Abrir ─────────────────────────────────────────────────────────────── */

/**
 * Abre una cuenta. Si esa mesa ya estaba abierta, NO crea otra: devuelve la
 * que ya existe. Es lo correcto en el bar — dos «Mesa 4» a la vez es cómo se
 * pierde una comanda.
 */
export function abrirCuenta({ nombre, usuario }) {
  const limpio = nombreDeCuenta(nombre);
  if (!limpio) throw new Error('Escribe el número de mesa o el nombre del cliente.');

  const clave = claveDeCuenta(limpio);

  return enTransaccion(() => {
    const yaAbierta = base()
      .prepare(`SELECT * FROM cuentas WHERE nombre_clave = ? AND estado = 'abierta'`)
      .get(clave);

    if (yaAbierta) return { cuenta: armar(yaAbierta), yaEstaba: true };

    const r = base().prepare(`
      INSERT INTO cuentas (nombre, nombre_clave, abierta_por, abierta_nom, fecha)
      VALUES (?, ?, ?, ?, ?)
    `).run(limpio, clave, usuario?.id ?? null, usuario?.nombre ?? null, hoy());

    const id = Number(r.lastInsertRowid);
    anotarEvento({ tipo: 'cuenta.abrir', referencia: id, usuario, detalle: { nombre: limpio } });

    return { cuenta: buscarCuenta(id), yaEstaba: false };
  });
}

/* ── Anotar ────────────────────────────────────────────────────────────── */

/** Sube la versión: cualquiera que tenga la cuenta en pantalla se entera. */
export function tocar(cuentaId) {
  base().prepare(`UPDATE cuentas SET version = version + 1 WHERE id = ?`).run(cuentaId);
}

export function exigirAbierta(cuentaId) {
  const fila = base().prepare('SELECT * FROM cuentas WHERE id = ?').get(cuentaId);
  if (!fila) throw new Error('Esa cuenta no existe.');
  if (fila.estado !== 'abierta') {
    throw new Error(
      fila.estado === 'cobrada'
        ? 'Esa cuenta ya se cobró.'
        : 'Esa cuenta está cancelada.'
    );
  }
  return fila;
}

/**
 * Anota un producto en la cuenta.
 *
 * El precio y el nombre se COPIAN del producto en este momento y ya no
 * cambian. Si el producto se renombra o cambia de precio mañana, esta línea
 * se queda como está.
 *
 * Si ya hay una línea igual (mismo producto, mismo detalle, no pagada y que
 * todavía no salió a barra), se le suma la cantidad en vez de hacer un
 * renglón nuevo. Así el ticket no se llena de «Cerveza x1» repetidas.
 */
export function anotarLinea({ cuentaId, productoId, detalle = '', cant = 1, usuario }) {
  return enTransaccion(() => {
    exigirAbierta(cuentaId);

    const p = base()
      .prepare('SELECT * FROM productos WHERE id = ? AND activo = 1')
      .get(productoId);
    if (!p) throw new Error('Ese producto ya no está en la carta.');

    const piezas = Math.trunc(cant);
    if (!Number.isInteger(piezas) || piezas < 1) throw new Error('La cantidad no es válida.');

    // Con la comanda activa, un renglón que YA salió completo a barra/cocina
    // no se toca: lo nuevo se anota aparte hasta que se mande.
    const comandaActiva = leerAjuste('ticket.comanda', '0') === '1';

    // Ojo con `precio = ?`: sólo se une a un renglón que tenga EL MISMO
    // precio que el producto tiene ahora. Si a media noche subieron la
    // cerveza, la nueva NO se suma al renglón viejo —eso la cobraría al
    // precio de antes y el bar perdería la diferencia sin que nadie lo vea—:
    // se anota en un renglón aparte, con su precio nuevo.
    const igual = base().prepare(`
      SELECT * FROM lineas
       WHERE cuenta_id = ? AND producto_id = ? AND detalle = ? AND precio = ?
         AND pagado = 0 AND cortesia = 0
         ${comandaActiva ? 'AND cant > comandada_cant' : ''}
       ORDER BY id DESC LIMIT 1
    `).get(cuentaId, productoId, detalle ?? '', p.precio);

    if (igual) {
      base().prepare('UPDATE lineas SET cant = cant + ? WHERE id = ?').run(piezas, igual.id);
    } else {
      base().prepare(`
        INSERT INTO lineas
          (cuenta_id, producto_id, nombre, icono, familia, detalle, precio, cant,
           anotada_por, anotada_nom)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        cuentaId, p.id, p.nombre, p.icono, p.familia, detalle ?? '', p.precio, piezas,
        usuario?.id ?? null, usuario?.nombre ?? null,
      );
    }

    tocar(cuentaId);
    anotarEvento({
      tipo: 'linea.anotar', referencia: cuentaId, usuario,
      detalle: { producto: p.nombre, detalle: detalle || null, cant: piezas, precio: p.precio },
    });

    return buscarCuenta(cuentaId);
  });
}

/**
 * Quita una línea (o parte de su cantidad).
 *
 * Lo que ya salió a barra/cocina NO lo puede quitar un mesero: si ya se está
 * preparando, tiene que enterarse la caja. Esa comprobación la hace quien
 * llama, según el rol.
 */
export function quitarLinea({ cuentaId, lineaId, cant = null, motivo = null, usuario }) {
  return enTransaccion(() => {
    exigirAbierta(cuentaId);

    const l = base()
      .prepare('SELECT * FROM lineas WHERE id = ? AND cuenta_id = ?')
      .get(lineaId, cuentaId);
    if (!l) throw new Error('Ese renglón ya no está en la cuenta.');
    if (l.pagado) throw new Error('Ese renglón ya se cobró; no se puede quitar.');

    const quitar = cant === null ? l.cant : Math.trunc(cant);
    if (quitar < 1 || quitar > l.cant) throw new Error('La cantidad a quitar no es válida.');

    if (quitar === l.cant) {
      base().prepare('DELETE FROM lineas WHERE id = ?').run(lineaId);
    } else {
      base().prepare(`
        UPDATE lineas
           SET cant = cant - ?,
               comandada_cant = MIN(comandada_cant, cant - ?)
         WHERE id = ?
      `).run(quitar, quitar, lineaId);
    }

    tocar(cuentaId);

    // Aquí es donde queda el rastro: la línea desaparece de la cuenta, pero
    // no de la historia.
    anotarEvento({
      tipo: 'linea.quitar', referencia: cuentaId, usuario,
      detalle: {
        producto: l.nombre, detalle: l.detalle || null, cant: quitar,
        precio: l.precio, yaComandada: l.comandada_cant > 0, motivo,
      },
    });

    return buscarCuenta(cuentaId);
  });
}

/* ── Comanda ───────────────────────────────────────────────────────────── */

/**
 * Marca como enviado a barra/cocina todo lo que estaba pendiente, y devuelve
 * qué fue exactamente lo que salió (para imprimirlo en la fase 5).
 */
export function marcarComandado({ cuentaId, usuario }) {
  return enTransaccion(() => {
    exigirAbierta(cuentaId);

    const pendientes = base().prepare(`
      SELECT id, nombre, icono, detalle, cant, comandada_cant
        FROM lineas
       WHERE cuenta_id = ? AND cant > comandada_cant
       ORDER BY id
    `).all(cuentaId);

    if (pendientes.length === 0) {
      throw new Error('No hay nada nuevo que mandar a barra o cocina.');
    }

    const salieron = pendientes.map((l) => ({
      nombre: l.nombre,
      icono: l.icono,
      detalle: l.detalle,
      cant: l.cant - l.comandada_cant,
    }));

    base().prepare(`
      UPDATE lineas SET comandada_cant = cant
       WHERE cuenta_id = ? AND cant > comandada_cant
    `).run(cuentaId);

    tocar(cuentaId);
    anotarEvento({ tipo: 'cuenta.comandar', referencia: cuentaId, usuario, detalle: { salieron } });

    return { cuenta: buscarCuenta(cuentaId), salieron };
  });
}

/* ── Cancelar ──────────────────────────────────────────────────────────── */

/**
 * Cancelar NO borra: marca la cuenta como cancelada, con motivo y responsable.
 * Cuando falte dinero en la caja, aquí es donde se busca.
 */
export function cancelarCuenta({ cuentaId, motivo, seConsumio = false, usuario }) {
  return enTransaccion(() => {
    const fila = exigirAbierta(cuentaId);

    if (!motivo?.trim()) throw new Error('Escribe por qué se cancela la cuenta.');

    const cuenta = armar(fila);

    // ── ¿Se lo tomaron o no? ──
    //
    // Cancelar una cuenta tiene dos casos que no se parecen en nada:
    //
    //  · Se fueron ANTES de que les sirvieran, o se anotó en la mesa
    //    equivocada. Nada salió del refrigerador y el almacén no se toca.
    //  · **Se lo tomaron y se fueron sin pagar.** El dinero se perdió, pero
    //    esas cervezas SÍ salieron. Si no se descuentan, el inventario las
    //    sigue contando y al mes nadie entiende por qué nunca cuadra.
    //
    // Antes sólo existía el primer caso, y el segundo es el que de verdad
    // pasa en un bar.
    if (seConsumio) {
      descontarPorCancelacion({ cuenta, motivo: motivo.trim(), usuario });
    }

    base().prepare(`
      UPDATE cuentas
         SET estado = 'cancelada',
             motivo = ?,
             cerrada = datetime('now','localtime'),
             version = version + 1
       WHERE id = ?
    `).run(motivo.trim(), cuentaId);

    anotarEvento({
      tipo: 'cuenta.cancelar', referencia: cuentaId, usuario,
      detalle: {
        nombre: cuenta.nombre,
        motivo: motivo.trim(),
        seIba: cuenta.totales.total,          // cuánto se dejó de cobrar
        articulos: cuenta.totales.articulos,
        seConsumio,                           // si además se perdió mercancía
      },
    });

    return buscarCuenta(cuentaId);
  });
}

/* ── Cortesías ─────────────────────────────────────────────────────────── */

/**
 * Marca (o desmarca) un renglón como cortesía.
 *
 * Una cortesía NO se borra de la cuenta: se sigue viendo y se sigue
 * imprimiendo, pero no se cobra. Eso importa porque al final del turno hay
 * que poder contestar «¿cuánto se regaló hoy y quién lo autorizó?».
 */
export function ponerCortesia({ cuentaId, lineaId, esCortesia, motivo = null, usuario }) {
  return enTransaccion(() => {
    exigirAbierta(cuentaId);

    const l = base()
      .prepare('SELECT * FROM lineas WHERE id = ? AND cuenta_id = ?')
      .get(lineaId, cuentaId);
    if (!l) throw new Error('Ese renglón ya no está en la cuenta.');
    if (l.pagado) throw new Error('Ese renglón ya se cobró; ya no se puede regalar.');

    if (esCortesia && !motivo?.trim()) {
      throw new Error('Escribe por qué se regala este producto.');
    }

    base().prepare(`
      UPDATE lineas
         SET cortesia = ?, cortesia_motivo = ?, cortesia_por = ?
       WHERE id = ?
    `).run(
      esCortesia ? 1 : 0,
      esCortesia ? motivo.trim() : null,
      esCortesia ? (usuario?.nombre ?? null) : null,
      lineaId,
    );

    tocar(cuentaId);
    anotarEvento({
      tipo: esCortesia ? 'linea.cortesia' : 'linea.cortesia.quitar',
      referencia: cuentaId, usuario,
      detalle: {
        producto: l.nombre, cant: l.cant,
        seRegala: esCortesia ? l.precio * l.cant : 0,
        motivo: esCortesia ? motivo.trim() : null,
      },
    });

    return buscarCuenta(cuentaId);
  });
}

/* ── Descuento y propina de toda la cuenta ─────────────────────────────── */

/**
 * Pone (o quita, con valor 0) el descuento de la cuenta.
 * El núcleo se encarga de que nunca sea mayor que el consumo: una cuenta no
 * puede quedar en negativo y el bar terminar debiéndole al cliente.
 */
export function ponerDescuento({ cuentaId, tipo, valor, motivo = null, usuario }) {
  return enTransaccion(() => {
    exigirAbierta(cuentaId);

    const cantidad = Math.trunc(valor ?? 0);
    if (cantidad < 0) throw new Error('El descuento no puede ser negativo.');
    if (cantidad > 0 && !['porcentaje', 'monto'].includes(tipo)) {
      throw new Error('El descuento tiene que ser por porcentaje o por cantidad.');
    }
    if (tipo === 'porcentaje' && cantidad > 100) {
      throw new Error('El descuento no puede pasar del 100%.');
    }

    base().prepare(`
      UPDATE cuentas SET descuento_tipo = ?, descuento_valor = ?, version = version + 1
       WHERE id = ?
    `).run(cantidad > 0 ? tipo : null, cantidad, cuentaId);

    const cuenta = buscarCuenta(cuentaId);
    anotarEvento({
      tipo: cantidad > 0 ? 'cuenta.descuento' : 'cuenta.descuento.quitar',
      referencia: cuentaId, usuario,
      detalle: {
        tipo: cantidad > 0 ? tipo : null, valor: cantidad, motivo,
        seDescuenta: cuenta.totales.descuento,
      },
    });

    return cuenta;
  });
}

/** Pone (o quita, con valor 0) la propina. Se calcula sobre el subtotal. */
export function ponerPropina({ cuentaId, tipo, valor, usuario }) {
  return enTransaccion(() => {
    exigirAbierta(cuentaId);

    const cantidad = Math.trunc(valor ?? 0);
    if (cantidad < 0) throw new Error('La propina no puede ser negativa.');
    if (cantidad > 0 && !['porcentaje', 'monto'].includes(tipo)) {
      throw new Error('La propina tiene que ser por porcentaje o por cantidad.');
    }

    base().prepare(`
      UPDATE cuentas SET propina_tipo = ?, propina_valor = ?, version = version + 1
       WHERE id = ?
    `).run(cantidad > 0 ? tipo : null, cantidad, cuentaId);

    const cuenta = buscarCuenta(cuentaId);
    anotarEvento({
      tipo: 'cuenta.propina', referencia: cuentaId, usuario,
      detalle: { tipo: cantidad > 0 ? tipo : null, valor: cantidad, propina: cuenta.totales.propina },
    });

    return cuenta;
  });
}

/** Marca que el cliente ya pidió su cuenta (se le imprimió, aún no paga). */
export function marcarCuentaImpresa({ cuentaId, usuario }) {
  return enTransaccion(() => {
    exigirAbierta(cuentaId);
    base().prepare(`
      UPDATE cuentas
         SET cuenta_impresa = datetime('now','localtime'), version = version + 1
       WHERE id = ?
    `).run(cuentaId);
    anotarEvento({ tipo: 'cuenta.imprimir', referencia: cuentaId, usuario });
    return buscarCuenta(cuentaId);
  });
}
