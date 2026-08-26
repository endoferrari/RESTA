<#
  Descarga el instalador de la RESTA v2 desde las Releases de GitHub y comprueba
  su huella SHA-256 contra la que publica GitHub.

  SOLO DESCARGA. No instala nada, no ejecuta el .exe, no toca C:\RESTA.

  La v2 es un programa distinto (aplicacion de escritorio con base de datos).
  Pruebala en OTRA computadora, no en la laptop del bar: el instalador la deja
  arrancando al prender la maquina y abre el puerto 8080 para las tablets.
#>
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host ''
Write-Host '  ============================================================' -ForegroundColor White
Write-Host '   BAJAR EL INSTALADOR DE LA RESTA v2  (solo descarga)' -ForegroundColor White
Write-Host '  ============================================================' -ForegroundColor White
Write-Host ''

Write-Host '  Consultando la ultima version publicada...'
try {
  $rel = Invoke-RestMethod -Uri 'https://api.github.com/repos/endoferrari/RESTA/releases/latest' -UseBasicParsing -Headers @{ 'User-Agent' = 'RESTA-pruebas' }
} catch {
  Write-Host "  [ERROR] No se pudo consultar GitHub: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

$asset = $rel.assets | Where-Object { $_.name -like '*.exe' } | Select-Object -First 1
if (-not $asset) {
  Write-Host '  [ERROR] Esa version no trae instalador .exe.' -ForegroundColor Red
  Write-Host "  Revisala a mano en: $($rel.html_url)" -ForegroundColor Yellow
  exit 1
}

Write-Host ("  Version:  {0}   ({1:yyyy-MM-dd})" -f $rel.tag_name, [DateTime]$rel.published_at)
Write-Host ("  Archivo:  {0}   ({1:N0} MB)" -f $asset.name, ($asset.size / 1MB))
Write-Host ''

$escritorio = [Environment]::GetFolderPath('Desktop')
if (-not $escritorio) { $escritorio = $env:USERPROFILE }
if (-not $escritorio) { $escritorio = (Get-Location).Path }
$destino = Join-Path $escritorio $asset.name

Write-Host "  Descargando a: $destino"
Write-Host '  Son unos 100 MB; puede tardar varios minutos.'
$antes = $ProgressPreference
$ProgressPreference = 'SilentlyContinue'
try {
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $destino -UseBasicParsing
} catch {
  Write-Host "  [ERROR] Fallo la descarga: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
} finally {
  $ProgressPreference = $antes
}

# --- Comprobar la huella contra la que publica GitHub ---
$huella = (Get-FileHash $destino -Algorithm SHA256).Hash.ToLower()
Write-Host ''
Write-Host "  SHA-256 del archivo bajado:  $huella" -ForegroundColor DarkGray
if ($asset.digest -and $asset.digest -match 'sha256:(?<h>[0-9a-f]{64})') {
  $esperado = $Matches['h'].ToLower()
  Write-Host "  SHA-256 que publica GitHub:  $esperado" -ForegroundColor DarkGray
  Write-Host ''
  if ($huella -eq $esperado) {
    Write-Host '  [OK] El archivo llego completo y sin alterar.' -ForegroundColor Green
  } else {
    Write-Host '  [PELIGRO] La huella NO coincide. NO ejecutes ese archivo:' -ForegroundColor Red
    Write-Host '            borralo y vuelve a descargarlo.' -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host '  [AVISO] GitHub no publico huella para comparar.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '  ------------------------------------------------------------' -ForegroundColor Cyan
Write-Host '   ANTES DE INSTALARLO, LEE ESTO' -ForegroundColor Cyan
Write-Host '  ------------------------------------------------------------' -ForegroundColor Cyan
Write-Host '   - La v2 es OTRO programa, no una actualizacion de la v1.'
Write-Host '   - Instalala en OTRA computadora para probar, no en la del bar:'
Write-Host '     deja RESTA arrancando al prender la maquina y abre el puerto 8080.'
Write-Host '   - Al importar el respaldo de la v1 trae la carta, los precios y la'
Write-Host '     configuracion, pero NO el historial de ventas.'
Write-Host '   - Windows va a mostrar una advertencia azul porque el instalador no'
Write-Host '     esta firmado: "Mas informacion" -> "Ejecutar de todas formas".'
Write-Host ''
Write-Host "   Notas de la version: $($rel.html_url)" -ForegroundColor DarkGray
Write-Host ''
