@echo off
chcp 65001 >nul
title Comparar esta PC con GitHub - RESTA
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0comparar.ps1"
echo.
pause
