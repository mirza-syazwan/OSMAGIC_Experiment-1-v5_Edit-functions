@echo off
setlocal enabledelayedexpansion
title OSMAGIC Launcher
color 0A
echo.
echo  ==========================================
echo        OSMAGIC GPS Trace Editor
echo  ==========================================
echo.

:: Change to script directory
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Could not change to script directory: %SCRIPT_DIR%
    pause
    exit /b 1
)

:: GitHub Pages URL
set "GITHUB_PAGES_URL=https://mirza-syazwan.github.io/OSMAGIC_Experiment-1-v5_Edit-functions/"
set "HELPER_PORT=8001"
set "JOSM_PATH="

:: ==========================================
:: STEP 1: Auto-detect JOSM
:: ==========================================
echo  [1/4] Auto-detecting JOSM...
echo.

:: Check if JOSM is already running
tasklist /FI "IMAGENAME eq JOSM.exe" 2>NUL | find /I "JOSM.exe" >NUL
if %ERRORLEVEL% EQU 0 (
    echo        JOSM is already running [OK]
    set "JOSM_PATH=RUNNING"
    call :load_josm_imagery
    goto check_helper
)

tasklist /FI "IMAGENAME eq javaw.exe" 2>NUL | find /I "javaw.exe" >NUL
if %ERRORLEVEL% EQU 0 (
    echo        Java process detected - JOSM may be running [OK]
    set "JOSM_PATH=RUNNING"
    call :load_josm_imagery
    goto check_helper
)

:: Try common JOSM locations (in order of likelihood)
:check_josm_paths
if defined JOSM_PATH goto :paths_done
