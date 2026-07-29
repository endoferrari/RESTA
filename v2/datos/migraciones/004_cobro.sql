-- ═══════════════════════════════════════════════════════════════════════════
--  MIGRACIÓN 004 · Cobro: pagos y tickets
-- ═══════════════════════════════════════════════════════════════════════════
--  Una cuenta puede recibir VARIOS pagos: la mitad en efectivo y la mitad con
--  tarjeta, o de tres personas por separado. Por eso los pagos son una tabla
--  aparte y no un par de columnas en `cuentas`.
--
--  Cuando lo que falta por pagar llega a cero, la cuenta se cierra y nace su
--  ticket. El ticket guarda una FOTOGRAFÍA de los números de ese momento.
--  Así, el corte del día de hace tres meses sigue dando lo mismo aunque
--  después se hayan cambiado precios, se haya dado de baja un producto o se
--  haya renombrado una familia.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── Pagos recibidos ──────────────────────────────────────────────────────
CREATE TABLE pagos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  cuenta_id    INTEGER NOT NULL REFERENCES cuentas(id),

  metodo       TEXT    NOT NULL
                       CHECK (metodo IN ('efectivo','tarjeta','transferencia')),
  monto        INTEGER NOT NULL CHECK (monto > 0),    -- lo que se abonó a la cuenta

  -- Sólo en efectivo: con cuánto pagó el cliente y cuánto se le regresó.
  -- Se guardan los dos para que, si al final del turno falta dinero en la
  -- caja, se pueda ver exactamente qué cambio se entregó.
  recibido     INTEGER,
  cambio       INTEGER NOT NULL DEFAULT 0,

  referencia   TEXT,                                  -- últimos 4 de la tarjeta, folio, etc.

  -- Qué renglones liquidó este pago, cuando se cobró «cada quien lo suyo».
  -- Se guarda para poder deshacer EXACTAMENTE este pago si se registró mal,
  -- sin dejar pendientes los renglones que pagó alguien más.
  lineas       TEXT,                                  -- JSON con los ids, o NULL

  cobrado_por  INTEGER REFERENCES usuarios(id),
  cobrado_nom  TEXT,
  momento      TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX ix_pagos_cuenta  ON pagos(cuenta_id);
CREATE INDEX ix_pagos_momento ON pagos(momento);


-- ── Tickets (una cuenta ya cobrada) ──────────────────────────────────────
-- Los números de aquí NO se vuelven a calcular nunca. Son la foto del
-- momento del cobro. Todo en centavos enteros.
CREATE TABLE tickets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  folio        INTEGER NOT NULL UNIQUE,               -- el número que ve el cliente
  cuenta_id    INTEGER NOT NULL REFERENCES cuentas(id),

  nombre       TEXT    NOT NULL,                      -- «Mesa 4», copiado
  fecha        TEXT    NOT NULL,                      -- AAAA-MM-DD, para el corte

  bruto        INTEGER NOT NULL,                      -- todo lo anotado
  cortesias    INTEGER NOT NULL,                      -- lo regalado
  consumo      INTEGER NOT NULL,                      -- lo que sí se cobra
  descuento    INTEGER NOT NULL,
  subtotal     INTEGER NOT NULL,
  propina      INTEGER NOT NULL,
  total        INTEGER NOT NULL,                      -- lo que pagó el cliente
  articulos    INTEGER NOT NULL,

  cerrado_por  INTEGER REFERENCES usuarios(id),
  cerrado_nom  TEXT,
  momento      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),

  -- Un ticket mal cobrado NO se borra: se anula.
  -- El folio se queda usado para siempre (si desaparecieran folios, cualquiera
  -- podría sacar dinero de la caja y borrar el ticket sin dejar hueco).
  -- El corte del día no cuenta los anulados, pero ahí siguen.
  anulado          INTEGER NOT NULL DEFAULT 0 CHECK (anulado IN (0,1)),
  anulado_motivo   TEXT,
  anulado_por      TEXT,
  anulado_momento  TEXT
);

CREATE INDEX ix_tickets_fecha  ON tickets(fecha);
CREATE INDEX ix_tickets_cuenta ON tickets(cuenta_id);


-- ── Motivo de la cortesía en el renglón ──────────────────────────────────
-- (la columna `cortesia_motivo` ya existe desde la 003; aquí sólo se deja
--  constancia de quién la autorizó, que es lo que se pregunta después)
ALTER TABLE lineas ADD COLUMN cortesia_por TEXT;
