<#
  Compara C:\RESTA\RESTA.html (produccion) con el RESTA.html publicado en GitHub.
  SOLO LEE. No escribe absolutamente nada dentro de C:\RESTA.
  El unico archivo que crea es un informe de diferencias en el Escritorio.
#>
param(
  [string]$Local = 'C:\RESTA\RESTA.html',
  [string]$Rama  = 'master'
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$base = "https://raw.githubusercontent.com/endoferrari/RESTA/$Rama"

function Get-AppVersion([string]$texto) {
  $m = [regex]::Match($texto, "APP_VERSION\s*=\s*'([^']+)'")
  if ($m.Success) { return $m.Groups[1].Value }
  return $null
}

function Compare-Version([string]$a, [string]$b) {
  # -1 = a es menor, 0 = iguales, 1 = a es mayor
  $pa = @($a -split '\.' | ForEach-Object { [int]($_ -replace '\D','0') })
  $pb = @($b -split '\.' | ForEach-Object { [int]($_ -replace '\D','0') })
  for ($i = 0; $i -lt [Math]::Max($pa.Count, $pb.Count); $i++) {
    $x = if ($i -lt $pa.Count) { $pa[$i] } else { 0 }
    $y = if ($i -lt $pb.Count) { $pb[$i] } else { 0 }
    if ($x -ne $y) { if ($x -lt $y) { return -1 } else { return 1 } }
  }
  return 0
}

function Titulo($t) {
  Write-Host ''
  Write-Host "  $t" -ForegroundColor Cyan
  Write-Host "  $('-' * $t.Length)" -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '  ============================================================' -ForegroundColor White
Write-Host '   COMPARAR ESTA PC CON GITHUB  (solo lectura)' -ForegroundColor White
Write-Host '  ============================================================' -ForegroundColor White

# ---------- 1. Lo que hay en esta PC ----------
Titulo 'Esta PC'
if (-not (Test-Path $Local)) {
  Write-Host "  [ERROR] No encuentro $Local" -ForegroundColor Red
  exit 1
}
$txtLocal = Get-Content $Local -Raw -Encoding UTF8
$verLocal = Get-AppVersion $txtLocal
$infoLocal = Get-Item $Local
Write-Host ("  Archivo:  {0}" -f $Local)
Write-Host ("  Version:  {0}" -f $(if ($verLocal) { "v$verLocal" } else { 'sin numero de version (anterior a la 1.1.0)' }))
Write-Host ("  Tamano:   {0:N0} bytes" -f $infoLocal.Length)
Write-Host ("  Fecha:    {0:yyyy-MM-dd HH:mm}" -f $infoLocal.LastWriteTime)

# ---------- 2. Lo que hay en GitHub ----------
Titulo "GitHub (rama $Rama)"
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('RESTA_github_' + [Guid]::NewGuid().ToString('N') + '.html')
try {
  Invoke-WebRequest -Uri "$base/RESTA.html?_=$([DateTime]::UtcNow.Ticks)" -OutFile $tmp -UseBasicParsing
  $txtRemoto = Get-Content $tmp -Raw -Encoding UTF8
} catch {
  Write-Host "  [ERROR] No se pudo descargar desde GitHub: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host '  Revisa tu conexion a internet e intenta otra vez.' -ForegroundColor Red
  exit 1
}
if ($txtRemoto.Length -lt 5000 -or $txtRemoto.IndexOf('APP_VERSION') -lt 0) {
  Write-Host '  [ERROR] Lo descargado no parece ser RESTA. Intenta otra vez.' -ForegroundColor Red
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  exit 1
}
$verRemoto = Get-AppVersion $txtRemoto
$verJson = $null
try {
  $vj = Invoke-WebRequest -Uri "$base/version.json?_=$([DateTime]::UtcNow.Ticks)" -UseBasicParsing
  $verJson = ($vj.Content | ConvertFrom-Json)
} catch { }
Write-Host ("  Version:  v{0}" -f $verRemoto)
Write-Host ("  Tamano:   {0:N0} bytes" -f (Get-Item $tmp).Length)
if ($verJson) {
  Write-Host ("  Publicada: v{0} del {1}" -f $verJson.version, $verJson.fecha)
  Write-Host ''
  Write-Host '  Notas de esa version:' -ForegroundColor DarkGray
  Write-Host ("    {0}" -f $verJson.notas) -ForegroundColor DarkGray
}

# ---------- 3. Comparacion real del contenido ----------
$normLocal  = $txtLocal  -replace "`r`n", "`n"
$normRemoto = $txtRemoto -replace "`r`n", "`n"
$iguales = ($normLocal -eq $normRemoto)

Titulo 'VEREDICTO'
$accion = ''
if ($iguales) {
  Write-Host '  IGUALES: tu PC ya tiene exactamente lo que hay en GitHub.' -ForegroundColor Green
  $accion = 'No hay nada que hacer.'
}
elseif (-not $verLocal) {
  Write-Host '  GITHUB ESTA MAS NUEVO (tu PC es anterior a la v1.1.0).' -ForegroundColor Yellow
  $accion = 'Conviene actualizar. Prueba antes con 3-PROBAR-VERSION-NUEVA.bat'
}
else {
  $cmp = Compare-Version $verLocal $verRemoto
  if ($cmp -lt 0) {
    Write-Host ("  GITHUB ESTA MAS NUEVO: tu PC v{0}  ->  GitHub v{1}" -f $verLocal, $verRemoto) -ForegroundColor Yellow
    $accion = 'Conviene actualizar. Prueba antes con 3-PROBAR-VERSION-NUEVA.bat'
  }
  elseif ($cmp -gt 0) {
    Write-Host ("  TU PC ESTA MAS NUEVA: PC v{0}  >  GitHub v{1}" -f $verLocal, $verRemoto) -ForegroundColor Magenta
    $accion = 'NO ACTUALICES. Sube primero lo de esta PC con SUBIR-CAMBIOS.bat'
  }
  else {
    Write-Host ("  MISMA VERSION (v{0}) PERO EL CONTENIDO ES DISTINTO." -f $verLocal) -ForegroundColor Red
    $accion = 'NO ACTUALICES todavia: alguien edito el archivo a mano. Revisa el informe.'
  }
}
Write-Host ''
Write-Host "  -> $accion" -ForegroundColor White

# ---------- 4. Informe de diferencias ----------
if (-not $iguales) {
  $sello = Get-Date -Format 'yyyy-MM-dd_HH-mm'
  $escritorio = [Environment]::GetFolderPath('Desktop')
  if (-not $escritorio) { $escritorio = $env:USERPROFILE }
  if (-not $escritorio) { $escritorio = (Get-Location).Path }
  $informe = Join-Path $escritorio "RESTA-diferencias-$sello.txt"
  $lineasLocal  = $normLocal  -split "`n"
  $lineasRemoto = $normRemoto -split "`n"
  $dif = Compare-Object -ReferenceObject $lineasLocal -DifferenceObject $lineasRemoto
  $soloPC     = @($dif | Where-Object { $_.SideIndicator -eq '<=' })
  $soloGitHub = @($dif | Where-Object { $_.SideIndicator -eq '=>' })

  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine("DIFERENCIAS RESTA.html  -  $sello")
  [void]$sb.AppendLine('============================================================')
  [void]$sb.AppendLine("Esta PC : $Local")
  $etiquetaLocal = if ($verLocal) { "v$verLocal" } else { '(sin version)' }
  [void]$sb.AppendLine(("          version {0}, {1} lineas" -f $etiquetaLocal, $lineasLocal.Count))
  [void]$sb.AppendLine("GitHub  : rama $Rama, version v$verRemoto, $($lineasRemoto.Count) lineas")
  [void]$sb.AppendLine('')
  [void]$sb.AppendLine("Lineas que SOLO estan en tu PC   : $($soloPC.Count)")
  [void]$sb.AppendLine("Lineas que SOLO estan en GitHub  : $($soloGitHub.Count)")
  [void]$sb.AppendLine('')
  [void]$sb.AppendLine('Si abajo aparecen precios, nombres de productos o textos tuyos en')
  [void]$sb.AppendLine('"SOLO EN TU PC", ese trabajo se perderia al actualizar: avisa antes')
  [void]$sb.AppendLine('de instalar nada.')
  [void]$sb.AppendLine('')
  [void]$sb.AppendLine('------------------ SOLO EN TU PC (se perderia) -------------------')
  foreach ($l in ($soloPC | Select-Object -First 500)) { [void]$sb.AppendLine($l.InputObject) }
  if ($soloPC.Count -gt 500) { [void]$sb.AppendLine("... y $($soloPC.Count - 500) lineas mas") }
  [void]$sb.AppendLine('')
  [void]$sb.AppendLine('------------------ SOLO EN GITHUB (lo nuevo) ---------------------')
  foreach ($l in ($soloGitHub | Select-Object -First 500)) { [void]$sb.AppendLine($l.InputObject) }
  if ($soloGitHub.Count -gt 500) { [void]$sb.AppendLine("... y $($soloGitHub.Count - 500) lineas mas") }

  Set-Content -Path $informe -Value $sb.ToString() -Encoding UTF8
  Write-Host ''
  Write-Host "  Informe detallado en el Escritorio:" -ForegroundColor Cyan
  Write-Host "    $informe"
  Write-Host ("  Lineas solo en tu PC: {0}   |   solo en GitHub: {1}" -f $soloPC.Count, $soloGitHub.Count)
}

# ---------- 5. Archivos sueltos ----------
$carpeta = Split-Path $Local -Parent
Titulo "Archivos de apoyo en $carpeta"
foreach ($f in @('ACTUALIZAR.bat','version.json','INSTALAR.bat','agente-impresion.ps1','agente-impresion.vbs')) {
  $hay = Test-Path (Join-Path $carpeta $f)
  $marca = if ($hay) { '[si]' } else { '[falta]' }
  $color = if ($hay) { 'Green' } else { 'Yellow' }
  Write-Host ("  {0,-8} {1}" -f $marca, $f) -ForegroundColor $color
}
Write-Host ''
Write-Host '  (Si falta ACTUALIZAR.bat o version.json, bajalos de GitHub a C:\RESTA:' -ForegroundColor DarkGray
Write-Host '   son los que permiten actualizar sin la USB.)' -ForegroundColor DarkGray

Remove-Item $tmp -Force -ErrorAction SilentlyContinue
Write-Host ''
