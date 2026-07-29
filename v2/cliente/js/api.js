/**
 * CLIENTE · API
 * ─────────────────────────────────────────────────────────────────────────────
 * El único lugar del cliente que habla con el servidor.
 *
 * Ninguna pantalla usa fetch() directamente. Todas pasan por aquí, para que
 * el manejo de errores, el folio de cada acción y el aviso de "sin conexión"
 * estén escritos una sola vez.
 */

/** Genera el folio único de cada acción, para que nunca se cobre dos veces. */
export function nuevoFolio() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Error que sí sabemos explicar en español. */
export class ErrorRESTA extends Error {
  constructor(mensaje, { codigo = 0, esRed = false } = {}) {
    super(mensaje);
    this.codigo = codigo;
    this.esRed = esRed;
  }
}

async function pedir(metodo, ruta, cuerpo, { folio } = {}) {
  const opciones = {
    method: metodo,
    headers: { 'Accept': 'application/json' },
  };

  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  // El folio va en la cabecera: si esta petición se reintenta, el servidor
  // reconoce que ya la procesó y no la vuelve a ejecutar.
  if (folio) opciones.headers['X-Folio-Operacion'] = folio;

  let respuesta;
  try {
    respuesta = await fetch(ruta, opciones);
  } catch {
    throw new ErrorRESTA('No hay conexión con la caja', { esRed: true });
  }

  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    throw new ErrorRESTA('La caja contestó algo que no entendí', {
      codigo: respuesta.status,
    });
  }

  if (!respuesta.ok) {
    throw new ErrorRESTA(datos?.error || 'Algo salió mal', { codigo: respuesta.status });
  }
  return datos;
}

export const api = {
  obtener: (ruta) => pedir('GET', ruta),
  enviar:  (ruta, cuerpo) => pedir('POST', ruta, cuerpo, { folio: nuevoFolio() }),

  salud:       () => pedir('GET', '/api/salud'),
  diagnostico: () => pedir('GET', '/api/diagnostico'),
  red:         () => pedir('GET', '/api/red'),

  menu:        () => pedir('GET', '/api/menu'),
  ajustes:     () => pedir('GET', '/api/ajustes'),

  /** Sube el respaldo .json de la v1.3.0 para traer la carta y los ajustes. */
  importarRespaldo: (datos) =>
    pedir('POST', '/api/menu/importar', datos, { folio: nuevoFolio() }),
};
