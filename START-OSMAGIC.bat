@echo off
title OSMAGIC JOSM Helper
color 0A
echo.
echo  ==========================================
echo        OSMAGIC - JOSM Integration
echo  ==========================================
echo.

:: Change to script directory
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: JOSM Path
set "JOSM_PATH=C:\Users\mirza.syazwan\AppData\Local\JOSM\JOSM.exe"

echo  [1/3] Checking JOSM...
echo.

tasklist /FI "IMAGENAME eq JOSM.exe" 2>NUL | find /I "JOSM.exe" >NUL
if %ERRORLEVEL% EQU 0 (
    echo        JOSM is already running [OK]
    goto start_helper
)

if exist "%JOSM_PATH%" (
    echo        Starting JOSM...
    start "" "%JOSM_PATH%"
    timeout /t 5 /nobreak >NUL
    echo        JOSM started [OK]
) else (
    echo        JOSM not found. Please start it manually.
)

:start_helper
echo.
echo  [2/3] Starting JOSM Helper...
echo.

:: Check if helper is already running
netstat -ano 2>NUL | findstr ":8001 " | findstr "LISTENING" >NUL
if %ERRORLEVEL% EQU 0 (
    echo        JOSM Helper already running [OK]
    goto open_app
)

start "JOSM Helper" /min cmd /k "cd /d %SCRIPT_DIR% && python josm-helper.py"
timeout /t 2 /nobreak >NUL
echo        JOSM Helper started on port 8001 [OK]

:open_app
echo.
echo  [3/3] Opening OSMAGIC...
echo.

:: Check if local server is running (for local development)
netstat -ano 2>NUL | findstr ":8000 " | findstr "LISTENING" >NUL
if %ERRORLEVEL% EQU 0 (
    echo        Opening local version...
    start "" "http://localhost:8000"
) else (
    echo        Opening GitHub Pages version...
    echo        (Set your GitHub Pages URL below)
    :: TODO: Replace with your actual GitHub Pages URL
    start "" "http://localhost:8000"
    echo.
    echo        [!] To use online version, deploy to GitHub Pages
    echo            and update the URL in this script.
)

echo        Done! [OK]

echo.
echo  ==========================================
echo    OSMAGIC Ready!
echo  ==========================================
echo    JOSM Helper: http://localhost:8001
echo.
echo    The helper enables 'Export to JOSM' from
echo    both local and online versions of OSMAGIC.
echo  ==========================================
echo.
pause
