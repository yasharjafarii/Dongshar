@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 24 LTS from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
if not exist "node_modules\wrangler\bin\wrangler.js" (
  call npm.cmd ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm.cmd run deploy
pause
