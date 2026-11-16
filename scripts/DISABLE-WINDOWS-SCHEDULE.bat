@echo off
REM =========================================================================
REM Atelier Variable Pay Engine - Disable the local Windows sync tasks
REM
REM The daily Petpooja sync now runs automatically in the cloud:
REM   GitHub Actions (free, on a public repo) calls it at 05:00 IST,
REM   and the browser work runs on Vercel.
REM
REM These local tasks are no longer needed, and they are actively harmful:
REM Petpooja refuses a second login while another session is active, so a
REM local run that overlaps the hosted one breaks both. The startup task in
REM particular fires whenever the office computer is switched on.
REM
REM The local run is still available by hand:
REM   node scripts\smart-daily-sync.mjs
REM =========================================================================

echo -------------------------------------------------------------
echo Disabling the local Atelier sync tasks...
echo -------------------------------------------------------------

schtasks /end    /tn "Atelier_Petpooja_Startup_Sync"       2>nul
schtasks /end    /tn "Atelier_Petpooja_Noon_Failsafe_Sync" 2>nul
schtasks /delete /tn "Atelier_Petpooja_Startup_Sync"       /f
schtasks /delete /tn "Atelier_Petpooja_Noon_Failsafe_Sync" /f

echo.
echo -------------------------------------------------------------
echo  Done. The daily sync now runs from the cloud at 05:00 IST.
echo  To run it by hand on this computer:
echo     node scripts\smart-daily-sync.mjs
echo  To put the local tasks back:
echo     scripts\REGISTER-WINDOWS-SCHEDULE.bat
echo -------------------------------------------------------------
echo.
pause
