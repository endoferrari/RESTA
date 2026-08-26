/**
 * NÚCLEO · ALMACÉN
 * ─────────────────────────────────────────────────────────────────────────────
 * Las cuentas del inventario: cuánto hay, para cuántos días alcanza, y qué
 * hay que comprar.
 *
 * LA IDEA QUE LO MANTIENE SENCILLO: **todo se cuenta en porciones**, nunca en
 * botellas. Una botella de whisky no entra al almacén como «1 botella», entra
 * como «15 copas». Así el inventario está siempre en la misma unidad en que
 * se vende, y desaparecen las fracciones y las conversiones a media noche.
 *
 * Las botellas se vuelven a calcular sólo para enseñarlas en pantalla.
 *
 * Este archivo no sabe de base de datos ni de pantallas: recibe números y
 * devuelve números. Por eso se puede probar entero sin vender nada.
 */

/* ── De porciones a envases, para enseñarlo ────────────────────────────── */

/**
 * 38 copas con 15 por botella → «2 botellas y 8 copas».
 * Sirve sólo para que se entienda de un vistazo; la cuenta de verdad
 * siempre está en porciones.
 */
export function enEnvases(porciones, porcionesPorEnvase = 1) {
  const p = Math.trunc(porciones);
  const por = Math.max(1, Math.trunc(porcionesPorEnvase));

  if (por === 1) return { envases: p, sueltas: 0, mixto: false };

  // Con números negativos (faltantes) se reparte igual, conservando el signo
  const signo = p < 0 ? -1 : 1;
  const abs = Math.abs(p);

  return {
    envases: signo * Math.floor(abs / por),
    sueltas: signo * (abs % por),
    mixto: true,
  };
}

/** «2 botellas y 8 copas» en texto, para la pantalla y el papel. */
export function textoEnvases(porciones, { porcionesPorEnvase = 1, envase = 'paquete', unidad = 'pieza' } = {}) {
  const { envases, sueltas, mixto } = enEnvases(porciones, porcionesPorEnvase);

  if (!mixto) return `${envases} ${plural(envases, unidad)}`;

  const partes = [];
  if (envases) partes.push(`${envases} ${plural(envases, envase)}`);
  if (sueltas) partes.push(`${sueltas} ${plural(sueltas, unidad)}`);
  return partes.length ? partes.join(' y ') : `0 ${plural(0, unidad)}`;
}

/** Plural a la mexicana, sin inventar reglas raras. */
function plural(n, palabra) {
  if (Math.abs(n) === 1) return palabra;
  if (/[aeiouáéíóú]$/i.test(palabra)) return palabra + 's';
  return palabra + 'es';
}

/* ── Cuánto se consume al día ──────────────────────────────────────────── */

export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/**
 * El consumo esperado para un día de la semana.
 *
 * ESTO ES LO QUE NO PUEDE SER UN PROMEDIO SIMPLE. En un bar, el sábado no se
 * parece al martes: promediando los últimos 28 días se compra de menos para
 * el fin de semana y de más para entre semana. Aquí se miran sólo los mismos
 * días de la semana.
 *
 * EL DENOMINADOR IMPORTA TANTO COMO EL NUMERADOR. En `ventasPorFecha` sólo
 * hay renglón para los días en que SÍ se vendió algo: un martes sin ventas
 * no aparece. Dividir entre «los días que aparecen» cuenta sólo los buenos y
 * saca el doble de lo real. Por eso se pasa la ventana observada —desde
 * cuándo se lleva el registro— y se divide entre TODOS los martes que
 * cayeron dentro, hayan vendido o no.
 *
 * Sin ventana no hay más remedio que caer al promedio general, que es lo que
 * pasa los primeros días, cuando todavía no hay de dónde.
 *
 * @param ventasPorFecha  { 'AAAA-MM-DD': cantidad }
 * @param diaSemana       0 = domingo … 6 = sábado
 * @param ventana         { desde, hasta } en 'AAAA-MM-DD'
 */
export function consumoEsperado(ventasPorFecha, diaSemana, { desde = null, hasta = null } = {}) {
  const fechas = Object.keys(ventasPorFecha);
  if (fechas.length === 0) return 0;

  const delDia = fechas.filter((f) => diaDeLaSemana(f) === diaSemana);
  const totalDelDia = delDia.reduce((n, f) => n + ventasPorFecha[f], 0);

  const veces = desde && hasta ? vecesQueCayo(diaSemana, desde, hasta) : 0;
  if (veces > 0) return totalDelDia / veces;

  if (delDia.length > 0) return totalDelDia / delDia.length;

  // De ese día no hay nada: el promedio general antes que un cero, que haría
  // creer que ese día no hace falta comprar.
  const total = fechas.reduce((n, f) => n + ventasPorFecha[f], 0);
  return total / fechas.length;
}

/** El día de la semana de una fecha «AAAA-MM-DD», sin líos de zona horaria. */
export function diaDeLaSemana(fecha) {
  const [a, m, d] = String(fecha).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** Cuántos martes (por ejemplo) hubo entre dos fechas, contando las dos. */
export function vecesQueCayo(diaSemana, desde, hasta) {
  const a = Date.UTC(...String(desde).split('-').map((n, i) => i === 1 ? Number(n) - 1 : Number(n)));
  const b = Date.UTC(...String(hasta).split('-').map((n, i) => i === 1 ? Number(n) - 1 : Number(n)));
  if (b < a) return 0;

  const cuantosDias = Math.floor((b - a) / 86400000) + 1;
  const primero = new Date(a).getUTCDay();

  let veces = Math.floor(cuantosDias / 7);
  for (let i = 0; i < cuantosDias % 7; i++) {
    if ((primero + i) % 7 === diaSemana) veces++;
  }
  return veces;
}

/**
 * Cuántos días alcanza lo que hay, contando día por día hacia adelante
 * (no un promedio): así, si hoy es viernes, cuenta viernes, sábado, domingo…
 * cada uno con su consumo propio.
 *
 * Devuelve `Infinity` si no se consume nada, y 0 si ya no hay existencia.
 */
export function diasDeCobertura(existencia, ventasPorFecha, desdeDiaSemana, { tope = 60, ...ventana } = {}) {
  if (existencia <= 0) return 0;

  // Sin una sola venta registrada no hay con qué calcularlo. Infinity aquí
  // NO quiere decir «te sobra»: quiere decir «no sé», y la pantalla tiene
  // que enseñarlo distinto de un verde de verdad.
  const hayConsumo = Object.values(ventasPorFecha).some((v) => v > 0);
  if (!hayConsumo) return Infinity;

  let quedan = existencia;
  let dias = 0;

  for (let i = 0; i < tope; i++) {
    const consumo = consumoEsperado(ventasPorFecha, (desdeDiaSemana + i) % 7, ventana);

    // Un día en que no se vende NO gasta, pero SÍ es un día cubierto.
    //
    // Contar sólo los días que se vende era el error de antes: un producto
    // que sólo sale los sábados y aguanta tres sábados decía «alcanza 3
    // días» en vez de «alcanza 3 semanas», y hacía pedirlo cada tres días.
    if (consumo > 0) {
      if (quedan < consumo) break;
      quedan -= consumo;
    }

    dias++;
  }

  return dias;
}

/* ── El semáforo ───────────────────────────────────────────────────────── */

/**
 * Verde / ámbar / rojo según los días que alcanza.
 *
 * `diasHastaLaCompra` es cada cuánto se surte. Rosendo compra 1 o 2 veces por
 * semana, así que no hay un día fijo: se le pregunta «¿para cuántos días
 * quieres estar cubierto?» y de ahí sale el color.
 */
export function semaforo(dias, diasHastaLaCompra = 7) {
  // Sin ventas registradas no se puede decir nada, y hay que decirlo así.
  //
  // Antes esto salía VERDE con el texto «no se vende». Recién cargado el
  // inventario, la pantalla entera se pintaba de verde —«todo bien»— sin
  // tener una sola venta con qué respaldarlo. Verde es una promesa; ésta
  // el sistema no la puede sostener todavía.
  if (dias === Infinity) return { color: 'gris', texto: 'aún sin ventas' };

  if (dias <= 0) return { color: 'rojo', texto: 'se acabó' };
  if (dias < diasHastaLaCompra) return { color: 'rojo', texto: `no llega: ${dias} día(s)` };
  if (dias < diasHastaLaCompra * 1.5) return { color: 'ambar', texto: `justo: ${dias} día(s)` };
  return { color: 'verde', texto: `alcanza ${dias} día(s)` };
}

/* ── La lista de compras ───────────────────────────────────────────────── */

/**
 * Qué comprar y cuánto, para llegar cubierto los próximos `diasACubrir`.
 *
 * Devuelve la cantidad en ENVASES, que es como se compra: «3 cajas de
 * cerveza», no «72 cervezas». Siempre redondea hacia arriba: más vale que
 * sobre media caja a quedarse sin cerveza un sábado.
 *
 * @param productos [{ id, nombre, existencia, porcionesPorEnvase, envase,
 *                     unidad, ventasPorFecha }]
 */
export function listaDeCompra(productos, { diasACubrir = 7, desdeDiaSemana = 0 } = {}) {
  /* Cada producto lleva su propia ventana: uno que se empezó a controlar
     ayer no se puede promediar sobre ocho semanas. */
  const lista = [];

  for (const p of productos) {
    // Lo que se va a consumir en los días a cubrir, día por día
    let necesita = 0;
    for (let i = 0; i < diasACubrir; i++) {
      necesita += consumoEsperado(
        p.ventasPorFecha ?? {}, (desdeDiaSemana + i) % 7, p.ventana ?? {});
    }

    const falta = necesita - (p.existencia ?? 0);
    if (falta <= 0) continue;

    const por = Math.max(1, Math.trunc(p.porcionesPorEnvase ?? 1));

    lista.push({
      id: p.id,
      nombre: p.nombre,
      existencia: p.existencia ?? 0,
      seVanAConsumir: Math.ceil(necesita),
      faltanPorciones: Math.ceil(falta),
      comprar: Math.ceil(falta / por),          // en envases, hacia arriba
      envase: p.envase ?? 'paquete',
      unidad: p.unidad ?? 'pieza',
      porcionesPorEnvase: por,
    });
  }

  // Primero lo que peor está
  return lista.sort((a, b) => (b.faltanPorciones / b.porcionesPorEnvase) - (a.faltanPorciones / a.porcionesPorEnvase));
}

/* ── El conteo físico ──────────────────────────────────────────────────── */

/**
 * La diferencia entre lo que hay de verdad y lo que decía el sistema.
 *
 * Esto es lo que mantiene vivo el inventario. Sin un conteo cada tanto, la
 * cuenta se desfasa y en dos meses nadie le cree. Y la diferencia misma es
 * información: si un producto siempre falta de más, ahí hay algo que ver.
 */
export function revisarConteo({ contado, segunSistema, porcionesPorEnvase = 1 }) {
  if (!Number.isInteger(contado) || contado < 0) {
    throw new Error('Lo contado tiene que ser un número de porciones.');
  }

  const diferencia = contado - segunSistema;

  return {
    contado,
    segunSistema,
    diferencia,
    cuadra: diferencia === 0,
    falta: diferencia < 0,
    // Para explicarlo en la pantalla sin que nadie tenga que dividir
    enEnvases: enEnvases(Math.abs(diferencia), porcionesPorEnvase),
  };
}
