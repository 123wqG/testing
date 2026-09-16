@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Please install dependencies first. See docs.
  pause
  exit /b 1
)
start "" http://localhost:5178
call npm run dev
