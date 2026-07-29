/**
 * CLIENTE · ESTADO DE LA PANTALLA
 * ─────────────────────────────────────────────────────────────────────────────
 * Lo que esta tablet sabe ahora mismo: quién entró, qué puede hacer, la carta
 * y qué mesa está mirando.
 *
 * Ojo: aquí NO se calcula dinero. Los totales vienen ya calculados del
 * servidor (`cuenta.totales`). Esta pantalla sólo los pinta.
 */

export const estado = {
  usuario: null,          // { id, nombre, rol }
  permisos: [],
  hayUsuarios: true,      // false = instalación nueva, hay que crear el admin

  menu: { familias: [], productos: [], total: 0 },
  familiaActiva: null,

  cuentas: [],            // las mesas abiertas
  cuenta: null,           // la mesa que se está mirando
  vista: 'cargando',      // 'pin' · 'primera-vez' · 'mesas' · 'cuenta'

  negocio: 'RESTA',
};

/** ¿El que entró puede hacer esto? La pantalla lo usa para esconder botones. */
export function puede(accion) {
  return estado.permisos.includes(accion);
}

export function esMesero() {
  return estado.usuario?.rol === 'mesero';
}

/** Guarda la carta y deja elegida una familia que sí exista. */
export function ponerMenu(menu) {
  estado.menu = menu;
  if (!menu.familias.some((f) => f.clave === estado.familiaActiva)) {
    estado.familiaActiva = menu.familias[0]?.clave ?? null;
  }
}

export function producto(id) {
  return estado.menu.productos.find((p) => p.id === Number(id)) ?? null;
}
