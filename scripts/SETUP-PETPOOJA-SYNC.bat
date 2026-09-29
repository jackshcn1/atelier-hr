@echo off
REM ===============================================================
REM  Atelier HRMS - Petpooja Sync: ONE-TIME SETUP
REM  Run this file once. After it finishes you never need it again.
REM ===============================================================
title Atelier HRMS - Petpooja Sync Setup

cd /d "%~dp0\.."

echo.
echo ==============================================================
echo   ATELIER HRMS - Petpooja Automated Sync Setup
echo ==============================================================
echo.
echo This will ask for your Petpooja login and Supabase key,
echo then install the browser engine used to read reports.
echo.
echo Your details are stored ONLY on this computer, in:
echo   scripts\petpooja-config.json
echo That file is never uploaded to GitHub.
echo.
echo --------------------------------------------------------------

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed on this computer.
  echo.
  echo Please install it from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)

echo [1 of 3] Installing the browser engine (this takes a minute or two)...
echo.
call npm install playwright --save-dev
if errorlevel 1 (
  echo [ERROR] Could not install playwright.
  pause
  exit /b 1
)

call npx playwright install chrome
if errorlevel 1 (
  echo [WARNING] Chrome install had a problem. We will try again at sync time.
)

echo.
echo [2 of 3] Please enter your details below.
echo   (your password will not appear on screen as you type - that is normal)
echo.
call npm run setup:petpooja

echo.
echo [3 of 3] Registering a daily automatic sync at 2:30 AM...
echo.

schtasks /Create /TN "Atelier Petpooja Sync" /TR "cmd /c cd /d \"D:\Claude Code Project - Sep 2026\" && npm run sync:petpooja" /SC DAILY /ST 02:30 /F >nul 2>&1

if errorlevel 1 (
  echo [WARNING] Could not register the automatic task automatically.
  echo   You can still run a sync any time by double-clicking:
  echo     scripts\RUN-SYNC-NOW.bat
) else (
  echo [OK] Daily sync registered. It will run every night at 2:30 AM.
)

echo.
echo ==============================================================
echo   SETUP COMPLETE
echo ==============================================================
echo.
echo To run a sync right now, double-click:
echo   scripts\RUN-SYNC-NOW.bat
echo.
echo If the computer is switched off at 2:30 AM the sync is skipped
echo that day. Just run RUN-SYNC-NOW.bat the next morning.
echo.
pause
