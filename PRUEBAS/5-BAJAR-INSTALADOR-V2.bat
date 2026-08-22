@echo off
chcp 65001 >nul
title Bajar el instalador de la RESTA v2 - solo descarga
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bajar-v2.ps1"
echo.
pause
