/**
 * SERVIDOR · RUTAS DE CONFIGURACIÓN DE LA CARTA
 * ─────────────────────────────────────────────────────────────────────────────
 * Dar de alta familias y productos. Todo esto es del administrador.
 *
 * Una regla que atraviesa todo el archivo: **un producto no se borra, se da
 * de baja**. Si se borrara, los tickets de hace tres meses quedarían
 * apuntando a la nada y el corte de ese día dejaría de cuadrar. Al darlo de
 * baja desaparece de la pantalla de venta y ya no se puede anotar, pero
 * sigue existiendo para la historia.
 */

import {
  familiasConCuenta, crearFamilia, editarFamilia, moverFamilia,
  listarProductos, buscarProducto, crearProducto, editarProducto,
  apagarProducto, encenderProducto, menuCompleto,
} from '../../datos/repos/productos.js';
import {
  COLUMNAS, ayudaDeLaPlantilla, filasDeLaPlantilla, aplicarPlantilla, losQueFaltan,
} from '../../datos/plantilla-carta.js';
import { almacenActivo, estadoDelAlmacen } from '../../datos/repos/almacen.js';
import { leerAjuste } from '../../datos/repos/ajustes.js';
import { parseOpciones, textoOpciones } from '../../nucleo/opciones.js';
import { anotarEvento } from '../../datos/repos/eventos.js';
import { exigir } from '../auth.js';
import { conFolio } from '../idempotencia.js';
import { avisarATodos } from '../tiempo-real.js';

function alto(mensaje, codigo = 400) {
  const e = new Error(mensaje);
  e.statusCode = codigo;
  return e;
}

/** Avisa a todas las pantallas que la carta cambió. */
function avisarCarta() {
  avisarATodos('menu.cambio', {});
}

/**
 * El submenú viaja como TEXTO desde la pantalla —«Marca: Sol, Indio»— y aquí
 * se convierte. Se manda de vuelta también como texto para que la pantalla
 * de edición lo vuelva a mostrar tal como se escribió.
 */
function conTextoDeOpciones(p) {
  return { ...p, opcionesTexto: p.opciones ? textoOpciones(p.opciones) : '' };
}

export function registrarRutasConfiguracion(app) {

  /* ── Familias ────────────────────────────────────────────────────────── */

  app.get('/api/familias', async (peticion) => {
    exigir(peticion, 'ajustes.cambiar');
    return { ok: true, familias: familiasConCuenta() };
  });

  app.post('/api/familias', async (peticion) => {
    const usuario = exigir(peticion, 'ajustes.cambiar');
    const { nombre, emoji } = peticion.body ?? {};

    const familia = conFolio(peticion, '/api/familias', () => crearFamilia({ nombre, emoji }));

    anotarEvento({ tipo: 'familia.crear', referencia: `familia:${familia.clave}`, usuario,
      detalle: { nombre: familia.nombre } });
    avisarCarta();

    return { ok: true, familia, familias: familiasConCuenta() };
  });

  app.put('/api/familias/:clave', async (peticion) => {
    const usuario = exigir(peticion, 'ajustes.cambiar');
    const { nombre, emoji, activa } = peticion.body ?? {};

    const familia = editarFamilia({ clave: peticion.params.clave, nombre, emoji, activa });

    anotarEvento({ tipo: 'familia.editar', referencia: `familia:${peticion.params.clave}`, usuario,
      detalle: { nombre, emoji, activa } });
    avisarCarta();

    return { ok: true, familia, familias: familiasConCuenta() };
  });

  app.post('/api/familias/:clave/mover', async (peticion) => {
    exigir(peticion, 'ajustes.cambiar');
    const { haciaArriba = true } = peticion.body ?? {};

    const familias = moverFamilia({ clave: peticion.params.clave, haciaArriba });
    avisarCarta();

    return { ok: true, familias };
  });

  /* ── Productos ───────────────────────────────────────────────────────── */

  /** La lista para configurar: incluye los dados de baja. */
  app.get('/api/productos', async (peticion) => {
    exigir(peticion, 'ajustes.cambiar');
    return {
      ok: true,
      familias: familiasConCuenta(),
      productos: listarProductos({ soloActivos: false }).map(conTextoDeOpciones),
    };
  });

  app.post('/api/productos', async (peticion) => {
    const usuario = exigir(peticion, 'ajustes.cambiar');
    const { nombre, precio, familia, icono, opcionesTexto } = peticion.body ?? {};

    if (!Number.isInteger(precio)) {
      throw alto('El precio tiene que llegar en centavos enteros.');
    }

    const producto = conFolio(peticion, '/api/productos', () =>
      crearProducto({
        nombre, precio, familia, icono,
        opciones: parseOpciones(opcionesTexto),
      }));

    anotarEvento({ tipo: 'producto.crear', referencia: `producto:${producto.id}`, usuario,
      detalle: { nombre: producto.nombre, precio: producto.precio, familia: producto.familia } });
    avisarCarta();

    return { ok: true, producto: conTextoDeOpciones(producto) };
  });

  app.put('/api/productos/:id', async (peticion) => {
    const usuario = exigir(peticion, 'ajustes.cambiar');
    const id = Number(peticion.params.id);
    const { nombre, precio, familia, icono, opcionesTexto, activo } = peticion.body ?? {};

    const antes = buscarProducto(id);
    if (!antes) throw alto('Ese producto ya no existe.', 404);

    if (precio !== undefined && !Number.isInteger(precio)) {
      throw alto('El precio tiene que llegar en centavos enteros.');
    }

    const producto = editarProducto({
      id, nombre, precio, familia, icono, activo,
      opciones: opcionesTexto === undefined ? undefined : parseOpciones(opcionesTexto),
    });

    // Un cambio de precio se anota aparte: es el dato que se busca cuando
    // alguien pregunta «¿por qué esta cuenta salió distinta a la de ayer?».
    if (precio !== undefined && precio !== antes.precio) {
      anotarEvento({ tipo: 'producto.precio', referencia: `producto:${id}`, usuario,
        detalle: { nombre: producto.nombre, antes: antes.precio, ahora: producto.precio } });
    }

    anotarEvento({ tipo: 'producto.editar', referencia: `producto:${id}`, usuario,
      detalle: { nombre: producto.nombre } });
    avisarCarta();

    return { ok: true, producto: conTextoDeOpciones(producto) };
  });

  /**
   * Dar de baja. NO borra.
   * El producto desaparece de la pantalla de venta, pero los tickets y las
   * cuentas de antes siguen enteros.
   */
  app.delete('/api/productos/:id', async (peticion) => {
    const usuario = exigir(peticion, 'ajustes.cambiar');
    const id = Number(peticion.params.id);

    const p = buscarProducto(id);
    if (!p) throw alto('Ese producto ya no existe.', 404);

    apagarProducto(id);
    anotarEvento({ tipo: 'producto.baja', referencia: `producto:${id}`, usuario,
      detalle: { nombre: p.nombre, familia: p.familia } });
    avisarCarta();

    return { ok: true, producto: conTextoDeOpciones(buscarProducto(id)) };
  });

  /** Volver a ponerlo en la carta. */
  app.post('/api/productos/:id/activar', async (peticion) => {
    const usuario = exigir(peticion, 'ajustes.cambiar');
    const id = Number(peticion.params.id);

    if (!buscarProducto(id)) throw alto('Ese producto ya no existe.', 404);

    const producto = encenderProducto(id);
    anotarEvento({ tipo: 'producto.alta', referencia: `producto:${id}`, usuario,
      detalle: { nombre: producto.nombre } });
    avisarCarta();

    return { ok: true, producto: conTextoDeOpciones(producto) };
  });

  /**
   * IMPORTAR PRODUCTOS de una lista (CSV o Excel).
   *
   * El archivo lo lee y lo entiende la PANTALLA; aquí llegan ya renglones
   * limpios. Se hace así porque leer un Excel es descomprimirlo y el
   * navegador ya sabe hacerlo, mientras que el servidor tendría que aprender.
   *
   * Un renglón malo NO detiene la importación: se salta y se reporta por
   * nombre, igual que en el importador del respaldo de la v1.
   */
  app.post('/api/productos/importar', async (peticion) => {
    const usuario = exigir(peticion, 'ajustes.cambiar');
    const { renglones, crearFamiliasNuevas = true } = peticion.body ?? {};

    if (!Array.isArray(renglones) || renglones.length === 0) {
      throw alto('No llegó ningún producto que importar.');
    }
    if (renglones.length > 2000) {
      throw alto('Son demasiados renglones de una vez. Pártelo en varios archivos.');
    }

    const informe = { nuevos: 0, actualizados: 0, familiasCreadas: [], omitidos: [] };

    // Las familias que ya hay, por nombre en minúsculas, para reconocerlas
    // aunque en el archivo vengan escritas de otra forma.
    const porNombre = new Map(
      familiasConCuenta().map((f) => [f.nombre.toLowerCase(), f.clave])
    );

    for (const r of renglones) {
      const nombre = String(r?.nombre ?? '').trim();

      try {
        if (!nombre) throw new Error('no trae nombre');

        const precio = Number(r?.precio);
        if (!Number.isInteger(precio)) throw new Error('el precio no se entiende');

        // La familia: se busca por nombre y, si no está, se crea.
        const pedida = String(r?.familia ?? '').trim();
        let familia;

        if (!pedida) {
          familia = porNombre.values().next().value;
          if (!familia) throw new Error('no hay ninguna familia donde ponerlo');
        } else if (porNombre.has(pedida.toLowerCase())) {
          familia = porNombre.get(pedida.toLowerCase());
        } else if (crearFamiliasNuevas) {
          const nueva = crearFamilia({ nombre: pedida });
          porNombre.set(nueva.nombre.toLowerCase(), nueva.clave);
          informe.familiasCreadas.push(nueva.nombre);
          familia = nueva.clave;
        } else {
          throw new Error(`la familia «${pedida}» no existe`);
        }

        const opciones = r?.submenu ? parseOpciones(r.submenu) : null;
        const yaEstaba = listarProductos({ soloActivos: false })
          .find((p) => p.familia === familia && p.nombre.toLowerCase() === nombre.toLowerCase());

        if (yaEstaba) {
          editarProducto({
            id: yaEstaba.id, nombre, precio, familia,
            icono: r?.icono || yaEstaba.icono,
            opciones: opciones ?? undefined,
            activo: true,
          });
          informe.actualizados++;
        } else {
          crearProducto({ nombre, precio, familia, icono: r?.icono || '🍽️', opciones });
          informe.nuevos++;
        }
      } catch (e) {
        informe.omitidos.push({ nombre: nombre || '(sin nombre)', motivo: e.message });
      }
    }

    anotarEvento({
      tipo: 'productos.importar', usuario,
      detalle: {
        nuevos: informe.nuevos, actualizados: informe.actualizados,
        omitidos: informe.omitidos.length, familias: informe.familiasCreadas,
      },
    });
    avisarCarta();

    return { ok: true, informe, menu: menuCompleto() };
  });

  /* ── La plantilla de la carta ────────────────────────────────────────── */

  /**
   * BAJAR LA PLANTILLA: la carta de hoy, lista para abrirla en Excel.
   *
   * El archivo lo ARMA la pantalla, no el servidor. Es el mismo reparto que
   * en el importador: el navegador ya sabe comprimir y escribir un .xlsx, y
   * así el archivo se baja directo a la carpeta de Descargas de quien lo
   * pidió, aunque esté en una tablet del otro lado del bar.
   */
  app.get('/api/carta/plantilla', async (peticion) => {
    exigir(peticion, 'ajustes.cambiar');

    return {
      ok: true,
      columnas: COLUMNAS,
      ayuda: ayudaDeLaPlantilla({ conInventario: almacenActivo() }),
      filas: filasDeLaPlantilla(),
      conInventario: almacenActivo(),
      negocio: leerAjuste('negocio.nombre', 'RESTA'),
    };
  });

  /**
   * REVISAR ANTES DE APLICAR: qué productos activos no vienen en la hoja.
   *
   * Va en una llamada aparte, y a propósito: dar de baja media carta por
   * subir un archivo incompleto es el peor accidente posible de esta
   * pantalla. Primero se enseñan por nombre, alguien los ve, y sólo entonces
   * la siguiente llamada ejecuta lo confirmado.
   */
  app.post('/api/carta/plantilla/revisar', async (peticion) => {
    exigir(peticion, 'ajustes.cambiar');
    const { renglones } = peticion.body ?? {};

    if (!Array.isArray(renglones) || renglones.length === 0) {
      throw alto('Esa hoja no trae ningún producto.');
    }

    return { ok: true, faltan: losQueFaltan(renglones), almacen: estadoDelAlmacen() };
  });

  /** APLICAR la plantilla. Todo o nada: si algo truena, la carta no se toca. */
  app.post('/api/carta/plantilla', { bodyLimit: 4 * 1024 * 1024 }, async (peticion) => {
    const usuario = exigir(peticion, 'ajustes.cambiar');
    const { renglones, darDeBaja = [] } = peticion.body ?? {};

    if (!Array.isArray(darDeBaja)) throw alto('La lista de bajas no llegó bien.');

    const informe = conFolio(peticion, '/api/carta/plantilla', () =>
      aplicarPlantilla({ renglones, darDeBaja, usuario }));

    avisarCarta();
    if (informe.inventario.ajustados || informe.inventario.dadosDeAlta) {
      avisarATodos('almacen.cambio', {});
    }

    return { ok: true, informe, menu: menuCompleto() };
  });

  /** La carta como la ve la venta, para refrescar tras configurar. */
  app.get('/api/menu/completo', async (peticion) => {
    exigir(peticion, 'menu.ver');
    return { ok: true, ...menuCompleto() };
  });
}
