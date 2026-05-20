#!/usr/bin/env python3
"""
19_run_plan_scanner_pipeline.py
End-to-End Research Pipeline Orchestrator — Plan Scanner (סורק תוכניות)

Validates all pipeline stages in order, re-runs the fast BOQ aggregator
to produce a fresh unified BOQ, then writes a consolidated run summary.

What this does:
  • Checks that each stage's output files exist and are readable
  • Reads key metrics from existing JSON outputs (no re-processing)
  • Re-runs 17_boq_aggregator.py (~0s) to refresh the unified BOQ
  • Lists all pending human validations with priority and blocking info
  • Produces a recommended next step based on pipeline state
  • Does NOT re-run expensive PDF scripts (15, 16, 18 — 30-200 seconds each)
    If those outputs are missing, they are flagged as MISSING with recovery advice

Outputs:
  outputs/pipeline_run_summary.json
  outputs/pipeline_run_report.md
  outputs/pipeline_run_report.html

Research-only. Not approved BOQ data.
"""
from __future__ import annotations
import json, time, subprocess, sys, os
from pathlib import Path
from typing import Dict, List, Optional, Any

# ── Config ────────────────────────────────────────────────────────────────────
PDF_PATH   = Path('/Users/eliozedri/Downloads/50-448-02-400.pdf')
SCRIPT_DIR = Path(__file__).parent
OUT_DIR    = SCRIPT_DIR / 'outputs'
OUT_JSON   = OUT_DIR / 'pipeline_run_summary.json'
OUT_MD     = OUT_DIR / 'pipeline_run_report.md'
OUT_HTML   = OUT_DIR / 'pipeline_run_report.html'

BOQ_AGGREGATOR = SCRIPT_DIR / '17_boq_aggregator.py'
PYTHON_BIN     = SCRIPT_DIR / '.venv/bin/python3'

# ── Helpers ───────────────────────────────────────────────────────────────────

def load_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        return default

def file_meta(path: Path) -> Dict:
    exists = path.exists()
    return {
        'path': str(path.relative_to(SCRIPT_DIR) if path.is_relative_to(SCRIPT_DIR) else path),
        'exists': exists,
        'size_kb': round(path.stat().st_size / 1024, 1) if exists else None,
    }

def _status(*files: Path) -> str:
    """Return 'ok' if all required files exist, else 'missing'."""
    if all(f.exists() for f in files):
        return 'ok'
    if any(f.exists() for f in files):
        return 'partial'
    return 'missing'

# ── Stage checkers ─────────────────────────────────────────────────────────────

def check_s1_pdf() -> Dict:
    """S1: PDF source file."""
    t0 = time.time()
    exists = PDF_PATH.exists()
    size_mb = round(PDF_PATH.stat().st_size / 1_048_576, 1) if exists else None
    return {
        'stage_id':   'S1',
        'name':       'PDF Source',
        'description':'Source CAD/PDF file accessible',
        'script':     None,
        'status':     'ok' if exists else 'missing',
        'outputs':    [{'path': str(PDF_PATH), 'exists': exists, 'size_kb': size_mb * 1024 if size_mb else None}],
        'metrics':    {'pdf_exists': exists, 'size_mb': size_mb},
        'warnings':   [] if exists else ['Source PDF not found — all downstream stages depend on this file.'],
        'human_validations': [],
        'elapsed_s':  round(time.time()-t0, 3),
    }


def check_s2_legend() -> Dict:
    """S2: Legend / vocabulary extraction."""
    t0 = time.time()
    f_rows   = OUT_DIR / 'legend_rows.json'
    f_vocab  = OUT_DIR / 'legend_vocabulary.json'
    f_region = OUT_DIR / 'legend_region_detection.json'

    rows_data  = load_json(f_rows, {})
    vocab_data = load_json(f_vocab, {})
    region_data= load_json(f_region, {})

    rows   = rows_data.get('rows', rows_data) if isinstance(rows_data, dict) else rows_data
    n_rows = len(rows) if isinstance(rows, list) else 0
    n_labeled = sum(1 for r in (rows if isinstance(rows, list) else [])
                    if r.get('label') not in (None, '', 'null', 'pending_vision_configuration'))

    warnings = []
    if n_labeled == 0 and n_rows > 0:
        warnings.append(f'All {n_rows} legend row labels are null — Stage F vision API not run.')
    if not f_region.exists():
        warnings.append('legend_region_detection.json missing — legend boundary not established.')

    hvs = []
    if n_labeled == 0:
        hvs.append({
            'id': 'HV-LG-001',
            'priority': 'MEDIUM',
            'action': 'Extract legend row labels (Hebrew) — run vision API or enter manually',
            'blocks': 'Legend labels null; element type names are inferred only',
            'file': str(f_rows.relative_to(SCRIPT_DIR)),
        })

    st = _status(f_rows, f_vocab)
    return {
        'stage_id':   'S2',
        'name':       'Legend / Vocabulary',
        'description':'Stage F: legend region, rows, vocabulary',
        'script':     '07_extract_legend.py',
        'status':     st,
        'outputs':    [file_meta(f_rows), file_meta(f_vocab), file_meta(f_region)],
        'metrics':    {'n_legend_rows': n_rows, 'n_labeled': n_labeled,
                       'vocab_exists': f_vocab.exists()},
        'warnings':   warnings,
        'human_validations': hvs,
        'elapsed_s':  round(time.time()-t0, 3),
    }


def check_s3_sign_detection() -> Dict:
    """S3: Sign detection / inventory (Branch A)."""
    t0 = time.time()
    f_inv    = OUT_DIR / 'sign_inventory.json'
    f_sym    = OUT_DIR / 'symbol_clusters.json'
    f_noise  = OUT_DIR / 'noise_report.json'

    inv = load_json(f_inv, {})
    n_occs     = len(inv.get('occurrences', []))
    n_poles    = inv.get('summary', {}).get('n_pole_groups', 0)
    n_assem    = inv.get('summary', {}).get('n_assemblies', 0)

    warnings = []
    if n_occs == 0:
        warnings.append('sign_inventory.json has no occurrences — sign detection did not run.')
    if not f_sym.exists():
        warnings.append('symbol_clusters.json missing — Stage G cluster analysis not run.')

    st = _status(f_inv)
    if st == 'ok' and n_occs == 0:
        st = 'partial'

    return {
        'stage_id':   'S3',
        'name':       'Sign Detection (Branch A)',
        'description':'Stage G: OCC clustering, pole grouping, sign inventory',
        'script':     '09_stage_g_inventory.py',
        'status':     st,
        'outputs':    [file_meta(f_inv), file_meta(f_sym), file_meta(f_noise)],
        'metrics':    {'n_occurrences': n_occs, 'n_pole_groups': n_poles,
                       'n_assemblies': n_assem},
        'warnings':   warnings,
        'human_validations': [],
        'elapsed_s':  round(time.time()-t0, 3),
    }


def check_s4_sign_codes() -> Dict:
    """S4: Sign code recognition + review queue."""
    t0 = time.time()
    f_vg   = OUT_DIR / 'vector_glyph_results.json'
    f_rq   = OUT_DIR / 'review_queue.json'
    f_tnc  = OUT_DIR / 'tight_numeric_crop_results.json'
    f_dt   = OUT_DIR / 'digit_template_results.json'

    vg  = load_json(f_vg, [])
    rq  = load_json(f_rq, [])
    n_vg  = len(vg) if isinstance(vg, list) else 0
    n_rq  = len(rq) if isinstance(rq, list) else 0

    tier_counts = {'MEDIUM': 0, 'LOW': 0, 'FAILED': 0}
    medium_with_code = []
    for item in (rq if isinstance(rq, list) else []):
        ar = item.get('auto_result', {})
        t  = ar.get('poc3_tier', 'FAILED')
        if t in tier_counts:
            tier_counts[t] += 1
        if t == 'MEDIUM' and ar.get('poc3_candidates'):
            medium_with_code.append(item['occurrence_id'])

    warnings = []
    if tier_counts['FAILED'] > 150:
        warnings.append(f'{tier_counts["FAILED"]} OCCs in FAILED tier — POC 4 (PaddleOCR) would resolve many.')
    if not f_tnc.exists():
        warnings.append('tight_numeric_crop_results.json missing — Stage H not run.')

    hvs = []
    if medium_with_code:
        hvs.append({
            'id': 'HV-SC-001',
            'priority': 'MEDIUM',
            'action': f'Review {len(medium_with_code)} MEDIUM+code sign candidates in review_queue.html',
            'blocks': f'Sign codes unconfirmed — {len(medium_with_code)} candidates await human approval',
            'file': 'outputs/review_queue.html',
        })

    st = _status(f_vg, f_rq)
    return {
        'stage_id':   'S4',
        'name':       'Sign Code Recognition',
        'description':'Stages H-J: digit extraction, vector glyph clustering, review queue',
        'script':     '13_vector_glyph_recognition.py + 14_build_review_queue.py',
        'status':     st,
        'outputs':    [file_meta(f_vg), file_meta(f_rq), file_meta(f_tnc), file_meta(f_dt)],
        'metrics':    {'n_occurrences_reviewed': n_rq,
                       'tier_medium': tier_counts['MEDIUM'],
                       'tier_low':    tier_counts['LOW'],
                       'tier_failed': tier_counts['FAILED'],
                       'medium_with_code': len(medium_with_code),
                       'approved_sign_codes': 0},
        'warnings':   warnings,
        'human_validations': hvs,
        'elapsed_s':  round(time.time()-t0, 3),
    }


def check_s5_measurement() -> Dict:
    """S5: Measurement branch (scale, color taxonomy, BOQ draft)."""
    t0 = time.time()
    f_res  = OUT_DIR / 'scale_measurement' / 'results.json'
    f_boq  = OUT_DIR / 'scale_measurement' / 'boq_draft.json'
    f_tax  = OUT_DIR / 'legend_color_match' / 'color_taxonomy_candidates.json'
    f_cal  = OUT_DIR / 'legend_color_match' / 'calibration_template.json'
    f_ov   = OUT_DIR / 'scale_measurement' / 'overview.png'

    res  = load_json(f_res, {})
    cal  = load_json(f_cal, {})

    scale_info   = res.get('scale_info', {})
    scale_ratio  = scale_info.get('ratio', 500)
    scale_status = scale_info.get('status', 'unverified')
    type_totals  = res.get('type_totals_m', {})
    total_m      = sum(type_totals.values()) if type_totals else 0.0
    n_segments   = len(res.get('elements', []))
    n_runs       = len(res.get('runs', []))
    cal_status   = cal.get('status', 'unknown') if cal else 'missing'
    n_types      = len(type_totals)

    warnings = []
    if scale_status != 'calibrated':
        warnings.append(f'Scale 1:{scale_ratio} is {scale_status} — all linear measurements provisional.')
    if cal_status in ('pending_user_input', 'unknown', 'missing'):
        warnings.append('Calibration template awaits user two-point input — scale cannot be verified.')

    hvs = []
    if scale_status != 'calibrated':
        hvs.append({
            'id': 'HV-MS-001',
            'priority': 'HIGH',
            'action': 'Fill calibration_template.json with two known-distance points',
            'blocks': f'All linear measurements ({total_m:.0f}m) — scale 1:{scale_ratio} unverified',
            'file': str(f_cal.relative_to(SCRIPT_DIR)),
        })
    hvs.append({
        'id': 'HV-MS-002',
        'priority': 'HIGH',
        'action': 'Confirm legend row element types (legend_debug.png → legend_color_match/report.html)',
        'blocks': 'Color-to-element-type mapping unverified',
        'file': 'outputs/legend_color_match/report.html',
    })

    st = _status(f_res, f_boq)
    if st == 'ok' and scale_status != 'calibrated':
        # outputs exist but scale unverified → partial quality
        st = 'ok'  # still 'ok' for existence, warn separately

    return {
        'stage_id':   'S5',
        'name':       'Measurement Branch B',
        'description':'15: scale + dedup + linear measurement; 16: legend color match + calibration',
        'script':     '15_scale_measurement.py + 16_legend_color_match.py',
        'status':     st,
        'outputs':    [file_meta(f_res), file_meta(f_boq), file_meta(f_tax), file_meta(f_cal)],
        'metrics':    {
            'scale_ratio':    scale_ratio,
            'scale_status':   scale_status,
            'calibration_status': cal_status,
            'n_segments':     n_segments,
            'n_runs':         n_runs,
            'n_element_types': n_types,
            'total_linear_m': round(total_m, 1),
            'type_totals_m':  {k: round(v, 1) for k, v in type_totals.items()},
        },
        'warnings':   warnings,
        'human_validations': hvs,
        'elapsed_s':  round(time.time()-t0, 3),
    }


def check_s6_decomposition() -> Dict:
    """S6: Element decomposition branch."""
    t0 = time.time()
    f_eg  = OUT_DIR / 'element_groups.json'
    f_ov  = OUT_DIR / 'element_decomposition' / 'overlay_classified.png'
    f_rpt = OUT_DIR / 'element_groups_report.html'

    eg = load_json(f_eg, None)
    totals = eg.get('totals', {}) if eg else {}

    n_total   = totals.get('total_groups', 0)
    n_inc     = totals.get('n_include_groups', 0)
    n_rev     = totals.get('n_review_groups', 0)
    n_ign     = totals.get('n_ignore_groups', 0)
    n_paths   = totals.get('total_paths', 0)
    inc_paths = totals.get('include_paths', 0)
    rev_paths = totals.get('review_paths', 0)

    # Find high-impact review groups
    high_impact = []
    if eg:
        for g in eg.get('groups', []):
            if g['classification'] == 'review' and g['drawing_area_paths'] >= 1000:
                high_impact.append({
                    'group_id':    g['group_id'],
                    'element_type': g['element_type'],
                    'n_draw':      g['drawing_area_paths'],
                    'color_rgb8':  g['color_rgb8'],
                    'action':      g.get('notes', '')[:100],
                })

    warnings = []
    if n_paths == 0 and not f_eg.exists():
        warnings.append('element_groups.json missing — run 18_element_decomposition.py first (~33s).')
    if high_impact:
        warnings.append(f'{len(high_impact)} high-impact unknown color groups need classification.')

    hvs = []
    for g in high_impact:
        hvs.append({
            'id': f'HV-EG-{g["group_id"]}',
            'priority': 'HIGH',
            'action': f'Classify {g["group_id"]} ({g["element_type"]}, {g["n_draw"]:,} drawing paths, RGB={g["color_rgb8"]})',
            'blocks': 'Unknown element type — may represent a missing BOQ category',
            'file': 'outputs/element_groups_report.html',
        })

    st = _status(f_eg)
    return {
        'stage_id':   'S6',
        'name':       'Element Decomposition Branch C',
        'description':'18: full color-space decomposition, include/ignore/review classification',
        'script':     '18_element_decomposition.py',
        'status':     st,
        'outputs':    [file_meta(f_eg), file_meta(f_ov), file_meta(f_rpt)],
        'metrics':    {
            'total_groups':     n_total,
            'include_groups':   n_inc,
            'review_groups':    n_rev,
            'ignore_groups':    n_ign,
            'total_paths':      n_paths,
            'include_paths':    inc_paths,
            'review_paths':     rev_paths,
            'high_impact_unknowns': len(high_impact),
        },
        'warnings':   warnings,
        'human_validations': hvs,
        'elapsed_s':  round(time.time()-t0, 3),
    }


def run_boq_aggregator() -> Tuple[bool, str, float]:
    """Re-run 17_boq_aggregator.py and return (success, output, elapsed_s)."""
    py = PYTHON_BIN if PYTHON_BIN.exists() else Path(sys.executable)
    t0 = time.time()
    try:
        r = subprocess.run(
            [str(py), str(BOQ_AGGREGATOR)],
            capture_output=True, text=True, timeout=30,
            cwd=str(SCRIPT_DIR),
        )
        elapsed = time.time() - t0
        if r.returncode == 0:
            return True, r.stdout, elapsed
        return False, r.stderr or r.stdout, elapsed
    except Exception as e:
        return False, str(e), time.time() - t0


def check_s7_boq(refresh: bool = True) -> Dict:
    """S7: Unified BOQ aggregator — optionally re-run."""
    t0 = time.time()
    f_json = OUT_DIR / 'boq_unified_draft.json'
    f_md   = OUT_DIR / 'boq_unified_report.md'
    f_html = OUT_DIR / 'boq_unified_report.html'

    boq_refresh_ok   = False
    boq_refresh_note = 'Not attempted'

    if refresh and BOQ_AGGREGATOR.exists():
        print('  [S7] Re-running 17_boq_aggregator.py ...')
        ok, out, et = run_boq_aggregator()
        boq_refresh_ok   = ok
        boq_refresh_note = f'{"OK" if ok else "FAILED"} in {et:.1f}s'
        if not ok:
            print(f'    [WARN] BOQ aggregator failed: {out[:200]}')

    boq = load_json(f_json, None)
    if not boq:
        return {
            'stage_id':   'S7',
            'name':       'Unified BOQ',
            'description':'17: merge all branches into unified BOQ draft',
            'script':     '17_boq_aggregator.py',
            'status':     'missing',
            'outputs':    [file_meta(f_json), file_meta(f_md), file_meta(f_html)],
            'metrics':    {},
            'warnings':   ['boq_unified_draft.json missing — run 17_boq_aggregator.py'],
            'human_validations': [],
            'boq_refresh': boq_refresh_note,
            'elapsed_s':  round(time.time()-t0, 3),
        }

    meta   = boq.get('meta', {})
    totals = boq.get('totals', {})
    items  = boq.get('items', [])
    scale_info = boq.get('scale_info', {})

    n_total      = totals.get('total_boq_items', 0)
    n_approved   = totals.get('approved_for_boq_count', 0)
    n_poles      = totals.get('total_pole_locations', 0)
    n_plates     = totals.get('total_sign_plates', 0)
    n_assem      = totals.get('total_assemblies', 0)
    n_codes      = totals.get('sign_code_candidates', 0)
    total_m      = totals.get('total_linear_m', 0.0)
    n_eg         = totals.get('n_element_group_items', 0)
    n_tax        = totals.get('n_taxonomy_candidates', 0)
    n_hi         = totals.get('n_high_impact_unknowns', 0)

    by_cat = totals.get('by_category', {})
    n_review_items = by_cat.get('review_item', {}).get('count', 0)

    warnings = []
    if n_approved == 0:
        warnings.append(f'All {n_total} BOQ items have approved_for_boq=false.')
    if scale_info.get('status', 'unverified') != 'calibrated':
        warnings.append(f'Linear measurements ({total_m:.0f}m) are scale-unverified.')
    if n_tax > 0:
        warnings.append(f'{n_tax} taxonomy candidates require classification before BOQ accuracy improves.')

    # Category breakdown
    cats = {}
    for cat, d in by_cat.items():
        cats[cat] = d.get('count', 0)

    st = 'ok' if f_json.exists() else 'missing'
    return {
        'stage_id':   'S7',
        'name':       'Unified BOQ',
        'description':'17: merge Branch A (signs) + Branch B (measurement) + Branch C (decomposition)',
        'script':     '17_boq_aggregator.py',
        'status':     st,
        'outputs':    [file_meta(f_json), file_meta(f_md), file_meta(f_html)],
        'metrics':    {
            'total_boq_items':     n_total,
            'approved_for_boq':    n_approved,
            'requires_review':     n_total - n_approved,
            'pole_locations':      n_poles,
            'sign_plates':         n_plates,
            'assemblies':          n_assem,
            'sign_code_candidates': n_codes,
            'total_linear_m':      total_m,
            'scale_status':        scale_info.get('status', 'unverified'),
            'scale_ratio':         scale_info.get('ratio', 500),
            'n_element_group_items': n_eg,
            'n_taxonomy_candidates': n_tax,
            'n_high_impact_unknowns': n_hi,
            'by_category':         cats,
            'branches_merged':     meta.get('branches_merged', []),
        },
        'warnings':   warnings,
        'human_validations': [],
        'boq_refresh': boq_refresh_note,
        'elapsed_s':  round(time.time()-t0, 3),
    }

def check_s11_dashboard() -> Dict:
    """S11: Master Research Dashboard — reads outputs from 24_master_research_dashboard.py."""
    t0 = time.time()
    f_json = OUT_DIR / 'master_dashboard.json'
    f_md   = OUT_DIR / 'master_dashboard_report.md'
    f_html = OUT_DIR / 'master_dashboard.html'

    data = load_json(f_json)
    warnings: List[str] = []
    metrics: Dict = {}

    if data is None:
        st = 'missing'
        warnings.append('Run 24_master_research_dashboard.py to generate the master dashboard.')
    else:
        meta  = data.get('meta', {})
        flags = data.get('red_flags', [])
        from collections import Counter
        fc = Counter(f['severity'] for f in flags)
        metrics = {
            'n_critical':   fc.get('CRITICAL', 0),
            'n_warning':    fc.get('WARNING', 0),
            'n_info':       fc.get('INFO', 0),
            'generated_at': meta.get('generated_at', ''),
        }
        if fc.get('CRITICAL', 0) > 0:
            warnings.append(f'{fc["CRITICAL"]} CRITICAL red flag(s) in master dashboard.')
        st = 'ok' if f_json.exists() else 'missing'

    return {
        'stage_id':   'S11',
        'name':       'Master Dashboard',
        'description':'24: consolidated research control center for סורק תוכניות',
        'script':     '24_master_research_dashboard.py',
        'status':     st,
        'outputs':    [file_meta(f_json), file_meta(f_md), file_meta(f_html)],
        'metrics':    metrics,
        'warnings':   warnings,
        'human_validations': [],
        'elapsed_s':  round(time.time() - t0, 3),
    }


def check_s14_review_form() -> Dict:
    """S14: Static Review Form — reads outputs from 27_static_review_form_generator.py."""
    t0 = time.time()
    f_html = OUT_DIR / 'static_review_form.html'
    f_json = OUT_DIR / 'static_review_form.json'
    f_md   = OUT_DIR / 'static_review_form_report.md'

    data = load_json(f_json)
    warnings: List[str] = []
    metrics: Dict = {}

    if data is None:
        st = 'missing'
        warnings.append('Run 27_static_review_form_generator.py to generate the review form.')
    else:
        qs = data.get('questions', {})
        metrics = {
            'total_questions': qs.get('total', 0),
            'writeback_supported': qs.get('writeback_supported', 0),
            'pending_extension': qs.get('pending_writeback_extension', 0),
        }
        st = 'ok'

    return {
        'stage_id':    'S14',
        'name':        'Review Form',
        'description': '27: static HTML guided review form — browser-fillable, download JSON',
        'script':      '27_static_review_form_generator.py',
        'status':      st,
        'outputs':     [file_meta(f_html), file_meta(f_json), file_meta(f_md)],
        'metrics':     metrics,
        'warnings':    warnings,
        'human_validations': [],
        'elapsed_s':   round(time.time() - t0, 3),
    }


def check_s13_workspace() -> Dict:
    """S13: Plan Scanner Workspace — reads outputs from 26_plan_scanner_workspace.py."""
    t0 = time.time()
    f_html = OUT_DIR / 'plan_scanner_workspace.html'
    f_json = OUT_DIR / 'plan_scanner_workspace.json'
    f_md   = OUT_DIR / 'plan_scanner_workspace_report.md'

    data = load_json(f_json)
    warnings: List[str] = []
    metrics: Dict = {}

    if data is None:
        st = 'missing'
        warnings.append('Run 26_plan_scanner_workspace.py to generate the workspace.')
    else:
        boq = data.get('boq', {})
        tlp = data.get('answer_pack', {})
        arts = data.get('artifacts', [])
        n_present = sum(1 for a in arts if a.get('exists'))
        metrics = {
            'artifacts_present': n_present,
            'artifacts_total': len(arts),
            'total_questions': tlp.get('total_questions', 0),
            'boq_approved': boq.get('approved_for_boq', 0),
        }
        st = 'ok'

    return {
        'stage_id':    'S13',
        'name':        'Workspace',
        'description': '26: local research home page — navigation, status, next actions',
        'script':      '26_plan_scanner_workspace.py',
        'status':      st,
        'outputs':     [file_meta(f_html), file_meta(f_json), file_meta(f_md)],
        'metrics':     metrics,
        'warnings':    warnings,
        'human_validations': [],
        'elapsed_s':   round(time.time() - t0, 3),
    }


def check_s12_answer_pack() -> Dict:
    """S12: Teaching Loop Answer Pack — reads outputs from 25_teaching_loop_answer_pack.py."""
    t0 = time.time()
    f_json = OUT_DIR / 'teaching_loop_answer_pack.json'
    f_md   = OUT_DIR / 'teaching_loop_answer_pack.md'
    f_html = OUT_DIR / 'teaching_loop_answer_pack.html'
    f_tmpl = OUT_DIR / 'human_review_answers.template.json'

    data = load_json(f_json)
    warnings: List[str] = []
    metrics: Dict = {}

    if data is None:
        st = 'missing'
        warnings.append('Run 25_teaching_loop_answer_pack.py to generate the answer pack.')
    else:
        meta = data.get('meta', {})
        by_priority = meta.get('by_priority', {})
        n_total = meta.get('total_questions', 0)
        n_critical = by_priority.get('critical', 0)
        metrics = {
            'total_questions': n_total,
            'n_critical': n_critical,
            'n_high': by_priority.get('high', 0),
            'n_medium': by_priority.get('medium', 0),
            'n_low': by_priority.get('low', 0),
            'generated_at': meta.get('generated_at', ''),
        }
        if n_critical > 0:
            warnings.append(f'{n_critical} CRITICAL question(s) require human input before BOQ can be validated.')
        st = 'ok'

    return {
        'stage_id':   'S12',
        'name':       'Answer Pack',
        'description': '25: teaching loop question consolidator — structured human input workflow',
        'script':     '25_teaching_loop_answer_pack.py',
        'status':     st,
        'outputs':    [file_meta(f_json), file_meta(f_md), file_meta(f_html), file_meta(f_tmpl)],
        'metrics':    metrics,
        'warnings':   warnings,
        'human_validations': [],
        'elapsed_s':  round(time.time() - t0, 3),
    }


def check_s10_human_review() -> Dict:
    """S10: Human Review Write-Back — reads outputs from 23_human_review_writeback.py."""
    t0 = time.time()
    f_log  = OUT_DIR / 'human_review_application.json'
    f_md   = OUT_DIR / 'human_review_application_report.md'
    f_html = OUT_DIR / 'human_review_application_report.html'
    f_ex   = OUT_DIR / 'human_review_answers.example.json'
    f_ans  = OUT_DIR / 'human_review_answers.json'

    data = load_json(f_log)
    warnings: List[str] = []
    metrics: Dict = {}

    if data is None:
        st = 'missing'
        warnings.append('Run 23_human_review_writeback.py to generate teaching-loop outputs.')
    else:
        meta = data.get('meta', {})
        metrics = {
            'answers_file_exists':  meta.get('answers_file_exists', False),
            'n_answers_loaded':     meta.get('n_answers_loaded', 0),
            'n_applied':            meta.get('n_applied', 0),
            'n_skipped':            meta.get('n_skipped', 0),
            'n_contradictions':     meta.get('n_contradictions', 0),
            'n_pending_questions':  meta.get('n_pending_questions', 0),
        }
        if meta.get('n_contradictions', 0) > 0:
            warnings.append(
                f'{meta["n_contradictions"]} contradiction(s) detected — human answers conflict with existing data.'
            )
        if not meta.get('answers_file_exists'):
            warnings.append('No real answers file found — teaching loop not yet started.')

        st = 'ok' if f_log.exists() else 'missing'

    return {
        'stage_id':   'S10',
        'name':       'Human Review Write-Back',
        'description':'23: apply human answers to pipeline outputs — 8 types supported (תרגול ולמידה)',
        'script':     '23_human_review_writeback.py',
        'status':     st,
        'outputs':    [file_meta(f_log), file_meta(f_md), file_meta(f_html),
                       file_meta(f_ex), file_meta(f_ans)],
        'metrics':    metrics,
        'warnings':   warnings,
        'human_validations': [],
        'elapsed_s':  round(time.time() - t0, 3),
    }


def check_s9_partial_resolver() -> Dict:
    """S9: Partial Code Resolution — reads outputs from 22_partial_code_resolver.py."""
    t0 = time.time()
    f_json = OUT_DIR / 'partial_code_resolution.json'
    f_md   = OUT_DIR / 'partial_code_resolution_report.md'
    f_html = OUT_DIR / 'partial_code_resolution_report.html'

    data = load_json(f_json)
    warnings: List[str] = []
    metrics: Dict = {}

    if data is None:
        st = 'missing'
        warnings.append('Run 22_partial_code_resolver.py to generate partial-code resolution outputs.')
    else:
        meta    = data.get('meta', {})
        groups  = data.get('suffix_groups', {})
        results = data.get('results', [])

        from collections import Counter
        rc = meta.get('resolution_counts', {})
        n_ambiguous       = rc.get('ambiguous', 0)
        n_resolved_high   = rc.get('resolved_high', 0)
        n_resolved_medium = rc.get('resolved_medium', 0)
        n_invalid         = rc.get('invalid_partial', 0)

        metrics = {
            'n_processed':       meta.get('n_processed', 0),
            'n_suffix_groups':   meta.get('n_suffix_groups', len(groups)),
            'n_ambiguous':       n_ambiguous,
            'n_resolved_high':   n_resolved_high,
            'n_resolved_medium': n_resolved_medium,
            'n_invalid_partial': n_invalid,
            'legend_status':     meta.get('legend_status', 'unknown'),
        }
        if n_ambiguous > 0:
            warnings.append(
                f'{n_ambiguous} OCC(s) remain ambiguous — human review required to resolve partial codes.'
            )
        if n_invalid > 0:
            warnings.append(
                f'{n_invalid} OCC(s) have invalid partial codes with no valid expansion in any sign series.'
            )

        st = 'ok' if f_json.exists() else 'missing'

    return {
        'stage_id':   'S9',
        'name':       'Partial Code Resolution',
        'description':'22: resolve partial (2-digit) codes via T1–T4 evidence hierarchy',
        'script':     '22_partial_code_resolver.py',
        'status':     st,
        'outputs':    [file_meta(f_json), file_meta(f_md), file_meta(f_html)],
        'metrics':    metrics,
        'warnings':   warnings,
        'human_validations': [],
        'elapsed_s':  round(time.time() - t0, 3),
    }


def check_s8_validation() -> Dict:
    """S8: Sign Plausibility Validation — reads outputs from 20_validation_layer.py."""
    t0 = time.time()
    f_json = OUT_DIR / 'validation_results.json'
    f_md   = OUT_DIR / 'validation_report.md'
    f_html = OUT_DIR / 'validation_report.html'

    data = load_json(f_json)
    warnings: List[str] = []
    metrics: Dict = {}

    if data is None:
        st = 'missing'
        warnings.append('Run 20_validation_layer.py to generate validation outputs.')
    else:
        meta    = data.get('meta', {})
        results = data.get('results', [])

        from collections import Counter
        status_counts = Counter(r.get('validation_status') for r in results)
        conf_counts   = Counter(r.get('confidence_change') for r in results)

        n_suspicious  = status_counts.get('suspicious', 0)
        n_partial     = status_counts.get('partial_match', 0)
        n_no_code     = status_counts.get('no_code_candidate', 0)
        n_valid       = status_counts.get('valid', 0)
        n_decreased   = conf_counts.get('decreased', 0)
        structural    = meta.get('structural_finding', '')

        metrics = {
            'n_candidates':         meta.get('n_candidates', 0),
            'n_with_code':          meta.get('n_with_code', 0),
            'n_no_code':            meta.get('n_no_code', 0),
            'n_valid':              n_valid,
            'n_partial_match':      n_partial,
            'n_suspicious':         n_suspicious,
            'n_confidence_decreased': n_decreased,
            'kb_code_count':        meta.get('kb_code_count', 0),
            'catalog_code_count':   meta.get('catalog_code_count', 0),
            'structural_finding':   structural,
        }
        if n_suspicious > 0:
            warnings.append(
                f'{n_suspicious} OCC(s) produced suspicious codes with no valid expansion in any sign series.'
            )
        if structural:
            warnings.append('Structural: ' + structural[:120] + '...')

        st = 'ok' if f_json.exists() else 'missing'

    return {
        'stage_id':   'S8',
        'name':       'Sign Plausibility Validation',
        'description':'20: cross-check MEDIUM code candidates against catalog + SIGN_INDEX.md',
        'script':     '20_validation_layer.py',
        'status':     st,
        'outputs':    [file_meta(f_json), file_meta(f_md), file_meta(f_html)],
        'metrics':    metrics,
        'warnings':   warnings,
        'human_validations': [],
        'elapsed_s':  round(time.time() - t0, 3),
    }


# ── Recommended next step ──────────────────────────────────────────────────────

def derive_next_step(stages: List[Dict]) -> Dict:
    """Derive the highest-priority recommended next step from stage results."""
    s5 = next((s for s in stages if s['stage_id'] == 'S5'), {})
    s6 = next((s for s in stages if s['stage_id'] == 'S6'), {})
    s7 = next((s for s in stages if s['stage_id'] == 'S7'), {})
    s8  = next((s for s in stages if s['stage_id'] == 'S8'), {})
    s9  = next((s for s in stages if s['stage_id'] == 'S9'), {})
    s10 = next((s for s in stages if s['stage_id'] == 'S10'), {})

    m5  = s5.get('metrics', {})
    m6  = s6.get('metrics', {})
    m7  = s7.get('metrics', {})
    m8  = s8.get('metrics', {})
    m9  = s9.get('metrics', {})
    m10 = s10.get('metrics', {})

    # Priority 1: missing critical outputs
    for s in stages:
        if s['status'] == 'missing' and s['stage_id'] not in ('S2',):
            return {
                'priority': 'CRITICAL',
                'step':     f'Stage {s["stage_id"]} outputs missing — run {s["script"]}',
                'reason':   f'{s["name"]} has no output files; downstream stages are incomplete.',
                'command':  f'.venv/bin/python3 {s["script"].split("+")[0].strip()}' if s.get("script") else None,
            }

    # Priority 2: scale calibration (unlocks all linear measurements)
    if m5.get('scale_status') != 'calibrated':
        return {
            'priority': 'HIGH',
            'step':     'Scale calibration — fill calibration_template.json with two known-distance points',
            'reason':   (f'All {m5.get("total_linear_m", 0):.0f}m of linear measurements are provisional '
                         f'(assumed 1:{m5.get("scale_ratio", 500)}). Providing two points with a known distance '
                         f'converts every measurement to verified. Run 15_scale_measurement.py to recalculate.'),
            'command':  None,
            'file':     'outputs/legend_color_match/calibration_template.json',
        }

    # Priority 3: high-impact taxonomy classification
    n_hi = m6.get('high_impact_unknowns', 0) or m7.get('n_high_impact_unknowns', 0)
    if n_hi > 0:
        return {
            'priority': 'HIGH',
            'step':     f'Classify {n_hi} high-impact unknown color groups (element_groups_report.html)',
            'reason':   (f'{n_hi} color groups with ≥1,000 drawing-area paths are unidentified. '
                         f'Each classification expands the color taxonomy and may reveal a missing BOQ category.'),
            'command':  None,
            'file':     'outputs/element_groups_report.html',
        }

    # Priority 4: S8 structural finding — POC 3 adjacency limitation
    n_suspicious = m8.get('n_suspicious', 0)
    n_partial    = m8.get('n_partial_match', 0)
    if s8.get('status') == 'missing':
        return {
            'priority': 'HIGH',
            'step':     'Run 20_validation_layer.py to validate MEDIUM sign-code candidates',
            'reason':   'Sign plausibility validation (S8) has not been run. Validation surfaces structural POC 3 limitations.',
            'command':  '.venv/bin/python3 20_validation_layer.py',
            'file':     None,
        }
    if n_suspicious > 0:
        return {
            'priority': 'HIGH',
            'step':     f'Investigate {n_suspicious} suspicious code(s) — extend POC 3 to triplet detection',
            'reason':   (f'S8 found {n_suspicious} OCCs with codes that have NO valid 3-digit expansion in any '
                         f'Israeli sign series. Root cause: POC 3 captures digit-path PAIRS (2-digit), not triplets. '
                         f'Fix: extend adjacency detection in 13_vector_glyph_recognition.py to groups of 3.'),
            'command':  None,
            'file':     'outputs/validation_report.html',
        }
    if n_partial > 0:
        # Check if S9 has run; if so, defer to S9 step
        if s9.get('status') == 'missing':
            return {
                'priority': 'MEDIUM',
                'step':     'Run 22_partial_code_resolver.py — partial code resolution (S9)',
                'reason':   (f'S8 found {n_partial} OCCs with partial 2-digit codes. '
                             f'S9 resolves these using catalog + evidence hierarchy (no image matching).'),
                'command':  '.venv/bin/python3 22_partial_code_resolver.py',
                'file':     None,
            }

    # Priority 4b: S9 ambiguous codes need human input
    n_ambiguous = m9.get('n_ambiguous', 0)
    n_invalid   = m9.get('n_invalid_partial', 0)
    if s9.get('status') == 'ok' and n_ambiguous > 0:
        # Check if S10 has been run and answers file exists
        if s10.get('status') == 'missing':
            return {
                'priority': 'MEDIUM',
                'step':     'Run 23_human_review_writeback.py — human review write-back (S10)',
                'reason':   f'S10 (Human Review Write-Back) has not been run. Initialises the teaching loop and writes example answers template.',
                'command':  '.venv/bin/python3 23_human_review_writeback.py',
                'file':     None,
            }
        if not m10.get('answers_file_exists'):
            return {
                'priority': 'MEDIUM',
                'step':     f'Answer review questions — {n_ambiguous} ambiguous partial-code group(s) pending',
                'reason':   (f'S9 found {n_ambiguous} partial-code OCCs that need human confirmation. '
                             f'Copy outputs/human_review_answers.example.json → outputs/human_review_answers.json, '
                             f'answer the review questions (see partial_code_resolution_report.html), then re-run S10.'),
                'command':  None,
                'file':     'outputs/partial_code_resolution_report.html',
            }

    # Priority 4c: S10 contradictions need review
    if m10.get('n_contradictions', 0) > 0:
        return {
            'priority': 'HIGH',
            'step':     f'Resolve {m10["n_contradictions"]} contradiction(s) in human review write-back (S10)',
            'reason':   'Human answers conflict with existing data. Review human_review_application_report.html.',
            'command':  None,
            'file':     'outputs/human_review_application_report.html',
        }

    # Priority 5: sign code validation (original fallback)
    n_codes = m7.get('sign_code_candidates', 0)
    if n_codes > 0:
        return {
            'priority': 'MEDIUM',
            'step':     f'Validate {n_codes} MEDIUM-tier sign code candidates (review_queue.html)',
            'reason':   (f'{n_codes} sign code candidates have reconstructed digit sequences awaiting '
                         f'human confirmation. Confirming these produces the first approved BOQ code quantities.'),
            'command':  None,
            'file':     'outputs/review_queue.html',
        }

    return {
        'priority': 'LOW',
        'step':     'All critical pipeline stages complete — ready for operational BOQ planning',
        'reason':   'All outputs exist and key validations are done.',
        'command':  None,
    }

# ── Collect all human validations ─────────────────────────────────────────────

def collect_human_validations(stages: List[Dict]) -> List[Dict]:
    hvs = []
    for s in stages:
        for hv in s.get('human_validations', []):
            hv['stage'] = s['stage_id']
            hvs.append(hv)
    # Sort: HIGH first
    order = {'HIGH': 0, 'MEDIUM': 1, 'LOW': 2}
    hvs.sort(key=lambda h: order.get(h.get('priority', 'LOW'), 99))
    return hvs

# ── Pipeline summary ───────────────────────────────────────────────────────────

def build_summary(stages: List[Dict], next_step: Dict, hvs: List[Dict],
                  elapsed: float, ts: str) -> Dict:
    n_ok      = sum(1 for s in stages if s['status'] == 'ok')
    n_partial = sum(1 for s in stages if s['status'] == 'partial')
    n_missing = sum(1 for s in stages if s['status'] == 'missing')
    n_error   = sum(1 for s in stages if s['status'] == 'error')

    s7m  = next((s['metrics'] for s in stages if s['stage_id'] == 'S7'), {})
    s8m  = next((s['metrics'] for s in stages if s['stage_id'] == 'S8'), {})
    s9m  = next((s['metrics'] for s in stages if s['stage_id'] == 'S9'), {})
    s10m = next((s['metrics'] for s in stages if s['stage_id'] == 'S10'), {})

    all_warnings = [
        {'stage': s['stage_id'], 'stage_name': s['name'], 'msg': w}
        for s in stages for w in s.get('warnings', [])
    ]

    return {
        'metadata': {
            'orchestrator':  '19_run_plan_scanner_pipeline.py',
            'source_pdf':    str(PDF_PATH),
            'timestamp':     ts,
            'elapsed_s':     round(elapsed, 2),
            'approved_for_boq':    False,
            'note':          'Research-only. All quantities provisional.',
        },
        'pipeline_status': {
            'stages_ok':      n_ok,
            'stages_partial': n_partial,
            'stages_missing': n_missing,
            'stages_error':   n_error,
            'overall':        'ok' if n_missing == 0 and n_error == 0 else
                              'partial' if n_ok > 0 else 'missing',
        },
        'boq_summary': {
            'total_boq_items':       s7m.get('total_boq_items', 0),
            'approved_for_boq':      s7m.get('approved_for_boq', 0),
            'requires_review':       s7m.get('requires_review', 0),
            'pole_locations':         s7m.get('pole_locations', 0),
            'sign_plates':            s7m.get('sign_plates', 0),
            'assemblies':             s7m.get('assemblies', 0),
            'sign_code_candidates':   s7m.get('sign_code_candidates', 0),
            'total_linear_m':         s7m.get('total_linear_m', 0.0),
            'scale_status':           s7m.get('scale_status', 'unverified'),
            'n_element_group_items':  s7m.get('n_element_group_items', 0),
            'n_taxonomy_candidates':  s7m.get('n_taxonomy_candidates', 0),
            'n_high_impact_unknowns': s7m.get('n_high_impact_unknowns', 0),
        },
        'validation_summary': {
            'n_candidates':          s8m.get('n_candidates', 0),
            'n_with_code':           s8m.get('n_with_code', 0),
            'n_valid':               s8m.get('n_valid', 0),
            'n_partial_match':       s8m.get('n_partial_match', 0),
            'n_suspicious':          s8m.get('n_suspicious', 0),
            'n_confidence_decreased': s8m.get('n_confidence_decreased', 0),
            'structural_finding':    s8m.get('structural_finding', ''),
        },
        'resolution_summary': {
            'n_processed':       s9m.get('n_processed', 0),
            'n_suffix_groups':   s9m.get('n_suffix_groups', 0),
            'n_ambiguous':       s9m.get('n_ambiguous', 0),
            'n_resolved_high':   s9m.get('n_resolved_high', 0),
            'n_resolved_medium': s9m.get('n_resolved_medium', 0),
            'n_invalid_partial': s9m.get('n_invalid_partial', 0),
            'legend_status':     s9m.get('legend_status', 'not_run'),
        },
        'teaching_loop_summary': {
            'answers_file_exists':  s10m.get('answers_file_exists', False),
            'n_answers_loaded':     s10m.get('n_answers_loaded', 0),
            'n_applied':            s10m.get('n_applied', 0),
            'n_contradictions':     s10m.get('n_contradictions', 0),
            'n_pending_questions':  s10m.get('n_pending_questions', 0),
        },
        'stages':              stages,
        'all_warnings':        all_warnings,
        'human_validations':   hvs,
        'recommended_next_step': next_step,
    }

# ── Reports ────────────────────────────────────────────────────────────────────

STATUS_ICON = {'ok': '✅', 'partial': '⚠️', 'missing': '❌', 'error': '💥'}
STATUS_COLOR = {'ok': '#15803d', 'partial': '#b45309', 'missing': '#dc2626', 'error': '#7c3aed'}

def build_md(summary: Dict) -> str:
    ts   = summary['metadata']['timestamp']
    pdf  = summary['metadata']['source_pdf']
    ps   = summary['pipeline_status']
    bq   = summary['boq_summary']
    ns   = summary['recommended_next_step']
    hvs  = summary['human_validations']
    stages = summary['stages']

    def stage_row(s):
        icon = STATUS_ICON.get(s['status'], '?')
        return (f'| {icon} **{s["stage_id"]}** | {s["name"]} | {s["status"].upper()} | '
                f'{s.get("script","—") or "—"} |')

    def hv_row(h):
        return (f'| {h.get("priority","?")} | {h["id"]} | {h["action"][:80]} | {h.get("blocks","")[:60]} |')

    lines = [
        '# Plan Scanner Pipeline Run Report',
        f'Orchestrator: `19_run_plan_scanner_pipeline.py`',
        f'Timestamp: `{ts}`',
        f'Source PDF: `{pdf}`',
        '',
        '> ⚠ **RESEARCH-ONLY** — `approved_for_boq: false` on all items.',
        '',
        '## Pipeline Status',
        '',
        f'| Stages OK | Partial | Missing | Error |',
        f'|-----------|---------|---------|-------|',
        f'| {ps["stages_ok"]} | {ps["stages_partial"]} | {ps["stages_missing"]} | {ps["stages_error"]} |',
        '',
        '## Stage Summary',
        '',
        '| Status | Stage | Name | Status | Script |',
        '|--------|-------|------|--------|--------|',
    ]
    for s in stages:
        lines.append(stage_row(s))

    lines += [
        '',
        '## BOQ Summary (Branch A + B + C)',
        '',
        '| Metric | Value |',
        '|--------|-------|',
        f'| Total BOQ items | {bq["total_boq_items"]} |',
        f'| Approved for BOQ | **{bq["approved_for_boq"]}** |',
        f'| Requires review | {bq["requires_review"]} |',
        f'| Pole locations | {bq["pole_locations"]} |',
        f'| Sign plates | {bq["sign_plates"]} |',
        f'| Sign assemblies | {bq["assemblies"]} |',
        f'| Sign code candidates | {bq["sign_code_candidates"]} |',
        f'| Total linear (m) | {bq["total_linear_m"]:.1f}m — **{bq["scale_status"].upper()}** |',
        f'| Element group items | {bq["n_element_group_items"]} |',
        f'| Taxonomy candidates | {bq["n_taxonomy_candidates"]} |',
        f'| High-impact unknowns | {bq["n_high_impact_unknowns"]} |',
        '',
        '## Warnings',
        '',
    ]
    for w in summary['all_warnings']:
        lines.append(f'- **[{w["stage"]}]** {w["msg"]}')

    lines += [
        '',
        '## Human Validations Needed',
        '',
        '| Priority | ID | Action | Blocks |',
        '|----------|----|--------|--------|',
    ]
    for h in hvs:
        lines.append(hv_row(h))

    lines += [
        '',
        '## Recommended Next Step',
        '',
        f'**Priority: {ns["priority"]}**',
        '',
        f'**{ns["step"]}**',
        '',
        ns["reason"],
        '',
        '---',
        '',
        '## All Outputs',
        '',
        '| File | Exists | Size |',
        '|------|--------|------|',
    ]
    for s in stages:
        for o in s.get('outputs', []):
            sz = f'{o["size_kb"]:.1f} KB' if o.get("size_kb") else '—'
            chk = '✅' if o['exists'] else '❌'
            lines.append(f'| `{o["path"]}` | {chk} | {sz} |')

    lines += [
        '',
        f'*Pipeline elapsed: {summary["metadata"]["elapsed_s"]:.1f}s*',
        '',
        '---',
        '*Research output. Not approved for construction, procurement, billing, or execution.*',
    ]
    return '\n'.join(lines)


def _stage_badge(status: str) -> str:
    c = STATUS_COLOR.get(status, '#555')
    icon = STATUS_ICON.get(status, '?')
    return (f'<span style="background:{c};color:#fff;padding:2px 8px;'
            f'border-radius:4px;font-size:12px;font-weight:600">'
            f'{icon} {status.upper()}</span>')

def _metric_card(label: str, value: str, color: str = '#1e3a5f') -> str:
    return (f'<div style="display:inline-block;background:#fff;border:2px solid {color};'
            f'border-radius:8px;padding:8px 16px;margin:4px;text-align:center;min-width:100px">'
            f'<div style="font-size:22px;font-weight:bold;color:{color}">{value}</div>'
            f'<div style="font-size:11px;color:#555">{label}</div></div>')

def _pct_bar(pct: float, color: str = '#15803d') -> str:
    w = min(100, max(0, int(pct)))
    return (f'<div style="background:#e5e7eb;border-radius:3px;height:8px;width:100%;margin-top:4px">'
            f'<div style="background:{color};width:{w}%;height:100%;border-radius:3px"></div></div>')

def build_html(summary: Dict) -> str:
    ts     = summary['metadata']['timestamp']
    pdf    = summary['metadata']['source_pdf']
    ps     = summary['pipeline_status']
    bq     = summary['boq_summary']
    ns     = summary['recommended_next_step']
    hvs    = summary['human_validations']
    stages = summary['stages']
    warns  = summary['all_warnings']
    elapsed = summary['metadata']['elapsed_s']

    overall_color = {'ok': '#15803d', 'partial': '#b45309', 'missing': '#dc2626'}.get(ps['overall'], '#555')

    # Stage cards
    stage_cards = ''
    for s in stages:
        sc = STATUS_COLOR.get(s['status'], '#555')
        n_warn = len(s.get('warnings', []))
        m = s.get('metrics', {})
        # Quick metric snippet
        snippet = ''
        if s['stage_id'] == 'S3':
            snippet = f"{m.get('n_occurrences',0)} OCCs, {m.get('n_pole_groups',0)} poles"
        elif s['stage_id'] == 'S4':
            snippet = f"MED={m.get('tier_medium',0)}, LOW={m.get('tier_low',0)}, FAIL={m.get('tier_failed',0)}"
        elif s['stage_id'] == 'S5':
            snippet = f"{m.get('total_linear_m',0):.0f}m · {m.get('scale_status','?')}"
        elif s['stage_id'] == 'S6':
            snippet = f"{m.get('total_groups',0)} groups · {m.get('high_impact_unknowns',0)} high-impact"
        elif s['stage_id'] == 'S7':
            snippet = f"{m.get('total_boq_items',0)} items · {m.get('approved_for_boq',0)} approved"
        elif s['stage_id'] == 'S8':
            snippet = (f"valid={m.get('n_valid',0)} partial={m.get('n_partial_match',0)} "
                       f"suspicious={m.get('n_suspicious',0)}")
        elif s['stage_id'] == 'S9':
            snippet = (f"ambiguous={m.get('n_ambiguous',0)} resolved_med={m.get('n_resolved_medium',0)} "
                       f"invalid={m.get('n_invalid_partial',0)}")
        elif s['stage_id'] == 'S10':
            has_ans = '✅' if m.get('answers_file_exists') else '❌'
            snippet = (f"{has_ans} answers · applied={m.get('n_applied',0)} "
                       f"pending={m.get('n_pending_questions',0)}")
        elif s['stage_id'] == 'S11':
            snippet = (f"🚨{m.get('n_critical',0)} ⚠️{m.get('n_warning',0)} ℹ️{m.get('n_info',0)} red flags")
        elif s['stage_id'] == 'S1':
            snippet = f"{m.get('size_mb',0):.1f} MB" if m.get('size_mb') else 'FILE MISSING'
        elif s['stage_id'] == 'S2':
            snippet = f"{m.get('n_legend_rows',0)} rows · {m.get('n_labeled',0)} labeled"

        warn_badge = (f'<span style="background:#fef3c7;color:#92400e;border-radius:3px;'
                      f'padding:1px 5px;font-size:11px">{n_warn} warn</span>') if n_warn else ''
        refresh_note = ''
        if 'boq_refresh' in s:
            refresh_note = f'<br><span style="font-size:11px;color:#6b7280">re-run: {s["boq_refresh"]}</span>'

        stage_cards += (
            f'<div style="border:2px solid {sc};border-radius:8px;padding:10px 14px;'
            f'margin:6px;display:inline-block;vertical-align:top;min-width:200px;max-width:260px">'
            f'<div style="font-size:12px;color:#6b7280">{s["stage_id"]}</div>'
            f'<div style="font-weight:600;margin:2px 0">{s["name"]}</div>'
            f'{_stage_badge(s["status"])} {warn_badge}'
            f'<div style="font-size:12px;color:#374151;margin-top:6px">{snippet}</div>'
            f'{refresh_note}</div>'
        )

    # BOQ cards
    approved_pct = (bq['approved_for_boq'] / max(bq['total_boq_items'], 1)) * 100
    boq_cards = (
        _metric_card('BOQ items', str(bq['total_boq_items']), '#1e3a5f') +
        _metric_card('Approved', str(bq['approved_for_boq']), '#dc2626') +
        _metric_card('Poles', str(bq['pole_locations']), '#2563eb') +
        _metric_card('Sign plates', str(bq['sign_plates']), '#2563eb') +
        _metric_card('Assemblies', str(bq['assemblies']), '#2563eb') +
        _metric_card('Code candidates', str(bq['sign_code_candidates']), '#d97706') +
        _metric_card('Linear (m)', f'{bq["total_linear_m"]:.0f}', '#059669') +
        _metric_card('Taxonomy cands.', str(bq['n_taxonomy_candidates']), '#dc2626') +
        _metric_card('High-impact', str(bq['n_high_impact_unknowns']), '#dc2626')
    )

    # Human validations table
    prio_colors = {'HIGH': '#dc2626', 'MEDIUM': '#d97706', 'LOW': '#6b7280'}
    hv_rows = ''
    for h in hvs:
        pc = prio_colors.get(h.get('priority','LOW'), '#555')
        flink = f'<a href="{h["file"]}" target="_blank">{Path(h["file"]).name}</a>' if h.get('file') else '—'
        hv_rows += (
            f'<tr>'
            f'<td><span style="background:{pc};color:#fff;padding:1px 6px;border-radius:3px;font-size:11px">{h.get("priority","?")}</span></td>'
            f'<td><code>{h["id"]}</code></td>'
            f'<td>{h["action"]}</td>'
            f'<td style="color:#6b7280;font-size:12px">{h.get("blocks","")}</td>'
            f'<td>{flink}</td>'
            f'</tr>\n'
        )

    # Warnings
    warn_rows = ''
    for w in warns:
        warn_rows += (
            f'<tr>'
            f'<td><code>{w["stage"]}</code></td>'
            f'<td>{w["stage_name"]}</td>'
            f'<td>{w["msg"]}</td>'
            f'</tr>\n'
        )

    # Outputs manifest
    manifest_rows = ''
    for s in stages:
        for o in s.get('outputs', []):
            sz = f'{o["size_kb"]:.1f} KB' if o.get('size_kb') else '—'
            chk = '✅' if o['exists'] else '❌'
            fname = Path(o['path']).name
            manifest_rows += (
                f'<tr>'
                f'<td>{chk}</td>'
                f'<td><code>{o["path"]}</code></td>'
                f'<td style="color:#6b7280">{sz}</td>'
                f'<td style="color:#6b7280">{s["stage_id"]}</td>'
                f'</tr>\n'
            )

    ns_color = {'CRITICAL': '#dc2626', 'HIGH': '#d97706', 'MEDIUM': '#2563eb', 'LOW': '#15803d'}.get(ns['priority'], '#555')

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Plan Scanner Pipeline Report</title>
<style>
  body {{font-family: system-ui, sans-serif; margin: 24px; background: #f9fafb; color: #111;}}
  h1 {{color: #1e3a5f; font-size: 1.4rem;}}
  h2 {{font-size: 1.05rem; margin-top: 28px; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;}}
  table {{border-collapse: collapse; width: 100%; background: #fff; font-size: 13px; margin-top: 8px;}}
  th, td {{border: 1px solid #e5e7eb; padding: 5px 10px; text-align: left;}}
  th {{background: #f1f5f9; font-weight: 600;}}
  tr:hover {{background: #f0f9ff;}}
  .banner {{background: #fff; border: 2px solid {overall_color}; border-radius: 8px; padding: 12px 18px; margin-bottom: 16px;}}
  .warn-box {{background: #fffbeb; border: 2px solid #f59e0b; border-radius: 8px; padding: 10px 16px; margin: 12px 0;}}
  .next-box {{background: #f0fdf4; border: 2px solid {ns_color}; border-radius: 8px; padding: 14px 20px; margin: 12px 0;}}
  code {{background: #f1f5f9; padding: 1px 4px; border-radius: 3px; font-size: 12px;}}
  a {{color: #2563eb;}}
  details {{margin: 6px 0;}} summary {{cursor: pointer; font-weight: 600; color: #2563eb;}}
  .disclaimer {{background: #fef2f2; border: 2px solid #fca5a5; border-radius: 8px; padding: 10px 16px; margin: 12px 0;}}
</style>
</head>
<body>
<h1>Plan Scanner Pipeline Report — סורק תוכניות</h1>

<div class="banner">
  <strong>Source PDF:</strong> <code>{pdf}</code> &nbsp;|&nbsp;
  <strong>Run:</strong> <code>{ts}</code> &nbsp;|&nbsp;
  <strong>Elapsed:</strong> {elapsed:.1f}s &nbsp;|&nbsp;
  <strong>Overall:</strong> <span style="color:{overall_color};font-weight:bold">{ps["overall"].upper()}</span>
  <br>
  Stages OK: <strong>{ps["stages_ok"]}</strong> &nbsp;|&nbsp;
  Partial: <strong>{ps["stages_partial"]}</strong> &nbsp;|&nbsp;
  Missing: <strong>{ps["stages_missing"]}</strong> &nbsp;|&nbsp;
  Error: <strong>{ps["stages_error"]}</strong>
</div>

<div class="disclaimer">
  ⚠ <strong>RESEARCH-ONLY — NOT APPROVED BOQ DATA</strong> &nbsp;|&nbsp;
  <code>approved_for_boq: false</code> on all {bq["total_boq_items"]} items &nbsp;|&nbsp;
  Scale UNVERIFIED · Sign codes UNCONFIRMED · Color taxonomy UNVERIFIED
</div>

<h2>Stage Overview</h2>
<div style="margin: 10px 0">{stage_cards}</div>

<h2>BOQ Summary</h2>
<div style="margin: 10px 0">{boq_cards}</div>
<div style="max-width:400px;margin:8px 4px">
  <div style="font-size:12px;color:#6b7280">BOQ approval progress: {approved_pct:.0f}% ({bq["approved_for_boq"]}/{bq["total_boq_items"]})</div>
  {_pct_bar(approved_pct, '#15803d')}
  <div style="font-size:11px;color:#9ca3af;margin-top:2px">Scale: 1:{bq["scale_status"].split("_")[0].replace("unverified","500?")} · {bq["scale_status"].upper()}</div>
</div>

<h2>Recommended Next Step</h2>
<div class="next-box">
  <strong style="color:{ns_color}">[{ns["priority"]}]</strong>
  <strong> {ns["step"]}</strong><br>
  <span style="color:#374151;font-size:13px">{ns["reason"]}</span>
  {f'<br><a href="{ns["file"]}" target="_blank" style="font-size:12px">{ns["file"]}</a>' if ns.get("file") else ""}
</div>

<h2>Human Validations Needed ({len(hvs)} pending)</h2>
<table>
  <tr><th>Priority</th><th>ID</th><th>Action</th><th>Blocks</th><th>File</th></tr>
  {hv_rows}
</table>

<h2>Warnings ({len(warns)})</h2>
{'<div class="warn-box"><table><tr><th>Stage</th><th>Name</th><th>Warning</th></tr>' + warn_rows + '</table></div>' if warns else '<p style="color:#6b7280"><em>No warnings.</em></p>'}

<h2>Measurement Summary (Branch B)</h2>
<p style="color:#6b7280;font-size:12px">
  Scale 1:{bq.get("scale_ratio",500)} — {bq["scale_status"].upper()} — all values provisional
</p>

<details>
<summary>Linear measurements by element type</summary>
{_render_linear_table(summary)}
</details>

<h2>Pipeline Manifest</h2>
<details open>
<summary>All output files ({sum(1 for s in stages for o in s.get("outputs",[]) if o["exists"])} exist / {sum(1 for s in stages for o in s.get("outputs",[]))} total)</summary>
<table>
  <tr><th>✓</th><th>File</th><th>Size</th><th>Stage</th></tr>
  {manifest_rows}
</table>
</details>

<hr style="margin-top:32px">
<p style="color:#9ca3af;font-size:11px">
  Generated by 19_run_plan_scanner_pipeline.py &nbsp;|&nbsp;
  Pipeline: research/cad-pdf-intelligence/ &nbsp;|&nbsp;
  REMINDER: Not approved for construction, procurement, billing, or execution.
</p>
</body></html>'''


def _render_linear_table(summary: Dict) -> str:
    s5 = next((s for s in summary['stages'] if s['stage_id'] == 'S5'), {})
    type_totals = s5.get('metrics', {}).get('type_totals_m', {})
    if not type_totals:
        return '<p><em>No measurement data.</em></p>'
    rows = ''
    for etype, m in sorted(type_totals.items(), key=lambda kv: -kv[1]):
        rows += f'<tr><td><code>{etype}</code></td><td><strong>{m:.1f}</strong></td><td>m</td></tr>\n'
    total = sum(type_totals.values())
    rows += f'<tr style="background:#f1f5f9"><td><strong>TOTAL</strong></td><td><strong>{total:.1f}</strong></td><td>m</td></tr>\n'
    return f'<table><tr><th>Element type</th><th>Total (m)</th><th>Unit</th></tr>{rows}</table>'


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    t0 = time.time()
    ts = time.strftime('%Y-%m-%dT%H:%M:%S')
    print('=' * 60)
    print('Plan Scanner Pipeline Orchestrator')
    print('19_run_plan_scanner_pipeline.py')
    print(f'Run: {ts}')
    print('=' * 60)

    os.chdir(SCRIPT_DIR)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print('\n[Validate] Checking pipeline stages ...')

    stages = []

    print('  S1: PDF Source ...')
    stages.append(check_s1_pdf())

    print('  S2: Legend / Vocabulary ...')
    stages.append(check_s2_legend())

    print('  S3: Sign Detection ...')
    stages.append(check_s3_sign_detection())

    print('  S4: Sign Code Recognition ...')
    stages.append(check_s4_sign_codes())

    print('  S5: Measurement Branch B ...')
    stages.append(check_s5_measurement())

    print('  S6: Element Decomposition Branch C ...')
    stages.append(check_s6_decomposition())

    print('  S7: Unified BOQ (refreshing ...) ...')
    stages.append(check_s7_boq(refresh=True))

    print('  S8: Sign Plausibility Validation ...')
    stages.append(check_s8_validation())

    print('  S9: Partial Code Resolution ...')
    stages.append(check_s9_partial_resolver())

    print('  S10: Human Review Write-Back ...')
    stages.append(check_s10_human_review())

    print('  S11: Master Research Dashboard ...')
    stages.append(check_s11_dashboard())

    print('  S12: Teaching Loop Answer Pack ...')
    stages.append(check_s12_answer_pack())

    print('  S13: Plan Scanner Workspace ...')
    stages.append(check_s13_workspace())

    print('  S14: Static Review Form ...')
    stages.append(check_s14_review_form())

    elapsed = time.time() - t0

    print('\n[Analyze] Deriving recommendations ...')
    hvs       = collect_human_validations(stages)
    next_step = derive_next_step(stages)

    print('\n[Summary] Building pipeline summary ...')
    summary = build_summary(stages, next_step, hvs, elapsed, ts)

    print('\n[Write] Saving outputs ...')
    OUT_JSON.write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f'  → {OUT_JSON.relative_to(SCRIPT_DIR)}')

    OUT_MD.write_text(build_md(summary))
    print(f'  → {OUT_MD.relative_to(SCRIPT_DIR)}')

    OUT_HTML.write_text(build_html(summary))
    print(f'  → {OUT_HTML.relative_to(SCRIPT_DIR)}')

    elapsed_total = time.time() - t0
    ps  = summary['pipeline_status']
    bq  = summary['boq_summary']
    vs  = summary['validation_summary']
    rs  = summary['resolution_summary']
    tl  = summary['teaching_loop_summary']
    ns  = summary['recommended_next_step']

    print(f"""
{'=' * 60}
PIPELINE RUN COMPLETE
{'=' * 60}
  Source PDF        : {PDF_PATH.name}  {'(found)' if PDF_PATH.exists() else '(MISSING)'}
  Stages OK         : {ps['stages_ok']}/{len(stages)}
  Stages missing    : {ps['stages_missing']}
  Overall           : {ps['overall'].upper()}

  BOQ items         : {bq['total_boq_items']}  (approved: {bq['approved_for_boq']})
  Pole locations    : {bq['pole_locations']}
  Sign plates       : {bq['sign_plates']}
  Validation [S8]   : valid={vs['n_valid']} partial={vs['n_partial_match']} suspicious={vs['n_suspicious']}
  Resolution [S9]   : ambiguous={rs['n_ambiguous']} resolved_med={rs['n_resolved_medium']} invalid={rs['n_invalid_partial']}
  Teaching [S10]    : answers={'found' if tl['answers_file_exists'] else 'none'} applied={tl['n_applied']} pending={tl['n_pending_questions']}
  Dashboard [S11]   : open outputs/master_dashboard.html
  Answer Pack [S12] : open outputs/teaching_loop_answer_pack.html
  Workspace  [S13]  : open outputs/plan_scanner_workspace.html
  Form       [S14]  : open outputs/static_review_form.html
  Total linear (m)  : {bq['total_linear_m']:.1f}m  (scale: {bq['scale_status']})
  Taxonomy cands.   : {bq['n_taxonomy_candidates']}  high-impact: {bq['n_high_impact_unknowns']}

  Human validations : {len(hvs)} pending
  Warnings          : {len(summary['all_warnings'])}

  Next step [{ns['priority']}]:
  {ns['step']}

  → {OUT_JSON.relative_to(SCRIPT_DIR)}
  → {OUT_MD.relative_to(SCRIPT_DIR)}
  → {OUT_HTML.relative_to(SCRIPT_DIR)}
  Elapsed           : {elapsed_total:.1f}s

  open {OUT_HTML.relative_to(SCRIPT_DIR)}

  REMINDER: All quantities provisional. Nothing approved for BOQ.
{'=' * 60}
""")


if __name__ == '__main__':
    main()
