# ═══════════════════════════════════════════════════════════════════════════
#  RESTA · DEJAR LA IMPRESORA CLAVADA EN COM4, PARA SIEMPRE
#  ─────────────────────────────────────────────────────────────────────────
#  QUÉ ARREGLA
#
#  La impresora del bar es Bluetooth, y Windows la trata como algo de paso:
#  le cambia el número de puerto cuando se le antoja, la desempareja sola
#  después de apagar la laptop, y apaga su antena para ahorrar batería.
#
#  Cada una de esas tres cosas se ve igual desde la caja: no sale el ticket.
#
#  Este script le quita a Windows esas tres libertades, de forma permanente:
#
#    1. APAGA EL «INICIO RÁPIDO».
#       Es la causa de que un día la impresora amanezca «sin emparejar» sin
#       que nadie haya tocado nada. Con el inicio rápido encendido, apagar la
#       laptop NO la apaga de verdad: Windows congela el estado del Bluetooth
#       y lo descongela al prender. Pero la impresora sí se apagó de verdad,
#       así que Windows despierta creyendo cosas que ya no son ciertas y el
#       emparejamiento se rompe. Apagarlo cuesta unos segundos más de
#       arranque. En la caja de un bar, eso no lo nota nadie.
#
#    2. CLAVA A LA IMPRESORA EN COM4.
#       El número de puerto NO es fijo: Windows lo reparte por orden de
#       llegada. El 25-ago-2026 la impresora estaba en COM3 y el puerto
#       entrante en COM4; el 2-sep-2026, tras reemparejar, quedaron al revés.
#       Aquí se busca a la impresora POR SU DIRECCIÓN Bluetooth —no por su
#       número, que es justo lo que se mueve— y se le deja COM4 escrito en el
#       registro. Si otro aparato estaba sentado en COM4, se le manda a un
#       número alto. Además se reserva el 4 para que nadie más lo pida.
#
#    3. ASEGURA QUE ARRANQUE SOLO Y QUE LA ANTENA NO SE DUERMA.
#       Los servicios de Bluetooth quedan en «Automático», y se comprueba que
#       siga puesto el «no apagar la antena» del script 3. Si Windows Update
#       lo revirtió —lo hace—, este script lo vuelve a poner.
#
#  QUÉ **NO** TOCA — nada de esto se mueve:
#
#    - El emparejamiento (no hay que volver a vincular nada).
#    - El agente de impresión de la v1 ni la RESTA vieja, que siguen en uso.
#      Si encuentra algo raro ahí, lo AVISA y no lo toca.
#    - La configuración de RESTA v2.
#
#  CÓMO SE USA (pide permiso de administrador; Windows va a preguntar):
#
#      powershell -ExecutionPolicy Bypass -File 5-IMPRESORA-CLAVADA-EN-COM4.ps1
#
#  Para ver qué haría, sin cambiar nada:      ... .ps1 -SoloVer
#  Para deshacerlo:                           ... .ps1 -Deshacer
#
#  Después de correrlo hay que REINICIAR LA LAPTOP una vez. Es la única
#  manera de que Windows suelte el puerto viejo y tome el nuevo.
# ═══════════════════════════════════════════════════════════════════════════

param(
  [switch]$Deshacer,
  [switch]$SoloVer,
  # La dirección Bluetooth de la impresora de ONCE y el puerto que queremos
  # que tenga siempre. Si algún día se cambia el aparato, esto es lo único
  # que hay que actualizar aquí.
  [string]$Direccion = '6632419C81FD',
  [string]$PuertoDeseado = 'COM4'
)

$ErrorActionPreference = 'Continue'

function Titulo($t) {
  Write-Host ""
  Write-Host ("=" * 72) -ForegroundColor DarkCyan
  Write-Host " $t" -ForegroundColor Cyan
  Write-Host ("=" * 72) -ForegroundColor DarkCyan
}
function Bien($t)  { Write-Host "  OK    $t" -ForegroundColor Green }
function Mal($t)   { Write-Host "  FALLA $t" -ForegroundColor Red }
function Ojo($t)   { Write-Host "  OJO   $t" -ForegroundColor Yellow }
function Dato($t)  { Write-Host "        $t" -ForegroundColor Gray }
function Haria($t) { Write-Host "  >     CAMBIARIA: $t" -ForegroundColor Yellow }

$pendientes = @()

# ── ¿Vamos como administrador? ─────────────────────────────────────────────
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

if ($Deshacer) { Titulo "DEVOLVER LOS AJUSTES DE WINDOWS COMO ESTABAN" }
else           { Titulo "DEJAR LA IMPRESORA CLAVADA EN $PuertoDeseado" }

# Aquí se guarda cómo estaba todo antes de tocarlo, para poder deshacerlo.
$RUTA_ANTES = Join-Path $PSScriptRoot 'como-estaba-antes.json'
$antes = @{}
if (Test-Path $RUTA_ANTES) {
  try {
    (Get-Content $RUTA_ANTES -Raw | ConvertFrom-Json).PSObject.Properties |
      ForEach-Object { $antes[$_.Name] = $_.Value }
  } catch {}
}


# ═══ 1. EL INICIO RÁPIDO DE WINDOWS ════════════════════════════════════════
Titulo "1. EL INICIO RAPIDO DE WINDOWS"

$CLAVE_POWER = 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power'
$actual = (Get-ItemProperty $CLAVE_POWER -Name HiberbootEnabled -ErrorAction SilentlyContinue).HiberbootEnabled

Dato "Con el inicio rapido encendido, apagar la laptop no apaga el Bluetooth:"
Dato "lo congela. Al prender, Windows cree que la impresora sigue conectada"
Dato "cuando en realidad estuvo apagada toda la noche. De ahi que amanezca"
Dato "'sin emparejar' sin que nadie haya tocado nada."
Write-Host ""

if ($Deshacer) {
  $volverA = 1
  if ($antes.ContainsKey('HiberbootEnabled')) { $volverA = [int]$antes['HiberbootEnabled'] }
  if ($actual -eq $volverA) {
    Bien "El inicio rapido ya esta como estaba (valor $volverA)."
  } elseif ($SoloVer) {
    Haria "poner el inicio rapido en $volverA"
  } else {
    try {
      Set-ItemProperty $CLAVE_POWER -Name HiberbootEnabled -Value $volverA -Type DWord -ErrorAction Stop
      Bien "Inicio rapido devuelto a $volverA."
    } catch { Mal "No se pudo: $($_.Exception.Message)" }
  }
} else {
  if ($actual -eq 0) {
    Bien "El inicio rapido ya esta APAGADO. Nada que hacer."
  } elseif ($SoloVer) {
    Haria "apagar el inicio rapido (ahora esta en $actual)"
  } else {
    try {
      if (-not $antes.ContainsKey('HiberbootEnabled')) { $antes['HiberbootEnabled'] = $actual }
      Set-ItemProperty $CLAVE_POWER -Name HiberbootEnabled -Value 0 -Type DWord -ErrorAction Stop
      Bien "Inicio rapido APAGADO. El Bluetooth se reinicia limpio cada arranque."
      $pendientes += "Reiniciar la laptop para que el inicio rapido apagado tome efecto."
    } catch { Mal "No se pudo apagar: $($_.Exception.Message)" }
  }
}


# ═══ 2. CLAVAR EL PUERTO COM ═══════════════════════════════════════════════
Titulo "2. EL PUERTO DE LA IMPRESORA"

# El nombre del puerto NO vive en el aparato: vive en el registro, en
# «Device Parameters\PortName». Por eso hay que ir a leerlo ahí y no fiarse
# del título que se ve en el Administrador de dispositivos.
function Leer-Puertos {
  Get-PnpDevice -Class Ports -ErrorAction SilentlyContinue | ForEach-Object {
    $k = "HKLM:\SYSTEM\CurrentControlSet\Enum\" + $_.InstanceId + "\Device Parameters"
    $n = (Get-ItemProperty $k -Name PortName -ErrorAction SilentlyContinue).PortName
    if ($n) {
      [pscustomobject]@{
        Puerto = $n.ToUpper()
        Nombre = $_.FriendlyName
        Id     = $_.InstanceId
        Clave  = $k
        # El puerto ENTRANTE trae la dirección 000000000000 y no lleva a
        # ninguna parte, pero se llama igual que el bueno y despista.
        EsEntrante  = ($_.InstanceId -match '[&_]0{12}_')
        EsImpresora = ($_.InstanceId -like "*$Direccion*")
      }
    }
  }
}

$puertos = @(Leer-Puertos)
Write-Host " Puertos COM que ve Windows ahora mismo:" -ForegroundColor White
foreach ($p in $puertos) {
  if     ($p.EsImpresora) { Bien "$($p.Puerto)  <-- LA IMPRESORA" }
  elseif ($p.EsEntrante)  { Dato "$($p.Puerto)  (Bluetooth entrante: no lleva a ninguna parte)" }
  else                    { Dato "$($p.Puerto)  ($($p.Nombre))" }
}
Write-Host ""

$impresora = $puertos | Where-Object { $_.EsImpresora } | Select-Object -First 1

if ($Deshacer) {
  Ojo "El numero de puerto NO se deshace: dejarlo en $PuertoDeseado es lo correcto."
  Dato "Deshacer eso solo volveria a romper la impresion."
} elseif (-not $impresora) {
  Mal "No encuentro ningun puerto de la impresora (direccion $Direccion)."
  Dato "Eso significa que la impresora no esta emparejada con esta laptop."
  Dato "Arreglo: Configuracion de Windows -> Bluetooth y dispositivos -> Agregar."
  Dato "Vuelve a correr este script cuando ya aparezca emparejada."
  $pendientes += "Emparejar la impresora y volver a correr este script."
} elseif ($impresora.Puerto -eq $PuertoDeseado) {
  Bien "La impresora YA esta en $PuertoDeseado. No hay que moverla."
} else {
  Ojo "La impresora esta en $($impresora.Puerto), no en $PuertoDeseado."

  # ¿Hay alguien sentado en el puerto que queremos? Si lo hay, se le manda a
  # un número alto. Alto a propósito: los números bajos son los que Windows
  # reparte solo, y ahí es donde vuelven a chocar.
  $ocupa = $puertos | Where-Object { $_.Puerto -eq $PuertoDeseado } | Select-Object -First 1
  $libre = $null
  if ($ocupa) {
    $usados = $puertos | ForEach-Object { $_.Puerto }
    for ($i = 20; $i -lt 60; $i++) { if ($usados -notcontains "COM$i") { $libre = "COM$i"; break } }
  }

  if ($SoloVer) {
    if ($ocupa) { Haria "mover '$($ocupa.Nombre)' de $PuertoDeseado a $libre" }
    Haria "mover la impresora de $($impresora.Puerto) a $PuertoDeseado"
  } else {
    $sitioLibre = $true
    if ($ocupa) {
      try {
        Set-ItemProperty $ocupa.Clave -Name PortName -Value $libre -ErrorAction Stop
        Bien "'$($ocupa.Nombre)' movido de $PuertoDeseado a $libre, para dejar sitio."
      } catch {
        $sitioLibre = $false
        Mal "No pude mover a '$($ocupa.Nombre)' de $PuertoDeseado : $($_.Exception.Message)"
      }
    }
    if ($sitioLibre) {
      try {
        Set-ItemProperty $impresora.Clave -Name PortName -Value $PuertoDeseado -ErrorAction Stop
        Bien "Impresora movida de $($impresora.Puerto) a $PuertoDeseado."
        $pendientes += "Reiniciar la laptop para que $PuertoDeseado quede activo."
      } catch {
        Mal "No pude ponerle $PuertoDeseado a la impresora: $($_.Exception.Message)"
        Dato "Se puede a mano: Administrador de dispositivos -> Puertos (COM y LPT)"
        Dato "-> el de la impresora -> Propiedades -> Configuracion de puerto"
        Dato "-> Opciones avanzadas -> Numero de puerto COM -> $PuertoDeseado."
      }
    }
  }
}

# ── Reservar el número, para que ningún aparato nuevo lo pida ──────────────
#
# Windows lleva una lista de números COM ya repartidos. Es un mapa de bits: el
# bit N del byte M corresponde al puerto (M*8 + N + 1). Marcando el de COM4 se
# le dice a Windows «este ya está dado», y deja de ofrecerlo.
$CLAVE_ARBITRO = 'HKLM:\SYSTEM\CurrentControlSet\Control\COM Name Arbiter'
$numero = [int]($PuertoDeseado -replace '\D', '')
if (-not $Deshacer -and $numero -gt 0) {
  try {
    $db = (Get-ItemProperty $CLAVE_ARBITRO -Name ComDB -ErrorAction Stop).ComDB
    $byte = [math]::Floor(($numero - 1) / 8)
    $bit  = ($numero - 1) % 8
    if ($byte -lt $db.Length) {
      if ($db[$byte] -band (1 -shl $bit)) {
        Bien "$PuertoDeseado ya estaba reservado. Ningun aparato nuevo lo va a pedir."
      } elseif ($SoloVer) {
        Haria "reservar $PuertoDeseado para que nadie mas lo tome"
      } else {
        $db[$byte] = $db[$byte] -bor (1 -shl $bit)
        Set-ItemProperty $CLAVE_ARBITRO -Name ComDB -Value $db -ErrorAction Stop
        Bien "$PuertoDeseado reservado. Ningun aparato nuevo lo va a pedir."
      }
    }
  } catch {
    Ojo "No pude leer o escribir la reserva de numeros COM: $($_.Exception.Message)"
  }
}


# ═══ 3. QUE ARRANQUE SOLO Y NO SE DUERMA ═══════════════════════════════════
Titulo "3. QUE ARRANQUE SOLO Y NO SE DUERMA"

Write-Host " Servicios de Bluetooth:" -ForegroundColor White
foreach ($s in 'bthserv', 'BTAGService') {
  $srv = Get-Service $s -ErrorAction SilentlyContinue
  if (-not $srv) { Ojo "No existe el servicio $s"; continue }

  if ($srv.StartType -eq 'Automatic') {
    Bien "$s arranca solo al prender la laptop."
  } elseif ($SoloVer) {
    Haria "poner $s en arranque Automatico (ahora esta en $($srv.StartType))"
  } elseif (-not $Deshacer) {
    try {
      Set-Service $s -StartupType Automatic -ErrorAction Stop
      Bien "$s puesto en Automatico."
    } catch { Mal "No pude cambiar $s : $($_.Exception.Message)" }
  }

  if ($srv.Status -ne 'Running' -and -not $SoloVer -and -not $Deshacer) {
    try { Start-Service $s -ErrorAction Stop; Bien "$s arrancado." }
    catch { Mal "No pude arrancar $s : $($_.Exception.Message)" }
  }
}

# ── La casilla de «ahorro de energía» de la antena ────────────────────────
#
# La pone el script 3. Se comprueba aquí porque Windows Update la revierte, y
# cuando eso pasa vuelve el síntoma de siempre: el primer ticket después de un
# rato tranquilo marca error y sale al minuto.
Write-Host ""
Write-Host " Ahorro de energia de la antena:" -ForegroundColor White

$presentes = @{}
Get-PnpDevice -Class Bluetooth, USB -ErrorAction SilentlyContinue |
  Where-Object { $_.Present } |
  ForEach-Object { $presentes[$_.InstanceId] = $_.FriendlyName }

$dormilones = @()
foreach ($p in (Get-CimInstance -Namespace root\WMI -ClassName MSPower_DeviceEnable -ErrorAction SilentlyContinue)) {
  $id = $p.InstanceName -replace '_\d+$', ''
  if ($presentes.ContainsKey($id) -and $p.Enable) { $dormilones += $presentes[$id] }
}

if ($Deshacer) {
  Dato "Esto lo maneja el script 3. Para devolverlo:"
  Dato "3-BLUETOOTH-SIEMPRE-DESPIERTO.ps1 -Deshacer"
} elseif ($dormilones.Count -eq 0) {
  Bien "Ningun aparato Bluetooth o USB se puede dormir. Correcto."
} else {
  Ojo "$($dormilones.Count) aparato(s) todavia se pueden dormir:"
  foreach ($d in $dormilones) { Dato "- $d" }
  $script3 = Join-Path $PSScriptRoot '3-BLUETOOTH-SIEMPRE-DESPIERTO.ps1'
  if ($SoloVer) {
    Haria "correr el script 3 para quitarles el permiso de dormirse"
  } elseif (Test-Path $script3) {
    Dato "Corriendo el script 3 para arreglarlo..."
    & $script3
  } else {
    $pendientes += "Correr 3-BLUETOOTH-SIEMPRE-DESPIERTO.ps1 (no lo encontre junto a este)."
  }
}


# ═══ 4. LO QUE ENCONTRÉ Y NO TOQUÉ ═════════════════════════════════════════
Titulo "4. LO QUE ENCONTRE Y **NO** TOQUE"

Dato "Estas cosas pueden pelearse por la impresora, pero son de la RESTA vieja,"
Dato "que sigue en produccion. No las toca nadie sin decidirlo antes."
Write-Host ""

# La v1 imprime por el spooler de Windows; la v2 escribe directo al puerto
# COM. Son dos caminos al mismo aparato: mientras el trabajo de uno está en
# vuelo, el puerto está ocupado para el otro.
$arranques = @()
foreach ($carpeta in @("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup",
                       "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Startup")) {
  Get-ChildItem $carpeta -Filter *.lnk -ErrorAction SilentlyContinue | ForEach-Object {
    $sh = New-Object -ComObject WScript.Shell
    $lk = $sh.CreateShortcut($_.FullName)
    if ("$($lk.TargetPath) $($lk.Arguments)" -match 'agente-impresion') { $arranques += $_.FullName }
  }
}
if ($arranques.Count -gt 1) {
  Ojo "El agente de impresion de la v1 arranca $($arranques.Count) VECES:"
  foreach ($a in $arranques) { Dato "- $a" }
  Dato "Los dos abren el mismo programa en el mismo puerto 9100. El segundo"
  Dato "siempre muere al arrancar. Sobra uno, pero borrarlo es decision tuya."
} elseif ($arranques.Count -eq 1) {
  Dato "El agente de impresion de la v1 arranca una vez. Correcto."
}

$duplicadas = @(Get-Printer -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -match '(?i)copy of|copia de' })
if ($duplicadas.Count -gt 0) {
  Write-Host ""
  Ojo "Hay $($duplicadas.Count) impresora(s) duplicada(s) en Windows:"
  foreach ($d in $duplicadas) { Dato "- $($d.Name)  (puerto $($d.PortName))" }
  Dato "Sobran. Se quitan en Configuracion -> Bluetooth y dispositivos ->"
  Dato "Impresoras y escaneres. No las borro yo por si alguna esta en uso."
}


# ═══ CÓMO QUEDÓ ════════════════════════════════════════════════════════════
if (-not $SoloVer -and -not $Deshacer) {
  try { ($antes | ConvertTo-Json) | Set-Content $RUTA_ANTES -Encoding UTF8 } catch {}
}

Titulo "COMO QUEDO"

if ($SoloVer) {
  Write-Host ""
  Write-Host " Esto fue solo una mirada: NO se cambio nada." -ForegroundColor Cyan
  Write-Host " Para aplicarlo de verdad, corre el mismo archivo sin -SoloVer." -ForegroundColor Cyan
  Write-Host ""
  return
}

if ($Deshacer) {
  Write-Host ""
  Write-Host " Listo: los ajustes de Windows quedaron como estaban." -ForegroundColor Cyan
  Write-Host " El puerto COM se quedo en $PuertoDeseado a proposito." -ForegroundColor Cyan
  Write-Host ""
  return
}

Write-Host ""
if ($pendientes.Count -gt 0) {
  Write-Host " FALTA HACER ESTO:" -ForegroundColor Yellow
  $i = 1
  foreach ($p in $pendientes) { Write-Host "   $i. $p" -ForegroundColor Yellow; $i++ }
  Write-Host ""
}

Write-Host " COMO COMPROBAR QUE QUEDO BIEN:" -ForegroundColor White
Write-Host ""
Write-Host "   1. Reinicia la laptop (Inicio -> Reiniciar, no 'Apagar')."
Write-Host "   2. Sin abrir nada mas, corre el revisor:"
Write-Host ""
Write-Host "        powershell -ExecutionPolicy Bypass -File 4-REVISAR-IMPRESORA.ps1 -Probar" -ForegroundColor White
Write-Host ""
Write-Host "   3. Tiene que decir $PuertoDeseado en verde y salir un ticket de prueba."
Write-Host "   4. Deja la laptop quieta 20 minutos y manda otro ticket desde RESTA."
Write-Host "      Debe salir de una, sin el error ni la espera del minuto."
Write-Host ""
Write-Host " Si algo se puso raro, se deshace con:  ... .ps1 -Deshacer" -ForegroundColor DarkGray
Write-Host ""
