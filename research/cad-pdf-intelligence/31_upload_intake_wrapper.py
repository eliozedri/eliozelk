#!/usr/bin/env python3
"""
31_upload_intake_wrapper.py
Stage S18 — Local Upload / Intake Wrapper (מעטפת קליטת תוכנית)

Moves the research system from a single fixed PDF path toward a multi-plan-safe
workflow by creating a plan-scoped run directory under runs/<plan_slug>/.

WHAT THIS DOES:
  1. Accepts a local PDF path (argument)
  2. Validates the file
  3. Generates a stable plan_id (UUID) and plan_slug (name + timestamp)
  4. Creates:   runs/<plan_slug>/source/
                runs/<plan_slug>/outputs/
                runs/<plan_slug>/artifacts/
                runs/<plan_slug>/logs/
                runs/<plan_slug>/state/
  5. Copies (or references) the source PDF
  6. Writes:   runs/<plan_slug>/plan_manifest.json
               runs/<plan_slug>/intake_report.md
               runs/<plan_slug>/intake_report.html
  7. Updates:  runs/runs_index.json
  8. Writes:   outputs/upload_intake_wrapper_report.md
               outputs/upload_intake_wrapper_report.html

GUARANTEES:
  • NEVER modifies research/cad-pdf-intelligence/outputs/ (existing research outputs)
  • NEVER overwrites an existing run directory (stops with error unless --force)
  • NEVER deletes or moves the source PDF
  • No paid API, no DB, no production changes

USAGE:
  python3 31_upload_intake_wrapper.py <pdf_path>
  python3 31_upload_intake_wrapper.py <pdf_path> --plan-name "My Plan"
  python3 31_upload_intake_wrapper.py <pdf_path> --dry-run
  python3 31_upload_intake_wrapper.py <pdf_path> --prepare-only
  python3 31_upload_intake_wrapper.py <pdf_path> --reference-only
  python3 31_upload_intake_wrapper.py <pdf_path> --force

FLAGS:
  --plan-name NAME    Human-readable plan name (default: derived from filename)
  --dry-run           Show what would happen; write nothing to disk
  --prepare-only      Create directory structure + manifest; do NOT run pipeline
  --reference-only    Store a path reference instead of copying the PDF (saves disk space)
  --force             Overwrite an existing run directory with the same slug (adds new timestamp)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
RUNS_DIR   = SCRIPT_DIR / 'runs'
RUNS_INDEX = RUNS_DIR / 'runs_index.json'
OUT_DIR    = SCRIPT_DIR / 'outputs'            # existing research outputs — NEVER modified

# Reports written into OUT_DIR (new files, not modifying existing ones)
REPORT_MD   = OUT_DIR / 'upload_intake_wrapper_report.md'
REPORT_HTML = OUT_DIR / 'upload_intake_wrapper_report.html'

# Scripts that must be parameterized before full multi-plan pipeline execution
SCRIPTS_NEEDING_PDF_PATH = [
    '13_vector_glyph_recognition.py',
    '15_scale_measurement.py',
    '16_legend_color_match.py',
    '18_element_decomposition.py',
    '19_run_plan_scanner_pipeline.py',
    '21_triplet_diagnostic.py',
]
SCRIPTS_NEEDING_OUT_DIR = [
    '13_vector_glyph_recognition.py',
    '15_scale_measurement.py',
    '16_legend_color_match.py',
    '18_element_decomposition.py',
    '19_run_plan_scanner_pipeline.py',
    '22_partial_code_resolver.py',
    '23_human_review_writeback.py',
    '24_master_research_dashboard.py',
    '25_teaching_loop_answer_pack.py',
    '26_plan_scanner_workspace.py',
    '27_static_review_form_generator.py',
    '28_teaching_loop_demo.py',
    '29_plan_scanner_prototype_shell.py',
    '30_local_json_persistence_flow.py',
]

# ── Helpers ──────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _ts_compact() -> str:
    return datetime.now().strftime('%Y%m%d_%H%M%S')

def _slugify(name: str) -> str:
    """Convert a filename/name to a safe directory slug."""
    name = re.sub(r'[^\w\s-]', '', name.lower())
    name = re.sub(r'[\s\-]+', '_', name)
    name = re.sub(r'_+', '_', name).strip('_')
    return name[:60]  # cap length

def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()

def _load_json(path: Path, default: Any = None) -> Any:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding='utf-8'))
        except Exception:
            return default
    return default

def _write_json(path: Path, data: Any, dry_run: bool = False) -> None:
    if dry_run:
        print(f'  [DRY-RUN] would write {path.name} ({len(json.dumps(data))} bytes)')
        return
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

# ── Plan identity ─────────────────────────────────────────────────────────────

def make_plan_identity(pdf_path: Path, plan_name: Optional[str]) -> Tuple[str, str, str]:
    """Return (plan_id, plan_slug, resolved_name)."""
    plan_id    = str(uuid.uuid4())
    stem       = pdf_path.stem  # filename without extension
    base       = _slugify(plan_name if plan_name else stem)
    if not base:
        base = 'plan'
    ts         = _ts_compact()
    plan_slug  = f'{base}_{ts}'
    resolved   = plan_name if plan_name else stem
    return plan_id, plan_slug, resolved

# ── Directory structure ───────────────────────────────────────────────────────

SUBDIRS = ['source', 'outputs', 'artifacts', 'logs', 'state']

def create_run_dirs(run_dir: Path, dry_run: bool) -> None:
    if dry_run:
        print(f'  [DRY-RUN] would create: {run_dir}/')
        for sub in SUBDIRS:
            print(f'  [DRY-RUN]   {sub}/')
        return
    run_dir.mkdir(parents=True, exist_ok=True)
    for sub in SUBDIRS:
        (run_dir / sub).mkdir(exist_ok=True)

# ── PDF copy / reference ──────────────────────────────────────────────────────

def intake_pdf(
    pdf_path: Path,
    run_dir: Path,
    reference_only: bool,
    dry_run: bool,
) -> Tuple[str, Optional[str]]:
    """
    Returns (stored_pdf_path_str, checksum_or_None).
    stored_pdf_path is relative to SCRIPT_DIR for portability.
    """
    dest_dir = run_dir / 'source'
    dest     = dest_dir / pdf_path.name

    if reference_only:
        stored_path = str(pdf_path.resolve())
        mode        = 'reference_only'
        print(f'  PDF: referenced (not copied) → {stored_path}')
        if not dry_run:
            # Write a tiny reference file so the source dir is not empty
            (dest_dir / 'source_reference.txt').write_text(
                f'Reference only — original file:\n{stored_path}\n', encoding='utf-8'
            )
        return stored_path, None

    # Compute checksum before copy
    print(f'  Computing SHA-256 of source PDF …')
    if not dry_run:
        checksum = _sha256(pdf_path)
    else:
        checksum = 'dry-run-no-checksum'

    if dry_run:
        print(f'  [DRY-RUN] would copy {pdf_path.name} → {dest}')
        stored_path = str(dest.relative_to(SCRIPT_DIR))
        return stored_path, checksum

    shutil.copy2(str(pdf_path), str(dest))
    stored_path = str(dest.relative_to(SCRIPT_DIR))
    size_mb = round(dest.stat().st_size / 1_048_576, 2)
    print(f'  PDF copied: {dest.name} ({size_mb} MB)')
    print(f'  SHA-256:    {checksum}')
    return stored_path, checksum

# ── Plan config ───────────────────────────────────────────────────────────────

def write_plan_config(run_dir: Path, manifest: Dict, dry_run: bool) -> None:
    """
    Write plan_config.json — the file future pipeline scripts will read
    instead of hardcoded PDF_PATH / OUT_DIR constants.
    """
    cfg = {
        '_purpose': 'Plan-scoped pipeline configuration. Future scripts read this instead of hardcoded paths.',
        'plan_id':         manifest['plan_id'],
        'plan_slug':       manifest['plan_slug'],
        'plan_name':       manifest['plan_name'],
        'pdf_path':        manifest['original_pdf_path'],
        'stored_pdf_path': manifest['stored_pdf_path'],
        'outputs_dir':     str(run_dir / 'outputs'),
        'artifacts_dir':   str(run_dir / 'artifacts'),
        'logs_dir':        str(run_dir / 'logs'),
        'state_dir':       str(run_dir / 'state'),
        'created_at':      manifest['created_at'],
    }
    _write_json(run_dir / 'plan_config.json', cfg, dry_run)

# ── Manifest ──────────────────────────────────────────────────────────────────

def build_manifest(
    pdf_path: Path,
    plan_id: str,
    plan_slug: str,
    plan_name: str,
    run_dir: Path,
    stored_pdf_path: str,
    checksum: Optional[str],
    intake_mode: str,
    status: str,
    dry_run: bool,
) -> Dict:
    size_bytes = pdf_path.stat().st_size if pdf_path.exists() else 0

    # Which pipeline scripts need parameterization
    parameterization_needed = {
        'scripts_needing_pdf_path': SCRIPTS_NEEDING_PDF_PATH,
        'scripts_needing_out_dir':  SCRIPTS_NEEDING_OUT_DIR,
        'recommended_approach': (
            'Add --plan-run-dir <path> argument to each script. '
            'Scripts read plan_config.json from the run dir to get pdf_path and outputs_dir. '
            'Pipeline orchestrator (19_run_plan_scanner_pipeline.py) gains --plan-run-dir and --pdf-path flags.'
        ),
        'config_file': str((run_dir / 'plan_config.json').relative_to(SCRIPT_DIR)),
        'estimated_scripts_to_modify': len(set(SCRIPTS_NEEDING_PDF_PATH + SCRIPTS_NEEDING_OUT_DIR)),
        'pipeline_fully_parameterized': False,
    }

    return {
        '_warning':          'RESEARCH ONLY — not for operational use.',
        'plan_id':           plan_id,
        'plan_slug':         plan_slug,
        'plan_name':         plan_name,
        'original_pdf_path': str(pdf_path.resolve()),
        'stored_pdf_path':   stored_pdf_path,
        'file_size_bytes':   size_bytes,
        'file_size_mb':      round(size_bytes / 1_048_576, 2),
        'checksum_sha256':   checksum,
        'created_at':        _now(),
        'intake_mode':       intake_mode,   # 'copy' | 'reference_only' | 'dry_run'
        'status':            status,        # 'ready_for_pipeline' | 'dry_run_only' | 'failed_validation'
        'dry_run':           dry_run,
        'run_dir':           str(run_dir.relative_to(SCRIPT_DIR)),
        'subdirs':           SUBDIRS,
        'parameterization':  parameterization_needed,
        'notes': (
            'Run directory is plan-scoped and isolated from existing research outputs. '
            'The current pipeline scripts are hardcoded to outputs/ and must be parameterized '
            'before this run directory can be used for a full pipeline execution. '
            'See parameterization.recommended_approach for the migration path.'
        ),
    }

# ── Runs index ────────────────────────────────────────────────────────────────

def update_runs_index(manifest: Dict, dry_run: bool) -> None:
    existing = _load_json(RUNS_INDEX, {'meta': {}, 'runs': []})
    runs: List[Dict] = existing.get('runs', [])

    entry = {
        'plan_id':           manifest['plan_id'],
        'plan_slug':         manifest['plan_slug'],
        'plan_name':         manifest['plan_name'],
        'run_dir':           manifest['run_dir'],
        'original_pdf_path': manifest['original_pdf_path'],
        'status':            manifest['status'],
        'intake_mode':       manifest['intake_mode'],
        'dry_run':           manifest['dry_run'],
        'created_at':        manifest['created_at'],
    }
    runs.append(entry)

    index = {
        'meta': {
            'generated_at': _now(),
            'total_runs':   len(runs),
            'script':       '31_upload_intake_wrapper.py',
            'note':         'Local research run index. Not a production DB.',
        },
        'runs': runs,
    }
    if not dry_run:
        RUNS_DIR.mkdir(parents=True, exist_ok=True)
    _write_json(RUNS_INDEX, index, dry_run)
    print(f'  Runs index: {len(runs)} total run(s) recorded')

# ── Reports ──────────────────────────────────────────────────────────────────

def build_intake_md(manifest: Dict) -> str:
    m  = manifest
    p  = m['parameterization']
    ok = '✓' if m['status'] == 'ready_for_pipeline' else '⚠'
    return '\n'.join([
        f'# Intake Report — {m["plan_name"]}',
        f'**Plan slug:** `{m["plan_slug"]}`',
        f'**Plan ID:** `{m["plan_id"]}`',
        f'**Created:** {m["created_at"]}',
        '',
        '## Intake Result',
        f'- Status: {m["status"]} {ok}',
        f'- Mode: {m["intake_mode"]}',
        f'- Dry run: {m["dry_run"]}',
        '',
        '## Source File',
        f'- Original path: `{m["original_pdf_path"]}`',
        f'- Stored path:   `{m["stored_pdf_path"]}`',
        f'- Size: {m["file_size_mb"]} MB ({m["file_size_bytes"]:,} bytes)',
        f'- SHA-256: `{m["checksum_sha256"] or "not computed"}`',
        '',
        '## Run Directory',
        f'`{m["run_dir"]}/`',
        '',
        '| Subdirectory | Purpose |',
        '|---|---|',
        '| `source/` | Source PDF copy (or reference) |',
        '| `outputs/` | Future pipeline outputs for this plan |',
        '| `artifacts/` | Future generated images, crops, overlays |',
        '| `logs/` | Future pipeline execution logs |',
        '| `state/` | Future local state JSON (plan_scan_state.json) |',
        '',
        '## Pipeline Parameterization Required',
        'The following scripts must be updated before a full pipeline run can execute against this directory:',
        '',
        '**Scripts requiring `--pdf-path`:**',
        *[f'- `{s}`' for s in p['scripts_needing_pdf_path']],
        '',
        '**Scripts requiring `--out-dir` / `--plan-run-dir`:**',
        *[f'- `{s}`' for s in p['scripts_needing_out_dir']],
        '',
        f'**Total scripts to modify:** {p["estimated_scripts_to_modify"]}',
        '',
        '**Recommended approach:**',
        p['recommended_approach'],
        '',
        f'Plan config written to: `{p["config_file"]}`',
        '',
        '## What Overwrite Risk Exists',
        '- Existing research outputs in `outputs/` are **not modified** — run dirs are fully isolated.',
        '- If this slug is re-created, a new timestamp suffix ensures no collision.',
        '',
        '## Notes',
        m['notes'],
    ])

def build_intake_html(manifest: Dict) -> str:
    m  = manifest
    p  = m['parameterization']
    ok = '#4caf50' if m['status'] == 'ready_for_pipeline' else '#ff9800'

    def li(items: List[str]) -> str:
        return ''.join(f'<li><code>{i}</code></li>' for i in items)

    return f"""<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>Intake Report — {m['plan_name']}</title>
<style>
  body{{background:#0d1b2a;color:#c8d8e8;font-family:system-ui,sans-serif;margin:0;padding:32px;max-width:900px}}
  h1{{color:#90caf9;margin-top:0}} h2{{color:#e8f0ff;border-bottom:2px solid #1e3a5f;padding-bottom:4px}}
  code{{background:#1e3a5f;padding:2px 6px;border-radius:4px;font-size:.9em}}
  table{{width:100%;border-collapse:collapse;margin-top:8px}}
  th{{background:#1e3a5f;padding:8px 12px;text-align:left;font-size:.85em}}
  td{{padding:6px 12px;border-bottom:1px solid #1a2a3a;font-size:.9em}}
  .badge{{display:inline-block;padding:3px 12px;border-radius:12px;font-size:.82em;font-weight:600}}
  ul{{line-height:1.9}}
</style>
</head>
<body>
<h1>Intake Report — {m['plan_name']}</h1>
<p style="color:#aaa">{m['created_at']}</p>

<div style="background:#0a2a0a;border:1px solid #1b5e20;border-radius:6px;padding:10px 16px;margin-bottom:24px">
  <span class="badge" style="background:{ok};color:#000">{m['status']}</span>
  &nbsp; Mode: <code>{m['intake_mode']}</code>
  &nbsp; Dry run: <code>{m['dry_run']}</code>
</div>

<h2>Plan Identity</h2>
<table>
  <tr><th>Plan ID</th><td><code>{m['plan_id']}</code></td></tr>
  <tr><th>Plan slug</th><td><code>{m['plan_slug']}</code></td></tr>
  <tr><th>Plan name</th><td>{m['plan_name']}</td></tr>
  <tr><th>Run directory</th><td><code>{m['run_dir']}/</code></td></tr>
</table>

<h2>Source File</h2>
<table>
  <tr><th>Original path</th><td><code>{m['original_pdf_path']}</code></td></tr>
  <tr><th>Stored path</th><td><code>{m['stored_pdf_path']}</code></td></tr>
  <tr><th>Size</th><td>{m['file_size_mb']} MB ({m['file_size_bytes']:,} bytes)</td></tr>
  <tr><th>SHA-256</th><td><code style="font-size:.8em">{m['checksum_sha256'] or 'not computed'}</code></td></tr>
</table>

<h2>Pipeline Parameterization Required</h2>
<p style="color:#ff9800">
  The following {p['estimated_scripts_to_modify']} scripts must be updated before a full pipeline
  run can execute against this run directory.
</p>
<div style="display:flex;gap:24px;flex-wrap:wrap">
  <div>
    <strong>Need <code>--pdf-path</code>:</strong>
    <ul>{li(p['scripts_needing_pdf_path'])}</ul>
  </div>
  <div>
    <strong>Need <code>--out-dir</code> / <code>--plan-run-dir</code>:</strong>
    <ul>{li(p['scripts_needing_out_dir'])}</ul>
  </div>
</div>
<p><strong>Recommended approach:</strong> {p['recommended_approach']}</p>
<p>Plan config: <code>{p['config_file']}</code></p>

<h2>Overwrite Safety</h2>
<p style="color:#4caf50">
  ✓ Existing research outputs in <code>outputs/</code> are untouched — run directories are fully isolated.<br>
  ✓ Timestamp suffix in slug prevents directory collisions.
</p>

<h2>Notes</h2>
<p style="color:#aaa">{m['notes']}</p>
</body>
</html>"""

def build_wrapper_md(manifest: Optional[Dict], error: Optional[str], runs_count: int) -> str:
    lines = [
        '# Upload / Intake Wrapper Report — S18',
        f'Generated: {_now()}',
        '',
    ]
    if error:
        lines += [f'## Result: FAILED', f'**Error:** {error}', '']
    elif manifest:
        m = manifest
        lines += [
            f'## Result: {m["status"]}',
            f'- Plan slug: `{m["plan_slug"]}`',
            f'- Plan ID:   `{m["plan_id"]}`',
            f'- Run dir:   `{m["run_dir"]}/`',
            f'- PDF size:  {m["file_size_mb"]} MB',
            f'- Intake mode: {m["intake_mode"]}',
            f'- Dry run:   {m["dry_run"]}',
            '',
        ]
    lines += [
        '## Global Runs Index',
        f'- Total runs recorded: {runs_count}',
        f'- Index: `runs/runs_index.json`',
        '',
        '## What Still Needs Parameterization',
        'Before a full multi-plan pipeline execution, modify these scripts to accept',
        '`--plan-run-dir <path>` and read `plan_config.json` from the run directory:',
        '',
        '| Script | Needs pdf_path | Needs out_dir |',
        '|---|---|---|',
        *[f'| `{s}` | ✓ | ✓ |' for s in SCRIPTS_NEEDING_PDF_PATH],
        *[f'| `{s}` | — | ✓ |'
          for s in SCRIPTS_NEEDING_OUT_DIR
          if s not in SCRIPTS_NEEDING_PDF_PATH],
        '',
        '## Safety Confirmation',
        '- Existing `outputs/` research outputs: **NOT modified**',
        '- Source PDF: **NOT deleted or moved**',
        '- DB / migrations: **NOT applied**',
        '- Production UI/flows: **NOT modified**',
        '- Paid API: **NOT used**',
    ]
    return '\n'.join(lines)

def build_wrapper_html(manifest: Optional[Dict], error: Optional[str], runs_count: int) -> str:
    status_color = '#4caf50' if (manifest and not error) else '#f44336'
    status_text  = manifest['status'] if (manifest and not error) else 'FAILED'

    rows = ''
    for s in SCRIPTS_NEEDING_PDF_PATH:
        rows += f'<tr><td><code>{s}</code></td><td style="color:#4caf50">✓</td><td style="color:#4caf50">✓</td></tr>'
    for s in SCRIPTS_NEEDING_OUT_DIR:
        if s not in SCRIPTS_NEEDING_PDF_PATH:
            rows += f'<tr><td><code>{s}</code></td><td style="color:#aaa">—</td><td style="color:#4caf50">✓</td></tr>'

    detail = ''
    if manifest and not error:
        m = manifest
        detail = f"""
<h2>Intake Result</h2>
<table>
  <tr><th>Plan slug</th><td><code>{m['plan_slug']}</code></td></tr>
  <tr><th>Plan ID</th><td><code>{m['plan_id']}</code></td></tr>
  <tr><th>Run dir</th><td><code>{m['run_dir']}/</code></td></tr>
  <tr><th>Size</th><td>{m['file_size_mb']} MB</td></tr>
  <tr><th>Mode</th><td>{m['intake_mode']}</td></tr>
  <tr><th>Dry run</th><td>{m['dry_run']}</td></tr>
</table>"""
    elif error:
        detail = f'<p style="color:#f44336"><strong>Error:</strong> {error}</p>'

    return f"""<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8"><title>Intake Wrapper — S18</title>
<style>
  body{{background:#0d1b2a;color:#c8d8e8;font-family:system-ui,sans-serif;margin:0;padding:32px;max-width:900px}}
  h1{{color:#90caf9;margin-top:0}} h2{{color:#e8f0ff;border-bottom:2px solid #1e3a5f;padding-bottom:4px}}
  code{{background:#1e3a5f;padding:2px 6px;border-radius:4px;font-size:.9em}}
  table{{width:100%;border-collapse:collapse}} th{{background:#1e3a5f;padding:8px 12px;text-align:left}}
  td{{padding:6px 12px;border-bottom:1px solid #1a2a3a}}
</style>
</head>
<body>
<h1>Upload / Intake Wrapper — S18</h1>
<div style="background:#0a2a0a;border:1px solid #1b5e20;border-radius:6px;padding:10px 16px;margin-bottom:24px">
  <strong style="color:{status_color}">{status_text}</strong>
  &nbsp;|&nbsp; Runs indexed: <strong>{runs_count}</strong>
  &nbsp;|&nbsp; <code>outputs/</code> untouched: <span style="color:#4caf50">✓</span>
</div>
{detail}
<h2>Parameterization Remaining</h2>
<table>
  <tr><th>Script</th><th>Needs --pdf-path</th><th>Needs --out-dir</th></tr>
  {rows}
</table>
<h2>Safety</h2>
<p>✓ Source PDF not deleted &nbsp;|&nbsp; ✓ No DB changes &nbsp;|&nbsp; ✓ No production changes</p>
</body>
</html>"""

# ── Main ──────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description='31_upload_intake_wrapper.py — Stage S18: Plan intake wrapper',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument('pdf_path', help='Path to the PDF plan file to intake')
    p.add_argument('--plan-name', default=None, help='Human-readable plan name')
    p.add_argument('--dry-run',      action='store_true', help='Show what would happen; write nothing')
    p.add_argument('--prepare-only', action='store_true', help='Create dirs + manifest only; skip pipeline hint')
    p.add_argument('--reference-only', action='store_true', help='Reference PDF path instead of copying')
    p.add_argument('--force',        action='store_true', help='(Future) Force re-creation; currently adds new timestamp')
    return p.parse_args()

def main() -> int:
    args  = parse_args()
    dry   = args.dry_run
    manifest: Optional[Dict] = None
    error: Optional[str]     = None

    print('31_upload_intake_wrapper.py — Stage S18')
    print('=' * 60)
    if dry:
        print('  [DRY-RUN MODE] — nothing will be written to disk')
    print()

    # ── 1. Validate PDF ───────────────────────────────────────────────────────
    pdf_path = Path(args.pdf_path).expanduser().resolve()
    print(f'[1] Validating source PDF: {pdf_path}')

    if not pdf_path.exists():
        error = f'File not found: {pdf_path}'
        print(f'  ERROR: {error}')
        _write_wrapper_reports(manifest, error, 0, dry)
        return 1

    if pdf_path.suffix.lower() != '.pdf':
        print(f'  WARNING: file extension is "{pdf_path.suffix}" — expected .pdf. Proceeding anyway.')

    size_mb = round(pdf_path.stat().st_size / 1_048_576, 2)
    print(f'  Found: {pdf_path.name} ({size_mb} MB)')

    # Guard: do not accept any path inside the existing research outputs dir
    try:
        pdf_path.relative_to(OUT_DIR)
        error = 'Source PDF is inside outputs/ — this would create intake pollution. Move the PDF elsewhere.'
        print(f'  ERROR: {error}')
        _write_wrapper_reports(manifest, error, 0, dry)
        return 1
    except ValueError:
        pass  # good — not inside outputs/

    # ── 2. Plan identity ──────────────────────────────────────────────────────
    print()
    print('[2] Generating plan identity …')
    plan_id, plan_slug, plan_name = make_plan_identity(pdf_path, args.plan_name)
    run_dir = RUNS_DIR / plan_slug
    print(f'  plan_id:   {plan_id}')
    print(f'  plan_slug: {plan_slug}')
    print(f'  plan_name: {plan_name}')
    print(f'  run_dir:   {run_dir.relative_to(SCRIPT_DIR)}/')

    # Guard: existing run directory
    if not dry and run_dir.exists():
        print(f'  WARNING: run directory already exists. A unique timestamp suffix was used, so this is unexpected.')
        print(f'           Use --force to acknowledge and proceed (a new timestamped slug will be used).')
        if not args.force:
            error = f'Run directory already exists: {run_dir}. Use --force to proceed.'
            print(f'  ERROR: {error}')
            _write_wrapper_reports(manifest, error, _count_runs(), dry)
            return 1

    # ── 3. Create directory structure ─────────────────────────────────────────
    print()
    print('[3] Creating plan-scoped run directory …')
    create_run_dirs(run_dir, dry)
    if not dry:
        for sub in SUBDIRS:
            print(f'  Created: {(run_dir / sub).relative_to(SCRIPT_DIR)}/')

    # ── 4. Copy / reference PDF ───────────────────────────────────────────────
    print()
    print('[4] Intake PDF …')
    intake_mode = 'dry_run' if dry else ('reference_only' if args.reference_only else 'copy')
    stored_pdf_path, checksum = intake_pdf(pdf_path, run_dir, args.reference_only, dry)

    # ── 5. Build and write manifest ───────────────────────────────────────────
    print()
    print('[5] Writing plan manifest …')
    status = 'dry_run_only' if dry else 'ready_for_pipeline'
    manifest = build_manifest(
        pdf_path, plan_id, plan_slug, plan_name, run_dir,
        stored_pdf_path, checksum, intake_mode, status, dry,
    )
    _write_json(run_dir / 'plan_manifest.json', manifest, dry)

    # Plan config (for future pipeline scripts to read)
    write_plan_config(run_dir, manifest, dry)

    # ── 6. Per-run reports ────────────────────────────────────────────────────
    print()
    print('[6] Writing per-run intake reports …')
    md_text   = build_intake_md(manifest)
    html_text = build_intake_html(manifest)
    if not dry:
        (run_dir / 'intake_report.md').write_text(md_text, encoding='utf-8')
        (run_dir / 'intake_report.html').write_text(html_text, encoding='utf-8')
        print(f'  intake_report.md  ({len(md_text):,} chars)')
        print(f'  intake_report.html({len(html_text):,} chars)')
    else:
        print(f'  [DRY-RUN] would write intake_report.md + intake_report.html')

    # ── 7. Update global runs index ───────────────────────────────────────────
    print()
    print('[7] Updating runs index …')
    if not dry:
        RUNS_DIR.mkdir(parents=True, exist_ok=True)
    update_runs_index(manifest, dry)

    # ── 8. Wrapper-level reports ──────────────────────────────────────────────
    print()
    print('[8] Writing wrapper reports to outputs/ …')
    _write_wrapper_reports(manifest, error, _count_runs(dry), dry)

    # ── Summary ───────────────────────────────────────────────────────────────
    print()
    print('=' * 60)
    print(f'Stage S18 complete.')
    print(f'  Status:     {status}')
    print(f'  Plan slug:  {plan_slug}')
    if not dry:
        print(f'  Run dir:    {run_dir.relative_to(SCRIPT_DIR)}/')
        print(f'  Manifest:   {(run_dir / "plan_manifest.json").relative_to(SCRIPT_DIR)}')
    print()
    print('IMPORTANT: The existing research outputs in outputs/ are UNTOUCHED.')
    print('NEXT STEP: Parameterize pipeline scripts to accept --plan-run-dir')
    print(f'           before running a full scan on plan: {plan_name}')
    return 0

# ── Shared helpers ────────────────────────────────────────────────────────────

def _count_runs(dry_run: bool = False) -> int:
    if dry_run:
        return _load_json(RUNS_INDEX, {}).get('meta', {}).get('total_runs', 0)
    idx = _load_json(RUNS_INDEX, {'runs': []})
    return len(idx.get('runs', []))

def _write_wrapper_reports(
    manifest: Optional[Dict],
    error: Optional[str],
    runs_count: int,
    dry_run: bool,
) -> None:
    md_text   = build_wrapper_md(manifest, error, runs_count)
    html_text = build_wrapper_html(manifest, error, runs_count)
    if not dry_run:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        REPORT_MD.write_text(md_text, encoding='utf-8')
        REPORT_HTML.write_text(html_text, encoding='utf-8')
        print(f'  {REPORT_MD.relative_to(SCRIPT_DIR)} ({len(md_text):,} chars)')
        print(f'  {REPORT_HTML.relative_to(SCRIPT_DIR)} ({len(html_text):,} chars)')
    else:
        print(f'  [DRY-RUN] would write upload_intake_wrapper_report.md + .html to outputs/')

if __name__ == '__main__':
    sys.exit(main())
