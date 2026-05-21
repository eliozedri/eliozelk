#!/usr/bin/env python3
"""
34_ui_plan_scan_orchestrator.py
UI-triggered scan orchestrator — Plan Scanner (סורק תוכניות)

Runs the full detection pipeline for a UI-uploaded plan.
Supports --mode fast|deep (user-selectable at upload).

Fast path  (01→02→03→04→06→07→09→15→17→33):
  Core vector extraction, symbol detection, legend, scale, BOQ, export.
  Goal: useful operational output in minutes.

Deep path  (Fast core + 10→11→12→13→14→16→18→20→22→23 + 17→33):
  Adds OCR, vector-glyph code recognition, review queue, color taxonomy,
  element decomposition, validation, partial-code resolution, human review.
  Goal: full analysis; no strict time target.

Does NOT repurpose 19_ (validator/health-check) or 33_ (export generator).
19_ remains available after the run to validate pipeline health.
33_ is called here as the final export step.

Progress is written to state/scan_progress.json on every stage transition.
On failure: status=failed, error message, failed_script written to progress file.

Safety:
  - no DB migrations, no production schema changes, no paid API
  - no BOQ approval (approved_for_boq=false enforced by pipeline scripts)
  - source PDF is temporary; outputs/exports are the product
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple

SCRIPT_DIR = Path(__file__).parent
PYTHON_BIN = SCRIPT_DIR / ".venv" / "bin" / "python3"

# ── Stage definitions ─────────────────────────────────────────────────────────
# Tuple: (script_filename, hebrew_label, positional_pdf_arg, plan_run_dir_arg)

FAST_BASE_STAGES: List[Tuple[str, str, bool, bool]] = [
    ("01_inspect.py",                 "בדיקת קובץ PDF",           True,  False),
    ("02_extract_vectors.py",         "חילוץ וקטורים",             True,  False),
    ("03_analyze_colors_geometry.py", "ניתוח צבעים וגיאומטריה",    True,  False),
    ("04_cluster_symbols.py",         "קיבוץ סמלים",               False, True),
    ("06_match_signs.py",             "זיהוי תמרורים",             False, True),
    ("07_extract_legend.py",          "חילוץ מקרא",                False, True),
    ("09_stage_g_inventory.py",       "מלאי תמרורים",              False, True),
    ("15_scale_measurement.py",       "מדידת קנה מידה",            False, True),
]

DEEP_EXTRA_STAGES: List[Tuple[str, str, bool, bool]] = [
    ("10_local_ocr_sign_codes.py",        "OCR קודי תמרורים",          True,  False),
    ("11_tight_crop_ocr.py",              "OCR חיתוך מדויק",            True,  False),
    ("12_digit_template_recognition.py",  "זיהוי ספרות",                True,  False),
    ("13_vector_glyph_recognition.py",    "זיהוי קודי וקטורים",         False, True),
    ("14_build_review_queue.py",          "בניית תור סקירה",            False, True),
    ("16_legend_color_match.py",          "התאמת צבעים למקרא",          False, True),
    ("18_element_decomposition.py",       "פירוק אלמנטים",              False, True),
    ("20_validation_layer.py",            "אימות תמרורים",               False, True),
    ("22_partial_code_resolver.py",       "פתרון קודים חלקיים",          False, True),
    ("23_human_review_writeback.py",      "הכנת סקירה ידנית",            False, True),
]

FINAL_STAGES: List[Tuple[str, str, bool, bool]] = [
    ("17_boq_aggregator.py",             "ריכוז כמויות",               False, True),
    ("33_worker_operations_export.py",   "יצוא דוחות",                 False, True),
]


def build_stage_list(mode: str) -> List[Tuple[str, str, bool, bool]]:
    if mode == "deep":
        return FAST_BASE_STAGES + DEEP_EXTRA_STAGES + FINAL_STAGES
    return FAST_BASE_STAGES + FINAL_STAGES


# ── Utilities ─────────────────────────────────────────────────────────────────

def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def write_progress(state_dir: Path, data: dict) -> None:
    data = dict(data)
    data["updated_at"] = now_iso()
    tmp = state_dir / "scan_progress.json.tmp"
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(state_dir / "scan_progress.json")


def find_source_pdf(plan_run_dir: Path, config: dict) -> Optional[Path]:
    for key in ("source_pdf_path", "pdf_path"):
        val = config.get(key)
        if val:
            p = Path(val)
            if p.exists():
                return p
    candidates = sorted((plan_run_dir / "source").glob("*.pdf"))
    return candidates[0] if candidates else None


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="UI Plan Scan Orchestrator")
    parser.add_argument("--plan-run-dir", required=True, help="Path to plan run directory")
    parser.add_argument("--mode", choices=["fast", "deep"], default="fast",
                        help="Scan mode: fast (operational draft) or deep (full analysis)")
    args = parser.parse_args()

    plan_run_dir = Path(args.plan_run_dir).resolve()
    mode = args.mode
    scan_mode = "fast_scan" if mode == "fast" else "deep_scan"

    state_dir   = plan_run_dir / "state"
    outputs_dir = plan_run_dir / "outputs"
    logs_dir    = plan_run_dir / "logs"

    for d in (state_dir, outputs_dir, logs_dir):
        d.mkdir(parents=True, exist_ok=True)

    # Validate plan_config.json
    config_path = plan_run_dir / "plan_config.json"
    if not config_path.exists():
        print(f"[ERROR] plan_config.json not found in {plan_run_dir}", file=sys.stderr)
        sys.exit(1)

    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"[ERROR] Failed to parse plan_config.json: {e}", file=sys.stderr)
        sys.exit(1)

    pdf_path = find_source_pdf(plan_run_dir, config)
    if pdf_path is None:
        err = "Source PDF not found — checked plan_config.json + source/ directory"
        print(f"[ERROR] {err}", file=sys.stderr, flush=True)
        write_progress(state_dir, {
            "scan_mode": "fast_scan" if args.mode == "fast" else "deep_scan",
            "status": "failed",
            "current_script": None,
            "current_stage_index": 0,
            "current_stage_label": "שגיאה: קובץ PDF לא נמצא",
            "completed_count": 0,
            "total_stages": 0,
            "progress_pct": 0,
            "started_at": now_iso(),
            "error": err,
            "failed_script": None,
        })
        sys.exit(1)

    python_bin = PYTHON_BIN if PYTHON_BIN.exists() else Path(sys.executable)
    stages = build_stage_list(mode)
    total = len(stages)
    started_at = now_iso()

    # Env: override cad_utils.OUTPUTS to plan-scoped dir for scripts 01/02/03
    # which don't yet support --plan-run-dir directly
    subprocess_env = dict(os.environ)
    subprocess_env["CAD_PLAN_OUTPUTS_DIR"] = str(outputs_dir)

    print(f"[34_ui_plan_scan_orchestrator] mode={scan_mode}  stages={total}")
    print(f"  plan-run-dir : {plan_run_dir}")
    print(f"  pdf          : {pdf_path.name}")
    print(f"  outputs      : {outputs_dir}")

    # Stamp scan mode into plan_manifest.json (best-effort)
    manifest_path = plan_run_dir / "plan_manifest.json"
    if manifest_path.exists():
        try:
            m = json.loads(manifest_path.read_text(encoding="utf-8"))
            m["scan_mode"] = scan_mode
            m["scan_started_at"] = started_at
            manifest_path.write_text(json.dumps(m, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception:
            pass

    progress: dict = {
        "scan_mode": scan_mode,
        "status": "running",
        "current_script": None,
        "current_stage_index": 0,
        "current_stage_label": "מתחיל...",
        "completed_count": 0,
        "total_stages": total,
        "progress_pct": 0,
        "started_at": started_at,
        "error": None,
        "failed_script": None,
    }
    write_progress(state_dir, progress)

    def log(msg: str) -> None:
        print(f"[{now_iso()}] {msg}", flush=True)

    log(f"Starting {scan_mode} — {total} stages | PDF: {pdf_path.name}")

    for i, (script_name, label, pdf_arg, prd_arg) in enumerate(stages):
        script_path = SCRIPT_DIR / script_name
        if not script_path.exists():
            progress.update({
                "status": "failed",
                "error": f"Script not found: {script_name}",
                "failed_script": script_name,
                "current_stage_label": f"שגיאה: {script_name} לא נמצא",
            })
            write_progress(state_dir, progress)
            log(f"[FAIL] Script not found: {script_name}")
            sys.exit(1)

        pct = int((i / total) * 100)
        progress.update({
            "current_script": script_name,
            "current_stage_index": i,
            "current_stage_label": label,
            "completed_count": i,
            "progress_pct": pct,
        })
        write_progress(state_dir, progress)
        log(f"[{i + 1}/{total}] {script_name} — {label}  ({pct}%)")

        cmd = [str(python_bin), str(script_path)]
        if prd_arg:
            cmd += ["--plan-run-dir", str(plan_run_dir)]
        elif pdf_arg:
            cmd.append(str(pdf_path))

        t0 = time.time()
        try:
            result = subprocess.run(
                cmd,
                timeout=600,
                cwd=str(SCRIPT_DIR),
                env=subprocess_env,
            )
            elapsed = round(time.time() - t0, 1)
            if result.returncode != 0:
                err = f"Script {script_name} failed with exit code {result.returncode}"
                progress.update({
                    "status": "failed",
                    "error": err,
                    "failed_script": script_name,
                    "current_stage_label": f"שגיאה ב-{label}",
                })
                write_progress(state_dir, progress)
                log(f"[FAIL] {err}  (elapsed: {elapsed}s)")
                sys.exit(1)
            log(f"[OK]   {script_name}  elapsed={elapsed}s")

        except subprocess.TimeoutExpired:
            err = f"Script {script_name} timed out after 600s"
            progress.update({
                "status": "failed",
                "error": err,
                "failed_script": script_name,
                "current_stage_label": f"פסק זמן ב-{label}",
            })
            write_progress(state_dir, progress)
            log(f"[FAIL] {err}")
            sys.exit(1)

        except Exception as e:
            err = f"Script {script_name} raised exception: {e}"
            progress.update({
                "status": "failed",
                "error": err,
                "failed_script": script_name,
                "current_stage_label": f"שגיאת מערכת ב-{label}",
            })
            write_progress(state_dir, progress)
            log(f"[FAIL] {err}")
            sys.exit(1)

    # All stages completed
    progress.update({
        "status": "completed",
        "current_script": None,
        "current_stage_label": "הסריקה הושלמה",
        "completed_count": total,
        "progress_pct": 100,
    })
    write_progress(state_dir, progress)
    log(f"Orchestrator completed — all {total} stages passed")


if __name__ == "__main__":
    main()
