# OSMAGIC Task Manager

A task manager to convert GPS traces (GeoJSON, GPX, CSV) to JOSM format with automatic transfer to JOSM.

## Quick Start

### Option 1: Run the Server (Recommended)

1. **Double-click `start-server.bat`** (Windows)
   - OR run: `python server.py` in terminal

2. **Open your browser and go to:**
   ```
   http://localhost:8000
   ```

3. Upload your GPS trace file and start managing tasks!

### Option 2: Open Directly

Just double-click `index.html` to open it in your browser (no server needed).
**Note:** Automatic JOSM transfer requires the server to be running.

## Features

- ✅ Upload GPS traces (GeoJSON, GPX, CSV formats)
- ✅ Identify sequences by sequence_id
- ✅ View tasks by status (All, Active, Done, Skipped)
- ✅ Status management (Active, Skipped, Done)
- ✅ Convert to JOSM format (.osm files)
- ✅ **Automatic transfer to JOSM** (requires JOSM Remote Control enabled)
- ✅ Interactive map preview with geometry editing
- ✅ Local storage persistence (IndexedDB)

## Requirements

- Python 3.x (for server and automatic JOSM transfer)
- **JOSM version 19439 or later** (for automatic transfer feature)
- Modern web browser

## JOSM Setup (for Automatic Transfer)

### Step 1: Install/Update JOSM

- Ensure you have **JOSM version 19439 or later**
- Download from: https://josm.openstreetmap.de/
- Check your version: Help → About JOSM

### Step 2: Enable Remote Control

1. **Open JOSM**

2. **Access Preferences:**
   - **Windows/Linux:** Edit → Preferences (or press `Ctrl+,`)
   - **Mac:** JOSM → Preferences (or press `Cmd+,`)

3. **Navigate to Remote Control:**
   - In the Preferences window, click on **"Remote Control"** in the left sidebar
   - If you don't see it, make sure you're using JOSM version 19439 or later

4. **Enable Remote Control:**
   - Check the box **"Enable remote control"**
   - Check the box **"Import data from URL"** (if available)
   - The default port should be **8111** (keep this unless you have conflicts)
   - Click **"OK"** to save

5. **Keep JOSM Running:**
   - JOSM must be running while using the app
   - The Remote Control server starts automatically when enabled

### Step 3: Test Connection

- Open `http://localhost:8111/version` in your browser
- You should see JOSM version information (JSON format)
- If you see an error, make sure:
  - JOSM is running
  - Remote Control is enabled
  - Port 8111 is not blocked by firewall

## Usage

1. **Start the server:** Double-click `start-server.bat` or run `python server.py`
2. **Open the app:** Go to `http://localhost:8000` in your browser
3. **Upload data:** Click "Choose GeoJSON File" and select your GPS trace file
4. **Navigate tasks:** Use the tabs (All, Active, Done, Skipped) to view tasks
5. **Edit geometry:** Click "Preview" to edit GPS traces on an interactive map
6. **Export to JOSM:** Click "Export to JOSM" - data will automatically transfer to JOSM!

## Automatic JOSM Transfer

When you click "Export to JOSM":
1. The OSM file is uploaded to the server
2. Server makes it available at `http://localhost:8000/exports/sequence_XXX.osm`
3. JOSM's import endpoint is called with the file URL
4. JOSM automatically loads the data - **no manual navigation needed!**

If automatic transfer fails, the file will be downloaded as a backup.

## Notes

- Exported OSM files are stored in the `exports/` directory
- All data is saved to browser's IndexedDB (larger storage capacity than localStorage)
- No internet connection required (everything runs locally)

