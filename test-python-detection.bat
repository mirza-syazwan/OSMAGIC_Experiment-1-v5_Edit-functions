@echo off
echo ==========================================
echo   Python Detection Diagnostic Tool
echo ==========================================
echo.
echo This script tests all Python detection methods
echo used by START-OSMAGIC.bat
echo.
echo ==========================================
echo.

set "PYTHON_FOUND=0"

echo [1/6] Testing 'python' command...
python --version >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
    python --version
    echo    [OK] Python found via 'python' command
    set "PYTHON_FOUND=1"
) else (
    echo    [FAIL] 'python' command not found
)
echo.

echo [2/6] Testing 'python3' command...
python3 --version >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
    python3 --version
    echo    [OK] Python found via 'python3' command
    set "PYTHON_FOUND=1"
) else (
    echo    [FAIL] 'python3' command not found
)
echo.

echo [3/6] Testing 'py' launcher...
py --version >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
    py --version
    echo    [OK] Python found via 'py' launcher
    set "PYTHON_FOUND=1"
) else (
    echo    [FAIL] 'py' launcher not found
)
echo.

echo [4/6] Checking common installation paths...
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    echo    [OK] Found: %LOCALAPPDATA%\Programs\Python\Python311\python.exe
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" --version
    set "PYTHON_FOUND=1"
) else if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" (
    echo    [OK] Found: %LOCALAPPDATA%\Programs\Python\Python310\python.exe
    "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" --version
    set "PYTHON_FOUND=1"
) else if exist "%PROGRAMFILES%\Python311\python.exe" (
    echo    [OK] Found: %PROGRAMFILES%\Python311\python.exe
    "%PROGRAMFILES%\Python311\python.exe" --version
    set "PYTHON_FOUND=1"
) else if exist "%PROGRAMFILES%\Python310\python.exe" (
    echo    [OK] Found: %PROGRAMFILES%\Python310\python.exe
    "%PROGRAMFILES%\Python310\python.exe" --version
    set "PYTHON_FOUND=1"
) else (
    echo    [FAIL] No Python found in common installation paths
)
echo.

echo [5/6] Checking Microsoft Store location...
if exist "%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe" (
    echo    [OK] Found: %LOCALAPPDATA%\Microsoft\WindowsApps\python.exe
    "%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe" --version
    set "PYTHON_FOUND=1"
) else (
    echo    [FAIL] Microsoft Store Python not found
)
echo.

echo [6/6] Checking portable Python in current folder...
if exist "python\python.exe" (
    echo    [OK] Found: python\python.exe
    python\python.exe --version
    set "PYTHON_FOUND=1"
) else (
    echo    [FAIL] Portable Python not found in current folder
)
echo.

echo ==========================================
echo   Summary
echo ==========================================
if %PYTHON_FOUND% EQU 1 (
    echo.
    echo [SUCCESS] Python was detected by at least one method!
    echo.
    echo The batch file should be able to find Python.
    echo If START-OSMAGIC.bat still fails, the issue might be:
    echo - Python script errors (check josm-helper.py)
    echo - Port 8001 already in use
    echo - Firewall blocking the helper
    echo.
) else (
    echo.
    echo [FAILURE] Python was NOT detected by any method!
    echo.
    echo Solutions:
    echo 1. Install Python from: https://www.python.org/downloads/
    echo    (Make sure to check "Add Python to PATH")
    echo.
    echo 2. If Python IS installed, add it to PATH:
    echo    - Search "Environment Variables" in Windows
    echo    - Edit "Path" variable
    echo    - Add Python installation folder
    echo    - Restart Command Prompt
    echo.
    echo 3. Test manually: Open Command Prompt and run:
    echo    python --version
    echo    If this works, Python is installed but not in PATH
    echo.
)

echo ==========================================
pause
