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

import { VERSION } from './config.js';

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
