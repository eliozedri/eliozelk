#!/usr/bin/env python3
"""
serve.py — local Python helper for the manual training annotator.

Binds to 127.0.0.1 only. Serves:
  GET  /                   → index.html
  GET  /static/*           → annotator JS/CSS + vendored Konva
  GET  /image              → the rendered plan PNG for the selected run
  GET  /image-info         → JSON: width, height, dpi (from filename or stat)
  GET  /examples           → existing visual_training_examples.wizard.json
                             or {"empty": true} if none yet
  PUT  /examples           → write the JSON body to
                             outputs/manual_training/visual_training_examples.wizard.json
                             (atomic rename; pretty-printed)
  POST /render-page        → render a PDF page at a given DPI into the run's
                             outputs/image_scan_debug/ if no image exists yet

Usage:
  .venv/bin/python research_annotator/serve.py \\
      --plan-run-dir runs/poc_plan_50_448_02_400_20260520_223259 \\
      [--port 7799] [--dpi 150] [--page 0]

After it starts, open http://127.0.0.1:7799/ in your browser.

Safety:
  - Binds 127.0.0.1 only. No public exposure.
  - Writes ONLY to <run_dir>/outputs/manual_training/.
  - Will NOT touch any production DB, API route, or paid service.
  - Will NOT permanently archive the uploaded plan.
"""

import argparse
import json
import os
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Optional

# Globals set by main() before the server starts.
RUN_DIR: Path = Path(".")
SCRIPT_DIR: Path = Path(__file__).parent.resolve()
IMAGE_PATH: Optional[Path] = None
IMAGE_INFO: dict = {}


# ----- HTTP handler --------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    # Quieter access log
    def log_message(self, fmt, *args):
        sys.stderr.write("[serve] %s - - %s\n" % (self.address_string(), fmt % args))

    def _send(self, status: int, body: bytes, content_type: str = "application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, status: int, payload: dict):
        self._send(status, json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"))

    def _read_body(self) -> bytes:
        n = int(self.headers.get("Content-Length", "0") or "0")
        return self.rfile.read(n) if n > 0 else b""

    # ----- GET -----
    def do_GET(self):
        path = self.path.split("?", 1)[0]

        if path in ("/", "/index.html"):
            self._serve_static(SCRIPT_DIR / "index.html", "text/html; charset=utf-8")
            return

        if path.startswith("/static/"):
            rel = path[len("/static/"):]
            target = (SCRIPT_DIR / rel).resolve()
            if SCRIPT_DIR not in target.parents and target != SCRIPT_DIR:
                self._send_json(403, {"error": "path escape"}); return
            if not target.exists() or not target.is_file():
                self._send_json(404, {"error": "not found", "path": rel}); return
            ctype = _guess_ctype(target)
            self._serve_static(target, ctype)
            return

        if path == "/image":
            if not IMAGE_PATH or not IMAGE_PATH.exists():
                self._send_json(404, {"error": "no rendered image; check --plan-run-dir"}); return
            self._serve_static(IMAGE_PATH, "image/png")
            return

        if path == "/image-info":
            self._send_json(200, IMAGE_INFO)
            return

        if path == "/examples":
            ex = _examples_path()
            if ex.exists():
                self._serve_static(ex, "application/json; charset=utf-8")
            else:
                self._send_json(200, {"empty": True, "message": "no examples saved yet"})
            return

        self._send_json(404, {"error": "not found", "path": path})

    # ----- PUT -----
    def do_PUT(self):
        if self.path != "/examples":
            self._send_json(404, {"error": "not found"}); return
        body = self._read_body()
        if not body:
            self._send_json(400, {"error": "empty body"}); return
        try:
            payload = json.loads(body.decode("utf-8"))
        except Exception as e:
            self._send_json(400, {"error": "invalid json", "detail": str(e)}); return
        # Minimal schema sanity check
        if not isinstance(payload, dict):
            self._send_json(400, {"error": "root must be object"}); return
        _atomic_write_json(_examples_path(), payload)
        self._send_json(200, {
            "saved": True,
            "path": str(_examples_path()),
            "bytes": len(body),
        })

    # ----- POST (render-page) -----
    def do_POST(self):
        if self.path == "/render-page":
            body = self._read_body()
            try:
                req = json.loads(body.decode("utf-8")) if body else {}
            except Exception:
                req = {}
            dpi = int(req.get("dpi", 150))
            page = int(req.get("page", 0))
            try:
                out = _ensure_page_rendered(dpi=dpi, page=page)
            except Exception as e:
                self._send_json(500, {"error": "render failed", "detail": str(e)}); return
            global IMAGE_PATH, IMAGE_INFO
            IMAGE_PATH = out["path"]
            IMAGE_INFO = out["info"]
            self._send_json(200, {"rendered": True, **out["info"]})
            return
        self._send_json(404, {"error": "not found"})

    # ----- helpers -----
    def _serve_static(self, target: Path, content_type: str):
        try:
            data = target.read_bytes()
        except Exception as e:
            self._send_json(500, {"error": "io", "detail": str(e)}); return
        self._send(200, data, content_type)


def _guess_ctype(p: Path) -> str:
    ext = p.suffix.lower()
    return {
        ".html": "text/html; charset=utf-8",
        ".js":   "application/javascript; charset=utf-8",
        ".css":  "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png":  "image/png",
        ".jpg":  "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg":  "image/svg+xml",
        ".md":   "text/markdown; charset=utf-8",
    }.get(ext, "application/octet-stream")


def _examples_path() -> Path:
    return RUN_DIR / "outputs" / "manual_training" / "visual_training_examples.wizard.json"


def _atomic_write_json(target: Path, payload: dict):
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".tmp_", dir=str(target.parent), suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
        os.replace(tmp, target)
    finally:
        if os.path.exists(tmp):
            try: os.unlink(tmp)
            except OSError: pass


# ----- Image discovery / rendering -----------------------------------

def _find_existing_render(dpi: int, page: int) -> Optional[Path]:
    debug_dir = RUN_DIR / "outputs" / "image_scan_debug"
    if not debug_dir.exists():
        return None
    # Prefer an exact match if present, else any matching page
    candidates = list(debug_dir.glob(f"page_{page}_{dpi}dpi.png"))
    if candidates:
        return candidates[0]
    candidates = list(debug_dir.glob(f"page_{page}_*dpi.png"))
    if candidates:
        return sorted(candidates)[-1]
    return None


def _find_pdf() -> Optional[Path]:
    for sub in ("source", "uploads", ""):
        d = RUN_DIR / sub if sub else RUN_DIR
        if not d.exists():
            continue
        for p in d.glob("*.pdf"):
            return p
    return None


def _ensure_page_rendered(dpi: int, page: int) -> dict:
    existing = _find_existing_render(dpi, page)
    if existing:
        return {"path": existing, "info": _image_info_for(existing, dpi, page)}
    pdf = _find_pdf()
    if pdf is None:
        raise FileNotFoundError(f"no PDF found in {RUN_DIR}/source/, /uploads/, or /")
    import fitz  # PyMuPDF
    doc = fitz.open(str(pdf))
    if page >= len(doc):
        raise IndexError(f"page {page} out of range; PDF has {len(doc)} pages")
    pg = doc[page]
    pix = pg.get_pixmap(matrix=fitz.Matrix(dpi / 72, dpi / 72), alpha=False)
    debug_dir = RUN_DIR / "outputs" / "image_scan_debug"
    debug_dir.mkdir(parents=True, exist_ok=True)
    out = debug_dir / f"page_{page}_{dpi}dpi.png"
    pix.save(str(out))
    doc.close()
    return {"path": out, "info": _image_info_for(out, dpi, page)}


def _image_info_for(path: Path, dpi: int, page: int) -> dict:
    # Use PIL if installed, else infer from filename
    try:
        from PIL import Image
        with Image.open(path) as im:
            w, h = im.size
    except Exception:
        w, h = 0, 0
    return {
        "path": str(path),
        "filename": path.name,
        "width": w,
        "height": h,
        "dpi": dpi,
        "page_number": page,
        "plan_id": RUN_DIR.name,
    }


# ----- main ---------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="Local research annotator server (Engine C v0.3, Slice 1)")
    parser.add_argument("--plan-run-dir", required=True, help="Path to runs/<plan_slug>/")
    parser.add_argument("--port", type=int, default=7799)
    parser.add_argument("--page", type=int, default=0, help="Page to render/load (default 0)")
    parser.add_argument("--dpi", type=int, default=150, help="DPI for rendering if no image present yet (default 150)")
    args = parser.parse_args()

    global RUN_DIR, IMAGE_PATH, IMAGE_INFO
    RUN_DIR = Path(args.plan_run_dir).resolve()
    if not RUN_DIR.exists():
        print(f"ERROR: --plan-run-dir not found: {RUN_DIR}", file=sys.stderr)
        return 1

    # Try to pre-render so /image works on first GET; if PDF rendering fails
    # (e.g. fitz not installed), the user can still POST /render-page later or
    # supply --page that already has a PNG.
    try:
        result = _ensure_page_rendered(dpi=args.dpi, page=args.page)
        IMAGE_PATH = result["path"]
        IMAGE_INFO = result["info"]
        print(f"[serve] image ready: {IMAGE_PATH} ({IMAGE_INFO['width']}x{IMAGE_INFO['height']}px @ {args.dpi} DPI)")
    except Exception as e:
        print(f"[serve] WARNING: could not pre-render page: {e}", file=sys.stderr)
        print(f"[serve] You can POST /render-page later or place a PNG manually.", file=sys.stderr)
        IMAGE_INFO = {"plan_id": RUN_DIR.name, "page_number": args.page, "dpi": args.dpi,
                      "width": 0, "height": 0, "filename": None, "path": None}

    # Ensure the manual_training output dir exists so PUT /examples works
    (RUN_DIR / "outputs" / "manual_training").mkdir(parents=True, exist_ok=True)

    # Bind to 127.0.0.1 only — never expose publicly
    addr = ("127.0.0.1", args.port)
    httpd = HTTPServer(addr, Handler)
    print(f"[serve] research annotator listening on http://127.0.0.1:{args.port}/")
    print(f"[serve] plan run dir : {RUN_DIR}")
    print(f"[serve] examples file: {_examples_path()}")
    print(f"[serve] (Ctrl-C to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[serve] stopped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
