@echo off
REM ===========================================================================
REM  Nexovo Hospitality POS - capture every screen as a PNG.
REM
REM  Double-click this file. It installs the screenshot tool if needed, builds
REM  the app, serves it, walks every screen as every role, and opens the folder
REM  when it is done.
REM
REM  Output: frontend\screenshots\<theme>-<width>\<role>\<nn-slug>.png
REM          admin, manager, waiter, cashier, kitchen, bar, host, login, QR menu
REM
REM  Takes a few minutes the first time (it downloads a browser).
REM ===========================================================================
setlocal
cd /d "%~dp0frontend" || goto :fail

echo.
echo === 1/5  Installing dependencies ===
call npm install || goto :fail

echo.
echo === 2/5  Installing the screenshot browser ===
REM Playwright is a verification tool, not an app dependency, so it is installed
REM here rather than being carried in package.json.
call npm i -D playwright || goto :fail
call npx playwright install chromium || goto :fail

echo.
echo === 2b/5 Fetching photographs (local assets) ===
REM Not fatal: a missing photograph falls back to the drawn artwork.
call node scripts\fetch-assets.mjs

echo.
echo === 3/5  Building ===
call npm run build || goto :fail

echo.
echo === 4/5  Starting the preview server on port 4173 ===
start "Nexovo preview" /min cmd /c "npx vite preview --port 4173 --host 127.0.0.1"
REM Give the server a moment to bind before the browser starts asking for pages.
timeout /t 6 /nobreak >nul

echo.
echo === 5/5  Capturing screens ===
REM Default: dark + light, 1440 + 390. Edit the line below to narrow it, e.g.
REM   node scripts\capture-screens.mjs --roles manager --widths 1440 --themes dark
call node scripts\capture-screens.mjs
set CAPTURE_RESULT=%ERRORLEVEL%

echo.
echo Stopping the preview server...
REM Close only the window this script opened.
taskkill /FI "WINDOWTITLE eq Nexovo preview*" /T /F >nul 2>&1

if not "%CAPTURE_RESULT%"=="0" goto :fail

echo.
echo ===========================================================================
echo  Done. Opening the screenshots folder.
echo ===========================================================================
start "" "%~dp0frontend\screenshots"
goto :end

:fail
echo.
echo ===========================================================================
echo  FAILED. The step above printed the reason.
echo.
echo  Most common causes:
echo    * Node.js is not installed or not on PATH  ^(node -v should print v22^)
echo    * Port 4173 is already in use
echo    * A stale dependency cache - delete frontend\node_modules\.vite
echo ===========================================================================

:end
echo.
pause
endlocal
