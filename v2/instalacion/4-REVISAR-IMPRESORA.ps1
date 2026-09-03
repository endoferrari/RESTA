# ═══════════════════════════════════════════════════════════════════════════
#  RESTA · REVISAR LA IMPRESORA BLUETOOTH
#  ─────────────────────────────────────────────────────────────────────────
#  QUÉ HACE
#
#  Contesta, en español y de corrido, la única pregunta que importa cuando no
#  sale el ticket: ¿dónde se rompió la cadena?
#
#      antena Bluetooth → emparejamiento → puerto COM → papel
#
#  Y sobre todo: **dice el número de puerto COM real**. Ese número NO es fijo:
#  cambia cada vez que se reempareja la impresora. El 25-ago-2026 era COM3; el
#  2-sep-2026, después de reemparejar, amaneció en COM4. Tenerlo escrito a mano
#  en la configuración y olvidarse es la causa de que un día deje de imprimir
#  sin que nadie haya tocado nada.
#
#  NO cambia nada por su cuenta. Sólo mira y avisa —salvo que se le pida el
#  ticket de prueba con -Probar.
#
#  CÓMO SE USA:
#      powershell -ExecutionPolicy Bypass -File 4-REVISAR-IMPRESORA.ps1
#      ... .ps1 -Probar      ← además manda un ticket de prueba al papel
# ═══════════════════════════════════════════════════════════════════════════

param(
  [switch]$Probar,
  # La dirección Bluetooth de la impresora de ONCE. Si algún día se cambia el
  # aparato, éste es el único dato que hay que actualizar aquí.
  [string]$Direccion = '6632419C81FD'
)

$ErrorActionPreference = 'Continue'

function Titulo($t) { Write-Host ""; Write-Host ("=" * 68) -ForegroundColor DarkGray; Write-Host " $t" -ForegroundColor Cyan; Write-Host ("=" * 68) -ForegroundColor DarkGray }
function Bien($t)   { Write-Host "  OK    $t" -ForegroundColor Green }
function Mal($t)    { Write-Host "  FALLA $t" -ForegroundColor Red }
function Ojo($t)    { Write-Host "  OJO   $t" -ForegroundColor Yellow }
function Dato($t)   { Write-Host "        $t" -ForegroundColor Gray }

$problemas = @()

# Se compila una vez el ayudante que pregunta a Windows por los atajos \\.\COMx
# y prueba a abrirlos. Hace falta porque .NET esconde el código de error real
# detrás de un mensaje que dice «el nombre no empieza por COM», que despista.
Add-Type -TypeDefinition @"
using System; using System.Text; using System.Runtime.InteropServices;
public static class RevisorDos {
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern uint QueryDosDeviceW(string name, StringBuilder buf, uint max);
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern IntPtr CreateFileW(string n, uint a, uint s, IntPtr sec, uint d, uint f, IntPtr t);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool CloseHandle(IntPtr h);
  public static string Atajo(string n) {
    var sb = new StringBuilder(1024);
    if (QueryDosDeviceW(n, sb, 1024) == 0) return null;
    return sb.ToString();
  }
  public static int Abrir(string ruta) {
    IntPtr h = CreateFileW(ruta, 0xC0000000, 0, IntPtr.Zero, 3, 0, IntPtr.Zero);
    if (h == (IntPtr)(-1)) return Marshal.GetLastWin32Error();
    CloseHandle(h);
    return 0;
  }
}
"@ -ErrorAction SilentlyContinue


# ── 1. La antena ─────────────────────────────────────────────────────────
Titulo "1. LA ANTENA BLUETOOTH"

$antena = Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue |
          Where-Object { $_.FriendlyName -match 'Adapter|Adaptador' }
if ($antena -and $antena.Status -eq 'OK') {
  Bien "La antena está encendida ($($antena.FriendlyName))"
} else {
  Mal "No encuentro la antena Bluetooth encendida."
  $problemas += "La antena Bluetooth está apagada o desconectada."
}

foreach ($s in 'bthserv','BTAGService') {
  $srv = Get-Service $s -ErrorAction SilentlyContinue
  if (-not $srv) { continue }
  if ($srv.Status -eq 'Running') {
    Bien "Servicio $s corriendo (arranque: $($srv.StartType))"
  } else {
    Mal "Servicio $s detenido"
    $problemas += "El servicio Bluetooth $s no está corriendo."
  }
  if ($srv.StartType -ne 'Automatic') {
    Ojo "$s arranca en modo '$($srv.StartType)'. Conviene 'Automatic' para que suba solo al prender la laptop."
  }
}

# ── 2. El emparejamiento ─────────────────────────────────────────────────
Titulo "2. EL EMPAREJAMIENTO CON LA IMPRESORA"

$aparato = Get-PnpDevice -ErrorAction SilentlyContinue |
           Where-Object { $_.InstanceId -like "*$Direccion*" -and $_.Class -eq 'Bluetooth' }
if ($aparato) {
  Bien "La impresora está emparejada ($($aparato.FriendlyName))"
} else {
  Mal "La impresora NO está emparejada con esta laptop."
  Dato "Arreglo: Configuración de Windows -> Bluetooth y dispositivos -> Agregar dispositivo."
  Dato "Si se niega a emparejar: apaga la impresora, cuenta hasta 10, enciéndela y reintenta."
  Dato "Si sigue negándose: REINICIA LA LAPTOP. La pila Bluetooth se traba y sólo se destraba así."
  $problemas += "La impresora no está emparejada."
}

# ── 3. El puerto COM ─────────────────────────────────────────────────────
Titulo "3. EL PUERTO COM (el número que cambia solo)"

$puertoBueno = $null
$puertos = Get-PnpDevice -Class Ports -ErrorAction SilentlyContinue
if (-not $puertos) {
  Mal "Windows no tiene NINGÚN puerto COM. Sin emparejamiento no hay puerto."
  $problemas += "No existe ningún puerto COM."
} else {
  foreach ($p in $puertos) {
    $ruta = "HKLM:\SYSTEM\CurrentControlSet\Enum\" + $p.InstanceId + "\Device Parameters"
    $nombre = (Get-ItemProperty $ruta -Name PortName -ErrorAction SilentlyContinue).PortName
    if ($p.InstanceId -like "*$Direccion*") {
      $puertoBueno = $nombre
      Bien "$nombre  <-- ESTE es el de la impresora"
    } elseif ($p.InstanceId -like "*000000000000*") {
      Dato "$nombre  (puerto Bluetooth ENTRANTE: no lleva a ninguna parte, ignóralo)"
    } else {
      Dato "$nombre  (otro aparato)"
    }
  }
}

# El atajo \\.\COMx tiene que existir DE VERDAD. Si Windows lista el puerto
# pero el atajo apunta a un aparato que ya no existe, abrirlo falla al instante
# con «no se encuentra el archivo» y parece que la impresora está apagada
# cuando en realidad está perfecta. Pasa al reiniciar la antena Bluetooth.
if ($puertoBueno) {
  $atajo = [RevisorDos]::Atajo($puertoBueno)
  if ($atajo) {
    Dato "$puertoBueno apunta a $atajo"
  } else {
    Mal "$puertoBueno aparece en la lista pero su atajo no existe."
    $problemas += "El atajo de $puertoBueno está roto: hay que reiniciar la laptop."
  }

  $err = [RevisorDos]::Abrir("\\.\$puertoBueno")
  if ($err -eq 0) {
    Bien "$puertoBueno se abre correctamente. La impresora responde."
  } elseif ($err -eq 2) {
    Mal "$puertoBueno NO se puede abrir (error 2)."
    Dato "Esto NO es que la impresora esté apagada: es que Windows tiene el atajo colgado."
    Dato "Arreglo: REINICIAR LA LAPTOP. No hay forma de limpiarlo en caliente."
    $problemas += "El puerto $puertoBueno está colgado; hace falta reiniciar la laptop."
  } elseif ($err -eq 5) {
    Mal "$puertoBueno está ocupado por otro programa (error 5)."
    Dato "Cierra lo que esté usando la impresora, o reinicia la cola de impresión."
    $problemas += "Algo más tiene tomado el puerto $puertoBueno."
  } else {
    Mal "$puertoBueno da error $err al abrirse."
    $problemas += "El puerto $puertoBueno da error $err."
  }
}

# ── 4. Lo que tiene apuntado RESTA ───────────────────────────────────────
Titulo "4. LO QUE TIENE QUE DECIR RESTA"

if ($puertoBueno) {
  Write-Host "  El puerto correcto AHORA MISMO es: " -NoNewline
  Write-Host " $puertoBueno " -ForegroundColor White -BackgroundColor DarkBlue
  Dato ""
  Dato "Compruébalo en RESTA: Configuración -> Impresora."
  Dato "El modo debe decir 'com' y el puerto debe decir $puertoBueno."
  Dato "Si dice otro número, cámbialo ahí mismo y guarda."
} else {
  Ojo "Sin puerto todavía no hay nada que apuntar en RESTA."
}

# ── 5. Ticket de prueba ──────────────────────────────────────────────────
if ($Probar -and $puertoBueno) {
  Titulo "5. TICKET DE PRUEBA"
  try {
    $b = New-Object System.Collections.Generic.List[byte]
    # ESC @ inicializar · ESC t 2 tabla CP850 · ESC a 1 centrado
    foreach ($x in @(0x1B,0x40, 0x1B,0x74,0x02, 0x1B,0x61,0x01)) { $b.Add($x) }
    foreach ($x in [System.Text.Encoding]::GetEncoding(850).GetBytes("RESTA`nONCE Social Lounge`n`n")) { $b.Add($x) }
    foreach ($x in @(0x1B,0x61,0x00)) { $b.Add($x) }   # ESC a 0 izquierda
    $cuerpo = "Revision de impresora`n" +
              "Puerto: $puertoBueno`n" +
              "Fecha:  " + (Get-Date -Format 'dd/MM/yyyy HH:mm') + "`n" +
              "--------------------------------`n" +
              "Si lees esto, la cadena`ncompleta funciona.`n"
    foreach ($x in [System.Text.Encoding]::GetEncoding(850).GetBytes($cuerpo)) { $b.Add($x) }
    # avanzar papel y cortar (GS V B 0)
    foreach ($x in @(0x0A,0x0A,0x0A,0x0A, 0x1D,0x56,0x42,0x00)) { $b.Add($x) }

    $sp = New-Object System.IO.Ports.SerialPort $puertoBueno, 9600, 'None', 8, 'One'
    $sp.WriteTimeout = 15000
    $sp.Open()
    $sp.Write($b.ToArray(), 0, $b.Count)
    Start-Sleep -Seconds 3
    $sp.Close()
    Bien "Los bytes salieron sin error. Revisa que haya papel impreso."
  } catch {
    Mal ("No se pudo imprimir: " + $_.Exception.Message.Split([char]10)[0])
  }
}

# ── Resumen ──────────────────────────────────────────────────────────────
Titulo "RESUMEN"
if ($problemas.Count -eq 0) {
  Write-Host "  Todo en orden. La impresora deberia estar imprimiendo." -ForegroundColor Green
  if (-not $Probar) { Dato "Para mandar un ticket de prueba, vuelve a correr esto con  -Probar" }
} else {
  Write-Host "  Hay $($problemas.Count) cosa(s) que arreglar, en este orden:" -ForegroundColor Yellow
  $i = 1
  foreach ($p in $problemas) { Write-Host "   $i. $p" -ForegroundColor Yellow; $i++ }
}
Write-Host ""
