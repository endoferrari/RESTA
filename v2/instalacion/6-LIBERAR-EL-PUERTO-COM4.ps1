# ═══════════════════════════════════════════════════════════════════════════
#  RESTA · QUITARLE EL NOMBRE «COM4» AL SISTEMA DE IMPRESIÓN DE WINDOWS
#  ─────────────────────────────────────────────────────────────────────────
#  QUÉ ARREGLA
#
#  Que la impresora esté encendida, emparejada, con su puerto bien puesto en
#  el registro… y aun así RESTA diga que COM4 «no se resuelve en un puerto
#  serie válido». Es el síntoma más engañoso de todos, porque en el
#  Administrador de dispositivos TODO se ve bien.
#
#  POR QUÉ PASA
#
#  En Windows, los nombres «COM1», «COM2», «COM4»… no son puertos: son
#  ETIQUETAS, y sólo puede haber un dueño por etiqueta. El sistema de
#  impresión (el «spooler») también reparte etiquetas: cada vez que una
#  impresora dice usar el puerto «COM4:», el spooler se queda con esa
#  etiqueta y la apunta a un tubo suyo.
#
#  En la laptop del bar había DOS impresoras de Windows —«POS-80» y
#  «POS 80», duplicadas— las dos apuntando a «COM4:». Así que:
#
#      COM4  →  \Device\NamedPipe\Spooler\COM4     ← el tubo del spooler
#
#  cuando lo que tenía que decir era:
#
#      COM4  →  \Device\BthModem0                  ← la impresora de verdad
#
#  RESTA pedía abrir COM4, Windows le daba el tubo del spooler, y .NET
#  contestaba «eso no es un puerto serie». La impresora nunca se enteró.
#
#  Se notó el 18-sep-2026, justo después de clavar la impresora en COM4 con
#  el script 5: mientras estuvo en COM3 funcionaba, porque COM3 no chocaba
#  con nadie. Al moverla a COM4 se metió encima del que ya tenía el spooler.
#
#  QUÉ HACE ESTE SCRIPT
#
#    1. Les quita el puerto «COM4:» a las impresoras de Windows que lo usen
#       (las deja apuntando a PORTPROMPT:, que no estorba a nadie).
#    2. Borra el puerto «COM4:» de la lista del spooler.
#    3. Reinicia el spooler, para que suelte la etiqueta.
#    4. Apaga y prende el puerto Bluetooth de la impresora, para que Windows
#       vuelva a pedir la etiqueta COM4 — ahora que está libre.
#    5. Comprueba que COM4 ya apunte al puerto de verdad, y lo abre para
#       asegurarse.
#
#  QUÉ **NO** TOCA
#
#    - El emparejamiento de la impresora (no hay que volver a vincular nada).
#    - La configuración de RESTA.
#    - Los datos de la v1 ni los de la v2.
#    - Ninguna otra impresora que no esté usando COM4.
#
#  CÓMO SE USA (pide permiso de administrador; Windows va a preguntar):
#
#      powershell -ExecutionPolicy Bypass -File 6-LIBERAR-EL-PUERTO-COM4.ps1
#
#  Para ver qué haría, sin cambiar nada:      ... .ps1 -SoloVer
# ═══════════════════════════════════════════════════════════════════════════

param(
  [switch]$SoloVer,
  # El número que queremos para la impresora, y su dirección Bluetooth.
  # Si algún día se cambia el aparato, esto es lo único que hay que tocar.
  [string]$Puerto = 'COM4',
  [string]$Direccion = '6632419C81FD'
)

$ErrorActionPreference = 'Stop'

function Decir($texto)  { Write-Host $texto }
function Bien($texto)   { Write-Host "  OK   $texto" -ForegroundColor Green }
function Ojo($texto)    { Write-Host "  OJO  $texto" -ForegroundColor Yellow }
function Mal($texto)    { Write-Host "  MAL  $texto" -ForegroundColor Red }

# ── ¿Somos administrador? ──────────────────────────────────────────────────
$soyAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $soyAdmin -and -not $SoloVer) {
  Mal 'Esto necesita permiso de administrador.'
  Decir ''
  Decir 'Cierra esta ventana, busca "PowerShell" en el menú de inicio,'
  Decir 'haz clic DERECHO y elige "Ejecutar como administrador".'
  Decir 'Luego vuelve a correr este archivo.'
  exit 1
}

# ── A qué apunta ahora mismo la etiqueta ───────────────────────────────────
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Etiquetas {
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern uint QueryDosDevice(string nombre, StringBuilder destino, int maximo);
}
'@

function AQueApunta($nombre) {
  $sb = New-Object System.Text.StringBuilder 1024
  if ([Etiquetas]::QueryDosDevice($nombre, $sb, 1024) -gt 0) { return $sb.ToString() }
  return $null
}

Decir ''
Decir '═══ COMO ESTA AHORA ═══'
$apunta = AQueApunta $Puerto
if ($null -eq $apunta) {
  Ojo "$Puerto no existe como etiqueta."
} elseif ($apunta -like '*NamedPipe*Spooler*') {
  Mal "$Puerto -> $apunta"
  Mal 'Ahi esta el problema: la etiqueta la tiene el sistema de impresion.'
} else {
  Bien "$Puerto -> $apunta"
  Bien 'La etiqueta ya apunta a un puerto de verdad.'
}

# ── Quién la tiene tomada ──────────────────────────────────────────────────
$conPuerto = @(Get-Printer -ErrorAction SilentlyContinue |
               Where-Object { $_.PortName -eq "$($Puerto):" })

Decir ''
Decir '═══ QUIEN USA ESE PUERTO ═══'
if ($conPuerto.Count -eq 0) {
  Bien "Ninguna impresora de Windows usa $($Puerto):"
} else {
  foreach ($imp in $conPuerto) { Ojo "la impresora «$($imp.Name)»" }
}

if ($SoloVer) {
  Decir ''
  Decir 'Modo -SoloVer: no se cambio nada.'
  exit 0
}

# ── 1 y 2. Soltar el puerto ────────────────────────────────────────────────
Decir ''
Decir '═══ SOLTANDO LA ETIQUETA ═══'

foreach ($imp in $conPuerto) {
  try {
    Set-Printer -Name $imp.Name -PortName 'PORTPROMPT:' -ErrorAction Stop
    Bien "«$($imp.Name)» ya no usa $($Puerto):"
  } catch {
    Mal "no pude cambiar «$($imp.Name)»: $($_.Exception.Message)"
  }
}

try {
  Remove-PrinterPort -Name "$($Puerto):" -ErrorAction Stop
  Bien "quitado el puerto $($Puerto): de la lista del spooler"
} catch {
  Ojo "el puerto $($Puerto): no se pudo quitar (quiza ya no estaba): $($_.Exception.Message)"
}

# ── 3. Reiniciar el spooler ────────────────────────────────────────────────
try {
  Restart-Service -Name Spooler -Force -ErrorAction Stop
  Start-Sleep -Seconds 2
  Bien 'sistema de impresion reiniciado'
} catch {
  Mal "no pude reiniciar el sistema de impresion: $($_.Exception.Message)"
}

# ── 4. Apagar y prender el puerto Bluetooth ────────────────────────────────
#
# Windows pide su etiqueta cuando el puerto arranca. Como cuando arrancó la
# etiqueta estaba ocupada, se quedó sin ninguna. Apagarlo y prenderlo hace
# que la vuelva a pedir, ahora que está libre.
Decir ''
Decir '═══ RECONECTANDO EL PUERTO DE LA IMPRESORA ═══'

$puertoBt = Get-PnpDevice -Class Ports -ErrorAction SilentlyContinue |
            Where-Object { $_.InstanceId -like "*$Direccion*" } |
            Select-Object -First 1

if ($null -eq $puertoBt) {
  Mal "no encontre ningun puerto atado a la direccion $Direccion."
  Ojo 'Revisa que la impresora este encendida y emparejada.'
} else {
  try {
    Disable-PnpDevice -InstanceId $puertoBt.InstanceId -Confirm:$false -ErrorAction Stop
    Start-Sleep -Seconds 2
    Enable-PnpDevice  -InstanceId $puertoBt.InstanceId -Confirm:$false -ErrorAction Stop
    Start-Sleep -Seconds 3
    Bien 'puerto apagado y vuelto a prender'
  } catch {
    Mal "no pude reiniciar el puerto: $($_.Exception.Message)"
  }
}

# ── 5. Comprobar ───────────────────────────────────────────────────────────
Decir ''
Decir '═══ COMO QUEDO ═══'

$apunta = AQueApunta $Puerto
if ($null -eq $apunta) {
  Mal "$Puerto sigue sin existir."
} elseif ($apunta -like '*NamedPipe*Spooler*') {
  Mal "$Puerto -> $apunta  (el spooler NO la solto)"
} else {
  Bien "$Puerto -> $apunta"
}

Decir ''
$abrio = $false
try {
  $sp = New-Object System.IO.Ports.SerialPort $Puerto, 9600, 'None', 8, 'One'
  $sp.WriteTimeout = 5000
  $sp.Open()
  $sp.Write([byte[]](0x1B, 0x40), 0, 2)
  $sp.BaseStream.Flush()
  $limite = [DateTime]::UtcNow.AddSeconds(10)
  while ($sp.BytesToWrite -gt 0 -and [DateTime]::UtcNow -lt $limite) { Start-Sleep -Milliseconds 50 }
  $sp.Close()
  $abrio = $true
} catch {
  Mal "todavia no se deja abrir: $($_.Exception.Message.Split([char]10)[0])"
}

Decir ''
if ($abrio) {
  Bien "LISTO. $Puerto se abre y acepta datos."
  Decir ''
  Decir 'Ya puedes mandar una prueba desde RESTA:'
  Decir '   Configuracion -> Impresora -> Probar impresion'
} else {
  Ojo 'No quedo a la primera. Prueba en este orden:'
  Decir '   1. Que la impresora este ENCENDIDA y con papel.'
  Decir '   2. Reinicia la laptop y vuelve a correr este archivo.'
  Decir '   3. Si sigue igual, corre 4-REVISAR-IMPRESORA.ps1 y manda lo que salga.'
}
Decir ''
