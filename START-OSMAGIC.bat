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
set "JOSM_PATH="
set "PYTHON_FOUND=0"
set "HELPER_VERIFIED=0"

echo  [0/4] Checking prerequisites...
echo.

:: Check for Python - try multiple methods
set "PYTHON_FOUND=0"

:: Method 1: Try 'python' command
python --version >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
    echo        Python found [OK] ^(python^)
    set "PYTHON_FOUND=1"
    goto python_found
)

:: Method 2: Try 'python3' command (common on some systems)
python3 --version >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
    echo        Python found [OK] ^(python3^)
    set "PYTHON_FOUND=1"
    set "PYTHON_CMD=python3"
    goto python_found
)

:: Method 3: Try 'py' launcher (Windows Python launcher)
py --version >NUL 2>&1
if %ERRORLEVEL% EQU 0 (
    echo        Python found [OK] ^(py launcher^)
    set "PYTHON_FOUND=1"
    set "PYTHON_CMD=py"
    goto python_found
)

:: Method 4: Check common Python installation paths (check most recent versions first)
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    echo        Python found [OK] ^(%LOCALAPPDATA%\Programs\Python\Python311\python.exe^)
    set "PYTHON_FOUND=1"
    set "PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    goto python_found
)
if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" (
    echo        Python found [OK] ^(%LOCALAPPDATA%\Programs\Python\Python310\python.exe^)
    set "PYTHON_FOUND=1"
    set "PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
    goto python_found
)
if exist "%LOCALAPPDATA%\Programs\Python\Python39\python.exe" (
    echo        Python found [OK] ^(%LOCALAPPDATA%\Programs\Python\Python39\python.exe^)
    set "PYTHON_FOUND=1"
    set "PYTHON_CMD=%LOCALAPPDATA%\Programs\Python\Python39\python.exe"
    goto python_found
)
if exist "%PROGRAMFILES%\Python311\python.exe" (
    echo        Python found [OK] ^(%PROGRAMFILES%\Python311\python.exe^)
    set "PYTHON_FOUND=1"
    set "PYTHON_CMD=%PROGRAMFILES%\Python311\python.exe"
    goto python_found
)
if exist "%PROGRAMFILES%\Python310\python.exe" (
    echo        Python found [OK] ^(%PROGRAMFILES%\Python310\python.exe^)
    set "PYTHON_FOUND=1"
    set "PYTHON_CMD=%PROGRAMFILES%\Python310\python.exe"
    goto python_found
)
if exist "%PROGRAMFILES(X86)%\Python311\python.exe" (
    echo        Python found [OK] ^(%PROGRAMFILES(X86)%\Python311\python.exe^)
    set "PYTHON_FOUND=1"
    set "PYTHON_CMD=%PROGRAMFILES(X86)%\Python311\python.exe"
    goto python_found
)
if exist "%PROGRAMFILES(X86)%\Python310\python.exe" (
    echo        Python found [OK] ^(%PROGRAMFILES(X86)%\Python310\python.exe^)
    set "PYTHON_FOUND=1"
    set "PYTHON_CMD=%PROGRAMFILES(X86)%\Python310\python.exe"
    goto python_found
)

:: Method 5: Check Microsoft Store Python location
if exist "%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe" (
    echo        Python found [OK] ^(Microsoft Store^)
    set "PYTHON_FOUND=1"
    set "PYTHON_CMD=%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe"
    goto python_found
)

:python_found

if %PYTHON_FOUND% EQU 0 (
    echo        Python not found in PATH. Checking for portable Python...
    if exist "%SCRIPT_DIR%python\python.exe" (
        echo        Portable Python found [OK]
        set "PYTHON_CMD=%SCRIPT_DIR%python\python.exe"
        set "PYTHON_FOUND=1"
    ) else (
        echo        Python not found. Attempting to download portable Python...
        echo        ^(This requires internet connection^)
        call :download_python
        if exist "%SCRIPT_DIR%python\python.exe" (
            echo        Portable Python downloaded [OK]
            set "PYTHON_CMD=%SCRIPT_DIR%python\python.exe"
            set "PYTHON_FOUND=1"
        ) else (
            echo        [!] Python not found and download failed
            echo.
            echo        Python detection tried:
            echo        - 'python' command
            echo        - 'python3' command  
            echo        - 'py' launcher
            echo        - Common installation paths
            echo        - Microsoft Store location
            echo        - Portable Python in folder
            echo.
            echo        Diagnostic: Testing Python commands...
            python --version 2>&1 || echo          'python' command: NOT FOUND
            python3 --version 2>&1 || echo          'python3' command: NOT FOUND
            py --version 2>&1 || echo          'py' launcher: NOT FOUND
            echo.
            echo        Solutions:
            echo        1. Install Python from: https://www.python.org/downloads/
            echo           ^(Make sure to check "Add Python to PATH"^)
            echo        2. Add Python to your system PATH manually
            echo        3. Place portable Python in: %SCRIPT_DIR%python\
            echo        4. If Python IS installed, try running manually:
            echo           python josm-helper.py
            echo           ^(This will show the actual error^)
            echo.
        )
    )
)

echo  [1/4] Auto-detecting JOSM...
echo.

tasklist /FI "IMAGENAME eq JOSM.exe" 2>NUL | find /I "JOSM.exe" >NUL
if %ERRORLEVEL% EQU 0 (
    echo        JOSM is already running [OK]
    set "JOSM_PATH=RUNNING"
    goto check_helper
)

:: Check common JOSM locations
set "JOSM_CHECK=%USERPROFILE%\AppData\Local\JOSM\JOSM.exe"
if exist "%JOSM_CHECK%" set "JOSM_PATH=%JOSM_CHECK%"

if not defined JOSM_PATH (
    set "JOSM_CHECK=C:\Program Files\JOSM\josm.exe"
    if exist "%JOSM_CHECK%" set "JOSM_PATH=%JOSM_CHECK%"
)

if not defined JOSM_PATH (
    set "JOSM_CHECK=%USERPROFILE%\AppData\Local\JOSM\josm.exe"
    if exist "%JOSM_CHECK%" set "JOSM_PATH=%JOSM_CHECK%"
)

if not defined JOSM_PATH (
    set "JOSM_CHECK=%USERPROFILE%\Downloads\josm-tested.jar"
    if exist "%JOSM_CHECK%" set "JOSM_PATH=%JOSM_CHECK%"
)

if defined JOSM_PATH (
    echo        Found JOSM at: %JOSM_PATH%
    echo %JOSM_PATH% | find /I ".jar" >NUL
    if %ERRORLEVEL% EQU 0 (
        :: Check for Java before starting JAR
        where java >NUL 2>&1
        if %ERRORLEVEL% EQU 0 (
            echo        Starting JOSM...
            start "" javaw -jar "%JOSM_PATH%"
            timeout /t 5 /nobreak >NUL
            echo        JOSM started [OK]
        ) else (
            echo        [!] Java not found. Cannot start JOSM JAR file.
            echo        Please install Java from: https://www.java.com/download/
        )
    ) else (
        echo        Starting JOSM...
        start "" "%JOSM_PATH%"
        timeout /t 5 /nobreak >NUL
        echo        JOSM started [OK]
    )
) else (
    echo        JOSM not found. Checking for Java...
    where java >NUL 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo        Java found. Downloading JOSM...
        call :download_josm
        if exist "%SCRIPT_DIR%josm-tested.jar" (
            set "JOSM_PATH=%SCRIPT_DIR%josm-tested.jar"
            echo        JOSM downloaded [OK]
            echo        Starting JOSM...
            start "" javaw -jar "%JOSM_PATH%"
            timeout /t 5 /nobreak >NUL
            echo        JOSM started [OK]
        ) else (
            echo        [!] Failed to download JOSM
            echo        Please download manually from: https://josm.openstreetmap.de/
            echo        Or install Java and try again.
        )
    ) else (
        echo        [!] Java not found. JOSM requires Java.
        echo        Please install Java from: https://www.java.com/download/
        echo        Then run this script again to auto-download JOSM.
    )
)

:check_helper
echo.
echo  [2/4] Checking JOSM Helper...
echo.

netstat -ano 2>NUL | findstr ":%HELPER_PORT% " | findstr "LISTENING" >NUL
if %ERRORLEVEL% EQU 0 (
    echo        JOSM Helper port is in use, verifying it's responding...
    powershell -NoProfile -NonInteractive -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:%HELPER_PORT%/ping' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop; if ($response.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >NUL 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo        JOSM Helper already running and verified [OK]
        set "HELPER_VERIFIED=1"
        goto open_browser
    ) else (
        echo        [!] Port %HELPER_PORT% is in use but helper is not responding
        echo        The port may be used by another application
        echo        Helper will try to start anyway...
    )
)

if exist "%SCRIPT_DIR%josm-helper.py" (
    echo        josm-helper.py found [OK]
    goto start_helper
)

echo        josm-helper.py not found. Creating...
:: Try copying from backup first (if sharing files together)
if exist "%SCRIPT_DIR%josm-helper.py.backup" (
    copy "%SCRIPT_DIR%josm-helper.py.backup" "%SCRIPT_DIR%josm-helper.py" >NUL 2>&1
    if exist "%SCRIPT_DIR%josm-helper.py" (
        echo        Created from backup [OK]
        goto start_helper
    )
)
:: Try downloading from GitHub
echo        Downloading from GitHub...
powershell -NoProfile -NonInteractive -InputFormat None -Command "try { Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/mirza-syazwan/OSMAGIC_Experiment-1-v5_Edit-functions/main/josm-helper.py' -OutFile '%SCRIPT_DIR%josm-helper.py' -ErrorAction Stop; exit 0 } catch { exit 1 }" <NUL >NUL 2>&1
if exist "%SCRIPT_DIR%josm-helper.py" (
    echo        Downloaded from GitHub [OK]
) else (
    echo        [!] Failed to get josm-helper.py
    echo        The helper file is embedded in this batch file.
    echo        If download fails, make sure you have internet access.
    echo        Or include josm-helper.py.backup in the same folder.
    pause
    exit /b 1
)

:start_helper
if %PYTHON_FOUND% EQU 0 (
    echo        [!] Python not available. Helper cannot start.
    echo        Please install Python or the helper will not work.
    goto open_browser
)

:: Verify Python can actually run (quick syntax check)
if exist "%SCRIPT_DIR%josm-helper.py" (
    echo        Verifying Python can run the helper script...
    if defined PYTHON_CMD (
        "%PYTHON_CMD%" -m py_compile "%SCRIPT_DIR%josm-helper.py" >NUL 2>&1
    ) else (
        python -m py_compile "%SCRIPT_DIR%josm-helper.py" >NUL 2>&1
    )
    if %ERRORLEVEL% NEQ 0 (
        echo        [!] WARNING: Python script has syntax errors
        echo        The helper may not start correctly
        echo        Check josm-helper.py for errors
    )
) else (
    echo        [!] ERROR: josm-helper.py not found!
    echo        Cannot start helper without this file.
    goto open_browser
)

echo        Starting JOSM Helper...
echo        (A new window will open - keep it open to see any errors)
if defined PYTHON_CMD (
    echo        Using Python: %PYTHON_CMD%
    start "JOSM Helper" cmd /k "cd /d %SCRIPT_DIR% && echo Starting JOSM Helper... && echo Using: %PYTHON_CMD% && \"%PYTHON_CMD%\" josm-helper.py"
) else (
    echo        Using Python: python
    start "JOSM Helper" cmd /k "cd /d %SCRIPT_DIR% && echo Starting JOSM Helper... && echo Using: python && python josm-helper.py"
)
echo        Waiting for helper to start...
timeout /t 3 /nobreak >NUL

:: Verify helper is actually running by checking port
echo        Verifying helper is running...
set "HELPER_VERIFIED=0"
for /L %%i in (1,1,5) do (
    netstat -ano 2>NUL | findstr ":%HELPER_PORT% " | findstr "LISTENING" >NUL
    if %ERRORLEVEL% EQU 0 (
        :: Port is listening, now verify it responds
        powershell -NoProfile -NonInteractive -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:%HELPER_PORT%/ping' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop; if ($response.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >NUL 2>&1
        if %ERRORLEVEL% EQU 0 (
            set "HELPER_VERIFIED=1"
            goto helper_verified
        )
    )
    timeout /t 1 /nobreak >NUL
)

:helper_verified
if %HELPER_VERIFIED% EQU 1 (
    echo        JOSM Helper started and verified [OK]
) else (
    echo        [!] WARNING: JOSM Helper may not have started correctly
    echo        Check the "JOSM Helper" window for errors
    echo        You can test it by opening: http://localhost:%HELPER_PORT%/ping
    echo        If it shows an error, the helper is not running properly.
    echo.
    echo        Common issues:
    echo        - Python not found or not in PATH
    echo        - Port 8001 already in use
    echo        - Missing dependencies in Python
    echo        - josm-helper.py file has errors
    echo.
)

:open_browser
echo.
echo  [3/4] Opening OSMAGIC...
start "" "%GITHUB_PAGES_URL%"
echo        Browser opened [OK]

echo.
echo  [4/4] Status Summary
echo.
echo  ==========================================
echo    OSMAGIC Ready!
echo  ==========================================
echo    Online:  %GITHUB_PAGES_URL%
if %HELPER_VERIFIED% EQU 1 (
    echo    Helper:  Running ^(port %HELPER_PORT%^)
) else (
    echo    Helper:  NOT VERIFIED - Check "JOSM Helper" window
    echo            Test: http://localhost:%HELPER_PORT%/ping
)
if defined JOSM_PATH (
    echo    JOSM:    Running
) else (
    echo    JOSM:    Not found
)
echo  ==========================================
if %HELPER_VERIFIED% EQU 0 (
    echo.
    echo    [!] IMPORTANT: Helper verification failed!
    echo    Export to JOSM will download files instead of direct transfer.
    echo    Please check the "JOSM Helper" window for error messages.
    echo.
    echo    For troubleshooting help, see: TROUBLESHOOTING_HELPER.md
    echo    Or test manually: http://localhost:%HELPER_PORT%/ping
    echo.
)
echo.
pause
exit /b 0

:: Function to download portable Python
:download_python
echo        Downloading Python embeddable package...
set "PYTHON_ZIP=%SCRIPT_DIR%python-embed.zip"
set "PYTHON_URL=https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip"

powershell -NoProfile -NonInteractive -InputFormat None -Command "try { Invoke-WebRequest -Uri '%PYTHON_URL%' -OutFile '%PYTHON_ZIP%' -ErrorAction Stop; exit 0 } catch { exit 1 }" <NUL >NUL 2>&1

if exist "%PYTHON_ZIP%" (
    echo        Extracting Python...
    powershell -NoProfile -NonInteractive -InputFormat None -Command "try { Expand-Archive -Path '%PYTHON_ZIP%' -DestinationPath '%SCRIPT_DIR%python' -Force; Remove-Item '%PYTHON_ZIP%'; exit 0 } catch { exit 1 }" <NUL >NUL 2>&1
    
    :: Enable pip by uncommenting import in python311._pth
    if exist "%SCRIPT_DIR%python\python311._pth" (
        powershell -NoProfile -NonInteractive -Command "(Get-Content '%SCRIPT_DIR%python\python311._pth') -replace '#import site', 'import site' | Set-Content '%SCRIPT_DIR%python\python311._pth'" <NUL >NUL 2>&1
    )
    
    if exist "%SCRIPT_DIR%python\python.exe" (
        exit /b 0
    )
)
exit /b 1

:: Function to download JOSM
:download_josm
echo        Downloading JOSM JAR file...
set "JOSM_URL=https://josm.openstreetmap.de/download/josm-tested.jar"
set "JOSM_FILE=%SCRIPT_DIR%josm-tested.jar"

powershell -NoProfile -NonInteractive -InputFormat None -Command "try { Invoke-WebRequest -Uri '%JOSM_URL%' -OutFile '%JOSM_FILE%' -ErrorAction Stop; exit 0 } catch { exit 1 }" <NUL >NUL 2>&1

if exist "%JOSM_FILE%" (
    exit /b 0
)
exit /b 1

:: Function to create josm-helper.py from embedded content
:create_helper_file
:: Create a temporary PowerShell script that writes the Python file
set "TEMP_PS=%TEMP%\create_josm_helper.ps1"
(
echo $content = @'
#!/usr/bin/env python3
"""
JOSM Helper - Minimal local server for JOSM integration
Works with OSMAGIC hosted on GitHub Pages

This helper runs locally and handles:
- Saving OSM files for JOSM to load
- Focusing JOSM window
- CORS for cross-origin requests from GitHub Pages

Run this when you want to use the "Export to JOSM" feature.
"""

import http.server
import socketserver
import os
import json
from datetime import datetime
import shutil
import ctypes
from ctypes import wintypes

# Configuration
HELPER_PORT = 8001  # Different from main server
EXPORT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'exports')

# Create exports directory
if not os.path.exists(EXPORT_DIR):
    os.makedirs(EXPORT_DIR)

def focus_josm_window():
    """Find and bring JOSM window to foreground using Windows API"""
    try:
        user32 = ctypes.windll.user32
        WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        
        josm_hwnd = None
        
        def enum_windows_callback(hwnd, lparam):
            nonlocal josm_hwnd
            length = user32.GetWindowTextLengthW(hwnd)
            if length > 0:
                buffer = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buffer, length + 1)
                title = buffer.value.lower()
                
                if 'josm' in title or 'java openstreetmap' in title:
                    if user32.IsWindowVisible(hwnd):
                        josm_hwnd = hwnd
                        return False
            return True
        
        user32.EnumWindows(WNDENUMPROC(enum_windows_callback), 0)
        
        if josm_hwnd:
            SW_RESTORE = 9
            user32.ShowWindow(josm_hwnd, SW_RESTORE)
            user32.SetForegroundWindow(josm_hwnd)
            user32.BringWindowToTop(josm_hwnd)
            
            try:
                current_thread = ctypes.windll.kernel32.GetCurrentThreadId()
                foreground_thread = user32.GetWindowThreadProcessId(user32.GetForegroundWindow(), None)
                if current_thread != foreground_thread:
                    user32.AttachThreadInput(current_thread, foreground_thread, True)
                    user32.SetForegroundWindow(josm_hwnd)
                    user32.AttachThreadInput(current_thread, foreground_thread, False)
            except:
                pass
            
            return True
        return False
    except Exception as e:
        print(f"Error focusing JOSM: {e}")
        return False


class JOSMHelperHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        timestamp = datetime.now().strftime('%%H:%%M:%%S')
        print(f"[{timestamp}] {args[0]}")
    
    def send_cors_headers(self):
        # Allow requests from any origin (GitHub Pages, localhost, etc.)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache')
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()
    
    def do_GET(self):
        if self.path == '/ping':
            # Health check endpoint
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({
                'status': 'ok',
                'service': 'josm-helper',
                'port': HELPER_PORT
            }).encode())
        
        elif self.path == '/focus-josm':
            success = focus_josm_window()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': success,
                'message': 'JOSM focused' if success else 'JOSM window not found'
            }).encode())
            if success:
                print("  -^> JOSM window focused")
            else:
                print("  -^> JOSM window not found")
        
        elif self.path.startswith('/exports/'):
            # Serve exported OSM files
            filename = self.path[9:]
            filepath = os.path.join(EXPORT_DIR, filename)
            
            if os.path.exists(filepath) and os.path.isfile(filepath):
                self.send_response(200)
                self.send_header('Content-Type', 'application/xml')
                self.send_cors_headers()
                self.end_headers()
                with open(filepath, 'rb') as f:
                    shutil.copyfileobj(f, self.wfile)
            else:
                self.send_response(404)
                self.send_cors_headers()
                self.end_headers()
        
        else:
            self.send_response(404)
            self.send_cors_headers()
            self.end_headers()
    
    def do_POST(self):
        if self.path == '/export':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                
                sequence_id = data.get('sequenceId', 'unknown')
                osm_xml = data.get('osmXml', '')
                
                if not osm_xml:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.send_cors_headers()
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': 'No OSM XML provided'}).encode())
                    return
                
                filename = f'sequence_{sequence_id}.osm'
                filepath = os.path.join(EXPORT_DIR, filename)
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(osm_xml)
                
                file_url = f'http://localhost:{HELPER_PORT}/exports/{filename}'
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': True,
                    'url': file_url,
                    'filename': filename
                }).encode())
                
                print(f"  -^> Saved: {filename}")
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        else:
            self.send_response(404)
            self.send_cors_headers()
            self.end_headers()


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    print()
    print("=" * 50)
    print("  JOSM Helper - OSMAGIC Integration")
    print("=" * 50)
    print()
    print(f"  Helper running on: http://localhost:{HELPER_PORT}")
    print(f"  Export directory:  {EXPORT_DIR}")
    print()
    print("  This helper enables 'Export to JOSM' from")
    print("  GitHub Pages or any hosted version of OSMAGIC.")
    print()
    print("  Press Ctrl+C to stop")
    print("=" * 50)
    print()
    
    with socketserver.TCPServer(("", HELPER_PORT), JOSMHelperHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nJOSM Helper stopped.")


if __name__ == "__main__":
    main()
'@
$content | Out-File -FilePath '%SCRIPT_DIR%josm-helper.py' -Encoding UTF8
) > "%TEMP_PS%"
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%TEMP_PS%" <NUL >NUL 2>&1
del "%TEMP_PS%" >NUL 2>&1
exit /b
