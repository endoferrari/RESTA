/**
 * IMPRESIÓN · POR DÓNDE SALEN LOS BYTES
 * ─────────────────────────────────────────────────────────────────────────────
 * Cuatro formas de mandarle el ticket a la impresora. Se elige de una lista
 * en la pantalla de ajustes; nadie tiene que editar código.
 *
 *   · simulada → escribe el ticket a un archivo de texto. Es la que se usa
 *                para desarrollar en Linux y para revisar el formato sin
 *                gastar papel.
 *   · red      → le manda los bytes por WiFi/Ethernet al puerto 9100.
 *                LA MÁS CONFIABLE: sin drivers, sin spooler, sin nada que
 *                se desconfigure sola.
 *   · windows  → por el spooler de Windows, en modo RAW. Es lo que usa la
 *                XPRINTER XP-Q200II conectada por USB.
 *   · com      → por un puerto COM (Bluetooth clásico / SPP).
 *                ⚠️ Si la impresora Bluetooth resulta ser BLE, Windows no
 *                puede imprimir en ella y NO hay arreglo por código.
 *
 * Todas devuelven una promesa. Si falla, se lanza un error con un mensaje en
 * español que se le pueda enseñar a quien esté en la caja.
 */

import { createConnection } from 'node:net';
import { writeFile, appendFile, mkdir, unlink as borrar } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { DIR_TICKETS, esWindows } from '../datos/rutas-datos.js';

const ejecutar = promisify(execFile);

export const MODOS = ['simulada', 'red', 'windows', 'com'];

/* ── Simulada ──────────────────────────────────────────────────────────── */

/**
 * Escribe el ticket a un archivo, en texto legible.
 *
 * No es un modo "de mentiras": es la forma de comprobar que el ticket sale
 * bien formado antes de tener la impresora enfrente. En Linux es la única
 * que se puede probar.
 */
const NOTA_SIMULADA = [
  '  (Esto NO salió por la impresora: es cómo se vería el papel.',
  '   Los renglones grandes —el nombre del negocio, la mesa en la comanda—',
  '   aquí se ven en letra normal, pero en la térmica salen al doble.',
  '   El logo todavía no se imprime; ahí dice [ logo ].)',
].join('\n');

async function aArchivo({ vistaTexto, nombre }) {
  await mkdir(DIR_TICKETS, { recursive: true });

  const marca = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archivo = join(DIR_TICKETS, `${marca}-${nombre}.txt`);

  await writeFile(archivo, `${NOTA_SIMULADA}\n\n${vistaTexto}\n`, 'utf8');

  // Además, todo junto en un solo archivo, para poder verlo de corrido.
  await appendFile(
    join(DIR_TICKETS, 'todos.txt'),
    `\n${'═'.repeat(50)}\n${marca} · ${nombre}\n${'═'.repeat(50)}\n${vistaTexto}\n`,
    'utf8',
  );

  return { destino: archivo };
}

/* ── Red (TCP 9100) ────────────────────────────────────────────────────── */

function aRed({ bytes, host, puerto = 9100, esperaMs = 5000 }) {
  if (!host) throw new Error('Falta la dirección IP de la impresora de red.');

  return new Promise((resolver, rechazar) => {
    const socket = createConnection({ host, port: Number(puerto) });
    let terminado = false;

    const acabar = (error, valor) => {
      if (terminado) return;
      terminado = true;
      socket.destroy();
      error ? rechazar(error) : resolver(valor);
    };

    socket.setTimeout(esperaMs);

    socket.on('connect', () => {
      socket.write(bytes, () => socket.end());
    });

    // `end` llega cuando la impresora cerró de su lado; `close` siempre.
    socket.on('close', () => acabar(null, { destino: `${host}:${puerto}` }));

    socket.on('timeout', () => acabar(new Error(
      `La impresora en ${host} no contestó. Revisa que esté prendida y en la misma red.`
    )));

    socket.on('error', (e) => {
      const razon = e.code === 'ECONNREFUSED'
        ? `${host} rechazó la conexión. ¿Es la IP correcta y el puerto ${puerto}?`
        : e.code === 'EHOSTUNREACH' || e.code === 'ENETUNREACH'
          ? `No se llega a ${host}. Revisa el WiFi de la laptop.`
          : `No pude hablar con la impresora en ${host}: ${e.message}`;
      acabar(new Error(razon));
    });
  });
}

/**
 * Saca el mensaje aprovechable del berrinche de PowerShell.
 *
 * PowerShell no contesta con una frase: contesta con la ruta del .ps1 que
 * acaba de inventar, el mensaje PARTIDO en varias líneas, una flecha que
 * señala la columna y dos renglones de «CategoryInfo». Antes se tomaba la
 * primera línea y ya — que es justo la que trae la ruta del archivo temporal
 * y media frase. La caja leía «...pero la» y se quedaba igual que antes.
 */
function mensajeDePowerShell(e) {
  const lineas = String(e?.stderr || e?.message || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    // El rastro no le dice nada a quien está en la caja: fuera.
    .filter((l) => l && !l.startsWith('+') && !/^(En|At) /.test(l));

  const frase = lineas
    .join(' ')
    .replace(/^.*?\.ps1\s*:\s*/, '')   // la ruta del temporal que antepone
    .replace(/\s+/g, ' ')
    .trim();

  // Un mensaje larguísimo no cabe en la pantalla de la caja y tapa el resto.
  return frase.length > 300 ? frase.slice(0, 297) + '…' : (frase || 'no contestó');
}

/* ── Spooler de Windows, en modo RAW ───────────────────────────────────── */

/**
 * Manda los bytes tal cual al spooler, sin que Windows los "interprete".
 *
 * Esto es lo mismo que hacía el agente de PowerShell de la v1.3.0, pero
 * adentro de RESTA: sin proceso aparte, sin puerto 9100 suelto, sin CORS y
 * sin que nadie tenga que acordarse de arrancarlo.
 *
 * El truco es `pDataType = "RAW"`: le dice a Windows «pásale estos bytes a la
 * impresora sin tocarlos». Si se imprimiera de la forma normal, Windows
 * intentaría dibujar una página y saldrían garabatos.
 */
async function aWindows({ bytes, impresora }) {
  if (!esWindows) {
    throw new Error('El spooler de Windows sólo existe en Windows. Aquí usa el modo simulada.');
  }
  if (!impresora) throw new Error('Falta el nombre de la impresora de Windows.');

  const archivo = join(tmpdir(), `resta-${Date.now()}.bin`);
  await writeFile(archivo, bytes);

  const guion = `
$ErrorActionPreference = 'Stop'
# PowerShell contesta en la codificación vieja de la consola (CP850), y Node
# lee lo que le llega como UTF-8: cada acento del mensaje de error llegaba
# roto («Excepción» salía como «Excepci?n»). Y el mensaje de error es justo
# lo que se le enseña a quien está en la caja, así que tiene que leerse.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$nombreImpresora = ${JSON.stringify(impresora)}
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
                          [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
                          [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode, ExactSpelling=true)] public static extern bool OpenPrinter(string src, out IntPtr h, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode, ExactSpelling=true)] public static extern bool StartDocPrinter(IntPtr h, int level, ref DOCINFO di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true)] public static extern bool WritePrinter(IntPtr h, IntPtr buf, int count, out int written);
  public static string Send(string printer, byte[] bytes) {
    IntPtr h; var di = new DOCINFO();
    di.pDocName = "RESTA"; di.pDataType = "RAW";
    if(!OpenPrinter(printer, out h, IntPtr.Zero)) return "No encontre la impresora (codigo " + Marshal.GetLastWin32Error() + ")";
    string r = "OK";
    if(StartDocPrinter(h,1,ref di)) {
      if(StartPagePrinter(h)) {
        IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, p, bytes.Length);
        int w;
        if(!WritePrinter(h, p, bytes.Length, out w)) r = "No pude escribir en la impresora (codigo " + Marshal.GetLastWin32Error() + ")";
        Marshal.FreeCoTaskMem(p);
        EndPagePrinter(h);
      } else r = "La impresora no acepto la pagina (codigo " + Marshal.GetLastWin32Error() + ")";
      EndDocPrinter(h);
    } else r = "La impresora no acepto el documento (codigo " + Marshal.GetLastWin32Error() + ")";
    ClosePrinter(h);
    return r;
  }
}
"@
# Si Windows la dejó marcada como "sin conexión", se vuelve a poner en línea.
try {
  $pr = Get-CimInstance Win32_Printer -Filter "Name='${impresora.replace(/'/g, "''")}'" -ErrorAction Stop
  if($pr -and $pr.WorkOffline){ $pr.WorkOffline = $false; Set-CimInstance -InputObject $pr -ErrorAction SilentlyContinue }
} catch {}

# ── ¿Esta impresora puede recibir algo, o se lo va a tragar? ─────────────
#
# El spooler ACEPTA el trabajo aunque el puerto de la impresora esté muerto:
# lo guarda en su cola y contesta «OK». RESTA daba eso por impreso, ponía el
# foquito en verde y el papel nunca salía.
#
# Comprobado en la laptop del bar el 18-sep-2026: la impresora se había
# movido a COM3 al reemparejar, la POS-80 de Windows seguía apuntando a COM4
# —que es el buzón de ENTRADA del Bluetooth, no la impresora—, y ahí estaban
# cinco tickets atorados que RESTA daba por salidos. Cero avisos.
#
# Se revisa AQUÍ, antes de mandar los bytes, y nunca después: revisar después
# obligaría a reintentar, y reintentar lo que el spooler ya tiene saca el
# ticket dos veces y descuadra la caja.
$destino = (Get-Printer -Name $nombreImpresora -ErrorAction Stop).PortName
if ($destino -match '^(COM\\d+)') {
  $comApuntado = $Matches[1]
  # OJO: el puerto bueno se saca de la SALIDA del pipeline, no asignando una
  # variable dentro del ForEach-Object. PowerShell corre ese bloque en un
  # ámbito hijo: un «$real = ...» de adentro crea otra variable y la de afuera
  # se queda en $null, así que la comprobación pasaba de largo siempre y esta
  # guardia no servía de nada. Comprobado el 18-sep-2026.
  #
  # El «-notmatch» de los doce ceros descarta el puerto ENTRANTE, que no lleva
  # a la impresora.
  $real = Get-PnpDevice -Class Ports -ErrorAction SilentlyContinue |
    Where-Object { $_.InstanceId -like '*BTHENUM*' -and $_.InstanceId -notmatch '[&_]0{12}_' } |
    ForEach-Object {
      (Get-ItemProperty ('HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\' + $_.InstanceId +
        '\\Device Parameters') -Name PortName -ErrorAction SilentlyContinue).PortName
    } |
    Where-Object { $_ } | Select-Object -First 1
  if ($real -and $real -ne $comApuntado) {
    Write-Error ("la impresora de Windows apunta a " + $comApuntado +
      ", pero la impresora esta en " + $real +
      ". Windows le cambio el numero al reemparejar. Cambia el puerto de la impresora, o usa el modo COM, que se lo busca solo.")
    exit 1
  }
}

$bytes = [System.IO.File]::ReadAllBytes(${JSON.stringify(archivo)})
$r = [RawPrinter]::Send(${JSON.stringify(impresora)}, $bytes)
if($r -ne "OK") { Write-Error $r; exit 1 }
Write-Output "OK"
`;

  const guionArchivo = join(tmpdir(), `resta-${Date.now()}.ps1`);
  // El «﻿» del principio no es basura: sin esa marca, PowerShell 5.1 lee
  // el archivo como si fuera Windows-1252 y destroza los acentos.
  await writeFile(guionArchivo, `﻿${guion}`, 'utf8');

  try {
    // 45 segundos, no 20.
    //
    // Con la impresora por Bluetooth, entregarle los bytes al spooler puede
    // tardar: si la radio estaba dormida, Windows primero tiene que levantar
    // el enlace. Cortar a los 20 segundos era lo peor de los dos mundos —
    // RESTA daba el trabajo por fallido y lo volvía a mandar, pero el spooler
    // ya se había quedado con los bytes del primero: dos tickets iguales.
    //
    // Esperar no cuesta nada: la caja no se detiene por el papel, el cobro ya
    // quedó registrado y esto pasa en la cola, no delante del cliente.
    await ejecutar('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', guionArchivo,
    ], { timeout: 45_000 });
    return { destino: impresora };
  } catch (e) {
    throw new Error(`No pude imprimir en «${impresora}»: ${mensajeDePowerShell(e)}`);
  }
}

/* ── Puerto COM (Bluetooth clásico) ────────────────────────────────────── */

/**
 * Manda el ticket por un puerto serie.
 *
 * Lo primero que hace es PREGUNTARLE A WINDOWS por cuál puerto anda la
 * impresora, y mandar por ése aunque la configuración diga otro. El número
 * cambia solo al reemparejar, y la configuración se queda vieja.
 *
 * Antes se preguntaba sólo DESPUÉS de que el puerto apuntado fallara, y ahí
 * estaba el agujero: el puerto entrante del Bluetooth a veces NO falla. Abre,
 * se traga los 12 KB del ticket, contesta que todo bien, y RESTA marcaba
 * verde mientras la impresora no movía un dedo.
 *
 * ⚠️ Esto sólo funciona con Bluetooth CLÁSICO (SPP). Si la impresora es BLE,
 * Windows ni siquiera le crea un puerto COM y no hay nada que hacer por
 * código: hay que cambiar de impresora.
 */
async function aPuertoCom({ bytes, puerto, velocidad = 9600 }) {
  if (!esWindows) {
    throw new Error('Los puertos COM sólo existen en Windows. Aquí usa el modo simulada.');
  }
  if (!puerto) throw new Error('Falta decir cuál puerto COM (por ejemplo COM3).');

  const nombre = String(puerto).toUpperCase();
  if (!/^COM\d+$/.test(nombre)) {
    throw new Error(`«${puerto}» no parece un puerto COM. Se escriben así: COM3.`);
  }

  const plan = decidirPuerto(await puertosBluetooth(), nombre);

  // Windows dice que ahí no hay impresora que valga. Vale más decirlo que
  // mandar el ticket a un agujero y jurar que salió.
  if (!plan.usar) {
    olvidarPuertosBluetooth();
    throw new Error(plan.aviso);
  }

  try {
    await escribirEnPuerto(plan.usar, bytes, velocidad);
    return { destino: plan.usar, corregido: plan.corregido };
  } catch (falloOriginal) {
    // Algo cambió desde la última vez que se preguntó —o la impresora se
    // apagó—. Se tira lo guardado y se vuelve a preguntar de cero.
    olvidarPuertosBluetooth();
    const real = await puertoDeLaImpresoraBluetooth();

    if (!real) {
      throw new Error(
        `No pude imprimir en ${plan.usar} (${falloOriginal.message}) y tampoco ` +
        'encontré otro puerto de impresora Bluetooth. Revisa que esté ' +
        'emparejada y que sea Bluetooth clásico (SPP), no BLE.'
      );
    }

    // Si el puerto que se usó YA era el correcto, el número no es el problema.
    // Reintentar sería repetir el mismo fallo y tapar el motivo de verdad.
    if (real === plan.usar) {
      throw new Error(
        `${real} sí es el puerto de la impresora, pero no contesta: ` +
        `${falloOriginal.message}. ¿Está prendida y a la vista?`
      );
    }

    try {
      await escribirEnPuerto(real, bytes, velocidad);
      return { destino: real, corregido: real };
    } catch (e) {
      throw new Error(
        `La impresora está en ${real}, no en ${plan.usar}, pero tampoco ahí ` +
        `contesta: ${e.message}. ¿Está prendida y a la vista?`
      );
    }
  }
}

/**
 * Manda los bytes a un puerto COM concreto.
 *
 * ⚠️ NO se puede hacer con `writeFile('\\\\.\\COM4')`, aunque en Windows un
 * puerto COM sí se abra como archivo. Un puerto serie exige abrirse en
 * EXCLUSIVA (sin compartir con nadie), y Node siempre lo abre compartido:
 * Windows rechaza la apertura y Node lo traduce a un `UNKNOWN: unknown
 * error` que no dice nada. No es un permiso que falte ni un ajuste: Node no
 * puede escribir en un puerto COM de Windows, y punto.
 *
 * Tampoco sirve `mode COM4:` para comprobar que el puerto existe: en un
 * puerto Bluetooth virtual falla SIEMPRE —dice «El dispositivo COM4 no está
 * disponible en este momento»— porque la velocidad de un enlace de radio no
 * se puede fijar. Comprobado en la laptop del bar el 2-sep-2026: `mode`
 * fallaba en 100 ms mientras el puerto se abría perfecto en 64 ms.
 *
 * Esas dos cosas juntas eran el motivo de que NINGÚN ticket saliera por
 * Bluetooth: RESTA se rendía sin llegar a tocar el puerto y culpaba a la
 * impresora, que estaba encendida y lista.
 *
 * Así que se hace por PowerShell, con el `SerialPort` de .NET, que sí abre
 * en exclusiva. Cuesta cerca de un segundo por ticket. Es el precio de que
 * salga el papel.
 */
async function escribirEnPuerto(nombre, bytes, velocidad) {
  const marca = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const archivoBytes = join(tmpdir(), `resta-com-${marca}.bin`);
  const archivoGuion = join(tmpdir(), `resta-com-${marca}.ps1`);

  // Los bytes van por archivo, no por la línea de comandos: un ticket con
  // logo pasa de los 11 KB y Windows corta los comandos largos.
  const guion = `
$ErrorActionPreference = 'Stop'
# PowerShell contesta en la codificación vieja de la consola (CP850), y Node
# lee lo que le llega como UTF-8: cada acento del mensaje de error llegaba
# roto («Excepción» salía como «Excepci?n»). Y el mensaje de error es justo
# lo que se le enseña a quien está en la caja, así que tiene que leerse.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$bytes = [System.IO.File]::ReadAllBytes(${JSON.stringify(archivoBytes)})
$sp = New-Object System.IO.Ports.SerialPort ${JSON.stringify(nombre)}, ${Number(velocidad) || 9600}, 'None', 8, 'One'
$sp.WriteTimeout = 20000

# Se reintenta ABRIR, nunca escribir.
#
# Dos motivos, los dos normales: la radio Bluetooth estaba dormida y tarda en
# levantar el enlace, o el ticket anterior acaba de soltar el puerto y Windows
# todavía no lo da por libre («Se ha denegado el acceso al puerto»). Pasa al
# cobrar, que manda comanda y ticket casi juntos.
#
# Reintentar la ESCRITURA sería otra cosa: si el primer intento ya metió
# bytes, saldrían dos tickets y la caja cuadraría mal. Por eso el reintento
# rodea sólo a Open(), que ocurre antes de mandar nada.
$limite = [DateTime]::UtcNow.AddSeconds(12)
while ($true) {
  try { $sp.Open(); break }
  catch {
    if ([DateTime]::UtcNow -ge $limite) { throw }
    Start-Sleep -Milliseconds 200
  }
}

try {
  $sp.Write($bytes, 0, $bytes.Length)
  $sp.BaseStream.Flush()

  # Cerrar de golpe corta el ticket: .NET da por escrito lo que todavía está
  # en la cola de salida de la radio. Se espera a que se vacíe de verdad,
  # mirándola, en vez de dormir un rato fijo a ver si alcanza.
  $limiteVaciado = [DateTime]::UtcNow.AddSeconds(20)
  while ($sp.BytesToWrite -gt 0 -and [DateTime]::UtcNow -lt $limiteVaciado) {
    Start-Sleep -Milliseconds 50
  }
  Start-Sleep -Milliseconds 250
} finally {
  $sp.Close()
}
Write-Output "OK"
`;

  await writeFile(archivoBytes, bytes);
  // El «﻿» del principio no es basura: sin esa marca, PowerShell 5.1 lee
  // el archivo como si fuera de Windows-1252 y destroza los acentos de los
  // comentarios. Con ella sabe que es UTF-8.
  await writeFile(archivoGuion, `﻿${guion}`, 'utf8');

  try {
    await ejecutar('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', archivoGuion,
    ], { timeout: 45_000 });
  } catch (e) {
    throw new Error(mensajeDePowerShell(e));
  } finally {
    await borrar(archivoBytes).catch(() => {});
    await borrar(archivoGuion).catch(() => {});
  }
}

/**
 * ¿Este identificador es el del puerto Bluetooth ENTRANTE?
 *
 * El entrante es el buzón por donde OTRO aparato llamaría a la laptop. No
 * lleva a la impresora, pero Windows lo llama igual —«Serie estándar sobre el
 * vínculo Bluetooth»— y, lo peor, A VECES SE DEJA ABRIR Y ESCRIBIR SIN DAR
 * ERROR: los bytes se van al vacío, RESTA da el ticket por impreso, el
 * foquito se pone verde y el papel nunca sale. Un fallo mudo así es peor que
 * una avería: nadie se entera hasta que el cliente pide su ticket.
 *
 * Se reconoce porque su dirección son doce ceros, en vez de la dirección real
 * del aparato.
 */
export function esPuertoEntrante(id) {
  return /[&_]0{12}_/.test(String(id ?? ''));
}

/**
 * De todos los puertos Bluetooth, ¿cuál es el de la impresora?
 *
 * Se descarta por la DIRECCIÓN, nunca por el número: el número cambia cada
 * vez que se reempareja, y el entrante se llama igual que el bueno.
 *
 * Función pura y aparte para poder probarla sin Windows enfrente.
 */
export function elegirPuertoBluetooth(puertos) {
  const utiles = (puertos ?? []).filter(
    (p) => p?.puerto && p?.id && !esPuertoEntrante(p.id),
  );
  if (utiles.length === 0) return null;

  // Si hubiera más de uno, gana el de número más bajo: es el que Windows
  // asignó primero, y en el bar nunca ha habido dos impresoras a la vez.
  utiles.sort((a, b) => Number(a.puerto.slice(3)) - Number(b.puerto.slice(3)));
  return utiles[0].puerto;
}

/**
 * Con lo que dice Windows, ¿por cuál puerto hay que mandar el ticket?
 *
 * Esto se pregunta ANTES de escribir, no después de fallar. Antes sólo se
 * buscaba el puerto bueno cuando el apuntado daba error — y el caso que de
 * verdad duele es el contrario: el apuntado NO da error, se traga el ticket
 * y deja a la caja esperando papel que no va a salir.
 *
 * Función pura, para poder probarla sin Windows enfrente.
 */
export function decidirPuerto(puertos, apuntado) {
  const real = elegirPuertoBluetooth(puertos);

  // Windows encontró la impresora. Manda ahí, diga lo que diga la
  // configuración: la configuración se queda vieja, la impresora no.
  if (real) {
    return { usar: real, corregido: real === apuntado ? null : real, aviso: null };
  }

  // No hay ninguna impresora Bluetooth, y encima el puerto apuntado es el
  // buzón de entrada. Mandar ahí es tirar el ticket a la basura en silencio.
  const ficha = (puertos ?? []).find((p) => p?.puerto === apuntado);
  if (ficha && esPuertoEntrante(ficha.id)) {
    return {
      usar: null,
      corregido: null,
      aviso:
        `${apuntado} no es la impresora: es el buzón de entrada del Bluetooth, ` +
        'que se traga los bytes sin quejarse. Y la impresora no aparece ' +
        'emparejada. Enciéndela y vuelve a emparejarla.',
    };
  }

  // Windows no dijo nada útil —pasa, y no es motivo para no imprimir—. Se
  // intenta con el puerto apuntado: si está bien sale el ticket, y si no, el
  // error se ve enseguida en vez de quedar tapado por una suposición.
  return { usar: apuntado, corregido: null, aviso: null };
}

/* ── Lo que Windows sabe de los puertos ────────────────────────────────── */

// Preguntarle a Windows cuesta cerca de un segundo, así que la respuesta se
// guarda: se paga UNA vez por arranque y no en cada ticket. Se tira en cuanto
// algo falla, que es justo cuando lo guardado pudo quedarse viejo.
let puertosGuardados = null;

/** Olvida lo que Windows contestó. Se llama cuando un envío falla. */
export function olvidarPuertosBluetooth() {
  puertosGuardados = null;
}

/**
 * Le pregunta a Windows qué puertos COM de Bluetooth hay y de quién es cada
 * uno.
 *
 * Nunca lanza: esto se usa para decidir mejor, no para decidir si se imprime.
 * Si Windows no contesta, se devuelve una lista vacía y se sigue adelante con
 * lo que diga la configuración.
 */
export async function puertosBluetooth() {
  if (!esWindows) return [];
  if (puertosGuardados) return puertosGuardados;

  // Ojo con los saltos de línea: al unir con espacios, PowerShell se queda sin
  // separador entre `.PortName` y el `if` de la línea siguiente y truena. Por
  // eso van los punto y coma explícitos.
  const guion = [
    "Get-PnpDevice -Class Ports -ErrorAction SilentlyContinue |",
    "Where-Object { $_.InstanceId -like '*BTHENUM*' } |",
    "ForEach-Object {",
    "$p = (Get-ItemProperty ('HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\' + $_.InstanceId +",
    "'\\Device Parameters') -Name PortName -ErrorAction SilentlyContinue).PortName;",
    "if ($p) { $p + '|' + $_.InstanceId }",
    "}",
  ].join(' ');

  try {
    const { stdout } = await ejecutar(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', guion],
      { timeout: 20_000 },
    );

    const puertos = String(stdout)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [puerto, id] = l.split('|');
        return { puerto: (puerto ?? '').toUpperCase(), id: id ?? '' };
      })
      .filter((p) => /^COM\d+$/.test(p.puerto));

    if (puertos.length > 0) puertosGuardados = puertos;
    return puertos;
  } catch {
    return [];
  }
}

/**
 * En qué puerto COM quedó la impresora Bluetooth, o null si no aparece.
 *
 * Hace falta porque **el número no es fijo: cambia al reemparejar**. En la
 * laptop del bar era COM3 el 25-ago-2026, amaneció en COM4 el 2-sep-2026 y
 * volvió a COM3 el 18-sep-2026. Tener el número escrito a mano en la
 * configuración es una bomba de tiempo.
 */
export async function puertoDeLaImpresoraBluetooth() {
  return elegirPuertoBluetooth(await puertosBluetooth());
}

/* ── La puerta de entrada ──────────────────────────────────────────────── */

/**
 * Manda el trabajo por donde toque.
 * @param configuracion { modo, host, puerto, impresora, com, velocidad }
 */
export async function enviar({ bytes, vistaTexto, nombre, configuracion }) {
  const modo = configuracion?.modo ?? 'simulada';

  switch (modo) {
    case 'simulada':
      return aArchivo({ vistaTexto, nombre });

    case 'red':
      return aRed({ bytes, host: configuracion.host, puerto: configuracion.puerto });

    case 'windows':
      return aWindows({ bytes, impresora: configuracion.impresora });

    case 'com':
      return aPuertoCom({ bytes, puerto: configuracion.com, velocidad: configuracion.velocidad });

    default:
      throw new Error(`No conozco el modo de impresión «${modo}».`);
  }
}

/** Las impresoras que Windows tiene instaladas, para elegirla de una lista. */
export async function impresorasDeWindows() {
  if (!esWindows) return [];
  try {
    const { stdout } = await ejecutar('powershell.exe', [
      '-NoProfile', '-NonInteractive',
      '-Command', 'Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name',
    ], { timeout: 15_000 });
    return stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}
