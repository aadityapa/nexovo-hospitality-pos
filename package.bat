@echo off
REM ===========================================================================
REM  Nexovo Hospitality POS - build the release ZIP with Windows' built-in tar.
REM
REM  Double-click this file. It writes  nexovo-hospitality-pos.zip  next to it,
REM  containing the whole project (frontend source, the photographs in
REM  frontend\public\img, database, docs, scripts, and the before/after
REM  screenshots in screenshots\) and excluding node_modules, dist, the git
REM  store, the raw 2x PNG captures in frontend\screenshots (the JPEG set in
REM  screenshots\ covers them) and frontend\.env (start.bat recreates it from
REM  .env.example). Nothing is downloaded.
REM ===========================================================================
setlocal
cd /d "%~dp0" || goto :fail
set OUT=%~dp0nexovo-hospitality-pos.zip
if exist "%OUT%" del "%OUT%"

echo Packing...
tar -a -c -f "%OUT%" ^
  --exclude=node_modules ^
  --exclude=dist ^
  --exclude=.git ^
  --exclude=frontend/node_modules ^
  --exclude=frontend/dist ^
  --exclude=frontend/node_modules/.vite ^
  --exclude=frontend/screenshots ^
  --exclude=frontend/e2e-shots ^
  --exclude=frontend/.env ^
  --exclude=nexovo-hospitality-pos.zip ^
  * || goto :fail

echo.
echo Done: %OUT%
for %%A in ("%OUT%") do echo Size: %%~zA bytes
goto :end

:fail
echo.
echo FAILED. tar.exe ships with Windows 10 1803+; if it is missing, right-click the
echo folder and choose "Send to > Compressed (zipped) folder" instead.

:end
echo.
pause
endlocal
