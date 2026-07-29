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
import { writeFile, appendFile, mkdir } from 'node:fs/promises';
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

$bytes = [System.IO.File]::ReadAllBytes(${JSON.stringify(archivo)})
$r = [RawPrinter]::Send(${JSON.stringify(impresora)}, $bytes)
if($r -ne "OK") { Write-Error $r; exit 1 }
Write-Output "OK"
`;

  const guionArchivo = join(tmpdir(), `resta-${Date.now()}.ps1`);
  await writeFile(guionArchivo, guion, 'utf8');

  try {
    await ejecutar('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', guionArchivo,
    ], { timeout: 20_000 });
    return { destino: impresora };
  } catch (e) {
    const detalle = String(e.stderr || e.message).split('\n')[0].trim();
    throw new Error(`No pude imprimir en «${impresora}»: ${detalle}`);
  }
}

/* ── Puerto COM (Bluetooth clásico) ────────────────────────────────────── */

/**
 * Escribe directo al puerto serie.
 *
 * En Windows, un puerto COM se puede abrir como si fuera un archivo. Antes
 * hay que configurarle la velocidad con `mode`, porque si no queda a 1200
 * baudios y el ticket tarda una eternidad o sale cortado.
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

  try {
    await ejecutar('cmd.exe', [
      '/c', `mode ${nombre}: BAUD=${velocidad} PARITY=n DATA=8 STOP=1 xon=off odsr=off octs=off dtr=on rts=on idsr=off`,
    ], { timeout: 10_000 });
  } catch {
    throw new Error(
      `No encontré el puerto ${nombre}. Si la impresora es Bluetooth, revisa que esté ` +
      'emparejada y que sea Bluetooth clásico (SPP), no BLE.'
    );
  }

  try {
    // En Windows, «\\.\COM3» se abre como archivo y se le escribe.
    await writeFile(`\\\\.\\${nombre}`, bytes);
    return { destino: nombre };
  } catch (e) {
    throw new Error(`No pude escribir en ${nombre}: ${e.message}. ¿La impresora está prendida?`);
  }
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
