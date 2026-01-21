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
