/**
 * SERVIDOR · TIEMPO REAL
 * ─────────────────────────────────────────────────────────────────────────────
 * Mantiene a todas las pantallas viviendo la misma realidad.
 *
 * Cuando Ana anota una cerveza en la mesa 4 desde su tablet, la caja lo ve
 * en el mismo segundo. Cuando la caja cobra, la mesa desaparece de la tablet
 * de Ana al instante.
 *
 * Cómo funciona: cada pantalla abre una conexión permanente (WebSocket).
 * El servidor le avisa a todas cuando algo cambia. Las pantallas NO andan
 * preguntando cada segundo — el servidor les habla.
 */

const conectados = new Set();

export function registrarTiempoReal(app) {
  app.get('/ws', { websocket: true }, (conexion, peticion) => {
    const pantalla = {
      socket: conexion,
      desde: peticion.ip,
      conectadaEn: Date.now(),
      usuario: null,      // se llena cuando entra con su PIN (fase 3)
    };

    conectados.add(pantalla);

    enviar(conexion, { tipo: 'bienvenida', conectados: conectados.size });

    conexion.on('message', (crudo) => {
      let mensaje;
      try {
        mensaje = JSON.parse(crudo.toString());
      } catch {
        return; // un mensaje mal formado se ignora, no tumba nada
      }
      // "latido": la pantalla comprueba que seguimos vivos
      if (mensaje.tipo === 'latido') {
        enviar(conexion, { tipo: 'latido', momento: Date.now() });
      }
    });

    conexion.on('close', () => conectados.delete(pantalla));
    conexion.on('error', () => conectados.delete(pantalla));
  });
}

function enviar(socket, objeto) {
  try {
    if (socket.readyState === 1) socket.send(JSON.stringify(objeto));
  } catch { /* si esa pantalla ya no está, no pasa nada */ }
}

/**
 * Le avisa a TODAS las pantallas que algo cambió.
 * Ejemplo: avisarATodos('cuenta.cambio', { cuentaId: 'abc' })
 */
export function avisarATodos(tipo, datos = {}) {
  const mensaje = JSON.stringify({ tipo, ...datos, momento: Date.now() });
  for (const pantalla of conectados) {
    try {
      if (pantalla.socket.readyState === 1) pantalla.socket.send(mensaje);
    } catch {
      conectados.delete(pantalla);
    }
  }
}

/** Cuántas pantallas hay conectadas ahora mismo. */
export function pantallasConectadas() {
  return conectados.size;
}
