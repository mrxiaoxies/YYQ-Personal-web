@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "PORT=5173"
set "LOCAL_URL=http://127.0.0.1:%PORT%/"
set "CODEX_NODE_HOME=D:\oper AI\Codex\work\env\tools\nodejs\node-v24.15.0-win-x64"
set "NODE_EXE="
set "NPM_CMD="

if exist "%CODEX_NODE_HOME%\node.exe" (
  set "NODE_EXE=%CODEX_NODE_HOME%\node.exe"
  set "NPM_CMD=%CODEX_NODE_HOME%\npm.cmd"
  set "PATH=%CODEX_NODE_HOME%;%PATH%"
) else (
  for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%I"
  for /f "delims=" %%I in ('where npm 2^>nul') do if not defined NPM_CMD set "NPM_CMD=%%I"
)

echo.
echo ========================================
echo  Start YYQ Personal Website
echo ========================================
echo.

if not defined NODE_EXE (
  echo [ERROR] Node.js was not found.
  echo Please install Node.js or update CODEX_NODE_HOME in this script.
  pause
  exit /b 1
)

if not defined NPM_CMD (
  echo [ERROR] npm was not found.
  echo Please install Node.js or update CODEX_NODE_HOME in this script.
  pause
  exit /b 1
)

if not exist "%~dp0node_modules\vite\bin\vite.js" (
  echo [ERROR] Dependencies were not found.
  echo Please run: "%NPM_CMD%" install
  pause
  exit /b 1
)

if /I "%~1"=="--check" (
  echo [OK] Project directory: %CD%
  echo [OK] Node: %NODE_EXE%
  echo [OK] npm: %NPM_CMD%
  echo [OK] Local URL: %LOCAL_URL%
  echo [OK] Phone URL candidates:
  for /f "tokens=2 delims=:" %%I in ('ipconfig ^| findstr /R /C:"IPv4.*:"') do (
    set "CANDIDATE_IP=%%I"
    call echo      http://%%CANDIDATE_IP: =%%:%PORT%/
  )
  exit /b 0
)

echo Project directory: %CD%
echo Node: %NODE_EXE%
echo Local URL: %LOCAL_URL%
echo Phone URL candidates:
for /f "tokens=2 delims=:" %%I in ('ipconfig ^| findstr /R /C:"IPv4.*:"') do (
  set "CANDIDATE_IP=%%I"
  call echo   http://%%CANDIDATE_IP: =%%:%PORT%/
)
echo.
echo The browser will open now. Use the candidate that matches your phone Wi-Fi network.
echo Press Ctrl+C to stop the server.
echo.

start "" "%LOCAL_URL%"
"%NODE_EXE%" "%~dp0node_modules\vite\bin\vite.js" --host 0.0.0.0 --port %PORT% --strictPort

echo.
echo Server stopped.
pause
