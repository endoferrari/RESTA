-- ═══════════════════════════════════════════════════════════════════════════
--  MIGRACIÓN 005 · Turnos y corte de caja
-- ═══════════════════════════════════════════════════════════════════════════
--  Un turno es «desde que se abrió la caja hasta que se contó el dinero».
--  Normalmente uno por noche, pero si se cambia de cajero a media noche se
--  cierra uno y se abre otro, y cada quien responde por lo suyo.
--
--  Al abrir se anota el FONDO: el dinero que se deja en el cajón para dar
--  cambio. Sin eso, al final no hay contra qué comparar lo que se contó.
-- ═══════════════════════════════════════════════════════════════════════════


CREATE TABLE turnos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha         TEXT    NOT NULL,               -- AAAA-MM-DD de la apertura

  abierto       TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  abierto_por   INTEGER REFERENCES usuarios(id),
  abierto_nom   TEXT,
  fondo         INTEGER NOT NULL DEFAULT 0 CHECK (fondo >= 0),   -- CENTAVOS

  cerrado       TEXT,
  cerrado_por   INTEGER REFERENCES usuarios(id),
  cerrado_nom   TEXT,

  -- Lo que de verdad había en el cajón al contarlo, y la diferencia contra
  -- lo que debería haber. Se guardan los dos: la diferencia calculada hoy
  -- tiene que seguir diciendo lo mismo dentro de un año.
  efectivo_contado INTEGER,
  diferencia       INTEGER,
  notas            TEXT
);

CREATE INDEX ix_turnos_fecha ON turnos(fecha);

-- No puede haber DOS turnos abiertos al mismo tiempo.
-- El truco de indexar la expresión `(cerrado IS NULL)`: para los turnos
-- abiertos siempre vale 1, así que el índice único sólo deja pasar uno.
-- (Un índice sobre `cerrado` no serviría: en SQLite los NULL se consideran
--  distintos entre sí y dejarían pasar varios.)
CREATE UNIQUE INDEX ix_turno_abierto ON turnos((cerrado IS NULL)) WHERE cerrado IS NULL;


-- ── A qué turno pertenece cada ticket ────────────────────────────────────
-- Se guarda al cobrar. Podría deducirse comparando horas, pero un turno que
-- cruza la medianoche —que es lo normal en un bar— haría de eso un lío.
ALTER TABLE tickets ADD COLUMN turno_id INTEGER REFERENCES turnos(id);

CREATE INDEX ix_tickets_turno ON tickets(turno_id);


-- ── Ajustes que estrena esta migración ───────────────────────────────────
INSERT INTO ajustes (clave, valor) VALUES
  ('turno.fondo_sugerido', '100000'),      -- $1,000, lo que se suele dejar
  ('respaldo.dias_a_guardar', '30');
