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

echo  [1/4] Starting JOSM...
echo.

:: Check if JOSM is already running
tasklist /FI "IMAGENAME eq JOSM.exe" 2>NUL | find /I "JOSM.exe" >NUL
if %ERRORLEVEL% EQU 0 (
    echo        JOSM is already running [OK]
    goto start_helper
)

:: Try to find and start JOSM
set "JOSM_STARTED=0"

:: Check common JOSM locations
if exist "%USERPROFILE%\AppData\Local\JOSM\JOSM.exe" (
    echo        Starting JOSM...
    start "" "%USERPROFILE%\AppData\Local\JOSM\JOSM.exe"
    set "JOSM_STARTED=1"
    timeout /t 2 /nobreak >NUL
    goto start_helper
)

if exist "C:\Program Files\JOSM\josm.exe" (
    echo        Starting JOSM...
    start "" "C:\Program Files\JOSM\josm.exe"
    set "JOSM_STARTED=1"
    timeout /t 2 /nobreak >NUL
    goto start_helper
)

if exist "%USERPROFILE%\AppData\Local\JOSM\josm.exe" (
    echo        Starting JOSM...
    start "" "%USERPROFILE%\AppData\Local\JOSM\josm.exe"
    set "JOSM_STARTED=1"
    timeout /t 2 /nobreak >NUL
    goto start_helper
)

if %JOSM_STARTED% EQU 0 (
    echo        [!] JOSM not found in common locations
    echo        Please start JOSM manually
)

:start_helper
echo.
echo  [2/4] Starting JOSM Helper...
echo.

:: Check if helper is already running
netstat -ano 2>NUL | findstr ":%HELPER_PORT% " | findstr "LISTENING" >NUL
if %ERRORLEVEL% EQU 0 (
    echo        Port %HELPER_PORT% is in use, checking if it's the helper...
    powershell -NoProfile -NonInteractive -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:%HELPER_PORT%/ping' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop; if ($response.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >NUL 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo        JOSM Helper already running [OK]
        goto open_browser
    ) else (
        echo        [!] Port %HELPER_PORT% is in use but not responding as helper
        echo        [!] Another application may be using this port
        echo        [!] Trying to start helper anyway...
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
    goto start_helper_process
)

python3 --version >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
    set "PYTHON_CMD=python3"
    goto start_helper_process
)

py --version >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
    set "PYTHON_CMD=py"
    goto start_helper_process
)

:: Check for portable Python in python\ folder
if exist "%SCRIPT_DIR%python\python.exe" (
    set "PYTHON_CMD=%SCRIPT_DIR%python\python.exe"
    goto start_helper_process
)

:: Check common Python installation locations
if exist "%USERPROFILE%\AppData\Local\Programs\Python\Python311\python.exe" (
    set "PYTHON_CMD=%USERPROFILE%\AppData\Local\Programs\Python\Python311\python.exe"
    goto start_helper_process
)

if exist "%USERPROFILE%\AppData\Local\Programs\Python\Python312\python.exe" (
    set "PYTHON_CMD=%USERPROFILE%\AppData\Local\Programs\Python\Python312\python.exe"
    goto start_helper_process
)

if exist "%USERPROFILE%\AppData\Local\Programs\Python\Python313\python.exe" (
    set "PYTHON_CMD=%USERPROFILE%\AppData\Local\Programs\Python\Python313\python.exe"
    goto start_helper_process
)

if exist "C:\Program Files\Python311\python.exe" (
    set "PYTHON_CMD=C:\Program Files\Python311\python.exe"
    goto start_helper_process
)

if exist "C:\Program Files\Python312\python.exe" (
    set "PYTHON_CMD=C:\Program Files\Python312\python.exe"
    goto start_helper_process
)

if exist "C:\Python311\python.exe" (
    set "PYTHON_CMD=C:\Python311\python.exe"
    goto start_helper_process
)

:: Python not found - offer to download
echo        [!] Python not found.
echo        Attempting to download portable Python...
echo        (This requires internet connection and may take a few minutes)
goto download_python

:download_python
echo        Checking internet connection...
powershell -NoProfile -NonInteractive -Command "try { $response = Test-NetConnection -ComputerName www.python.org -Port 443 -InformationLevel Quiet -WarningAction SilentlyContinue; if ($response) { exit 0 } else { exit 1 } } catch { exit 1 }" >NUL 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo        [!] No internet connection detected
    echo        [!] Cannot download Python automatically
    echo        [!] Please install Python manually from: https://www.python.org/downloads/
    echo        [!] JOSM Helper will not start.
    goto open_browser
)

echo        Downloading Python embeddable package...
echo        (This may take a few minutes - ~25MB download)

set "PYTHON_VERSION=3.11.9"
set "PYTHON_URL=https://www.python.org/ftp/python/%PYTHON_VERSION%/python-%PYTHON_VERSION%-embed-amd64.zip"
set "PYTHON_ZIP=%SCRIPT_DIR%python-temp.zip"
set "PYTHON_DIR=%SCRIPT_DIR%python"

powershell -NoProfile -ExecutionPolicy Bypass -NonInteractive -Command "try { Write-Host '        Downloading from:' '%PYTHON_URL%'; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '%PYTHON_URL%' -OutFile '%PYTHON_ZIP%' -UseBasicParsing -ErrorAction Stop; Write-Host '        Download complete'; exit 0 } catch { Write-Host '        Download failed:'; Write-Host $_.Exception.Message; exit 1 }" 2>&1

if not exist "%PYTHON_ZIP%" (
    echo        [!] Download failed - check internet connection
    echo        [!] You can download manually from: %PYTHON_URL%
    echo        [!] Extract to: python\ folder
    echo        [!] JOSM Helper will not start.
    goto open_browser
)

echo        Extracting Python...
if not exist "%PYTHON_DIR%" mkdir "%PYTHON_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -NonInteractive -Command "try { Expand-Archive -Path '%PYTHON_ZIP%' -DestinationPath '%PYTHON_DIR%' -Force; Remove-Item '%PYTHON_ZIP%' -Force; Write-Host '        Extraction complete'; exit 0 } catch { Write-Host '        Extraction failed:'; Write-Host $_.Exception.Message; exit 1 }" 2>&1

if not exist "%PYTHON_DIR%\python.exe" (
    echo        [!] Extraction failed
    echo        [!] JOSM Helper will not start.
    goto open_browser
)

:: Enable pip support (optional but helpful)
if exist "%PYTHON_DIR%\python311._pth" (
    echo        Enabling pip support...
    powershell -NoProfile -NonInteractive -Command "try { $content = Get-Content '%PYTHON_DIR%\python311._pth' -Raw; if ($content -notmatch 'import site') { $content = $content + \"`r`nimport site`r`n\"; Set-Content '%PYTHON_DIR%\python311._pth' -Value $content -NoNewline } } catch { }" >NUL 2>&1
)

set "PYTHON_CMD=%PYTHON_DIR%\python.exe"
echo        Portable Python downloaded [OK]
goto start_helper_process

:start_helper_process
echo        Starting JOSM Helper on port %HELPER_PORT%...
echo        (A new window will open - keep it open)
echo        Using Python: %PYTHON_CMD%
start "JOSM Helper" cmd /k "cd /d %SCRIPT_DIR% && echo ======================================== && echo   JOSM Helper Starting... && echo ======================================== && echo. && echo Using: %PYTHON_CMD% && echo Script: josm-helper.py && echo Port: %HELPER_PORT% && echo. && echo If you see errors below, please report them: && echo ======================================== && echo. && \"%PYTHON_CMD%\" josm-helper.py || (echo. && echo ERROR: Failed to start helper. && echo Check if Python is installed correctly. && echo Press any key to close... && pause >NUL)"
timeout /t 3 /nobreak >NUL

:: Verify helper started with retries
echo        Waiting for helper to initialize...
set "HELPER_STARTED=0"
for /L %%i in (1,1,10) do (
    timeout /t 1 /nobreak >NUL
    powershell -NoProfile -NonInteractive -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:%HELPER_PORT%/ping' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop; if ($response.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >NUL 2>&1
    if %ERRORLEVEL% EQU 0 (
        set "HELPER_STARTED=1"
        goto helper_verified
    )
)

:helper_verified
if %HELPER_STARTED% EQU 1 (
    echo        JOSM Helper started [OK]
    echo        Accessible at: http://localhost:%HELPER_PORT%
) else (
    echo        [!] WARNING: JOSM Helper may not have started correctly
    echo        [!] Check the "JOSM Helper" window for errors
    echo        [!] Common issues:
    echo            - Python not installed or not in PATH
    echo            - Port %HELPER_PORT% already in use
    echo            - Firewall blocking the port
    echo        [!] Test manually: http://localhost:%HELPER_PORT%/ping
    echo        [!] If the helper window shows errors, please report them
)

:open_browser
echo.
echo  [3/4] Opening OSMAGIC...
start "" "%GITHUB_PAGES_URL%"
echo        Browser opened [OK]

:add_imagery
echo.
echo  [4/4] Adding OpenStreetMap Carto (Standard) imagery layer...
echo        (Waiting 5 seconds for JOSM to fully initialize...)
timeout /t 5 /nobreak >NUL
echo        Attempting to add imagery layer...
powershell -NoProfile -NonInteractive -Command "$maxAttempts = 10; $attempt = 0; $success = $false; while ($attempt -lt $maxAttempts -and -not $success) { try { $response = Invoke-WebRequest -Uri 'http://localhost:8111/version' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop; if ($response.StatusCode -eq 200) { $imageryId = [uri]::EscapeDataString('OpenStreetMap Carto (Standard)'); try { Invoke-WebRequest -Uri ('http://localhost:8111/imagery?id=' + $imageryId) -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop | Out-Null; $success = $true; Write-Host '        Imagery layer added [OK]' } catch { Write-Host '        [!] Could not add imagery layer (may already be added or Remote Control not enabled)' }; break } } catch { $attempt++; Start-Sleep -Milliseconds 500 } }" 2>&1

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
