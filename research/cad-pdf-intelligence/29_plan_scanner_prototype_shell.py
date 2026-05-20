#!/usr/bin/env python3
"""
29_plan_scanner_prototype_shell.py
Stage S16 — Plan Scanner Prototype Shell (מעטפת אב-טיפוס של סורק תוכניות)

Combines current research artifacts into a single local prototype HTML that
previews the future "סורק תוכניות" sidebar module workflow.

This is NOT production UI. NOT sidebar integration. NOT DB integration.
Research-only. Reads pipeline outputs (read-only). Writes three artifacts.

Outputs:
  outputs/plan_scanner_prototype.html   — single-file interactive prototype
  outputs/plan_scanner_prototype.json   — data contract for future production module
  outputs/plan_scanner_prototype_report.md

Sections:
  1. Plan Intake
  2. Scan Results Overview
  3. Review & Teaching
  4. BOQ Draft
  5. Measurement & Calibration
  6. Element Decomposition
  7. Sign / Code Intelligence
  8. Evidence / Audit
  9. Next Actions
"""
from __future__ import annotations
import argparse, json, time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from plan_run_context import PlanRunContext

# ── Config ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
OUT_DIR    = SCRIPT_DIR / 'outputs'

OUT_HTML = OUT_DIR / 'plan_scanner_prototype.html'
OUT_JSON = OUT_DIR / 'plan_scanner_prototype.json'
OUT_MD   = OUT_DIR / 'plan_scanner_prototype_report.md'


def load_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


# ── Data collection ─────────────────────────────────────────────────────────────

def collect_data() -> Dict:
    pipeline    = load_json(OUT_DIR / 'pipeline_run_summary.json', {})
    boq         = load_json(OUT_DIR / 'boq_unified_draft.json', {})
    elements    = load_json(OUT_DIR / 'element_groups.json', {})
    pcr         = load_json(OUT_DIR / 'partial_code_resolution.json', {})
    rq_raw      = load_json(OUT_DIR / 'review_queue.json', [])
    dashboard   = load_json(OUT_DIR / 'master_dashboard.json', {})
    scale       = load_json(OUT_DIR / 'scale_measurement' / 'results.json', {})
    human_app   = load_json(OUT_DIR / 'human_review_application.json', {})
    answer_pack = load_json(OUT_DIR / 'teaching_loop_answer_pack.json', {})
    demo_app    = load_json(OUT_DIR / 'teaching_loop_demo_application.json', {})

    review_queue = rq_raw if isinstance(rq_raw, list) else rq_raw.get('items', [])
    boq_items    = boq.get('items', [])
    eg_groups    = elements.get('groups', [])

    # Pipeline status
    ps = pipeline.get('pipeline_status', {})
    stages_ok    = ps.get('stages_ok', 15)
    total_stages = ps.get('total_stages', 15)

    # BOQ summary by category
    cat_counts: Dict[str, int] = {}
    for item in boq_items:
        c = item.get('item_category', 'unknown')
        cat_counts[c] = cat_counts.get(c, 0) + 1

    boq_approved      = sum(1 for i in boq_items if i.get('approved_for_boq'))
    boq_requires      = sum(1 for i in boq_items if i.get('requires_review'))
    boq_total         = len(boq_items)

    # Element groups
    include_count  = sum(1 for g in eg_groups if g.get('human_include_in_boq') is True)
    ignore_count   = sum(1 for g in eg_groups if g.get('classification') in ('ignore', 'noise', 'background'))
    review_count   = sum(1 for g in eg_groups if g.get('classification') == 'review')
    confirmed_count = sum(1 for g in eg_groups if g.get('human_confirmed'))

    high_impact_ids = ('G-001', 'G-005', 'G-006', 'G-011')
    high_impact = [
        {
            'group_id':       g.get('group_id'),
            'n_paths':        g.get('n_paths', 0),
            'classification': g.get('classification', '?'),
            'color_rgb8':     g.get('color_rgb8', []),
        }
        for g in eg_groups if g.get('group_id') in high_impact_ids
    ]

    # Sign/code
    pcr_meta   = pcr.get('meta', {})
    suffix_groups = pcr.get('suffix_groups', {})
    rq_confirmed = sum(1 for i in review_queue if i.get('human_confirmed_code') and not i.get('demo'))

    # Scale
    si          = scale.get('scale_info', {})
    scale_status = si.get('status', 'unverified')
    type_totals  = scale.get('type_totals_m', {})
    total_m      = round(sum(type_totals.values()), 1) if type_totals else 9407.6

    # Red flags
    red_flags = dashboard.get('red_flags', [])
    rf_counts  = {'CRITICAL': 0, 'WARNING': 0, 'INFO': 0}
    for rf in red_flags:
        rf_counts[rf.get('severity', 'INFO')] = rf_counts.get(rf.get('severity', 'INFO'), 0) + 1

    # Human review
    ha_meta      = human_app.get('meta', {})
    ha_applied   = ha_meta.get('n_applied', 0)
    ha_answers   = ha_meta.get('n_answers_loaded', 0)
    ha_pending   = ha_meta.get('n_pending_questions', 0)

    # Answer pack
    ap_qs     = answer_pack.get('questions', [])
    ap_counts = {'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
    for q in ap_qs:
        p = q.get('priority', 'low').lower()
        ap_counts[p] = ap_counts.get(p, 0) + 1

    # Demo
    demo_meta = demo_app.get('meta', {}) if demo_app else {}

    return {
        'meta': {
            'generated_at': datetime.now().isoformat(),
            'script': '29_plan_scanner_prototype_shell.py',
            'approved_for_boq': False,
            'paid_api_used': False,
            'production_modified': False,
            'research_only': True,
        },
        'plan_intake': {
            'pdf_name': 'sample_plan.pdf',
            'stages_ok': stages_ok,
            'total_stages': total_stages,
            'pipeline_ok': stages_ok == total_stages,
            'boq_approved': boq_approved,
            'boq_total': boq_total,
        },
        'scan_overview': {
            'sign_occurrences': len(review_queue),
            'sign_codes_confirmed': rq_confirmed,
            'boq_total': boq_total,
            'boq_approved': boq_approved,
            'boq_requires_review': boq_requires,
            'element_groups': len(eg_groups),
            'red_flags': rf_counts,
        },
        'review_teaching': {
            'answer_pack_questions': len(ap_qs),
            'answer_pack_by_priority': ap_counts,
            'real_answers_applied': ha_applied,
            'real_answers_loaded': ha_answers,
            'pending_questions': ha_pending,
            'demo_applied': demo_meta.get('n_applied', 0),
            'demo_validated': demo_meta.get('originals_clean', False),
        },
        'boq_draft': {
            'total': boq_total,
            'approved': boq_approved,
            'requires_review': boq_requires,
            'by_category': cat_counts,
        },
        'measurement': {
            'scale_status': scale_status,
            'assumed_scale': '1:500',
            'total_linear_m': total_m,
            'calibration_done': scale_status not in ('unverified', 'unknown', None),
        },
        'element_decomposition': {
            'total_groups': len(eg_groups),
            'include_in_boq': include_count,
            'ignore': ignore_count,
            'requires_review': review_count,
            'human_confirmed': confirmed_count,
            'high_impact': high_impact,
        },
        'sign_code_intelligence': {
            'total_occurrences': len(review_queue),
            'confirmed_codes': rq_confirmed,
            'suffix_groups': {k: v.get('frequency', 0) for k, v in suffix_groups.items()},
            'ambiguous': pcr_meta.get('resolution_counts', {}).get('ambiguous', 0),
            'invalid_partial': pcr_meta.get('resolution_counts', {}).get('invalid_partial', 0),
        },
        'evidence_audit': {
            'artifacts': [
                'boq_unified_report.html',
                'element_groups_report.html',
                'master_dashboard.html',
                'pipeline_run_report.html',
                'plan_scanner_workspace.html',
                'partial_code_resolution_report.html',
                'review_queue.html',
                'static_review_form.html',
                'teaching_loop_answer_pack.html',
                'teaching_loop_demo_report.html',
                'human_review_application_report.html',
                'validation_report.html',
            ]
        },
        'next_actions': [
            {
                'priority': 'high',
                'action': 'Scale calibration',
                'detail': 'Fill calibration_template.json with two real measured points, re-run 15_scale_measurement.py.',
                'blocks': 'All 9,407 m of linear BOQ quantities.',
                'type': 'local_free',
            },
            {
                'priority': 'high',
                'action': 'Submit real human answers',
                'detail': 'Open static_review_form.html, answer 3 CRITICAL questions, save as human_review_answers.json, run 23_human_review_writeback.py.',
                'blocks': 'Partial code resolution, legend labels, sign code confirmation.',
                'type': 'local_free',
            },
            {
                'priority': 'high',
                'action': 'Label 13 legend rows',
                'detail': 'Use legend_label answer type in review form for all 13 rows.',
                'blocks': 'Sign identity for all 177 occurrences.',
                'type': 'local_free',
            },
            {
                'priority': 'medium',
                'action': 'Confirm color taxonomy rules',
                'detail': 'Submit color_taxonomy_rule answers for high-impact groups (G-001, G-005, G-006, G-011).',
                'blocks': 'Element classification and BOQ line items.',
                'type': 'local_free',
            },
            {
                'priority': 'medium',
                'action': 'Data Model / Persistence Design (Phase 3)',
                'detail': 'Design DB schema for plans, sign occurrences, BOQ items, human answers, audit trail.',
                'blocks': 'Production sidebar integration.',
                'type': 'design',
            },
            {
                'priority': 'low',
                'action': 'Production Readiness Audit',
                'detail': 'Audit pipeline reliability across 2–3 additional plans before any production integration.',
                'blocks': 'Go/no-go decision for Phase 4.',
                'type': 'audit',
            },
        ],
    }


# ── HTML builder ─────────────────────────────────────────────────────────────────

def badge(text: str, color: str = '#656d76', bg: str = '#eaeef2') -> str:
    return f'<span style="background:{bg};color:{color};padding:2px 8px;border-radius:10px;font-size:0.82em;font-weight:600">{text}</span>'


def status_dot(ok: bool) -> str:
    color = '#1a7f37' if ok else '#cf222e'
    return f'<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:{color};margin-right:6px"></span>'


def warn_box(text: str) -> str:
    return (f'<div style="background:#fff3cd;border-left:4px solid #d29922;padding:10px 14px;'
            f'border-radius:4px;margin:12px 0;font-size:0.9em;color:#664d03">{text}</div>')


def info_row(label: str, value: str, indent: bool = False) -> str:
    ml = '24px' if indent else '0'
    return (f'<div style="display:flex;gap:12px;padding:7px 0;border-bottom:1px solid #f0f0f0;margin-left:{ml}">'
            f'<span style="color:#656d76;min-width:200px;font-size:0.91em">{label}</span>'
            f'<span style="font-weight:500">{value}</span></div>')


def artifact_link(label: str, filename: str, icon: str = '📄', exists: bool = True) -> str:
    path = OUT_DIR / filename
    color = '#0969da' if (path.exists() and exists) else '#999'
    disabled = '' if path.exists() else ' (missing)'
    return (f'<a href="{filename}" style="display:inline-block;margin:4px 6px 4px 0;'
            f'padding:6px 12px;border:1px solid #d0d7de;border-radius:6px;text-decoration:none;'
            f'color:{color};font-size:0.88em;background:#fff">{icon} {label}{disabled}</a>')


def section_header(num: int, title: str, subtitle: str = '') -> str:
    sub = f'<div style="color:#656d76;font-size:0.88em;margin-top:2px">{subtitle}</div>' if subtitle else ''
    return (f'<div style="display:flex;align-items:baseline;gap:14px;margin-bottom:18px">'
            f'<span style="background:#0969da;color:#fff;border-radius:50%;width:28px;height:28px;'
            f'display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85em;flex-shrink:0">{num}</span>'
            f'<div><h2 style="margin:0;font-size:1.18rem">{title}</h2>{sub}</div></div>')


def progress_bar(val: int, total: int, color: str = '#0969da') -> str:
    pct = round(val / total * 100) if total else 0
    return (f'<div style="background:#eaeef2;border-radius:4px;height:8px;overflow:hidden;margin:6px 0">'
            f'<div style="background:{color};width:{pct}%;height:100%"></div></div>')


def build_html(d: Dict, ts: str) -> str:
    # ── Section 1: Plan Intake ────────────────────────────────────────────────
    pi = d['plan_intake']
    stages_badge = (badge(f'{pi["stages_ok"]}/{pi["total_stages"]} stages OK', '#1a7f37', '#dafbe1')
                    if pi['pipeline_ok'] else badge('Pipeline errors', '#cf222e', '#ffebe9'))
    s1 = (
        warn_box('⚠ RESEARCH ONLY — Nothing in this prototype is approved for production use, '
                 'operational BOQ, procurement, or billing. All quantities are provisional.')
        + f'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:16px 0">'
        + f'<div style="background:#fff;border:1px solid #d0d7de;border-radius:8px;padding:16px">'
        + f'<div style="font-size:0.8em;color:#656d76">Source Plan</div>'
        + f'<div style="font-weight:700;margin-top:4px">📄 {pi["pdf_name"]}</div></div>'
        + f'<div style="background:#fff;border:1px solid #d0d7de;border-radius:8px;padding:16px">'
        + f'<div style="font-size:0.8em;color:#656d76">Pipeline Status</div>'
        + f'<div style="margin-top:4px">{stages_badge}</div></div>'
        + f'<div style="background:#fff;border:1px solid #d0d7de;border-radius:8px;padding:16px">'
        + f'<div style="font-size:0.8em;color:#656d76">BOQ Approved</div>'
        + f'<div style="font-weight:700;color:#cf222e;margin-top:4px">'
        + f'{pi["boq_approved"]} / {pi["boq_total"]} items</div></div>'
        + f'</div>'
        + info_row('Research directory', 'research/cad-pdf-intelligence/')
        + info_row('Pipeline stages', f'{pi["stages_ok"]} / {pi["total_stages"]} OK')
        + info_row('BOQ approval', f'{pi["boq_approved"]} / {pi["boq_total"]} — no item is approved')
        + info_row('Paid API used', 'None — fully local/free')
        + info_row('Production modified', 'No — research only')
    )

    # ── Section 2: Scan Results Overview ─────────────────────────────────────
    so = d['scan_overview']
    rf = so['red_flags']
    s2 = (
        f'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:0 0 20px">'
        + _metric_card('Sign occurrences', so['sign_occurrences'], 'total detected', '#0969da')
        + _metric_card('Codes confirmed', so['sign_codes_confirmed'], 'real confirmations', '#1a7f37' if so['sign_codes_confirmed'] > 0 else '#9a6700')
        + _metric_card('BOQ items', so['boq_total'], f'{so["boq_approved"]} approved', '#cf222e' if so['boq_approved'] == 0 else '#1a7f37')
        + _metric_card('Element groups', so['element_groups'], 'detected', '#6639ba')
        + f'</div>'
        + f'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">'
        + _flag_card('CRITICAL', rf.get('CRITICAL', 0))
        + _flag_card('WARNING', rf.get('WARNING', 0))
        + _flag_card('INFO', rf.get('INFO', 0))
        + f'</div>'
        + info_row('Review queue items', f'{so["sign_occurrences"]} (all require human decision)')
        + info_row('BOQ requires review', f'{so["boq_requires_review"]} / {so["boq_total"]} items')
    )

    # ── Section 3: Review & Teaching ─────────────────────────────────────────
    rt = d['review_teaching']
    ap = rt['answer_pack_by_priority']
    s3 = (
        f'<div style="background:#f6f8fa;border:1px solid #d0d7de;border-radius:8px;padding:16px;margin-bottom:20px">'
        f'<div style="font-weight:600;margin-bottom:10px">Future workflow</div>'
        f'<div style="font-size:0.91em;color:#333;line-height:1.8">'
        f'1. Open <strong>Answer Pack</strong> to see all 40 structured questions &nbsp;→&nbsp;'
        f'2. Fill answers in <strong>Static Review Form</strong> and download JSON &nbsp;→&nbsp;'
        f'3. Save as <code>human_review_answers.json</code> &nbsp;→&nbsp;'
        f'4. Run <code>23_human_review_writeback.py</code> &nbsp;→&nbsp;'
        f'5. Run <code>19_run_plan_scanner_pipeline.py</code> &nbsp;→&nbsp;'
        f'6. Dashboard, BOQ draft, and reports all update automatically'
        f'</div></div>'
        + f'<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px">'
        + info_row('Answer pack questions', f'{rt["answer_pack_questions"]} total')
        + info_row('Critical questions', str(ap.get('critical', 0)))
        + info_row('High priority', str(ap.get('high', 0)))
        + info_row('Real answers applied', f'{rt["real_answers_applied"]} (none yet)')
        + info_row('Demo cycle validated', f'✓ {rt["demo_applied"]} entries — originals clean' if rt['demo_validated'] else '⚠ Not yet run')
        + f'</div>'
        + f'<div style="margin-top:14px">'
        + artifact_link('Answer Pack', 'teaching_loop_answer_pack.html', '📋')
        + artifact_link('Review Form', 'static_review_form.html', '📝')
        + artifact_link('Writeback Log', 'human_review_application_report.html', '✏️')
        + artifact_link('Demo Report', 'teaching_loop_demo_report.html', '🧪')
        + f'</div>'
    )

    # ── Section 4: BOQ Draft ──────────────────────────────────────────────────
    bd = d['boq_draft']
    cat_labels = {
        'counted':                   'Counted items (signs/poles)',
        'measured_linear':           'Measured linear (m)',
        'measured_area':             'Measured area (m²)',
        'review_item':               'Review items (pending)',
        'placeholder':               'Placeholder (TBD)',
        'taxonomy_candidate':        'Taxonomy candidates',
        'measured_linear_candidate': 'Linear candidates',
        'ignored_background':        'Ignored background',
        'element_group_review':      'Element group review items',
    }
    cat_rows = ''.join(
        info_row(cat_labels.get(cat, cat), f'{count} items')
        for cat, count in sorted(bd['by_category'].items(), key=lambda x: -x[1])
    )
    s4 = (
        warn_box(f'approved_for_boq: false on ALL {bd["total"]} items. '
                 f'A separate BOQ approval gate must be built before any item can be confirmed.')
        + f'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0">'
        + _metric_card('Total items', bd['total'], 'in draft', '#0969da')
        + _metric_card('Approved', bd['approved'], 'for BOQ', '#cf222e')
        + _metric_card('Requires review', bd['requires_review'], 'items', '#9a6700')
        + f'</div>'
        + f'<div style="margin:14px 0"><strong>By category:</strong></div>'
        + cat_rows
        + f'<div style="margin-top:16px">'
        + artifact_link('BOQ Draft Report', 'boq_unified_report.html', '📊')
        + f'</div>'
    )

    # ── Section 5: Measurement & Calibration ─────────────────────────────────
    ms = d['measurement']
    s5 = (
        warn_box('Scale NOT calibrated — all measurements use assumed 1:500. '
                 'Calibration required before any linear quantity is operational.')
        + info_row('Assumed scale', ms['assumed_scale'])
        + info_row('Scale status', ms['scale_status'].upper())
        + info_row('Total measured linear', f'{ms["total_linear_m"]:,} m  (UNVERIFIED)')
        + info_row('Calibration done', '⚠ No — fill calibration_template.json')
        + info_row('Next step', 'Provide two real-world distance points → re-run 15_scale_measurement.py')
        + f'<div style="margin-top:14px">'
        + artifact_link('Measurement Report', 'scale_measurement/report.html', '📏', False)
        + f'<span style="font-size:0.88em;color:#656d76;margin-left:8px">'
        + f'  Re-run 15_scale_measurement.py after calibration</span>'
        + f'</div>'
    )

    # ── Section 6: Element Decomposition ─────────────────────────────────────
    ed = d['element_decomposition']
    hi_rows = ''
    for g in ed['high_impact']:
        rgb = g.get('color_rgb8', [0, 0, 0])
        color_swatch = (f'<span style="display:inline-block;width:14px;height:14px;border-radius:2px;'
                        f'background:rgb({rgb[0]},{rgb[1]},{rgb[2]});border:1px solid #ccc;'
                        f'vertical-align:middle;margin-right:6px"></span>')
        cls_badge = badge(g['classification'], '#9a6700', '#fff3cd') if g['classification'] == 'review' else badge(g['classification'])
        hi_rows += info_row(
            f'{color_swatch}{g["group_id"]}',
            f'{g["n_paths"]:,} paths &nbsp; {cls_badge}',
        )
    s6 = (
        f'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:0 0 20px">'
        + _metric_card('Total groups', ed['total_groups'], 'detected', '#0969da')
        + _metric_card('Include in BOQ', ed['include_in_boq'], 'human-confirmed', '#1a7f37')
        + _metric_card('Marked ignore', ed['ignore'], 'auto-classified', '#656d76')
        + _metric_card('Requires review', ed['requires_review'], 'unclassified', '#cf222e')
        + f'</div>'
        + f'<div style="margin-bottom:10px"><strong>High-impact groups (unclassified):</strong></div>'
        + hi_rows
        + f'<div style="margin-top:14px">'
        + artifact_link('Element Groups Report', 'element_groups_report.html', '🔬')
        + f'</div>'
    )

    # ── Section 7: Sign / Code Intelligence ──────────────────────────────────
    sc = d['sign_code_intelligence']
    suffix_rows = ''
    for suffix, freq in sc['suffix_groups'].items():
        suffix_rows += info_row(f'Suffix "{suffix}"', f'{freq} occurrences — unresolved')
    s7 = (
        f'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:0 0 20px">'
        + _metric_card('Total occurrences', sc['total_occurrences'], 'sign locations', '#0969da')
        + _metric_card('Confirmed codes', sc['confirmed_codes'], 'real (0)', '#cf222e' if sc['confirmed_codes'] == 0 else '#1a7f37')
        + _metric_card('Ambiguous', sc['ambiguous'], 'suffix groups', '#9a6700')
        + f'</div>'
        + suffix_rows
        + info_row('Invalid partial codes', f'{sc["invalid_partial"]} (suffix "86" — not in range 101–999)')
        + info_row('Sign code status', '0 / 177 occurrences have a confirmed 3-digit code')
        + info_row('Next step', 'Resolve Q-33-1 in review form (suffix "33" → choose 133/433/633)')
        + f'<div style="margin-top:14px">'
        + artifact_link('Validation Report', 'validation_report.html', '✅')
        + artifact_link('Partial Code Report', 'partial_code_resolution_report.html', '🔢')
        + artifact_link('Review Queue', 'review_queue.html', '📋')
        + f'</div>'
    )

    # ── Section 8: Evidence / Audit ───────────────────────────────────────────
    links = [
        ('Master Dashboard', 'master_dashboard.html', '🏠'),
        ('Pipeline Report', 'pipeline_run_report.html', '⚙️'),
        ('Workspace', 'plan_scanner_workspace.html', '🗂'),
        ('BOQ Draft Report', 'boq_unified_report.html', '📊'),
        ('Review Queue', 'review_queue.html', '📋'),
        ('Validation Report', 'validation_report.html', '✅'),
        ('Partial Code Report', 'partial_code_resolution_report.html', '🔢'),
        ('Element Groups Report', 'element_groups_report.html', '🔬'),
        ('Answer Pack', 'teaching_loop_answer_pack.html', '📋'),
        ('Review Form', 'static_review_form.html', '📝'),
        ('Writeback Log', 'human_review_application_report.html', '✏️'),
        ('Demo Report', 'teaching_loop_demo_report.html', '🧪'),
    ]
    s8 = (
        f'<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">'
        + ''.join(artifact_link(label, fname, icon) for label, fname, icon in links)
        + f'</div>'
    )

    # ── Section 9: Next Actions ────────────────────────────────────────────────
    priority_colors = {'high': '#cf222e', 'medium': '#9a6700', 'low': '#656d76'}
    action_rows = ''
    for a in d['next_actions']:
        pcolor = priority_colors.get(a['priority'], '#656d76')
        pbadge = badge(a['priority'].upper(), pcolor, '#fff')
        action_rows += (
            f'<div style="border:1px solid #d0d7de;border-radius:8px;padding:14px 16px;margin-bottom:10px;background:#fff">'
            f'<div style="display:flex;gap:10px;align-items:flex-start">'
            f'<div>{pbadge}</div>'
            f'<div><div style="font-weight:600;margin-bottom:4px">{a["action"]}</div>'
            f'<div style="font-size:0.9em;color:#444">{a["detail"]}</div>'
            f'<div style="font-size:0.83em;color:#656d76;margin-top:4px">Blocks: {a["blocks"]}</div>'
            f'</div></div></div>'
        )
    s9 = (
        warn_box('Manual validation (scale, taxonomy, legend labels, BOQ approval) will happen later. '
                 'Production sidebar integration should wait for Phase 3 (Data Model design).')
        + action_rows
        + f'<div style="margin-top:20px;padding:16px;background:#f6f8fa;border-radius:8px;border:1px solid #d0d7de">'
        + f'<strong>After prototype shell — recommended engineering next step:</strong><br>'
        + f'<span style="font-size:0.92em">Data Model / Persistence Design (Phase 3) — '
        + f'design the DB schema for plans, sign occurrences, BOQ items, human answers, and audit trail. '
        + f'This is independent of pipeline accuracy and unblocks Phase 4 (Production Sidebar Integration).</span>'
        + f'</div>'
    )

    # ── Nav items ──────────────────────────────────────────────────────────────
    nav_items = [
        ('intake',       '1. Plan Intake'),
        ('overview',     '2. Scan Overview'),
        ('teaching',     '3. Review & Teaching'),
        ('boq',          '4. BOQ Draft'),
        ('measurement',  '5. Measurement'),
        ('decomposition','6. Element Decomp.'),
        ('signcode',     '7. Sign / Code'),
        ('evidence',     '8. Evidence / Audit'),
        ('nextactions',  '9. Next Actions'),
    ]
    nav_html = ''.join(
        f'<a href="#{anchor}" style="display:block;padding:8px 16px;color:#24292f;text-decoration:none;'
        f'font-size:0.9em;border-radius:6px;margin-bottom:2px;transition:background 0.1s" '
        f'onmouseover="this.style.background=\'#eaeef2\'" onmouseout="this.style.background=\'none\'">'
        f'{label}</a>'
        for anchor, label in nav_items
    )

    sections_html = (
        sec(1, 'Plan Intake', s1, 'intake',
            f'Source: sample_plan.pdf · Pipeline: {pi["stages_ok"]}/{pi["total_stages"]} OK')
        + sec(2, 'Scan Results Overview', s2, 'overview',
              f'{so["sign_occurrences"]} signs · {so["boq_total"]} BOQ items · {rf.get("CRITICAL",0)} critical flags')
        + sec(3, 'Review & Teaching', s3, 'teaching',
              f'{rt["answer_pack_questions"]} questions · {rt["real_answers_applied"]} applied · demo validated')
        + sec(4, 'BOQ Draft', s4, 'boq',
              f'{bd["total"]} items · {bd["approved"]} approved · {bd["requires_review"]} requires review')
        + sec(5, 'Measurement & Calibration', s5, 'measurement',
              f'{ms["total_linear_m"]:,} m assumed · scale {ms["scale_status"]}')
        + sec(6, 'Element Decomposition', s6, 'decomposition',
              f'{ed["total_groups"]} groups · {ed["requires_review"]} unclassified')
        + sec(7, 'Sign / Code Intelligence', s7, 'signcode',
              f'{sc["total_occurrences"]} occurrences · {sc["confirmed_codes"]} confirmed')
        + sec(8, 'Evidence & Audit Trail', s8, 'evidence',
              '12 pipeline artifacts')
        + sec(9, 'Next Actions', s9, 'nextactions',
              'Recommended local/free steps')
    )

    return f'''<!DOCTYPE html>
<html lang="he" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>סורק תוכניות — Plan Scanner Prototype</title>
<style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{font-family:-apple-system,Arial,sans-serif;background:#f6f8fa;color:#24292f;display:flex;flex-direction:column;min-height:100vh}}
  .topbar{{background:#24292f;color:#fff;padding:12px 24px;display:flex;align-items:center;gap:16px;position:sticky;top:0;z-index:100}}
  .topbar .title{{font-weight:700;font-size:1.05rem}}
  .topbar .sub{{font-size:0.82em;color:#8b949e}}
  .topbar .badges{{margin-left:auto;display:flex;gap:8px;align-items:center}}
  .research-badge{{background:#d29922;color:#000;padding:3px 10px;border-radius:12px;font-size:0.78em;font-weight:700}}
  .ok-badge{{background:#1a7f37;color:#fff;padding:3px 10px;border-radius:12px;font-size:0.78em;font-weight:700}}
  .layout{{display:flex;flex:1;min-height:0}}
  .sidebar{{width:210px;flex-shrink:0;background:#fff;border-right:1px solid #d0d7de;padding:20px 10px;position:sticky;top:48px;height:calc(100vh - 48px);overflow-y:auto}}
  .sidebar .logo{{font-weight:700;font-size:0.95rem;padding:0 10px 16px;border-bottom:1px solid #d0d7de;margin-bottom:12px;color:#0969da}}
  .main{{flex:1;padding:0 32px;max-width:900px;overflow-y:auto}}
  h2{{font-size:1.15rem;color:#24292f}}
  section{{scroll-margin-top:60px}}
  footer{{padding:20px 32px;font-size:0.82em;color:#656d76;border-top:1px solid #d0d7de;background:#fff}}
</style>
</head>
<body>
<div class="topbar">
  <div>
    <div class="title">סורק תוכניות — Plan Scanner</div>
    <div class="sub">Research Prototype · Stage S16 · {ts[:10]}</div>
  </div>
  <div class="badges">
    <span class="research-badge">⚠ Research Only</span>
    <span class="ok-badge">15/15 OK</span>
    <span class="research-badge">0 BOQ Approved</span>
  </div>
</div>
<div class="layout">
  <nav class="sidebar">
    <div class="logo">סורק תוכניות</div>
    {nav_html}
    <div style="margin-top:20px;padding:10px;background:#fff3cd;border-radius:6px;font-size:0.78em;color:#664d03;line-height:1.5">
      ⚠ Research prototype.<br>Not connected to production.
    </div>
  </nav>
  <main class="main">
    {sections_html}
  </main>
</div>
<footer>
  Generated: {ts} · Script: 29_plan_scanner_prototype_shell.py ·
  Research-only · approved_for_boq: false on all items · No production UI/DB/flows modified
</footer>
</body>
</html>'''


def _metric_card(label: str, value: Any, sub: str, color: str = '#0969da') -> str:
    return (f'<div style="background:#fff;border:1px solid #d0d7de;border-radius:8px;padding:16px;text-align:center">'
            f'<div style="font-size:1.9rem;font-weight:700;color:{color}">{value}</div>'
            f'<div style="font-weight:600;font-size:0.88em;margin-top:2px">{label}</div>'
            f'<div style="font-size:0.78em;color:#656d76">{sub}</div></div>')


def _flag_card(severity: str, count: int) -> str:
    colors = {'CRITICAL': ('#cf222e', '#ffebe9'), 'WARNING': ('#9a6700', '#fff3cd'), 'INFO': ('#0969da', '#ddf4ff')}
    tc, bg = colors.get(severity, ('#656d76', '#f6f8fa'))
    return (f'<div style="background:{bg};border-radius:8px;padding:12px 16px">'
            f'<div style="font-size:1.6rem;font-weight:700;color:{tc}">{count}</div>'
            f'<div style="font-size:0.82em;color:{tc};font-weight:600">{severity}</div></div>')


def sec(num: int, title: str, body: str, anchor: str, subtitle: str = '') -> str:
    sub = f'<div style="color:#656d76;font-size:0.88em;margin-top:2px">{subtitle}</div>' if subtitle else ''
    return (f'<section id="{anchor}" style="padding:32px 0;border-bottom:1px solid #e8ecef">'
            f'<div style="display:flex;align-items:baseline;gap:14px;margin-bottom:18px">'
            f'<span style="background:#0969da;color:#fff;border-radius:50%;width:28px;height:28px;'
            f'display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85em;flex-shrink:0">{num}</span>'
            f'<div><h2 style="margin:0;font-size:1.18rem">{title}</h2>{sub}</div></div>'
            f'{body}</section>')


# ── Markdown report ─────────────────────────────────────────────────────────────

def build_md(d: Dict, ts: str) -> str:
    pi = d['plan_intake']
    so = d['scan_overview']
    bd = d['boq_draft']
    ms = d['measurement']
    ed = d['element_decomposition']
    sc = d['sign_code_intelligence']
    rt = d['review_teaching']
    rf = so['red_flags']

    lines = [
        '# Plan Scanner Prototype Shell Report',
        '',
        f'**Generated:** {ts}  ',
        f'**Script:** `29_plan_scanner_prototype_shell.py`  ',
        '**Type:** Research Prototype — RESEARCH ONLY  ',
        '**Production modified:** No  ',
        '',
        '---',
        '',
        '## Prototype Sections',
        '',
        f'| # | Section | Key data |',
        f'|---|---|---|',
        f'| 1 | Plan Intake | Pipeline {pi["stages_ok"]}/{pi["total_stages"]} OK · {pi["boq_approved"]}/{pi["boq_total"]} BOQ approved |',
        f'| 2 | Scan Overview | {so["sign_occurrences"]} signs · {so["boq_total"]} BOQ · {rf.get("CRITICAL",0)} CRITICAL flags |',
        f'| 3 | Review & Teaching | {rt["answer_pack_questions"]} questions · {rt["real_answers_applied"]} real applied |',
        f'| 4 | BOQ Draft | {bd["total"]} items · {bd["approved"]} approved · {bd["requires_review"]} review |',
        f'| 5 | Measurement | {ms["total_linear_m"]:,} m · scale {ms["scale_status"]} |',
        f'| 6 | Element Decomposition | {ed["total_groups"]} groups · {ed["requires_review"]} unclassified |',
        f'| 7 | Sign / Code | {sc["total_occurrences"]} occurrences · {sc["confirmed_codes"]} confirmed |',
        f'| 8 | Evidence / Audit | 12 pipeline artifact links |',
        f'| 9 | Next Actions | 6 recommended steps |',
        '',
        '---',
        '',
        '## Outputs',
        '',
        '- `outputs/plan_scanner_prototype.html` — single-file interactive prototype',
        '- `outputs/plan_scanner_prototype.json` — data contract for future production module',
        '- `outputs/plan_scanner_prototype_report.md` — this file',
        '',
        '---',
        '',
        '## How It Supports Future סורק תוכניות',
        '',
        'This prototype organises the existing 15-stage research pipeline into a 9-section',
        'user workflow that mirrors the future production sidebar module. It demonstrates:',
        '',
        '- How a Plan Intake page would look (PDF source, pipeline status, approval gate)',
        '- How a Scan Overview would surface key metrics and red flags at a glance',
        '- How the Review & Teaching loop connects the answer pack, review form, and writeback',
        '- How the BOQ Draft section would gate all items behind `approved_for_boq: false`',
        '- How Measurement and Calibration would surface scale uncertainty',
        '- How Element Decomposition would show group classification status',
        '- How Sign/Code Intelligence would surface unresolved codes',
        '- How Evidence/Audit would link all downstream artifacts',
        '- What the Next Actions queue looks like for the engineering/review cycle',
        '',
        'The `plan_scanner_prototype.json` output serves as a **data contract** — it shows',
        'what fields a production module would need from the DB for each section.',
        '',
        '---',
        '',
        '## What is NOT Done',
        '',
        '- No production sidebar integration',
        '- No DB schema (comes in Phase 3 — Data Model / Persistence Design)',
        '- No real server',
        '- No automatic BOQ approval',
        '- No paid API',
        '',
        '---',
        '',
        '## Recommended Next Step',
        '',
        '**Data Model / Persistence Design (Phase 3)**',
        '',
        'Design the DB schema for plans, sign occurrences, BOQ items, human answers,',
        'and audit trail. This is independent of pipeline accuracy and unblocks',
        'Phase 4 (Production Sidebar Integration).',
        '',
        'Alternative: Production Readiness Audit — run the pipeline on 2–3 additional',
        'plan PDFs to validate generalization before committing to the schema.',
        '',
        '*RESEARCH ONLY. All quantities provisional. Nothing approved for BOQ.*',
    ]
    return '\n'.join(lines)


# ── Main ────────────────────────────────────────────────────────────────────────

def main() -> None:
    t0  = time.time()
    ts  = datetime.now().isoformat()

    print('=' * 60)
    print('  Stage S16 — Plan Scanner Prototype Shell')
    print('  Generating local research prototype...')
    print('=' * 60)
    print()

    print('Collecting pipeline data...')
    data = collect_data()
    pi   = data['plan_intake']
    bd   = data['boq_draft']
    so   = data['scan_overview']
    print(f'  Pipeline: {pi["stages_ok"]}/{pi["total_stages"]} stages OK')
    print(f'  BOQ: {bd["total"]} items, {bd["approved"]} approved')
    print(f'  Signs: {so["sign_occurrences"]} occurrences, {so["sign_codes_confirmed"]} confirmed')
    print(f'  Red flags: CRITICAL={so["red_flags"].get("CRITICAL",0)}, WARNING={so["red_flags"].get("WARNING",0)}')

    print()
    print('Writing JSON data contract...')
    OUT_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(f'  {OUT_JSON.name}')

    print('Writing HTML prototype...')
    OUT_HTML.write_text(build_html(data, ts), encoding='utf-8')
    size_kb = round(OUT_HTML.stat().st_size / 1024)
    print(f'  {OUT_HTML.name}  ({size_kb} KB)')

    print('Writing Markdown report...')
    OUT_MD.write_text(build_md(data, ts), encoding='utf-8')
    print(f'  {OUT_MD.name}')

    elapsed = time.time() - t0
    print()
    print('=' * 60)
    print('  Prototype Shell Complete')
    print('=' * 60)
    print(f'  Sections           : 9')
    print(f'  Artifacts linked   : 12')
    print(f'  BOQ approved       : {bd["approved"]} (must remain 0)')
    print(f'  Production modified: No')
    print(f'  Elapsed            : {elapsed:.2f}s')
    print()
    print('  open outputs/plan_scanner_prototype.html')
    print()
    print('  REMINDER: Research-only. approved_for_boq: false on all items.')
    print('=' * 60)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Plan Scanner Prototype Shell (Stage S16)')
    parser.add_argument(
        '--plan-run-dir', default=None,
        help='Path to a plan-scoped run directory (created by 31_upload_intake_wrapper.py). '
             'If omitted, runs in legacy mode against outputs/',
    )
    _args = parser.parse_args()
    _ctx  = PlanRunContext.from_args(_args, script_dir=SCRIPT_DIR)
    if _ctx.is_plan_scoped:
        OUT_DIR  = _ctx.outputs_dir                                 # type: ignore[assignment]
        OUT_HTML = OUT_DIR / 'plan_scanner_prototype.html'
        OUT_JSON = OUT_DIR / 'plan_scanner_prototype.json'
        OUT_MD   = OUT_DIR / 'plan_scanner_prototype_report.md'
        _optional = [
            OUT_DIR / 'pipeline_run_summary.json',
            OUT_DIR / 'boq_unified_draft.json',
            OUT_DIR / 'review_queue.json',
            OUT_DIR / 'master_dashboard.json',
        ]
        _missing_o = [p for p in _optional if not p.exists()]
        if _missing_o:
            print('[INFO] Plan-scoped mode: some inputs absent (prototype will show partial data):')
            for _p in _missing_o:
                print(f'  MISSING (optional): {_p}')
        _ctx.ensure_dirs()
        print(_ctx.describe())
    main()
