/**
 * DATOS · LA PLANTILLA DE LA CARTA
 * ─────────────────────────────────────────────────────────────────────────────
 * Bajar toda la carta a una hoja de cálculo, llenarla en Excel y volverla a
 * subir. En un solo viaje se pueden cambiar precios, dar de alta productos,
 * dar de baja los que ya no se venden y ajustar el inventario.
 *
 * POR QUÉ LA PLANTILLA SE BAJA LLENA Y NO VACÍA
 * Capturar 137 productos desde cero en una hoja en blanco no lo hace nadie.
 * Se baja la carta tal como está hoy, se corrige encima lo que cambió —tres
 * precios y dos productos nuevos— y se sube. Es la diferencia entre diez
 * minutos y una tarde.
 *
 * LA COLUMNA «CLAVE» ES LA QUE HACE QUE ESTO SEA SEGURO
 * Cada renglón se lleva el número interno del producto. Gracias a eso se
 * puede RENOMBRAR un producto o cambiarlo de familia sin que RESTA crea que
 * es otro distinto. Un archivo que no traiga esa columna —la lista de precios
 * de un proveedor, por ejemplo— se sigue pudiendo importar, pero entonces no
 * se le permite dar de baja nada: no hay forma de saber si trae la carta
 * completa o sólo las cervezas.
 *
 * NADA SE BORRA, TAMPOCO AQUÍ
 * Un producto que no venga en la hoja se DA DE BAJA: desaparece de la
 * pantalla de venta pero los tickets de hace meses siguen enteros y se puede
 * volver a activar cuando regrese a la carta. Borrarlo de verdad dejaría al
 * corte de aquel día sin poder cuadrar.
 */

import {
  listarProductos, buscarProducto, crearProducto, editarProducto,
  apagarProducto, familiasConCuenta, crearFamilia,
} from './repos/productos.js';
import {
  configuracionDeAlmacen, existenciaDe, configurarProducto, almacenActivo,
  fijarExistencia,
} from './repos/almacen.js';
import { enTransaccion } from './conexion.js';
import { anotarEvento } from './repos/eventos.js';
import { parseOpciones, textoOpciones } from '../nucleo/opciones.js';
import { formatear } from '../nucleo/dinero.js';

/**
 * Las columnas de la hoja, en orden.
 *
 * Los títulos están escritos como los leería una persona, no como se llaman
 * por dentro: quien abre la hoja en Excel tiene que entenderla sin manual.
 */
export const COLUMNAS = [
  { clave: 'id',         titulo: 'Clave' },
  { clave: 'icono',      titulo: 'Dibujo' },
  { clave: 'nombre',     titulo: 'Producto' },
  { clave: 'precio',     titulo: 'Precio' },
  { clave: 'familia',    titulo: 'Familia' },
  { clave: 'submenu',    titulo: 'Submenú' },
  { clave: 'inventario', titulo: 'Inventario' },
  { clave: 'existencia', titulo: 'Existencia' },
  { clave: 'unidad',     titulo: 'Unidad' },
  { clave: 'envase',     titulo: 'Envase' },
  { clave: 'porciones',  titulo: 'Porciones' },
];

/**
 * Las líneas de ayuda que van ARRIBA de los títulos.
 *
 * Se pueden poner ahí porque el lector busca el renglón de títulos entre los
 * primeros quince y se salta todo lo que haya antes. Así la hoja se explica
 * sola en el momento en que hace falta: cuando está abierta en Excel y no
 * hay nadie al lado a quien preguntarle.
 */
export function ayudaDeLaPlantilla({ conInventario }) {
  const lineas = [
    ['RESTA · La carta de tu negocio'],
    ['Corrige lo que quieras en esta hoja y vuelve a subirla en «La carta → Subir plantilla llena».'],
    ['NO cambies la columna Clave: es como RESTA reconoce cada producto. Para dar de alta uno nuevo, déjala vacía.'],
    ['El Precio va como número: 45 o 45.50. Sin el signo de pesos.'],
    ['Si borras un renglón, RESTA te va a PREGUNTAR si das de baja ese producto. Nunca lo hace solo.'],
  ];

  if (conInventario) {
    lineas.push(
      ['Inventario: escribe Sí para llevarle la cuenta a ese producto, o No para no llevarla.'],
      ['Existencia: cuántos hay AHORA, contados en la Unidad (copas, cervezas). Déjala vacía para no tocar ese producto.'],
      ['Unidad = como lo vendes (copa). Envase = como lo compras (botella). Porciones = cuántas trae un envase (15).'],
    );
  } else {
    lineas.push(
      ['El inventario está apagado, así que sus columnas no se van a aplicar aunque las llenes.'],
      ['Para encenderlo: Configuración → El sistema → Llevar inventario.'],
    );
  }

  lineas.push(['']);
  return lineas;
}

/* ── Bajar ─────────────────────────────────────────────────────────────── */

/**
 * La carta de hoy, renglón por renglón, lista para escribirla en la hoja.
 * Sólo van los productos ACTIVOS: la hoja es «lo que se vende hoy», y un
 * producto dado de baja que reapareciera ahí volvería a la carta sin que
 * nadie lo pidiera.
 */
export function filasDeLaPlantilla() {
  const almacen = new Map(configuracionDeAlmacen().map((p) => [p.id, p]));
  const conInventario = almacenActivo();

  // La clave interna de una familia («bebidas») no le sirve a nadie en una
  // hoja de Excel: va el nombre, que es lo que se lee y lo que se escribe.
  const nombreDeFamilia = new Map(familiasConCuenta().map((f) => [f.clave, f.nombre]));

  return listarProductos({ soloActivos: true })
    .map((p) => {
      const a = almacen.get(p.id);

      return {
        id: p.id,
        icono: p.icono ?? '',
        nombre: p.nombre,
        // El precio se escribe con punto decimal y sin el signo, para que
        // Excel lo trate como número y se pueda sumar la columna.
        precio: (p.precio / 100).toFixed(2),
        familia: nombreDeFamilia.get(p.familia) ?? p.familia,
        submenu: p.opciones ? textoOpciones(p.opciones).replace(/\n/g, ' · ') : '',
        // Con el inventario apagado las columnas van en blanco: enseñar
        // números que no cuentan sólo confunde.
        inventario: !conInventario ? '' : (a?.controla ? 'Sí' : 'No'),
        existencia: !conInventario || !a?.controla ? '' : String(existenciaDe(p.id)),
        unidad: !conInventario || !a?.controla ? '' : (a.unidad ?? ''),
        envase: !conInventario || !a?.controla ? '' : (a.envase ?? ''),
        porciones: !conInventario || !a?.controla ? '' : String(a.porcionesPorEnvase ?? 1),
      };
    });
}

/* ── Subir ─────────────────────────────────────────────────────────────── */

/** «Sí», «si», «x», «1» → true. «No», vacío → false. null si no dice nada. */
function siONo(valor) {
  const t = String(valor ?? '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (t === '') return null;
  if (['si', 'sí', 's', 'x', '1', 'true', 'verdadero'].includes(t)) return true;
  if (['no', 'n', '0', 'false', 'falso'].includes(t)) return false;
  return null;
}

/** Un entero de 0 en adelante, o null si el renglón no trae nada. */
function enteroOptativo(valor) {
  const t = String(valor ?? '').trim();
  if (t === '') return null;
  const n = Number(t.replace(/[^\d-]/g, ''));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Aplica la plantilla completa.
 *
 * Va TODO dentro de una sola transacción: si el renglón 80 truena, la carta
 * queda como estaba. Media carta actualizada y media no sería peor que no
 * haber hecho nada, porque nadie sabría dónde se quedó.
 *
 * @param renglones  [{ id?, nombre, precio (centavos), familia, icono,
 *                      submenu?, inventario?, existencia?, unidad?,
 *                      envase?, porciones? }]
 * @param darDeBaja  ids de productos que la pantalla ya confirmó dar de baja
 */
export function aplicarPlantilla({ renglones, darDeBaja = [], usuario }) {
  if (!Array.isArray(renglones) || renglones.length === 0) {
    throw new Error('Esa hoja no trae ningún producto.');
  }
  if (renglones.length > 2000) {
    throw new Error('Son demasiados renglones de una vez. Pártelo en varios archivos.');
  }

  const conInventario = almacenActivo();

  return enTransaccion(() => {
    const informe = {
      nuevos: 0,
      actualizados: 0,
      sinCambio: 0,
      preciosCambiados: [],
      familiasCreadas: [],
      dadosDeBaja: [],
      inventario: { ajustados: 0, dadosDeAlta: 0, seAplico: conInventario },
      omitidos: [],
    };

    // Las familias que ya hay, por nombre en minúsculas: así «BEBIDAS» del
    // archivo reconoce a «Bebidas» de la base en vez de crear una gemela.
    const porNombre = new Map(
      familiasConCuenta().map((f) => [f.nombre.toLowerCase(), f.clave])
    );

    // La carta se lee UNA vez, no una por renglón: con 137 productos, buscar
    // dentro del bucle son 137 consultas por cada archivo que se sube.
    const todos = listarProductos({ soloActivos: false });
    const almacenAntes = new Map(configuracionDeAlmacen().map((p) => [p.id, p]));

    for (const r of renglones) {
      const nombre = String(r?.nombre ?? '').trim().replace(/\s+/g, ' ');

      try {
        if (!nombre) throw new Error('no trae nombre');

        const precio = Number(r?.precio);
        if (!Number.isInteger(precio) || precio < 0) {
          throw new Error('el precio no se entiende');
        }

        const familia = resolverFamilia(r?.familia, porNombre, informe);

        // ── ¿Cuál producto es? ──
        // Primero por su Clave, que aguanta que lo hayan renombrado. Si no
        // trae clave (renglón nuevo, o archivo ajeno), por nombre y familia.
        const id = enteroOptativo(r?.id);
        let actual = id ? buscarProducto(id) : null;

        if (!actual) {
          actual = todos.find(
            (p) => p.familia === familia && p.nombre.toLowerCase() === nombre.toLowerCase()
          ) ?? null;
        }

        let producto;

        if (actual) {
          const cambioPrecio = actual.precio !== precio;

          producto = editarProducto({
            id: actual.id,
            nombre, precio, familia,
            icono: r?.icono?.trim() || actual.icono,
            // Una celda de submenú vacía NO borra el submenú que ya tenía:
            // los submenús se escriben en la pantalla de configuración, y
            // perderlos por subir una hoja de precios sería un desastre.
            opciones: String(r?.submenu ?? '').trim()
              ? parseOpciones(String(r.submenu).replace(/ · /g, '\n'))
              : undefined,
            activo: true,
          });

          if (cambioPrecio) {
            informe.preciosCambiados.push({
              nombre: producto.nombre,
              antes: formatear(actual.precio),
              ahora: formatear(precio),
            });
            informe.actualizados++;
          } else if (actual.nombre !== nombre || actual.familia !== familia
                     || actual.activo === false) {
            informe.actualizados++;
          } else {
            informe.sinCambio++;
          }
        } else {
          producto = crearProducto({
            nombre, precio, familia,
            icono: r?.icono?.trim() || '🍽️',
            opciones: String(r?.submenu ?? '').trim()
              ? parseOpciones(String(r.submenu).replace(/ · /g, '\n'))
              : null,
          });
          informe.nuevos++;
        }

        if (conInventario) {
          aplicarInventario(r, producto, almacenAntes.get(producto.id), informe, usuario);
        }
      } catch (e) {
        informe.omitidos.push({ nombre: nombre || '(sin nombre)', motivo: e.message });
      }
    }

    // ── Los que ya no vienen en la hoja ──
    // La pantalla ya se los enseñó por nombre y alguien marcó la casilla.
    // Aquí no se decide nada: sólo se ejecuta lo confirmado.
    for (const id of darDeBaja) {
      const p = buscarProducto(Number(id));
      if (!p || !p.activo) continue;
      apagarProducto(p.id);
      informe.dadosDeBaja.push(p.nombre);
    }

    anotarEvento({
      tipo: 'carta.plantilla', usuario,
      detalle: {
        nuevos: informe.nuevos,
        actualizados: informe.actualizados,
        precios: informe.preciosCambiados.length,
        bajas: informe.dadosDeBaja.length,
        inventario: informe.inventario.ajustados,
        omitidos: informe.omitidos.length,
      },
    });

    return informe;
  });
}

/** Encuentra la familia por nombre; si no existe, la crea. */
function resolverFamilia(pedida, porNombre, informe) {
  const limpia = String(pedida ?? '').trim();

  if (!limpia) {
    const primera = porNombre.values().next().value;
    if (!primera) throw new Error('no hay ninguna familia donde ponerlo');
    return primera;
  }

  if (porNombre.has(limpia.toLowerCase())) return porNombre.get(limpia.toLowerCase());

  const nueva = crearFamilia({ nombre: limpia });
  porNombre.set(nueva.nombre.toLowerCase(), nueva.clave);
  informe.familiasCreadas.push(nueva.nombre);
  return nueva.clave;
}

/**
 * Las columnas de inventario de un renglón.
 *
 * Aquí NO se anota ningún movimiento a mano: se llama al mismo conteo de
 * siempre, para que la diferencia quede registrada con su motivo y se pueda
 * contestar después «¿y por qué hay 38?».
 */
function aplicarInventario(r, producto, antes, informe, usuario) {
  const lleva = siONo(r?.inventario);
  const existencia = enteroOptativo(r?.existencia);
  const porciones = enteroOptativo(r?.porciones);
  const unidad = String(r?.unidad ?? '').trim();
  const envase = String(r?.envase ?? '').trim();

  const traeAlgoDeAlmacen = lleva !== null || existencia !== null
    || porciones !== null || unidad || envase;
  if (!traeAlgoDeAlmacen) return;

  // Una michelada gasta de la cerveza: no tiene existencia propia y esa
  // relación se arma en la pantalla del almacén, no en una hoja de Excel.
  if (antes?.gastaDe) return;

  // Poner una existencia es decir «este producto sí se lleva»: nadie cuenta
  // 84 cervezas para después tener que ir a marcar una casilla en otro lado.
  const controla = lleva === null ? (existencia !== null || antes?.controla === true) : lleva;

  configurarProducto({
    id: producto.id,
    controla,
    porcionesPorEnvase: porciones ?? undefined,
    envase: envase || undefined,
    unidad: unidad || undefined,
  });

  if (controla && antes?.controla !== true) informe.inventario.dadosDeAlta++;

  if (controla && existencia !== null) {
    const { cambio } = fijarExistencia({
      productoId: producto.id, contado: existencia,
      motivo: 'Ajuste desde la plantilla', usuario,
    });
    if (cambio) informe.inventario.ajustados++;
  }
}

/**
 * Qué productos activos NO vienen en la hoja.
 *
 * Se calcula ANTES de aplicar nada para poder enseñárselos por nombre a
 * quien va a decidir. Sólo tiene sentido cuando el archivo trae la columna
 * Clave: sin ella no hay forma de saber si es la carta completa o media.
 */
export function losQueFaltan(renglones) {
  const clavesQueVienen = new Set();
  const nombresQueVienen = new Set();

  const enLlano = (s) =>
    String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  for (const r of renglones) {
    const id = enteroOptativo(r?.id);
    if (id) clavesQueVienen.add(id);
    // También por nombre: si alguien pegó renglones nuevos a mano, sin clave,
    // no tienen por qué salir en la lista de bajas. Ante la duda, NO dar de
    // baja: recuperar un producto es un clic, perder la carta es una noche.
    if (r?.nombre) nombresQueVienen.add(enLlano(r.nombre));
  }

  return listarProductos({ soloActivos: true })
    .filter((p) => !clavesQueVienen.has(p.id) && !nombresQueVienen.has(enLlano(p.nombre)))
    .map((p) => ({ id: p.id, nombre: p.nombre, familia: p.familia, precio: p.precio }));
}
