#!/usr/bin/env python3
"""
24_master_research_dashboard.py
Stage S11 — Master Research Dashboard / Report Package

Consolidates all pipeline stage outputs into one static HTML control center
for the future סורק תוכניות (Plan Scanner) module.

Read-only: reads existing JSON outputs, writes 3 new files only.
No processing, no external APIs, no paid services.

Sections:
  1. Pipeline Status         — 10-stage overview + timestamps
  2. BOQ Status              — quantities, approval state, blockers
  3. Sign / Code Status      — inventory, partial codes, review queue
  4. Measurement Status      — scale, linear quantities, calibration
  5. Element Decomposition   — 31 color groups, taxonomy candidates
  6. Human Review / Teaching — teaching loop, answers, pending questions
  7. Red Flags               — CRITICAL / WARNING / INFO tiered
  8. Next Local Actions      — free-only, no paid API

Outputs:
  outputs/master_dashboard.json
  outputs/master_dashboard.html
  outputs/master_dashboard_report.md

Research-only. approved_for_boq: false. Static HTML, no server required.
"""
from __future__ import annotations
import json, time
from pathlib import Path
from typing import Any, Dict, List, Optional

# ── Config ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
OUT_DIR    = SCRIPT_DIR / 'outputs'

OUT_JSON = OUT_DIR / 'master_dashboard.json'
OUT_HTML = OUT_DIR / 'master_dashboard.html'
OUT_MD   = OUT_DIR / 'master_dashboard_report.md'

# Input files
F_PIPELINE   = OUT_DIR / 'pipeline_run_summary.json'
F_BOQ        = OUT_DIR / 'boq_unified_draft.json'
F_ELEMENTS   = OUT_DIR / 'element_groups.json'
F_INVENTORY  = OUT_DIR / 'sign_inventory.json'
F_QUEUE      = OUT_DIR / 'review_queue.json'
F_VALIDATION = OUT_DIR / 'validation_results.json'
F_PARTIAL    = OUT_DIR / 'partial_code_resolution.json'
F_LEGEND     = OUT_DIR / 'legend_vocabulary.json'
F_TEACHING   = OUT_DIR / 'human_review_application.json'
F_ANSWERS    = OUT_DIR / 'human_review_answers.json'
F_SCALE      = OUT_DIR / 'scale_measurement' / 'results.json'
F_SYMBOL     = OUT_DIR / 'symbol_clusters.json'

# ── Helpers ────────────────────────────────────────────────────────────────────

def load_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default

def pct(n: int, total: int) -> str:
    if total == 0:
        return '—'
    return f'{n / total * 100:.0f}%'

def fmt_m(m: float) -> str:
    return f'{m:,.1f} m'

# ── Section builders ───────────────────────────────────────────────────────────

def build_pipeline_section() -> Dict:
    data = load_json(F_PIPELINE, {})
    stages = data.get('stages', [])
    ps     = data.get('pipeline_status', {})
    ns     = data.get('recommended_next_step', {})
    ts     = data.get('metadata', {}).get('timestamp', 'unknown')

    stage_rows = []
    for s in stages:
        stage_rows.append({
            'stage_id':   s.get('stage_id'),
            'name':       s.get('name'),
            'status':     s.get('status'),
            'script':     s.get('script'),
            'warnings':   len(s.get('warnings', [])),
        })

    warnings = [w for s in stages for w in s.get('warnings', [])]

    return {
        'last_run':       ts,
        'stages_ok':      ps.get('stages_ok', 0),
        'stages_partial': ps.get('stages_partial', 0),
        'stages_missing': ps.get('stages_missing', 0),
        'stages_error':   ps.get('stages_error', 0),
        'total_stages':   len(stages),
        'overall':        ps.get('overall', 'unknown'),
        'stage_rows':     stage_rows,
        'n_warnings':     len(warnings),
        'next_step':      ns,
    }


def build_boq_section() -> Dict:
    data   = load_json(F_BOQ, {})
    items  = data.get('items', [])
    totals = data.get('totals', {})
    si     = data.get('scale_info', {})

    by_cat: Dict[str, int] = {}
    n_approved = 0
    n_review   = 0
    for it in items:
        cat = it.get('item_category', 'unknown')
        by_cat[cat] = by_cat.get(cat, 0) + 1
        if it.get('approved_for_boq'):
            n_approved += 1
        if it.get('requires_review'):
            n_review += 1

    # Top unresolved blockers from review_reason
    blockers: List[str] = []
    for it in items:
        rr = it.get('review_reason')
        if rr and it.get('requires_review') and rr not in blockers:
            blockers.append(rr)

    return {
        'total_items':          totals.get('total_boq_items', len(items)),
        'approved_for_boq':     n_approved,
        'requires_review':      n_review,
        'pole_locations':       totals.get('total_pole_locations', 0),
        'sign_plates':          totals.get('total_sign_plates', 0),
        'assemblies':           totals.get('total_assemblies', 0),
        'sign_code_candidates': totals.get('sign_code_candidates', 0),
        'total_linear_m':       totals.get('total_linear_m', 0.0),
        'by_category':          by_cat,
        'top_blockers':         blockers[:5],
        'scale_status':         si.get('status', 'unknown'),
        'scale_ratio':          si.get('ratio', 500),
        'scale_source':         si.get('source', 'unknown'),
        'calibration_status':   si.get('calibration', {}).get('status', 'not_calibrated'),
    }


def build_sign_section() -> Dict:
    inv_raw   = load_json(F_INVENTORY)
    queue     = load_json(F_QUEUE, [])
    val_data  = load_json(F_VALIDATION, {})
    partial   = load_json(F_PARTIAL, {})
    legend    = load_json(F_LEGEND, {})

    # sign_inventory.json is a dict with 'occurrences' key
    if isinstance(inv_raw, list):
        inv = inv_raw
    elif isinstance(inv_raw, dict):
        inv = inv_raw.get('occurrences', inv_raw.get('records', []))
    else:
        inv = []
    q   = queue if isinstance(queue, list) else []

    # Inventory
    n_occ        = len(inv)
    n_confirmed  = sum(1 for r in inv if r.get('selected_sign_code'))
    n_pending    = n_occ - n_confirmed
    n_legend_hi  = sum(1 for r in inv if r.get('visual_match_tier') == 'high')
    n_legend_med = sum(1 for r in inv if r.get('visual_match_tier') == 'medium')

    # Review queue
    n_queue        = len(q)
    n_medium       = sum(1 for r in q if r.get('auto_result', {}).get('poc3_tier') == 'MEDIUM')
    n_hc           = sum(1 for r in q if r.get('human_confirmed_code'))

    # Validation
    val_results = val_data.get('results', [])
    val_counts: Dict[str, int] = {}
    for r in val_results:
        s = r.get('validation_status', 'unknown')
        val_counts[s] = val_counts.get(s, 0) + 1

    # Partial codes — count by OCC (results list), not by group
    suffix_groups  = partial.get('suffix_groups', {})
    partial_results = partial.get('results', [])
    resolution_counts: Dict[str, int] = {}
    for r in partial_results:
        st = r.get('resolution_status', 'unknown')
        resolution_counts[st] = resolution_counts.get(st, 0) + 1
    # Fallback: count by group if results empty
    if not resolution_counts:
        for g in suffix_groups.values():
            st = g.get('resolution_status', 'unknown')
            resolution_counts[st] = resolution_counts.get(st, 0) + 1

    # Review questions
    pending_qs = []
    for g in suffix_groups.values():
        if not g.get('human_confirmed'):
            for q_item in g.get('review_questions', []):
                pending_qs.append({
                    'question_id': q_item['question_id'],
                    'question':    q_item['question'][:120],
                    'impact':      q_item['impact'],
                })

    # Legend
    leg_rows   = legend.get('n_rows', 0) if isinstance(legend, dict) else 0
    leg_labels = sum(1 for r in (legend.get('rows', []) if isinstance(legend, dict) else [])
                     if r.get('sign_code') is not None)

    return {
        'n_occurrences':     n_occ,
        'n_confirmed_codes': n_confirmed,
        'n_pending_codes':   n_pending,
        'n_legend_high':     n_legend_hi,
        'n_legend_medium':   n_legend_med,
        'n_queue':           n_queue,
        'n_queue_medium':    n_medium,
        'n_human_confirmed': n_hc,
        'validation_counts': val_counts,
        'resolution_counts': resolution_counts,
        'suffix_groups':     [
            {
                'suffix':     s,
                'frequency':  g['frequency'],
                'status':     g['resolution_status'],
                'expansions': [c['code'] for c in g.get('expansion_candidates', [])],
                'human_confirmed': g.get('human_confirmed', False),
                'human_code':      g.get('human_confirmed_code'),
            }
            for s, g in suffix_groups.items()
        ],
        'pending_review_questions': pending_qs,
        'legend_rows':       leg_rows,
        'legend_labeled':    leg_labels,
        'legend_status':     'pending_label_extraction' if leg_labels == 0 else 'partial',
    }


def build_measurement_section() -> Dict:
    scale_data  = load_json(F_SCALE, {})
    boq         = load_json(F_BOQ, {})
    items       = boq.get('items', [])
    si          = boq.get('scale_info', {})

    # Linear quantities by type
    linear_items = [i for i in items if 'linear' in i.get('item_category', '')]
    by_type: Dict[str, float] = {}
    for it in linear_items:
        desc = it.get('description_en') or it.get('description_he') or it.get('item_type', '?')
        qty  = float(it.get('quantity', 0) or 0)
        key  = desc[:50]
        by_type[key] = by_type.get(key, 0.0) + qty

    # Element group totals
    eg_data = load_json(F_ELEMENTS, {})
    groups = eg_data.get('groups', [])
    total_paths = sum(g.get('drawing_area_paths', 0) for g in groups)

    # Scale measurement dedup
    sd = scale_data if isinstance(scale_data, dict) else {}
    n_segments = sd.get('n_segments', sd.get('n_total', 0))

    return {
        'total_linear_m':     si.get('m_per_pt', 0) and boq.get('totals', {}).get('total_linear_m', 0),
        'scale_status':       si.get('status', 'unknown'),
        'scale_ratio':        si.get('ratio', 500),
        'scale_source':       si.get('source', 'unknown'),
        'calibration_status': si.get('calibration', {}).get('status', 'not_calibrated'),
        'scale_requires_confirmation': si.get('requires_human_scale_confirmation', True),
        'linear_by_type':     by_type,
        'n_linear_items':     len(linear_items),
        'n_area_items':       len([i for i in items if i.get('item_category') == 'measured_area']),
        'n_segments_measured': n_segments,
        'total_drawing_paths': total_paths,
    }


def build_decomposition_section() -> Dict:
    data   = load_json(F_ELEMENTS, {})
    groups = data.get('groups', [])

    cls_counts: Dict[str, int] = {}
    for g in groups:
        c = g.get('classification', 'unknown')
        cls_counts[c] = cls_counts.get(c, 0) + 1

    high_impact = [
        {
            'group_id':    g['group_id'],
            'element_type': g.get('element_type', '?'),
            'n_paths':     g.get('drawing_area_paths', 0),
            'classification': g.get('classification'),
            'human_confirmed': g.get('human_confirmed', False),
        }
        for g in groups
        if g.get('drawing_area_paths', 0) >= 1000
        and g.get('classification') in ('review', 'unknown')
    ]
    high_impact.sort(key=lambda g: -g['n_paths'])

    taxonomy_cands = [g for g in groups if g.get('classification') == 'include' and g.get('requires_review')]

    return {
        'total_groups':       len(groups),
        'by_classification':  cls_counts,
        'n_include':          cls_counts.get('include', 0),
        'n_ignore':           cls_counts.get('ignore', 0),
        'n_review':           cls_counts.get('review', 0),
        'high_impact_unknowns': high_impact,
        'n_high_impact':      len(high_impact),
        'n_taxonomy_cands':   len(taxonomy_cands),
    }


def build_teaching_section() -> Dict:
    app_data  = load_json(F_TEACHING, {})
    partial   = load_json(F_PARTIAL, {})
    has_file  = F_ANSWERS.exists()

    meta    = app_data.get('meta', {})
    entries = app_data.get('applied_entries', [])
    sc: Dict[str, int] = {}
    for e in entries:
        s = e.get('status', 'unknown')
        sc[s] = sc.get(s, 0) + 1

    # Count pending questions across all suffix groups
    pending_qs = 0
    for g in partial.get('suffix_groups', {}).values():
        if not g.get('human_confirmed'):
            pending_qs += len(g.get('review_questions', []))

    return {
        'answers_file_exists': has_file,
        'n_answers_loaded':    meta.get('n_answers_loaded', 0),
        'n_applied':           meta.get('n_applied', 0),
        'n_skipped':           meta.get('n_skipped', 0),
        'n_contradictions':    meta.get('n_contradictions', 0),
        'n_pending_questions': meta.get('n_pending_questions', pending_qs),
        'status_counts':       sc,
        'supported_types': [
            'partial_code_resolution',
            'element_group_classification',
            'scale_calibration',
            'color_taxonomy_rule',
            'sign_code_confirmation',
            'ignore_rule',
        ],
        'loop_ready': not has_file,  # ready to start — just needs answers file
        'teaching_instruction': (
            'Copy outputs/human_review_answers.example.json → outputs/human_review_answers.json, '
            'fill in real answers, re-run 23_human_review_writeback.py'
        ),
    }


def build_red_flags(
    pipe: Dict, boq: Dict, signs: Dict, meas: Dict, decomp: Dict, teaching: Dict
) -> List[Dict]:
    flags: List[Dict] = []

    def flag(severity: str, code: str, message: str, action: str, file: Optional[str] = None):
        flags.append({
            'severity': severity,
            'code':     code,
            'message':  message,
            'action':   action,
            'file':     file,
        })

    # ── CRITICAL ────────────────────────────────────────────────────────────
    if boq['approved_for_boq'] == 0:
        flag('CRITICAL', 'BOQ-UNAPPROVED',
             f'0 / {boq["total_items"]} BOQ items approved — no quantity is confirmed for production use.',
             'All quantities require human validation and a separate BOQ approval gate before operational use.',
             'outputs/boq_unified_draft.json')

    if boq['calibration_status'] == 'not_calibrated':
        flag('CRITICAL', 'SCALE-UNCALIBRATED',
             f'Scale 1:{boq["scale_ratio"]} is a fallback assumption — all {fmt_m(boq["total_linear_m"])} is unverified.',
             'Provide two points with known real-world distance in calibration_template.json and re-run 15_scale_measurement.py.',
             'outputs/scale_measurement/results.json')

    n_ambiguous = signs['resolution_counts'].get('ambiguous', 0)
    if n_ambiguous > 0:
        ambig_groups = [g for g in signs['suffix_groups'] if g['status'] == 'ambiguous']
        suffixes = [g['suffix'] for g in ambig_groups]
        total_occs = sum(g['frequency'] for g in ambig_groups)
        flag('CRITICAL', 'PARTIAL-CODE-UNRESOLVED',
             f'{n_ambiguous} OCC(s) / {len(ambig_groups)} suffix group(s) unresolved — '
             f'suffixes: {", ".join(suffixes)} ({total_occs} sign locations affected). '
             f'Cannot determine full 3-digit code without human review.',
             'Answer Q-33-1 in outputs/human_review_answers.json to resolve.',
             'outputs/partial_code_resolution_report.html')

    if signs['legend_status'] == 'pending_label_extraction':
        flag('CRITICAL', 'LEGEND-UNLABELED',
             f'Legend vocabulary: {signs["legend_rows"]} rows, 0 labels extracted. '
             f'Sign identity depends entirely on legend label extraction.',
             'Run 07_extract_legend.py with vision support OR fill legend labels manually.',
             'outputs/legend_vocabulary.json')

    # ── WARNING ─────────────────────────────────────────────────────────────
    if signs['n_confirmed_codes'] == 0:
        flag('WARNING', 'CODES-UNCONFIRMED',
             f'0 / {signs["n_occurrences"]} sign occurrences have a confirmed 3-digit code.',
             'Codes require human confirmation via review queue or human_review_answers.json.',
             'outputs/review_queue.json')

    hi = decomp['high_impact_unknowns']
    if hi:
        ids = ', '.join(g['group_id'] for g in hi[:4])
        flag('WARNING', 'HIGH-IMPACT-UNKNOWN-GROUPS',
             f'{len(hi)} high-impact element groups unclassified: {ids}. '
             f'These represent large path volumes with unknown BOQ impact.',
             'Classify groups in human_review_answers.json using element_group_classification answers.',
             'outputs/element_groups_report.html')

    n_susp = signs['validation_counts'].get('suspicious', 0)
    if n_susp > 0:
        flag('WARNING', 'SUSPICIOUS-CODES',
             f'{n_susp} OCC(s) produced codes with no valid expansion in any Israeli sign series (e.g. "86").',
             'Review in validation_report.html — likely false-positive digit detection.',
             'outputs/validation_report.html')

    if not teaching['answers_file_exists']:
        flag('WARNING', 'TEACHING-LOOP-NOT-STARTED',
             f'Teaching loop not yet started — {teaching["n_pending_questions"]} review questions pending, '
             f'0 human answers recorded.',
             'Copy outputs/human_review_answers.example.json → outputs/human_review_answers.json and fill in answers.',
             'outputs/human_review_answers.example.json')

    if pipe['stages_missing'] > 0 or pipe['stages_error'] > 0:
        flag('WARNING', 'PIPELINE-INCOMPLETE',
             f'Pipeline: {pipe["stages_missing"]} missing + {pipe["stages_error"]} error stages.',
             'Run 19_run_plan_scanner_pipeline.py to identify and re-run missing stages.',
             'outputs/pipeline_run_report.html')

    # ── INFO ────────────────────────────────────────────────────────────────
    if boq['requires_review'] > 0:
        flag('INFO', 'ITEMS-REQUIRE-REVIEW',
             f'{boq["requires_review"]} / {boq["total_items"]} BOQ items flagged as requires_review.',
             'Review each item before any BOQ approval step.',
             'outputs/boq_unified_report.html')

    if signs['legend_rows'] > 0 and signs['legend_labeled'] == 0:
        flag('INFO', 'LEGEND-VISION-NOT-RUN',
             f'Legend region detected ({signs["legend_rows"]} rows) but labels not extracted. '
             f'Vision API not configured.',
             'No action required — legend label extraction deferred. Manual review can fill in labels.',
             'outputs/legend_vocabulary.json')

    if decomp['n_taxonomy_cands'] > 0:
        flag('INFO', 'TAXONOMY-CANDIDATES',
             f'{decomp["n_taxonomy_cands"]} element groups classified as "include" but still require human review.',
             'Review element_groups_report.html and confirm or reclassify.',
             'outputs/element_groups_report.html')

    # Sort: CRITICAL first, then WARNING, then INFO
    order = {'CRITICAL': 0, 'WARNING': 1, 'INFO': 2}
    return sorted(flags, key=lambda f: order.get(f['severity'], 9))


def build_next_actions() -> List[Dict]:
    return [
        {
            'priority': 1,
            'action':   'Fill scale calibration data',
            'detail':   'Identify two points with a known real-world distance in the plan PDF. '
                        'Record PDF coordinates in outputs/legend_color_match/calibration_template.json. '
                        'Re-run 15_scale_measurement.py. Cost: free.',
            'command':  '.venv/bin/python3 15_scale_measurement.py',
            'file':     'outputs/scale_measurement/results.json',
        },
        {
            'priority': 2,
            'action':   'Answer pending review questions (Q-33-1)',
            'detail':   'Look at the plan PDF at the 6 OCC locations with suffix "33". '
                        'Identify the full 3-digit sign code. '
                        'Fill in outputs/human_review_answers.json and re-run 23_human_review_writeback.py. '
                        'One answer resolves 6 OCCs. Cost: free.',
            'command':  '.venv/bin/python3 23_human_review_writeback.py',
            'file':     'outputs/human_review_answers.example.json',
        },
        {
            'priority': 3,
            'action':   'Classify high-impact element groups (G-001, G-005, G-006, G-011)',
            'detail':   'Review element_groups_report.html. Classify each high-impact group using '
                        'element_group_classification answers in human_review_answers.json. Cost: free.',
            'command':  'open outputs/element_groups_report.html',
            'file':     'outputs/element_groups_report.html',
        },
        {
            'priority': 4,
            'action':   'Review color taxonomy candidates',
            'detail':   'Review element groups with classification="review" in element_groups_report.html. '
                        'Assign color taxonomy rules using human_review_answers.json. Cost: free.',
            'command':  'open outputs/element_groups_report.html',
            'file':     None,
        },
        {
            'priority': 5,
            'action':   'Manual legend label extraction',
            'detail':   'Open outputs/legend_icons/ and manually read the Hebrew labels next to each legend icon. '
                        'Fill in legend_vocabulary.json or add sign_code_confirmation answers. Cost: free.',
            'command':  'open outputs/legend_icons/',
            'file':     'outputs/legend_vocabulary.json',
        },
        {
            'priority': 6,
            'action':   'Build minimal local review UI (future)',
            'detail':   'A local HTML/React tool that shows each OCC crop alongside the review question. '
                        'Feeds answers directly into human_review_answers.json. Cost: free. Not yet built.',
            'command':  None,
            'file':     None,
        },
        {
            'priority': 7,
            'action':   'Production sidebar integration (after research validation)',
            'detail':   'Integrate סורק תוכניות into production Elkayam sidebar only after: '
                        '(a) scale verified, (b) sign codes confirmed, (c) BOQ approval gate designed. '
                        'Do not integrate prematurely.',
            'command':  None,
            'file':     None,
        },
    ]


# ── Report builders ─────────────────────────────────────────────────────────────

def build_md(dash: Dict) -> str:
    pipe   = dash['sections']['pipeline']
    boq    = dash['sections']['boq']
    signs  = dash['sections']['signs']
    meas   = dash['sections']['measurement']
    decomp = dash['sections']['decomposition']
    teach  = dash['sections']['teaching']
    flags  = dash['red_flags']
    acts   = dash['next_actions']
    ts     = dash['meta']['generated_at']

    lines = [
        '# Master Research Dashboard — סורק תוכניות',
        '',
        f'Generated: `{ts}`',
        '',
        '> ⚠ **RESEARCH-ONLY** — `approved_for_boq: false` on all items.',
        '> Static report. No server required.',
        '',
        '## 1. Pipeline Status',
        '',
        f'Last run: `{pipe["last_run"]}` &nbsp;|&nbsp; '
        f'Stages: **{pipe["stages_ok"]}/{pipe["total_stages"]}** OK &nbsp;|&nbsp; '
        f'Overall: **{pipe["overall"].upper()}**',
        '',
        '| Stage | Name | Status | Script |',
        '|-------|------|--------|--------|',
    ]
    for s in pipe['stage_rows']:
        icon = {'ok': '✅', 'partial': '⚠️', 'missing': '❌', 'error': '💥'}.get(s['status'], '?')
        lines.append(f'| {s["stage_id"]} | {s["name"]} | {icon} {s["status"].upper()} | `{s["script"] or "—"}` |')

    lines += [
        '',
        '## 2. BOQ Status',
        '',
        f'| Metric | Value |',
        f'|--------|-------|',
        f'| Total items | {boq["total_items"]} |',
        f'| Approved for BOQ | **{boq["approved_for_boq"]}** (0%) |',
        f'| Requires review | {boq["requires_review"]} |',
        f'| Pole locations | {boq["pole_locations"]} |',
        f'| Sign plates | {boq["sign_plates"]} |',
        f'| Total linear | **{fmt_m(boq["total_linear_m"])}** |',
        f'| Scale status | **{boq["scale_status"].upper()}** (1:{boq["scale_ratio"]}) |',
        f'| Calibration | {boq["calibration_status"]} |',
        '',
        '## 3. Sign / Code Status',
        '',
        f'| Metric | Value |',
        f'|--------|-------|',
        f'| Sign occurrences | {signs["n_occurrences"]} |',
        f'| Confirmed codes | {signs["n_confirmed_codes"]} |',
        f'| Partial codes (ambiguous) | {signs["resolution_counts"].get("ambiguous", 0)} |',
        f'| Invalid partial codes | {signs["resolution_counts"].get("invalid_partial", 0)} |',
        f'| Legend rows | {signs["legend_rows"]} (labeled: {signs["legend_labeled"]}) |',
        f'| Legend status | {signs["legend_status"]} |',
        '',
        '**Suffix groups:**',
        '',
        '| Suffix | Freq | Status | Expansions |',
        '|--------|------|--------|-----------|',
    ]
    for g in signs['suffix_groups']:
        exps = ', '.join(str(e) for e in g['expansions'])
        hc = f'→ {g["human_code"]}' if g['human_confirmed'] else ''
        lines.append(f'| `{g["suffix"]}` | {g["frequency"]}× | {g["status"]} {hc} | {exps} |')

    lines += [
        '',
        '## 4. Measurement Status',
        '',
        f'| Metric | Value |',
        f'|--------|-------|',
        f'| Total linear | **{fmt_m(boq["total_linear_m"])}** |',
        f'| Scale ratio | 1:{meas["scale_ratio"]} ({meas["scale_status"].upper()}) |',
        f'| Scale source | {meas["scale_source"]} |',
        f'| Calibration | {meas["calibration_status"]} |',
        '',
        '## 5. Element Decomposition',
        '',
        f'| Metric | Value |',
        f'|--------|-------|',
        f'| Total groups | {decomp["total_groups"]} |',
        f'| Include | {decomp["n_include"]} |',
        f'| Review | {decomp["n_review"]} |',
        f'| Ignore | {decomp["n_ignore"]} |',
        f'| High-impact unknowns | {decomp["n_high_impact"]} |',
        '',
        '**High-impact unknowns:**',
        '',
        '| Group | Type | Drawing-area paths | Classified |',
        '|-------|------|--------------------|-----------|',
    ]
    for g in decomp['high_impact_unknowns'][:8]:
        lines.append(f'| {g["group_id"]} | {g["element_type"]} | {g["n_paths"]:,} | '
                     f'{"✅ human" if g["human_confirmed"] else "❌ pending"} |')

    lines += [
        '',
        '## 6. Human Review / Teaching Loop',
        '',
        f'| Metric | Value |',
        f'|--------|-------|',
        f'| Answers file | {"✅ exists" if teach["answers_file_exists"] else "❌ not found"} |',
        f'| Answers loaded | {teach["n_answers_loaded"]} |',
        f'| Applied | {teach["n_applied"]} |',
        f'| Contradictions | {teach["n_contradictions"]} |',
        f'| Pending questions | {teach["n_pending_questions"]} |',
        '',
        '## 7. Red Flags',
        '',
    ]

    for sev in ('CRITICAL', 'WARNING', 'INFO'):
        sev_flags = [f for f in flags if f['severity'] == sev]
        if sev_flags:
            lines.append(f'### {sev}')
            lines.append('')
            for fl in sev_flags:
                lines.append(f'- **[{fl["code"]}]** {fl["message"]}')
                lines.append(f'  *Action: {fl["action"]}*')
                lines.append('')

    lines += [
        '## 8. Next Local Actions (free only)',
        '',
        '| # | Action | Command |',
        '|---|--------|---------|',
    ]
    for a in acts:
        cmd = f'`{a["command"]}`' if a['command'] else '—'
        lines.append(f'| {a["priority"]} | {a["action"]} | {cmd} |')

    lines += [
        '',
        '---',
        '',
        '> ⚠ **No paid API used. No production UI/DB/flows modified.**',
        '> All data is provisional research output.',
        '',
        '*Not approved for construction, procurement, billing, or field use.*',
    ]
    return '\n'.join(lines)


# ── HTML ───────────────────────────────────────────────────────────────────────

def _badge(status: str) -> str:
    colors = {'ok': '#15803d', 'partial': '#b45309', 'missing': '#dc2626', 'error': '#7c3aed',
              'CRITICAL': '#dc2626', 'WARNING': '#d97706', 'INFO': '#2563eb',
              'ambiguous': '#d97706', 'invalid_partial': '#7c3aed', 'human_confirmed': '#15803d',
              'unverified': '#dc2626', 'not_calibrated': '#dc2626'}
    icons  = {'ok': '✅', 'partial': '⚠️', 'missing': '❌', 'error': '💥',
              'CRITICAL': '🚨', 'WARNING': '⚠️', 'INFO': 'ℹ️'}
    c    = colors.get(status, '#555')
    icon = icons.get(status, '')
    return (f'<span style="background:{c};color:#fff;padding:2px 8px;border-radius:4px;'
            f'font-size:12px;font-weight:600">{icon} {status.upper()}</span>')


def _metric(label: str, value: str, color: str = '#1e3a5f', sub: str = '') -> str:
    sub_html = f'<div style="font-size:10px;color:#9ca3af">{sub}</div>' if sub else ''
    return (f'<div style="display:inline-block;background:#fff;border:2px solid {color};'
            f'border-radius:8px;padding:8px 14px;margin:4px;text-align:center;min-width:88px">'
            f'<div style="font-size:20px;font-weight:bold;color:{color}">{value}</div>'
            f'<div style="font-size:11px;color:#555">{label}</div>{sub_html}</div>')


def build_html(dash: Dict) -> str:
    pipe   = dash['sections']['pipeline']
    boq    = dash['sections']['boq']
    signs  = dash['sections']['signs']
    meas   = dash['sections']['measurement']
    decomp = dash['sections']['decomposition']
    teach  = dash['sections']['teaching']
    flags  = dash['red_flags']
    acts   = dash['next_actions']
    ts     = dash['meta']['generated_at']

    # ── Section 1: Pipeline ─────────────────────────────────────────────────
    stage_cards = ''
    for s in pipe['stage_rows']:
        sc = {'ok': '#15803d', 'partial': '#b45309', 'missing': '#dc2626', 'error': '#7c3aed'}.get(s['status'], '#555')
        warn_badge = (f'<span style="background:#fef3c7;color:#92400e;border-radius:3px;'
                      f'padding:1px 5px;font-size:10px">{s["warnings"]}w</span>') if s['warnings'] else ''
        stage_cards += (
            f'<div style="border:2px solid {sc};border-radius:6px;padding:8px 12px;'
            f'margin:4px;display:inline-block;vertical-align:top;min-width:140px;max-width:180px">'
            f'<div style="font-size:11px;color:#6b7280">{s["stage_id"]}</div>'
            f'<div style="font-weight:600;font-size:13px;margin:2px 0">{s["name"]}</div>'
            f'{_badge(s["status"])} {warn_badge}</div>'
        )

    # ── Section 2: BOQ ──────────────────────────────────────────────────────
    boq_cards = (
        _metric('BOQ items', str(boq['total_items']), '#1e3a5f') +
        _metric('Approved', str(boq['approved_for_boq']), '#dc2626', 'always 0 until BOQ gate') +
        _metric('Review', str(boq['requires_review']), '#d97706') +
        _metric('Poles', str(boq['pole_locations']), '#2563eb') +
        _metric('Plates', str(boq['sign_plates']), '#2563eb') +
        _metric('Linear', fmt_m(boq['total_linear_m']), '#059669', boq['scale_status']) +
        _metric('Code cands.', str(boq.get('sign_code_candidates', 0)), '#d97706')
    )
    blocker_items = ''.join(f'<li style="color:#dc2626;font-size:12px">{b}</li>'
                            for b in boq['top_blockers'])

    # ── Section 3: Signs ────────────────────────────────────────────────────
    sign_cards = (
        _metric('OCCs', str(signs['n_occurrences']), '#1e3a5f') +
        _metric('Confirmed', str(signs['n_confirmed_codes']), '#15803d' if signs['n_confirmed_codes'] > 0 else '#dc2626') +
        _metric('Ambiguous', str(signs['resolution_counts'].get('ambiguous', 0)), '#d97706') +
        _metric('Invalid', str(signs['resolution_counts'].get('invalid_partial', 0)), '#7c3aed') +
        _metric('Legend rows', str(signs['legend_rows']), '#6b7280', signs['legend_status'][:20])
    )
    suffix_rows = ''
    for g in signs['suffix_groups']:
        sc   = {'ambiguous': '#d97706', 'invalid_partial': '#7c3aed', 'human_confirmed': '#15803d'}.get(g['status'], '#555')
        exps = ', '.join(str(e) for e in g['expansions']) or 'none'
        hc   = f'→ <strong>{g["human_code"]}</strong>' if g['human_confirmed'] else '<em>unresolved</em>'
        suffix_rows += (
            f'<tr>'
            f'<td><code>"{g["suffix"]}"</code></td>'
            f'<td>{g["frequency"]}×</td>'
            f'<td>{_badge(g["status"])}</td>'
            f'<td style="font-size:12px">{exps}</td>'
            f'<td>{hc}</td>'
            f'</tr>\n'
        )

    pending_q_items = ''.join(
        f'<div style="background:#fffbeb;border-left:3px solid #f59e0b;padding:6px 10px;margin:4px 0;font-size:12px">'
        f'<strong>{q["question_id"]}</strong> {q["question"]}'
        f'<br><span style="color:#6b7280">Impact: {q["impact"]}</span></div>'
        for q in signs['pending_review_questions']
    )

    # ── Section 4: Measurement ──────────────────────────────────────────────
    scale_color = '#dc2626' if meas['scale_status'] != 'calibrated' else '#15803d'
    meas_cards = (
        _metric('Linear (m)', fmt_m(boq['total_linear_m']), '#059669') +
        _metric('Scale ratio', f'1:{meas["scale_ratio"]}', scale_color, meas['scale_status']) +
        _metric('Calibration', meas['calibration_status'][:10], '#dc2626' if meas['calibration_status'] == 'not_calibrated' else '#15803d')
    )
    lin_rows = ''
    for desc, qty in sorted(meas['linear_by_type'].items(), key=lambda kv: -kv[1])[:12]:
        lin_rows += f'<tr><td style="font-size:12px">{desc}</td><td><strong>{qty:,.1f}</strong></td><td>m</td></tr>\n'

    # ── Section 5: Decomposition ────────────────────────────────────────────
    decomp_cards = (
        _metric('Groups', str(decomp['total_groups']), '#1e3a5f') +
        _metric('Include', str(decomp['n_include']), '#15803d') +
        _metric('Review', str(decomp['n_review']), '#d97706') +
        _metric('Ignore', str(decomp['n_ignore']), '#6b7280') +
        _metric('High-impact unk.', str(decomp['n_high_impact']), '#dc2626')
    )
    hi_rows = ''
    for g in decomp['high_impact_unknowns']:
        hc_badge = _badge('ok') if g['human_confirmed'] else '<span style="color:#dc2626;font-size:12px">❌ pending</span>'
        hi_rows += (
            f'<tr>'
            f'<td><strong>{g["group_id"]}</strong></td>'
            f'<td style="font-size:12px">{g["element_type"]}</td>'
            f'<td style="text-align:right">{g["n_paths"]:,}</td>'
            f'<td>{hc_badge}</td>'
            f'</tr>\n'
        )

    # ── Section 6: Teaching ─────────────────────────────────────────────────
    teach_cards = (
        _metric('Answers file', '✅' if teach['answers_file_exists'] else '❌',
                '#15803d' if teach['answers_file_exists'] else '#dc2626') +
        _metric('Applied', str(teach['n_applied']), '#15803d') +
        _metric('Pending Qs', str(teach['n_pending_questions']), '#d97706') +
        _metric('Contradictions', str(teach['n_contradictions']), '#dc2626' if teach['n_contradictions'] > 0 else '#6b7280')
    )
    type_chips = ' '.join(
        f'<span style="background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:12px;font-size:11px;margin:2px">'
        f'{t}</span>' for t in teach['supported_types']
    )

    # ── Section 7: Red Flags ────────────────────────────────────────────────
    flag_html = ''
    for sev in ('CRITICAL', 'WARNING', 'INFO'):
        sev_flags = [f for f in flags if f['severity'] == sev]
        if not sev_flags:
            continue
        sc = {'CRITICAL': '#fef2f2', 'WARNING': '#fffbeb', 'INFO': '#eff6ff'}.get(sev, '#f9f9f9')
        bc = {'CRITICAL': '#fca5a5', 'WARNING': '#fde68a', 'INFO': '#bfdbfe'}.get(sev, '#e5e7eb')
        for fl in sev_flags:
            flink = (f' &nbsp;<a href="{fl["file"]}" style="font-size:11px" target="_blank">'
                     f'→ {Path(fl["file"]).name}</a>') if fl.get('file') else ''
            flag_html += (
                f'<div style="background:{sc};border-left:4px solid {bc};border-radius:0 6px 6px 0;'
                f'padding:8px 14px;margin:6px 0">'
                f'{_badge(sev)} <strong>[{fl["code"]}]</strong> {fl["message"]}{flink}'
                f'<br><span style="font-size:11px;color:#6b7280">Action: {fl["action"]}</span>'
                f'</div>\n'
            )

    n_crit = sum(1 for f in flags if f['severity'] == 'CRITICAL')
    n_warn = sum(1 for f in flags if f['severity'] == 'WARNING')
    n_info = sum(1 for f in flags if f['severity'] == 'INFO')

    # ── Section 8: Next actions ─────────────────────────────────────────────
    action_rows = ''
    for a in acts:
        cmd = f'<code style="background:#f1f5f9;padding:2px 4px">{a["command"]}</code>' if a['command'] else '—'
        flink = (f'<a href="{a["file"]}" style="font-size:11px" target="_blank">'
                 f'{Path(a["file"]).name}</a>') if a.get('file') else '—'
        action_rows += (
            f'<tr>'
            f'<td><strong>#{a["priority"]}</strong></td>'
            f'<td style="font-weight:600">{a["action"]}</td>'
            f'<td style="font-size:12px;color:#374151">{a["detail"]}</td>'
            f'<td>{cmd}</td>'
            f'<td>{flink}</td>'
            f'</tr>\n'
        )

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Master Research Dashboard — סורק תוכניות</title>
<style>
  * {{box-sizing:border-box}}
  body {{font-family: system-ui, sans-serif; margin: 0; background: #f1f5f9; color: #111;}}
  .nav {{position:sticky;top:0;z-index:100;background:#1e3a5f;padding:8px 24px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}}
  .nav a {{color:#93c5fd;font-size:13px;text-decoration:none;font-weight:500}}
  .nav a:hover {{color:#fff}}
  .nav-title {{color:#fff;font-weight:700;font-size:15px;margin-right:8px}}
  .page {{max-width:1200px;margin:0 auto;padding:20px 24px}}
  h1 {{color:#1e3a5f;font-size:1.5rem;margin:0 0 4px}}
  h2 {{font-size:1.05rem;margin:32px 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:4px;color:#1e3a5f}}
  table {{border-collapse:collapse;width:100%;background:#fff;font-size:13px;margin-top:6px}}
  th,td {{border:1px solid #e2e8f0;padding:5px 10px;text-align:left}}
  th {{background:#f8fafc;font-weight:600}}
  tr:hover {{background:#f0f9ff}}
  code {{background:#f1f5f9;padding:1px 4px;border-radius:3px;font-size:12px}}
  .disclaimer {{background:#fef2f2;border:2px solid #fca5a5;border-radius:8px;padding:10px 16px;margin:10px 0;font-size:13px}}
  .section {{background:#fff;border-radius:10px;padding:16px 20px;margin:12px 0;box-shadow:0 1px 3px rgba(0,0,0,.08)}}
  a {{color:#2563eb}}
  details summary {{cursor:pointer;font-weight:600;color:#2563eb;font-size:13px}}
</style>
</head>
<body>

<div class="nav">
  <span class="nav-title">סורק תוכניות — Research Dashboard</span>
  <a href="#pipeline">Pipeline</a>
  <a href="#boq">BOQ</a>
  <a href="#signs">Signs</a>
  <a href="#measurement">Measurement</a>
  <a href="#decomposition">Elements</a>
  <a href="#teaching">Teaching</a>
  <a href="#flags">Red Flags</a>
  <a href="#actions">Actions</a>
</div>

<div class="page">
<h1>Master Research Dashboard — סורק תוכניות</h1>
<p style="color:#6b7280;font-size:13px;margin:0 0 8px">
  Generated: <code>{ts}</code> &nbsp;|&nbsp;
  PDF: <code>50-448-02-400.pdf</code> &nbsp;|&nbsp;
  Pipeline: <strong>{pipe["stages_ok"]}/{pipe["total_stages"]} stages OK</strong>
</p>

<div class="disclaimer">
  🚨 <strong>RESEARCH-ONLY — NOT APPROVED BOQ DATA</strong> &nbsp;|&nbsp;
  <code>approved_for_boq: false</code> on all {boq["total_items"]} items &nbsp;|&nbsp;
  Scale UNVERIFIED · Sign codes UNCONFIRMED · Legend labels NULL
  &nbsp;|&nbsp; No paid API used · No production UI/DB/flows modified
</div>

<!-- Red flag summary bar -->
<div style="display:flex;gap:8px;margin:10px 0">
  <div style="background:#fef2f2;border:2px solid #fca5a5;border-radius:6px;padding:6px 14px;font-size:13px">
    🚨 <strong>{n_crit} CRITICAL</strong>
  </div>
  <div style="background:#fffbeb;border:2px solid #fde68a;border-radius:6px;padding:6px 14px;font-size:13px">
    ⚠️ <strong>{n_warn} WARNING</strong>
  </div>
  <div style="background:#eff6ff;border:2px solid #bfdbfe;border-radius:6px;padding:6px 14px;font-size:13px">
    ℹ️ <strong>{n_info} INFO</strong>
  </div>
</div>

<!-- ── 1. Pipeline ──────────────────────────────────────────────────────── -->
<div class="section" id="pipeline">
<h2>1. Pipeline Status</h2>
<p style="font-size:13px;color:#374151">
  Last run: <code>{pipe["last_run"]}</code> &nbsp;|&nbsp;
  {pipe["stages_ok"]}/{pipe["total_stages"]} OK &nbsp;|&nbsp;
  {pipe["stages_missing"]} missing &nbsp;|&nbsp;
  {pipe["n_warnings"]} warnings
</p>
<div style="margin:10px 0">{stage_cards}</div>
<div style="margin-top:10px;padding:10px 14px;background:#f0fdf4;border-radius:6px;font-size:13px">
  <strong>Next step [{pipe["next_step"].get("priority","?")}]:</strong>
  {pipe["next_step"].get("step","—")}
</div>
</div>

<!-- ── 2. BOQ ───────────────────────────────────────────────────────────── -->
<div class="section" id="boq">
<h2>2. BOQ Status</h2>
<div style="margin:8px 0">{boq_cards}</div>
{('<ul style="margin:6px 0">' + blocker_items + '</ul>') if blocker_items else ''}
<details style="margin-top:10px">
<summary>BOQ by category ({boq["total_items"]} items)</summary>
<table style="margin-top:6px">
  <tr><th>Category</th><th>Count</th></tr>
  {''.join(f"<tr><td><code>{cat}</code></td><td>{cnt}</td></tr>" for cat, cnt in sorted(boq["by_category"].items()))}
</table>
</details>
</div>

<!-- ── 3. Signs ─────────────────────────────────────────────────────────── -->
<div class="section" id="signs">
<h2>3. Sign / Code Status</h2>
<div style="margin:8px 0">{sign_cards}</div>
<h3 style="font-size:13px;margin:12px 0 4px">Suffix Groups (partial codes)</h3>
<table>
  <tr><th>Suffix</th><th>Freq</th><th>Status</th><th>Valid expansions</th><th>Resolved to</th></tr>
  {suffix_rows}
</table>
{"<h3 style='font-size:13px;margin:12px 0 4px'>Pending Review Questions</h3>" + pending_q_items if signs["pending_review_questions"] else ""}
<div style="margin-top:10px;padding:8px 12px;background:#f8fafc;border-radius:6px;font-size:12px;color:#374151">
  <strong>Legend:</strong> {signs["legend_rows"]} rows — {signs["legend_labeled"]} labeled —
  status: <code>{signs["legend_status"]}</code>
</div>
</div>

<!-- ── 4. Measurement ───────────────────────────────────────────────────── -->
<div class="section" id="measurement">
<h2>4. Measurement Status</h2>
<div style="margin:8px 0">{meas_cards}</div>
<p style="font-size:12px;color:#dc2626">
  ⚠ Scale 1:{meas["scale_ratio"]} is a fallback assumption (source: <code>{meas["scale_source"]}</code>).
  All linear quantities are provisional until calibrated.
</p>
<details style="margin-top:8px">
<summary>Linear quantities by type</summary>
<table style="margin-top:6px">
  <tr><th>Element type</th><th>Quantity</th><th>Unit</th></tr>
  {lin_rows}
</table>
</details>
</div>

<!-- ── 5. Decomposition ─────────────────────────────────────────────────── -->
<div class="section" id="decomposition">
<h2>5. Element Decomposition</h2>
<div style="margin:8px 0">{decomp_cards}</div>
<h3 style="font-size:13px;margin:12px 0 4px">High-Impact Unknowns</h3>
<table>
  <tr><th>Group</th><th>Type</th><th>Drawing-area paths</th><th>Classified</th></tr>
  {hi_rows}
</table>
</div>

<!-- ── 6. Teaching ──────────────────────────────────────────────────────── -->
<div class="section" id="teaching">
<h2>6. Human Review / Teaching Loop (תרגול ולמידה)</h2>
<div style="margin:8px 0">{teach_cards}</div>
<div style="margin:10px 0">
  <strong style="font-size:13px">Supported answer types:</strong><br>
  <div style="margin-top:4px">{type_chips}</div>
</div>
<div style="background:#f0f9ff;border:2px solid #bae6fd;border-radius:6px;padding:10px 14px;font-size:13px;margin-top:8px">
  <strong>Research entry point:</strong>
  <a href="plan_scanner_workspace.html" style="color:#1565c0;font-weight:700;margin-left:8px">Plan Scanner Workspace (S13) →</a><br>
  <strong>To start teaching loop:</strong><br>
  1. Open <a href="static_review_form.html" style="color:#1565c0;font-weight:700">Guided Review Form (S14)</a> — browser form, fill &amp; download answers<br>
  2. Or open <a href="teaching_loop_answer_pack.html" style="color:#1565c0;font-weight:600">Answer Pack (S12)</a> — all {teach['n_pending_questions']} questions with schemas<br>
  3. Save downloaded JSON as <code>outputs/human_review_answers.json</code><br>
  4. Run &nbsp;<code>.venv/bin/python3 23_human_review_writeback.py</code>
</div>
</div>

<!-- ── 7. Red Flags ─────────────────────────────────────────────────────── -->
<div class="section" id="flags">
<h2>7. Red Flags</h2>
{flag_html}
</div>

<!-- ── 8. Next Actions ──────────────────────────────────────────────────── -->
<div class="section" id="actions">
<h2>8. Next Recommended Local Actions (free only — no paid API)</h2>
<table>
  <tr><th>#</th><th>Action</th><th>Detail</th><th>Command</th><th>File</th></tr>
  {action_rows}
</table>
</div>

</div><!-- /page -->

<div style="background:#1e3a5f;color:#93c5fd;padding:10px 24px;font-size:11px;margin-top:24px">
  Generated by 24_master_research_dashboard.py &nbsp;|&nbsp;
  Research-only &nbsp;|&nbsp; No paid API &nbsp;|&nbsp; No production changes &nbsp;|&nbsp;
  Not approved for construction, procurement, billing, or field use.
</div>
</body></html>'''


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    t0 = time.time()
    ts = time.strftime('%Y-%m-%dT%H:%M:%S')
    print('=' * 60)
    print('Stage S11 — Master Research Dashboard')
    print('24_master_research_dashboard.py')
    print(f'Run: {ts}')
    print('=' * 60)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print('\n[Build] Assembling dashboard sections ...')
    pipe   = build_pipeline_section();   print(f'  Pipeline    : {pipe["stages_ok"]}/{pipe["total_stages"]} stages OK')
    boq    = build_boq_section();        print(f'  BOQ         : {boq["total_items"]} items, {boq["approved_for_boq"]} approved')
    signs  = build_sign_section();       print(f'  Signs       : {signs["n_occurrences"]} OCCs, {signs["n_confirmed_codes"]} confirmed')
    meas   = build_measurement_section();print(f'  Measurement : {fmt_m(boq["total_linear_m"])}, scale={meas["scale_status"]}')
    decomp = build_decomposition_section(); print(f'  Decomp      : {decomp["total_groups"]} groups, {decomp["n_high_impact"]} high-impact unknowns')
    teach  = build_teaching_section();   print(f'  Teaching    : {teach["n_answers_loaded"]} answers, {teach["n_pending_questions"]} pending Qs')

    print('\n[Flags] Computing red flags ...')
    flags = build_red_flags(pipe, boq, signs, meas, decomp, teach)
    for f in flags:
        print(f'  [{f["severity"]}] {f["code"]}: {f["message"][:70]}')

    print('\n[Actions] Building next actions ...')
    acts = build_next_actions()

    dashboard = {
        'meta': {
            'generated_at':  ts,
            'script':        '24_master_research_dashboard.py',
            'source_pdf':    '50-448-02-400.pdf',
            'approved_for_boq': False,
            'paid_api_used': False,
            'production_modified': False,
            'note':          'Research-only master dashboard. Static HTML, no server required.',
        },
        'sections': {
            'pipeline':      pipe,
            'boq':           boq,
            'signs':         signs,
            'measurement':   meas,
            'decomposition': decomp,
            'teaching':      teach,
        },
        'red_flags':    flags,
        'next_actions': acts,
    }

    print('\n[Write] Saving outputs ...')
    OUT_JSON.write_text(json.dumps(dashboard, ensure_ascii=False, indent=2))
    print(f'  → {OUT_JSON.relative_to(SCRIPT_DIR)}')

    OUT_MD.write_text(build_md(dashboard))
    print(f'  → {OUT_MD.relative_to(SCRIPT_DIR)}')

    OUT_HTML.write_text(build_html(dashboard))
    print(f'  → {OUT_HTML.relative_to(SCRIPT_DIR)}')

    elapsed = time.time() - t0
    n_crit = sum(1 for f in flags if f['severity'] == 'CRITICAL')
    n_warn = sum(1 for f in flags if f['severity'] == 'WARNING')
    n_info = sum(1 for f in flags if f['severity'] == 'INFO')

    print(f"""
{'=' * 60}
S11 MASTER DASHBOARD COMPLETE
{'=' * 60}
  Pipeline        : {pipe["stages_ok"]}/{pipe["total_stages"]} stages OK
  BOQ items       : {boq["total_items"]}  (approved: {boq["approved_for_boq"]})
  Sign OCCs       : {signs["n_occurrences"]}  (confirmed: {signs["n_confirmed_codes"]})
  Partial codes   : {signs["resolution_counts"].get("ambiguous",0)} ambiguous, {signs["resolution_counts"].get("invalid_partial",0)} invalid
  Linear (m)      : {fmt_m(boq["total_linear_m"])}  (scale: {meas["scale_status"]})
  Element groups  : {decomp["total_groups"]}  (high-impact unknowns: {decomp["n_high_impact"]})
  Teaching        : {teach["n_answers_loaded"]} answers, {teach["n_pending_questions"]} pending questions

  Red flags       : {n_crit} CRITICAL · {n_warn} WARNING · {n_info} INFO

  Paid API used   : NO
  Production modified: NO

  → {OUT_JSON.relative_to(SCRIPT_DIR)}
  → {OUT_MD.relative_to(SCRIPT_DIR)}
  → {OUT_HTML.relative_to(SCRIPT_DIR)}

  Elapsed         : {elapsed:.1f}s

  open {OUT_HTML.relative_to(SCRIPT_DIR)}

  REMINDER: Research-only. approved_for_boq: false on all items.
{'=' * 60}
""")


if __name__ == '__main__':
    main()
