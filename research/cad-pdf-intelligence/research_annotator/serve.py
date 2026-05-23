#!/usr/bin/env python3
"""
serve.py — local Python helper for the manual training annotator.

Binds to 127.0.0.1 only. Serves:
  GET  /                          → index.html
  GET  /static/*                  → annotator JS/CSS + vendored Konva
  GET  /image                     → the rendered plan PNG for the selected run
  GET  /image-info                → JSON: width, height, dpi
  GET  /examples                  → existing visual_training_examples.wizard.json
                                    or {"empty": true} if none yet
  PUT  /examples                  → write JSON body to
                                    outputs/manual_training/visual_training_examples.wizard.json
                                    (atomic rename; pretty-printed)
  POST /render-page               → render a PDF page at a given DPI

  -- Slice 3 (Close the teaching loop) --
  POST /run-detection             → spawn 37_manual_visual_training_poc.py in a
                                    background thread; returns {job_id, status}
  GET  /run-status                → read current detection status from
                                    outputs/manual_training/.detection_run.json
                                    {status: pending|running|complete|failed,
                                     stdout_tail, exit_code, paths, ...}
  GET  /candidates                → outputs/manual_training/visual_agent_candidates.json
  GET  /review-questions          → outputs/manual_training/visual_review_questions.json
  GET  /evidence-crop/<fn>        → outputs/manual_training/evidence_crops/<fn>
  GET  /review-answers            → existing review-answers file or {empty: true}
  PUT  /review-answers            → write JSON body to
                                    outputs/manual_training/visual_review_answers.wizard.json

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
  - Detection subprocess inherits the venv from the parent process; no
    external network access required.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Optional

# Globals set by main() before the server starts.
RUN_DIR: Path = Path(".")
SCRIPT_DIR: Path = Path(__file__).parent.resolve()
IMAGE_PATH: Optional[Path] = None
IMAGE_INFO: dict = {}
PYTHON_EXE: str = sys.executable
SCRIPT37_PATH: Path = Path(".")  # set in main()

# Detection state (in-memory + persisted to .detection_run.json)
DETECTION_LOCK = threading.Lock()
DETECTION_STATE: dict = {"status": "none"}
STDOUT_TAIL_MAX = 80  # last N lines kept in memory + status file


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

        # ----- Slice 3 endpoints -----
        if path == "/run-status":
            self._send_json(200, _read_status())
            return

        if path == "/candidates":
            p = _output_dir() / "visual_agent_candidates.json"
            if p.exists():
                self._serve_static(p, "application/json; charset=utf-8")
            else:
                self._send_json(404, {"error": "no candidates yet — run detection first"})
            return

        if path == "/review-questions":
            p = _output_dir() / "visual_review_questions.json"
            if p.exists():
                self._serve_static(p, "application/json; charset=utf-8")
            else:
                self._send_json(404, {"error": "no review questions yet — run detection first"})
            return

        if path == "/review-answers":
            p = _review_answers_path()
            if p.exists():
                self._serve_static(p, "application/json; charset=utf-8")
            else:
                self._send_json(200, {"empty": True, "message": "no review answers yet"})
            return

        if path.startswith("/evidence-crop/"):
            fn = path[len("/evidence-crop/"):]
            # Reject path traversal
            if "/" in fn or ".." in fn or fn.startswith("."):
                self._send_json(400, {"error": "invalid crop name"}); return
            target = (_output_dir() / "evidence_crops" / fn).resolve()
            if (_output_dir() / "evidence_crops") not in target.parents:
                self._send_json(403, {"error": "path escape"}); return
            if not target.exists():
                self._send_json(404, {"error": "crop not found", "name": fn}); return
            self._serve_static(target, "image/png")
            return

        self._send_json(404, {"error": "not found", "path": path})

    # ----- PUT -----
    def do_PUT(self):
        if self.path == "/examples":
            body = self._read_body()
            if not body:
                self._send_json(400, {"error": "empty body"}); return
            try:
                payload = json.loads(body.decode("utf-8"))
            except Exception as e:
                self._send_json(400, {"error": "invalid json", "detail": str(e)}); return
            if not isinstance(payload, dict):
                self._send_json(400, {"error": "root must be object"}); return
            _atomic_write_json(_examples_path(), payload)
            self._send_json(200, {
                "saved": True, "path": str(_examples_path()), "bytes": len(body),
            })
            return
        if self.path == "/review-answers":
            body = self._read_body()
            if not body:
                self._send_json(400, {"error": "empty body"}); return
            try:
                payload = json.loads(body.decode("utf-8"))
            except Exception as e:
                self._send_json(400, {"error": "invalid json", "detail": str(e)}); return
            if not isinstance(payload, dict):
                self._send_json(400, {"error": "root must be object"}); return
            _atomic_write_json(_review_answers_path(), payload)
            self._send_json(200, {
                "saved": True, "path": str(_review_answers_path()), "bytes": len(body),
            })
            return
        self._send_json(404, {"error": "not found"})

    # ----- POST -----
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
        if self.path == "/run-detection":
            # If a detection job is already running, refuse to start another.
            with DETECTION_LOCK:
                cur = dict(DETECTION_STATE)
            if cur.get("status") == "running":
                self._send_json(409, {
                    "error": "another detection is already running",
                    "job_id": cur.get("job_id"),
                    "started_at": cur.get("started_at"),
                })
                return
            # Refuse if the wizard file is not present
            if not _examples_path().exists():
                self._send_json(412, {
                    "error": "no training examples saved yet — PUT /examples first",
                })
                return
            job_id = _make_job_id()
            t = threading.Thread(target=_run_detection_subprocess,
                                 args=(job_id,), daemon=True)
            t.start()
            self._send_json(200, {
                "job_id": job_id,
                "status": "pending",
                "examples_file": str(_examples_path()),
                "started_at": datetime.utcnow().isoformat() + "Z",
            })
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


def _output_dir() -> Path:
    return RUN_DIR / "outputs" / "manual_training"


def _examples_path() -> Path:
    return _output_dir() / "visual_training_examples.wizard.json"


def _review_answers_path() -> Path:
    return _output_dir() / "visual_review_answers.wizard.json"


def _status_path() -> Path:
    return _output_dir() / ".detection_run.json"


def _make_job_id() -> str:
    return "job_" + datetime.utcnow().strftime("%Y%m%dT%H%M%SZ") + "_" + str(int(time.time() * 1000) % 10000)


def _read_status() -> dict:
    """Return current detection status. Prefer in-memory state, fall back to file."""
    with DETECTION_LOCK:
        if DETECTION_STATE.get("status") and DETECTION_STATE["status"] != "none":
            return dict(DETECTION_STATE)
    p = _status_path()
    if not p.exists():
        return {"status": "none"}
    try:
        with open(p, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {"status": "none"}


def _write_status(state: dict):
    """Persist current detection state to disk (best-effort, atomic)."""
    p = _status_path()
    try:
        _atomic_write_json(p, state)
    except Exception:
        pass


def _update_status(updates: dict):
    """Merge `updates` into in-memory + disk status (thread-safe)."""
    with DETECTION_LOCK:
        DETECTION_STATE.update(updates)
        snapshot = dict(DETECTION_STATE)
    _write_status(snapshot)


def _detect_step_from_line(line: str) -> Optional[str]:
    """Recognize script 37's progress lines (e.g. 'Step C: Extracting rules ...')."""
    m = re.match(r"^\s*(Step [A-Z0-9]+(?:\s|$).*)", line)
    if m:
        return m.group(1).strip()
    if "Pole rule:" in line or "Tick rule:" in line or "Code rule:" in line or "Symbol rule:" in line:
        return line.strip()
    if line.strip().startswith("DONE") or line.startswith("============"):
        return None
    return None


def _run_detection_subprocess(job_id: str):
    """Spawn script 37 and stream its output into the detection state."""
    started_at = datetime.utcnow().isoformat() + "Z"
    cmd = [
        PYTHON_EXE, str(SCRIPT37_PATH),
        "--plan-run-dir", str(RUN_DIR),
        "--wizard-examples", str(_examples_path()),
    ]
    _update_status({
        "job_id": job_id,
        "status": "running",
        "started_at": started_at,
        "completed_at": None,
        "exit_code": None,
        "cmd": cmd,
        "current_step": "starting…",
        "stdout_tail": [],
        "error": None,
        "result_paths": None,
    })
    print(f"[serve] [{job_id}] detection started: {' '.join(cmd)}", flush=True)

    stdout_tail: list = []
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
        )
        with DETECTION_LOCK:
            DETECTION_STATE["pid"] = proc.pid
        for raw in proc.stdout:
            line = raw.rstrip("\n")
            stdout_tail.append(line)
            if len(stdout_tail) > STDOUT_TAIL_MAX:
                stdout_tail = stdout_tail[-STDOUT_TAIL_MAX:]
            step = _detect_step_from_line(line)
            updates = {"stdout_tail": list(stdout_tail)}
            if step:
                updates["current_step"] = step
            _update_status(updates)
        exit_code = proc.wait()
        result_paths = {
            "candidates":      str(_output_dir() / "visual_agent_candidates.json"),
            "review_questions": str(_output_dir() / "visual_review_questions.json"),
            "rules":           str(_output_dir() / "visual_learning_rules.json"),
            "report_md":       str(_output_dir() / "manual_training_report.md"),
            "report_html":     str(_output_dir() / "manual_training_report.html"),
        }
        if exit_code == 0:
            _update_status({
                "status": "complete",
                "completed_at": datetime.utcnow().isoformat() + "Z",
                "exit_code": exit_code,
                "current_step": "done",
                "result_paths": result_paths,
            })
            print(f"[serve] [{job_id}] detection complete (exit 0)", flush=True)
        else:
            _update_status({
                "status": "failed",
                "completed_at": datetime.utcnow().isoformat() + "Z",
                "exit_code": exit_code,
                "current_step": f"failed (exit {exit_code})",
                "error": f"script 37 exited with code {exit_code}",
                "result_paths": result_paths,
            })
            print(f"[serve] [{job_id}] detection FAILED (exit {exit_code})", flush=True)
    except Exception as e:
        _update_status({
            "status": "failed",
            "completed_at": datetime.utcnow().isoformat() + "Z",
            "current_step": "failed",
            "error": f"subprocess exception: {e}",
            "stdout_tail": list(stdout_tail),
        })
        print(f"[serve] [{job_id}] detection EXCEPTION: {e}", flush=True)


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

    global RUN_DIR, IMAGE_PATH, IMAGE_INFO, SCRIPT37_PATH
    RUN_DIR = Path(args.plan_run_dir).resolve()
    if not RUN_DIR.exists():
        print(f"ERROR: --plan-run-dir not found: {RUN_DIR}", file=sys.stderr)
        return 1
    # Locate script 37 alongside research_annotator/ (in research/cad-pdf-intelligence/)
    SCRIPT37_PATH = (SCRIPT_DIR.parent / "37_manual_visual_training_poc.py").resolve()
    if not SCRIPT37_PATH.exists():
        print(f"WARNING: script 37 not found at {SCRIPT37_PATH} — /run-detection will fail", file=sys.stderr)

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
