@echo off
setlocal
title Start JOSM Helper
color 0B
echo.
echo  ==========================================
echo    Starting JOSM Helper
echo  ==========================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"
set "HELPER_PORT=8001"

:: Try to find Python
set "PYTHON_CMD="

:: Check PATH first
python --version >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
    set "PYTHON_CMD=python"
    goto found_python
)

python3 --version >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
    set "PYTHON_CMD=python3"
    goto found_python
)

py --version >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
    set "PYTHON_CMD=py"
    goto found_python
)

:: Check your specific location
if exist "%USERPROFILE%\AppData\Local\Programs\Python\Python311\python.exe" (
    set "PYTHON_CMD=%USERPROFILE%\AppData\Local\Programs\Python\Python311\python.exe"
    goto found_python
)

:: Check portable Python
if exist "%SCRIPT_DIR%python\python.exe" (
    set "PYTHON_CMD=%SCRIPT_DIR%python\python.exe"
    goto found_python
)

:: Python not found
echo  [!] Python not found!
echo  [!] Please install Python or run START-OSMAGIC.bat
echo.
pause
exit /b 1

:found_python
echo  Python found: %PYTHON_CMD%
echo.

:: Check if josm-helper.py exists
if not exist "%SCRIPT_DIR%josm-helper.py" (
    echo  [!] josm-helper.py not found in:
    echo      %SCRIPT_DIR%
    echo.
    pause
    exit /b 1
)

:: Check if helper is already running
echo  Checking if helper is already running...
powershell -NoProfile -NonInteractive -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:%HELPER_PORT%/ping' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop; if ($response.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
    echo  [!] Helper is already running on port %HELPER_PORT%
    echo  [!] Close the existing helper window first, or use a different port
    echo.
    pause
    exit /b 1
)

echo  Starting JOSM Helper...
echo  Port: %HELPER_PORT%
echo  Keep this window open!
echo.
echo  ==========================================
echo.

start "JOSM Helper" cmd /k "cd /d %SCRIPT_DIR% && echo JOSM Helper Running... && echo Port: %HELPER_PORT% && echo. && echo Press Ctrl+C to stop && echo ========================================== && echo. && \"%PYTHON_CMD%\" josm-helper.py"

timeout /t 3 /nobreak >NUL

:: Verify it started
echo  Verifying helper started...
for /L %%i in (1,1,5) do (
    timeout /t 1 /nobreak >NUL
    powershell -NoProfile -NonInteractive -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:%HELPER_PORT%/ping' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop; if ($response.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >NUL 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo  [OK] Helper is running!
        echo  Test: http://localhost:%HELPER_PORT%/ping
        echo.
        pause
        exit /b 0
    )
)

echo  [!] Helper may not have started correctly
echo  [!] Check the "JOSM Helper" window for errors
echo  [!] Test manually: http://localhost:%HELPER_PORT%/ping
echo.
pause
