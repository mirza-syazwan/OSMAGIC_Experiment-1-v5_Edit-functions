@echo off
echo ==========================================
echo   Test JOSM Imagery Addition
echo ==========================================
echo.

echo Testing JOSM Remote Control...
powershell -NoProfile -NonInteractive -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:8111/version' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop; Write-Host 'JOSM Remote Control: OK'; Write-Host $r.Content } catch { Write-Host 'ERROR: JOSM Remote Control not available'; Write-Host 'Make sure JOSM is running and Remote Control is enabled'; exit 1 }" 2>&1

if %ERRORLEVEL% NEQ 0 (
    pause
    exit /b 1
)

echo.
echo Testing imagery IDs...
echo.

powershell -NoProfile -NonInteractive -Command "$imageryIds = @('standard', 'Standard', 'OpenStreetMap', 'osm', 'osm-carto', 'OpenStreetMap Carto (Standard)', 'Bing', 'bing', 'Mapnik', 'mapnik'); foreach ($id in $imageryIds) { Write-Host ('Testing: ' + $id); try { $escapedId = [uri]::EscapeDataString($id); $uri = 'http://localhost:8111/imagery?id=' + $escapedId; $response = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop; if ($response.StatusCode -eq 200) { Write-Host ('  -> SUCCESS: ' + $id + ' [OK]') -ForegroundColor Green; break } } catch { Write-Host ('  -> Failed: ' + $_.Exception.Message) -ForegroundColor Yellow } }" 2>&1

echo.
echo ==========================================
echo   Test Complete
echo ==========================================
echo.
echo If none worked, check JOSM Imagery menu to see
echo what imagery layers are actually available.
echo.
pause
