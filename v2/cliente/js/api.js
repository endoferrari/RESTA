/**
 * CLIENTE · API
 * ─────────────────────────────────────────────────────────────────────────────
 * El único lugar del cliente que habla con el servidor.
 *
 * Ninguna pantalla usa fetch() directamente. Todas pasan por aquí, para que
 * el manejo de errores, el folio de cada acción, el pase de la sesión y el
 * aviso de "sin conexión" estén escritos una sola vez.
 */

/** Genera el folio único de cada acción, para que nunca se cobre dos veces. */
export function nuevoFolio() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/* ── El pase de la sesión ──────────────────────────────────────────────── */
/* Se guarda en el navegador de la tablet para que el mesero no tenga que
   teclear su PIN cada vez que se recarga la pantalla. Al salir, se borra. */

const LLAVE_PASE = 'resta_pase';

export function paseGuardado() {
  try { return localStorage.getItem(LLAVE_PASE); } catch { return null; }
}

export function guardarPase(pase) {
  try {
    if (pase) localStorage.setItem(LLAVE_PASE, pase);
    else localStorage.removeItem(LLAVE_PASE);
  } catch { /* si el navegador no deja guardar, se pide el PIN otra vez */ }
}

/** Error que sí sabemos explicar en español. */
export class ErrorRESTA extends Error {
  constructor(mensaje, { codigo = 0, esRed = false, cuenta = null } = {}) {
    super(mensaje);
    this.codigo = codigo;
    this.esRed = esRed;
    // En un choque entre dos meseros, el servidor manda la cuenta como está
    // AHORA, para que la pantalla se corrija sola.
    this.cuenta = cuenta;
  }
}

/** Aviso de "tu sesión ya no sirve": la app lo escucha para pedir el PIN. */
function sesionCaida() {
  guardarPase(null);
  globalThis.dispatchEvent(new CustomEvent('resta:sesion-caida'));
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

  const pase = paseGuardado();
  if (pase) opciones.headers['X-Pase'] = pase;

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
    if (respuesta.status === 401) sesionCaida();
    throw new ErrorRESTA(datos?.error || 'Algo salió mal', {
      codigo: respuesta.status,
      cuenta: datos?.cuenta ?? null,
    });
  }
  return datos;
}

const conFolio = (metodo, ruta, cuerpo) =>
  pedir(metodo, ruta, cuerpo, { folio: nuevoFolio() });

export const api = {
  obtener: (ruta) => pedir('GET', ruta),
  enviar:  (ruta, cuerpo) => conFolio('POST', ruta, cuerpo),

  /* ── Estado del sistema ── */
  salud:       () => pedir('GET', '/api/salud'),
  diagnostico: () => pedir('GET', '/api/diagnostico'),
  red:         () => pedir('GET', '/api/red'),

  /* ── Menú ── */
  menu:    () => pedir('GET', '/api/menu'),
  ajustes: () => pedir('GET', '/api/ajustes'),
  importarRespaldo: (datos) => conFolio('POST', '/api/menu/importar', datos),

  /** Petición especial del cliente: queda guardada como opción del producto. */
  agregarOpcion: (productoId, grupo, opcion) =>
    conFolio('POST', `/api/menu/productos/${productoId}/opciones`, { grupo, opcion }),

  /* ── Sesión ── */
  quienSoy:     () => pedir('GET', '/api/sesion'),
  entrar:       (pin) => pedir('POST', '/api/sesion', { pin }),
  salir:        () => pedir('DELETE', '/api/sesion'),
  crearPrimero: (nombre, pin) => pedir('POST', '/api/usuarios/primero', { nombre, pin }),

  /* ── Usuarios ── */
  usuarios:     () => pedir('GET', '/api/usuarios'),
  crearUsuario: (nombre, pin, rol) => conFolio('POST', '/api/usuarios', { nombre, pin, rol }),
  cambiarPin:   (id, pin) => conFolio('POST', `/api/usuarios/${id}/pin`, { pin }),
  darDeBaja:    (id) => pedir('DELETE', `/api/usuarios/${id}`),

  /* ── Cuentas ── */
  cuentas:     () => pedir('GET', '/api/cuentas'),
  cuenta:      (id) => pedir('GET', `/api/cuentas/${id}`),
  abrirCuenta: (nombre) => conFolio('POST', '/api/cuentas', { nombre }),

  anotar: (cuentaId, productoId, detalle = '', cant = 1) =>
    conFolio('POST', `/api/cuentas/${cuentaId}/lineas`, { productoId, detalle, cant }),

  quitar: (cuentaId, lineaId, { cant = null, motivo = null, version } = {}) =>
    conFolio('DELETE', `/api/cuentas/${cuentaId}/lineas/${lineaId}`, { cant, motivo, version }),

  comandar: (cuentaId) => conFolio('POST', `/api/cuentas/${cuentaId}/comanda`),
  pedirCuenta: (cuentaId) => conFolio('POST', `/api/cuentas/${cuentaId}/imprimir`),

  cancelarCuenta: (cuentaId, motivo, version) =>
    conFolio('POST', `/api/cuentas/${cuentaId}/cancelar`, { motivo, version }),

  /* ── Dinero (sólo caja) ── */
  cortesia: (cuentaId, lineaId, esCortesia, motivo, version) =>
    conFolio('POST', `/api/cuentas/${cuentaId}/cortesia`,
      { lineaId, esCortesia, motivo, version }),

  descuento: (cuentaId, tipo, valor, motivo, version) =>
    conFolio('POST', `/api/cuentas/${cuentaId}/descuento`, { tipo, valor, motivo, version }),

  propina: (cuentaId, tipo, valor, version) =>
    conFolio('POST', `/api/cuentas/${cuentaId}/propina`, { tipo, valor, version }),

  dividir: (cuentaId, personas) =>
    pedir('GET', `/api/cuentas/${cuentaId}/dividir?personas=${personas}`),

  /**
   * Cobrar. La pantalla NUNCA manda el total: manda cómo paga y, si acaso,
   * cuánto o qué renglones. El servidor calcula el resto.
   */
  cobrar: (cuentaId, { metodo, monto = null, recibido = null, lineas = null,
                       referencia = null, version } = {}) =>
    conFolio('POST', `/api/cuentas/${cuentaId}/cobrar`,
      { metodo, monto, recibido, lineas, referencia, version }),

  anularPago: (cuentaId, motivo, version) =>
    conFolio('POST', `/api/cuentas/${cuentaId}/anular-pago`, { motivo, version }),

  ticket: (folio) => pedir('GET', `/api/tickets/${folio}`),
  reimprimir: (folio) => conFolio('POST', `/api/tickets/${folio}/reimprimir`),

  /* ── Impresora ── */
  impresion:            () => pedir('GET', '/api/impresion'),
  impresorasDeWindows:  () => pedir('GET', '/api/impresion/impresoras'),
  guardarImpresora:     (config) => pedir('PUT', '/api/impresion', config),
  pruebaDeImpresion:    () => conFolio('POST', '/api/impresion/prueba'),
  guardarLogoTicket:    (raster) => pedir('PUT', '/api/impresion/logo', { raster }),
  reintentarImpresion:  () => pedir('POST', '/api/impresion/reintentar'),
  cancelarImpresion:    (id) => pedir('DELETE', `/api/impresion/cola/${id}`),
  vaciarColaImpresion:  () => pedir('DELETE', '/api/impresion/cola'),

  /* ── Turno y corte ── */
  turno:       () => pedir('GET', '/api/turno'),
  abrirTurno:  (fondo) => conFolio('POST', '/api/turno', { fondo }),
  corte:       (turnoId = null) =>
    pedir('GET', '/api/corte' + (turnoId ? `?turno=${turnoId}` : '')),
  cerrarTurno: (efectivoContado, notas) =>
    conFolio('POST', '/api/turno/cerrar', { efectivoContado, notas }),
  turnos:      () => pedir('GET', '/api/turnos'),
  imprimirCorte: (turnoId) => conFolio('POST', `/api/turno/${turnoId}/imprimir`),

  /* ── Configurar la carta ── */
  familias:       () => pedir('GET', '/api/familias'),
  crearFamilia:   (nombre, emoji) => conFolio('POST', '/api/familias', { nombre, emoji }),
  editarFamilia:  (clave, cambios) => pedir('PUT', `/api/familias/${encodeURIComponent(clave)}`, cambios),
  moverFamilia:   (clave, haciaArriba) =>
    pedir('POST', `/api/familias/${encodeURIComponent(clave)}/mover`, { haciaArriba }),

  productos:      () => pedir('GET', '/api/productos'),
  crearProducto:  (p) => conFolio('POST', '/api/productos', p),
  editarProducto: (id, p) => pedir('PUT', `/api/productos/${id}`, p),
  darDeBajaProducto: (id) => pedir('DELETE', `/api/productos/${id}`),
  activarProducto:   (id) => conFolio('POST', `/api/productos/${id}/activar`),
  importarProductos: (renglones) => conFolio('POST', '/api/productos/importar', { renglones }),

  /* ── Almacén ── */
  almacen:      (dias = null) => pedir('GET', '/api/almacen' + (dias ? `?dias=${dias}` : '')),
  queComprar:   (dias = null) => pedir('GET', '/api/almacen/compras' + (dias ? `?dias=${dias}` : '')),
  diasACubrir:  (dias) => pedir('PUT', '/api/almacen/dias', { dias }),

  registrarCompra: (compras) => conFolio('POST', '/api/almacen/compras', { compras }),
  registrarMerma:  (productoId, porciones, motivo) =>
    conFolio('POST', '/api/almacen/merma', { productoId, porciones, motivo }),
  registrarConteo: (conteos) => conFolio('POST', '/api/almacen/conteo', { conteos }),

  movimientosDe:      (id) => pedir('GET', `/api/almacen/productos/${id}/movimientos`),
  vendidoHoy:         () => pedir('GET', '/api/almacen/vendido'),
  configAlmacen:      () => pedir('GET', '/api/almacen/configuracion'),
  guardarConfigAlmacen: (id, cambios) => pedir('PUT', `/api/almacen/configuracion/${id}`, cambios),

  /* ── Respaldos ── */
  respaldos:      () => pedir('GET', '/api/respaldos'),
  respaldarAhora: () => conFolio('POST', '/api/respaldos'),
};
