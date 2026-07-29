-- ═══════════════════════════════════════════════════════════════════════════
--  MIGRACIÓN 003 · Cuentas en vivo, líneas y sesiones de mesero
-- ═══════════════════════════════════════════════════════════════════════════
--  Una "cuenta" es una mesa abierta: «Mesa 4», «Barra 2», «Sr. López».
--  Igual que en la v1: no hay una lista fija de mesas, se abre escribiendo
--  el número o el nombre. Si el bar pone mesas nuevas en la terraza un
--  sábado, no hay que configurar nada.
--
--  Nada se borra: una cuenta cancelada queda marcada como cancelada, con su
--  motivo y su responsable. Una línea quitada queda registrada en `eventos`.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── Cuentas ──────────────────────────────────────────────────────────────
-- `version` sube en CADA cambio. Es el bloqueo optimista: si Ana y Luis
-- abren la Mesa 7 a la vez y ambos anotan, el segundo manda la versión que
-- él tenía, el servidor ve que ya cambió y le contesta "esta cuenta cambió,
-- mira lo nuevo" en vez de pisar la comanda del otro.
CREATE TABLE cuentas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT    NOT NULL,
  nombre_clave  TEXT    NOT NULL,          -- el nombre sin acentos ni mayúsculas
  estado        TEXT    NOT NULL DEFAULT 'abierta'
                        CHECK (estado IN ('abierta','cobrada','cancelada')),
  version       INTEGER NOT NULL DEFAULT 1,

  -- Quién la abrió (copia del nombre por si el usuario se da de baja)
  abierta_por   INTEGER REFERENCES usuarios(id),
  abierta_nom   TEXT,

  fecha         TEXT    NOT NULL,          -- AAAA-MM-DD, para el corte del día
  creada        TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  cerrada       TEXT,
  motivo        TEXT,                      -- por qué se canceló

  -- Descuento y propina de la cuenta completa (los aplica caja, no el mesero)
  descuento_tipo  TEXT CHECK (descuento_tipo IN ('porcentaje','monto')),
  descuento_valor INTEGER NOT NULL DEFAULT 0,
  propina_tipo    TEXT CHECK (propina_tipo IN ('porcentaje','monto')),
  propina_valor   INTEGER NOT NULL DEFAULT 0,

  -- Cuándo se imprimió la cuenta para el cliente (la pidió, aún no paga)
  cuenta_impresa  TEXT
);

-- No puede haber DOS «Mesa 4» abiertas al mismo tiempo: si Ana y Luis la
-- abren a la vez, el segundo cae en la cuenta que ya existe. Las cuentas ya
-- cobradas sí pueden repetir nombre (la Mesa 4 se usa muchas veces al día).
CREATE UNIQUE INDEX ix_cuentas_abierta
  ON cuentas(nombre_clave) WHERE estado = 'abierta';

CREATE INDEX ix_cuentas_estado ON cuentas(estado);
CREATE INDEX ix_cuentas_fecha  ON cuentas(fecha);


-- ── Líneas de la cuenta (lo que se anotó) ────────────────────────────────
-- `precio` se copia al momento de anotar y YA NO CAMBIA. Si a media noche
-- se sube el precio de la cerveza, las cuentas abiertas conservan el precio
-- que tenían cuando se anotaron. Esto ya lo hacía bien la v1.
--
-- `nombre` e `icono` también son copias, por lo mismo: el ticket de hace
-- tres meses debe poder reimprimirse igualito aunque el producto ya no exista.
CREATE TABLE lineas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  cuenta_id       INTEGER NOT NULL REFERENCES cuentas(id),
  producto_id     INTEGER REFERENCES productos(id),

  nombre          TEXT    NOT NULL,
  icono           TEXT    NOT NULL DEFAULT '',
  familia         TEXT,
  detalle         TEXT    NOT NULL DEFAULT '',   -- «Puesto · Coca · Con hielo»
  precio          INTEGER NOT NULL CHECK (precio >= 0),
  cant            INTEGER NOT NULL CHECK (cant > 0),

  -- Cortesía: se anota, se ve y se imprime, pero no se cobra.
  cortesia        INTEGER NOT NULL DEFAULT 0 CHECK (cortesia IN (0,1)),
  cortesia_motivo TEXT,

  pagado          INTEGER NOT NULL DEFAULT 0 CHECK (pagado IN (0,1)),

  -- Cuántas piezas de esta línea YA salieron a barra/cocina. Lo que todavía
  -- no sale se muestra aparte, en la sección NUEVO, hasta que se mande.
  comandada_cant  INTEGER NOT NULL DEFAULT 0,

  anotada_por     INTEGER REFERENCES usuarios(id),
  anotada_nom     TEXT,
  creada          TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX ix_lineas_cuenta ON lineas(cuenta_id);


-- ── Sesiones (quién está usando cada tablet ahora mismo) ─────────────────
-- Al entrar con su PIN, la tablet recibe un pase. Ese pase viaja en cada
-- petición, para que quede escrito quién anotó cada cosa.
CREATE TABLE sesiones (
  token       TEXT PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  desde       TEXT,                        -- IP de la tablet, para diagnóstico
  creada      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  ultimo_uso  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX ix_sesiones_usuario ON sesiones(usuario_id);
