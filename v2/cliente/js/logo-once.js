/**
 * CLIENTE · EL LOGO DE ONCE
 * ─────────────────────────────────────────────────────────────────────────────
 * El logo NO es un archivo: está dibujado con círculos, rectángulos y texto,
 * copiado tal cual de la v1.3.0. Por eso se ve nítido a cualquier tamaño, en
 * la pantalla y en el papel, sin pesar nada ni depender de ninguna imagen que
 * alguien pueda borrar.
 *
 * Y POR QUÉ ESTÁ AQUÍ Y NO EN EL SERVIDOR:
 * porque para imprimirlo en la térmica hay que convertirlo a puntos, y para
 * eso hay que DIBUJARLO. El navegador sabe dibujar; Node, no. Así que el
 * dibujo se hace una sola vez aquí, se manda al servidor ya convertido en
 * puntos, y de ahí en adelante el ticket sale con logo sin volver a
 * dibujarlo nunca.
 *
 * Es la misma idea que usaba la v1, pero hecha una vez en vez de en cada
 * ticket.
 */

/**
 * El logo en SVG. Los colores se pasan aparte para poder sacarlo también en
 * blanco y negro, que es como lo necesita la impresora térmica.
 */
export function svgOnce(azul, amarillo, oscuro, fondo, puntos) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 450">' +
    `<rect width="1000" height="450" fill="${fondo}"/>` +
    `<circle cx="150" cy="168" r="100" stroke="${azul}" stroke-width="42" fill="none"/>` +
    `<rect x="112" y="18" width="76" height="114" fill="${fondo}"/>` +
    `<text x="150" y="124" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="108" fill="${amarillo}">11</text>` +
    `<text x="292" y="285" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="330" fill="${azul}" textLength="670" lengthAdjust="spacingAndGlyphs">NCE</text>` +
    `<rect x="88" y="337" width="100" height="9" fill="${amarillo}"/>` +
    `<rect x="812" y="337" width="100" height="9" fill="${amarillo}"/>` +
    `<text x="500" y="360" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="56" fill="${amarillo}" textLength="590" lengthAdjust="spacingAndGlyphs">SOCIAL LOUNGE</text>` +
    `<rect x="190" y="382" width="620" height="60" rx="8" fill="${oscuro}"/>` +
    `<text x="500" y="425" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="40" fill="#FFFFFF" textLength="560" lengthAdjust="spacingAndGlyphs">DRINKS <tspan fill="${puntos}">•</tspan> SPORTS <tspan fill="${puntos}">•</tspan> FRIENDS</text>` +
    '</svg>';
}

/** Los colores de la marca, tal como los dejó la v1. */
export const LOGO_COLOR  = svgOnce('#3079DF', '#C6D530', '#3D4653', '#FFFFFF', '#C6D530');

/** Todo en negro sobre blanco: así lo necesita la impresora térmica. */
export const LOGO_TICKET = svgOnce('#000000', '#000000', '#000000', '#FFFFFF', '#FFFFFF');

/** Para meterlo en un <img> o en una hoja de estilos. */
export const comoDireccion = (svg) =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(svg);

/**
 * Convierte el logo a los puntos que entiende la térmica.
 *
 * La impresora no sabe de curvas ni de letras: sólo de puntos negros. Aquí
 * el navegador dibuja el logo en un lienzo y luego se lee punto por punto:
 * si es oscuro, se imprime; si no, se deja en blanco.
 *
 * @param anchoDelPapel  576 puntos para papel de 80 mm, 384 para el de 58
 * @param proporcion     qué tanto del ancho ocupa el logo (0.62 como en la v1)
 */
export async function rasterizarLogo({ anchoDelPapel = 576, proporcion = 0.62 } = {}) {
  const imagen = new Image();
  imagen.src = comoDireccion(LOGO_TICKET);

  await new Promise((listo, falla) => {
    imagen.onload = listo;
    imagen.onerror = () => falla(new Error('No se pudo dibujar el logo.'));
  });

  const anchoLogo = Math.round(anchoDelPapel * proporcion);
  const alto = Math.round(anchoLogo * 450 / 1000);      // la proporción del original
  const margen = Math.floor((anchoDelPapel - anchoLogo) / 2);

  const lienzo = document.createElement('canvas');
  lienzo.width = anchoDelPapel;
  lienzo.height = alto;

  const pincel = lienzo.getContext('2d');
  pincel.fillStyle = '#fff';
  pincel.fillRect(0, 0, anchoDelPapel, alto);
  pincel.drawImage(imagen, margen, 0, anchoLogo, alto);

  const pixeles = pincel.getImageData(0, 0, anchoDelPapel, alto).data;

  // Cada byte guarda 8 puntos, uno por bit. Es como lo pide la térmica.
  const anchoEnBytes = anchoDelPapel / 8;
  const bytes = new Uint8Array(anchoEnBytes * alto);

  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < anchoDelPapel; x++) {
      const i = (y * anchoDelPapel + x) * 4;
      const gris = pixeles[i] * 0.299 + pixeles[i + 1] * 0.587 + pixeles[i + 2] * 0.114;

      // Oscuro y no transparente → punto negro
      if (pixeles[i + 3] > 128 && gris < 128) {
        bytes[y * anchoEnBytes + (x >> 3)] |= (0x80 >> (x & 7));
      }
    }
  }

  return {
    anchoEnBytes,
    alto,
    // En texto, para poder guardarlo y mandarlo por la red
    bytes: btoa(String.fromCharCode(...bytes)),
  };
}
