#!/usr/bin/env python3
"""Local preview server with a lottery data proxy.

The browser cannot call official lottery APIs directly because of CORS.
This server serves lottery-ai/ as static files and exposes /api/lottery,
which fetches the latest draws and news from the public data sources.
"""

import datetime as dt
import importlib.util
import json
import pathlib
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEBROOT = ROOT / "lottery-ai"
LIVE_LIMIT = 100

_spec = importlib.util.spec_from_file_location(
    "fetch_lottery_data",
    ROOT / "scripts" / "fetch-lottery-data.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
fetch_ssq = _mod.fetch_ssq
fetch_dlt = _mod.fetch_dlt
fetch_news = _mod.fetch_news


def build_payload():
    data = {
        "updatedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "draws": {"ssq": [], "dlt": []},
        "info": {"ssq": None, "dlt": None},
        "news": [],
    }
    errors = []
    try:
        data["draws"]["ssq"], data["info"]["ssq"] = fetch_ssq(LIVE_LIMIT)
    except Exception as exc:
        errors.append("ssq: %s" % exc)
    try:
        data["draws"]["dlt"], data["info"]["dlt"] = fetch_dlt(LIVE_LIMIT)
    except Exception as extra:
        errors.append("dlt: %s" % extra)
    try:
        data["news"] = fetch_news()
    except Exception as extra:
        errors.append("news: %s" % extra)
    data["errors"] = errors
    return data


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEBROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/lottery":
            try:
                payload = build_payload()
                body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception as extra:
                body = json.dumps({"error": str(extra)}, ensure_ascii=False).encode("utf-8")
                self.send_response(502)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            return
        return super().do_GET()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main():
    host = "0.0.0.0"
    port = 8000
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    httpd = ThreadingHTTPServer((host, port), Handler)
    print("serving %s on http://%s:%s" % (WEBROOT, host, port))
    httpd.serve_forever()


if __name__ == "__main__":
    main()
