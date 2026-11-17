@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-xbest.ps1" -Executable "%~dp0XBEST.exe" %*
if errorlevel 1 pause
