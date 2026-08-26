/**
 * CLIENTE · CONEXIÓN EN VIVO
 * ─────────────────────────────────────────────────────────────────────────────
 * Mantiene abierta la línea con la caja y avisa en cuanto se corta.
 *
 * Decisión tomada a propósito: si se cae el WiFi, la tablet se BLOQUEA con
 * una barra roja en vez de dejar seguir anotando. Es preferible que el mesero
 * espere 3 segundos a que una comanda se pierda o se duplique.
 *
 * Se reconecta sola, esperando cada vez un poco más (1s, 2s, 4s… hasta 15s)
 * para no ahogar la red mientras el router se reinicia.
 */

const ESPERA_MAXIMA = 15_000;

export function conectar({ alCambiarEstado, alRecibir } = {}) {
  let socket = null;
  let espera = 1000;
  let latido = null;
  let cerradoAposta = false;

  const estado = { conectado: false };

  function avisar(conectado) {
    if (estado.conectado === conectado) return;
    estado.conectado = conectado;
    alCambiarEstado?.(conectado);
  }

  function abrir() {
    const protocolo = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocolo}//${location.host}/ws`);

    socket.addEventListener('open', () => {
      espera = 1000;               // reconexión exitosa: reiniciamos la espera
      avisar(true);
      latido = setInterval(() => {
        if (socket?.readyState === 1) {
          socket.send(JSON.stringify({ tipo: 'latido' }));
        }
      }, 20_000);
    });

    socket.addEventListener('message', (evento) => {
      let mensaje;
      try { mensaje = JSON.parse(evento.data); } catch { return; }
      alRecibir?.(mensaje);
    });

    const caida = () => {
      clearInterval(latido);
      avisar(false);
      if (cerradoAposta) return;
      setTimeout(abrir, espera);
      espera = Math.min(espera * 2, ESPERA_MAXIMA);
    };

    socket.addEventListener('close', caida);
    socket.addEventListener('error', () => socket?.close());
  }

  abrir();

  return {
    estado,
    cerrar() {
      cerradoAposta = true;
      clearInterval(latido);
      socket?.close();
    },
  };
}
