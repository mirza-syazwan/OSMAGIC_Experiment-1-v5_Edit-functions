@echo off
setlocal enabledelayedexpansion
title OSMAGIC Launcher
color 0A
echo.
echo  ==========================================
echo        OSMAGIC GPS Trace Editor
echo  ==========================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"
set "GITHUB_PAGES_URL=https://mirza-syazwan.github.io/OSMAGIC_Experiment-1-v5_Edit-functions/"
set "HELPER_PORT=8001"

echo  [1/3] Starting JOSM...
echo.

:: Check if JOSM is already running
tasklist /FI "IMAGENAME eq JOSM.exe" 2>NUL | find /I "JOSM.exe" >NUL
if %ERRORLEVEL% EQU 0 (
    echo        JOSM is already running [OK]
    goto add_imagery
)

:: Try to find and start JOSM
set "JOSM_STARTED=0"

:: Check common JOSM locations
if exist "%USERPROFILE%\AppData\Local\JOSM\JOSM.exe" (
    echo        Starting JOSM...
    start "" "%USERPROFILE%\AppData\Local\JOSM\JOSM.exe"
    set "JOSM_STARTED=1"
    timeout /t 2 /nobreak >NUL
    goto add_imagery
)

if exist "C:\Program Files\JOSM\josm.exe" (
    echo        Starting JOSM...
    start "" "C:\Program Files\JOSM\josm.exe"
    set "JOSM_STARTED=1"
    timeout /t 2 /nobreak >NUL
    goto add_imagery
)

if exist "%USERPROFILE%\AppData\Local\JOSM\josm.exe" (
    echo        Starting JOSM...
    start "" "%USERPROFILE%\AppData\Local\JOSM\josm.exe"
    set "JOSM_STARTED=1"
    timeout /t 2 /nobreak >NUL
    goto add_imagery
)

if %JOSM_STARTED% EQU 0 (
    echo        [!] JOSM not found in common locations
    echo        Please start JOSM manually
    goto add_imagery
)

:: Wait for JOSM to start
echo        Waiting for JOSM to be ready...
timeout /t 3 /nobreak >NUL

:add_imagery
:: Check if JOSM Remote Control is accessible and add imagery
echo        Adding OpenStreetMap Carto (Standard) imagery layer...
powershell -NoProfile -NonInteractive -Command "$maxAttempts = 10; $attempt = 0; $success = $false; while ($attempt -lt $maxAttempts -and -not $success) { try { $response = Invoke-WebRequest -Uri 'http://localhost:8111/version' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop; if ($response.StatusCode -eq 200) { $imageryId = [uri]::EscapeDataString('OpenStreetMap Carto (Standard)'); try { Invoke-WebRequest -Uri ('http://localhost:8111/imagery?id=' + $imageryId) -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop | Out-Null; $success = $true; Write-Host '        Imagery layer added [OK]' } catch { Write-Host '        [!] Could not add imagery layer (may already be added)' }; break } } catch { $attempt++; Start-Sleep -Milliseconds 500 } }" 2>&1
timeout /t 1 /nobreak >NUL

:check_helper
echo.
echo  [2/3] Starting JOSM Helper...
echo.

:: Check if helper is already running
netstat -ano 2>NUL | findstr ":%HELPER_PORT% " | findstr "LISTENING" >NUL
if %ERRORLEVEL% EQU 0 (
    echo        Checking if helper is responding...
    powershell -NoProfile -NonInteractive -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:%HELPER_PORT%/ping' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop; if ($response.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >NUL 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo        JOSM Helper already running [OK]
        goto open_browser
    )
)

:: Check if josm-helper.py exists
if not exist "%SCRIPT_DIR%josm-helper.py" (
    echo        [!] josm-helper.py not found
    echo        Please ensure josm-helper.py is in the same folder
    goto open_browser
)

:: Find Python command
set "PYTHON_CMD="
python --version >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
    set "PYTHON_CMD=python"
    goto start_helper
)

python3 --version >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
    set "PYTHON_CMD=python3"
    goto start_helper
)

py --version >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
    set "PYTHON_CMD=py"
    goto start_helper
)

echo        [!] Python not found. Please install Python.
echo        JOSM Helper will not start.
goto open_browser

:start_helper
echo        Starting JOSM Helper on port %HELPER_PORT%...
echo        (A new window will open - keep it open)
start "JOSM Helper" cmd /k "cd /d %SCRIPT_DIR% && echo Starting JOSM Helper... && echo Using: %PYTHON_CMD% && \"%PYTHON_CMD%\" josm-helper.py"
timeout /t 2 /nobreak >NUL

:: Verify helper started
echo        Verifying helper is running...
timeout /t 2 /nobreak >NUL
powershell -NoProfile -NonInteractive -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:%HELPER_PORT%/ping' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop; if ($response.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
    echo        JOSM Helper started [OK]
) else (
    echo        [!] WARNING: JOSM Helper may not have started correctly
    echo        Check the "JOSM Helper" window for errors
    echo        Test: http://localhost:%HELPER_PORT%/ping
)

:open_browser
echo.
echo  [3/3] Opening OSMAGIC...
start "" "%GITHUB_PAGES_URL%"
echo        Browser opened [OK]

echo.
echo  ==========================================
echo    OSMAGIC Ready!
echo  ==========================================
echo    Online:  %GITHUB_PAGES_URL%
echo    Helper:  http://localhost:%HELPER_PORT%
echo    JOSM:    Check if running
echo  ==========================================
echo.
pause
exit /b 0
