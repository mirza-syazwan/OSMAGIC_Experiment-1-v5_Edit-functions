# OSMAGIC GPS Trace Editor

A modern, web-based GPS trace editor for OpenStreetMap that converts GPS traces (GeoJSON, GPX, CSV) to OSM format with seamless JOSM integration.

## 🌐 Live Version

**Access OSMAGIC online:** https://mirza-syazwan.github.io/OSMAGIC_Experiment-1-v5_Edit-functions/

No installation needed - just open in your browser and start editing!

## 📋 Prerequisites

Before using OSMAGIC with full features, you need to install the following:

### Required Software

1. **Java Runtime Environment (JRE)**
   - **Download:** https://www.java.com/download/
   - **Why:** Required to run JOSM
   - **Installation:** Run the installer and follow the prompts
   - **Verify:** Open Command Prompt and type `java -version`

2. **Python 3.x** (Required for JOSM Helper)
   - **Download:** https://www.python.org/downloads/
   - **Why:** Required to run the JOSM Helper tool (enables direct export to JOSM)
   - **Installation:** 
     - ✅ Check "Add Python to PATH" during installation
     - ✅ Choose "Install for all users" (optional)
   - **Verify:** Open Command Prompt and type `python --version`
   - **Note:** The batch file can auto-download portable Python if system Python is not found, but manual installation is recommended

3. **JOSM** (Required for editing OSM data)
   - **Download:** https://josm.openstreetmap.de/
   - **Why:** For editing OpenStreetMap data and receiving exports from OSMAGIC
   - **Installation Options:**
     - **Windows Installer (Recommended):** Download `josm-setup.exe` for full installation
     - **Portable JAR:** Download `josm-tested.jar` (no installation needed, but requires Java)
   - **Note:** The batch file can auto-download JOSM JAR if Java is installed, but manual installation is recommended
   - **After Installation:** You must enable Remote Control (see setup steps below)

### Quick Installation Guide

**For Windows users (recommended order):**

1. **Install Java first:**
   ```
   → Visit: https://www.java.com/download/
   → Download Java Runtime Environment
   → Run installer
   → Restart computer if prompted
   ```

2. **Install Python:**
   ```
   → Visit: https://www.python.org/downloads/
   → Download Python 3.11 or newer
   → Run installer
   → ✅ IMPORTANT: Check "Add Python to PATH"
   → Click "Install Now"
   ```

3. **Install JOSM (or let batch file download it):**
   ```
   Option A - Full Installation:
   → Visit: https://josm.openstreetmap.de/
   → Download Windows installer
   → Run installer
   
   Option B - Portable (Recommended):
   → Let START-OSMAGIC.bat download it automatically
   → Or download josm-tested.jar manually
   ```

### Verification

After installation, verify everything works:

```bash
# Check Java
java -version
# Should show: java version "X.X.X"

# Check Python
python --version
# Should show: Python 3.X.X

# Check JOSM (if installed)
# Open JOSM and go to Help → About
```

**Note:** If you don't want to install these manually, the `START-OSMAGIC.bat` file can automatically download Python (portable) and JOSM (JAR) for you. However, **Java must be installed manually** as it's required by the operating system.

## 🚀 Quick Start

### Option 1: Desktop Shortcut (Recommended - Full Features)

1. **Install prerequisites** (see above)
   - ✅ **Java** (required - must be installed manually)
   - ✅ **Python** (required for JOSM Helper - recommended to install manually)
   - ✅ **JOSM** (required for editing - recommended to install manually)

2. **Enable JOSM Remote Control** (required for direct export)
   - Open JOSM → `Edit` → `Preferences` → `Remote Control`
   - ✅ Check "Enable remote control"
   - ✅ Check "Import data from URL" (if available)
   - Click OK

3. **Double-click `START-OSMAGIC.bat`**
   - Automatically detects installed software
   - Starts JOSM (if installed)
   - Starts JOSM Helper (requires Python)
   - Adds OpenStreetMap Carto imagery layer automatically
   - Opens the app in your browser

4. **That's it!** Everything is ready to use.

### Option 2: Online Only (No Setup)

1. **Open in browser:**
   ```
   https://mirza-syazwan.github.io/OSMAGIC_Experiment-1-v5_Edit-functions/
   ```

2. **Upload GPS traces and start editing!**
   - Export will download files (open manually in JOSM)
   - For direct export to JOSM, use Option 1

### Option 3: Local Development

1. **Start the server:**
   ```bash
   python server.py
   ```

2. **Open:** `http://localhost:8000`

## ✨ Features

### Core Features
- ✅ **Upload GPS traces** (GeoJSON, GPX, CSV formats)
- ✅ **Sequence management** - Organize by sequence_id
- ✅ **Status tracking** - All, Active, Done, Skipped
- ✅ **Interactive map editing** - Simplify geometry, split ways
- ✅ **Export to JOSM** - Direct transfer or file download
- ✅ **Local storage** - Data persists in browser (IndexedDB)
- ✅ **Theme toggle** - Light mode (Ocean Breeze) / Dark mode (Warm Mocha)

### Workflow Steps
1. **Preview** - Review GPS trace
2. **Edit** - Simplify geometry, adjust points
3. **Split** - Divide ways into segments
4. **Tag** - Set highway type and properties
5. **Export** - Send to JOSM or download

## 🖥️ System Requirements

### For Full Features (with JOSM integration):

**Required:**
- ✅ **Java Runtime Environment (JRE)** - Must be installed manually
- ✅ **Windows OS** - For `START-OSMAGIC.bat` (Mac/Linux users can use online version)

**Required for JOSM Integration:**
- ✅ **Python 3.x** - Required to run JOSM Helper tool (can be auto-downloaded as portable version if not found)
- ✅ **JOSM** - Required for editing OSM data (can be auto-downloaded as JAR file if Java is installed)

**Note:** The batch file will automatically download Python and JOSM if they're missing, but manual installation is recommended. After installing JOSM, you must enable Remote Control (see setup steps below).

### For Online Use Only:
- ✅ **Modern web browser** (Chrome, Firefox, Edge, Safari)
- ✅ **No installation needed!**
- ✅ **Works on any operating system**

## 🔧 Setup for JOSM Integration

### Step 1: Install Prerequisites

**Option A - Manual Installation (Recommended for first-time users):**

1. **Install Java:**
   - Download from: https://www.java.com/download/
   - Run installer and follow prompts

2. **Install Python:**
   - Download from: https://www.python.org/downloads/
   - ✅ Check "Add Python to PATH" during installation

3. **Install JOSM:**
   - Download from: https://josm.openstreetmap.de/
   - Choose Windows installer or portable JAR file

**Option B - Auto-Download (Easier for experienced users):**

1. **Install Java only** (required - cannot be auto-downloaded)
2. **Install Python** (required for JOSM Helper - can be auto-downloaded but manual install recommended)
3. **Run `START-OSMAGIC.bat`** - It will automatically:
   - Download portable Python if not found (but manual installation is better)
   - Download JOSM JAR if Java is installed (but manual installation is recommended)
   - Download `josm-helper.py` if missing
4. **After JOSM is installed:** Enable Remote Control (see Step 2 above)

**Common JOSM installation locations (if installed manually):**
- `C:\Program Files\JOSM\`
- `C:\Program Files (x86)\JOSM\`
- `%USERPROFILE%\AppData\Local\JOSM\`
- Or `josm-tested.jar` in the script directory (if auto-downloaded)

### Step 2: Enable JOSM Remote Control

**⚠️ IMPORTANT: This step is required for OSMAGIC to work with JOSM!**

Remote Control allows OSMAGIC to send data directly to JOSM. Without this enabled, you'll need to manually open exported files.

**Steps to enable:**

1. **Open JOSM** (if not already running)
2. **Go to:** `Edit` → `Preferences` → `Remote Control`
   - Or use keyboard shortcut: `Alt+E` → `P` → Click `Remote Control` in the left sidebar
3. **Enable Remote Control:**
   - ✅ Check the box: **"Enable remote control"**
   - ✅ Check the box: **"Import data from URL"** (if available)
4. **Port Settings:**
   - Keep the default port: **8111** (unless you have conflicts)
   - If port 8111 is already in use, change it and update OSMAGIC accordingly
5. **Click `OK`** to save settings

**Visual Guide:**
```
JOSM Menu → Edit → Preferences
    ↓
Left Sidebar → Click "Remote Control"
    ↓
Check "Enable remote control" ✅
Check "Import data from URL" ✅ (if available)
    ↓
Click OK
```

### Step 3: Test Connection

After enabling Remote Control, verify it's working:

1. **Make sure JOSM is running**
2. **Open in your browser:** `http://localhost:8111/version`
3. **Expected result:** You should see JSON output with JOSM version information

**If the test fails:**
- Make sure JOSM is running
- Verify Remote Control is enabled (go back to Step 2)
- Check that port 8111 isn't blocked by firewall
- Try restarting JOSM after enabling Remote Control

## 📖 Usage Guide

### Basic Workflow

1. **Upload GPS Traces**
   - Click "Drop files or click to browse"
   - Select GeoJSON, GPX, or CSV files
   - Files are automatically parsed and sequences identified

2. **Navigate Sequences**
   - Use "Previous" / "Next" buttons
   - Filter by status: All, Active, Done, Skipped
   - View statistics in sidebar

3. **Edit Sequence**
   - Click on a sequence card to open preview
   - **Step 1 (Preview):** Review the trace
   - **Step 2 (Edit):** Click "Start" → Simplify geometry, adjust points
   - **Step 3 (Split):** Click "Start" → Split ways at selected points
   - **Step 4 (Tag):** Click "Start" → Set highway type and properties

4. **Export to JOSM**
   - Click "Export to JOSM" button
   - **With Helper:** Data transfers directly, JOSM opens automatically
   - **Without Helper:** File downloads, open manually in JOSM

### Advanced Features

#### Theme Toggle
- Click the sun/moon icon in the header
- **Light Mode:** Ocean Breeze (soft blues)
- **Dark Mode:** Warm Mocha (cozy amber)

#### Map Editing
- **Edit Mode:** Click "Edit Mode" to modify geometry
- **Simplify:** Reduce points while preserving shape
- **Split Way:** Divide ways at selected nodes
- **Undo/Redo:** Full history support

#### Status Management
- Mark sequences as **Active**, **Done**, or **Skipped**
- Filter view by status
- Statistics update automatically

## 🌍 Using on Multiple Computers

### Sharing with Others

**To use OSMAGIC on another computer:**

1. **On the target computer, install prerequisites first:**
   - ✅ **Java** (required) - Download from https://www.java.com/download/
   - ⚠️ **Python** (optional) - Can be auto-downloaded by batch file
   - ⚠️ **JOSM** (optional) - Can be auto-downloaded by batch file

2. **Copy these files to the other computer:**
   - `START-OSMAGIC.bat` (required)
   - `josm-helper.py` (optional - will be auto-downloaded if missing)

3. **Run `START-OSMAGIC.bat`:**
   - Automatically detects installed software
   - Downloads Python (portable) if not found
   - Downloads JOSM (JAR) if Java is installed but JOSM is missing
   - Downloads `josm-helper.py` if missing
   - Starts everything and opens the app

**What gets auto-downloaded:**
- ✅ Python (portable version, no installation needed)
- ✅ JOSM JAR file (if Java is installed)
- ✅ `josm-helper.py` (if missing)

**What must be installed manually:**
- ⚠️ **Java** - Must be installed first (large installer, requires admin rights)

**Or use online version (no setup):**
- Just open: https://mirza-syazwan.github.io/OSMAGIC_Experiment-1-v5_Edit-functions/
- Works in any browser, no installation needed!
- Export will download files (open manually in JOSM)

## 🔄 Hybrid Architecture

OSMAGIC uses a **hybrid approach** for maximum flexibility:

| Component | Purpose | Required? |
|-----------|---------|-----------|
| **GitHub Pages** | Main app UI | ✅ Always |
| **JOSM Helper** | Direct export to JOSM | ⚠️ Optional |
| **JOSM** | OSM editing | ⚠️ Optional |

### How It Works

**Online Mode (No Helper):**
- App runs on GitHub Pages
- Export downloads `.osm` file
- Open file manually in JOSM

**Hybrid Mode (With Helper):**
- App runs on GitHub Pages
- Helper runs locally (port 8001)
- Export sends data directly to JOSM
- JOSM opens automatically

## 🛠️ Development

### Project Structure

```
OSMAGIC_Experiment-1-v5_Edit-functions/
├── index.html          # Main app HTML
├── app.js              # Application logic
├── styles.css          # Styling with theme support
├── storage.js          # IndexedDB storage
├── server.py           # Local development server
├── josm-helper.py      # JOSM integration helper
├── START-OSMAGIC.bat   # Desktop launcher
└── exports/            # Generated OSM files
```

### Running Locally

```bash
# Start development server
python server.py

# Access at http://localhost:8000
```

### Building for Production

The app is automatically deployed to GitHub Pages when you push to the `main` branch.

## 📝 Notes

- **Data Storage:** All sequences and edits are stored in browser's IndexedDB
- **Export Files:** OSM files are saved in `exports/` directory (local mode)
- **JOSM Remote Control:** Required for direct export (port 8111)
- **Browser Compatibility:** Works in all modern browsers
- **Offline Support:** App works offline after first load (PWA-ready)

## 🐛 Troubleshooting

### JOSM Export Not Working

1. **Check JOSM is installed and running**
   - If JOSM is not installed, download from: https://josm.openstreetmap.de/
   - Make sure JOSM is actually running (check taskbar/system tray)

2. **Verify Remote Control is enabled** 
   - Open JOSM → `Edit` → `Preferences` → `Remote Control`
   - ✅ Check "Enable remote control"
   - ✅ Check "Import data from URL" (if available)
   - Click OK and restart JOSM if needed

3. **Test connection:** Open `http://localhost:8111/version` in browser
   - Should show JOSM version JSON
   - If not, Remote Control is not enabled or JOSM is not running

4. **Check JOSM Helper:** Should be running on port 8001
   - Look for "JOSM Helper" window
   - Test: `http://localhost:8001/ping`

5. **Check Python is installed** (required for JOSM Helper)
   - Run `python --version` in Command Prompt
   - If not found, install from: https://www.python.org/downloads/

6. **Try manual export:** Download file and open in JOSM manually

### Helper Not Starting

1. **Check Python is installed:** `python --version`
   - **Python is required** to run the JOSM Helper tool
   - If not found, install Python manually from: https://www.python.org/downloads/
     - ✅ Make sure to check "Add Python to PATH" during installation
   - The batch file can auto-download portable Python, but manual installation is recommended
   - If auto-download fails, install Python manually

2. **Verify josm-helper.py exists** (or let batch file download it)
   - The batch file automatically downloads it from GitHub if missing
   - If download fails, check internet connection

3. **Check port 8001 is free:** `netstat -ano | findstr :8001`
   - If port is in use, close the application using it

4. **Run helper manually:** `python josm-helper.py` (or `python\python.exe josm-helper.py` if using portable Python)

### Auto-Download Issues

**Python download failed:**
- Check internet connection
- Try installing Python manually from https://www.python.org/downloads/
- Make sure you have write permissions in the script directory

**JOSM download failed:**
- Ensure Java is installed first (required for JOSM)
- Check internet connection
- Try downloading JOSM manually from https://josm.openstreetmap.de/
- Place `josm-tested.jar` in the same folder as `START-OSMAGIC.bat`

**Java not found:**
- Java must be installed manually (cannot be auto-downloaded)
- Download from: https://www.java.com/download/
- After installing Java, restart the batch file to auto-download JOSM

### Theme Not Changing

- Clear browser cache
- Hard refresh: `Ctrl+F5` (Windows) or `Cmd+Shift+R` (Mac)
- Check browser console for errors

## 📄 License

This project is open source. Feel free to use and modify as needed.

## 🙏 Credits

- Built with Leaflet.js for mapping
- Uses JOSM Remote Control API for integration
- Hosted on GitHub Pages

---

**Version:** 5.0  
**Last Updated:** January 2026
