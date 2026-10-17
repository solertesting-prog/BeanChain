@echo off
rem Arranca BeanChain en local. Haz doble clic o ejecuta: iniciar.bat -ConBlockchain
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar.ps1" %*
echo.
echo Si ves algun error arriba, haz una captura de esta ventana. El registro completo esta en iniciar.log
pause
