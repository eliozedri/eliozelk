"""
Stage S13 — Plan Scanner Workspace
Local/research home page for the סורק תוכניות module.

Consolidates navigation, status, and next actions into one entry point.
No new business logic. No production changes. No paid API.

Outputs:
  outputs/plan_scanner_workspace.html
  outputs/plan_scanner_workspace.json
  outputs/plan_scanner_workspace_report.md
"""

from __future__ import annotations

import json
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

SCRIPT_DIR = Path(__file__).parent
OUT_DIR    = SCRIPT_DIR / 'outputs'

OUT_HTML = OUT_DIR / 'plan_scanner_workspace.html'
OUT_JSON = OUT_DIR / 'plan_scanner_workspace.json'
OUT_MD   = OUT_DIR / 'plan_scanner_workspace_report.md'

# ── Artifact registry ──────────────────────────────────────────────────────────

ARTIFACTS = [
    {
        'id': 'dashboard',
        'title': 'Master Dashboard',
        'subtitle': 'S11 — all-stages control center',
        'file': 'master_dashboard.html',
        'icon': '📊',
        'color': '#1e3a5f',
        'section': 'nav',
    },
    {
        'id': 'answer_pack',
        'title': 'Answer Pack',
        'subtitle': 'S12 — 40 structured human questions',
        'file': 'teaching_loop_answer_pack.html',
        'icon': '📋',
        'color': '#b71c1c',
        'section': 'nav',
    },
    {
        'id': 'review_queue',
        'title': 'Review Queue',
        'subtitle': '177 sign occurrences — HIGH/MEDIUM/LOW',
        'file': 'review_queue.html',
        'icon': '🔍',
        'color': '#e65100',
        'section': 'nav',
    },
    {
        'id': 'boq',
        'title': 'BOQ Draft',
        'subtitle': '47 items — 0 approved',
        'file': 'boq_unified_report.html',
        'icon': '📐',
        'color': '#1565c0',
        'section': 'nav',
    },
    {
        'id': 'elements',
        'title': 'Element Groups',
        'subtitle': '31 color groups — 18 require classification',
        'file': 'element_groups_report.html',
        'icon': '🎨',
        'color': '#2e7d32',
        'section': 'nav',
    },
    {
        'id': 'measurement',
        'title': 'Measurement',
        'subtitle': 'Scale 1:500 (unverified) — 9,408 m',
        'file': 'scale_measurement/report.html',
        'icon': '📏',
        'color': '#4527a0',
        'section': 'nav',
    },
    {
        'id': 'partial_codes',
        'title': 'Partial Codes',
        'subtitle': '"33" ambiguous × 6, "86" invalid × 1',
        'file': 'partial_code_resolution_report.html',
        'icon': '🔢',
        'color': '#00695c',
        'section': 'nav',
    },
    {
        'id': 'validation',
        'title': 'Validation',
        'subtitle': '6 partial-match · 8 no-code · 1 suspicious',
        'file': 'validation_report.html',
        'icon': '✅',
        'color': '#558b2f',
        'section': 'nav',
    },
    {
        'id': 'pipeline',
        'title': 'Pipeline Report',
        'subtitle': '17/17 stages OK',
        'file': 'pipeline_run_report.html',
        'icon': '⚙️',
        'color': '#37474f',
        'section': 'nav',
    },
    {
        'id': 'human_review',
        'title': 'Human Review Log',
        'subtitle': 'S10 — 0 answers applied',
        'file': 'human_review_application_report.html',
        'icon': '✏️',
        'color': '#6a1b9a',
        'section': 'nav',
    },
    {
        'id': 'review_form',
        'title': 'Review Form',
        'subtitle': 'S14 — fill & download answers',
        'file': 'static_review_form.html',
        'icon': '📝',
        'color': '#0277bd',
        'section': 'nav',
    },
    {
        'id': 'demo',
        'title': 'Teaching Loop Demo',
        'subtitle': 'S15 — end-to-end demo (seeded answers)',
        'file': 'teaching_loop_demo_report.html',
        'icon': '🧪',
        'color': '#00695c',
        'section': 'nav',
    },
    {
        'id': 'prototype',
        'title': 'Prototype Shell',
        'subtitle': 'S16 — future סורק תוכניות preview',
        'file': 'plan_scanner_prototype.html',
        'icon': '🖥',
        'color': '#1565c0',
        'section': 'nav',
    },
    {
        'id': 'local_state',
        'title': 'Local State',
        'subtitle': 'S17 — JSON persistence flow (14 entity families)',
        'file': 'local_state/local_persistence_report.html',
        'icon': '🗄',
        'color': '#4527a0',
        'section': 'nav',
    },
]

BLOCKERS = [
    {
        'id': 'SCALE',
        'severity': 'CRITICAL',
        'title': 'Scale calibration pending',
        'detail': (
            'Assumed 1:500 — NOT detected in PDF. '
            'All 9,408 m of linear measurements are provisional. '
            'Answer Q-SCALE-001 in the Answer Pack.'
        ),
        'answer_question': 'Q-SCALE-001',
        'affects': ['BOQ-LIN-001..010', 'scale_measurement/results.json'],
    },
    {
        'id': 'G001',
        'severity': 'CRITICAL',
        'title': 'G-001 element classification pending',
        'detail': (
            'Black color group (rgb 0,0,0) — 122,781 paths unclassified. '
            'Largest unknown group. Without classification, BOQ-EG-001 '
            '(105,913 paths) cannot be included. Answer Q-EG-G-001.'
        ),
        'answer_question': 'Q-EG-G-001',
        'affects': ['element_groups.json', 'BOQ-EG-001'],
    },
    {
        'id': 'PCR33',
        'severity': 'CRITICAL',
        'title': 'Partial code "33" unresolved — 6 occurrences',
        'detail': (
            '6 sign occurrences have code "33" (2-digit — below catalog minimum). '
            'Valid expansions: 133, 433, 633, 933. '
            'Cannot BOQ until leading digit is confirmed. Answer Q-PCR-33.'
        ),
        'answer_question': 'Q-PCR-33',
        'affects': ['partial_code_resolution.json', 'review_queue.json'],
    },
    {
        'id': 'LEGEND',
        'severity': 'HIGH',
        'title': 'Legend labels missing — 13 rows',
        'detail': (
            'All 13 legend rows extracted geometrically but Hebrew labels are null. '
            'OCR could not read them. Element types for each legend color are inferred only. '
            'Answer Q-LGD-000 through Q-LGD-012.'
        ),
        'answer_question': 'Q-LGD-000',
        'affects': ['legend_rows.json', 'legend_vocabulary.json', 'color_taxonomy'],
    },
    {
        'id': 'TAXONOMY',
        'severity': 'HIGH',
        'title': 'Color taxonomy unconfirmed',
        'detail': (
            'Red element (rgb 255,0,0) — 16,034 paths, 1,948 m — classified as '
            '"red_element" placeholder. Actual type (guardrail? barrier?) unknown. '
            'Answer Q-CTX-RED.'
        ),
        'answer_question': 'Q-CTX-RED',
        'affects': ['element_groups.json', 'BOQ-LIN-002', 'scale_measurement'],
    },
    {
        'id': 'BOQ',
        'severity': 'HIGH',
        'title': 'BOQ approval pending — 0 of 47 items approved',
        'detail': (
            'approved_for_boq: false on all 47 BOQ items by design. '
            '45 items have requires_review: true. '
            'No quantities are approved for construction, procurement, billing, or field use. '
            'Awaiting scale + taxonomy + sign code confirmation.'
        ),
        'answer_question': None,
        'affects': ['boq_unified_draft.json'],
    },
]

FLOW_STEPS = [
    ('PDF', 'S1', '50-448-02-400.pdf', '#37474f'),
    ('Legend', 'S2', 'מקרא מפה — 13 rows', '#1565c0'),
    ('Sign Detection', 'S3', '177 gray clusters', '#2e7d32'),
    ('Code Reading', 'S4', 'Vector glyphs → 177 OCCs', '#e65100'),
    ('Review Queue', 'S4b', 'HIGH/MEDIUM/LOW tiers', '#b71c1c'),
    ('Measurement', 'S5', '9,408 m @ 1:500 (unverified)', '#4527a0'),
    ('Element Decomp.', 'S6', '31 color groups', '#00695c'),
    ('BOQ Draft', 'S7', '47 items — 0 approved', '#1565c0'),
    ('Validation', 'S8', '15 flagged / 177 total', '#558b2f'),
    ('Partial Code Res.', 'S9', '"33"→ambiguous · "86"→invalid', '#00695c'),
    ('Human Writeback', 'S10', 'awaiting answers', '#6a1b9a'),
    ('Dashboard', 'S11', 'control center', '#1e3a5f'),
    ('Answer Pack', 'S12', '40 questions ready', '#b71c1c'),
    ('Workspace', 'S13', 'this page', '#37474f'),
]

NEXT_BUILD_CANDIDATES = [
    {
        'option': 'A',
        'title': 'Simple local file-based answer ingestion flow',
        'detail': (
            'A CLI helper that validates human_review_answers.json structure before '
            'running writeback — catches malformed answers, missing required fields, '
            'and scope mismatches before they reach the pipeline.'
        ),
        'effort': 'low',
        'value': 'high',
        'recommended': False,
    },
    {
        'option': 'B',
        'title': 'Minimal static guided review form generator',
        'detail': (
            'Generate a local HTML form pre-populated from the Answer Pack template '
            'so humans can fill answers in a browser and download the resulting JSON '
            '— no server, no DB, pure static HTML + JavaScript.'
        ),
        'effort': 'medium',
        'value': 'very high',
        'recommended': True,
    },
    {
        'option': 'C',
        'title': 'Manual calibration data-entry template refinement',
        'detail': (
            'Improve the scale calibration flow: generate a helper HTML page that '
            'explains the calibration steps for this specific PDF, '
            'with pre-filled PDF coordinate extraction instructions.'
        ),
        'effort': 'low',
        'value': 'medium',
        'recommended': False,
    },
    {
        'option': 'D',
        'title': 'Color taxonomy answer support layer',
        'detail': (
            'Build a local color swatch inspector: for each unclassified group, '
            'render a sample image + RGB chip + candidate legend row matches, '
            'making the element_group_classification questions self-contained.'
        ),
        'effort': 'medium',
        'value': 'high',
        'recommended': False,
    },
    {
        'option': 'E',
        'title': 'Lightweight local UI shell (not production)',
        'detail': (
            'A simple localhost Flask/http.server page that serves all research '
            'artifacts with inline answer capture — still local, no cloud, '
            'no DB, just a research convenience layer.'
        ),
        'effort': 'high',
        'value': 'high',
        'recommended': False,
    },
]

AUDIT_RULES = [
    'approved_for_boq: false on all 47 BOQ items — hardcoded, cannot be changed by pipeline alone',
    'requires_review: true on 45 BOQ items — all quantities provisional',
    'Scale 1:500 is a fallback assumption — NOT detected from PDF — all linear measurements are unverified',
    'Color taxonomy not confirmed against plan legend — element types are heuristic only',
    'Sign codes (177 occurrences) — 0 human-confirmed for BOQ use',
    'Legend labels (13 rows) — all null, OCR could not extract Hebrew text',
    'No paid API was used at any stage — all processing is local and free',
    'No production UI, DB schema, or production flows were modified',
    'Human approval required before any quantity is used for construction, procurement, billing, or field use',
    'approved_for_boq can only be set true after: scale confirmed + code confirmed + human sign-off',
]

# ── Data loading ───────────────────────────────────────────────────────────────

def load_json(path: Path) -> Optional[Any]:
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


def get_git_info() -> Dict[str, str]:
    try:
        commit = subprocess.run(
            ['git', 'log', '--oneline', '-1'],
            capture_output=True, text=True, cwd=SCRIPT_DIR
        ).stdout.strip()
        branch = subprocess.run(
            ['git', 'branch', '--show-current'],
            capture_output=True, text=True, cwd=SCRIPT_DIR
        ).stdout.strip()
        return {'commit': commit, 'branch': branch}
    except Exception:
        return {'commit': 'unknown', 'branch': 'unknown'}


def file_size_kb(path: Path) -> str:
    if path.exists():
        sz = path.stat().st_size / 1024
        return f'{sz:.1f} KB'
    return 'missing'


def artifact_exists(a: Dict) -> bool:
    return (OUT_DIR / a['file']).exists()


# ── JSON summary ───────────────────────────────────────────────────────────────

def build_summary() -> Dict:
    now = datetime.now().isoformat()
    git = get_git_info()

    # Load key sources
    pipeline = load_json(OUT_DIR / 'pipeline_run_summary.json') or {}
    boq_data = load_json(OUT_DIR / 'boq_unified_draft.json') or {}
    tlp_data = load_json(OUT_DIR / 'teaching_loop_answer_pack.json') or {}
    scale_data = load_json(OUT_DIR / 'scale_measurement' / 'results.json') or {}

    ps  = pipeline.get('pipeline_status', {})
    boq_totals = boq_data.get('totals', {})
    tlp_meta   = tlp_data.get('meta', {})
    scale_info = scale_data.get('scale_info', {})

    return {
        'meta': {
            'generated_at': now,
            'source_script': '26_plan_scanner_workspace.py',
            'approved_for_boq': False,
            'paid_api_used': False,
            'production_modified': False,
        },
        'git': git,
        'pipeline': {
            'stages_ok': ps.get('stages_ok', 12),
            'total_stages': 12,
            'overall': ps.get('overall', 'ok'),
        },
        'boq': {
            'total_items': boq_totals.get('total_boq_items', 47),
            'approved_for_boq': boq_totals.get('approved_for_boq_count', 0),
            'requires_review': 45,
            'total_linear_m': boq_totals.get('total_linear_m', 9407.7),
            'total_sign_plates': boq_totals.get('total_sign_plates', 177),
            'total_pole_locations': boq_totals.get('total_pole_locations', 119),
        },
        'scale': {
            'ratio': scale_info.get('ratio', 500),
            'status': scale_info.get('status', 'unverified'),
            'source': scale_info.get('source', 'fallback_assumption'),
        },
        'answer_pack': {
            'total_questions': tlp_meta.get('total_questions', 40),
            'by_priority': tlp_meta.get('by_priority', {}),
        },
        'blockers': [
            {k: v for k, v in b.items() if k != 'affects'}
            for b in BLOCKERS
        ],
        'artifacts': [
            {
                'id': a['id'],
                'title': a['title'],
                'file': a['file'],
                'exists': artifact_exists(a),
                'size': file_size_kb(OUT_DIR / a['file']),
            }
            for a in ARTIFACTS
        ],
        'next_build_candidates': NEXT_BUILD_CANDIDATES,
    }


# ── Markdown report ────────────────────────────────────────────────────────────

def build_markdown(summary: Dict) -> str:
    now = summary['meta']['generated_at']
    git = summary['git']
    ps  = summary['pipeline']
    boq = summary['boq']
    sc  = summary['scale']
    tlp = summary['answer_pack']

    lines = [
        '# Plan Scanner Workspace Report',
        f'Generated: {now}',
        f'Commit: {git["commit"]}',
        f'Branch: {git["branch"]}',
        '',
        '> RESEARCH-ONLY — NOT APPROVED BOQ DATA',
        '> No paid API used. No production UI/DB/flows modified.',
        '',
        '## Pipeline Status',
        f'- Stages OK: {ps["stages_ok"]}/{ps["total_stages"]}',
        f'- Overall: {ps["overall"].upper()}',
        '',
        '## BOQ Summary',
        f'- Total items: {boq["total_items"]}',
        f'- Approved for BOQ: {boq["approved_for_boq"]} (always 0 — awaiting validation)',
        f'- Requires review: {boq["requires_review"]}',
        f'- Total linear (provisional): {boq["total_linear_m"]:,.1f} m',
        f'- Sign plates: {boq["total_sign_plates"]}',
        f'- Pole locations: {boq["total_pole_locations"]}',
        f'- Scale: 1:{sc["ratio"]} ({sc["status"]})',
        '',
        '## Answer Pack',
        f'- Total questions: {tlp["total_questions"]}',
    ]
    for p, c in sorted(tlp['by_priority'].items(), key=lambda x: ['critical','high','medium','low'].index(x[0]) if x[0] in ['critical','high','medium','low'] else 99):
        lines.append(f'  - {p.upper()}: {c}')

    lines += ['', '## Critical Blockers']
    for b in BLOCKERS:
        lines.append(f'- [{b["severity"]}] **{b["title"]}**')
        lines.append(f'  {b["detail"]}')

    lines += ['', '## Artifacts']
    for a in summary['artifacts']:
        status = '✅' if a['exists'] else '❌'
        lines.append(f'- {status} [{a["title"]}]({a["file"]}) — {a["size"]}')

    lines += ['', '## Recommended Next Build Step']
    rec = next((c for c in NEXT_BUILD_CANDIDATES if c['recommended']), NEXT_BUILD_CANDIDATES[0])
    lines += [
        f'**Option {rec["option"]}: {rec["title"]}**',
        rec['detail'],
        '',
        'All options:',
    ]
    for c in NEXT_BUILD_CANDIDATES:
        mark = ' ← recommended' if c['recommended'] else ''
        lines.append(f'- Option {c["option"]}: {c["title"]} (effort={c["effort"]}, value={c["value"]}){mark}')

    lines += ['', '## Audit Rules']
    for r in AUDIT_RULES:
        lines.append(f'- {r}')

    return '\n'.join(lines)


# ── HTML ───────────────────────────────────────────────────────────────────────

def build_html(summary: Dict) -> str:
    now = summary['meta']['generated_at']
    git = summary['git']
    ps  = summary['pipeline']
    boq = summary['boq']
    sc  = summary['scale']
    tlp = summary['answer_pack']

    # ── Section 1: Overview ──────────────────────────────────────────────────
    stage_bar_pct = round(ps['stages_ok'] / ps['total_stages'] * 100)
    priority_colors = {'critical': '#b71c1c', 'high': '#e65100', 'medium': '#f57c00', 'low': '#388e3c'}
    q_chips = ''.join(
        f'<span class="q-chip" style="background:{priority_colors.get(p,"#999")}">'
        f'{p[0].upper()}: {c}</span> '
        for p, c in sorted(
            tlp['by_priority'].items(),
            key=lambda x: ['critical','high','medium','low'].index(x[0]) if x[0] in ['critical','high','medium','low'] else 9
        )
    )

    overview_html = f'''
<div class="card overview-card">
  <div class="overview-grid">
    <div class="ov-block">
      <div class="ov-label">Source PDF</div>
      <div class="ov-val mono">50-448-02-400.pdf</div>
    </div>
    <div class="ov-block">
      <div class="ov-label">Pipeline</div>
      <div class="ov-val" style="color:#15803d">{ps["stages_ok"]}/{ps["total_stages"]} stages OK</div>
      <div class="stage-bar"><div class="stage-fill" style="width:{stage_bar_pct}%"></div></div>
    </div>
    <div class="ov-block">
      <div class="ov-label">Scale</div>
      <div class="ov-val warn-text">1:{sc["ratio"]} — {sc["status"].upper()}</div>
    </div>
    <div class="ov-block">
      <div class="ov-label">Commit</div>
      <div class="ov-val mono" style="font-size:12px">{git["commit"][:50]}</div>
    </div>
    <div class="ov-block">
      <div class="ov-label">Pending Qs</div>
      <div class="ov-val">{q_chips}</div>
    </div>
    <div class="ov-block">
      <div class="ov-label">Generated</div>
      <div class="ov-val mono" style="font-size:11px">{now}</div>
    </div>
  </div>
  <div class="disclaimer-banner">
    ⚠ RESEARCH-ONLY — NOT APPROVED BOQ DATA &nbsp;|&nbsp;
    approved_for_boq: false on all {boq["total_items"]} items &nbsp;|&nbsp;
    Scale UNVERIFIED · No paid API · No production modifications
  </div>
</div>'''

    # ── Section 2: Quick Navigation ──────────────────────────────────────────
    nav_cards = ''
    for a in ARTIFACTS:
        exists = artifact_exists(a)
        opacity = '1' if exists else '0.45'
        disabled = '' if exists else ' (missing)'
        onclick = '' if exists else ' onclick="return false"'
        nav_cards += f'''
<a href="{a["file"]}" class="nav-card" style="border-top:4px solid {a["color"]};opacity:{opacity}"{onclick}>
  <div class="nc-icon">{a["icon"]}</div>
  <div class="nc-title">{a["title"]}</div>
  <div class="nc-sub">{a["subtitle"]}{disabled}</div>
</a>'''

    # ── Section 3: Blockers ──────────────────────────────────────────────────
    blocker_rows = ''
    sev_colors = {'CRITICAL': '#b71c1c', 'HIGH': '#e65100', 'MEDIUM': '#f57c00'}
    sev_bg     = {'CRITICAL': '#fef2f2', 'HIGH': '#fff7ed', 'MEDIUM': '#fffbeb'}
    for b in BLOCKERS:
        clr = sev_colors.get(b['severity'], '#555')
        bg  = sev_bg.get(b['severity'], '#f9f9f9')
        aq_link = (
            f'<a href="teaching_loop_answer_pack.html#{b["answer_question"]}" '
            f'class="qa-link">→ {b["answer_question"]}</a>'
        ) if b.get('answer_question') else ''
        blocker_rows += f'''
<div class="blocker-row" style="background:{bg};border-left:5px solid {clr}">
  <div class="blocker-head">
    <span class="sev-badge" style="background:{clr}">{b["severity"]}</span>
    <span class="blocker-title">{b["title"]}</span>
    {aq_link}
  </div>
  <div class="blocker-detail">{b["detail"]}</div>
</div>'''

    # ── Section 4: Flow Map ──────────────────────────────────────────────────
    flow_steps_html = ''
    for i, (name, sid, detail, color) in enumerate(FLOW_STEPS):
        arrow = '<div class="flow-arrow">→</div>' if i < len(FLOW_STEPS) - 1 else ''
        is_current = (sid == 'S13')
        border = '3px solid #b71c1c' if is_current else f'2px solid {color}'
        bg = '#fff9f9' if is_current else '#fff'
        flow_steps_html += f'''
<div class="flow-step" style="border:{border};background:{bg}">
  <div class="fs-id" style="color:{color}">{sid}</div>
  <div class="fs-name">{name}</div>
  <div class="fs-detail">{detail}</div>
</div>{arrow}'''

    # ── Section 5: Human Input Workflow ─────────────────────────────────────
    workflow_steps = [
        ('1', 'Open Answer Pack', 'teaching_loop_answer_pack.html',
         'Review 40 structured questions. Start with CRITICAL, then HIGH.'),
        ('2', 'Copy template', None,
         'cp outputs/human_review_answers.template.json outputs/human_review_answers.json'),
        ('3', 'Fill in answers', None,
         'Edit human_review_answers.json. Remove _comment lines. Fill FILL_IN fields.'),
        ('4', 'Run writeback', None,
         '.venv/bin/python3 23_human_review_writeback.py'),
        ('5', 'Re-run pipeline', None,
         '.venv/bin/python3 19_run_plan_scanner_pipeline.py'),
        ('6', 'Review updated dashboard', 'master_dashboard.html',
         'Check if blockers are resolved. Repeat until all CRITICAL Qs answered.'),
    ]
    wf_html = ''
    for step, title, link, detail in workflow_steps:
        link_tag = f'<a href="{link}" class="wf-link">{link}</a>' if link else f'<code>{detail}</code>'
        desc = link_tag if link else f'<code>{detail}</code>'
        wf_html += f'''
<div class="wf-step">
  <div class="wf-num">{step}</div>
  <div class="wf-body">
    <div class="wf-title">{title}</div>
    <div class="wf-detail">{desc}</div>
  </div>
</div>'''

    # ── Section 6: BOQ Status ────────────────────────────────────────────────
    def metric(label: str, value: str, color: str = '#1e3a5f', note: str = '') -> str:
        note_html = f'<div class="m-note">{note}</div>' if note else ''
        return (
            f'<div class="metric-box" style="border-top:3px solid {color}">'
            f'<div class="m-val" style="color:{color}">{value}</div>'
            f'<div class="m-label">{label}</div>{note_html}</div>'
        )

    boq_metrics = (
        metric('BOQ items', str(boq['total_items']), '#1e3a5f') +
        metric('Approved', '0', '#b71c1c', 'always 0 until BOQ gate') +
        metric('Requires review', str(boq['requires_review']), '#e65100') +
        metric('Sign plates', str(boq['total_sign_plates']), '#1565c0') +
        metric('Pole locations', str(boq['total_pole_locations']), '#1565c0') +
        metric('Linear (prov.)', f'{boq["total_linear_m"]:,.0f} m', '#4527a0', f'1:{sc["ratio"]} unverified')
    )

    # ── Section 7: Audit Rules ───────────────────────────────────────────────
    audit_html = ''.join(f'<li>{r}</li>' for r in AUDIT_RULES)

    # ── Section 8: Next Build Step ───────────────────────────────────────────
    next_html = ''
    for c in NEXT_BUILD_CANDIDATES:
        rec_badge = '<span class="rec-badge">★ Recommended</span>' if c['recommended'] else ''
        effort_color = {'low': '#2e7d32', 'medium': '#e65100', 'high': '#b71c1c'}.get(c['effort'], '#555')
        value_color  = {'very high': '#1565c0', 'high': '#1565c0', 'medium': '#555'}.get(c['value'], '#555')
        next_html += f'''
<div class="next-card {'next-rec' if c['recommended'] else ''}">
  <div class="next-head">
    <span class="next-opt">Option {c["option"]}</span>
    <span class="next-title">{c["title"]}</span>
    {rec_badge}
  </div>
  <div class="next-detail">{c["detail"]}</div>
  <div class="next-meta">
    Effort: <span style="color:{effort_color};font-weight:600">{c["effort"]}</span> &nbsp;|&nbsp;
    Value: <span style="color:{value_color};font-weight:600">{c["value"]}</span>
  </div>
</div>'''

    css = '''
:root { --ink: #111; --bg: #f0f4f8; --card: #fff; --border: #e2e8f0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--ink); }

/* Top bar */
.topbar { background: #1e3a5f; color: #fff; padding: 0 32px; display: flex; align-items: center; gap: 0; position: sticky; top: 0; z-index: 200; height: 52px; }
.topbar-title { font-size: 1rem; font-weight: 700; flex: 1; }
.topbar-nav a { color: #93c5fd; text-decoration: none; font-size: 0.82rem; padding: 0 12px; border-right: 1px solid rgba(255,255,255,0.15); }
.topbar-nav a:hover { color: #fff; }

.page { max-width: 1200px; margin: 0 auto; padding: 28px 20px 60px; }
.section { margin-bottom: 36px; }
.section-title { font-size: 1rem; font-weight: 700; color: #1e3a5f; border-bottom: 2px solid #bfdbfe; padding-bottom: 8px; margin-bottom: 16px; }

/* Cards */
.card { background: var(--card); border-radius: 10px; padding: 20px 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.09); }

/* Overview */
.overview-card { margin-bottom: 28px; }
.overview-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 14px; }
.ov-block { }
.ov-label { font-size: 0.75rem; color: #6b7280; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
.ov-val { font-size: 0.95rem; font-weight: 600; }
.mono { font-family: 'Consolas', monospace; font-size: 0.82rem; }
.warn-text { color: #b45309; }
.stage-bar { height: 6px; background: #e2e8f0; border-radius: 3px; margin-top: 6px; }
.stage-fill { height: 6px; background: #15803d; border-radius: 3px; }
.q-chip { display: inline-block; color: #fff; padding: 2px 8px; border-radius: 10px; font-size: 0.78rem; font-weight: 700; margin-right: 4px; }
.disclaimer-banner { background: #fef2f2; border: 1.5px solid #fca5a5; border-radius: 6px; padding: 8px 14px; font-size: 0.82rem; font-weight: 600; color: #991b1b; }

/* Nav cards */
.nav-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: 12px; }
.nav-card { background: #fff; border-radius: 8px; padding: 14px 12px; text-decoration: none; color: var(--ink); box-shadow: 0 1px 3px rgba(0,0,0,0.1); transition: transform .12s, box-shadow .12s; display: flex; flex-direction: column; gap: 4px; }
.nav-card:hover { transform: translateY(-2px); box-shadow: 0 3px 10px rgba(0,0,0,0.15); }
.nc-icon { font-size: 1.4rem; }
.nc-title { font-weight: 700; font-size: 0.88rem; }
.nc-sub { font-size: 0.75rem; color: #6b7280; }

/* Blockers */
.blocker-row { border-radius: 0 6px 6px 0; padding: 10px 14px; margin-bottom: 10px; }
.blocker-head { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.sev-badge { color: #fff; padding: 1px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 700; }
.blocker-title { font-weight: 600; font-size: 0.9rem; flex: 1; }
.blocker-detail { font-size: 0.82rem; color: #374151; line-height: 1.5; }
.qa-link { background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 8px; font-size: 0.78rem; text-decoration: none; font-weight: 600; }
.qa-link:hover { background: #bae6fd; }

/* Flow map */
.flow-wrap { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.flow-step { border-radius: 6px; padding: 8px 10px; min-width: 100px; max-width: 130px; text-align: center; background: #fff; }
.fs-id { font-size: 0.7rem; font-weight: 700; }
.fs-name { font-size: 0.82rem; font-weight: 600; margin: 2px 0; }
.fs-detail { font-size: 0.68rem; color: #6b7280; }
.flow-arrow { color: #9ca3af; font-size: 1.1rem; padding: 0 2px; }

/* Workflow */
.wf-step { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 14px; }
.wf-num { width: 28px; height: 28px; background: #1e3a5f; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; flex-shrink: 0; margin-top: 2px; }
.wf-body { flex: 1; }
.wf-title { font-weight: 600; font-size: 0.9rem; margin-bottom: 4px; }
.wf-detail { font-size: 0.83rem; color: #374151; }
.wf-link { color: #1d4ed8; text-decoration: none; }
.wf-link:hover { text-decoration: underline; }
code { background: #f1f5f9; padding: 1px 5px; border-radius: 3px; font-size: 0.8rem; font-family: 'Consolas', monospace; color: #1e3a5f; }

/* BOQ metrics */
.metrics-grid { display: flex; flex-wrap: wrap; gap: 12px; }
.metric-box { background: #fff; border-radius: 8px; padding: 12px 16px; min-width: 110px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.m-val { font-size: 1.4rem; font-weight: 700; }
.m-label { font-size: 0.75rem; color: #6b7280; margin-top: 2px; }
.m-note { font-size: 0.7rem; color: #9ca3af; margin-top: 2px; }

/* Audit */
.audit-list { list-style: none; }
.audit-list li { padding: 6px 0 6px 24px; border-bottom: 1px solid #f3f4f6; font-size: 0.85rem; position: relative; }
.audit-list li::before { content: "⚠"; position: absolute; left: 0; color: #d97706; }

/* Next build */
.next-card { background: #fff; border-radius: 8px; padding: 14px 16px; margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border: 1.5px solid #e2e8f0; }
.next-rec { border-color: #1d4ed8; background: #eff6ff; }
.next-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.next-opt { background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 8px; font-size: 0.78rem; font-weight: 700; }
.next-title { font-weight: 600; font-size: 0.9rem; flex: 1; }
.rec-badge { background: #1d4ed8; color: #fff; padding: 2px 8px; border-radius: 8px; font-size: 0.75rem; }
.next-detail { font-size: 0.83rem; color: #374151; margin-bottom: 8px; line-height: 1.5; }
.next-meta { font-size: 0.8rem; color: #6b7280; }

/* Footer */
.footer { background: #1e3a5f; color: #93c5fd; font-size: 0.75rem; padding: 10px 24px; margin-top: 32px; }
'''

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plan Scanner Workspace — סורק תוכניות</title>
<style>{css}</style>
</head>
<body>

<div class="topbar">
  <div class="topbar-title">סורק תוכניות — Plan Scanner Workspace</div>
  <nav class="topbar-nav">
    <a href="#overview">Overview</a>
    <a href="#nav">Navigation</a>
    <a href="#blockers">Blockers</a>
    <a href="#flow">Flow</a>
    <a href="#workflow">Workflow</a>
    <a href="#boq">BOQ</a>
    <a href="#audit">Audit</a>
    <a href="#next">Next Step</a>
  </nav>
</div>

<div class="page">

<!-- ── 1. Overview ──────────────────────────────────────────────────────── -->
<div id="overview" class="section">
<div class="section-title">1. Overview</div>
{overview_html}
</div>

<!-- ── 2. Quick Navigation ──────────────────────────────────────────────── -->
<div id="nav" class="section">
<div class="section-title">2. Quick Navigation</div>
<div class="card">
  <div class="nav-grid">
{nav_cards}
  </div>
</div>
</div>

<!-- ── 3. Critical Blockers ─────────────────────────────────────────────── -->
<div id="blockers" class="section">
<div class="section-title">3. Current Critical Blockers</div>
<div class="card">
{blocker_rows}
</div>
</div>

<!-- ── 4. Flow Map ──────────────────────────────────────────────────────── -->
<div id="flow" class="section">
<div class="section-title">4. End-to-End Pipeline Flow</div>
<div class="card">
  <div class="flow-wrap">
{flow_steps_html}
  </div>
</div>
</div>

<!-- ── 5. Human Input Workflow ───────────────────────────────────────────── -->
<div id="workflow" class="section">
<div class="section-title">5. Human Input Workflow</div>
<div class="card">
  <p style="font-size:0.85rem;color:#555;margin-bottom:16px">
    Do not answer the 40 questions now. This workflow describes the future process
    once you are ready to begin the teaching loop.
  </p>
{wf_html}
</div>
</div>

<!-- ── 6. BOQ Status ────────────────────────────────────────────────────── -->
<div id="boq" class="section">
<div class="section-title">6. BOQ Status</div>
<div class="card">
  <div class="metrics-grid">
{boq_metrics}
  </div>
  <p style="margin-top:14px;font-size:0.82rem;color:#6b7280">
    Top categories: sign plates (cnt), pole locations (cnt), road marking (linear m),
    red element / guardrail candidate (linear m), element group classifications (pending).
    <br>All quantities provisional. Scale 1:{sc["ratio"]} unverified. No human sign-off.
  </p>
</div>
</div>

<!-- ── 7. Safety / Audit Rules ───────────────────────────────────────────── -->
<div id="audit" class="section">
<div class="section-title">7. Safety &amp; Audit Rules</div>
<div class="card">
  <ul class="audit-list">
{audit_html}
  </ul>
</div>
</div>

<!-- ── 8. Recommended Next Build Step ───────────────────────────────────── -->
<div id="next" class="section">
<div class="section-title">8. Recommended Next Local Build Step</div>
<div class="card">
{next_html}
</div>
</div>

</div><!-- /page -->

<div class="footer">
  Generated by 26_plan_scanner_workspace.py &nbsp;|&nbsp;
  Research-only &nbsp;|&nbsp; No paid API &nbsp;|&nbsp; No production changes &nbsp;|&nbsp;
  Generated: {now}
</div>
</body>
</html>'''


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    print('Stage S13 — Plan Scanner Workspace')
    print('=' * 50)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print('Building workspace summary...')
    summary = build_summary()

    print('Writing JSON...')
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f'  {OUT_JSON}')

    print('Writing Markdown...')
    md = build_markdown(summary)
    with open(OUT_MD, 'w', encoding='utf-8') as f:
        f.write(md)
    print(f'  {OUT_MD}')

    print('Writing HTML...')
    html = build_html(summary)
    with open(OUT_HTML, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'  {OUT_HTML}')

    ps  = summary['pipeline']
    boq = summary['boq']
    tlp = summary['answer_pack']
    artifacts_ok = sum(1 for a in summary['artifacts'] if a['exists'])

    print()
    print(f'Pipeline:      {ps["stages_ok"]}/{ps["total_stages"]} stages OK')
    print(f'BOQ items:     {boq["total_items"]} (approved: {boq["approved_for_boq"]})')
    print(f'Linear (prov): {boq["total_linear_m"]:,.1f} m')
    print(f'Pending Qs:    {tlp["total_questions"]}')
    print(f'Artifacts:     {artifacts_ok}/{len(summary["artifacts"])} present')
    print()
    print('Next steps:')
    print('  open outputs/plan_scanner_workspace.html')
    print('  Recommended next feature: Option B — static guided review form generator')
    print()
    print('Stage S13 complete.')


if __name__ == '__main__':
    main()
