@echo off
setlocal
title JOSM Helper Diagnostic
color 0E
echo.
echo  ==========================================
echo    JOSM Helper Diagnostic Tool
echo  ==========================================
echo.

set "HELPER_PORT=8001"

echo  [1] Checking Python installation...
python --version >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
    python --version
    echo        Python found [OK]
    set "PYTHON_OK=1"
) else (
    python3 --version >NUL 2>&1
    if %ERRORLEVEL% EQU 0 (
        python3 --version
        echo        Python3 found [OK]
        set "PYTHON_OK=1"
    ) else (
        py --version >NUL 2>&1
        if %ERRORLEVEL% EQU 0 (
            py --version
            echo        Python (py launcher) found [OK]
            set "PYTHON_OK=1"
        ) else (
            echo        [!] Python not found
            echo        Please install Python from python.org
            set "PYTHON_OK=0"
        )
    )
)

echo.
echo  [2] Checking if josm-helper.py exists...
if exist "josm-helper.py" (
    echo        josm-helper.py found [OK]
) else (
    echo        [!] josm-helper.py not found in current directory
    echo        Current directory: %CD%
)

echo.
echo  [3] Checking if port %HELPER_PORT% is in use...
netstat -ano 2>NUL | findstr ":%HELPER_PORT% " | findstr "LISTENING" >NUL
if %ERRORLEVEL% EQU 0 (
    echo        Port %HELPER_PORT% is in use
    echo        Checking if it's the helper...
    powershell -NoProfile -NonInteractive -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:%HELPER_PORT%/ping' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop; if ($response.StatusCode -eq 200) { Write-Host '        Helper is running [OK]'; exit 0 } else { Write-Host '        [!] Port in use but not helper'; exit 1 } } catch { Write-Host '        [!] Port in use but not responding'; exit 1 }" 2>&1
) else (
    echo        Port %HELPER_PORT% is available
    echo        Helper is not running
)

echo.
echo  [4] Testing helper connection...
powershell -NoProfile -NonInteractive -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:%HELPER_PORT%/ping' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop; if ($response.StatusCode -eq 200) { Write-Host '        Connection successful [OK]'; Write-Host $response.Content } else { Write-Host '        [!] Connection failed - Status:' $response.StatusCode } } catch { Write-Host '        [!] Connection refused - Helper not running' }" 2>&1

echo.
echo  ==========================================
echo    Diagnostic Complete
echo  ==========================================
echo.
echo  To start the helper manually:
echo    1. Open Command Prompt in this folder
echo    2. Run: python josm-helper.py
echo    3. Keep the window open
echo    4. Test: http://localhost:%HELPER_PORT%/ping
echo.
pause
