# OSMAGIC GPS Trace Editor

A modern, web-based GPS trace editor for OpenStreetMap that converts GPS traces (GeoJSON, GPX, CSV) to OSM format with seamless JOSM integration.

## 🌐 Live Version

**Access OSMAGIC online:** https://mirza-syazwan.github.io/OSMAGIC_Experiment-1-v5_Edit-functions/

No installation needed - just open in your browser and start editing!

## 🚀 Quick Start

### Option 1: Desktop Shortcut (Recommended - Full Features)

1. **Double-click the `OSMAGIC` shortcut on your desktop**
   - Automatically starts JOSM (if installed)
   - Starts JOSM Helper for direct export
   - Opens the app in your browser

2. **That's it!** Everything is ready to use.

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
- **Python 3.x** (for JOSM Helper)
- **JOSM** (latest version recommended)
- **Windows** (for desktop shortcut - Mac/Linux users can use online version)

### For Online Use Only:
- **Modern web browser** (Chrome, Firefox, Edge, Safari)
- **No installation needed!**

## 🔧 Setup for JOSM Integration

### Step 1: Install JOSM

Download and install JOSM from: https://josm.openstreetmap.de/

**Common installation locations:**
- `C:\Program Files\JOSM\`
- `C:\Program Files (x86)\JOSM\`
- `%USERPROFILE%\AppData\Local\JOSM\`
- Or download `josm-tested.jar` to your Downloads folder

### Step 2: Enable JOSM Remote Control

1. **Open JOSM**
2. **Go to:** Edit → Preferences → Remote Control
3. **Enable:**
   - ✅ "Enable remote control"
   - ✅ "Import data from URL" (if available)
4. **Port:** Keep default (8111) unless you have conflicts
5. **Click OK**

### Step 3: Test Connection

Open in browser: `http://localhost:8111/version`

You should see JOSM version information. If not:
- Make sure JOSM is running
- Check Remote Control is enabled
- Verify port 8111 isn't blocked

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

1. **Download these files:**
   - `START-OSMAGIC.bat`
   - `josm-helper.py` (or let the batch file download it automatically)

2. **Requirements on the other computer:**
   - Python 3.x installed
   - JOSM installed (optional - app works without it)
   - Windows OS (for batch file)

3. **Run:**
   - Double-click `START-OSMAGIC.bat`
   - It will auto-detect JOSM, download helper if needed, and open the app

**Or use online version:**
- Just open: https://mirza-syazwan.github.io/OSMAGIC_Experiment-1-v5_Edit-functions/
- No setup needed!

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

1. **Check JOSM is running**
2. **Verify Remote Control is enabled** (Edit → Preferences → Remote Control)
3. **Test connection:** Open `http://localhost:8111/version`
4. **Check JOSM Helper:** Should be running on port 8001
5. **Try manual export:** Download file and open in JOSM

### Helper Not Starting

1. **Check Python is installed:** `python --version`
2. **Verify josm-helper.py exists** (or let batch file download it)
3. **Check port 8001 is free:** `netstat -ano | findstr :8001`
4. **Run helper manually:** `python josm-helper.py`

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
