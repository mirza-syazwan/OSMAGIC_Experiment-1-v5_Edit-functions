#!/usr/bin/env python3
"""
Simple HTTP server to run the Task Manager locally
Run this file and then open http://localhost:8000 in your browser
"""

import http.server
import socketserver
import webbrowser
import os
import json
import urllib.parse
from datetime import datetime
import tempfile
import shutil
import subprocess
import ctypes
from ctypes import wintypes

PORT = 8000

# Windows API for window management
def focus_josm_window():
    """Find and bring JOSM window to foreground using Windows API"""
    try:
        # Load Windows API functions
        user32 = ctypes.windll.user32
        
        # Define callback type for EnumWindows
        WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        
        josm_hwnd = None
        
        def enum_windows_callback(hwnd, lparam):
            nonlocal josm_hwnd
            # Get window title
            length = user32.GetWindowTextLengthW(hwnd)
            if length > 0:
                buffer = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buffer, length + 1)
                title = buffer.value.lower()
                
                # Check if this is a JOSM window
                if 'josm' in title or 'java openstreetmap' in title:
                    # Check if window is visible
                    if user32.IsWindowVisible(hwnd):
                        josm_hwnd = hwnd
                        return False  # Stop enumeration
            return True  # Continue enumeration
        
        # Enumerate all windows to find JOSM
        user32.EnumWindows(WNDENUMPROC(enum_windows_callback), 0)
        
        if josm_hwnd:
            # Bring window to foreground
            # First, restore if minimized
            SW_RESTORE = 9
            user32.ShowWindow(josm_hwnd, SW_RESTORE)
            
            # Bring to foreground using multiple methods for reliability
            user32.SetForegroundWindow(josm_hwnd)
            user32.BringWindowToTop(josm_hwnd)
            
            # Alternative: Use AttachThreadInput trick for stubborn cases
            try:
                current_thread = ctypes.windll.kernel32.GetCurrentThreadId()
                foreground_thread = user32.GetWindowThreadProcessId(user32.GetForegroundWindow(), None)
                
                if current_thread != foreground_thread:
                    user32.AttachThreadInput(current_thread, foreground_thread, True)
                    user32.SetForegroundWindow(josm_hwnd)
                    user32.AttachThreadInput(current_thread, foreground_thread, False)
            except:
                pass
            
            print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] JOSM window focused successfully")
            return True
        else:
            print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] JOSM window not found")
            return False
            
    except Exception as e:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Error focusing JOSM: {e}")
        return False
EXPORT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'exports')

# Create exports directory if it doesn't exist
if not os.path.exists(EXPORT_DIR):
    os.makedirs(EXPORT_DIR)

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers to allow requests from the web app
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
    
    def do_OPTIONS(self):
        # Handle CORS preflight requests
        self.send_response(200)
        self.end_headers()
    
    def do_POST(self):
        if self.path == '/export':
            # Handle OSM file export request
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                
                # Parse JSON request
                data = json.loads(post_data.decode('utf-8'))
                sequence_id = data.get('sequenceId', 'unknown')
                osm_xml = data.get('osmXml', '')
                
                if not osm_xml:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': 'No OSM XML provided'}).encode())
                    return
                
                # Save OSM file
                filename = f'sequence_{sequence_id}.osm'
                filepath = os.path.join(EXPORT_DIR, filename)
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(osm_xml)
                
                # Return URL to the file
                file_url = f'http://localhost:{PORT}/exports/{filename}'
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'success': True,
                    'url': file_url,
                    'filename': filename
                }).encode())
                
                print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Exported: {filename}")
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
                print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Export error: {e}")
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_GET(self):
        # Handle focus-josm request
        if self.path == '/focus-josm':
            success = focus_josm_window()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': success,
                'message': 'JOSM focused' if success else 'JOSM window not found'
            }).encode())
            return
        
        # Serve static files and exported OSM files
        if self.path.startswith('/exports/'):
            # Serve exported OSM files
            filename = self.path[9:]  # Remove '/exports/' prefix
            filepath = os.path.join(EXPORT_DIR, filename)
            
            if os.path.exists(filepath) and os.path.isfile(filepath):
                self.send_response(200)
                self.send_header('Content-Type', 'application/xml')
                self.send_header('Content-Disposition', f'inline; filename="{filename}"')
                self.end_headers()
                
                with open(filepath, 'rb') as f:
                    shutil.copyfileobj(f, self.wfile)
            else:
                self.send_response(404)
                self.end_headers()
        else:
            # Serve regular static files
            super().do_GET()

def main():
    # Change to the directory where this script is located
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    Handler = MyHTTPRequestHandler
    
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}"
        print("=" * 60)
        print(f"Task Manager Server is running!")
        print(f"Open your browser and go to: {url}")
        print(f"Export directory: {EXPORT_DIR}")
        print("=" * 60)
        print("Press Ctrl+C to stop the server")
        print("=" * 60)
        
        # Try to open browser automatically
        try:
            webbrowser.open(url)
        except:
            pass
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nServer stopped.")

if __name__ == "__main__":
    main()

