-- ═══════════════════════════════════════════════════════════════════════════
--  MIGRACIÓN 009 · El inventario se puede apagar, y la comanda también
-- ═══════════════════════════════════════════════════════════════════════════
--  Dos interruptores que pidió Rosendo, por el mismo motivo de fondo: un bar
--  que apenas está aprendiendo el sistema no tiene por qué cargar con todo
--  encendido desde el primer día.
--
--  1. ALMACÉN APAGADO DE ARRANQUE.
--     Llevar inventario es un hábito, no una casilla: hay que anotar la
--     merma, recibir los pedidos y contar cada tanto. Encenderlo el día uno,
--     cuando todavía se está aprendiendo a cobrar, es la forma más rápida de
--     terminar con un inventario que miente. Se enciende cuando el bar esté
--     listo, desde Configuración, y ese día se hace el arqueo.
--
--     OJO: apagado NO significa que RESTA deje de anotar. Lo que ya está
--     marcado para controlar sigue registrando sus salidas por dentro, sin
--     enseñarlas. Así, el día que se encienda, la lista de «qué comprar» ya
--     sabe cuánto se vende un sábado en vez de tener que aprenderlo desde
--     cero durante dos semanas. Lo que se apaga son las pantallas.
--
--  2. LA COMANDA PUEDE NO SALIR EN PAPEL.
--     Hay noches en que la barra está a dos metros de la caja y el papel de
--     la comanda sólo es basura. Se apaga SÓLO la comanda: el ticket del
--     cobro, la cuenta que pide el cliente y el corte siguen imprimiéndose.
--     El botón «Mandar a barra» sigue existiendo y sigue marcando qué salió;
--     lo único que no pasa es que se gaste papel.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO ajustes (clave, valor) VALUES
  -- '1' = se lleva inventario · '0' = ni se enseña. De fábrica, apagado.
  ('almacen.activo', '0'),

  -- La fecha del arqueo inicial. Vacío = todavía no se ha hecho, y hasta
  -- entonces los números del almacén no valen: no hay contra qué comparar.
  ('almacen.arqueo_inicial', ''),

  -- '1' = la comanda sale en papel · '0' = se manda a barra sin imprimir.
  -- De fábrica encendida: es como se ha trabajado siempre.
  ('impresora.comanda', '1');
