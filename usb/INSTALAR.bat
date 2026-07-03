@echo off
chcp 65001 >nul
title Instalador RESTA - ONCE Social Lounge
echo.
echo  ============================================
echo   RESTA - Punto de venta ONCE Social Lounge
echo   Instalador para Windows 10 / 11
echo  ============================================
echo.

rem ── 1. Copiar el programa a C:\RESTA ─────────────────────────
set DESTINO=C:\RESTA
if not exist "%DESTINO%" mkdir "%DESTINO%"
if not exist "%DESTINO%\Respaldos" mkdir "%DESTINO%\Respaldos"

if not exist "%~dp0RESTA.html" (
  echo  [ERROR] No encuentro RESTA.html junto a este instalador.
  echo  Copia RESTA.html a la misma carpeta de la USB y vuelve a ejecutar.
  pause
  exit /b 1
)
copy /Y "%~dp0RESTA.html" "%DESTINO%\RESTA.html" >nul
echo  [OK] Programa copiado a C:\RESTA\RESTA.html
echo  [OK] Carpeta de respaldos creada: C:\RESTA\Respaldos

rem ── 2. Buscar Chrome o Edge ──────────────────────────────────
set NAVEGADOR=
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "NAVEGADOR=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined NAVEGADOR if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "NAVEGADOR=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined NAVEGADOR if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "NAVEGADOR=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined NAVEGADOR if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "NAVEGADOR=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if not defined NAVEGADOR (
  echo  [ERROR] No encontre Chrome ni Edge en esta PC.
  echo  Instala Google Chrome y vuelve a ejecutar este instalador.
  pause
  exit /b 1
)
echo  [OK] Navegador encontrado: %NAVEGADOR%

rem ── 3. Acceso directo en el escritorio con impresion directa ──
powershell -NoProfile -ExecutionPolicy Bypass -Command "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\ONCE POS.lnk'); $s.TargetPath='%NAVEGADOR%'; $s.Arguments='--kiosk-printing --app=file:///C:/RESTA/RESTA.html'; $s.WorkingDirectory='C:\RESTA'; $s.Description='Punto de venta ONCE Social Lounge'; $s.Save()"
if errorlevel 1 (
  echo  [AVISO] No se pudo crear el acceso directo automaticamente.
  echo  Crea uno a mano con destino:
  echo  "%NAVEGADOR%" --kiosk-printing --app=file:///C:/RESTA/RESTA.html
) else (
  echo  [OK] Acceso directo "ONCE POS" creado en el escritorio
  echo       (abre sin barras del navegador e imprime directo, sin ventanas)
)

echo.
echo  ============================================
echo   FALTAN 2 PASOS A MANO:
echo.
echo   1) IMPRESORA: instala el driver de la carpeta
echo      "driver" de esta USB (setup.exe como
echo      administrador, modelo XP-Q200II, puerto USB)
echo      y ponla como impresora PREDETERMINADA con
echo      papel 80(72) y corte automatico.
echo.
echo   2) RESPALDO: abre ONCE POS, toca "Respaldo
echo      automatico" y elige C:\RESTA\Respaldos
echo.
echo   Detalles: GUIA-IMPRESORA.md de esta USB
echo  ============================================
echo.
pause
