@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title RESPALDO TOTAL de RESTA - no modifica nada

echo.
echo  ============================================================
echo   RESPALDO TOTAL - RESTA / ONCE Social Lounge
echo   Este script SOLO COPIA. No modifica ni borra nada.
echo  ============================================================
echo.
echo   PASO A MANO PRIMERO ^(es el respaldo mas importante^):
echo.
echo     1. Abre ONCE POS desde el escritorio
echo     2. Toca el boton "Respaldo" ^(el del disquete, arriba^)
echo     3. Guarda el archivo .json que se descarga
echo.
echo   Cuando ya lo hiciste: CIERRA ONCE POS y cierra Chrome
echo   por completo, y pulsa una tecla para copiar lo demas.
echo.
pause
echo.

set "ORIGEN=C:\RESTA"
if not exist "%ORIGEN%\RESTA.html" (
  echo  [ERROR] No encuentro %ORIGEN%\RESTA.html
  echo  Si RESTA esta instalado en otra carpeta, copiala a mano.
  echo.
  pause
  exit /b 1
)

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm"`) do set "SELLO=%%i"
set "DEST=%USERPROFILE%\Desktop\RESPALDO-RESTA-!SELLO!"

echo  Guardando en: !DEST!
echo.

mkdir "!DEST!" 2>nul

rem --- 1. Programa completo + carpeta Respaldos de todos los turnos ---
echo  Copiando C:\RESTA ...
xcopy "%ORIGEN%" "!DEST!\C-RESTA" /E /I /Y /Q >nul
if errorlevel 1 (
  echo  [ERROR] No se pudo copiar C:\RESTA
  pause
  exit /b 1
)
echo  [OK] Programa y respaldos de turno copiados

rem --- 2. Copia cruda de los datos del navegador ---
rem     Los productos, cuentas, tickets y cortes viven en el localStorage
rem     de Chrome/Edge, no dentro del RESTA.html.
set "PERFIL=%LOCALAPPDATA%\Google\Chrome\User Data\Default"
set "NAV=Chrome"
if not exist "%PERFIL%\Local Storage\leveldb" (
  set "PERFIL=%LOCALAPPDATA%\Microsoft\Edge\User Data\Default"
  set "NAV=Edge"
)

if exist "!PERFIL!\Local Storage\leveldb" (
  echo  Copiando datos del navegador ^(!NAV!^) ...
  xcopy "!PERFIL!\Local Storage\leveldb" "!DEST!\navegador\Local Storage\leveldb" /E /I /Y /Q >nul
  for /d %%d in ("!PERFIL!\IndexedDB\file__0*") do xcopy "%%d" "!DEST!\navegador\IndexedDB\%%~nxd" /E /I /Y /Q >nul
  echo  [OK] Copia cruda del localStorage e IndexedDB
) else (
  echo  [AVISO] No encontre el perfil de Chrome ni de Edge.
  echo          No pasa nada: el respaldo .json del boton "Respaldo"
  echo          y la carpeta C:\RESTA\Respaldos ya tienen todos los datos.
)

rem --- 3. Nota dentro del respaldo ---
> "!DEST!\LEEME-DEL-RESPALDO.txt" (
  echo RESPALDO DE RESTA - !SELLO!
  echo ==========================================
  echo.
  echo C-RESTA\           copia exacta de C:\RESTA
  echo                    ^(programa + carpeta Respaldos de cada turno^)
  echo navegador\         copia cruda del localStorage e IndexedDB
  echo                    ^(ahi viven productos, cuentas, tickets y cortes^)
  echo.
  echo PARA VOLVER ATRAS EL PROGRAMA:
  echo   Cierra ONCE POS y copia C-RESTA\RESTA.html sobre C:\RESTA\RESTA.html
  echo.
  echo PARA RECUPERAR LOS DATOS:
  echo   Abre ONCE POS, boton "Recuperar", y elige el .json mas reciente de
  echo   C-RESTA\Respaldos\Turno FECHA HORA\RESTA datos.json
  echo   OJO: Recuperar reemplaza TODOS los datos actuales por los del archivo.
)

echo.
echo  ============================================================
echo   LISTO. Respaldo completo en:
echo   !DEST!
echo  ============================================================
echo.
explorer "!DEST!"
pause
endlocal
