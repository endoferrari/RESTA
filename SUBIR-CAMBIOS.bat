@echo off
setlocal
title Subir cambios a GitHub (RESTA)
cd /d "%~dp0"

rem --- Localizar git ---
set "GIT=git"
where git >nul 2>nul
if errorlevel 1 (
    if exist "C:\Program Files\Git\cmd\git.exe" (
        set "GIT=C:\Program Files\Git\cmd\git.exe"
    ) else (
        echo No se encontro Git instalado.
        pause
        exit /b 1
    )
)

echo ============================================
echo   Subiendo cambios del proyecto RESTA
echo ============================================
echo.

"%GIT%" add -A

rem --- Si no hay cambios, avisar y salir ---
"%GIT%" diff --cached --quiet
if not errorlevel 1 (
    echo No hay cambios nuevos para subir.
    echo.
    pause
    exit /b 0
)

set "MENSAJE=%~1"
if "%MENSAJE%"=="" set "MENSAJE=Actualizacion %date% %time%"

"%GIT%" commit -m "%MENSAJE%"
echo.
echo Subiendo a GitHub...
"%GIT%" push origin master

echo.
if errorlevel 1 (
    echo Hubo un problema al subir. Revisa tu conexion o inicia sesion en GitHub.
) else (
    echo Cambios subidos correctamente a GitHub.
)
echo.
pause
endlocal
