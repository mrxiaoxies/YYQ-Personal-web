@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "SITE_URL=http://127.0.0.1:5173/"

echo.
echo ========================================
echo  Start YYQ Personal Website
echo ========================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found in PATH.
  echo Please install Node.js first, then reopen this script.
  pause
  exit /b 1
)

if not exist "%~dp0node_modules\vite\bin\vite.js" (
  echo [ERROR] Dependencies were not found.
  echo Please run: npm install
  pause
  exit /b 1
)

if /I "%~1"=="--check" (
  echo [OK] Project directory: %CD%
  echo [OK] Launch URL: %SITE_URL%
  exit /b 0
)

echo Project directory: %CD%
echo Launch URL: %SITE_URL%
echo.
echo The browser will open now.
echo Press Ctrl+C to stop the server.
echo.

start "" "%SITE_URL%"
call npm run dev -- --port 5173 --strictPort

echo.
echo Server stopped.
pause
