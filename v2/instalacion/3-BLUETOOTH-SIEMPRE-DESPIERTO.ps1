# ═══════════════════════════════════════════════════════════════════════════
#  RESTA · QUE WINDOWS NO APAGUE EL BLUETOOTH
#  ─────────────────────────────────────────────────────────────────────────
#  QUÉ ARREGLA
#
#  La impresora del bar es Bluetooth. Windows viene de fábrica con permiso
#  para APAGAR la antena Bluetooth cuando lleva un rato sin usarse, para
#  ahorrar batería. En una laptop de casa eso está bien; en la caja de un bar
#  es un problema: cuando llega el primer ticket después de un rato tranquilo,
#  la antena está dormida, el primer intento de imprimir falla, y el papel no
#  sale hasta que Windows la despierta.
#
#  Eso es lo que se ve como «error de la impresora» y luego, al minuto, el
#  ticket saliendo solo.
#
#  QUÉ TOCA ESTE SCRIPT
#
#    · La casilla «Permitir que el equipo apague este dispositivo para
#      ahorrar energía» de la antena Bluetooth — la deja DESMARCADA.
#    · La misma casilla de los concentradores USB por donde cuelga la antena.
#      Hace falta: de nada sirve pedirle a la antena que no se duerma si el
#      enchufe USB de arriba se apaga y se la lleva con él.
#    · La «suspensión selectiva de USB» del plan de energía, por lo mismo.
#
#  QUÉ **NO** TOCA — nada de esto se mueve:
#
#    - La impresora, su nombre, su driver ni su puerto COM.
#    - El emparejamiento Bluetooth (no hay que volver a vincular nada).
#    - La configuración de RESTA.
#    - Ningún otro aparato que no sea Bluetooth o USB.
#
#  Y TODO SE PUEDE DESHACER: corre este mismo archivo con  -Deshacer
#  y todo vuelve exactamente como estaba.
#
#  CÓMO SE USA (hace falta permiso de administrador, Windows lo va a pedir):
#
#      powershell -ExecutionPolicy Bypass -File 3-BLUETOOTH-SIEMPRE-DESPIERTO.ps1
#
#  Para ver qué haría, sin cambiar nada:      ... .ps1 -SoloVer
#  Para deshacerlo:                           ... .ps1 -Deshacer
# ═══════════════════════════════════════════════════════════════════════════

param(
  [switch]$Deshacer,
  [switch]$SoloVer      # enseña qué haría, sin cambiar nada
)

$ErrorActionPreference = 'Stop'

function Titulo($t) {
  Write-Host ""
  Write-Host ("=" * 70) -ForegroundColor DarkCyan
  Write-Host " $t" -ForegroundColor Cyan
  Write-Host ("=" * 70) -ForegroundColor DarkCyan
}

# ── ¿Vamos como administrador? ──────────────────────────────────────────────
$identidad = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identidad)
$soyAdmin  = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $soyAdmin -and -not $SoloVer) {
  Write-Host ""
  Write-Host " Esto necesita permiso de administrador." -ForegroundColor Yellow
  Write-Host " Windows te va a preguntar. Dile que si." -ForegroundColor Yellow
  Write-Host ""

  $argumentos = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-File', "`"$PSCommandPath`"")
  if ($Deshacer) { $argumentos += '-Deshacer' }

  Start-Process powershell.exe -Verb RunAs -ArgumentList $argumentos
  return
}

# $objetivo = $true  -> que la antena NO se pueda apagar sola
# $objetivo = $false -> devolverlo como venía de fábrica
$objetivo = -not $Deshacer

if ($Deshacer) { Titulo "DEVOLVER EL AHORRO DE ENERGIA COMO ESTABA" }
else           { Titulo "QUE WINDOWS NO APAGUE EL BLUETOOTH" }

# ── 1. La casilla de ahorro de energía, aparato por aparato ─────────────────
#
# `MSPower_DeviceEnable` es exactamente la casilla que sale en el Administrador
# de dispositivos, pestaña «Administración de energía». Enable = $true quiere
# decir «Windows lo puede apagar»; lo que queremos es dejarla en $false.

Write-Host ""
Write-Host " Aparatos Bluetooth y USB:" -ForegroundColor White

$presentes = @{}
Get-PnpDevice -Class Bluetooth, USB -ErrorAction SilentlyContinue |
  Where-Object { $_.Present } |
  ForEach-Object { $presentes[$_.InstanceId] = $_.FriendlyName }

$cambiados = 0
$yaEstaban = 0
$fallaron  = 0

# El valor de `Enable` que queremos dejar en cada aparato.
$quiere = -not $objetivo

foreach ($p in (Get-CimInstance -Namespace root\WMI -ClassName MSPower_DeviceEnable -ErrorAction SilentlyContinue)) {

  # El nombre en WMI trae un «_0» pegado al final que el de PnP no tiene.
  $id = $p.InstanceName -replace '_\d+$', ''
  if (-not $presentes.ContainsKey($id)) { continue }

  $nombre = $presentes[$id]

  if ($p.Enable -eq $quiere) {
    $yaEstaban++
    Write-Host ("   .  ya estaba bien    {0}" -f $nombre) -ForegroundColor DarkGray
    continue
  }

  if ($SoloVer) {
    Write-Host ("   >  CAMBIARIA         {0}" -f $nombre) -ForegroundColor Yellow
    continue
  }

  try {
    $p.Enable = $quiere
    Set-CimInstance -InputObject $p -ErrorAction Stop
    $cambiados++
    if ($objetivo) { $etiqueta = 'ya no se apaga  ' } else { $etiqueta = 'como antes      ' }
    Write-Host ("   OK {0}{1}" -f $etiqueta, $nombre) -ForegroundColor Green
  } catch {
    $fallaron++
    Write-Host ("   !  no se dejo       {0}" -f $nombre) -ForegroundColor Red
    Write-Host ("      ({0})" -f $_.Exception.Message) -ForegroundColor DarkGray
  }
}

Write-Host ""
Write-Host (" Cambiados: {0}   ya estaban bien: {1}   fallaron: {2}" -f $cambiados, $yaEstaban, $fallaron)

# ── 2. La suspensión selectiva de USB del plan de energía ───────────────────
#
# Aunque cada aparato tenga su casilla, el plan de energía tiene su propio
# interruptor general para el USB. Si éste queda encendido, la antena se
# duerme igual.

Write-Host ""
Write-Host " Plan de energia (suspension selectiva de USB):" -ForegroundColor White

$GRUPO_USB         = '2a737441-1930-4402-8d77-b2bebba308a3'
$AJUSTE_SUSPENSION = '48e6b7a6-50f5-4782-a5d4-53bb8f07e226'

# 0 = deshabilitada (no duerme el USB) · 1 = habilitada (como viene de fábrica)
if ($objetivo) { $valor = 0 } else { $valor = 1 }

if ($SoloVer) {
  Write-Host ("   >  CAMBIARIA a valor {0}  (0 = no duerme el USB)" -f $valor) -ForegroundColor Yellow
} else {
  try {
    & powercfg /SETACVALUEINDEX SCHEME_CURRENT $GRUPO_USB $AJUSTE_SUSPENSION $valor | Out-Null
    & powercfg /SETDCVALUEINDEX SCHEME_CURRENT $GRUPO_USB $AJUSTE_SUSPENSION $valor | Out-Null
    & powercfg /SETACTIVE SCHEME_CURRENT | Out-Null
    if ($objetivo) { Write-Host "   OK deshabilitada, enchufada y con bateria" -ForegroundColor Green }
    else           { Write-Host "   OK habilitada de nuevo, como venia" -ForegroundColor Green }
  } catch {
    Write-Host ("   !  no se pudo: {0}" -f $_.Exception.Message) -ForegroundColor Red
  }
}

# ── 3. Cómo quedó ──────────────────────────────────────────────────────────
Titulo "COMO QUEDO"

Write-Host ""
Write-Host " Antena Bluetooth y puertos de la impresora:" -ForegroundColor White
Get-PnpDevice -Class Bluetooth, Ports -ErrorAction SilentlyContinue |
  Where-Object { $_.Present } |
  ForEach-Object { Write-Host ("   {0,-8} {1}" -f $_.Status, $_.FriendlyName) }

Write-Host ""
if ($SoloVer) {
  Write-Host " Esto fue solo una mirada: NO se cambio nada." -ForegroundColor Cyan
} elseif ($Deshacer) {
  Write-Host " Listo: todo quedo como estaba antes." -ForegroundColor Cyan
} else {
  Write-Host " Listo. La antena Bluetooth ya no se va a dormir sola." -ForegroundColor Green
  Write-Host ""
  Write-Host " COMO COMPROBARLO:" -ForegroundColor White
  Write-Host "   1. Deja la laptop quieta unos 20 minutos."
  Write-Host "   2. Manda una impresion de prueba."
  Write-Host "   3. El papel debe salir de una, sin el error ni la espera."
  Write-Host ""
  Write-Host " Si algo se puso raro, se deshace corriendo este mismo archivo" -ForegroundColor DarkGray
  Write-Host " con -Deshacer al final." -ForegroundColor DarkGray
}
Write-Host ""
