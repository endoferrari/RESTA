/**
 * NÚCLEO · PERMISOS (quién puede hacer qué)
 * ─────────────────────────────────────────────────────────────────────────────
 * La regla del bar, escrita una sola vez:
 *
 *   · mesero → abre mesas, anota productos y manda la comanda.
 *              NADA de dinero: no cobra, no descuenta, no cancela.
 *   · caja   → todo lo del mesero, MÁS el dinero: cobrar, descuentos,
 *              cortesías, corte del día, cerrar turno.
 *   · admin  → todo, incluido tocar el menú, los usuarios y la configuración.
 *
 * Por qué el mesero no puede tocar dinero: no es desconfianza, es que
 * cuando falte dinero en la caja tiene que haber una lista corta de quién
 * pudo haberlo movido. Si todos pueden todo, no hay a quién preguntarle.
 *
 * Este archivo es cálculo puro: recibe un rol y una acción, devuelve sí o no.
 * El servidor lo consulta antes de cada acción; la pantalla lo consulta para
 * no enseñar botones que de todos modos van a ser rechazados.
 */

/** Lo que puede hacer cada rol. Es la lista completa, no hay reglas escondidas. */
export const PERMISOS = {
  mesero: [
    'cuenta.abrir',
    'cuenta.anotar',
    'cuenta.quitar',        // sólo lo que aún no sale a barra/cocina (lo revisa el servidor)
    'cuenta.comandar',
    'cuenta.ver',
    'menu.ver',
  ],

  caja: [
    'cuenta.abrir',
    'cuenta.anotar',
    'cuenta.quitar',
    'cuenta.comandar',
    'cuenta.ver',
    'menu.ver',
    // ── el dinero ──
    'cuenta.cortesia',
    'cuenta.descuento',
    'cuenta.propina',
    'cuenta.cancelar',
    'cuenta.imprimir',
    'cobro.registrar',
    'corte.ver',
    'turno.cerrar',
    // Destrabar la impresora: reintentar, quitar un trabajo atorado, hacer
    // la tira de prueba. A las 2 de la mañana no hay a quién llamarle, y
    // nada de esto toca dinero ni configuración.
    'impresora.operar',
  ],

  admin: ['*'],             // todo, sin excepciones
};

/**
 * Las acciones que SÓLO puede el administrador.
 *
 * Tienen que estar escritas aquí aunque el admin ya tenga '*', porque la
 * pantalla pregunta «¿qué puedo hacer?» para decidir qué botones enseñar.
 * Sin esta lista, al administrador no le salían ni el botón de Configurar ni
 * el de dar de alta gente: el servidor sí lo dejaba entrar, pero la pantalla
 * nunca le mostraba por dónde.
 */
export const SOLO_ADMIN = [
  'ajustes.cambiar',
  'usuarios.administrar',
  'menu.editar',
];

/** ¿Este rol puede hacer esta acción? */
export function puede(rol, accion) {
  const lista = PERMISOS[rol];
  if (!lista) return false;                 // rol desconocido: no puede nada
  if (lista.includes('*')) return true;
  return lista.includes(accion);
}

/**
 * El motivo, en español, de por qué NO se puede.
 * Se le muestra tal cual a quien esté en la tablet; por eso no dice
 * «403 Forbidden» sino qué hacer.
 */
export function motivoNegado(rol, accion) {
  if (puede(rol, accion)) return null;

  if (!PERMISOS[rol]) return 'Tu sesión no es válida; vuelve a entrar con tu PIN.';

  const dineroDeCaja = [
    'cuenta.cortesia', 'cuenta.descuento', 'cuenta.propina',
    'cuenta.cancelar', 'cobro.registrar',
  ];

  if (rol === 'mesero' && dineroDeCaja.includes(accion)) {
    return 'Eso lo hace la caja. Avísale a quien esté cobrando.';
  }
  if (rol === 'mesero') {
    return 'Los meseros no tienen acceso a esta parte.';
  }
  if (rol === 'caja') {
    return 'Eso lo hace el administrador.';
  }
  return 'No tienes permiso para esta acción.';
}

/** Todo lo que puede hacer un rol. La pantalla lo usa para esconder botones. */
export function permisosDe(rol) {
  const lista = PERMISOS[rol];
  if (!lista) return [];
  if (lista.includes('*')) {
    // Todas las acciones que existen, sin repetir: las de los otros roles
    // MÁS las que sólo el administrador puede hacer.
    return [...new Set([
      ...Object.values(PERMISOS).flat().filter((a) => a !== '*'),
      ...SOLO_ADMIN,
    ])];
  }
  return [...lista];
}

/** Un PIN válido: exactamente 4 dígitos. Ni más, ni menos, ni letras. */
export function pinValido(pin) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}
