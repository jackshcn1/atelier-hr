@echo off
REM ===============================================================
REM  Atelier HRMS - Run a Petpooja sync right now
REM  A Chrome window will open briefly while reports are read.
REM  Keep this window open until it says "finished".
REM ===============================================================
title Atelier HRMS - Petpooja Sync

cd /d "%~dp0\.."

echo.
echo Starting Petpooja sync. A Chrome window will open for a minute or two.
echo Please do not close this window.
echo.

if not exist "scripts\petpooja-config.json" (
  echo [ERROR] Setup was never completed.
  echo Please run scripts\SETUP-PETPOOJA-SYNC.bat first.
  echo.
  pause
  exit /b 1
)

call npm run sync:petpooja

echo.
echo ==============================================================
if errorlevel 1 (
  echo   SYNC DID NOT COMPLETE - please screenshot this window
  echo   and send it to Claude. A log was saved to:
  echo     scripts\petpooja-sync.log
) else (
  echo   SYNC FINISHED. You can close this window.
)
echo ==============================================================
echo.
timeout /t 20
