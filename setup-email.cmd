@echo off
cd /d "%~dp0"
if not exist node_modules call npm ci
node scripts/setup-email.mjs
pause
