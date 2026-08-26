/**
 * CLIENTE · PIEZAS DE PANTALLA COMPARTIDAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Los avisos, las preguntas y las ventanitas que usan todas las pantallas.
 *
 * Están aquí para que un "¿seguro?" se vea y se comporte igual en toda la
 * aplicación, y para que ninguna pantalla use `alert()` del navegador, que en
 * una tablet se ve horrible y bloquea todo.
 */

export const $ = (id) => document.getElementById(id);

/** Escapa el HTML. Nada de lo que teclea una persona se pinta sin pasar por aquí. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/* ── Avisos que se van solos ───────────────────────────────────────────── */

let temporizadorAviso = null;

export function avisar(texto, esError = false) {
  const caja = $('avisos');
  caja.className = 'aviso ' + (esError ? 'aviso-mal' : 'aviso-bien');
  caja.textContent = texto;
  caja.hidden = false;

  clearTimeout(temporizadorAviso);
  // Los errores se quedan más tiempo: hay que alcanzar a leerlos.
  temporizadorAviso = setTimeout(() => { caja.hidden = true; }, esError ? 6000 : 2600);
}

/* ── Ventanitas ────────────────────────────────────────────────────────── */

let cerrarActual = null;

/**
 * Abre una ventanita con el contenido que se le pase.
 * Devuelve una promesa que se resuelve con lo que conteste la persona
 * (o null si cerró sin contestar).
 */
export function ventana({ titulo, cuerpo, botones = [], alAbrir = null }) {
  cerrarVentana();

  return new Promise((resolver) => {
    const fondo = document.createElement('div');
    fondo.className = 'fondo-ventana';
    fondo.innerHTML = `
      <div class="ventana" role="dialog" aria-modal="true">
        <div class="ventana-cabeza">
          <span>${esc(titulo)}</span>
          <button class="cerrar-ventana" aria-label="Cerrar">✕</button>
        </div>
        <div class="ventana-cuerpo">${cuerpo}</div>
        <div class="ventana-pie"></div>
      </div>`;

    const pie = fondo.querySelector('.ventana-pie');
    botones.forEach((b) => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.clase ?? '');
      btn.textContent = b.texto;
      btn.addEventListener('click', () => {
        const valor = b.valor instanceof Function ? b.valor(fondo) : b.valor;
        if (valor === undefined) return;     // el botón decidió no cerrar
        terminar(valor);
      });
      pie.appendChild(btn);
    });

    function terminar(valor) {
      document.removeEventListener('keydown', alTeclear);
      fondo.remove();
      cerrarActual = null;
      resolver(valor);
    }

    function alTeclear(e) {
      if (e.key === 'Escape') terminar(null);
    }

    fondo.querySelector('.cerrar-ventana').addEventListener('click', () => terminar(null));
    fondo.addEventListener('click', (e) => { if (e.target === fondo) terminar(null); });
    document.addEventListener('keydown', alTeclear);

    document.body.appendChild(fondo);
    cerrarActual = () => terminar(null);

    // A `alAbrir` se le pasa `terminar` para las ventanas que se cierran solas
    // al elegir (por ejemplo "¿cuántas quitas?"): un toque en vez de dos.
    alAbrir?.(fondo, terminar);
  });
}

export function cerrarVentana() {
  cerrarActual?.();
}

/** Un sí/no. Devuelve true sólo si la persona confirmó. */
export function confirmar(titulo, texto, textoSi = 'Sí') {
  return ventana({
    titulo,
    cuerpo: `<p class="texto-ventana">${texto}</p>`,
    botones: [
      { texto: 'Cancelar', valor: false },
      { texto: textoSi, valor: true, clase: 'btn-ambar' },
    ],
  }).then((r) => r === true);
}

/**
 * Pide un texto obligatorio (por ejemplo, el motivo de una cancelación).
 * Devuelve el texto, o null si se arrepintió.
 */
export function pedirTexto(titulo, etiqueta, { sugerencias = [] } = {}) {
  const chips = sugerencias.length
    ? `<div class="sugerencias">${sugerencias
        .map((s) => `<button type="button" data-sug="${esc(s)}">${esc(s)}</button>`).join('')}</div>`
    : '';

  return ventana({
    titulo,
    cuerpo: `
      <label class="etiqueta-campo">${esc(etiqueta)}</label>
      <input type="text" id="campo-ventana" class="campo" autocomplete="off">
      ${chips}
      <div class="error-campo" id="error-ventana" hidden></div>`,
    botones: [
      { texto: 'Cancelar', valor: null },
      {
        texto: 'Aceptar',
        clase: 'btn-ambar',
        valor: (fondo) => {
          const valor = fondo.querySelector('#campo-ventana').value.trim();
          if (!valor) {
            const err = fondo.querySelector('#error-ventana');
            err.textContent = 'Hace falta escribir algo.';
            err.hidden = false;
            fondo.querySelector('#campo-ventana').focus();
            return undefined;              // no cierra
          }
          return valor;
        },
      },
    ],
    alAbrir(fondo) {
      const campo = fondo.querySelector('#campo-ventana');
      campo.focus();
      fondo.querySelectorAll('[data-sug]').forEach((b) => {
        b.addEventListener('click', () => { campo.value = b.dataset.sug; campo.focus(); });
      });
    },
  });
}
