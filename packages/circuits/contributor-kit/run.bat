@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js LTS first: https://nodejs.org
  echo Then close this window and double-click run.bat again.
  pause
  exit /b 1
)

if not exist "input\deposit.zkey" (
  echo Missing input\deposit.zkey — use the zip you were sent, do not delete the input folder.
  pause
  exit /b 1
)

if not exist "node_modules\snarkjs" (
  echo First-time setup: npm install ...
  call npm install
  if errorlevel 1 (
    echo npm install failed. Check internet, then run.bat again.
    pause
    exit /b 1
  )
)

node contribute.mjs
pause
