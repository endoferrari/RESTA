/**
 * SERVIDOR · RUTAS DEL MENÚ
 * ─────────────────────────────────────────────────────────────────────────────
 * La carta: familias y productos.
 *
 * Ojo con una cosa: aquí se manda el precio de cada producto a la pantalla,
 * pero eso es SÓLO para pintarlo. Cuando el mesero anote una cerveza, la
 * tablet manda «producto 37, mesa 4» y el servidor vuelve a buscar el precio
 * en la base. Una tablet con el menú viejo en memoria no puede cobrar mal.
 */

import { menuCompleto, agregarOpcion } from '../../datos/repos/productos.js';
import { todosLosAjustes } from '../../datos/repos/ajustes.js';
import { importarV1, resumirImportacion } from '../../datos/importar-v1.js';
import { conFolio } from '../idempotencia.js';
import { avisarATodos } from '../tiempo-real.js';
import { exigir } from '../auth.js';
import { anotarEvento } from '../../datos/repos/eventos.js';

/**
 * Lo único que se enseña ANTES de entrar con PIN.
 *
 * La pantalla del PIN necesita el nombre del bar para ponerlo en el título,
 * y nada más. Todo lo demás —la dirección de la impresora, la configuración—
 * sólo lo ve quien ya entró. Una tablet ajena conectada al WiFi no tiene por
 * qué poder leer cómo está armado el sistema.
 */
const AJUSTES_PUBLICOS = ['negocio.nombre'];

export function registrarRutasMenu(app) {

  /** La carta completa, como la pinta la pantalla de venta. */
  app.get('/api/menu', async (peticion) => {
    exigir(peticion, 'menu.ver');
    return { ok: true, ...menuCompleto() };
  });

  /**
   * Una petición especial del cliente, que queda guardada.
   *
   * La puede hacer un MESERO a propósito: es él quien está en la mesa
   * oyendo «me lo pones con poco hielo». Si tuviera que pedirle permiso a
   * alguien, nunca se anotaría y el menú no aprendería nada.
   *
   * Sólo AGREGA una opción a una pregunta que ya existe. No toca precios ni
   * crea productos: eso sigue siendo del administrador.
   */
  app.post('/api/menu/productos/:id/opciones', async (peticion) => {
    const usuario = exigir(peticion, 'cuenta.anotar');
    const { grupo, opcion } = peticion.body ?? {};

    const r = conFolio(peticion, '/api/menu/productos/:id/opciones', () =>
      agregarOpcion({ productoId: Number(peticion.params.id), grupo, opcion }));

    if (r.esNueva) {
      anotarEvento({
        tipo: 'menu.opcion.agregar', referencia: `producto:${peticion.params.id}`, usuario,
        detalle: { producto: r.producto.nombre, grupo, opcion: r.opcion },
      });
      avisarATodos('menu.cambio', { productoId: r.producto.id });
    }

    return { ok: true, ...r };
  });

  /** Los ajustes. Sin entrar, sólo se ve el nombre del negocio. */
  app.get('/api/ajustes', async (peticion) => {
    const todos = todosLosAjustes();

    let usuario = null;
    try { usuario = exigir(peticion, 'menu.ver'); } catch { /* sin sesión */ }

    if (usuario) return { ok: true, ajustes: todos };

    return {
      ok: true,
      ajustes: Object.fromEntries(
        AJUSTES_PUBLICOS.filter((c) => c in todos).map((c) => [c, todos[c]])
      ),
    };
  });

  /**
   * Importar el respaldo .json de la v1.3.0.
   *
   * El límite de tamaño es mucho mayor que el del resto del servidor: un
   * respaldo con meses de tickets y el logo adentro pesa varios MB, mientras
   * que un pedido normal no llega ni a 1 KB.
   */
  app.post('/api/menu/importar', {
    bodyLimit: 32 * 1024 * 1024,
  }, async (peticion) => {
    // Esto REESCRIBE todos los precios de la carta. Sólo el administrador.
    // Sin esta línea, cualquiera conectado al WiFi del bar —sin siquiera
    // entrar con PIN— podía dejar toda la carta en un centavo.
    exigir(peticion, 'ajustes.cambiar');

    const datos = peticion.body;

    const informe = conFolio(peticion, '/api/menu/importar', () => importarV1(datos));

    // Todas las pantallas abiertas se enteran de que cambió la carta.
    avisarATodos('menu.cambio', { total: informe.productos.nuevos + informe.productos.actualizados });

    return {
      ok: true,
      informe,
      resumen: resumirImportacion(informe),
      menu: menuCompleto(),
    };
  });
}
