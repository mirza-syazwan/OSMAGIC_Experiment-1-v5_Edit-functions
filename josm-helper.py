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

# Define FLASHWINFO structure for window flashing
class FLASHWINFO(ctypes.Structure):
    _fields_ = [
        ("cbSize", ctypes.c_uint),
        ("hwnd", wintypes.HWND),
        ("dwFlags", ctypes.c_uint),
        ("uCount", ctypes.c_uint),
        ("dwTimeout", ctypes.c_uint)
    ]

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
                
                # Match various JOSM window title patterns
                if ('josm' in title or 
                    'java openstreetmap' in title or 
                    'openstreetmap editor' in title or
                    title.startswith('josm')):
                    if user32.IsWindowVisible(hwnd):
                        josm_hwnd = hwnd
                        return False
            return True
        
        user32.EnumWindows(WNDENUMPROC(enum_windows_callback), 0)
        
        if josm_hwnd:
            SW_RESTORE = 9
            SW_SHOW = 5
            
            # First, restore if minimized
            user32.ShowWindow(josm_hwnd, SW_RESTORE)
            user32.ShowWindow(josm_hwnd, SW_SHOW)
            
            # Bring to foreground using multiple methods for reliability
            user32.BringWindowToTop(josm_hwnd)
            user32.SetForegroundWindow(josm_hwnd)
            user32.SetActiveWindow(josm_hwnd)
            
            # Use thread attachment trick for stubborn windows
            try:
                current_thread = ctypes.windll.kernel32.GetCurrentThreadId()
                foreground_thread = user32.GetWindowThreadProcessId(user32.GetForegroundWindow(), None)
                if current_thread != foreground_thread:
                    user32.AttachThreadInput(current_thread, foreground_thread, True)
                    user32.SetForegroundWindow(josm_hwnd)
                    user32.SetActiveWindow(josm_hwnd)
                    user32.AttachThreadInput(current_thread, foreground_thread, False)
            except:
                pass
            
            # Final attempt - flash window to get attention
            try:
                FLASHW_STOP = 0
                FLASHW_CAPTION = 1
                FLASHW_TRAY = 2
                FLASHW_ALL = 3
                FLASHW_TIMER = 4
                FLASHW_TIMERNOFG = 12
                
                # Flash the window briefly
                flashwinfo = FLASHWINFO()
                flashwinfo.cbSize = ctypes.sizeof(FLASHWINFO)
                flashwinfo.hwnd = josm_hwnd
                flashwinfo.dwFlags = FLASHW_ALL | FLASHW_TIMERNOFG
                flashwinfo.uCount = 1
                flashwinfo.dwTimeout = 100
                
                # Try to call FlashWindowEx (may not be available on all Windows versions)
                try:
                    user32.FlashWindowEx(ctypes.byref(flashwinfo))
                except AttributeError:
                    # FlashWindowEx not available, skip
                    pass
            except:
                pass
            
            return True
        return False
    except Exception as e:
        print(f"Error focusing JOSM: {e}")
        return False


class JOSMHelperHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        timestamp = datetime.now().strftime('%H:%M:%S')
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
        if self.path == '/' or self.path == '/ping':
            # Health check endpoint (support both / and /ping)
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
                print("  -> JOSM window focused")
            else:
                print("  -> JOSM window not found")
        
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
                
                print(f"  -> Saved: {filename}")
                
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
    httpd = None
    try:
        # Change to script directory first
        script_dir = os.path.dirname(os.path.abspath(__file__))
        os.chdir(script_dir)
        
        print()
        print("=" * 50)
        print("  JOSM Helper - OSMAGIC Integration")
        print("=" * 50)
        print()
        print(f"  Helper running on: http://localhost:{HELPER_PORT}")
        print(f"  Export directory:  {EXPORT_DIR}")
        print(f"  Script directory:  {script_dir}")
        print()
        print("  This helper enables 'Export to JOSM' from")
        print("  GitHub Pages or any hosted version of OSMAGIC.")
        print()
        print("  Press Ctrl+C to stop")
        print("=" * 50)
        print()
        
        # Ensure exports directory exists
        try:
            if not os.path.exists(EXPORT_DIR):
                os.makedirs(EXPORT_DIR)
                print(f"  Created exports directory: {EXPORT_DIR}")
        except Exception as e:
            print(f"  [!] Warning: Could not create exports directory: {e}")
        
        # Try to bind to the port with better error handling
        try:
            # Use allow_reuse_address to handle TIME_WAIT states
            socketserver.TCPServer.allow_reuse_address = True
            httpd = socketserver.TCPServer(("", HELPER_PORT), JOSMHelperHandler)
            print(f"  Server bound to port {HELPER_PORT} [OK]")
            print(f"  Listening for connections...")
            print(f"  Test: http://localhost:{HELPER_PORT}/ping")
            print()
            
            # Start serving - this blocks until interrupted
            httpd.serve_forever()
            
        except OSError as e:
            error_msg = str(e)
            if "Address already in use" in error_msg or "Only one usage of each socket address" in error_msg or "WinError 10048" in error_msg:
                print(f"  [!] ERROR: Port {HELPER_PORT} is already in use!")
                print(f"  [!] Another application may be using this port.")
                print(f"  [!] Solution:")
                print(f"      1. Close any other JOSM Helper windows")
                print(f"      2. Wait a few seconds for port to be released")
                print(f"      3. Or change HELPER_PORT in josm-helper.py")
                print()
                print(f"  To find what's using the port, run:")
                print(f"      netstat -ano | findstr :{HELPER_PORT}")
            else:
                print(f"  [!] ERROR: Failed to bind to port {HELPER_PORT}")
                print(f"  [!] Error: {error_msg}")
            raise
        except KeyboardInterrupt:
            print("\n\n  JOSM Helper stopped by user.")
        except Exception as e:
            print(f"\n  [!] Server error: {e}")
            print(f"  [!] Error type: {type(e).__name__}")
            raise
        finally:
            if httpd:
                try:
                    httpd.server_close()
                    print("  Server closed.")
                except:
                    pass
                    
    except Exception as e:
        print(f"\n  [!] FATAL ERROR: {e}")
        print(f"  [!] Error type: {type(e).__name__}")
        import traceback
        print("\n  Full error details:")
        traceback.print_exc()
        print("\n" + "=" * 50)
        print("  Press any key to exit...")
        try:
            input()
        except:
            pass
        raise


if __name__ == "__main__":
    main()
