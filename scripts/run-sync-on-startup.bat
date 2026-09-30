@echo off
REM Petpooja Sync - Startup Script
REM This runs automatically when the computer starts

REM Wait 30 seconds after boot to let network connect
timeout /t 30 /nobreak

REM Navigate to project directory
cd /d "D:\Claude Code Project - Sep 2026"

REM Run the sync
echo Running Petpooja sync at %date% %time%...
node scripts\petpooja-sync.mjs

REM Log completion
echo Sync completed at %date% %time% >> scripts\startup-sync.log

REM Keep window open for 10 seconds to show any errors
timeout /t 10
