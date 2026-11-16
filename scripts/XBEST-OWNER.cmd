@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0XBEST-OWNER.ps1" -Executable "%~dp0XBEST.exe"
if errorlevel 1 pause
