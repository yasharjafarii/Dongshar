@echo off
cd /d "%~dp0"
node scripts/diagnose-connection.mjs
pause
