@echo off
chcp 65001 >nul
setlocal
title Deshacer la preparacion de la RESTA v2

set "DATOS=C:\RESTA-V2"
set "ATAJO=%USERPROFILE%\Desktop\RESTA v2 (PRUEBAS).lnk"

echo.
echo  ============================================================
echo   DESHACER LA PREPARACION DE LA v2
echo  ============================================================
echo.
echo   Quita el acceso directo "RESTA v2 ^(PRUEBAS^)" y el lanzador.
echo.
echo   NO borra los datos de la v2 ^(%DATOS%^) salvo que lo pidas
echo   aparte al final. NO toca C:\RESTA ni la v1. NO desinstala
echo   el programa: eso se hace desde Panel de control ^> Programas.
echo.

set "SIGUE="
set /p SIGUE=  Escribe SI y pulsa Enter para continuar: 
if /i not "%SIGUE%"=="SI" (
  echo.
  echo  Cancelado. No se hizo ningun cambio.
  echo.
  pause
  exit /b 0
)
echo.

if exist "%ATAJO%" (
  del /Q "%ATAJO%" >nul 2>&1
  echo  [OK] Acceso directo quitado
) else (
  echo  [OK] No habia acceso directo
)

if exist "%DATOS%\RESTA-v2.vbs" (
  del /Q "%DATOS%\RESTA-v2.vbs" >nul 2>&1
  echo  [OK] Lanzador quitado
) else (
  echo  [OK] No habia lanzador
)

echo.
echo  ------------------------------------------------------------
echo   Los datos de la v2 siguen en: %DATOS%
echo   Ahi esta resta.db, con lo que se haya importado y vendido.
echo.
echo   Si YA NO los quieres, escribe BORRAR DATOS.
echo   Cualquier otra cosa los deja donde estan.
echo  ------------------------------------------------------------
set "BORRAR="
set /p BORRAR=  ^> 

if /i "%BORRAR%"=="BORRAR DATOS" (
  if /i "%DATOS%"=="C:\RESTA" (
    echo  [ERROR] Esa es la carpeta de la v1. Cancelado.
    pause
    exit /b 1
  )
  rmdir /S /Q "%DATOS%" >nul 2>&1
  if exist "%DATOS%" (
    echo  [AVISO] Quedaron archivos en uso. Cierra la v2 y repite.
  ) else (
    echo  [OK] Datos de la v2 borrados
  )
) else (
  echo  [OK] Los datos se quedan en %DATOS%
)

echo.
echo  La v1 ^("ONCE POS"^) sigue exactamente igual.
echo.
pause
endlocal
