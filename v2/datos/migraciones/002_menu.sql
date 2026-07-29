-- ═══════════════════════════════════════════════════════════════════════════
--  MIGRACIÓN 002 · El menú: familias y productos
-- ═══════════════════════════════════════════════════════════════════════════
--  Aquí vive la carta de ONCE. Los productos NO se borran nunca: se marcan
--  como inactivos. Si se borrara un producto, los tickets viejos quedarían
--  apuntando a la nada y el corte de hace tres meses dejaría de cuadrar.
--
--  Los precios están en CENTAVOS ENTEROS. Una cerveza de $40 es 4000.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── Familias (las pestañas de arriba en la pantalla de venta) ────────────
CREATE TABLE familias (
  clave   TEXT    PRIMARY KEY,          -- 'Bebidas' — es la que guardan los productos
  nombre  TEXT    NOT NULL,             -- cómo se ve en pantalla
  emoji   TEXT    NOT NULL DEFAULT '',
  orden   INTEGER NOT NULL DEFAULT 0,   -- en qué orden salen las pestañas
  activa  INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0,1))
);


-- ── Productos ────────────────────────────────────────────────────────────
-- `opciones` guarda el submenú del mesero en JSON, tal como lo deja
-- parseOpciones() de nucleo/opciones.js. NULL = el producto no pregunta nada.
--
-- `id_v1` es el identificador que traía el producto en la v1.3.0. Sirve para
-- que si se importa el mismo respaldo dos veces, no se dupliquen los productos.
CREATE TABLE productos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  familia      TEXT    NOT NULL REFERENCES familias(clave),
  nombre       TEXT    NOT NULL,
  icono        TEXT    NOT NULL DEFAULT '',
  precio       INTEGER NOT NULL CHECK (precio >= 0),   -- CENTAVOS
  opciones     TEXT,                                   -- JSON o NULL
  orden        INTEGER NOT NULL DEFAULT 0,
  activo       INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  id_v1        TEXT,
  creado       TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  actualizado  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX ix_productos_familia ON productos(familia, orden);

-- Dos productos con el mismo nombre en la misma familia serían un error de
-- captura, y en la pantalla de venta nadie sabría cuál tocar.
CREATE UNIQUE INDEX ix_productos_nombre ON productos(familia, nombre);

-- Un producto de la v1 se importa una sola vez, aunque se cargue el
-- respaldo varias veces.
CREATE UNIQUE INDEX ix_productos_v1 ON productos(id_v1) WHERE id_v1 IS NOT NULL;


-- ── Las cuatro familias de ONCE (las mismas de la v1.3.0) ────────────────
INSERT INTO familias (clave, nombre, emoji, orden) VALUES
  ('Bebidas',   'Bebidas',   '🍹', 1),
  ('Refrescos', 'Refrescos', '🥤', 2),
  ('Comida',    'Comida',    '🍔', 3),
  ('Souvenirs', 'Souvenirs', '🎁', 4);


-- ── Ajustes que estrena esta migración ───────────────────────────────────
INSERT INTO ajustes (clave, valor) VALUES
  ('menu.origen', 'sin sembrar');   -- 'menu de fábrica' | 'respaldo v1.3.0'
