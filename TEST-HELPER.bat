@echo off
setlocal enabledelayedexpansion
echo ==========================================
echo   JOSM Helper Test & Start
echo ==========================================
echo.

set "PYTHON_PATH=%USERPROFILE%\AppData\Local\Programs\Python\Python311\python.exe"
set "SCRIPT_DIR=%~dp0"
set "HELPER_SCRIPT=%SCRIPT_DIR%josm-helper.py"
set "HELPER_PORT=8001"

echo [1] Checking Python...
if not exist "%PYTHON_PATH%" (
    echo [!] Python not found at: %PYTHON_PATH%
    pause
    exit /b 1
)
"%PYTHON_PATH%" --version
echo [OK] Python found
echo.

echo [2] Checking josm-helper.py...
if not exist "%HELPER_SCRIPT%" (
    echo [!] josm-helper.py not found
    pause
    exit /b 1
)
echo [OK] josm-helper.py found
echo.

echo [3] Checking port %HELPER_PORT%...
netstat -ano | findstr :%HELPER_PORT% | findstr LISTENING >NUL
if %ERRORLEVEL% EQU 0 (
    echo [!] Port %HELPER_PORT% is already in use
    echo     Closing existing processes...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%HELPER_PORT% ^| findstr LISTENING') do (
        taskkill /PID %%a /F >NUL 2>&1
    )
    timeout /t 2 /nobreak >NUL
)
echo [OK] Port is available
echo.

echo [4] Testing Python syntax...
"%PYTHON_PATH%" -m py_compile "%HELPER_SCRIPT%" >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Python syntax is valid
) else (
    echo [!] Python syntax error!
    pause
    exit /b 1
)
echo.

echo [5] Starting helper...
echo     Keep the window that opens!
echo.
:: Create a simple launcher script to avoid quote issues
set "LAUNCHER=%SCRIPT_DIR%_start-helper.bat"
echo @echo off > "%LAUNCHER%"
echo cd /d "%~dp0" >> "%LAUNCHER%"
echo echo ======================================== >> "%LAUNCHER%"
echo echo   JOSM Helper Starting... >> "%LAUNCHER%"
echo echo ======================================== >> "%LAUNCHER%"
echo echo. >> "%LAUNCHER%"
echo "%PYTHON_PATH%" josm-helper.py >> "%LAUNCHER%"
echo if errorlevel 1 pause >> "%LAUNCHER%"

echo [5a] Starting helper window...
start "JOSM Helper" cmd /k "%LAUNCHER%"
timeout /t 4 /nobreak >NUL

echo [6] Testing connection...
for /L %%i in (1,1,10) do (
    timeout /t 1 /nobreak >NUL
    powershell -NoProfile -NonInteractive -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:%HELPER_PORT%/ping' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop; if ($r.StatusCode -eq 200) { Write-Host '[OK] Helper is RUNNING!'; Write-Host $r.Content; exit 0 } else { exit 1 } } catch { exit 1 }" 2>&1
    if %ERRORLEVEL% EQU 0 goto success
)

echo [!] Helper did not start successfully
echo     Check the JOSM Helper window for errors
goto end

:success
echo.
echo ==========================================
echo   SUCCESS! Helper is running
echo ==========================================
echo   Test in browser: http://localhost:%HELPER_PORT%/ping
echo.

:end
pause
