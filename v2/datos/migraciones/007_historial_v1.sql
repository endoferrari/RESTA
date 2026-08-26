-- ═══════════════════════════════════════════════════════════════════════════
--  MIGRACIÓN 007 · De dónde vino cada cuenta y cada ticket
-- ═══════════════════════════════════════════════════════════════════════════
--  Al pasar el bar de la v1 a la v2 se importan las ventas viejas y las mesas
--  que quedaron abiertas. Esa importación se hace con datos que no se pueden
--  volver a generar, y casi nunca sale a la primera: se prueba, se revisa el
--  corte, se corrige algo de la carta y se vuelve a importar el mismo archivo.
--
--  Sin una marca de origen, cada intento duplicaría las ventas y el corte
--  daría el doble. Con ella, importar dos veces el mismo respaldo no cambia
--  nada la segunda vez.
--
--  Se guarda el id que ya traía el registro en la v1. Es el único dato que
--  identifica a esa venta en concreto, y viaja dentro del respaldo .json.
-- ═══════════════════════════════════════════════════════════════════════════


ALTER TABLE cuentas ADD COLUMN id_v1 TEXT;
ALTER TABLE tickets ADD COLUMN id_v1 TEXT;

-- Únicos, pero sólo entre los que tienen marca: todo lo que nazca en la v2
-- lleva id_v1 NULL, y en SQLite los NULL no chocan entre sí.
CREATE UNIQUE INDEX ix_cuentas_id_v1 ON cuentas(id_v1) WHERE id_v1 IS NOT NULL;
CREATE UNIQUE INDEX ix_tickets_id_v1 ON tickets(id_v1) WHERE id_v1 IS NOT NULL;
