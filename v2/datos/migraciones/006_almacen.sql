-- ═══════════════════════════════════════════════════════════════════════════
--  MIGRACIÓN 006 · Almacén
-- ═══════════════════════════════════════════════════════════════════════════
--  LA REGLA QUE MANTIENE ESTO SENCILLO:
--  **todo se cuenta en PORCIONES, nunca en botellas.**
--
--  Una botella de whisky no entra al almacén como «1 botella»: entra como
--  «15 copas». Así el inventario está siempre en la misma unidad en que se
--  vende y desaparecen las fracciones. Las botellas se vuelven a calcular
--  sólo para enseñarlas en pantalla.
--
--  Y LAS MEZCLAS, sin recetas: un producto puede decir «al venderme, gasta 1
--  de aquel otro». La michelada gasta 1 cerveza. Las salsas, el limón y el
--  hielo NO se controlan, a propósito: llevarles la cuenta es justo lo que
--  hace que estos módulos se abandonen a los dos meses.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── Configuración de almacén de cada producto ────────────────────────────

-- ¿Este producto se controla? Se empieza con pocos: los que duelen.
ALTER TABLE productos ADD COLUMN controla_stock INTEGER NOT NULL DEFAULT 0
  CHECK (controla_stock IN (0,1));

-- Cuántas porciones trae lo que se compra. 1 botella de whisky = 15 copas,
-- 1 caja de cerveza = 24 cervezas, 1 bolsa de papas = 1.
ALTER TABLE productos ADD COLUMN porciones_por_envase INTEGER NOT NULL DEFAULT 1
  CHECK (porciones_por_envase > 0);

-- Cómo se llaman las dos unidades, para que la pantalla hable en español:
-- «2 botellas y 8 copas» en vez de «38».
ALTER TABLE productos ADD COLUMN envase TEXT NOT NULL DEFAULT 'paquete';
ALTER TABLE productos ADD COLUMN unidad TEXT NOT NULL DEFAULT 'pieza';

-- Las mezclas: al vender este producto, lo que se gasta es OTRO.
-- La michelada apunta a la cerveza. NULL = se gasta a sí mismo.
ALTER TABLE productos ADD COLUMN gasta_producto_id INTEGER REFERENCES productos(id);


-- ── Movimientos de almacén ───────────────────────────────────────────────
-- Esta tabla SÓLO CRECE. La existencia no se guarda en ningún lado: se suma
-- de aquí. Así siempre se puede contestar «¿por qué hay 38?» renglón por
-- renglón, en vez de tener un número que alguien cambió y nadie sabe cuándo.
--
-- `cantidad` va en PORCIONES: positivo entra, negativo sale.
CREATE TABLE movimientos_stock (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id  INTEGER NOT NULL REFERENCES productos(id),

  tipo         TEXT    NOT NULL
                       CHECK (tipo IN ('compra','venta','merma','conteo','ajuste')),
  cantidad     INTEGER NOT NULL,          -- + entra · − sale

  motivo       TEXT,                      -- por qué (obligatorio en merma)
  referencia   TEXT,                      -- la cuenta o el ticket que lo movió

  usuario_id   INTEGER REFERENCES usuarios(id),
  usuario_nom  TEXT,

  fecha        TEXT    NOT NULL,          -- AAAA-MM-DD, para la proyección
  momento      TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX ix_mov_producto ON movimientos_stock(producto_id);
CREATE INDEX ix_mov_fecha    ON movimientos_stock(fecha);
CREATE INDEX ix_mov_tipo     ON movimientos_stock(tipo, fecha);


-- ── Ajustes que estrena esta migración ───────────────────────────────────
INSERT INTO ajustes (clave, valor) VALUES
  -- Para cuántos días quiere estar cubierto. Rosendo compra 1 o 2 veces por
  -- semana, así que no hay un día fijo: se pone aquí y se cambia cuando quiera.
  ('almacen.dias_a_cubrir', '7'),
  -- Cuántos días de historia se miran para proyectar el consumo.
  ('almacen.dias_de_historia', '56');


-- ── Configuración de arranque para la carta de ONCE ──────────────────────
-- Se deja listo lo que de verdad duele —licores y cerveza— y el resto se
-- queda sin controlar. Empezar controlando 55 productos es la forma más
-- rápida de abandonarlo. Todo esto se cambia desde la pantalla.

-- Los destilados se venden por copa: 1 botella = 15 copas (≈50 ml).
UPDATE productos
   SET controla_stock = 1, porciones_por_envase = 15,
       envase = 'botella', unidad = 'copa'
 WHERE familia = 'Bebidas'
   AND nombre IN (
     'Whisky Etiqueta Negra', 'Whisky Buchanan''s 12 años', 'Whisky Chivas',
     'Ron Bacardí blanco', 'Ron Matusalem clásico',
     'Brandy Torres 10', 'Brandy Azteca de Oro',
     'Tequila Maestro Tequilero', 'Tequila Don Julio 70',
     'Ginebra Beefeater', 'Vodka Absolut Azul', 'Vodka Stolichnaya',
     'Licor 43', 'Baileys', 'Sambuca Vaccari'
   );

-- La cerveza se compra por caja de 24 y se vende de una en una.
UPDATE productos
   SET controla_stock = 1, porciones_por_envase = 24,
       envase = 'caja', unidad = 'cerveza'
 WHERE familia = 'Bebidas' AND nombre = 'Cerveza';

-- El vino se vende por botella completa.
UPDATE productos
   SET controla_stock = 1, porciones_por_envase = 1,
       envase = 'botella', unidad = 'botella'
 WHERE familia = 'Bebidas' AND nombre = 'Vino Cune Crianza (botella)';

-- LAS MEZCLAS: chelada, michelada y chelato gastan una cerveza cada una.
-- No se controlan ellas mismas —no hay «existencia de micheladas»— pero al
-- venderlas baja la cerveza, que es lo que sí se compra.
UPDATE productos
   SET gasta_producto_id = (
         SELECT id FROM productos WHERE familia = 'Bebidas' AND nombre = 'Cerveza'
       )
 WHERE familia = 'Bebidas'
   AND nombre IN ('Chelada (limón y sal)', 'Michelada (salsas)', 'Chelato (salsas y clamato)');
