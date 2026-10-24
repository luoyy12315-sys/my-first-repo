@echo off
chcp 65001 >nul
title Lumina - AI Learning Workspace
set "LOG=%TEMP%\lumina-launch.log"
echo [%DATE% %TIME%] launcher started from "%~dp0" >> "%LOG%"

rem 项目根目录：优先用同目录的 start.bat，其次用绝对路径
set "ROOT=C:\Users\16621\项目"
if not exist "%ROOT%\start.bat" (
  echo [ERROR] 找不到 "%ROOT%\start.bat"
  echo   project not found: %ROOT%
  echo [%DATE% %TIME%] ERROR start.bat missing >> "%LOG%"
  pause
  exit /b 1
)

echo [%DATE% %TIME%] handing over to start.bat >> "%LOG%"
call "%ROOT%\start.bat"
echo [%DATE% %TIME%] start.bat exited with %ERRORLEVEL% >> "%LOG%"
