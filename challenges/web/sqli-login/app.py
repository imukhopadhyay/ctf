#!/usr/bin/env python3
"""Intentionally vulnerable login (string-concatenated SQL) for the SQLi
challenge. Isolated, synthetic data only. The flag is injected per-instance
via the $FLAG environment variable by the runner."""
import os, sqlite3, html
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs

FLAG = os.environ.get("FLAG", "CQ{local_test_flag}")
ADMIN_PW = os.environ.get("ADMIN_PW", "d0nt-gu3ss-me-9f3a2")


def db():
    c = sqlite3.connect(":memory:")
    c.executescript(
        "CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT, password TEXT, role TEXT);"
        "INSERT INTO users(username,password,role) VALUES"
        "('alice','s3cret-alice','user'),('bob','hunter2-bob','user'),"
        "('admin','" + ADMIN_PW + "','admin');"
    )
    return c


PAGE = """<!doctype html><html><head><title>MegaCorp Portal</title>
<style>body{{font-family:system-ui;background:#0b1220;color:#e6edf7;max-width:560px;margin:3rem auto;padding:1rem}}
input{{display:block;width:100%;padding:.5rem;margin:.4rem 0;background:#070d19;color:#fff;border:1px solid #1b2a42;border-radius:6px}}
button{{padding:.5rem 1rem;background:#2dd4bf;border:0;border-radius:6px;color:#041512;font-weight:600}}
code{{background:#070d19;padding:.1rem .3rem;border-radius:4px}}
.msg{{padding:.6rem;border-radius:6px;margin:.6rem 0}}.err{{background:#3b1414}}.ok{{background:#14361f}}</style></head>
<body><h1>MegaCorp Employee Portal</h1><p>Authorised staff only. (Sandboxed demo target.)</p>
<form method=post><input name=username placeholder=Username autocomplete=off>
<input name=password type=password placeholder=Password autocomplete=off>
<button>Sign in</button></form>{msg}</body></html>"""


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
        self._send(PAGE.format(msg=""))

    def do_POST(self):
        n = int(self.headers.get("content-length", 0) or 0)
        if n > 4096:
            return self._send("too large", 413)
        form = parse_qs(self.rfile.read(n).decode("utf-8", "replace"))
        u = form.get("username", [""])[0]
        p = form.get("password", [""])[0]
        c = db()
        # VULNERABLE BY DESIGN: user input concatenated straight into SQL.
        q = "SELECT username, role FROM users WHERE username='%s' AND password='%s'" % (u, p)
        try:
            row = c.execute(q).fetchone()
        except Exception as e:
            return self._send(PAGE.format(msg='<div class="msg err">SQL error: %s</div>' % html.escape(str(e))))
        if row and row[1] == "admin":
            return self._send(PAGE.format(msg='<div class="msg ok">Welcome, administrator. Flag: <code>%s</code></div>' % html.escape(FLAG)))
        if row:
            return self._send(PAGE.format(msg='<div class="msg ok">Welcome, %s. You are not an administrator.</div>' % html.escape(row[0])))
        self._send(PAGE.format(msg='<div class="msg err">Invalid credentials.</div>'))


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), H).serve_forever()
