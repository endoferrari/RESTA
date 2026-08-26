/**
 * CLIENTE · EL ARMADOR DE SUBMENÚS
 * ─────────────────────────────────────────────────────────────────────────────
 * Antes, el submenú de un producto se capturaba escribiendo a mano un texto
 * con una sintaxis que había que recordar:
 *
 *     Refresco [varias] [si: Puesto, Campechano]: Coca, Coca Light
 *
 * Eso funciona, pero sólo si te acuerdas de los corchetes, de los dos puntos
 * y de escribir «Puesto» EXACTAMENTE igual que arriba. Un acento de más y la
 * pregunta no aparecía nunca, sin decir por qué.
 *
 * Aquí se arma tocando: se escribe la pregunta, se van agregando las
 * respuestas como etiquetas, y la condición «sólo si antes eligió…» se marca
 * de una lista con las respuestas que YA existen — así es imposible
 * escribirla mal.
 *
 * Tres cosas que ahorran la mayor parte del trabajo:
 *   · plantillas de lo que más se repite en el bar (copa, cerveza, digestivo);
 *   · copiar el submenú de otro producto que ya esté bien (un vodka nuevo
 *     hereda el del vodka viejo en un toque);
 *   · una vista previa que se toca igual que la vería el mesero, para
 *     comprobar en el momento que las preguntas aparecen cuando deben.
 *
 * El formato guardado NO cambia: al final esto escribe el mismo texto de
 * siempre. Los submenús ya capturados se siguen leyendo igual, y quien
 * prefiera escribirlo a mano puede hacerlo abriendo «verlo como texto».
 */

import { esc, ventana } from '../ui.js';
import { parseOpciones, textoOpciones, preguntaAplica } from '/nucleo/opciones.js';

/* ── Plantillas ────────────────────────────────────────────────────────────
   Salen de la carta real de ONCE (datos/menu-once.js), no de un ejemplo
   inventado: son las preguntas que de verdad se hacen en la barra. */
const PLANTILLAS = [
  {
    clave: 'copa', emoji: '🥃', nombre: 'Copa o trago',
    nota: 'mezcla, con qué va, refresco y hielo',
    texto:
      'Mezcla: Puesto, Campechano, Pintado, Divorciado, Derecho\n' +
      'Con qué va [si: Puesto]: Agua mineral, Refresco, Agua y refresco (pintado)\n' +
      'Aparte [varias] [si: Divorciado]: Agua mineral, Agua natural, Refresco\n' +
      'Refresco [si: Refresco, Agua y refresco (pintado), Campechano, Pintado]: Coca, Coca Light\n' +
      'Hielo: Con hielo, Sin hielo',
  },
  {
    clave: 'cerveza', emoji: '🍺', nombre: 'Cerveza',
    nota: 'nada más la marca',
    texto: 'Marca: Tecate Light, Heineken, Amstel Ultra, XX Ámbar, XX Lager, Sol, Indio, Heineken 0.0',
  },
  {
    clave: 'digestivo', emoji: '🍷', nombre: 'Digestivo',
    nota: 'derecho, en las rocas, shakereado',
    texto: 'Cómo va: Derecho, En las rocas, Shakereado',
  },
  {
    clave: 'hielo', emoji: '🧊', nombre: 'Sólo el hielo',
    nota: 'una pregunta y ya',
    texto: 'Hielo: Con hielo, Sin hielo',
  },
];

/* ── Limpieza de lo que se teclea ──────────────────────────────────────────
   El formato usa «:» para separar la pregunta de sus respuestas, «,» entre
   respuestas y «[ ]» para los marcadores. Si alguien escribe uno de esos
   caracteres dentro de un nombre, el renglón deja de entenderse. En vez de
   regañar después, se quitan aquí mismo. */
const limpiarPregunta = (s) => String(s).replace(/[:[\]\n]/g, '').replace(/\s+/g, ' ').trimStart();
const limpiarRespuesta = (s) => String(s).replace(/[,[\]\n]/g, '').replace(/\s+/g, ' ').trim();

/** Un resumen de una línea del submenú de otro producto, para la lista de copiar. */
function resumenCorto(texto) {
  const p = parseOpciones(texto) ?? [];
  if (!p.length) return 'sin submenú';
  return `${p.length} ${p.length === 1 ? 'pregunta' : 'preguntas'} · ${p.map((x) => x.g).join(' · ')}`;
}

/**
 * Abre el armador.
 *
 * @param texto     el submenú que ya tenía el producto (puede ir vacío)
 * @param producto  su nombre, sólo para el título de la ventana
 * @param productos la carta entera, para poder copiarle el submenú a otro
 * @returns el texto nuevo · '' si se quitó el submenú · null si se arrepintió
 */
export function abrirEditorSubmenu({ texto = '', producto = '', productos = [] } = {}) {
  // Se parte de lo que ya había. Si el texto guardado no se entendía, se
  // empieza en blanco: es preferible a mostrar media captura.
  let preguntas = (parseOpciones(texto) ?? []).map((p) => ({
    g: p.g,
    ops: [...p.ops],
    multi: !!p.multi,
    si: p.si ? [...p.si] : [],
  }));

  const habiaSubmenu = preguntas.length > 0;

  let elegidas = [];           // lo marcado en la vista previa
  let modoArranque = 'inicio'; // 'inicio' | 'copiar'

  // Los otros productos que ya tienen submenú, del más completo al menos,
  // para que el que vale la pena copiar salga arriba.
  const conSubmenu = productos
    .filter((p) => (p.opcionesTexto ?? '').trim() && p.nombre !== producto)
    .sort((a, b) => (parseOpciones(b.opcionesTexto)?.length ?? 0) -
                    (parseOpciones(a.opcionesTexto)?.length ?? 0));

  /** Sólo las preguntas que están completas. Una a medias no se guarda. */
  const completas = () => preguntas
    .filter((p) => p.g.trim() && p.ops.length)
    .map((p) => ({
      g: p.g.trim(),
      ops: p.ops,
      ...(p.multi ? { multi: true } : {}),
      ...(p.si.length ? { si: p.si } : {}),
    }));

  return ventana({
    titulo: producto ? `Submenú de ${producto}` : 'Submenú del producto',
    cuerpo: `
      <div id="sm-arranque"></div>
      <div id="sm-lista"></div>
      <div id="sm-pie"></div>
      <div id="sm-previa"></div>
      <div id="sm-texto"></div>
      <div class="error-campo" id="sm-error" hidden></div>`,

    botones: [
      ...(habiaSubmenu ? [{ texto: 'Quitar submenú', valor: '' }] : []),
      { texto: 'Cancelar', valor: null },
      {
        texto: 'Guardar submenú',
        clase: 'btn-ambar',
        valor: (fondo) => {
          recogerPendientes(fondo);

          // Una pregunta con nombre pero sin respuestas —o al revés— casi
          // siempre es algo que se quedó a medias. Guardarla en silencio la
          // haría desaparecer sin explicación.
          const media = preguntas.find((p) =>
            (p.g.trim() && !p.ops.length) || (!p.g.trim() && p.ops.length));

          if (media) {
            mostrarError(fondo, media.g.trim()
              ? `A «${media.g.trim()}» le faltan las respuestas. Agrégalas o quita la pregunta.`
              : 'Hay respuestas sin pregunta. Escríbele el nombre o quita ese bloque.');
            return undefined;               // no cierra
          }

          return textoOpciones(completas());
        },
      },
    ],

    alAbrir(fondo) {
      // El armador necesita más ancho que un «¿seguro?».
      fondo.querySelector('.ventana').classList.add('ventana-ancha');

      pintarTodo(fondo);

      fondo.addEventListener('click', (e) => alTocar(e, fondo));
      fondo.addEventListener('input', (e) => alEscribir(e, fondo));
      fondo.addEventListener('change', (e) => alCambiar(e, fondo));
      fondo.addEventListener('keydown', (e) => alTeclear(e, fondo));
    },
  });

  /* ── Pintar ──────────────────────────────────────────────────────────── */

  function pintarTodo(fondo, foco = null) {
    pintarArranque(fondo);
    pintarLista(fondo);
    pintarPie(fondo);
    pintarPrevia(fondo);
    pintarTexto(fondo);
    ocultarError(fondo);

    if (foco) {
      const campo = fondo.querySelector(foco);
      if (campo) {
        campo.focus();
        campo.setSelectionRange?.(campo.value.length, campo.value.length);
      }
    }
  }

  function pintarArranque(fondo) {
    const caja = fondo.querySelector('#sm-arranque');

    // Con preguntas ya capturadas las plantillas estorban: lo que se quiere
    // es cambiar lo que hay, no empezar de cero.
    if (preguntas.length && modoArranque === 'inicio') { caja.innerHTML = ''; return; }

    if (modoArranque === 'copiar') {
      caja.innerHTML = `
        <div class="sm-arranque">
          <div class="sm-arranque-et">¿De cuál producto lo copio?</div>
          <div class="sm-copiar-lista">
            ${conSubmenu.map((p, i) => `
              <button type="button" class="sm-copiar-fila" data-copiade="${i}">
                <span class="fila-icono">${esc(p.icono || '🍽️')}</span>
                <span class="sm-copiar-texto">
                  <b>${esc(p.nombre)}</b>
                  <small>${esc(resumenCorto(p.opcionesTexto))}</small>
                </span>
              </button>`).join('')}
          </div>
          <button type="button" class="btn btn-chico" data-volver>← Volver</button>
        </div>`;
      return;
    }

    caja.innerHTML = `
      <div class="sm-arranque">
        <div class="sm-arranque-et">Empieza de una ya hecha y luego cámbiale lo que quieras</div>
        <div class="sm-arranque-ops">
          ${PLANTILLAS.map((t) => `
            <button type="button" class="op op-plantilla" data-plantilla="${t.clave}">
              <b>${t.emoji} ${esc(t.nombre)}</b>
              <small>${esc(t.nota)}</small>
            </button>`).join('')}
          ${conSubmenu.length ? `
            <button type="button" class="op op-plantilla op-otra" data-copiar>
              <b>📋 Copiar de otro producto</b>
              <small>${conSubmenu.length} ya tienen submenú</small>
            </button>` : ''}
        </div>
      </div>`;
  }

  function pintarLista(fondo) {
    fondo.querySelector('#sm-lista').innerHTML = preguntas.map(tarjeta).join('');
  }

  /**
   * Todas las respuestas de las preguntas ANTERIORES a la número i.
   * Son las únicas que pueden servir de condición: una pregunta no se puede
   * esconder por algo que se contesta después.
   */
  function respuestasPrevias(i) {
    const vistas = [];
    for (let k = 0; k < i; k++) {
      for (const o of preguntas[k].ops) if (!vistas.includes(o)) vistas.push(o);
    }
    return vistas;
  }

  function tarjeta(p, i) {
    const previas = respuestasPrevias(i);

    return `
      <div class="sm-tarjeta">
        <div class="sm-cabeza">
          <span class="sm-num">${i + 1}</span>
          <input class="campo sm-nombre" data-nombre="${i}" value="${esc(p.g)}"
                 placeholder="¿Qué se le pregunta? Ej. Mezcla" maxlength="40" autocomplete="off">
          <span class="sm-mover">
            <button type="button" class="btn btn-chico" data-sube="${i}"
                    ${i === 0 ? 'disabled' : ''} title="Subir">↑</button>
            <button type="button" class="btn btn-chico" data-baja="${i}"
                    ${i === preguntas.length - 1 ? 'disabled' : ''} title="Bajar">↓</button>
            <button type="button" class="btn btn-chico" data-borra="${i}"
                    title="Quitar la pregunta">🗑️</button>
          </span>
        </div>

        <div class="sm-respuestas">
          ${p.ops.map((o, j) => `
            <span class="sm-chip">${esc(o)}<button type="button" data-quita="${i}.${j}"
                  aria-label="Quitar ${esc(o)}">✕</button></span>`).join('')}
          <input class="sm-nueva-op" data-nuevaop="${i}" maxlength="40" autocomplete="off"
                 placeholder="${p.ops.length ? '+ otra respuesta' : 'Escribe una respuesta y dale Enter'}">
        </div>

        <label class="sm-casilla">
          <input type="checkbox" data-multi="${i}" ${p.multi ? 'checked' : ''}>
          <span>Se puede marcar más de una</span>
        </label>

        ${previas.length ? `
          <div class="sm-condicion">
            <div class="sm-condicion-et">
              Preguntar sólo si antes eligió…
              ${p.si.length ? '' : '<span class="sm-condicion-nota">sin marcar nada, se pregunta siempre</span>'}
            </div>
            <div class="sm-condicion-ops">
              ${previas.map((o) => `
                <button type="button" class="op op-chico ${p.si.includes(o) ? 'activo' : ''}"
                        data-si="${i}" data-valor="${esc(o)}">${esc(o)}</button>`).join('')}
            </div>
          </div>` : ''}
      </div>`;
  }

  function pintarPie(fondo) {
    fondo.querySelector('#sm-pie').innerHTML =
      '<button type="button" class="btn sm-agregar" data-nueva>+ Otra pregunta</button>';
  }

  /** La vista previa: se toca igual que la tocaría el mesero. */
  function pintarPrevia(fondo) {
    const caja = fondo.querySelector('#sm-previa');
    const listas = completas();

    if (!listas.length) { caja.innerHTML = ''; return; }

    // Se tiran las marcas de respuestas que ya no existen; si no, la vista
    // previa se queda enseñando condiciones de algo borrado.
    elegidas = elegidas.filter((v) => listas.some((p) => p.ops.includes(v)));

    const visibles = listas.filter((p) => preguntaAplica(p, elegidas));
    const escondidas = listas.filter((p) => !visibles.includes(p));

    caja.innerHTML = `
      <div class="sm-previa-caja">
        <div class="sm-previa-et">👀 Así lo va a ver el mesero — tócalo para probarlo</div>

        ${visibles.map((p) => `
          <div class="grupo-opciones">
            <div class="grupo-titulo">
              ${esc(p.g)}${p.multi ? ' <span class="grupo-nota">(puede marcar varias)</span>' : ''}
            </div>
            <div class="grupo-botones">
              ${p.ops.map((o) => `
                <button type="button" class="op ${elegidas.includes(o) ? 'activo' : ''}"
                        data-previa="${esc(o)}" data-grupo="${esc(p.g)}">${esc(o)}</button>`).join('')}
            </div>
          </div>`).join('')}

        ${escondidas.length ? `
          <div class="sm-escondidas">
            Ahora mismo NO se pregunta: ${escondidas.map((p) => `<b>${esc(p.g)}</b>`).join(', ')}.
            ${elegidas.length
              ? 'Aparecen en cuanto se elija lo que las activa.'
              : 'Empieza a marcar aquí arriba y verás cuándo aparecen.'}
          </div>` : ''}

        ${elegidas.length ? `
          <div class="sm-previa-pie">
            <span>En la comanda saldría: <b>${esc(elegidas.join(' · '))}</b></span>
            <button type="button" class="btn btn-chico" data-limpiar>Empezar de nuevo</button>
          </div>` : ''}
      </div>`;
  }

  function pintarTexto(fondo) {
    const abierto = fondo.querySelector('#sm-crudo-detalle')?.open ?? false;

    fondo.querySelector('#sm-texto').innerHTML = `
      <details class="sm-detalle" id="sm-crudo-detalle" ${abierto ? 'open' : ''}>
        <summary>Verlo como texto — para copiar, pegar o escribirlo de golpe</summary>
        <textarea class="campo sm-textarea" id="sm-crudo" rows="5"
                  spellcheck="false">${esc(textoOpciones(completas()))}</textarea>
        <div class="sm-texto-botones">
          <button type="button" class="btn btn-chico" data-aplicar>Aplicar lo que escribí</button>
        </div>
        <p class="sutil">
          Un renglón por pregunta: <b>Pregunta: respuesta, respuesta</b>.
          <b>[varias]</b> deja marcar más de una · <b>[si: Valor]</b> la esconde
          hasta que se elija ese valor.
        </p>
      </details>`;
  }

  function mostrarError(fondo, texto) {
    const caja = fondo.querySelector('#sm-error');
    caja.textContent = texto;
    caja.hidden = false;
  }

  function ocultarError(fondo) {
    fondo.querySelector('#sm-error').hidden = true;
  }

  /**
   * Lo que se teclé y todavía no se agregó.
   *
   * Si alguien escribe una respuesta y le da directo a «Guardar», ese texto
   * se perdería. En vez de atrapar el `blur` —que pelea con el clic del
   * botón y se traga el toque— se recoge a mano justo antes de cada acción
   * importante.
   */
  function recogerPendientes(fondo) {
    fondo.querySelectorAll('[data-nuevaop]').forEach((campo) => {
      const i = Number(campo.dataset.nuevaop);
      const valor = limpiarRespuesta(campo.value);
      if (valor && preguntas[i] && !preguntas[i].ops.includes(valor)) {
        preguntas[i].ops.push(valor);
      }
      campo.value = '';
    });
  }

  /* ── Toques ──────────────────────────────────────────────────────────── */

  function alTocar(e, fondo) {
    const b = e.target.closest('button');
    if (!b || !fondo.contains(b)) return;

    /* Plantillas y copiar */
    if (b.dataset.plantilla) {
      const t = PLANTILLAS.find((x) => x.clave === b.dataset.plantilla);
      preguntas = copiarPreguntas(t.texto);
      modoArranque = 'inicio';
      elegidas = [];
      return pintarTodo(fondo);
    }

    if (b.hasAttribute('data-copiar')) { modoArranque = 'copiar'; return pintarArranque(fondo); }
    if (b.hasAttribute('data-volver')) { modoArranque = 'inicio'; return pintarArranque(fondo); }

    if (b.dataset.copiade !== undefined) {
      preguntas = copiarPreguntas(conSubmenu[Number(b.dataset.copiade)].opcionesTexto);
      modoArranque = 'inicio';
      elegidas = [];
      return pintarTodo(fondo);
    }

    /* Preguntas */
    if (b.hasAttribute('data-nueva')) {
      recogerPendientes(fondo);
      preguntas.push({ g: '', ops: [], multi: false, si: [] });
      return pintarTodo(fondo, `[data-nombre="${preguntas.length - 1}"]`);
    }

    if (b.dataset.borra !== undefined) {
      const fuera = preguntas.splice(Number(b.dataset.borra), 1)[0];
      // Las preguntas de abajo pueden estar condicionadas a una respuesta que
      // acaba de desaparecer. Si se dejara, no volverían a aparecer nunca.
      for (const p of preguntas) p.si = p.si.filter((v) => !fuera.ops.includes(v));
      return pintarTodo(fondo);
    }

    if (b.dataset.sube !== undefined) return mover(fondo, Number(b.dataset.sube), -1);
    if (b.dataset.baja !== undefined) return mover(fondo, Number(b.dataset.baja), +1);

    /* Respuestas */
    if (b.dataset.quita) {
      const [i, j] = b.dataset.quita.split('.').map(Number);
      const fuera = preguntas[i].ops.splice(j, 1)[0];
      for (const p of preguntas) p.si = p.si.filter((v) => v !== fuera);
      return pintarTodo(fondo);
    }

    /* Condición «sólo si antes eligió…» */
    if (b.dataset.si !== undefined) {
      const p = preguntas[Number(b.dataset.si)];
      const v = b.dataset.valor;
      p.si = p.si.includes(v) ? p.si.filter((x) => x !== v) : [...p.si, v];
      return pintarTodo(fondo);
    }

    /* Vista previa */
    if (b.dataset.previa !== undefined) return tocarPrevia(fondo, b.dataset.previa, b.dataset.grupo);
    if (b.hasAttribute('data-limpiar')) { elegidas = []; return pintarPrevia(fondo); }

    /* Modo texto */
    if (b.hasAttribute('data-aplicar')) return aplicarTexto(fondo);
  }

  /**
   * Pasa un submenú escrito a la lista que se edita aquí dentro.
   *
   * Va como `function` y no como `const`: todo esto vive DESPUÉS del `return`
   * de arriba, y una constante declarada ahí nunca llega a existir — al tocar
   * una plantilla no pasaba nada, sin error a la vista. Las funciones
   * declaradas sí se adelantan.
   */
  function copiarPreguntas(texto) {
    return (parseOpciones(texto) ?? []).map((p) => ({
      g: p.g, ops: [...p.ops], multi: !!p.multi, si: p.si ? [...p.si] : [],
    }));
  }

  function aplicarTexto(fondo) {
    const crudo = fondo.querySelector('#sm-crudo').value;
    const leidas = crudo.trim() ? parseOpciones(crudo) : [];

    if (leidas === null) {
      const mala = crudo.split('\n').map((l) => l.trim()).filter(Boolean)
        .find((l) => !l.replace(/\[[^\]]*\]/g, '').includes(':'));

      return mostrarError(fondo, mala
        ? `«${mala}» no se entiende: le falta el «:». Va así — Pregunta: respuesta, respuesta.`
        : 'Cada renglón va como Pregunta: respuesta, respuesta.');
    }

    preguntas = leidas.map((p) => ({
      g: p.g, ops: [...p.ops], multi: !!p.multi, si: p.si ? [...p.si] : [],
    }));
    elegidas = [];
    pintarTodo(fondo);
    fondo.querySelector('#sm-crudo-detalle').open = true;
  }

  function mover(fondo, i, salto) {
    const j = i + salto;
    if (j < 0 || j >= preguntas.length) return;
    [preguntas[i], preguntas[j]] = [preguntas[j], preguntas[i]];

    // Al cambiar el orden, una condición puede quedar apuntando a una
    // respuesta que ahora se contesta DESPUÉS. Eso escondería la pregunta
    // para siempre, así que se suelta.
    preguntas.forEach((p, k) => {
      p.si = p.si.filter((v) => respuestasPrevias(k).includes(v));
    });

    pintarTodo(fondo);
  }

  function tocarPrevia(fondo, valor, grupo) {
    const p = completas().find((x) => x.g === grupo);
    if (!p) return;

    if (p.multi) {
      elegidas = elegidas.includes(valor)
        ? elegidas.filter((v) => v !== valor)
        : [...elegidas, valor];
    } else {
      // De una sola respuesta: la nueva reemplaza a la que hubiera de ese grupo.
      elegidas = elegidas.filter((v) => !p.ops.includes(v));
      elegidas.push(valor);
    }
    pintarPrevia(fondo);
  }

  /* ── Escribir ────────────────────────────────────────────────────────── */

  function alEscribir(e, fondo) {
    const campo = e.target;

    if (campo.dataset.nombre !== undefined) {
      const limpio = limpiarPregunta(campo.value);
      if (limpio !== campo.value) campo.value = limpio;   // sin «:» ni corchetes
      preguntas[Number(campo.dataset.nombre)].g = limpio;
      // La lista NO se repinta: se perdería el cursor a media palabra.
      pintarPrevia(fondo);
      pintarTexto(fondo);
      return;
    }

    // Pegar «Coca, Coca Light, Sprite» de un jalón crea las tres etiquetas.
    if (campo.dataset.nuevaop !== undefined && campo.value.includes(',')) {
      const i = Number(campo.dataset.nuevaop);
      const partes = campo.value.split(',').map(limpiarRespuesta).filter(Boolean);

      // Si el texto no termina en coma, lo último todavía se está escribiendo:
      // se deja en el campo en vez de convertirlo en etiqueta a medias.
      const ultima = campo.value.trimEnd().endsWith(',') ? null : partes.pop();

      for (const v of partes) if (!preguntas[i].ops.includes(v)) preguntas[i].ops.push(v);

      campo.value = '';
      pintarTodo(fondo, `[data-nuevaop="${i}"]`);

      if (ultima) {
        const nuevo = fondo.querySelector(`[data-nuevaop="${i}"]`);
        if (nuevo) nuevo.value = ultima;
      }
    }
  }

  function alCambiar(e, fondo) {
    if (e.target.dataset.multi !== undefined) {
      preguntas[Number(e.target.dataset.multi)].multi = e.target.checked;
      pintarPrevia(fondo);
      pintarTexto(fondo);
    }
  }

  function alTeclear(e, fondo) {
    if (e.key !== 'Enter') return;

    const campo = e.target;

    // Enter en una respuesta la agrega y deja el cursor listo para la
    // siguiente. Se pueden capturar ocho marcas de cerveza sin soltar el
    // teclado ni tocar el ratón.
    if (campo.dataset.nuevaop !== undefined) {
      e.preventDefault();
      e.stopPropagation();

      const i = Number(campo.dataset.nuevaop);
      const valor = limpiarRespuesta(campo.value);
      campo.value = '';
      if (valor && !preguntas[i].ops.includes(valor)) preguntas[i].ops.push(valor);

      return pintarTodo(fondo, `[data-nuevaop="${i}"]`);
    }

    // Enter en el nombre de la pregunta salta a capturar sus respuestas.
    if (campo.dataset.nombre !== undefined) {
      e.preventDefault();
      e.stopPropagation();
      fondo.querySelector(`[data-nuevaop="${campo.dataset.nombre}"]`)?.focus();
    }
  }
}
