/**
 * CLIENTE · PANTALLA DE COBRO
 * ─────────────────────────────────────────────────────────────────────────────
 * Donde se cierra la noche, mesa por mesa.
 *
 * Está pensada para alguien con gente formada enfrente: lo que más se usa
 * (cobrar todo en efectivo) es un botón grande, y lo raro (dividir entre 4,
 * cada quien lo suyo, descuento) está a un toque pero no estorba.
 *
 * IMPORTANTE: esta pantalla no calcula NADA de dinero. Ni el total, ni el
 * cambio, ni cuánto le toca a cada quien. Todo eso lo pide al servidor y sólo
 * lo pinta. Si esta pantalla tuviera un error, la caja seguiría cuadrando.
 */

import { api } from '../api.js';
import { estado, puede } from '../estado.js';
import { $, esc, avisar, confirmar, pedirTexto, ventana } from '../ui.js';
import { formatear } from '/nucleo/dinero.js';

let alVolver = null;
let alCerrarCuenta = null;

/** Cómo se está decidiendo cuánto cobrar en este momento. */
let modo = 'todo';              // 'todo' · 'parte' · 'renglones'
let montoParte = 0;             // centavos, cuando modo = 'parte'
let seleccion = new Set();      // ids de renglones, cuando modo = 'renglones'
let metodo = 'efectivo';
let recibido = '';              // lo que teclea la caja, como texto

const MOTIVOS_CORTESIA = [
  'Se tardó mucho', 'Cumpleaños', 'Vino mal preparado',
  'Cliente frecuente', 'Cortesía de la casa',
];

export function iniciarCobro(cuandoVuelva, cuandoCierre) {
  alVolver = cuandoVuelva;
  alCerrarCuenta = cuandoCierre;

  $('volver-de-cobro').addEventListener('click', () => alVolver?.());
  $('cobro-renglones').addEventListener('click', alTocarRenglon);
  $('cobro-modos').addEventListener('click', alTocarModo);
  $('cobro-metodos').addEventListener('click', alTocarMetodo);
  $('cobro-teclado').addEventListener('click', alTocarTecla);
  $('boton-cobrar').addEventListener('click', cobrar);
  $('boton-descuento').addEventListener('click', preguntarDescuento);
  $('boton-propina').addEventListener('click', preguntarPropina);
  $('boton-anular-pago').addEventListener('click', anularPago);
}

/** Se llama al entrar a la pantalla: deja todo como recién abierto. */
export function empezarCobro() {
  modo = 'todo';
  montoParte = 0;
  seleccion = new Set();
  metodo = 'efectivo';
  recibido = '';
  pintarCobro();
}

/* ── Cuánto se está cobrando ───────────────────────────────────────────── */

/**
 * Lo que se va a cobrar según el modo.
 * Ojo: en «cada quien lo suyo» esto es sólo una ESTIMACIÓN para que la
 * pantalla enseñe algo. El monto bueno lo calcula el servidor repartiendo el
 * descuento y la propina en proporción.
 */
function aCobrar() {
  const c = estado.cuenta;
  if (!c) return 0;

  if (modo === 'parte') return Math.min(montoParte, c.totales.restante);

  if (modo === 'renglones') {
    const t = c.totales;
    if (t.consumo === 0) return 0;
    const parte = c.items
      .filter((i) => seleccion.has(i.id) && !i.cortesia)
      .reduce((n, i) => n + i.precio * i.cant, 0);
    if (parte === 0) return 0;
    if (parte === t.consumo) return t.total;
    return Math.round(parte - t.descuento * (parte / t.consumo) + t.propina * (parte / t.consumo));
  }

  return c.totales.restante;
}

/* ── Pintar ────────────────────────────────────────────────────────────── */

export function pintarCobro() {
  const c = estado.cuenta;
  if (!c) return;

  $('titulo-cobro').textContent = `Cobrar ${c.nombre}`;

  pintarRenglones();
  pintarResumen();
  pintarModos();
  pintarMetodos();
  pintarEfectivo();
  pintarPagos();

  const monto = aCobrar();
  $('boton-cobrar').disabled = monto <= 0;
  $('boton-cobrar').textContent = monto > 0
    ? `Cobrar ${formatear(monto)}`
    : 'Elige cuánto cobrar';
}

function pintarRenglones() {
  const c = estado.cuenta;
  const eligiendo = modo === 'renglones';

  $('cobro-renglones').innerHTML = c.items.map((l) => {
    const marcado = seleccion.has(l.id);
    const clases = ['linea'];
    if (l.pagado) clases.push('linea-pagada');
    if (eligiendo && marcado) clases.push('linea-elegida');

    return `
      <div class="${clases.join(' ')}" data-linea="${l.id}">
        ${eligiendo && !l.pagado && !l.cortesia
          ? `<span class="casilla">${marcado ? '☑' : '☐'}</span>` : ''}
        <span class="linea-cant">${l.cant}</span>
        <span class="linea-texto">
          <span class="linea-nombre">${esc(l.icono)} ${esc(l.nombre)}</span>
          ${l.detalle ? `<span class="linea-detalle">${esc(l.detalle)}</span>` : ''}
          ${l.cortesia
            ? `<span class="linea-marca cortesia">🎁 cortesía — ${esc(l.cortesiaMotivo ?? '')}</span>` : ''}
          ${l.pagado ? '<span class="linea-marca pagada">✔ ya se cobró</span>' : ''}
        </span>
        <span class="linea-importe dinero ${l.cortesia ? 'tachado' : ''}">
          ${formatear(l.precio * l.cant)}
        </span>
        ${puede('cuenta.cortesia') && !l.pagado
          ? `<button class="boton-regalo" data-regalo="${l.id}"
               title="${l.cortesia ? 'Quitar la cortesía' : 'Regalar este renglón'}">🎁</button>`
          : ''}
      </div>`;
  }).join('');
}

function pintarResumen() {
  const t = estado.cuenta.totales;
  const filas = [];

  filas.push(['Consumo', formatear(t.consumo)]);
  if (t.cortesias) filas.push(['Cortesías (no se cobran)', `− ${formatear(t.cortesias)}`]);
  if (t.descuento) filas.push(['Descuento', `− ${formatear(t.descuento)}`]);
  if (t.propina)   filas.push(['Propina', `+ ${formatear(t.propina)}`]);
  if (t.pagado)    filas.push(['Ya pagado', `− ${formatear(t.pagado)}`]);

  $('cobro-resumen').innerHTML =
    filas.map(([et, v]) =>
      `<div class="fila-total sutil"><span>${et}</span><span class="dinero">${v}</span></div>`).join('') +
    `<div class="fila-total fila-gran">
       <span>${t.pagado ? 'Falta' : 'Total'}</span>
       <span class="dinero">${formatear(t.restante)}</span>
     </div>`;
}

function pintarModos() {
  const opciones = [
    ['todo', 'Todo'],
    ['parte', 'Una cantidad'],
    ['renglones', 'Cada quien lo suyo'],
  ];
  $('cobro-modos').innerHTML = opciones.map(([clave, texto]) =>
    `<button class="op ${modo === clave ? 'activo' : ''}" data-modo="${clave}">${texto}</button>`
  ).join('') + '<button class="op" data-modo="dividir">Dividir entre…</button>';
}

function pintarMetodos() {
  const opciones = [
    ['efectivo', '💵 Efectivo'],
    ['tarjeta', '💳 Tarjeta'],
    ['transferencia', '📱 Transferencia'],
  ];
  $('cobro-metodos').innerHTML = opciones.map(([clave, texto]) =>
    `<button class="op ${metodo === clave ? 'activo' : ''}" data-metodo="${clave}">${texto}</button>`
  ).join('');
}

/** El teclado y el cambio sólo tienen sentido si paga en efectivo. */
function pintarEfectivo() {
  const esEfectivo = metodo === 'efectivo';
  $('cobro-efectivo').hidden = !esEfectivo;
  if (!esEfectivo) return;

  const monto = aCobrar();
  const dieron = aCentavosDelTeclado(recibido);

  $('cobro-recibido').textContent = recibido ? formatear(dieron) : '—';

  if (dieron === 0) {
    $('cobro-cambio').innerHTML =
      '<span class="cambio-nota">Si te dan una cantidad, tecléala y te digo el cambio.</span>';
  } else if (dieron < monto) {
    $('cobro-cambio').innerHTML =
      `<span class="cambio-falta">Faltan ${formatear(monto - dieron)}</span>`;
  } else {
    $('cobro-cambio').innerHTML =
      `<span class="cambio-et">Cambio</span>
       <span class="cambio-valor dinero">${formatear(dieron - monto)}</span>`;
  }
}

function pintarPagos() {
  const pagos = estado.cuenta.pagos;
  $('cobro-pagos').hidden = pagos.length === 0;
  if (pagos.length === 0) return;

  $('lista-pagos').innerHTML = pagos.map((p) => `
    <div class="pago">
      <span>${nombreMetodo(p.metodo)}</span>
      <span class="dinero">${formatear(p.monto)}</span>
      <span class="pago-quien">${esc(p.cobradoPor ?? '')}</span>
    </div>`).join('');
}

const nombreMetodo = (m) => ({
  efectivo: '💵 Efectivo', tarjeta: '💳 Tarjeta', transferencia: '📱 Transferencia',
}[m] ?? m);

/* ── El teclado de cantidades ──────────────────────────────────────────── */

/**
 * Lo tecleado se lee como centavos, igual que en las cajas registradoras:
 * teclear 1 0 0 0 son $10.00. Así nadie tiene que buscar el punto decimal
 * con prisa.
 */
function aCentavosDelTeclado(texto) {
  const soloNumeros = String(texto).replace(/\D/g, '');
  return soloNumeros ? Number(soloNumeros) : 0;
}

function alTocarTecla(e) {
  const b = e.target.closest('[data-tecla]');
  if (!b) return;

  const t = b.dataset.tecla;
  if (t === 'borrar') recibido = recibido.slice(0, -1);
  else if (t === 'limpiar') recibido = '';
  else if (t.startsWith('billete')) recibido = String(Number(t.split(':')[1]));
  else if (recibido.length < 8) recibido += t;

  pintarEfectivo();
  pintarCobro();
}

/* ── Tocar cosas ───────────────────────────────────────────────────────── */

async function alTocarModo(e) {
  const b = e.target.closest('[data-modo]');
  if (!b) return;

  if (b.dataset.modo === 'dividir') return preguntarDivision();

  modo = b.dataset.modo;
  seleccion = new Set();
  recibido = '';

  if (modo === 'parte') {
    const monto = await preguntarCantidad();
    if (monto === null) { modo = 'todo'; }
    else montoParte = monto;
  }

  pintarCobro();
}

function alTocarMetodo(e) {
  const b = e.target.closest('[data-metodo]');
  if (!b) return;
  metodo = b.dataset.metodo;
  recibido = '';
  pintarCobro();
}

async function alTocarRenglon(e) {
  const regalo = e.target.closest('[data-regalo]');
  if (regalo) return alternarCortesia(Number(regalo.dataset.regalo));

  if (modo !== 'renglones') return;

  const b = e.target.closest('[data-linea]');
  if (!b) return;

  const id = Number(b.dataset.linea);
  const linea = estado.cuenta.items.find((l) => l.id === id);
  if (!linea || linea.pagado || linea.cortesia) return;

  if (seleccion.has(id)) seleccion.delete(id);
  else seleccion.add(id);

  pintarCobro();
}

/* ── Cortesía ──────────────────────────────────────────────────────────── */

async function alternarCortesia(lineaId) {
  const c = estado.cuenta;
  const linea = c.items.find((l) => l.id === lineaId);
  if (!linea) return;

  let motivo = null;

  if (!linea.cortesia) {
    motivo = await pedirTexto(
      `Regalar ${linea.nombre}`,
      `Se dejarán de cobrar ${formatear(linea.precio * linea.cant)}. ¿Por qué se regala?`,
      { sugerencias: MOTIVOS_CORTESIA },
    );
    if (!motivo) return;
  } else {
    const seguro = await confirmar(
      'Quitar la cortesía',
      `«${esc(linea.nombre)}» volvería a cobrarse. ¿Seguro?`,
      'Quitar cortesía',
    );
    if (!seguro) return;
  }

  try {
    const r = await api.cortesia(c.id, lineaId, !linea.cortesia, motivo, c.version);
    estado.cuenta = r.cuenta;
    pintarCobro();
    avisar(linea.cortesia ? 'Cortesía quitada' : 'Renglón regalado');
  } catch (err) {
    if (err.cuenta) { estado.cuenta = err.cuenta; pintarCobro(); }
    avisar(err.message, true);
  }
}

/* ── Descuento y propina ───────────────────────────────────────────────── */

function preguntarDescuento() {
  return preguntarPorcentajeOMonto({
    titulo: 'Descuento',
    explica: 'Se aplica sobre el consumo, antes de la propina.',
    porcentajes: [10, 15, 20, 50],
    async alElegir(tipo, valor) {
      const motivo = valor > 0
        ? await pedirTexto('Descuento', '¿Por qué se hace el descuento?', {
            sugerencias: ['Cliente frecuente', 'Promoción', 'Se tardó el servicio', 'Cortesía de la casa'],
          })
        : null;
      if (valor > 0 && !motivo) return;

      try {
        const c = estado.cuenta;
        const r = await api.descuento(c.id, tipo, valor, motivo, c.version);
        estado.cuenta = r.cuenta;
        pintarCobro();
        avisar(valor > 0 ? 'Descuento aplicado' : 'Descuento quitado');
      } catch (err) {
        if (err.cuenta) { estado.cuenta = err.cuenta; pintarCobro(); }
        avisar(err.message, true);
      }
    },
  });
}

function preguntarPropina() {
  return preguntarPorcentajeOMonto({
    titulo: 'Propina',
    explica: 'Se calcula sobre el subtotal, o sea después del descuento.',
    porcentajes: [10, 15, 20],
    async alElegir(tipo, valor) {
      try {
        const c = estado.cuenta;
        const r = await api.propina(c.id, tipo, valor, c.version);
        estado.cuenta = r.cuenta;
        pintarCobro();
        avisar(valor > 0 ? 'Propina agregada' : 'Propina quitada');
      } catch (err) {
        if (err.cuenta) { estado.cuenta = err.cuenta; pintarCobro(); }
        avisar(err.message, true);
      }
    },
  });
}

function preguntarPorcentajeOMonto({ titulo, explica, porcentajes, alElegir }) {
  return ventana({
    titulo,
    cuerpo: `
      <p class="texto-ventana">${esc(explica)}</p>
      <div class="grupo-titulo" style="margin-top:14px">Por porcentaje</div>
      <div class="grupo-botones" id="pct">
        ${porcentajes.map((p) => `<button type="button" class="op" data-pct="${p}">${p}%</button>`).join('')}
      </div>
      <div class="grupo-titulo" style="margin-top:16px">Por cantidad</div>
      <label class="etiqueta-campo" for="campo-monto">En pesos</label>
      <input class="campo" id="campo-monto" type="text" inputmode="numeric" autocomplete="off"
             placeholder="Por ejemplo: 50">
      <div class="grupo-botones" style="margin-top:14px">
        <button type="button" class="op" id="quitar-esto">Quitar</button>
      </div>`,
    botones: [
      { texto: 'Cerrar', valor: null },
      {
        texto: 'Aplicar cantidad',
        clase: 'btn-ambar',
        valor: (fondo) => {
          const pesos = Number(String(fondo.querySelector('#campo-monto').value).replace(/[^\d]/g, ''));
          if (!pesos) return undefined;
          alElegir('monto', pesos * 100);
          return true;
        },
      },
    ],
    alAbrir(fondo, terminar) {
      fondo.querySelector('#pct').addEventListener('click', (e) => {
        const b = e.target.closest('[data-pct]');
        if (!b) return;
        alElegir('porcentaje', Number(b.dataset.pct));
        terminar(true);
      });
      fondo.querySelector('#quitar-esto').addEventListener('click', () => {
        alElegir('porcentaje', 0);
        terminar(true);
      });
    },
  });
}

/* ── Dividir entre N ───────────────────────────────────────────────────── */

async function preguntarDivision() {
  const personas = await ventana({
    titulo: 'Dividir la cuenta',
    cuerpo: `
      <p class="texto-ventana">¿Entre cuántas personas se divide lo que falta?</p>
      <div class="grupo-botones" id="personas">
        ${[2, 3, 4, 5, 6, 8, 10].map((n) =>
          `<button type="button" class="op" data-n="${n}">${n}</button>`).join('')}
      </div>`,
    botones: [{ texto: 'Cancelar', valor: null }],
    alAbrir(fondo, terminar) {
      fondo.querySelector('#personas').addEventListener('click', (e) => {
        const b = e.target.closest('[data-n]');
        if (b) terminar(Number(b.dataset.n));
      });
    },
  });

  if (!personas) return;

  try {
    // El reparto lo hace el servidor: los centavos sobrantes se reparten
    // siempre igual y la suma da exacto.
    const r = await api.dividir(estado.cuenta.id, personas);

    const elegida = await ventana({
      titulo: `Entre ${personas}`,
      cuerpo: `
        <p class="texto-ventana">
          A cada quien le toca esto. Toca la parte que vas a cobrar ahora;
          las demás se cobran una por una.
        </p>
        <div class="grupo-botones" id="partes">
          ${r.partes.map((p, i) =>
            `<button type="button" class="op" data-parte="${p}">
               ${i + 1}ª · ${formatear(p)}
             </button>`).join('')}
        </div>`,
      botones: [{ texto: 'Cancelar', valor: null }],
      alAbrir(fondo, terminar) {
        fondo.querySelector('#partes').addEventListener('click', (e) => {
          const b = e.target.closest('[data-parte]');
          if (b) terminar(Number(b.dataset.parte));
        });
      },
    });

    if (!elegida) return;

    modo = 'parte';
    montoParte = elegida;
    recibido = '';
    pintarCobro();
  } catch (e) {
    avisar(e.message, true);
  }
}

async function preguntarCantidad() {
  const texto = await pedirTexto('¿Cuánto se cobra?', 'La cantidad en pesos');
  if (!texto) return null;
  const pesos = Number(String(texto).replace(/[^\d]/g, ''));
  return pesos ? pesos * 100 : null;
}

/* ── Cobrar ────────────────────────────────────────────────────────────── */

async function cobrar() {
  const c = estado.cuenta;
  const cuerpo = { metodo, version: c.version };

  if (modo === 'renglones') {
    if (seleccion.size === 0) return avisar('Elige qué renglones se cobran.', true);
    cuerpo.lineas = [...seleccion];
  } else if (modo === 'parte') {
    cuerpo.monto = montoParte;
  }

  if (metodo === 'efectivo' && recibido) {
    cuerpo.recibido = aCentavosDelTeclado(recibido);
  }

  if (metodo === 'tarjeta') {
    const ref = await pedirTexto('Tarjeta', 'Últimos 4 números (opcional, para aclaraciones)');
    if (ref) cuerpo.referencia = ref;
  }

  try {
    const r = await api.cobrar(c.id, cuerpo);
    estado.cuenta = r.cuenta;

    if (r.aviso) avisar(r.aviso);

    // Una sola ventana con lo que hace falta saber. Van juntas a propósito:
    // el cambio es lo primero que se busca con la vista, y si fueran dos
    // ventanas habría que tocar dos veces con el cliente esperando.
    if (r.pago.cambio > 0 || r.ticket) {
      const partes = [];

      if (r.pago.cambio > 0) {
        partes.push(`
          <div class="cambio-et" style="text-align:center">Cambio para el cliente</div>
          <div class="cambio-grande dinero">${formatear(r.pago.cambio)}</div>`);
      }

      if (r.ticket) {
        partes.push(`
          <p class="texto-ventana" style="text-align:center">
            <b>${esc(r.cuenta.nombre)}</b> quedó pagada ·
            total <b>${formatear(r.ticket.totales.total)}</b><br>
            <span style="color:var(--tinta-suave);font-size:.88rem">
              Ticket ${r.ticket.folio} guardado. La impresión llega en la fase 5.
            </span>
          </p>`);
      }

      await ventana({
        titulo: r.ticket ? `Cuenta cerrada · ticket ${r.ticket.folio}` : 'Cobrado',
        cuerpo: partes.join(''),
        botones: [{ texto: 'Listo', valor: true, clase: 'btn-ambar' }],
      });
    }

    if (r.ticket) {
      alCerrarCuenta?.();
      return;
    }

    // Pago parcial: se sigue cobrando lo que falta.
    modo = 'todo';
    seleccion = new Set();
    recibido = '';
    pintarCobro();
    avisar(`Cobrado ${formatear(r.pago.monto)}. Faltan ${formatear(r.cuenta.totales.restante)}.`);
  } catch (err) {
    if (err.cuenta) { estado.cuenta = err.cuenta; pintarCobro(); }
    avisar(err.message, true);
  }
}

/* ── Deshacer ──────────────────────────────────────────────────────────── */

async function anularPago() {
  const motivo = await pedirTexto(
    'Deshacer el último pago',
    '¿Por qué se deshace?',
    { sugerencias: ['Se tecleó de más', 'Era otra mesa', 'El pago no pasó', 'Cambió de forma de pago'] },
  );
  if (!motivo) return;

  try {
    const c = estado.cuenta;
    const r = await api.anularPago(c.id, motivo, c.version);
    estado.cuenta = r.cuenta;
    pintarCobro();
    avisar('Pago deshecho. Queda registrado.');
  } catch (err) {
    if (err.cuenta) { estado.cuenta = err.cuenta; pintarCobro(); }
    avisar(err.message, true);
  }
}
