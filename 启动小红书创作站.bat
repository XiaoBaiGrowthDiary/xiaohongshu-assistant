@echo off
setlocal

set "PROJECT_DIR=%~dp0"

cd /d "%PROJECT_DIR%"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js first:
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

node scripts\start-fixed.mjs %*
set "LAUNCH_EXIT_CODE=%ERRORLEVEL%"

if not "%LAUNCH_EXIT_CODE%"=="0" if not "%LAUNCH_EXIT_CODE%"=="130" (
  echo.
  pause
)
exit /b %LAUNCH_EXIT_CODE%
