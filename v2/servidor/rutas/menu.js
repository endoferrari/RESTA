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

import { menuCompleto } from '../../datos/repos/productos.js';
import { todosLosAjustes } from '../../datos/repos/ajustes.js';
import { importarV1, resumirImportacion } from '../../datos/importar-v1.js';
import { conFolio } from '../idempotencia.js';
import { avisarATodos } from '../tiempo-real.js';

export function registrarRutasMenu(app) {

  /** La carta completa, como la pinta la pantalla de venta. */
  app.get('/api/menu', async () => ({ ok: true, ...menuCompleto() }));

  /** Los ajustes del negocio (nombre, ticket, impresora). */
  app.get('/api/ajustes', async () => ({ ok: true, ajustes: todosLosAjustes() }));

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
