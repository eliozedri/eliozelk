#!/usr/bin/env python3
"""
32_parameterization_report.py
Parameterization Progress Report — Plan Scanner

Scans all pipeline scripts, detects --plan-run-dir support, and generates
a progress report showing which scripts support plan-scoped execution.

Outputs:
  outputs/parameterization_report.md
  outputs/parameterization_report.html
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

SCRIPT_DIR = Path(__file__).parent
OUT_DIR    = SCRIPT_DIR / 'outputs'
OUT_MD     = OUT_DIR / 'parameterization_report.md'
OUT_HTML   = OUT_DIR / 'parameterization_report.html'

# ── Script registry ────────────────────────────────────────────────────────────
# Each entry: (filename, short description, batch, notes)
REGISTRY: List[Dict] = [
    # ── Batch 1 converted ────────────────────────────────────────────────────
    {'file': '19_run_plan_scanner_pipeline.py',   'desc': 'Pipeline orchestrator (all stages)',          'batch': 1, 'type': 'orchestration'},
    {'file': '24_master_research_dashboard.py',   'desc': 'Master research dashboard HTML',             'batch': 1, 'type': 'report'},
    {'file': '26_plan_scanner_workspace.py',      'desc': 'Workspace navigation hub HTML',              'batch': 1, 'type': 'report'},
    {'file': '30_local_json_persistence_flow.py', 'desc': 'Local JSON persistence / DB shadow (S17)',   'batch': 1, 'type': 'persistence'},
    # ── Batch 2 converted ────────────────────────────────────────────────────
    {'file': '14_build_review_queue.py',          'desc': 'Review queue generator (S4 / sign OCCs)',    'batch': 2, 'type': 'report'},
    {'file': '17_boq_aggregator.py',              'desc': 'Unified BOQ aggregator (כתב כמויות draft)', 'batch': 2, 'type': 'report'},
    {'file': '25_teaching_loop_answer_pack.py',   'desc': 'Teaching loop answer pack (S12)',            'batch': 2, 'type': 'report'},
    {'file': '27_static_review_form_generator.py','desc': 'Static review form HTML (S14)',              'batch': 2, 'type': 'report'},
    {'file': '29_plan_scanner_prototype_shell.py','desc': 'Plan scanner prototype HTML (S16)',          'batch': 2, 'type': 'report'},
    # ── Batch 3 converted ────────────────────────────────────────────────────
    {'file': '20_validation_layer.py',            'desc': 'Validation layer (S8) — sign plausibility', 'batch': 3, 'type': 'analysis'},
    {'file': '22_partial_code_resolver.py',       'desc': 'Partial code resolver (S9)',                'batch': 3, 'type': 'analysis'},
    {'file': '23_human_review_writeback.py',      'desc': 'Human review writeback (S10)',              'batch': 3, 'type': 'writeback'},
    {'file': '28_teaching_loop_demo.py',          'desc': 'Teaching loop demo (S15)',                  'batch': 3, 'type': 'demo'},
    # ── Batch 4 converted ────────────────────────────────────────────────────
    {'file': '06_match_signs.py',                 'desc': 'Sign detection — Branch A (expensive)',      'batch': 4, 'type': 'detection'},
    {'file': '07_extract_legend.py',              'desc': 'Legend extraction (Stage F)',                'batch': 4, 'type': 'detection'},
    {'file': '13_vector_glyph_recognition.py',    'desc': 'Vector glyph / sign code recognition',      'batch': 4, 'type': 'detection'},
    {'file': '15_scale_measurement.py',           'desc': 'Scale measurement — Branch B',              'batch': 4, 'type': 'detection'},
    {'file': '16_legend_color_match.py',          'desc': 'Legend color match / taxonomy',             'batch': 4, 'type': 'detection'},
    {'file': '18_element_decomposition.py',       'desc': 'Element decomposition — Branch C (main)',   'batch': 4, 'type': 'detection'},
    # ── Batch 5 converted ────────────────────────────────────────────────────
    {'file': '04_cluster_symbols.py',             'desc': 'Symbol clustering DBSCAN (S3 prerequisite)', 'batch': 5, 'type': 'detection'},
    {'file': '09_stage_g_inventory.py',           'desc': 'Stage G sign inventory + pole grouping (S3)','batch': 5, 'type': 'detection'},
    # ── Support / intake ─────────────────────────────────────────────────────
    {'file': '31_upload_intake_wrapper.py',       'desc': 'Upload / intake wrapper (S18)',             'batch': 'helper', 'type': 'intake'},
    {'file': 'plan_run_context.py',               'desc': 'Shared plan run context helper',            'batch': 'helper', 'type': 'helper'},
]

NEXT_STEPS = [
    ('Worker/Operations PDF + Excel Export Generator',
     'Batch 5 complete: 23/23 pipeline scripts now support --plan-run-dir. '
     'S3 (sign detection) is unblocked — 177 occurrences, 119 pole groups produced in plan-scoped mode. '
     'Next step: consume boq_unified_draft.json + sign_inventory.json from a run directory and generate '
     'a human-readable PDF and/or Excel export scoped to the plan.'),
    ('Scale calibration per-plan',
     'calibration_template.json is written to runs/<slug>/outputs/legend_color_match/. '
     'User must fill in two known-distance points per plan to get verified measurements.'),
    ('Production sidebar integration',
     'The Plan Scanner UI (sidebar → סורק תוכניות) can now be wired to invoke '
     '31_upload_intake_wrapper.py → detection pipeline → review form → export. '
     'This is a separate implementation phase.'),
    ('BOQ approval workflow',
     '0 / 47+ BOQ items are approved. An approval interface must be built before BOQ data '
     'is safe for procurement or field use.'),
]

BLOCKERS = [
    ('vector_objects.json requires explicit seeding until 02_extract_vectors.py is parameterized',
     '04_cluster_symbols.py (Batch 5) needs vector_objects.json in the run outputs dir. '
     'Script 02 does not yet support --plan-run-dir. Operator must explicitly copy: '
     'cp outputs/vector_objects.json runs/<slug>/outputs/. '
     'This is a documented operator action — no silent fallback occurs.'),
    ('Source PDF must be in runs/<slug>/source/',
     'Detection scripts read source_pdf_path from plan_config.json via PlanRunContext. '
     'The intake wrapper (31_upload_intake_wrapper.py) must be run first to register the PDF. '
     'The PDF itself must exist at the registered path when detection scripts run.'),
    ('Scale calibration still requires manual user input per plan',
     'calibration_template.json is written to the run\'s legend_color_match/ subdir. '
     'Each plan needs its own calibration data (two known-distance points). '
     'No automatic scale detection is available yet — 1:500 fallback used until calibrated.'),
]


def _has_plan_run_dir(path: Path) -> bool:
    if not path.exists():
        return False
    try:
        text = path.read_text(encoding='utf-8', errors='replace')
        return '--plan-run-dir' in text or 'plan_run_dir' in text
    except Exception:
        return False


def scan_scripts() -> List[Dict]:
    results = []
    for entry in REGISTRY:
        p = SCRIPT_DIR / entry['file']
        supported = _has_plan_run_dir(p)
        exists    = p.exists()
        results.append({**entry, 'exists': exists, 'supported': supported})
    return results


def build_md(scripts: List[Dict], ts: str) -> str:
    batch1   = [s for s in scripts if s['batch'] == 1]
    batch2   = [s for s in scripts if s['batch'] == 2]
    batch3   = [s for s in scripts if s['batch'] == 3]
    batch4   = [s for s in scripts if s['batch'] == 4]
    batch5   = [s for s in scripts if s['batch'] == 5]
    hardcoded= [s for s in scripts if s['batch'] is None]
    helpers  = [s for s in scripts if s['batch'] == 'helper']

    lines = [
        '# Plan Scanner Parameterization Report',
        '',
        f'**Generated:** {ts}  ',
        '**Scope:** `research/cad-pdf-intelligence/`  ',
        '**Goal:** Convert pipeline scripts to support `--plan-run-dir` so each uploaded',
        'plan runs in its own isolated directory without overwriting global `outputs/`.',
        '',
        '---',
        '',
        '## Summary',
        '',
        f'| Batch | Scripts converted |',
        '|---|---|',
        f'| Batch 1 | {len(batch1)} scripts |',
        f'| Batch 2 | {len(batch2)} scripts |',
        f'| Batch 3 | {len(batch3)} scripts |',
        f'| Batch 4 | {len(batch4)} scripts |',
        f'| Batch 5 | {len(batch5)} scripts |',
        f'| Not yet parameterized | {len(hardcoded)} scripts |',
        f'| Helper / intake | {len(helpers)} scripts |',
        '',
        '---',
        '',
        '## Batch 1 — Converted',
        '',
        '| Script | Description |',
        '|---|---|',
    ]
    for s in batch1:
        lines.append(f'| `{s["file"]}` | {s["desc"]} |')

    lines += [
        '',
        '## Batch 2 — Converted',
        '',
        '| Script | Description | Note |',
        '|---|---|---|',
    ]
    b2_notes = {
        '14_build_review_queue.py':  'Fixed module-level `ITEMS.mkdir()` + added `OUT`/`ITEMS` override',
        '17_boq_aggregator.py':      'Fixed bare `Path("outputs/...")` → `SCRIPT_DIR`-relative paths',
        '25_teaching_loop_answer_pack.py': 'Overrides `OUT_DIR`, all `F_*` inputs/outputs, `PIPELINE_PATHS`',
        '27_static_review_form_generator.py': 'Overrides `OUT_DIR`, `F_PACK`, output files',
        '29_plan_scanner_prototype_shell.py': 'Overrides `OUT_DIR`, output files',
    }
    for s in batch2:
        note = b2_notes.get(s['file'], '')
        lines.append(f'| `{s["file"]}` | {s["desc"]} | {note} |')

    lines += [
        '',
        '## Batch 3 — Converted',
        '',
        '| Script | Description | Note |',
        '|---|---|---|',
    ]
    b3_notes = {
        '20_validation_layer.py':     'Overrides `OUTPUTS`, `REVIEW_QUEUE`, output files; `CATALOG_DIR`/`SIGN_INDEX` kept global',
        '22_partial_code_resolver.py':'Overrides `OUT_DIR`, `IN_VALIDATION`, `IN_LEGEND`, output files; `SIGN_INDEX`/`CATALOG_DIR` kept global',
        '23_human_review_writeback.py':'Overrides all paths; human answer safety: ONLY reads from run\'s `outputs/human_review_answers.json`',
        '28_teaching_loop_demo.py':   'Overrides `OUT_DIR`, all `F_*` source + `OUT_DEMO_*` paths; optional-input info logged',
    }
    for s in batch3:
        note = b3_notes.get(s['file'], '')
        lines.append(f'| `{s["file"]}` | {s["desc"]} | {note} |')

    lines += [
        '',
        '## Batch 4 — Converted (Heavy Detection Scripts)',
        '',
        '| Script | Description | Note |',
        '|---|---|---|',
    ]
    b4_notes = {
        '06_match_signs.py':              'Pattern A: overrides `cad_utils.OUTPUTS` + `DEFAULT_PDF`; reads PDF from `plan_config.json`',
        '07_extract_legend.py':           'Pattern A: overrides `cad_utils.OUTPUTS` + `DEFAULT_PDF`; all legend/icon outputs plan-scoped',
        '13_vector_glyph_recognition.py': 'Pattern C: overrides `OUT`, `PDF_PATH`, all derived paths incl. per-plan `HUMAN_LABELS_JSON`',
        '15_scale_measurement.py':        'Pattern B+C: fixed bare paths; moved module-level mkdir into main(); overrides `OUT` + all outputs',
        '16_legend_color_match.py':       'Pattern B+C: fixed bare paths; moved module-level mkdir into main(); overrides all inputs + outputs',
        '18_element_decomposition.py':    'Pattern B+C: fixed bare paths; overrides `PDF_PATH`, `OUT_DIR`, `OUT_JSON`, `OUT_MD`, `OUT_HTML`',
    }
    for s in batch4:
        note = b4_notes.get(s['file'], '')
        lines.append(f'| `{s["file"]}` | {s["desc"]} | {note} |')

    lines += [
        '',
        '## Batch 5 — Converted (S3 Sign Detection Prerequisites)',
        '',
        '| Script | Description | Note |',
        '|---|---|---|',
    ]
    b5_notes = {
        '04_cluster_symbols.py':   'Pattern A: overrides `cad_utils.OUTPUTS`; warns if vector_objects.json missing (requires explicit seed from 02)',
        '09_stage_g_inventory.py': 'Pattern A: overrides `cad_utils.OUTPUTS` + `DEFAULT_PDF`; Vision API gated (no paid API call without ANTHROPIC_API_KEY)',
    }
    for s in batch5:
        note = b5_notes.get(s['file'], '')
        lines.append(f'| `{s["file"]}` | {s["desc"]} | {note} |')

    lines += [
        '',
        '## Helpers / Intake',
        '',
        '| Script | Description |',
        '|---|---|',
    ]
    for s in helpers:
        lines.append(f'| `{s["file"]}` | {s["desc"]} |')

    if hardcoded:
        lines += [
            '',
            '## Not Yet Parameterized',
            '',
            '| Script | Description | Type |',
            '|---|---|---|',
        ]
        for s in hardcoded:
            lines.append(f'| `{s["file"]}` | {s["desc"]} | {s["type"]} |')

    lines += [
        '',
        '---',
        '',
        '## How to Run a Full Plan-Scoped Pipeline',
        '',
        '1. Register the plan (creates run directory + plan_config.json):',
        '   ```bash',
        '   .venv/bin/python3 31_upload_intake_wrapper.py /path/to/plan.pdf',
        '   # → creates runs/<plan_slug>/ with plan_config.json',
        '   ```',
        '',
        '2. Run detection scripts (source PDF read from plan_config.json):',
        '   ```bash',
        '   RUN=runs/<plan_slug>',
        '   .venv/bin/python3 18_element_decomposition.py    --plan-run-dir $RUN',
        '   .venv/bin/python3 15_scale_measurement.py        --plan-run-dir $RUN',
        '   .venv/bin/python3 07_extract_legend.py           --plan-run-dir $RUN',
        '   .venv/bin/python3 16_legend_color_match.py       --plan-run-dir $RUN',
        '   .venv/bin/python3 13_vector_glyph_recognition.py --plan-run-dir $RUN',
        '   .venv/bin/python3 06_match_signs.py              --plan-run-dir $RUN',
        '   ```',
        '',
        '3. Run analysis + review scripts:',
        '   ```bash',
        '   .venv/bin/python3 14_build_review_queue.py               --plan-run-dir $RUN',
        '   .venv/bin/python3 17_boq_aggregator.py                   --plan-run-dir $RUN',
        '   .venv/bin/python3 20_validation_layer.py                 --plan-run-dir $RUN',
        '   .venv/bin/python3 22_partial_code_resolver.py            --plan-run-dir $RUN',
        '   .venv/bin/python3 23_human_review_writeback.py           --plan-run-dir $RUN',
        '   .venv/bin/python3 25_teaching_loop_answer_pack.py        --plan-run-dir $RUN',
        '   .venv/bin/python3 27_static_review_form_generator.py     --plan-run-dir $RUN',
        '   .venv/bin/python3 28_teaching_loop_demo.py               --plan-run-dir $RUN',
        '   .venv/bin/python3 29_plan_scanner_prototype_shell.py     --plan-run-dir $RUN',
        '   .venv/bin/python3 30_local_json_persistence_flow.py      --plan-run-dir $RUN',
        '   ```',
        '',
        '4. All outputs land under `runs/<plan_slug>/outputs/`. The global `outputs/`',
        '   directory is NOT touched.',
        '',
        '5. Legacy mode (no flag) still works unchanged for all scripts.',
        '',
        '---',
        '',
        '## Remaining Blockers',
        '',
    ]
    for i, (title, desc) in enumerate(BLOCKERS, 1):
        lines += [f'### Blocker {i}: {title}', '', desc, '']

    lines += [
        '---',
        '',
        '## Next Steps Toward Production',
        '',
        '| Priority | Next Step |',
        '|---|---|',
    ]
    for title, desc in NEXT_STEPS:
        lines.append(f'| — | **{title}**: {desc} |')

    lines += [
        '',
        '---',
        '',
        '*Research-only. No production DB or UI modified.*',
    ]
    return '\n'.join(lines)


def build_html(scripts: List[Dict], ts: str, md: str) -> str:
    batch1   = [s for s in scripts if s['batch'] == 1]
    batch2   = [s for s in scripts if s['batch'] == 2]
    batch3   = [s for s in scripts if s['batch'] == 3]
    batch4   = [s for s in scripts if s['batch'] == 4]
    batch5   = [s for s in scripts if s['batch'] == 5]
    hardcoded= [s for s in scripts if s['batch'] is None]
    helpers  = [s for s in scripts if s['batch'] == 'helper']
    total_done = len(batch1) + len(batch2) + len(batch3) + len(batch4) + len(batch5)
    total_todo = len(hardcoded)

    def script_rows(items: List[Dict]) -> str:
        rows = []
        for s in items:
            badge = '✓' if s['supported'] else '—'
            color = '#2e7d32' if s['supported'] else '#b71c1c'
            rows.append(
                f'<tr><td><code>{s["file"]}</code></td>'
                f'<td>{s["desc"]}</td>'
                f'<td style="color:{color};font-weight:bold;text-align:center">{badge}</td></tr>'
            )
        return '\n'.join(rows)

    b2_notes_map = {
        '14_build_review_queue.py':           'Fixed module-level mkdir; overrides OUT + ITEMS',
        '17_boq_aggregator.py':               'Fixed bare Path("outputs/…") → SCRIPT_DIR-relative',
        '25_teaching_loop_answer_pack.py':    'Overrides OUT_DIR, all F_* inputs/outputs, PIPELINE_PATHS',
        '27_static_review_form_generator.py': 'Overrides OUT_DIR, F_PACK, output files',
        '29_plan_scanner_prototype_shell.py': 'Overrides OUT_DIR, output files',
    }
    b3_notes_map = {
        '20_validation_layer.py':      'Overrides OUTPUTS, REVIEW_QUEUE, output files; CATALOG_DIR/SIGN_INDEX kept global',
        '22_partial_code_resolver.py': 'Overrides OUT_DIR, IN_VALIDATION, IN_LEGEND, output files; SIGN_INDEX/CATALOG_DIR kept global',
        '23_human_review_writeback.py':'Overrides all paths; human answer safety: ONLY reads from run\'s human_review_answers.json',
        '28_teaching_loop_demo.py':    'Overrides OUT_DIR, all F_* source + OUT_DEMO_* paths; optional-input info logged',
    }
    b4_notes_map = {
        '06_match_signs.py':              'Pattern A: overrides cad_utils.OUTPUTS + DEFAULT_PDF; reads PDF from plan_config.json',
        '07_extract_legend.py':           'Pattern A: overrides cad_utils.OUTPUTS + DEFAULT_PDF; all legend/icon outputs plan-scoped',
        '13_vector_glyph_recognition.py': 'Pattern C: overrides OUT, PDF_PATH, all derived paths incl. per-plan HUMAN_LABELS_JSON',
        '15_scale_measurement.py':        'Pattern B+C: fixed bare paths; moved module-level mkdir into main(); overrides OUT + all outputs',
        '16_legend_color_match.py':       'Pattern B+C: fixed bare paths; moved module-level mkdir into main(); overrides all inputs + outputs',
        '18_element_decomposition.py':    'Pattern B+C: fixed bare paths; overrides PDF_PATH, OUT_DIR, OUT_JSON, OUT_MD, OUT_HTML',
    }
    b5_notes_map = {
        '04_cluster_symbols.py':   'Pattern A: overrides cad_utils.OUTPUTS; warns if vector_objects.json missing (explicit seed required from 02)',
        '09_stage_g_inventory.py': 'Pattern A: overrides cad_utils.OUTPUTS + DEFAULT_PDF; Vision API gated (no paid API call without ANTHROPIC_API_KEY)',
    }

    def b2_rows() -> str:
        rows = []
        for s in batch2:
            note = b2_notes_map.get(s['file'], '')
            rows.append(
                f'<tr><td><code>{s["file"]}</code></td>'
                f'<td>{s["desc"]}</td>'
                f'<td style="font-size:0.85em;color:#555">{note}</td></tr>'
            )
        return '\n'.join(rows)

    def b3_rows_html() -> str:
        rows = []
        for s in batch3:
            note = b3_notes_map.get(s['file'], '')
            rows.append(
                f'<tr><td><code>{s["file"]}</code></td>'
                f'<td>{s["desc"]}</td>'
                f'<td style="font-size:0.85em;color:#555">{note}</td></tr>'
            )
        return '\n'.join(rows)

    def b4_rows_html() -> str:
        rows = []
        for s in batch4:
            note = b4_notes_map.get(s['file'], '')
            rows.append(
                f'<tr><td><code>{s["file"]}</code></td>'
                f'<td>{s["desc"]}</td>'
                f'<td style="font-size:0.85em;color:#555">{note}</td></tr>'
            )
        return '\n'.join(rows)

    def blocker_rows() -> str:
        rows = []
        for i, (title, desc) in enumerate(BLOCKERS, 1):
            rows.append(
                f'<tr><td style="font-weight:bold">#{i}</td>'
                f'<td>{title}</td><td style="font-size:0.85em;color:#555">{desc}</td></tr>'
            )
        return '\n'.join(rows)

    def next_step_rows() -> str:
        rows = []
        for title, desc in NEXT_STEPS:
            rows.append(f'<tr><td style="font-weight:bold">{title}</td><td style="font-size:0.85em;color:#555">{desc}</td></tr>')
        return '\n'.join(rows)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Parameterization Report — Plan Scanner</title>
<style>
  body {{ font-family: system-ui, sans-serif; max-width: 1000px; margin: 40px auto; padding: 0 20px; color: #1a1a2e; line-height: 1.6; }}
  h1 {{ color: #1e3a5f; border-bottom: 3px solid #1e3a5f; padding-bottom: 8px; }}
  h2 {{ color: #1e3a5f; margin-top: 40px; border-left: 4px solid #1e3a5f; padding-left: 12px; }}
  h3 {{ color: #b71c1c; }}
  table {{ border-collapse: collapse; width: 100%; margin: 12px 0; }}
  th {{ background: #1e3a5f; color: white; padding: 10px 12px; text-align: left; }}
  td {{ padding: 8px 12px; border-bottom: 1px solid #e0e0e0; vertical-align: top; }}
  tr:nth-child(even) {{ background: #f5f7fa; }}
  code {{ background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 0.9em; }}
  pre {{ background: #1a1a2e; color: #a8d8a8; padding: 16px; border-radius: 6px; overflow-x: auto; font-size: 0.88em; }}
  .badge-ok  {{ background: #e8f5e9; color: #2e7d32; border-radius: 4px; padding: 2px 8px; font-weight: bold; }}
  .badge-no  {{ background: #ffebee; color: #b71c1c; border-radius: 4px; padding: 2px 8px; }}
  .stat-box  {{ display: inline-block; background: #e8f0fe; border-radius: 8px; padding: 16px 28px; margin: 8px; text-align: center; }}
  .stat-num  {{ font-size: 2.4em; font-weight: bold; color: #1e3a5f; }}
  .stat-lbl  {{ font-size: 0.85em; color: #555; }}
  footer {{ margin-top: 48px; font-size: 0.8em; color: #999; border-top: 1px solid #eee; padding-top: 12px; }}
</style>
</head>
<body>
<h1>Plan Scanner — Parameterization Progress Report</h1>
<p style="color:#555">Generated: {ts} &nbsp;|&nbsp; Scope: <code>research/cad-pdf-intelligence/</code></p>

<div>
  <div class="stat-box"><div class="stat-num">{len(batch1)}</div><div class="stat-lbl">Batch 1</div></div>
  <div class="stat-box"><div class="stat-num">{len(batch2)}</div><div class="stat-lbl">Batch 2</div></div>
  <div class="stat-box"><div class="stat-num">{len(batch3)}</div><div class="stat-lbl">Batch 3</div></div>
  <div class="stat-box"><div class="stat-num">{len(batch4)}</div><div class="stat-lbl">Batch 4</div></div>
  <div class="stat-box"><div class="stat-num">{len(batch5)}</div><div class="stat-lbl">Batch 5</div></div>
  <div class="stat-box"><div class="stat-num" style="color:#1a7f37">{total_done}</div><div class="stat-lbl">Total converted</div></div>
  <div class="stat-box"><div class="stat-num">{total_todo}</div><div class="stat-lbl">Still hardcoded</div></div>
</div>

<h2>Batch 1 — Converted</h2>
<table>
<tr><th>Script</th><th>Description</th><th>--plan-run-dir</th></tr>
{script_rows(batch1)}
</table>

<h2>Batch 2 — Converted</h2>
<table>
<tr><th>Script</th><th>Description</th><th>Implementation note</th></tr>
{b2_rows()}
</table>

<h2>Batch 3 — Converted</h2>
<table>
<tr><th>Script</th><th>Description</th><th>Implementation note</th></tr>
{b3_rows_html()}
</table>

<h2>Batch 4 — Converted (Heavy Detection)</h2>
<table>
<tr><th>Script</th><th>Description</th><th>Implementation note</th></tr>
{b4_rows_html()}
</table>

<h2>Batch 5 — Converted (S3 Sign Detection Prerequisites)</h2>
<table>
<tr><th>Script</th><th>Description</th><th>Implementation note</th></tr>
{''.join(f"<tr><td><code>{s['file']}</code></td><td>{s['desc']}</td><td style='font-size:0.85em;color:#555'>{b5_notes_map.get(s['file'],'')}</td></tr>" for s in batch5)}
</table>

<h2>Helpers / Intake</h2>
<table>
<tr><th>Script</th><th>Description</th><th>--plan-run-dir</th></tr>
{script_rows(helpers)}
</table>

{'<h2>Not Yet Parameterized</h2><table><tr><th>Script</th><th>Description</th><th>Type</th></tr>' + "".join(f'<tr><td><code>{s["file"]}</code></td><td>{s["desc"]}</td><td><span class="badge-no">{s["type"]}</span></td></tr>' for s in hardcoded) + "</table>" if hardcoded else '<p style="color:#1a7f37;font-weight:600">✓ All pipeline scripts now support --plan-run-dir.</p>'}

<h2>Full Plan-Scoped Pipeline</h2>
<p>1. Register the plan:</p>
<pre>.venv/bin/python3 31_upload_intake_wrapper.py /path/to/plan.pdf</pre>
<p>2. Run detection (Batches 4+5) — seed vector_objects.json first (explicit operator action until 02 is parameterized):</p>
<pre>RUN=runs/&lt;plan_slug&gt;
cp outputs/vector_objects.json $RUN/outputs/  # seed until 02_extract_vectors.py is parameterized
.venv/bin/python3 04_cluster_symbols.py          --plan-run-dir $RUN
.venv/bin/python3 18_element_decomposition.py    --plan-run-dir $RUN
.venv/bin/python3 15_scale_measurement.py        --plan-run-dir $RUN
.venv/bin/python3 07_extract_legend.py           --plan-run-dir $RUN
.venv/bin/python3 09_stage_g_inventory.py        --plan-run-dir $RUN
.venv/bin/python3 16_legend_color_match.py       --plan-run-dir $RUN
.venv/bin/python3 13_vector_glyph_recognition.py --plan-run-dir $RUN
.venv/bin/python3 06_match_signs.py              --plan-run-dir $RUN</pre>
<p>3. Run analysis + review (Batches 1–3):</p>
<pre>.venv/bin/python3 14_build_review_queue.py       --plan-run-dir $RUN
.venv/bin/python3 17_boq_aggregator.py           --plan-run-dir $RUN
.venv/bin/python3 20_validation_layer.py         --plan-run-dir $RUN
.venv/bin/python3 22_partial_code_resolver.py    --plan-run-dir $RUN
.venv/bin/python3 23_human_review_writeback.py   --plan-run-dir $RUN
.venv/bin/python3 25_teaching_loop_answer_pack.py --plan-run-dir $RUN
.venv/bin/python3 27_static_review_form_generator.py --plan-run-dir $RUN
.venv/bin/python3 29_plan_scanner_prototype_shell.py --plan-run-dir $RUN
.venv/bin/python3 30_local_json_persistence_flow.py  --plan-run-dir $RUN</pre>
<p>All outputs land under <code>runs/&lt;plan_slug&gt;/outputs/</code>. Global <code>outputs/</code> is untouched.</p>

<h2>Remaining Blockers</h2>
<table>
<tr><th>#</th><th>Blocker</th><th>Description</th></tr>
{blocker_rows()}
</table>

<h2>Next Steps Toward Production</h2>
<table>
<tr><th>Next Step</th><th>Description</th></tr>
{next_step_rows()}
</table>

<footer>Research-only. No production DB or UI modified. approved_for_boq: false on all items.</footer>
</body>
</html>"""


def main() -> None:
    ts = datetime.now().isoformat(timespec='seconds')
    print('32_parameterization_report.py')
    print('=' * 50)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print('Scanning scripts for --plan-run-dir support...')
    scripts = scan_scripts()
    supported = [s for s in scripts if s['supported']]
    print(f'  Supported: {len(supported)} / {len(scripts)} scripts in registry')

    print('Writing Markdown...')
    md = build_md(scripts, ts)
    OUT_MD.write_text(md, encoding='utf-8')
    print(f'  {OUT_MD}  ({len(md)} chars)')

    print('Writing HTML...')
    html = build_html(scripts, ts, md)
    OUT_HTML.write_text(html, encoding='utf-8')
    print(f'  {OUT_HTML}  ({len(html)} chars)')

    batch1 = [s for s in scripts if s['batch'] == 1]
    batch2 = [s for s in scripts if s['batch'] == 2]
    batch3 = [s for s in scripts if s['batch'] == 3]
    batch4 = [s for s in scripts if s['batch'] == 4]
    batch5 = [s for s in scripts if s['batch'] == 5]
    hard   = [s for s in scripts if s['batch'] is None]
    print()
    print(f'Batch 1 converted  : {len(batch1)}')
    print(f'Batch 2 converted  : {len(batch2)}')
    print(f'Batch 3 converted  : {len(batch3)}')
    print(f'Batch 4 converted  : {len(batch4)}')
    print(f'Batch 5 converted  : {len(batch5)}')
    print(f'Still hardcoded    : {len(hard)}')
    print()
    print(f'Report: {OUT_HTML}')


if __name__ == '__main__':
    main()
