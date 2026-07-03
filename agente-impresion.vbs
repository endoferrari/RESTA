' Lanza el agente de impresion de RESTA en segundo plano, sin ventana.
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\RESTA\agente-impresion.ps1""", 0, False
