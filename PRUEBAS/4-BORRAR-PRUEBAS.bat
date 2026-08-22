@echo off
chcp 65001 >nul
setlocal
title Borrar la copia de pruebas de RESTA

set "PRUEBAS=C:\RESTA-PRUEBAS"

echo.
echo  ============================================================
echo   BORRAR LA COPIA DE PRUEBAS
echo.
echo   Se borra unicamente:  %PRUEBAS%
echo   y el acceso directo "RESTA PRUEBAS" del escritorio.
echo.
echo   C:\RESTA y sus datos NO se tocan.
echo  ============================================================
echo.

rem --- Cinturon de seguridad: nunca la carpeta de produccion ---
if /i "%PRUEBAS%"=="C:\RESTA" (
  echo  [ERROR] Ruta de produccion. Cancelado.
  pause
  exit /b 1
)

if not exist "%PRUEBAS%" (
  echo  No hay nada que borrar: %PRUEBAS% no existe.
  echo.
  pause
  exit /b 0
)

set "CONFIRMA="
set /p CONFIRMA=  Escribe BORRAR y pulsa Enter para confirmar: 
if /i not "%CONFIRMA%"=="BORRAR" (
  echo.
  echo  Cancelado. No se borro nada.
  echo.
  pause
  exit /b 0
)

rmdir /S /Q "%PRUEBAS%"
if exist "%USERPROFILE%\Desktop\RESTA PRUEBAS.lnk" del /Q "%USERPROFILE%\Desktop\RESTA PRUEBAS.lnk"

echo.
if exist "%PRUEBAS%" (
  echo  [AVISO] Quedaron archivos en uso. Cierra la copia de pruebas
  echo          y vuelve a ejecutar este script.
) else (
  echo  [OK] Copia de pruebas eliminada. C:\RESTA sigue intacto.
)
echo.
pause
endlocal
