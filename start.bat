@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"
title Lumina - AI Learning Workspace

echo ============================================
echo   Lumina  -  AI Learning Workspace
echo   http://localhost:3210
echo ============================================
echo.

rem ---------- 1. locate Node.js (it may not be on the system PATH) ----------
set "NODEDIR="
for /f "delims=" %%i in ('where node 2^>nul') do if not defined NODEDIR set "NODEDIR=%%~dpi"
if not defined NODEDIR if exist "%ProgramFiles%\nodejs\node.exe" set "NODEDIR=%ProgramFiles%\nodejs\"
if not defined NODEDIR if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODEDIR=%LOCALAPPDATA%\Programs\nodejs\"
if not defined NODEDIR if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODEDIR=%ProgramFiles(x86)%\nodejs\"
if not defined NODEDIR (
  for /d %%d in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do (
    if exist "%%d\node.exe" set "NODEDIR=%%d\"
  )
)
if not defined NODEDIR (
  echo [ERROR] Node.js not found.
  echo.
  echo   Install Node.js 20+ from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)
set "PATH=%NODEDIR%;%PATH%"
echo Node: "%NODEDIR%node.exe"
"%NODEDIR%node.exe" -v
if not exist "%NODEDIR%npm.cmd" (
  echo [ERROR] npm.cmd not found next to node.exe.
  pause
  exit /b 1
)
echo.

rem ---------- 2. already running? then just open the browser ----------
netstat -ano | findstr /C:":3210" | findstr /C:"LISTENING" >nul
if not errorlevel 1 (
  echo Server is already running on port 3210. Opening browser...
  start "" http://localhost:3210
  timeout /t 2 >nul
  exit /b 0
)

rem ---------- 3. dependencies + build ----------
if not exist "node_modules" (
  echo [1/2] Installing dependencies, this can take a few minutes...
  call "%NODEDIR%npm.cmd" install
  if errorlevel 1 goto fail
)

set "NEED_BUILD=0"
if not exist ".next\BUILD_ID" set "NEED_BUILD=1"
if "%NEED_BUILD%"=="0" (
  "%NODEDIR%node.exe" scripts\needs-build.mjs
  if not errorlevel 1 set "NEED_BUILD=1"
)
if "%NEED_BUILD%"=="1" (
  echo [2/2] Source changed or no build found. Building the app...
  call "%NODEDIR%npm.cmd" run build
  if errorlevel 1 goto fail
)

rem ---------- 4. start ----------
echo Opening browser in a few seconds...
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 6; Start-Process 'http://localhost:3210'"
echo.
echo Server is starting. KEEP THIS WINDOW OPEN. Press Ctrl+C to stop.
echo.
call "%NODEDIR%npm.cmd" run start
echo.
echo [Server stopped] exit code %errorlevel%
pause
exit /b 0

:fail
echo.
echo [ERROR] Startup failed. Copy the messages above when asking for help.
pause
exit /b 1
