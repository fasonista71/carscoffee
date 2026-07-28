#!/usr/bin/env python3
"""Static server with caching disabled, so a phone always loads the
current build and can never mix old and new modules.

Usage: python3 serve.py [port]      (default port 8080)
"""
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
print(f'serving on http://0.0.0.0:{port} with caching disabled')
http.server.ThreadingHTTPServer(('', port), NoCacheHandler).serve_forever()
