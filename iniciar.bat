@echo off
rem Arranca BeanChain en local. Haz doble clic o ejecuta: iniciar.bat -ConBlockchain
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar.ps1" %*
