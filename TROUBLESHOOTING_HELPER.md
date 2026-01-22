# Troubleshooting JOSM Helper Issues

## When Sharing START-OSMAGIC.bat with Others

If the other user experiences issues where:
- ✅ App loads correctly
- ✅ JOSM opens
- ❌ Export downloads files instead of sending directly to JOSM
- ❌ `http://localhost:8001/ping` shows an error

## Quick Diagnosis Steps

### Step 1: Check if Helper Window Opened
When the batch file runs, look for a window titled **"JOSM Helper"**. This window should show:
```
==================================================
  JOSM Helper - OSMAGIC Integration
==================================================

  Helper running on: http://localhost:8001
  Export directory:  C:\...\exports

  This helper enables 'Export to JOSM' from
  GitHub Pages or any hosted version of OSMAGIC.

  Press Ctrl+C to stop
==================================================
```

**If this window is NOT visible or shows errors:**
- The helper failed to start
- Check the error message in that window

### Step 2: Test Helper Manually
Open a browser and go to: `http://localhost:8001/ping`

**Expected response:**
```json
{"status": "ok", "service": "josm-helper", "port": 8001}
```

**If you get an error:**
- Helper is not running
- See troubleshooting steps below

### Step 3: Check What the Batch File Says
Look at the batch file output. It should show:
```
[2/4] Checking JOSM Helper...

        JOSM Helper started and verified [OK]
```

**If it shows:**
```
[!] WARNING: JOSM Helper may not have started correctly
```
- The helper failed to start
- Check the "JOSM Helper" window for errors

## Common Issues and Solutions

### Issue 1: Python Not Found
**Symptoms:**
- Batch file says: `[!] Python not available. Helper cannot start.`
- Helper window doesn't open
- Diagnostic shows: `'python' command: NOT FOUND`

**Why this happens:**
Python might be installed but not in your system PATH. The batch file tries multiple detection methods:
1. `python` command
2. `python3` command
3. `py` launcher (Windows)
4. Common installation paths
5. Microsoft Store location
6. Portable Python in folder

**Solution:**
1. **Test if Python works manually:**
   - Open Command Prompt
   - Run: `python --version`
   - If it works, Python is installed but not detected by batch file
   - If it doesn't work, Python is not in PATH

2. **If Python works manually but batch file doesn't detect it:**
   - Add Python to PATH:
     - Search "Environment Variables" in Windows
     - Edit "Path" variable
     - Add Python installation folder (usually `C:\Users\YourName\AppData\Local\Programs\Python\Python3XX`)
     - Restart Command Prompt and try again

3. **If Python doesn't work at all:**
   - Install Python from: https://www.python.org/downloads/
   - ✅ **IMPORTANT:** Check "Add Python to PATH" during installation
   - Restart the batch file

4. **Alternative:** Let the batch file download portable Python (if it has internet access)

### Issue 2: Python Found But Helper Doesn't Start
**Symptoms:**
- Batch file says Python found
- Helper window opens but closes immediately
- Or helper window shows Python errors

**Check the Helper Window for:**
- `ModuleNotFoundError` → Missing Python dependencies
- `SyntaxError` → Corrupted josm-helper.py file
- `PermissionError` → Can't write to exports folder
- `Address already in use` → Port 8001 is taken

**Solutions:**
1. **Missing dependencies:** Usually not needed (helper uses only standard library)
2. **Corrupted file:** Re-download josm-helper.py from GitHub
3. **Permission error:** Run as administrator or change folder permissions
4. **Port in use:** Close other applications using port 8001

### Issue 3: Helper Starts But Doesn't Respond
**Symptoms:**
- Helper window shows it's running
- But `http://localhost:8001/ping` returns error
- Export still downloads files

**Possible causes:**
1. **Firewall blocking port 8001**
   - Solution: Allow Python through Windows Firewall
   - Or temporarily disable firewall to test

2. **Antivirus blocking**
   - Solution: Add exception for Python and josm-helper.py

3. **Port conflict**
   - Solution: Check what's using port 8001:
     ```cmd
     netstat -ano | findstr :8001
     ```
   - Close conflicting application

### Issue 4: Helper Works But Export Still Downloads
**Symptoms:**
- `http://localhost:8001/ping` works
- But export still downloads files

**Possible causes:**
1. **Browser cache**
   - Solution: Hard refresh (Ctrl+F5) or clear cache

2. **Helper not detected by app**
   - Solution: Check browser console (F12) for errors
   - Look for: `✅ Local JOSM helper detected`

3. **CORS issues**
   - Solution: Make sure helper is running on localhost:8001
   - Check helper window shows correct port

## Manual Helper Start (For Testing)

If the batch file doesn't work, try starting the helper manually:

1. **Open Command Prompt** in the project folder
2. **Run:**
   ```cmd
   python josm-helper.py
   ```
   OR if using portable Python:
   ```cmd
   python\python.exe josm-helper.py
   ```
3. **Check for errors** in the command window
4. **Test:** Open `http://localhost:8001/ping` in browser

## What Files Need to Be Shared?

When sharing START-OSMAGIC.bat, make sure to include:

**Required:**
- ✅ `START-OSMAGIC.bat` (the launcher)
- ✅ `josm-helper.py` (the helper script)

**Optional (will be auto-downloaded if missing):**
- `josm-helper.py.backup` (backup copy)
- `python\` folder (portable Python, if used)

**NOT needed (will be downloaded automatically):**
- JOSM (if Java is installed)
- Python (if not installed, batch file can download portable version)

## Verification Checklist

Before reporting issues, verify:

- [ ] Python is installed and in PATH (`python --version` works)
- [ ] `josm-helper.py` exists in the same folder as batch file
- [ ] Port 8001 is not blocked by firewall
- [ ] No other application is using port 8001
- [ ] Helper window opens and shows "Helper running on: http://localhost:8001"
- [ ] `http://localhost:8001/ping` returns JSON response
- [ ] Browser console (F12) shows helper detected message
- [ ] JOSM is running with Remote Control enabled

## Getting Help

If issues persist, provide:
1. Screenshot of the "JOSM Helper" window
2. Output from the batch file
3. Browser console errors (F12 → Console tab)
4. Result of `http://localhost:8001/ping` test
5. Python version (`python --version`)
6. Windows version
