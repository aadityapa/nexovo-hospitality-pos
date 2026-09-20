@echo off
setlocal enabledelayedexpansion
title Nexovo Hospitality POS

rem ---------------------------------------------------------------------------
rem Starts the POS in development mode (mock backend by default - no database
rem needed). Double-click this file, then use the browser window that opens.
rem Press Ctrl+C in this window to stop the server.
rem ---------------------------------------------------------------------------

cd /d "%~dp0frontend" || (
  echo [ERROR] Could not find the "frontend" folder next to this file.
  pause
  exit /b 1
)

echo.
echo  ============================================
echo   Nexovo Hospitality POS
echo  ============================================
echo.

rem --- 1. Node.js present? ----------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not on PATH.
  echo         Install the LTS version from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo  Node.js !NODE_VER!

rem --- 2. Environment file ----------------------------------------------------
if not exist ".env" (
  if exist ".env.example" (
    copy /y ".env.example" ".env" >nul
    echo  Created .env from .env.example  (mock backend^)
  )
)

rem --- 3. Dependencies --------------------------------------------------------
if not exist "node_modules" (
  echo.
  echo  Installing dependencies - this takes a few minutes the first time...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed. Check your internet connection and try again.
    echo.
    pause
    exit /b 1
  )
) else (
  echo  Dependencies already installed
)

rem --- 4. Show the LAN address (needed for QR codes / phones) -----------------
set "LAN_IP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
  if not defined LAN_IP (
    for /f "tokens=* delims= " %%b in ("%%a") do set "LAN_IP=%%b"
  )
)

echo.
echo  Starting the dev server.
echo.
echo    On this computer : http://localhost:5173
if defined LAN_IP (
  echo    On phones/tablets: http://!LAN_IP!:5173     ^<-- open this one before printing QR codes
  echo.
  echo    Table QR codes point at whichever address you are browsing, so use the
  echo    phones/tablets address if guests will scan them.
)
echo.
echo  Keep this window open. Press Ctrl+C to stop.
echo.
start "" /b cmd /c "timeout /t 6 /nobreak >nul & start "" http://localhost:5173"

rem --- 5. Run --------------------------------------------------------------
call npm run dev

echo.
echo  Server stopped.
pause
endlocal
