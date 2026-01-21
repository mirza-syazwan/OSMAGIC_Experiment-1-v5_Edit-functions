@echo off
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

:: Try common JOSM locations (in order of likelihood) using PowerShell
if not defined JOSM_PATH (
    powershell -NoProfile -Command "if (Test-Path ([System.IO.Path]::Combine($env:USERPROFILE, 'AppData', 'Local', 'JOSM', 'JOSM.exe'))) { exit 0 } else { exit 1 }" >NUL 2>&1
    if %ERRORLEVEL% EQU 0 set "JOSM_PATH=%USERPROFILE%\AppData\Local\JOSM\JOSM.exe"
)
if not defined JOSM_PATH (
    powershell -NoProfile -Command "if (Test-Path 'C:\Program Files\JOSM\josm.exe') { exit 0 } else { exit 1 }" >NUL 2>&1
    if %ERRORLEVEL% EQU 0 set "JOSM_PATH=C:\Program Files\JOSM\josm.exe"
)
if not defined JOSM_PATH (
    powershell -NoProfile -Command "if (Test-Path 'C:\Program Files (x86)\JOSM\josm.exe') { exit 0 } else { exit 1 }" >NUL 2>&1
    if %ERRORLEVEL% EQU 0 set "JOSM_PATH=C:\Program Files (x86)\JOSM\josm.exe"
)
if not defined JOSM_PATH (
    powershell -NoProfile -Command "if (Test-Path ([System.IO.Path]::Combine($env:USERPROFILE, 'AppData', 'Local', 'JOSM', 'josm.exe'))) { exit 0 } else { exit 1 }" >NUL 2>&1
    if %ERRORLEVEL% EQU 0 set "JOSM_PATH=%USERPROFILE%\AppData\Local\JOSM\josm.exe"
)
if not defined JOSM_PATH (
    powershell -NoProfile -Command "if (Test-Path ([System.IO.Path]::Combine($env:USERPROFILE, 'Downloads', 'josm-tested.jar'))) { exit 0 } else { exit 1 }" >NUL 2>&1
    if %ERRORLEVEL% EQU 0 set "JOSM_PATH=%USERPROFILE%\Downloads\josm-tested.jar"
)
if not defined JOSM_PATH (
    powershell -NoProfile -Command "if (Test-Path ([System.IO.Path]::Combine($env:USERPROFILE, 'josm-tested.jar'))) { exit 0 } else { exit 1 }" >NUL 2>&1
    if %ERRORLEVEL% EQU 0 set "JOSM_PATH=%USERPROFILE%\josm-tested.jar"
)
if not defined JOSM_PATH (
    powershell -NoProfile -Command "if (Test-Path ([System.IO.Path]::Combine($env:USERPROFILE, 'JOSM', 'josm.jar'))) { exit 0 } else { exit 1 }" >NUL 2>&1
    if %ERRORLEVEL% EQU 0 set "JOSM_PATH=%USERPROFILE%\JOSM\josm.jar"
)
if not defined JOSM_PATH (
    powershell -NoProfile -Command "if (Test-Path ([System.IO.Path]::Combine($env:USERPROFILE, 'Desktop', 'josm-tested.jar'))) { exit 0 } else { exit 1 }" >NUL 2>&1
    if %ERRORLEVEL% EQU 0 set "JOSM_PATH=%USERPROFILE%\Desktop\josm-tested.jar"
)

:: Start JOSM if found
if defined JOSM_PATH (
    echo        Found JOSM at: %JOSM_PATH%
    echo        Starting JOSM...
    
    echo %JOSM_PATH% | find /I ".jar" >NUL
    if %ERRORLEVEL% EQU 0 (
        start "" javaw -jar "%JOSM_PATH%"
    ) else (
        start "" "%JOSM_PATH%"
    )
    
    timeout /t 5 /nobreak >NUL
    echo        JOSM started [OK]
    
    :: Load OpenStreetMap Carto imagery
    echo        Loading OpenStreetMap Carto imagery...
    call :load_josm_imagery
) else (
    echo        [!] JOSM not found in common locations.
    echo.
    echo        Common locations checked:
    echo          - %USERPROFILE%\AppData\Local\JOSM\
    echo          - C:\Program Files\JOSM\
    echo          - C:\Program Files (x86)\JOSM\
    echo          - %USERPROFILE%\Downloads\
    echo.
    echo        Please start JOSM manually before exporting.
    echo        The app will still work for editing!
    echo.
)

:: ==========================================
:: Function: Load JOSM Imagery
:: ==========================================
:load_josm_imagery
:: Wait for JOSM Remote Control to be ready (max 15 seconds)
set "RETRY_COUNT=0"
:wait_for_josm
set /a RETRY_COUNT+=1
if %RETRY_COUNT% GTR 15 goto :imagery_skip

:: Test if JOSM Remote Control is responding
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:8111/version' -TimeoutSec 2 -ErrorAction Stop; exit 0 } catch { exit 1 }" >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
    :: JOSM Remote Control is ready, load imagery
    echo        Loading OpenStreetMap Carto imagery...
    :: Use PowerShell to send request to JOSM Remote Control with proper URL encoding
    powershell -Command "$name = [System.Uri]::EscapeDataString('OpenStreetMap Carto (Standard)'); $uri = \"http://localhost:8111/imagery?name=$name\"; try { $response = Invoke-WebRequest -Uri $uri -Method GET -TimeoutSec 3 -ErrorAction Stop; exit 0 } catch { exit 1 }" >NUL 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo        Imagery loaded [OK]
    ) else (
        echo        [!] Could not auto-load imagery automatically.
        echo           Please load manually: Imagery ^> OpenStreetMap Carto (Standard)
        echo           (This is normal if JOSM Remote Control doesn't support this endpoint)
    )
    goto :imagery_done
) else (
    :: Wait a bit and retry
    timeout /t 1 /nobreak >NUL
    goto :wait_for_josm
)

:imagery_skip
echo        [!] JOSM Remote Control not ready.
echo           Load imagery manually: Imagery ^> OpenStreetMap Carto (Standard)
goto :imagery_done

:imagery_done
exit /b

:: ==========================================
:: STEP 2: Check/Download josm-helper.py
:: ==========================================
:check_helper
echo.
echo  [2/4] Checking JOSM Helper...
echo.

:: Check if helper is already running
netstat -ano 2>NUL | findstr ":%HELPER_PORT% " | findstr "LISTENING" >NUL
if %ERRORLEVEL% EQU 0 (
    echo        JOSM Helper already running on port %HELPER_PORT% [OK]
    goto open_browser
)

:: Check if josm-helper.py exists
if exist "%SCRIPT_DIR%josm-helper.py" (
    echo        josm-helper.py found [OK]
    goto start_helper
)

:: Download josm-helper.py from GitHub
echo        josm-helper.py not found. Downloading...
echo.

:: Try PowerShell download (Windows 10+)
powershell -Command "try { Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/mirza-syazwan/OSMAGIC_Experiment-1-v5_Edit-functions/main/josm-helper.py' -OutFile '%SCRIPT_DIR%josm-helper.py' -ErrorAction Stop; Write-Host 'Download successful!' } catch { Write-Host 'Download failed:' $_.Exception.Message; exit 1 }" 2>NUL

if exist "%SCRIPT_DIR%josm-helper.py" (
    echo        Download successful! [OK]
) else (
    echo        [!] Download failed. Please download manually:
    echo           https://raw.githubusercontent.com/mirza-syazwan/OSMAGIC_Experiment-1-v5_Edit-functions/main/josm-helper.py
    echo.
    echo        Save it in: %SCRIPT_DIR%
    echo        Then run this script again.
    echo.
    pause
    exit /b 1
)

:start_helper
:: Start the helper
echo        Starting JOSM Helper on port %HELPER_PORT%...
start "JOSM Helper" /min cmd /k "cd /d %SCRIPT_DIR% && python josm-helper.py"
timeout /t 2 /nobreak >NUL

:: Verify helper started
netstat -ano 2>NUL | findstr ":%HELPER_PORT% " | findstr "LISTENING" >NUL
if %ERRORLEVEL% EQU 0 (
    echo        JOSM Helper started successfully [OK]
) else (
    echo        [!] JOSM Helper may not have started.
    echo           Make sure Python is installed.
    echo           Check the helper window for errors.
)

:: ==========================================
:: STEP 3: Open Browser
:: ==========================================
:open_browser
echo.
echo  [3/4] Opening OSMAGIC...
echo.

start "" "%GITHUB_PAGES_URL%"
echo        Browser opened [OK]

:: ==========================================
:: STEP 4: Show Status
:: ==========================================
echo.
echo  [4/4] Status Summary
echo.
echo  ==========================================
echo    OSMAGIC Ready!
echo  ==========================================
echo    Online:  %GITHUB_PAGES_URL%
echo    Helper:  http://localhost:%HELPER_PORT%
echo.
if defined JOSM_PATH (
    echo    JOSM:    Running
) else (
    echo    JOSM:    Not found - start manually
)
echo.
echo    The helper enables 'Export to JOSM'
echo    from the online version.
echo  ==========================================
echo.
echo  Press any key to close this window...
pause >NUL
