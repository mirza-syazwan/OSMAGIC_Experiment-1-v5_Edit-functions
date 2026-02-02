==========================================
   OSMAGIC Standalone Package
   GPS Trace Editor for OpenStreetMap
==========================================

QUICK START
-----------

1. PREREQUISITES (Required):
   - Python 3.x installed (download from python.org)
   - JOSM installed with Remote Control enabled
     * Open JOSM → Edit → Preferences → Remote Control
     * Check "Enable remote control"
     * Check "Import data from URL" (if available)

2. SETUP:
   - Extract all files to a folder (keep them together!)
   - Make sure START-OSMAGIC.bat and josm-helper.py are in the same folder

3. RUN:
   - Double-click START-OSMAGIC.bat
   - The script will:
     * Start JOSM (if installed)
     * Start JOSM Helper (requires Python)
     * Add imagery layer automatically
     * Open OSMAGIC in your browser

4. USE:
   - Upload GPS traces (GeoJSON, GPX, CSV)
   - Edit and convert to OSM format
   - Export directly to JOSM (requires JOSM Helper running)

==========================================

FILES INCLUDED
---------------

- START-OSMAGIC.bat    Main launcher script
- josm-helper.py        Python helper for JOSM integration
- README.txt           This file

==========================================

TROUBLESHOOTING
---------------

Problem: "Python not found"
Solution: Install Python from python.org
          Make sure to check "Add Python to PATH" during installation

Problem: "JOSM not found"
Solution: Install JOSM from josm.openstreetmap.de
          Or start JOSM manually before running START-OSMAGIC.bat

Problem: "JOSM Remote Control not responding"
Solution: Open JOSM → Edit → Preferences → Remote Control
          Make sure "Enable remote control" is checked

Problem: "Port 8001 already in use"
Solution: Close any other JOSM Helper windows
          Wait a few seconds and try again

Problem: Imagery layer not added automatically
Solution: Add manually in JOSM: Imagery menu → Select imagery

==========================================

ONLINE VERSION
--------------

If you don't want to install anything, use the online version:
https://mirza-syazwan.github.io/OSMAGIC_Experiment-1-v5_Edit-functions/

(Note: Direct export to JOSM requires the JOSM Helper running locally)

==========================================

SUPPORT
-------

For issues or questions, check the main project README.md
or report issues on the project repository.

==========================================
