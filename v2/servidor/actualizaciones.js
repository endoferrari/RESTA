/**
 * SERVIDOR · BUSCAR SI HAY UNA VERSIÓN NUEVA
 * ─────────────────────────────────────────────────────────────────────────────
 * El botón 🔄 que tenía la v1.3.0, adaptado a que la v2 es un programa
 * instalado y no un archivo suelto.
 *
 * LA DIFERENCIA IMPORTANTE CON LA v1:
 * La v1 era un solo `RESTA.html`, así que el botón podía bajarlo y escribirlo
 * encima. La v2 son varios archivos, una base de datos y una biblioteca
 * compilada (better-sqlite3); reemplazarlos con el programa corriendo es
 * la mejor forma de dejar el punto de venta inservible un sábado.
 *
 * Así que aquí NO se instala nada: se avisa y se abre la descarga. Instalar
 * lo hace el instalador de siempre, con RESTA cerrado. Los datos viven en
 * C:\RESTA, fuera de la carpeta del programa, así que actualizar nunca los
 * toca.
 *
 * La consulta se hace desde el SERVIDOR y no desde la pantalla porque
 * GitHub no deja que una página de otro sitio le pregunte (CORS), y porque
 * así las tablets no necesitan internet: basta con que lo tenga la laptop.
 */

import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rm, rename, stat, readFile, mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import { join } from 'node:path';

import { VERSION } from './config.js';
import { DIR_ACTUALIZACIONES } from '../datos/rutas-datos.js';

const REPO = 'endoferrari/RESTA';
const DONDE_PREGUNTAR = `https://api.github.com/repos/${REPO}/releases/latest`;

// Preguntar cada vez que alguien abre la pantalla sería regalarle a GitHub
// una consulta por clic. Con guardar la respuesta media hora sobra: nadie
// publica dos versiones en media hora.
const CUANTO_DURA = 30 * 60 * 1000;
let guardado = null;

/**
 * Compara «2.0.1» con «2.0.0» sin librerías.
 * Devuelve true si `candidata` es más nueva que `actual`.
 *
 * Los sufijos tipo «-fase6» o «-beta» se ignoran al comparar: lo que manda
 * son los números. Una versión con sufijo NO se considera más nueva que la
 * misma sin él, para no ofrecer una beta a un bar que está trabajando.
 */
export function esMasNueva(candidata, actual) {
  const partes = (v) => String(v).replace(/^v/, '').split('-')[0].split('.').map(Number);

  const a = partes(candidata);
  const b = partes(actual);

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

/**
 * ¿Hay algo nuevo?
 *
 * Nunca lanza: quedarse sin internet no puede romper una pantalla del punto
 * de venta. Si algo falla se contesta «no pude preguntar» y ya.
 */
export async function buscarActualizacion({ forzar = false } = {}) {
  if (!forzar && guardado && Date.now() - guardado.cuando < CUANTO_DURA) {
    return guardado.respuesta;
  }

  const respuesta = await preguntarleAGitHub();
  guardado = { cuando: Date.now(), respuesta };
  return respuesta;
}

async function preguntarleAGitHub() {
  const base = { instalada: VERSION, hayNueva: false };

  try {
    // Con un límite de tiempo: si no hay internet, la pantalla no se puede
    // quedar colgada esperando a que caduque la conexión sola.
    const corte = AbortSignal.timeout(8000);

    const r = await fetch(DONDE_PREGUNTAR, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': `RESTA/${VERSION}` },
      signal: corte,
    });

    if (r.status === 404) {
      return { ...base, sePudo: true, motivo: 'Todavía no hay ninguna versión publicada.' };
    }
    if (!r.ok) {
      return { ...base, sePudo: false, motivo: `GitHub contestó ${r.status}.` };
    }

    const suelta = await r.json();
    const ultima = String(suelta.tag_name ?? '').replace(/^v/, '');
    if (!ultima) return { ...base, sePudo: true, motivo: 'La publicación no trae número de versión.' };

    // El instalador entre los archivos de la publicación
    const instalador = (suelta.assets ?? []).find((a) => /\.exe$/i.test(a.name ?? ''));

    return {
      ...base,
      sePudo: true,
      hayNueva: esMasNueva(ultima, VERSION),
      ultima,
      notas: suelta.body ?? '',
      publicada: suelta.published_at ?? null,
      descarga: instalador?.browser_download_url ?? suelta.html_url,
      tamano: instalador?.size ?? null,
      // Con qué se comprueba que el archivo bajó entero y sin manipular.
      // Importa más de lo que parece: este archivo se va a EJECUTAR.
      nombreArchivo: instalador?.name ?? null,
      firma: instalador?.digest ?? null,
      motivo: null,
    };
  } catch (e) {
    return {
      ...base,
      sePudo: false,
      motivo: e.name === 'TimeoutError'
        ? 'GitHub no contestó. Puede que la laptop no tenga internet.'
        : 'No se pudo preguntar a GitHub. Revisa la conexión.',
    };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   BAJARLA SIN NAVEGADOR

   Hasta ahora el botón le pedía a Windows «ábrele este enlace al navegador».
   Eso se rompió el 25-ago-2026 en la laptop del bar: al desaparecer Chrome,
   Windows se quedó sin saber con qué abrir un enlace y contestaba «no se ha
   encontrado la aplicación». El botón no hacía nada, y desde la pantalla no
   había forma de adivinar por qué.

   La lección no es «arregla Windows»: es que el punto de venta no puede
   depender de otro programa para poder actualizarse. Ahora RESTA se baja su
   propio instalador con su propia conexión y lo deja listo.

   Y como este archivo se va a EJECUTAR, se comprueban tres cosas antes de
   tocarlo: que venga del repositorio de RESTA y de ningún otro sitio, que
   pese exactamente lo que GitHub dijo, y que su huella sha256 coincida. Si
   algo no cuadra, se borra y no se ejecuta nada.
   ═══════════════════════════════════════════════════════════════════════════ */

/** De aquí y de ningún otro lado. */
const DE_DONDE = `https://github.com/${REPO}/releases/download/`;

const descarga = {
  estado: 'quieta',        // 'quieta' · 'bajando' · 'lista' · 'error'
  version: null,
  bajado: 0,
  total: 0,
  porcentaje: 0,
  ruta: null,
  error: null,
};

export function estadoDeLaDescarga() {
  return { ...descarga, sePuedeInstalarSolo: sePuedeInstalarSolo() };
}

let avisarAvance = null;

/** La app registra aquí cómo avisarle a las pantallas por la línea abierta. */
export function alAvanzarLaDescarga(fn) { avisarAvance = fn; }

function moverLaAguja() {
  try { avisarAvance?.(estadoDeLaDescarga()); } catch { /* un aviso no tumba la descarga */ }
}

/**
 * ¿Este archivo es el que GitHub dijo que era?
 *
 * Va aparte y sin tocar el disco para poder probarlo: es la comprobación de
 * la que depende que no se ejecute cualquier cosa.
 */
export function revisarInstalador({ url, tamanoEsperado, tamanoReal, firmaEsperada, firmaReal }) {
  if (!String(url ?? '').startsWith(DE_DONDE)) {
    return { bien: false, motivo: 'Ese archivo no viene de las publicaciones de RESTA.' };
  }

  if (tamanoEsperado && tamanoReal !== tamanoEsperado) {
    return {
      bien: false,
      motivo: `El archivo llegó incompleto: ${tamanoReal} bytes de ${tamanoEsperado}.`,
    };
  }

  // GitHub la manda como «sha256:abc…». Si algún día dejara de mandarla, se
  // sigue adelante con el tamaño: es menos comprobación, pero es la que hay.
  if (firmaEsperada) {
    const esperada = String(firmaEsperada).replace(/^sha256:/i, '').toLowerCase();
    if (esperada !== String(firmaReal ?? '').toLowerCase()) {
      return { bien: false, motivo: 'La huella del archivo no coincide con la que publicó GitHub.' };
    }
  }

  return { bien: true, motivo: null };
}

/** La huella de un archivo que ya está en el disco. */
async function huellaDe(ruta) {
  return createHash('sha256').update(await readFile(ruta)).digest('hex');
}

/**
 * Baja el instalador de la última versión.
 *
 * Si ya estaba bajado y verifica bien, no lo vuelve a bajar: son más de 100 MB
 * y en el WiFi del bar eso son varios minutos.
 */
export async function descargarActualizacion({ traer = fetch, publicacion = null } = {}) {
  if (descarga.estado === 'bajando') return estadoDeLaDescarga();

  // `publicacion` y `traer` existen para poder PROBAR esto sin red y sin
  // bajar cien megas de verdad. En el bar siempre van vacíos.
  const info = publicacion ?? await buscarActualizacion({ forzar: true });

  if (!info.sePudo)         throw new Error(info.motivo ?? 'No se pudo preguntar a GitHub.');
  if (!info.hayNueva)       throw new Error('Ya estás en la última versión.');
  if (!info.nombreArchivo)  throw new Error('Esa publicación no trae instalador.');

  const destino = join(DIR_ACTUALIZACIONES, info.nombreArchivo);
  const aMedias = `${destino}.parte`;

  // La carpeta se crea al arrancar, pero también aquí: una instalación vieja
  // que se actualice puede no tenerla todavía, y quedarse sin poder
  // actualizarse por una carpeta que falta sería absurdo.
  await mkdir(DIR_ACTUALIZACIONES, { recursive: true });

  // ¿Ya estaba bajado de un intento anterior que se cortó al final?
  try {
    const y = await stat(destino);
    const r = revisarInstalador({
      url: info.descarga,
      tamanoEsperado: info.tamano, tamanoReal: y.size,
      firmaEsperada: info.firma, firmaReal: await huellaDe(destino),
    });

    if (r.bien) {
      Object.assign(descarga, {
        estado: 'lista', version: info.ultima, bajado: y.size, total: y.size,
        porcentaje: 100, ruta: destino, error: null,
      });
      moverLaAguja();
      return estadoDeLaDescarga();
    }

    await rm(destino, { force: true });      // estaba a medias o mal: se tira
  } catch { /* no estaba: se baja */ }

  Object.assign(descarga, {
    estado: 'bajando', version: info.ultima, bajado: 0,
    total: info.tamano ?? 0, porcentaje: 0, ruta: null, error: null,
  });
  moverLaAguja();

  try {
    if (!String(info.descarga).startsWith(DE_DONDE)) {
      throw new Error('Ese archivo no viene de las publicaciones de RESTA.');
    }

    const r = await traer(info.descarga, {
      headers: { 'user-agent': `RESTA/${VERSION}` },
      redirect: 'follow',
    });
    if (!r.ok) throw new Error(`GitHub contestó ${r.status} al pedirle el archivo.`);

    await rm(aMedias, { force: true });
    const papel = createWriteStream(aMedias);
    const huella = createHash('sha256');
    let ultimoAviso = -1;

    for await (const trozo of r.body) {
      huella.update(trozo);
      descarga.bajado += trozo.length;

      if (!papel.write(trozo)) await once(papel, 'drain');

      // Se avisa cada punto porcentual y no en cada pedazo: en 100 MB son
      // miles de pedazos, y avisar en todos ahogaría la línea de las tablets.
      const ahora = descarga.total
        ? Math.floor((descarga.bajado / descarga.total) * 100)
        : 0;
      if (ahora !== ultimoAviso) {
        ultimoAviso = ahora;
        descarga.porcentaje = ahora;
        moverLaAguja();
      }
    }

    await new Promise((listo, falla) => papel.end((e) => (e ? falla(e) : listo())));

    const revision = revisarInstalador({
      url: info.descarga,
      tamanoEsperado: info.tamano, tamanoReal: (await stat(aMedias)).size,
      firmaEsperada: info.firma, firmaReal: huella.digest('hex'),
    });

    if (!revision.bien) {
      await rm(aMedias, { force: true });
      throw new Error(revision.motivo);
    }

    // Sólo cuando está entero y verificado toma su nombre definitivo. Así
    // nunca existe un «RESTA-Setup.exe» a medio bajar que alguien pueda
    // abrir por error.
    await rename(aMedias, destino);

    Object.assign(descarga, { estado: 'lista', porcentaje: 100, ruta: destino, error: null });
    moverLaAguja();
    return estadoDeLaDescarga();
  } catch (e) {
    await rm(aMedias, { force: true }).catch(() => {});
    Object.assign(descarga, { estado: 'error', error: e.message, ruta: null });
    moverLaAguja();
    throw e;
  }
}

/* ── Instalarla ────────────────────────────────────────────────────────── */

let arrancarElInstalador = null;

/**
 * La ventana de escritorio registra aquí cómo lanzar el instalador y cerrarse.
 *
 * Va por este camino y no importando electron porque `servidor/` no sabe —ni
 * tiene por qué saber— que existe una ventana: RESTA también corre sin ella.
 */
export function alPedirInstalar(fn) { arrancarElInstalador = fn; }

export function sePuedeInstalarSolo() { return typeof arrancarElInstalador === 'function'; }

/**
 * Cierra RESTA y abre el instalador.
 *
 * El instalador se lanza por su RUTA, no por un enlace, y ahí está la gracia:
 * esto funciona aunque Windows haya perdido con qué abrir las páginas web,
 * que es exactamente lo que dejó muerto al botón anterior.
 */
export function instalarActualizacion() {
  if (descarga.estado !== 'lista' || !descarga.ruta) {
    throw new Error('Todavía no está bajado el instalador.');
  }

  if (!arrancarElInstalador) {
    throw new Error(
      `Aquí RESTA no se puede reiniciar solo. Ciérralo y abre a mano ${descarga.ruta}.`
    );
  }

  const ruta = descarga.ruta;

  // Se contesta ANTES de cerrarse: si RESTA se apagara primero, la pantalla
  // se quedaría esperando una respuesta que ya no puede llegar y parecería
  // que el botón falló.
  setTimeout(() => {
    try { arrancarElInstalador(ruta); } catch { /* ya no queda a quién avisarle */ }
  }, 400);

  return { ruta, version: descarga.version };
}
