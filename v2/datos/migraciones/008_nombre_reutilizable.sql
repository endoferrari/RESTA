-- ─────────────────────────────────────────────────────────────────────────
-- 008 · El nombre de un dado de baja se puede volver a usar
--
-- El candado único sobre el nombre contaba TAMBIÉN a los dados de baja:
-- dar de baja a «Juan» y después dar de alta a otro «Juan» tronaba con
-- «Algo falló en el servidor», sin explicación. Y como no había botón de
-- editar, esa vuelta (baja + alta) era el único camino… justo el que
-- fallaba. En el bar la gente va y viene: los nombres se repiten.
--
-- El candado se queda, pero sólo entre los ACTIVOS: dos personas activas
-- con el mismo nombre siguen estando prohibidas, porque en el corte no se
-- sabría cuál de las dos cobró.
-- ─────────────────────────────────────────────────────────────────────────

DROP INDEX ix_usuarios_nombre;
CREATE UNIQUE INDEX ix_usuarios_nombre ON usuarios(nombre) WHERE activo = 1;
