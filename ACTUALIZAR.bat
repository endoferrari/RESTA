@echo off
chcp 65001 >nul
title Actualizar RESTA - ONCE Social Lounge
echo.
echo  ============================================
echo   Actualizar RESTA - ONCE Social Lounge
echo   Baja la ultima version desde GitHub
echo  ============================================
echo.

rem ── Carpeta de instalacion: C:\RESTA o la carpeta de este .bat ──
set "DESTINO=C:\RESTA"
if not exist "%DESTINO%\RESTA.html" set "DESTINO=%~dp0"
if "%DESTINO:~-1%"=="\" set "DESTINO=%DESTINO:~0,-1%"

set "URL=https://raw.githubusercontent.com/endoferrari/RESTA/master/RESTA.html"

echo  Carpeta:  %DESTINO%
echo  Descargando... (se guarda una copia de respaldo del archivo actual)
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $dest='%DESTINO%\RESTA.html'; $tmp=Join-Path $env:TEMP ('RESTA_'+[Guid]::NewGuid().ToString('N')+'.html'); try{ Invoke-WebRequest -Uri '%URL%' -OutFile $tmp -UseBasicParsing; $txt=Get-Content $tmp -Raw; if($txt.Length -lt 5000 -or -not $txt.Contains('APP_VERSION')){ throw 'La descarga no parece valida' }; if(Test-Path $dest){ Copy-Item $dest ($dest+'.bak-'+(Get-Date -Format yyyyMMdd-HHmmss)) -Force }; Move-Item $tmp $dest -Force; Write-Host '  [OK] RESTA quedo actualizado' -ForegroundColor Green }catch{ if(Test-Path $tmp){ Remove-Item $tmp -Force }; Write-Host ('  [ERROR] '+$_.Exception.Message) -ForegroundColor Red; exit 1 }"

echo.
if errorlevel 1 (
  echo  No se pudo actualizar. Revisa tu conexion a internet e intenta otra vez.
) else (
  echo  Listo. Abre "ONCE POS" desde el escritorio para usar la version nueva.
)
echo.
pause
