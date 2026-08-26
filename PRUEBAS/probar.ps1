<#
  Instala la version de GitHub en C:\RESTA-PRUEBAS y la abre con un PERFIL DE
  CHROME SEPARADO, para poder probarla sin ningun riesgo para la PC de produccion.

  POR QUE EL PERFIL SEPARADO:
  Chrome guarda el localStorage de TODAS las paginas file:// en el mismo sitio,
  sin importar la carpeta. Si abrieras la copia de pruebas con el Chrome normal,
  estaria escribiendo sobre los datos REALES de C:\RESTA. Con
  --user-data-dir=C:\RESTA-PRUEBAS\perfil-chrome la copia tiene su propio
  almacen, aislado por completo.

  Este script NUNCA escribe dentro de C:\RESTA. De ahi solo LEE un respaldo.
#>
param(
  [string]$Rama       = 'master',
  [string]$Destino    = 'C:\RESTA-PRUEBAS',
  [string]$Produccion = 'C:\RESTA'
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$produccion = $Produccion
$destino    = $Destino
$perfil     = Join-Path $destino 'perfil-chrome'
$base       = "https://raw.githubusercontent.com/endoferrari/RESTA/$Rama"

# --- Cinturon de seguridad: jamas escribir dentro de la carpeta de produccion ---
# Se comparan las rutas completas, no el texto tal cual, para que ni "C:\RESTA\",
# ni "C:/RESTA", ni "C:\RESTA\algo" puedan colarse como carpeta de pruebas.
$pDest = [System.IO.Path]::GetFullPath($destino).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
$pProd = [System.IO.Path]::GetFullPath($produccion).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
if ($pDest -ieq $pProd -or $pDest.StartsWith($pProd + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  Write-Host '  [ERROR] La carpeta de pruebas no puede ser la de produccion' -ForegroundColor Red
  Write-Host "          ni estar dentro de ella ($pProd)." -ForegroundColor Red
  Write-Host '          Cancelado sin tocar nada.' -ForegroundColor Red
  exit 1
}

Write-Host ''
Write-Host '  ============================================================' -ForegroundColor White
Write-Host '   COPIA DE PRUEBAS DE RESTA' -ForegroundColor White
Write-Host "   Rama: $Rama    Carpeta: $destino" -ForegroundColor White
Write-Host "   La instalacion real de $produccion no se toca." -ForegroundColor White
Write-Host '  ============================================================' -ForegroundColor White
Write-Host ''

# --- 1. Descargar el programa ---
New-Item -ItemType Directory -Path $destino -Force | Out-Null
New-Item -ItemType Directory -Path $perfil  -Force | Out-Null

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('RESTA_prueba_' + [Guid]::NewGuid().ToString('N') + '.html')
Write-Host '  Descargando la version de GitHub...'
try {
  Invoke-WebRequest -Uri "$base/RESTA.html?_=$([DateTime]::UtcNow.Ticks)" -OutFile $tmp -UseBasicParsing
} catch {
  Write-Host "  [ERROR] No se pudo descargar: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
$txt = Get-Content $tmp -Raw -Encoding UTF8
if ($txt.Length -lt 5000 -or $txt.IndexOf('APP_VERSION') -lt 0) {
  Write-Host '  [ERROR] Lo descargado no parece ser RESTA. Intenta otra vez.' -ForegroundColor Red
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  exit 1
}
$m = [regex]::Match($txt, "APP_VERSION\s*=\s*'([^']+)'")
$ver = if ($m.Success) { $m.Groups[1].Value } else { '?' }
Move-Item $tmp (Join-Path $destino 'RESTA.html') -Force
Write-Host "  [OK] Version v$ver instalada en $destino" -ForegroundColor Green

# --- 2. Traer una COPIA de los datos reales, solo para probar ---
$origenDatos = $null
$resp = Get-ChildItem (Join-Path $produccion 'Respaldos') -Recurse -Filter 'RESTA datos.json' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($resp) { $origenDatos = $resp.FullName }
if (-not $origenDatos) {
  $desc = Get-ChildItem (Join-Path $env:USERPROFILE 'Downloads') -Filter 'RESTA respaldo*.json' -ErrorAction SilentlyContinue |
          Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($desc) { $origenDatos = $desc.FullName }
}
if ($origenDatos) {
  Copy-Item $origenDatos (Join-Path $destino 'datos-de-produccion.json') -Force
  Write-Host "  [OK] Copia de los datos reales lista para probar" -ForegroundColor Green
  Write-Host "       origen: $origenDatos" -ForegroundColor DarkGray
} else {
  Write-Host '  [AVISO] No encontre ningun respaldo .json de produccion.' -ForegroundColor Yellow
  Write-Host '          Abre ONCE POS, toca "Respaldo", y copia ese .json' -ForegroundColor Yellow
  Write-Host "          a $destino para probar con datos reales." -ForegroundColor Yellow
}

# --- 3. Buscar navegador ---
$rutas = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)
$navegador = $rutas | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $navegador) {
  Write-Host '  [ERROR] No encontre Chrome ni Edge en esta PC.' -ForegroundColor Red
  exit 1
}

# --- 4. Acceso directo con perfil aislado ---
$urlArchivo = 'file:///' + (Join-Path $destino 'RESTA.html').Replace('\', '/')
$argumentos = '--kiosk-printing --user-data-dir="' + $perfil + '" --app=' + $urlArchivo
try {
  $w = New-Object -ComObject WScript.Shell
  $s = $w.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\RESTA PRUEBAS.lnk')
  $s.TargetPath       = $navegador
  $s.Arguments        = $argumentos
  $s.WorkingDirectory = $destino
  $s.Description      = 'Copia de PRUEBAS de RESTA - no toca los datos reales'
  $s.Save()
  Write-Host '  [OK] Acceso directo "RESTA PRUEBAS" creado en el escritorio' -ForegroundColor Green
} catch {
  Write-Host '  [AVISO] No se pudo crear el acceso directo. Abrela con este comando:' -ForegroundColor Yellow
  Write-Host "          `"$navegador`" $argumentos" -ForegroundColor Yellow
}

# --- 5. Abrirla ---
Write-Host ''
Write-Host '  ------------------------------------------------------------' -ForegroundColor Cyan
Write-Host '   QUE HACER AHORA' -ForegroundColor Cyan
Write-Host '  ------------------------------------------------------------' -ForegroundColor Cyan
Write-Host '   1. Se va a abrir la copia de pruebas VACIA (menu de fabrica).'
Write-Host '   2. Toca el boton "Recuperar" y elige:'
Write-Host "         $destino\datos-de-produccion.json"
Write-Host '      Ahi ya tienes el menu, los precios y las ventas de verdad.'
Write-Host '   3. Prueba con calma: mesa, comanda, ticket, cobro, corte.'
Write-Host ''
Write-Host '   NO uses el boton "Actualizar" dentro de la copia de pruebas:' -ForegroundColor Yellow
Write-Host '   te pediria una carpeta y podrias apuntar a C:\RESTA sin querer.' -ForegroundColor Yellow
Write-Host ''
Write-Host '   Cuando termines: 4-BORRAR-PRUEBAS.bat' -ForegroundColor DarkGray
Write-Host ''

Start-Process -FilePath $navegador -ArgumentList $argumentos
