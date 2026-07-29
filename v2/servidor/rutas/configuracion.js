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

  /** La carta como la ve la venta, para refrescar tras configurar. */
  app.get('/api/menu/completo', async (peticion) => {
    exigir(peticion, 'menu.ver');
    return { ok: true, ...menuCompleto() };
  });
}
