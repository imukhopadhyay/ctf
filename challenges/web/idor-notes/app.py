#!/usr/bin/env python3
"""IDOR demo: notes are served by sequential id with no ownership check.
The admin's private note contains the per-instance flag ($FLAG)."""
import os, html
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

FLAG = os.environ.get("FLAG", "CQ{local_test_flag}")
NOTES = {
    1: ("you", "Shopping list", "milk, bread, solder"),
    2: ("you", "Reminder", "rotate SSH keys"),
    3: ("admin", "PRIVATE", "Service account recovery flag: " + FLAG),
}
PAGE = """<!doctype html><html><head><title>NoteKeeper</title>
<style>body{font-family:system-ui;background:#0b1220;color:#e6edf7;max-width:640px;margin:3rem auto;padding:1rem}
a{color:#22d3ee}code{background:#070d19;padding:.1rem .3rem;border-radius:4px}pre{background:#070d19;padding:.8rem;border-radius:6px;white-space:pre-wrap}</style></head><body>
<h1>NoteKeeper</h1><p>Logged in as <b>you</b> (user #1). Your notes:</p>
<ul><li><a href="/note?id=1">Shopping list</a></li><li><a href="/note?id=2">Reminder</a></li></ul>
<p>Notes are addressed by number, e.g. <code>/note?id=1</code>.</p></body></html>"""


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, body, code=200):
        b = body.encode()
        self.send_response(code)
        self.send_header("content-type", "text/html; charset=utf-8")
        self.send_header("content-length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path.startswith("/health"):
            return self._send("ok")
        if self.path.startswith("/note"):
            q = parse_qs(urlparse(self.path).query)
            try:
                nid = int(q.get("id", ["0"])[0])
            except ValueError:
                return self._send("bad id", 400)
            # VULNERABLE BY DESIGN: no check that the note belongs to the current user.
            note = NOTES.get(nid)
            if not note:
                return self._send("Not found", 404)
            owner, title, content = note
            return self._send(
                '<a href="/">&larr; back</a><h2>%s</h2><p><i>owner: %s</i></p><pre>%s</pre>'
                % (html.escape(title), html.escape(owner), html.escape(content))
            )
        self._send(PAGE)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), H).serve_forever()
