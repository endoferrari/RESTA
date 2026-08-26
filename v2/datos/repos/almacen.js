/**
 * DATOS · ALMACÉN
 * ─────────────────────────────────────────────────────────────────────────────
 * Entradas, salidas y existencias.
 *
 * La existencia NO se guarda en ninguna columna: se suma de la tabla de
 * movimientos. Así siempre se puede contestar «¿y por qué hay 38?» renglón
 * por renglón, en vez de tener un número suelto que alguien cambió y nadie
 * sabe cuándo. Un bar hace unos cientos de movimientos por noche; sumarlos
 * es instantáneo.
 *
 * Los números —cobertura, proyección, lista de compra— los calcula
 * `nucleo/almacen.js`, que es cálculo puro y está probado. Aquí sólo se
 * consulta y se guarda.
 */

import { base, enTransaccion } from '../conexion.js';
import {
  diasDeCobertura, semaforo, listaDeCompra, revisarConteo, enEnvases, textoEnvases,
} from '../../nucleo/almacen.js';
import { anotarEvento } from './eventos.js';
import { leerAjuste, escribirAjuste } from './ajustes.js';

const hoy = () => new Date().toLocaleDateString('sv-SE');

/* ── ¿Este bar lleva inventario? ───────────────────────────────────────── */

/**
 * El interruptor general.
 *
 * Apagado, el almacén NO se enseña por ningún lado: ni el botón de la barra
 * lateral, ni las existencias, ni la lista de compras. Un bar que apenas está
 * aprendiendo a cobrar no tiene por qué cargar con un inventario que todavía
 * no puede mantener.
 *
 * Lo que NO se apaga es el registro: lo que ya está marcado para controlar
 * sigue anotando sus salidas por dentro. Eso no le cuesta nada a nadie y hace
 * que, el día que se encienda, la lista de «qué comprar» ya sepa cuánto se
 * vende un sábado en vez de tener que aprenderlo durante dos semanas.
 */
export function almacenActivo() {
  return leerAjuste('almacen.activo', '0') === '1';
}

/** La foto de cómo está el módulo, para que la pantalla sepa qué enseñar. */
export function estadoDelAlmacen() {
  const arqueo = leerAjuste('almacen.arqueo_inicial', '');
  return {
    activo: almacenActivo(),
    // Sin arqueo, los números del almacén no valen: no hubo un día en que
    // alguien contara de verdad y dijera «de aquí para adelante».
    arqueoHecho: !!arqueo,
    arqueoFecha: arqueo || null,
    controlados: base()
      .prepare('SELECT count(*) AS n FROM productos WHERE controla_stock = 1 AND activo = 1')
      .get().n,
  };
}

/** Enciende o apaga el módulo. Queda registrado quién y cuándo. */
export function cambiarAlmacenActivo({ activo, usuario }) {
  escribirAjuste('almacen.activo', activo ? '1' : '0');

  anotarEvento({
    tipo: activo ? 'almacen.encender' : 'almacen.apagar', usuario,
    detalle: estadoDelAlmacen(),
  });

  return estadoDelAlmacen();
}

export const MOTIVOS_MERMA = [
  'Se cayó / se rompió',
  'Se sirvió mal',
  'Se echó a perder',
  'Se lo llevó un cliente sin pagar',
  'Prueba o degustación',
];

/* ── Qué productos se controlan ────────────────────────────────────────── */

function aProductoDeAlmacen(fila) {
  return {
    id: fila.id,
    nombre: fila.nombre,
    icono: fila.icono,
    familia: fila.familia,
    porcionesPorEnvase: fila.porciones_por_envase,
    envase: fila.envase,
    unidad: fila.unidad,
    activo: fila.activo === 1,
  };
}

export function productosControlados() {
  return base().prepare(`
    SELECT * FROM productos
     WHERE controla_stock = 1 AND activo = 1
     ORDER BY familia, orden, id
  `).all().map(aProductoDeAlmacen);
}

/**
 * A qué producto le baja la existencia cuando se vende éste.
 * La michelada apunta a la cerveza; lo demás se apunta a sí mismo.
 * Devuelve null si ese producto no mueve almacén.
 */
export function aQuienDescuenta(productoId) {
  const p = base()
    .prepare('SELECT id, controla_stock, gasta_producto_id FROM productos WHERE id = ?')
    .get(productoId);
  if (!p) return null;

  if (p.gasta_producto_id) {
    const otro = base()
      .prepare('SELECT id, controla_stock FROM productos WHERE id = ?')
      .get(p.gasta_producto_id);
    return otro?.controla_stock ? otro.id : null;
  }

  return p.controla_stock ? p.id : null;
}

/* ── Existencias ───────────────────────────────────────────────────────── */

export function existenciaDe(productoId) {
  const { total } = base()
    .prepare('SELECT COALESCE(sum(cantidad), 0) AS total FROM movimientos_stock WHERE producto_id = ?')
    .get(productoId);
  return total;
}

/**
 * Las ventas por día de un producto, para proyectar el consumo.
 *
 * Devuelve además la VENTANA observada: desde cuándo se lleva registro de
 * este producto. Sin ella, el promedio por día de la semana se dividiría
 * entre «los sábados que vendieron» en vez de «todos los sábados», y saldría
 * inflado — se compraría de más para siempre.
 */
function ventasPorFecha(productoId, dias) {
  const filas = base().prepare(`
    SELECT fecha, -sum(cantidad) AS vendido
      FROM movimientos_stock
     WHERE producto_id = ? AND tipo = 'venta'
       AND fecha >= date('now','localtime', ?)
     GROUP BY fecha
  `).all(productoId, `-${dias} days`);

  // La ventana empieza cuando empezó a moverse este producto, no hace ocho
  // semanas: uno que se controla desde ayer no se puede promediar sobre
  // ocho sábados que nadie miró.
  const { primera } = base().prepare(`
    SELECT min(fecha) AS primera
      FROM movimientos_stock
     WHERE producto_id = ? AND fecha >= date('now','localtime', ?)
  `).get(productoId, `-${dias} days`);

  return {
    ventas: Object.fromEntries(filas.map((f) => [f.fecha, f.vendido])),
    ventana: primera ? { desde: primera, hasta: hoy() } : {},
  };
}

/**
 * La foto del almacén: qué hay, para cuántos días alcanza y de qué color.
 * Es lo que pinta la pantalla principal.
 */
export function existencias({ diasACubrir = null } = {}) {
  const cubrir = diasACubrir ?? Number(leerAjuste('almacen.dias_a_cubrir', '7'));
  const historia = Number(leerAjuste('almacen.dias_de_historia', '56'));
  const diaHoy = new Date().getDay();

  return productosControlados().map((p) => {
    const existencia = existenciaDe(p.id);
    const { ventas, ventana } = ventasPorFecha(p.id, historia);
    const dias = diasDeCobertura(existencia, ventas, diaHoy, ventana);

    return {
      ...p,
      existencia,
      enEnvases: enEnvases(existencia, p.porcionesPorEnvase),
      texto: textoEnvases(existencia, p),
      dias: dias === Infinity ? null : dias,
      semaforo: semaforo(dias, cubrir),
      ventasPorFecha: ventas,
      ventana,
    };
  });
}

/** Qué comprar y cuánto, para llegar cubierto los próximos días. */
export function queComprar({ diasACubrir = null } = {}) {
  const cubrir = diasACubrir ?? Number(leerAjuste('almacen.dias_a_cubrir', '7'));

  return {
    diasACubrir: cubrir,
    lista: listaDeCompra(existencias({ diasACubrir: cubrir }), {
      diasACubrir: cubrir,
      desdeDiaSemana: new Date().getDay(),
    }),
  };
}

/* ── Mover el almacén ──────────────────────────────────────────────────── */

function anotarMovimiento({ productoId, tipo, cantidad, motivo = null, referencia = null, usuario }) {
  base().prepare(`
    INSERT INTO movimientos_stock
      (producto_id, tipo, cantidad, motivo, referencia, usuario_id, usuario_nom, fecha)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    productoId, tipo, Math.trunc(cantidad), motivo, referencia,
    usuario?.id ?? null, usuario?.nombre ?? null, hoy(),
  );
}

/**
 * LLEGÓ EL PEDIDO.
 * Se captura en ENVASES —«3 cajas»— que es como llega y como se cuenta al
 * recibirlo. El sistema lo pasa a porciones.
 *
 * @param compras [{ productoId, envases }]
 */
export function registrarCompra({ compras, usuario }) {
  return enTransaccion(() => {
    const guardadas = [];

    for (const { productoId, envases } of compras) {
      const cuantos = Math.trunc(envases);
      if (!Number.isInteger(cuantos) || cuantos === 0) continue;

      const p = base()
        .prepare('SELECT * FROM productos WHERE id = ? AND controla_stock = 1')
        .get(productoId);
      if (!p) throw new Error('Ese producto no se controla en el almacén.');

      const porciones = cuantos * p.porciones_por_envase;

      anotarMovimiento({
        productoId, tipo: 'compra', cantidad: porciones,
        motivo: `${cuantos} ${p.envase}(s)`, usuario,
      });

      guardadas.push({
        producto: p.nombre, envases: cuantos, porciones,
        existencia: existenciaDe(productoId),
      });
    }

    if (guardadas.length === 0) throw new Error('No anotaste ninguna cantidad.');

    anotarEvento({
      tipo: 'almacen.compra', usuario,
      detalle: { productos: guardadas.length, lista: guardadas },
    });

    return guardadas;
  });
}

/**
 * MERMA: se cayó una botella, se sirvió mal un trago.
 * Tiene que ser de un toque o nadie la anota, y si nadie la anota el
 * inventario se desfasa y en dos meses ya no sirve.
 */
export function registrarMerma({ productoId, porciones, motivo, usuario }) {
  return enTransaccion(() => {
    const cuantas = Math.trunc(porciones);
    if (!Number.isInteger(cuantas) || cuantas <= 0) {
      throw new Error('¿Cuántas se perdieron?');
    }
    if (!motivo?.trim()) throw new Error('Escribe qué pasó.');

    const p = base()
      .prepare('SELECT * FROM productos WHERE id = ? AND controla_stock = 1')
      .get(productoId);
    if (!p) throw new Error('Ese producto no se controla en el almacén.');

    anotarMovimiento({
      productoId, tipo: 'merma', cantidad: -cuantas, motivo: motivo.trim(), usuario,
    });

    anotarEvento({
      tipo: 'almacen.merma', referencia: `producto:${productoId}`, usuario,
      detalle: { producto: p.nombre, porciones: cuantas, motivo: motivo.trim() },
    });

    return { producto: p.nombre, existencia: existenciaDe(productoId) };
  });
}

/**
 * CONTEO FÍSICO.
 * Se cuenta de verdad y el sistema anota la diferencia. Esto es lo que
 * mantiene vivo el inventario: sin un conteo cada tanto la cuenta se desfasa
 * y nadie vuelve a creerle.
 *
 * @param conteos [{ productoId, contado }]  contado en PORCIONES
 */
export function registrarConteo({ conteos, usuario }) {
  return enTransaccion(() => {
    const resultado = [];

    for (const { productoId, contado } of conteos) {
      if (contado === null || contado === undefined || contado === '') continue;

      const p = base()
        .prepare('SELECT * FROM productos WHERE id = ? AND controla_stock = 1')
        .get(productoId);
      if (!p) continue;

      const segunSistema = existenciaDe(productoId);
      const r = revisarConteo({
        contado: Math.trunc(contado),
        segunSistema,
        porcionesPorEnvase: p.porciones_por_envase,
      });

      if (!r.cuadra) {
        anotarMovimiento({
          productoId, tipo: 'conteo', cantidad: r.diferencia,
          motivo: r.falta
            ? `Faltaron ${Math.abs(r.diferencia)} al contar`
            : `Sobraron ${r.diferencia} al contar`,
          usuario,
        });
      }

      resultado.push({ producto: p.nombre, ...r });
    }

    if (resultado.length === 0) throw new Error('No contaste ningún producto.');

    const descuadrados = resultado.filter((r) => !r.cuadra);
    anotarEvento({
      tipo: 'almacen.conteo', usuario,
      detalle: {
        contados: resultado.length,
        descuadrados: descuadrados.length,
        lista: descuadrados.map((r) => ({ producto: r.producto, diferencia: r.diferencia })),
      },
    });

    return resultado;
  });
}

/**
 * Deja la existencia EXACTAMENTE en lo que se contó, anotando la diferencia.
 *
 * Es la pieza que comparten el arqueo y la plantilla de Excel: los dos dicen
 * «hay 84», y los dos tienen que dejar registrado de dónde salió ese 84 para
 * que después se pueda contestar «¿y por qué hay 84?».
 */
export function fijarExistencia({ productoId, contado, motivo, usuario = null }) {
  const antes = existenciaDe(productoId);
  const diferencia = Math.trunc(contado) - antes;

  if (diferencia !== 0) {
    anotarMovimiento({ productoId, tipo: 'conteo', cantidad: diferencia, motivo, usuario });
  }

  return { antes, diferencia, cambio: diferencia !== 0 };
}

/**
 * EL ARQUEO INICIAL: la primera vez que se cuenta todo.
 *
 * Es distinto del conteo de cada semana en una cosa que importa mucho: aquí
 * **anotar una cantidad da de alta el producto en el almacén**. Si hubiera
 * que ir primero a «Qué se controla», marcar 40 productos uno por uno y
 * después volver a contarlos, nadie llegaría al final. Se cuenta lo que hay
 * en la bodega, renglón por renglón, y lo que se contó queda controlado.
 *
 * Lo que se deja en blanco NO se toca: ni se controla ni se descontrola. Para
 * decir «de esto no queda nada» se escribe 0, que es distinto de no contarlo.
 *
 * @param conteos [{ productoId, contado }]  contado en la unidad que se vende
 */
export function arqueoInicial({ conteos, usuario }) {
  return enTransaccion(() => {
    const resultado = [];

    for (const { productoId, contado } of conteos) {
      if (contado === null || contado === undefined || contado === '') continue;

      const cuantos = Math.trunc(Number(contado));
      if (!Number.isInteger(cuantos) || cuantos < 0) {
        throw new Error('Las cantidades del arqueo tienen que ser números de 0 en adelante.');
      }

      const p = base().prepare('SELECT * FROM productos WHERE id = ? AND activo = 1').get(productoId);
      if (!p) continue;

      // Una michelada no se guarda en el refrigerador: la cerveza sí. Contar
      // «micheladas» dejaría una existencia que nadie puede reponer.
      if (p.gasta_producto_id) {
        resultado.push({
          producto: p.nombre, omitido: true,
          motivo: 'sale de otro producto, no tiene existencia propia',
        });
        continue;
      }

      const eraNuevo = p.controla_stock !== 1;
      if (eraNuevo) {
        base().prepare(`
          UPDATE productos SET controla_stock = 1, actualizado = datetime('now','localtime')
           WHERE id = ?
        `).run(productoId);
      }

      // La diferencia contra lo que creía el sistema queda anotada, igual que
      // en un conteo normal. Con el almacén recién encendido eso es todo lo
      // que había: la existencia queda exactamente en lo que se contó.
      const { antes, diferencia } = fijarExistencia({
        productoId, contado: cuantos, motivo: 'Arqueo inicial', usuario,
      });

      resultado.push({ producto: p.nombre, contado: cuantos, antes, diferencia, eraNuevo });
    }

    if (resultado.length === 0) throw new Error('No anotaste ninguna cantidad.');

    // A partir de este día los números del almacén significan algo: hubo
    // alguien que contó de verdad y dijo «de aquí para adelante».
    escribirAjuste('almacen.arqueo_inicial', hoy());

    anotarEvento({
      tipo: 'almacen.arqueo', usuario,
      detalle: {
        contados: resultado.filter((r) => !r.omitido).length,
        dadosDeAlta: resultado.filter((r) => r.eraNuevo).length,
      },
    });

    return resultado;
  });
}

/**
 * LA VENTA DESCUENTA SOLA.
 * Se llama al cerrar el ticket. Nadie captura nada: la salida de mercancía
 * ya quedó registrada al cobrar.
 *
 * Las cortesías TAMBIÉN descuentan: una cerveza regalada salió del
 * refrigerador igual que una vendida.
 */
export function descontarVenta({ cuenta, folio, usuario }) {
  const movidos = [];

  for (const linea of cuenta.items) {
    const destino = aQuienDescuenta(linea.productoId);
    if (!destino) continue;

    anotarMovimiento({
      productoId: destino,
      tipo: 'venta',
      cantidad: -Math.trunc(linea.cant),
      motivo: linea.nombre,
      referencia: `ticket:${folio}`,
      usuario,
    });

    movidos.push({ productoId: destino, cant: linea.cant });
  }

  return movidos;
}

/**
 * EL CLIENTE SE FUE SIN PAGAR.
 *
 * La cuenta se cancela —el dinero no entró y así queda registrado— pero la
 * mercancía SÍ salió del refrigerador. Se descuenta como merma, no como
 * venta, porque no se vendió: se perdió.
 *
 * Que sea merma y no venta importa para las cuentas del almacén: si entrara
 * como venta, la proyección de consumo creería que ese día se vendió más de
 * lo real y haría comprar de más para siempre.
 */
export function descontarPorCancelacion({ cuenta, motivo, usuario }) {
  const movidos = [];

  for (const linea of cuenta.items) {
    const destino = aQuienDescuenta(linea.productoId);
    if (!destino) continue;

    anotarMovimiento({
      productoId: destino,
      tipo: 'merma',
      cantidad: -Math.trunc(linea.cant),
      motivo: `Se consumió sin pagar · ${linea.nombre} · ${motivo}`,
      referencia: `cuenta:${cuenta.id}`,
      usuario,
    });

    movidos.push({ productoId: destino, cant: linea.cant });
  }

  return movidos;
}

/* ── Historia ──────────────────────────────────────────────────────────── */

/** Los últimos movimientos de un producto, para contestar «¿por qué hay 38?». */
export function movimientosDe(productoId, cuantos = 50) {
  return base().prepare(`
    SELECT tipo, cantidad, motivo, referencia, usuario_nom, momento
      FROM movimientos_stock
     WHERE producto_id = ?
     ORDER BY id DESC LIMIT ?
  `).all(productoId, cuantos);
}

/** Lo que se vendió hoy, con cantidades. Es lo que pidió Rosendo en el corte. */
export function vendidoHoy(fecha = null) {
  return base().prepare(`
    SELECT p.nombre, p.icono, p.familia, -sum(m.cantidad) AS piezas
      FROM movimientos_stock m
      JOIN productos p ON p.id = m.producto_id
     WHERE m.tipo = 'venta' AND m.fecha = ?
     GROUP BY m.producto_id
     ORDER BY piezas DESC
  `).all(fecha ?? hoy());
}

/* ── Configurar qué se controla ────────────────────────────────────────── */

export function configurarProducto({ id, controla, porcionesPorEnvase, envase, unidad, gastaDe }) {
  const p = base().prepare('SELECT * FROM productos WHERE id = ?').get(id);
  if (!p) throw new Error('Ese producto ya no existe.');

  if (porcionesPorEnvase !== undefined) {
    const n = Math.trunc(porcionesPorEnvase);
    if (!Number.isInteger(n) || n < 1) {
      throw new Error('¿Cuántas porciones trae lo que compras? Tiene que ser 1 o más.');
    }
    if (n > 1000) throw new Error('Ese número es demasiado grande. ¿Sobran ceros?');
  }

  // Que un producto no se gaste a sí mismo por una vuelta rara
  if (gastaDe) {
    if (Number(gastaDe) === Number(id)) {
      throw new Error('Un producto no puede gastar de sí mismo; deja el campo vacío.');
    }
    const otro = base()
      .prepare('SELECT nombre, controla_stock, gasta_producto_id FROM productos WHERE id = ?')
      .get(gastaDe);
    if (!otro) throw new Error('Ese producto no existe.');
    if (otro.gasta_producto_id) {
      throw new Error('Ese producto ya gasta de otro. Apunta directo al que se compra.');
    }
    // Sin esto la cadena se rompe en silencio: la michelada apuntaría a una
    // cerveza que nadie cuenta, y al vender no bajaría nada de nada.
    if (!otro.controla_stock) {
      throw new Error(`Primero hay que controlar «${otro.nombre}» en el almacén.`);
    }
  }

  // Lo que gasta de otro NO lleva existencia propia: la michelada no se
  // guarda en el refrigerador, la cerveza sí.
  const controlaFinal = gastaDe ? false : controla;

  base().prepare(`
    UPDATE productos
       SET controla_stock       = COALESCE(?, controla_stock),
           porciones_por_envase = COALESCE(?, porciones_por_envase),
           envase               = COALESCE(?, envase),
           unidad               = COALESCE(?, unidad),
           gasta_producto_id    = ?,
           actualizado          = datetime('now','localtime')
     WHERE id = ?
  `).run(
    controlaFinal === undefined ? null : (controlaFinal ? 1 : 0),
    porcionesPorEnvase === undefined ? null : Math.trunc(porcionesPorEnvase),
    envase === undefined ? null : String(envase).trim(),
    unidad === undefined ? null : String(unidad).trim(),
    gastaDe === undefined ? p.gasta_producto_id : (gastaDe || null),
    id,
  );

  return base().prepare('SELECT * FROM productos WHERE id = ?').get(id);
}

/** Todos los productos con su configuración de almacén, para la pantalla. */
export function configuracionDeAlmacen() {
  return base().prepare(`
    SELECT p.id, p.nombre, p.icono, p.familia, p.activo,
           p.controla_stock, p.porciones_por_envase, p.envase, p.unidad,
           p.gasta_producto_id,
           (SELECT nombre FROM productos q WHERE q.id = p.gasta_producto_id) AS gasta_nombre
      FROM productos p
     WHERE p.activo = 1
     ORDER BY p.familia, p.orden, p.id
  `).all().map((p) => ({
    id: p.id,
    nombre: p.nombre,
    icono: p.icono,
    familia: p.familia,
    controla: p.controla_stock === 1,
    porcionesPorEnvase: p.porciones_por_envase,
    envase: p.envase,
    unidad: p.unidad,
    gastaDe: p.gasta_producto_id,
    gastaNombre: p.gasta_nombre,
  }));
}

/**
 * La lista para el arqueo: TODA la carta, con lo que el sistema cree que hay.
 *
 * Van todos los productos y no sólo los controlados a propósito. El arqueo es
 * el momento en que se decide qué se lleva y qué no, caminando por la bodega
 * con la tablet en la mano; si la lista sólo trajera lo ya marcado, habría que
 * adivinar antes de contar.
 */
export function paraElArqueo() {
  return configuracionDeAlmacen().map((p) => ({
    ...p,
    existencia: p.controla ? existenciaDe(p.id) : 0,
  }));
}
