@echo off
title OSMAGIC Launcher
color 0A

echo.
echo  ============================================
echo       OSMAGIC GPS Trace Editor Launcher
echo  ============================================
echo.

:: Configuration - Update these paths if needed
set "JOSM_PATH=C:\Program Files\JOSM\josm.exe"
set "JOSM_PATH_ALT=C:\Program Files (x86)\JOSM\josm.exe"
set "JOSM_JAR=%USERPROFILE%\Downloads\josm.jar"
set "SERVER_PORT=8000"
set "APP_URL=http://localhost:%SERVER_PORT%"

:: Check if JOSM is already running
echo  [1/4] Checking if JOSM is running...
tasklist /FI "IMAGENAME eq josm.exe" 2>NUL | find /I /N "josm.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo        JOSM is already running. [OK]
    goto :start_server
)

:: Also check for java-based JOSM (window title)
for /f "tokens=2" %%i in ('tasklist /v /fi "imagename eq java.exe" ^| findstr /i "JOSM"') do (
    echo        JOSM is already running. [OK]
    goto :start_server
)

:: Try to start JOSM
echo  [2/4] Starting JOSM...

:: Try installed JOSM first
if exist "%JOSM_PATH%" (
    echo        Found JOSM at: %JOSM_PATH%
    start "" "%JOSM_PATH%"
    goto :josm_started
)

if exist "%JOSM_PATH_ALT%" (
    echo        Found JOSM at: %JOSM_PATH_ALT%
    start "" "%JOSM_PATH_ALT%"
    goto :josm_started
)

:: Try josm.jar in Downloads
if exist "%JOSM_JAR%" (
    echo        Found JOSM JAR at: %JOSM_JAR%
    start "" javaw -jar "%JOSM_JAR%"
    goto :josm_started
)

:: JOSM not found - prompt user
echo.
echo  [!] JOSM not found at default locations:
echo        - %JOSM_PATH%
echo        - %JOSM_PATH_ALT%
echo        - %JOSM_JAR%
echo.
set /p JOSM_CUSTOM="  Enter JOSM path (or press Enter to skip): "
if not "%JOSM_CUSTOM%"=="" (
    if exist "%JOSM_CUSTOM%" (
        start "" "%JOSM_CUSTOM%"
        goto :josm_started
    ) else (
        echo        Path not found. Continuing without JOSM...
    )
) else (
    echo        Skipping JOSM launch...
)
goto :start_server

:josm_started
echo        JOSM started successfully. [OK]
echo        Waiting 3 seconds for JOSM to initialize...
timeout /t 3 /nobreak >NUL

:start_server
:: Start Python server
echo  [3/4] Starting OSMAGIC server...

:: Change to script directory
cd /d "%~dp0"

:: Check if server is already running on the port
powershell -Command "try { (New-Object Net.Sockets.TcpClient).Connect('localhost', %SERVER_PORT%); exit 0 } catch { exit 1 }" 2>NUL
if "%ERRORLEVEL%"=="0" (
    echo        Server already running on port %SERVER_PORT%. [OK]
    goto :open_browser
)

:: Start server in background
start /B python server.py >NUL 2>&1
echo        Server starting on port %SERVER_PORT%... [OK]
timeout /t 2 /nobreak >NUL

:open_browser
:: Open browser
echo  [4/4] Opening OSMAGIC in browser...
start "" "%APP_URL%"
echo        Browser opened. [OK]

echo.
echo  ============================================
echo       OSMAGIC is ready!
echo  ============================================
echo.
echo   JOSM:    Check if running
echo   Server:  %APP_URL%
echo   Browser: Opened
echo.
echo  TIP: Make sure JOSM Remote Control is enabled
echo       (Edit ^> Preferences ^> Remote Control)
echo.
echo  Press any key to close this launcher...
echo  (Server will continue running in background)
echo.
pause >NUL
