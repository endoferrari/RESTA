@echo off
chcp 65001 >nul
setlocal
title Probar la version nueva de RESTA - sin tocar produccion

echo.
echo  ============================================================
echo   PROBAR LA VERSION NUEVA - RESTA / ONCE Social Lounge
echo.
echo   Se instala en C:\RESTA-PRUEBAS con un perfil de Chrome
echo   aparte. La instalacion real de C:\RESTA NO se toca y los
echo   datos de produccion NO se pueden modificar desde ahi.
echo  ============================================================
echo.
echo   Que version quieres probar?
echo.
echo     [1] master  - lo que se instalaria en produccion  ^(recomendado^)
echo     [2] rama de pruebas claude/resta-repo-comparison-9jz1o9
echo.
set "RAMA=master"
set /p OPCION=  Elige 1 o 2 y pulsa Enter [1]: 
if "%OPCION%"=="2" set "RAMA=claude/resta-repo-comparison-9jz1o9"
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0probar.ps1" -Rama "%RAMA%"
echo.
pause
endlocal
