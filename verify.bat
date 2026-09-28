@echo off
REM ===========================================================================
REM  Nexovo Hospitality POS - run the real checks and write the results to a log.
REM
REM  Double-click this file. It runs, in order:
REM    1. npm install            (dependencies)
REM    2. npx tsc --noEmit       (TypeScript type-check)
REM    3. npm test               (unit + DOM tests, vitest)
REM    4. npm run build          (production build)
REM    5. node scripts\verify-themes.mjs   (overflow + contrast audit, if Playwright is installed)
REM
REM  Everything is appended to  frontend\verify-log.txt  with a PASS/FAIL line
REM  per step, so the results can be read back without re-running anything.
REM ===========================================================================
setlocal
cd /d "%~dp0frontend" || goto :nodir
set LOG=%~dp0frontend\verify-log.txt

echo ==================================================================== > "%LOG%"
echo  Nexovo POS verification - %DATE% %TIME% >> "%LOG%"
echo ==================================================================== >> "%LOG%"
node -v >> "%LOG%" 2>&1
REM `call` is required: npm is npm.cmd, and invoking a .cmd without `call` hands control to it
REM and never returns to this script. (The first run of this file stopped exactly here.)
call npm -v >> "%LOG%" 2>&1

echo.
echo === 1/5  npm install ===
echo. >> "%LOG%"
echo ---- 1/5 npm install ---- >> "%LOG%"
call npm install >> "%LOG%" 2>&1
if errorlevel 1 (echo RESULT install: FAIL >> "%LOG%" & goto :report) else (echo RESULT install: PASS >> "%LOG%")

echo.
echo === 1b/5 Photographs (local assets) ===
echo. >> "%LOG%"
echo ---- 1b/5 node scripts\fetch-assets.mjs ---- >> "%LOG%"
call node scripts\fetch-assets.mjs >> "%LOG%" 2>&1
if errorlevel 1 (echo RESULT assets: INCOMPLETE - see log >> "%LOG%") else (echo RESULT assets: PASS >> "%LOG%")

echo.
echo === 2/5  TypeScript type-check ===
echo. >> "%LOG%"
echo ---- 2/5 npx tsc --noEmit ---- >> "%LOG%"
call npx tsc --noEmit --pretty false >> "%LOG%" 2>&1
if errorlevel 1 (echo RESULT typecheck: FAIL >> "%LOG%") else (echo RESULT typecheck: PASS >> "%LOG%")

echo.
echo === 3/5  Tests ===
echo. >> "%LOG%"
echo ---- 3/5 npm test ---- >> "%LOG%"
call npx vitest run --reporter=basic >> "%LOG%" 2>&1
if errorlevel 1 (echo RESULT tests: FAIL >> "%LOG%") else (echo RESULT tests: PASS >> "%LOG%")

echo.
echo === 4/5  Production build ===
echo. >> "%LOG%"
echo ---- 4/5 npx vite build ---- >> "%LOG%"
REM `npm run build` re-runs tsc; step 2 already recorded that, so this is the bundler alone.
call npx vite build >> "%LOG%" 2>&1
if errorlevel 1 (echo RESULT build: FAIL >> "%LOG%") else (echo RESULT build: PASS >> "%LOG%")

echo.
echo === 5/5  Theme audit (overflow + contrast) ===
echo. >> "%LOG%"
echo ---- 5/5 node scripts\verify-themes.mjs ---- >> "%LOG%"
if not exist "node_modules\playwright" (
  echo Playwright not installed - skipped. Run capture-screenshots.bat once to install it. >> "%LOG%"
  echo RESULT theme-audit: SKIPPED >> "%LOG%"
  goto :report
)
start "Nexovo preview" /min cmd /c "npx vite preview --port 4173 --host 127.0.0.1"
timeout /t 6 /nobreak >nul
REM Both themes at every designed width: 10 combinations x 81 routes.
for %%T in (dark light) do (
  for %%W in (360 390 768 1024 1440) do (
    call node scripts\verify-themes.mjs %%T %%W >> "%LOG%" 2>&1
  )
)
findstr /R /C:"routes | overflow=" "%LOG%" > nul && (echo RESULT theme-audit: RAN - see the ten summary lines above >> "%LOG%") || (echo RESULT theme-audit: FAIL >> "%LOG%")
taskkill /FI "WINDOWTITLE eq Nexovo preview*" /T /F >nul 2>&1

:report
echo.
echo ===========================================================================
echo  Results (full log: frontend\verify-log.txt)
echo ===========================================================================
findstr /B "RESULT" "%LOG%"
goto :end

:nodir
echo Could not find the frontend folder next to this script.

:end
echo.
pause
endlocal
