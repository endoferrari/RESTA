@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title RESTA v2 - dejarla lista SIN tocar la v1

set "DATOS=C:\RESTA-V2"
set "VIEJA=C:\RESTA"
set "LANZADOR=%DATOS%\RESTA-v2.vbs"
set "ATAJO=%USERPROFILE%\Desktop\RESTA v2 (PRUEBAS).lnk"

echo.
echo  ============================================================
echo   RESTA v2 - PREPARAR LA CONVIVENCIA CON LA v1
echo  ============================================================
echo.
echo   Esto se ejecuta DESPUES de instalar RESTA-Setup-x.x.x.exe.
echo.
echo   Que va a hacer:
echo.
echo     1. Crear %DATOS% para los datos de la v2
echo        ^(la v2 guarda ahi su base; la v1 no se toca^)
echo     2. Crear un lanzador que apunta la v2 a esa carpeta
echo     3. Crear el acceso directo "RESTA v2 ^(PRUEBAS^)"
echo     4. QUITAR el arranque automatico que puso el instalador
echo     5. QUITAR el acceso directo "RESTA" que puso el instalador
echo        ^(si se abre por ahi, la v2 guardaria en %VIEJA%^)
echo.
echo   Que NO va a hacer:
echo.
echo     - No toca %VIEJA%, ni RESTA.html, ni la carpeta Respaldos
echo     - No toca los datos de la v1 ^(viven en el navegador^)
echo     - No desinstala nada
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo   [AVISO] No vas como administrador.
  echo           Los pasos 1, 2 y 3 van a funcionar igual.
  echo           El paso 4 ^(arranque automatico^) va a fallar: para ese,
  echo           cierra esto y abrelo con boton derecho ^> "Ejecutar como
  echo           administrador".
  echo.
)

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

rem ── Buscar RESTA.exe ──────────────────────────────────────────────
set "EXE="
for %%p in (
  "%ProgramFiles%\RESTA\RESTA.exe"
  "%ProgramFiles(x86)%\RESTA\RESTA.exe"
  "%LOCALAPPDATA%\Programs\RESTA\RESTA.exe"
) do if not defined EXE if exist %%p set "EXE=%%~p"

if not defined EXE (
  echo  [ERROR] No encuentro RESTA.exe de la v2.
  echo          Instala primero RESTA-Setup-x.x.x.exe y vuelve a ejecutar esto.
  echo          Si lo instalaste en otra carpeta, dime cual y lo ajustamos.
  echo.
  pause
  exit /b 1
)
echo  [OK] RESTA v2 encontrada: %EXE%

rem ── 1. Carpeta de datos ───────────────────────────────────────────
if not exist "%DATOS%" mkdir "%DATOS%"
echo  [OK] Carpeta de datos: %DATOS%

rem ── 2. Lanzador ───────────────────────────────────────────────────
rem  Un .vbs y no un .bat para que no parpadee la ventana negra.
rem  La variable se fija SOLO para este proceso y lo que el abra: no
rem  se cambia nada del sistema, y deshacerlo es borrar este archivo.
> "%LANZADOR%" echo Set sh = CreateObject^("WScript.Shell"^)
>> "%LANZADOR%" echo sh.Environment^("PROCESS"^)^("RESTA_DATOS"^) = "%DATOS%"
>> "%LANZADOR%" echo sh.Run """%EXE%""", 1, False
echo  [OK] Lanzador creado: %LANZADOR%

rem ── 3. Acceso directo ─────────────────────────────────────────────
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut('%ATAJO%'); $s.TargetPath='wscript.exe'; $s.Arguments='\"%LANZADOR%\"'; $s.WorkingDirectory='%DATOS%'; $s.IconLocation='%EXE%,0'; $s.Description='RESTA v2 en pruebas - datos en %DATOS%'; $s.Save()"
if exist "%ATAJO%" (
  echo  [OK] Acceso directo "RESTA v2 ^(PRUEBAS^)" en el escritorio
) else (
  echo  [AVISO] No se pudo crear el acceso directo. Abre a mano:
  echo          %LANZADOR%
)

rem ── 4. Arranque automatico ────────────────────────────────────────
reg query "HKLM\Software\Microsoft\Windows\CurrentVersion\Run" /v RESTA >nul 2>&1
if errorlevel 1 (
  echo  [OK] El arranque automatico no estaba puesto
) else (
  reg delete "HKLM\Software\Microsoft\Windows\CurrentVersion\Run" /v RESTA /f >nul 2>&1
  if errorlevel 1 (
    echo  [AVISO] No se pudo quitar el arranque automatico ^(hace falta
    echo          administrador^). Mientras siga puesto, la v2 va a abrirse
    echo          sola al prender la laptop y guardando en %VIEJA%.
  ) else (
    echo  [OK] Arranque automatico quitado
  )
)

rem ── 5. Acceso directo del instalador ──────────────────────────────
set "QUITADOS=0"
for %%d in ("%USERPROFILE%\Desktop\RESTA.lnk" "%PUBLIC%\Desktop\RESTA.lnk") do (
  if exist %%d (
    del /Q %%d >nul 2>&1
    if not exist %%d set /a QUITADOS+=1
  )
)
if "!QUITADOS!"=="0" (
  echo  [OK] No habia acceso directo "RESTA" suelto en el escritorio
) else (
  echo  [OK] Quitado el acceso directo "RESTA" del instalador ^(!QUITADOS!^)
)

echo.
echo  ============================================================
echo   LISTO
echo.
echo   Abre "RESTA v2 ^(PRUEBAS^)" del escritorio.
echo   La primera vez te va a pedir crear tu usuario con un PIN.
echo.
echo   Para traer la carta y las ventas de la v1:
echo     Carta ^> Importar respaldo ^> elige el .json de la v1
echo     ^(cuando pregunte, responde SI a traer las ventas^)
echo.
echo   Para comprobar que el dinero cuadra:
echo     Corte ^> "Ventas de un dia" ^> elige un dia y compara con el
echo     corte que imprimio la v1 ese mismo dia.
echo.
echo   "ONCE POS" ^(la v1^) sigue funcionando igual que siempre.
echo  ============================================================
echo.
pause
endlocal
