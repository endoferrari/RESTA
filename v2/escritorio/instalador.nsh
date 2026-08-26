; ═══════════════════════════════════════════════════════════════════════════
;  INSTALADOR · PASOS EXTRA DE WINDOWS
;  ─────────────────────────────────────────────────────────────────────────
;  Esto se ejecuta durante la instalación, además de copiar los archivos.
;  Resuelve el problema #1 de instalaciones así: las tablets no conectan
;  porque el Firewall de Windows bloqueó el puerto en silencio.
; ═══════════════════════════════════════════════════════════════════════════

!macro customInstall

  ; ── 1. Abrir el puerto 8080 en el Firewall ──────────────────────────────
  ; profile=any incluye redes "públicas": el WiFi del local muchas veces
  ; queda marcado así y entonces nada conecta, sin ningún mensaje de error.
  DetailPrint "Abriendo el puerto 8080 para las tablets..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="RESTA punto de venta"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="RESTA punto de venta" dir=in action=allow protocol=TCP localport=8080 profile=any description="Permite que las tablets de los meseros se conecten a RESTA"'

  ; ── 2. Carpeta de datos ─────────────────────────────────────────────────
  ; Fuera de "Archivos de programa" a propósito: así los respaldos y la base
  ; sobreviven a desinstalar o reinstalar la aplicación.
  DetailPrint "Preparando la carpeta de datos C:\RESTA..."
  CreateDirectory "C:\RESTA"
  CreateDirectory "C:\RESTA\respaldos"
  CreateDirectory "C:\RESTA\bitacora"

  ; ── 3. Arrancar solo al prender la laptop ───────────────────────────────
  DetailPrint "Configurando el arranque automatico..."
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "RESTA" '"$INSTDIR\RESTA.exe"'

!macroend


!macro customUnInstall

  ; Quitamos la regla del firewall y el arranque automático...
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="RESTA punto de venta"'
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "RESTA"

  ; ...pero NUNCA borramos C:\RESTA.
  ; Ahí viven las ventas y los respaldos del negocio. Si alguien desinstala
  ; por error, los datos siguen ahí al reinstalar.
  DetailPrint "Los datos y respaldos se conservan en C:\RESTA"

!macroend
