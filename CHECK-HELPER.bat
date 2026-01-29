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
set "PYTHON_OK=0"
python --version >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
    python --version 2>&1
    echo        Python found [OK]
    set "PYTHON_OK=1"
    goto python_check_done
)

python3 --version >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
    python3 --version 2>&1
    echo        Python3 found [OK]
    set "PYTHON_OK=1"
    goto python_check_done
)

py --version >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
    py --version 2>&1
    echo        Python (py launcher) found [OK]
    set "PYTHON_OK=1"
    goto python_check_done
)

:: Check for portable Python
if exist "python\python.exe" (
    python\python.exe --version 2>&1
    echo        Portable Python found [OK]
    set "PYTHON_OK=1"
    goto python_check_done
)

:: Check common Python installation locations
if exist "%USERPROFILE%\AppData\Local\Programs\Python\Python311\python.exe" (
    "%USERPROFILE%\AppData\Local\Programs\Python\Python311\python.exe" --version 2>&1
    echo        Python found at: %USERPROFILE%\AppData\Local\Programs\Python\Python311 [OK]
    set "PYTHON_OK=1"
    goto python_check_done
)

if exist "%USERPROFILE%\AppData\Local\Programs\Python\Python312\python.exe" (
    "%USERPROFILE%\AppData\Local\Programs\Python\Python312\python.exe" --version 2>&1
    echo        Python found at: %USERPROFILE%\AppData\Local\Programs\Python\Python312 [OK]
    set "PYTHON_OK=1"
    goto python_check_done
)

if exist "%USERPROFILE%\AppData\Local\Programs\Python\Python313\python.exe" (
    "%USERPROFILE%\AppData\Local\Programs\Python\Python313\python.exe" --version 2>&1
    echo        Python found at: %USERPROFILE%\AppData\Local\Programs\Python\Python313 [OK]
    set "PYTHON_OK=1"
    goto python_check_done
)

if exist "C:\Program Files\Python311\python.exe" (
    "C:\Program Files\Python311\python.exe" --version 2>&1
    echo        Python found at: C:\Program Files\Python311 [OK]
    set "PYTHON_OK=1"
    goto python_check_done
)

if exist "C:\Program Files\Python312\python.exe" (
    "C:\Program Files\Python312\python.exe" --version 2>&1
    echo        Python found at: C:\Program Files\Python312 [OK]
    set "PYTHON_OK=1"
    goto python_check_done
)

if exist "C:\Python311\python.exe" (
    "C:\Python311\python.exe" --version 2>&1
    echo        Python found at: C:\Python311 [OK]
    set "PYTHON_OK=1"
    goto python_check_done
)

echo        [!] Python not found in PATH or common locations
echo        [!] Your Python is at: %USERPROFILE%\AppData\Local\Programs\Python\Python311
echo        [!] Consider adding Python to PATH for easier access
echo        [!] Or run START-OSMAGIC.bat - it will find Python automatically
set "PYTHON_OK=0"

:python_check_done

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
if %PYTHON_OK% EQU 1 (
    echo  To start the helper manually:
    echo    1. Open Command Prompt in this folder
    echo    2. Run: python josm-helper.py
    echo       (or: python3 josm-helper.py)
    echo       (or: "%USERPROFILE%\AppData\Local\Programs\Python\Python311\python.exe" josm-helper.py)
    echo       (or: python\python.exe josm-helper.py if using portable)
    echo    3. Keep the window open
    echo    4. Test: http://localhost:%HELPER_PORT%/ping
) else (
    echo  [!] Python is required to run the helper
    echo.
    echo  Solutions:
    echo    1. Install Python from: https://www.python.org/downloads/
    echo       (Make sure to check "Add Python to PATH" during installation)
    echo.
    echo    2. OR run START-OSMAGIC.bat - it will download portable Python
    echo       automatically (requires internet connection)
    echo.
    echo    3. After Python is installed, run this diagnostic again
)
echo.
pause
