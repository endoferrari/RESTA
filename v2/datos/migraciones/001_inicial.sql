-- ═══════════════════════════════════════════════════════════════════════════
--  MIGRACIÓN 001 · Base inicial
-- ═══════════════════════════════════════════════════════════════════════════
--  Las migraciones se aplican en orden y UNA SOLA VEZ. Nunca se edita una
--  migración ya aplicada: si hay que cambiar algo, se crea la 002.
--  Así la base de la laptop del bar siempre se puede actualizar sin perder datos.
--
--  Todo el dinero en esta base está en CENTAVOS ENTEROS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── Ajustes del negocio ──────────────────────────────────────────────────
-- Tabla llave/valor para todo lo configurable: nombre del negocio, logo,
-- ancho del ticket, mensaje al pie, impresora elegida, etc.
CREATE TABLE ajustes (
  clave       TEXT PRIMARY KEY,
  valor       TEXT NOT NULL,
  actualizado TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);


-- ── Personas que usan el sistema ─────────────────────────────────────────
-- rol:  'admin'  → todo, incluido configurar y ver historial
--       'caja'   → cobrar, descuentos, cortesías, corte, cerrar turno
--       'mesero' → abrir mesas, anotar, mandar comanda. NADA de dinero.
CREATE TABLE usuarios (
  id          INTEGER PRIMARY KEY,
  nombre      TEXT    NOT NULL,
  pin_hash    TEXT    NOT NULL,
  pin_salt    TEXT    NOT NULL,
  rol         TEXT    NOT NULL CHECK (rol IN ('admin','caja','mesero')),
  activo      INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado      TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE UNIQUE INDEX ix_usuarios_nombre ON usuarios(nombre);


-- ── Bitácora de todo lo que pasa (sólo crece, nunca se borra) ────────────
-- Aquí queda escrito quién hizo qué y cuándo. Cuando falte dinero en la
-- caja, este es el lugar donde se va a ver.
CREATE TABLE eventos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  momento     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  usuario_id  INTEGER REFERENCES usuarios(id),
  usuario_nom TEXT,                       -- copia del nombre, por si se borra el usuario
  tipo        TEXT    NOT NULL,           -- 'cuenta.abrir', 'cobro.registrar', ...
  referencia  TEXT,                       -- id de la cuenta / ticket afectado
  detalle     TEXT                        -- JSON con lo que haga falta
);

CREATE INDEX ix_eventos_momento    ON eventos(momento);
CREATE INDEX ix_eventos_tipo       ON eventos(tipo);
CREATE INDEX ix_eventos_referencia ON eventos(referencia);


-- ── Acciones ya procesadas (para no cobrar dos veces) ────────────────────
-- Cada acción que manda una tablet trae un folio único. Si llega repetida
-- (el mesero tocó dos veces, o el WiFi reintentó), devolvemos el resultado
-- guardado en vez de volver a ejecutarla.
CREATE TABLE operaciones (
  folio       TEXT PRIMARY KEY,
  momento     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  ruta        TEXT NOT NULL,
  resultado   TEXT NOT NULL              -- JSON de la respuesta original
);

CREATE INDEX ix_operaciones_momento ON operaciones(momento);


-- ── Valores iniciales ────────────────────────────────────────────────────
INSERT INTO ajustes (clave, valor) VALUES
  ('negocio.nombre',    'ONCE Social Lounge'),
  ('ticket.ancho_mm',   '80'),
  ('ticket.pie',        '¡Gracias por su visita!'),
  ('impresora.modo',    'simulada'),
  ('folio.siguiente',   '1');
