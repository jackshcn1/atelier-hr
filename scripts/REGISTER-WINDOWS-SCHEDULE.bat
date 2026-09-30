@echo off
REM =========================================================================
REM Atelier Variable Pay Engine - Automated System Tasks Setup
REM Configures:
REM 1. Boot Trigger (Runs on System Startup with 30s delay)
REM 2. 12:00 PM Failsafe Trigger (Runs at noon ONLY if boot-sync hasn't run today)
REM =========================================================================

echo -------------------------------------------------------------
echo Setting up Atelier Daily & Startup Sync Tasks in Windows...
echo -------------------------------------------------------------

set SCRIPT_DIR=%~dp0
set NODE_PATH=node.exe

REM 1. Create or replace Startup Task
schtasks /create /tn "Atelier_Petpooja_Startup_Sync" /tr "node \"%SCRIPT_DIR%smart-daily-sync.mjs\"" /sc onstart /delay 0000:30 /f /rl highest

REM 2. Create or replace 12:00 PM Daily Failsafe Task
schtasks /create /tn "Atelier_Petpooja_Noon_Failsafe_Sync" /tr "node \"%SCRIPT_DIR%smart-daily-sync.mjs\"" /sc daily /st 12:00 /f /rl highest

echo.
echo -------------------------------------------------------------
echo  Tasks successfully registered in Windows Task Scheduler:
echo    1. [On Startup]  Atelier_Petpooja_Startup_Sync
echo    2. [12:00 PM]    Atelier_Petpooja_Noon_Failsafe_Sync
echo -------------------------------------------------------------
echo.
pause
