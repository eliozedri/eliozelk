#!/usr/bin/env python3
"""
22_partial_code_resolver.py
Stage S9 — Partial Code Resolution / Plan Convention Resolver

For each OCC with a partial (2-digit) code from Stage S8, this script:
  1. Generates catalog-only expansions (prefix 1–9 × suffix)
  2. Ranks expansions using T1–T4 evidence hierarchy (NO image matching)
  3. Assigns resolution_status: resolved_high / resolved_medium / ambiguous /
     unresolved / invalid_partial
  4. Generates structured human-review questions for the teaching loop
  5. Handles legend labels as pending_label_extraction (all null — no vision API)

Evidence tiers:
  T1  Full 3-digit code confirmed elsewhere in this plan (strong)
  T2  Same suffix appears in plan BOQ/sign inventory with a specific full code (moderate)
  T3  Sign-category prior for road construction projects (weak — breaks ties only)
  T4  Suffix repetition pattern (context — informs but does not resolve)

Inputs:
  outputs/validation_results.json       (from 20_validation_layer.py — S8)
  outputs/legend_vocabulary.json        (all labels null — pending_label_extraction)
  sign_catalog/                         (PNG existence check only)
  מקורות מידע/Sign/knowledge-base/SIGN_INDEX.md

Outputs:
  outputs/partial_code_resolution.json
  outputs/partial_code_resolution_report.md
  outputs/partial_code_resolution_report.html

Research-only. approved_for_boq: false on ALL items always.
No image comparison in this step. No vision API. Do not overclaim.
"""
from __future__ import annotations
import json, re, time
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple, Any

# ── Config ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR  = Path(__file__).parent
OUT_DIR     = SCRIPT_DIR / 'outputs'
SIGN_INDEX  = SCRIPT_DIR.parent.parent / 'מקורות מידע' / 'Sign' / 'knowledge-base' / 'SIGN_INDEX.md'
CATALOG_DIR = SCRIPT_DIR / 'sign_catalog'

IN_VALIDATION = OUT_DIR / 'validation_results.json'
IN_LEGEND     = OUT_DIR / 'legend_vocabulary.json'

OUT_JSON = OUT_DIR / 'partial_code_resolution.json'
OUT_MD   = OUT_DIR / 'partial_code_resolution_report.md'
OUT_HTML = OUT_DIR / 'partial_code_resolution_report.html'

# Israeli traffic sign series ranges: (lo, hi, category_name)
SIGN_SERIES: List[Tuple[int, int, str]] = [
    (101, 152, 'Warning & Alert'),
    (201, 231, 'Instructions'),
    (301, 310, 'Right of Way'),
    (401, 441, 'Prohibitions'),
    (501, 516, 'Public Transport'),
    (601, 640, 'Information & Guidance'),
    (701, 729, 'Traffic Lights & Lane Control'),
    (801, 821, 'Road Markings'),
    (901, 935, 'Work Zone'),
]

# T3: category priority weights for road construction projects (1=lowest, 5=highest)
# Based on typical sign mix in Israeli road construction / infrastructure plans.
ROAD_PROJECT_PRIORS: Dict[str, int] = {
    'Work Zone':                    5,  # ubiquitous in construction plans
    'Prohibitions':                 4,  # speed limits, parking restrictions
    'Information & Guidance':       3,  # detour, direction, road info
    'Warning & Alert':              2,  # advance warnings
    'Instructions':                 2,
    'Right of Way':                 1,
    'Public Transport':             1,
    'Traffic Lights & Lane Control':1,
    'Road Markings':                1,
}


# ── Loaders ────────────────────────────────────────────────────────────────────

def load_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


def parse_sign_index(path: Path) -> Dict[int, Dict]:
    """Return {code_int: {name, series}} from SIGN_INDEX.md."""
    if not path.exists():
        print(f'[Warn] SIGN_INDEX not found: {path}')
        return {}
    kb: Dict[int, Dict] = {}
    pattern = re.compile(r'^\|\s*(\d{3,4})\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|')
    with open(path, encoding='utf-8') as f:
        for line in f:
            m = pattern.match(line)
            if m:
                code_str, name, series = m.group(1), m.group(2).strip(), m.group(3).strip()
                code_int = int(code_str)
                if any(lo <= code_int <= hi for lo, hi, _ in SIGN_SERIES):
                    kb[code_int] = {'name': name, 'series': series}
    return kb


def load_catalog_codes(catalog_dir: Path) -> Set[int]:
    """Return set of integer codes present as sign_NNN.png in the catalog."""
    codes: Set[int] = set()
    for p in catalog_dir.glob('sign_*.png'):
        m = re.match(r'sign_(\d+)', p.stem)
        if m:
            codes.add(int(m.group(1)))
    return codes


# ── Core logic ─────────────────────────────────────────────────────────────────

def series_for_code(code: int) -> Optional[str]:
    for lo, hi, name in SIGN_SERIES:
        if lo <= code <= hi:
            return name
    return None


def expand_partial(suffix: str, catalog_codes: Set[int], kb_data: Dict[int, Dict]) -> List[Dict]:
    """
    Generate all valid expansions for a 2-digit suffix by prepending digits 1–9.
    Returns list of candidates that exist in catalog AND in the valid series range,
    sorted by code ascending.
    """
    candidates = []
    for prefix in range(1, 10):
        code_int = int(f'{prefix}{suffix}')
        series = series_for_code(code_int)
        if series is None:
            continue
        in_catalog = code_int in catalog_codes
        in_kb = code_int in kb_data
        if not (in_catalog or in_kb):
            continue
        name = kb_data[code_int]['name'] if code_int in kb_data else None
        candidates.append({
            'code':       code_int,
            'series':     series,
            'name':       name,
            'in_catalog': in_catalog,
            'in_kb':      in_kb,
            't3_prior':   ROAD_PROJECT_PRIORS.get(series, 1),
        })
    return sorted(candidates, key=lambda c: c['code'])


def apply_t1(suffix: str, inv_codes: Set[int]) -> Optional[int]:
    """
    T1: check if any confirmed full code in the plan's sign inventory ends with this suffix.
    inv_codes: set of integer codes confirmed (selected_sign_code != null) in sign_inventory.json.
    """
    matches = [c for c in inv_codes if str(c).endswith(suffix)]
    return matches[0] if len(matches) == 1 else None


def apply_t2(suffix: str, boq_codes: Set[int]) -> Optional[int]:
    """
    T2: check if any code in the unified BOQ draft ends with this suffix and is confirmed.
    boq_codes: set of integer codes in boq_unified_draft.json with approved_for_boq=True.
    """
    matches = [c for c in boq_codes if str(c).endswith(suffix)]
    return matches[0] if len(matches) == 1 else None


def rank_by_t3(candidates: List[Dict]) -> List[Dict]:
    """Sort candidates descending by T3 road-project prior."""
    return sorted(candidates, key=lambda c: -c['t3_prior'])


def determine_resolution_status(
    candidates: List[Dict],
    t1_match: Optional[int],
    t2_match: Optional[int],
) -> Tuple[str, Optional[int]]:
    """
    Return (resolution_status, suggested_code_or_None).
    Hierarchy: T1 (strong) → T2 (moderate) → ambiguous.
    T3 is weak — used for ranking display only, never to force a resolution.
    Never overclaims: multiple valid candidates → ambiguous, null suggested_resolution.
    """
    if not candidates:
        return 'invalid_partial', None

    if t1_match is not None:
        return 'resolved_high', t1_match

    if t2_match is not None:
        return 'resolved_medium', t2_match

    # T3/T4 are display/ranking only — cannot resolve ambiguity alone
    return 'ambiguous', None


def build_review_questions(suffix: str, candidates: List[Dict], frequency: int, occ_ids: List[str]) -> List[Dict]:
    """
    Generate structured human-review questions to resolve the ambiguity.
    """
    if not candidates:
        return [{
            'question_id': f'Q-{suffix}-1',
            'question':    f'Code suffix "{suffix}" has NO valid expansion in any Israeli sign series. Is this OCC group misidentified (false positive)?',
            'answer_type': 'boolean',
            'impact':      'Confirms whether these OCCs should be flagged as false positives.',
        }]

    qs = []
    candidate_list = ', '.join(f'{c["code"]} ({c["series"]} — {c["name"] or "unknown"})' for c in candidates)
    qs.append({
        'question_id': f'Q-{suffix}-1',
        'question':    (
            f'The suffix "{suffix}" appears {frequency}× across OCCs: {", ".join(occ_ids)}. '
            f'Valid expansions: {candidate_list}. '
            f'Looking at the physical plan PDF, which sign is shown at these locations?'
        ),
        'answer_type': 'single_choice',
        'options':     [str(c['code']) for c in candidates] + ['other', 'cannot_determine'],
        'impact':      f'Resolves {frequency} partial-code OCCs in a single answer (all share suffix "{suffix}").',
    })
    qs.append({
        'question_id': f'Q-{suffix}-2',
        'question':    (
            f'Does the plan\'s legend (מקרא מפה) include a sign icon that visually matches any of: '
            + ', '.join(str(c['code']) for c in candidates) + '?'
        ),
        'answer_type': 'single_choice',
        'options':     [str(c['code']) for c in candidates] + ['not_in_legend', 'cannot_determine'],
        'impact':      'T1/T2 upgrade: if legend identifies a code, raises resolution to resolved_high.',
    })
    qs.append({
        'question_id': f'Q-{suffix}-3',
        'question':    (
            f'Is this plan a road construction / infrastructure project where Work Zone signs (9xx) and Prohibitions (4xx) are more common than railway-warning (133) or tunnel-info (633)?'
        ),
        'answer_type': 'boolean',
        'impact':      'Confirms T3 road-project prior. If yes, narrows candidates toward 933 and 433.',
    })
    return qs


def build_teaching_loop_spec(suffix_groups: Dict) -> Dict:
    return {
        'description': (
            'For each suffix group, answer the review_questions to resolve ambiguity. '
            'A human answer to Q-suffix-1 (which code is shown) resolves all OCCs in the group simultaneously. '
            'Enter the answer in the human_label field and re-run this script to propagate.'
        ),
        'human_label_format': {
            'field':       'human_label',
            'type':        'integer (confirmed 3-digit sign code) or null',
            'example':     {
                'suffix':       '33',
                'human_label':  933,
                'confirmed_by': 'visual review of plan PDF at OCC-0001',
            },
        },
        'impact': (
            'A single confirmed label per suffix group resolves all OCCs sharing that suffix. '
            f'This plan has {len(suffix_groups)} suffix group(s).'
        ),
    }


# ── Confirmed-code helpers ──────────────────────────────────────────────────────

def load_confirmed_inventory_codes(inv_path: Path) -> Set[int]:
    """Return set of confirmed sign codes from sign_inventory.json (non-null selected_sign_code)."""
    data = load_json(inv_path, [])
    codes: Set[int] = set()
    for r in (data if isinstance(data, list) else []):
        sc = r.get('selected_sign_code')
        if sc is not None:
            try:
                codes.add(int(sc))
            except (ValueError, TypeError):
                pass
    return codes


def load_confirmed_boq_codes(boq_path: Path) -> Set[int]:
    """Return set of confirmed sign codes from boq_unified_draft.json (approved_for_boq=True)."""
    data = load_json(boq_path)
    if not isinstance(data, dict):
        return set()
    codes: Set[int] = set()
    for item in data.get('items', []):
        if item.get('approved_for_boq') and item.get('sign_code'):
            try:
                codes.add(int(item['sign_code']))
            except (ValueError, TypeError):
                pass
    return codes


# ── Resolver ───────────────────────────────────────────────────────────────────

def resolve_all(
    validation_results: Dict,
    catalog_codes: Set[int],
    kb_data: Dict[int, Dict],
    inv_codes: Set[int],
    boq_codes: Set[int],
) -> Tuple[Dict, List[Dict]]:
    """
    Process all partial_match and suspicious OCCs.
    Returns (suffix_groups, results_list).
    """
    all_results = validation_results.get('results', [])

    # Filter: only items with a partial code (partial_match or suspicious)
    partial_items = [
        r for r in all_results
        if r.get('validation_status') in ('partial_match', 'suspicious')
        and r.get('poc3_code') is not None
    ]

    # Group by suffix
    by_suffix: Dict[str, List[Dict]] = {}
    for item in partial_items:
        s = item['poc3_code']
        by_suffix.setdefault(s, []).append(item)

    suffix_groups: Dict = {}
    results: List[Dict] = []

    for suffix, items in sorted(by_suffix.items()):
        occ_ids   = [i['occurrence_id'] for i in items]
        frequency = len(items)

        candidates   = expand_partial(suffix, catalog_codes, kb_data)
        t1_match     = apply_t1(suffix, inv_codes)
        t2_match     = apply_t2(suffix, boq_codes)
        status, suggested = determine_resolution_status(candidates, t1_match, t2_match)
        ranked       = rank_by_t3(candidates) if candidates else []
        review_qs    = build_review_questions(suffix, candidates, frequency, occ_ids)

        group_rec = {
            'suffix':              suffix,
            'occ_ids':             occ_ids,
            'frequency':           frequency,
            'expansion_candidates': candidates,
            't1_match':            t1_match,
            't1_source':           'sign_inventory.json confirmed codes' if t1_match else None,
            't2_match':            t2_match,
            't2_source':           'boq_unified_draft.json approved codes' if t2_match else None,
            't3_ranked':           ranked,
            't4_note':             (
                f'Suffix "{suffix}" repeated {frequency}× — '
                + ('strong indication of a single repeated sign type.' if frequency >= 5
                   else 'moderate indication of repeated sign type.')
            ),
            'legend_status':       'pending_label_extraction',
            'resolution_status':   status,
            'suggested_resolution': suggested,
            'review_questions':    review_qs,
        }
        suffix_groups[suffix] = group_rec

        for item in items:
            results.append({
                'occurrence_id':         item['occurrence_id'],
                'partial_code':          suffix,
                'validation_status_s8':  item.get('validation_status'),
                'poc3_confidence':       item.get('poc3_confidence'),
                'expansion_candidates':  candidates,
                't1_match':              t1_match,
                't2_match':              t2_match,
                't3_ranked':             [c['code'] for c in ranked],
                't4_note':               group_rec['t4_note'],
                'legend_status':         'pending_label_extraction',
                'resolution_status':     status,
                'suggested_resolution':  suggested,
                'requires_review':       True,
                'approved_for_boq':      False,
            })

    return suffix_groups, results


# ── Report builders ─────────────────────────────────────────────────────────────

def resolution_badge(status: str) -> str:
    badges = {
        'resolved_high':   '✅ RESOLVED (HIGH)',
        'resolved_medium': '⚠️ RESOLVED (MEDIUM)',
        'ambiguous':       '🔶 AMBIGUOUS',
        'unresolved':      '❌ UNRESOLVED',
        'invalid_partial': '🚫 INVALID PARTIAL',
    }
    return badges.get(status, status.upper())


def build_md(summary: Dict) -> str:
    meta   = summary['meta']
    groups = summary['suffix_groups']
    ts     = meta['generated_at']

    lines = [
        '# Partial Code Resolution Report — Stage S9',
        '',
        f'Generated: `{ts}`',
        '',
        '> ⚠ **RESEARCH-ONLY** — `approved_for_boq: false` on all items.',
        '> No image comparison. No vision API. No forced resolutions.',
        '',
        '## Summary',
        '',
        '| Metric | Value |',
        '|--------|-------|',
        f'| Partial OCCs processed | {meta["n_processed"]} |',
        f'| Suffix groups | {len(groups)} |',
        f'| Legend status | {meta["legend_status"]} |',
        f'| Approved for BOQ | **{meta["approved_for_boq"]}** |',
    ]
    for status, count in meta['resolution_counts'].items():
        lines.append(f'| {resolution_badge(status)} | {count} |')

    lines += ['', '## Suffix Groups', '']
    for suffix, g in groups.items():
        lines += [
            f'### Suffix "{suffix}" ({g["frequency"]}× occurrences)',
            '',
            f'**OCCs:** {", ".join(g["occ_ids"])}',
            '',
            f'**Resolution:** {resolution_badge(g["resolution_status"])}',
            '',
        ]
        if g['suggested_resolution']:
            cname = next((c['name'] for c in g['expansion_candidates'] if c['code'] == g['suggested_resolution']), None)
            lines.append(f'**Suggested code:** {g["suggested_resolution"]} — {cname}')
            lines.append('')

        lines += [
            '**Expansion candidates:**',
            '',
            '| Code | Series | Name | Catalog | KB | T3 Prior |',
            '|------|--------|------|---------|----|----------|',
        ]
        for c in g['expansion_candidates']:
            lines.append(
                f'| {c["code"]} | {c["series"]} | {c["name"] or "—"} | '
                f'{"✓" if c["in_catalog"] else "✗"} | {"✓" if c["in_kb"] else "✗"} | '
                f'{c["t3_prior"]}/5 |'
            )

        lines += [
            '',
            f'**T1 (plan inventory match):** {g["t1_match"] or "none — no confirmed codes in this plan"}',
            f'**T2 (BOQ confirmed match):** {g["t2_match"] or "none — no approved BOQ codes in this plan"}',
            f'**T3 top candidate:** {g["t3_ranked"][0]["code"] if g["t3_ranked"] else "n/a"}'
            + (f' (but {len([c for c in g["t3_ranked"] if c["t3_prior"] == g["t3_ranked"][0]["t3_prior"]])} tied at prior={g["t3_ranked"][0]["t3_prior"]})'
               if g['t3_ranked'] else ''),
            f'**T4:** {g["t4_note"]}',
            f'**Legend:** {g["legend_status"]}',
            '',
        ]

        lines += ['**Review questions:**', '']
        for q in g['review_questions']:
            lines.append(f'- **{q["question_id"]}**: {q["question"]}')
            if q.get('options'):
                lines.append(f'  Options: {", ".join(q["options"])}')
            lines.append(f'  *Impact: {q["impact"]}*')
            lines.append('')

    lines += [
        '## Teaching Loop',
        '',
        summary['teaching_loop']['description'],
        '',
        '---',
        '',
        '*Research output. Not approved for construction, procurement, billing, or execution.*',
    ]
    return '\n'.join(lines)


STATUS_COLOR = {
    'resolved_high':   '#15803d',
    'resolved_medium': '#b45309',
    'ambiguous':       '#d97706',
    'unresolved':      '#dc2626',
    'invalid_partial': '#7c3aed',
}

HTML_BADGE = {
    'resolved_high':   ('<span style="background:#15803d;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px">✅ RESOLVED HIGH</span>'),
    'resolved_medium': ('<span style="background:#b45309;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px">⚠ RESOLVED MEDIUM</span>'),
    'ambiguous':       ('<span style="background:#d97706;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px">🔶 AMBIGUOUS</span>'),
    'unresolved':      ('<span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px">❌ UNRESOLVED</span>'),
    'invalid_partial': ('<span style="background:#7c3aed;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px">🚫 INVALID PARTIAL</span>'),
}


def build_html(summary: Dict) -> str:
    meta   = summary['meta']
    groups = summary['suffix_groups']
    ts     = meta['generated_at']

    group_html = ''
    for suffix, g in groups.items():
        badge = HTML_BADGE.get(g['resolution_status'], g['resolution_status'])
        sc    = STATUS_COLOR.get(g['resolution_status'], '#555')

        cand_rows = ''
        for c in g['expansion_candidates']:
            t3_bar_w = c['t3_prior'] * 20
            cand_rows += (
                f'<tr>'
                f'<td><strong>{c["code"]}</strong></td>'
                f'<td>{c["series"]}</td>'
                f'<td>{c["name"] or "—"}</td>'
                f'<td style="color:{"#15803d" if c["in_catalog"] else "#dc2626"}">{"✓" if c["in_catalog"] else "✗"}</td>'
                f'<td style="color:{"#15803d" if c["in_kb"] else "#dc2626"}">{"✓" if c["in_kb"] else "✗"}</td>'
                f'<td><div style="background:#e5e7eb;border-radius:2px;height:8px;width:80px">'
                f'<div style="background:#2563eb;width:{t3_bar_w}%;height:100%;border-radius:2px"></div></div>'
                f'<span style="font-size:11px;color:#555">{c["t3_prior"]}/5</span></td>'
                f'</tr>\n'
            )

        q_html = ''
        for q in g['review_questions']:
            opts = ''
            if q.get('options'):
                opts = '<br><em>Options: ' + ' &nbsp;|&nbsp; '.join(f'<code>{o}</code>' for o in q['options']) + '</em>'
            q_html += (
                f'<div style="background:#f8fafc;border-left:3px solid #2563eb;padding:8px 12px;margin:6px 0">'
                f'<strong>{q["question_id"]}</strong> {q["question"]}{opts}'
                f'<br><span style="font-size:11px;color:#6b7280">Impact: {q["impact"]}</span>'
                f'</div>\n'
            )

        group_html += f'''
<div style="border:2px solid {sc};border-radius:8px;padding:16px;margin:12px 0">
  <h3 style="margin:0 0 8px">Suffix <code>"{suffix}"</code> &nbsp; {badge} &nbsp;
    <span style="font-size:13px;color:#6b7280;font-weight:normal">({g["frequency"]}× occurrences)</span>
  </h3>
  <div style="font-size:13px;color:#374151;margin-bottom:8px">
    <strong>OCCs:</strong> {", ".join(f'<code>{o}</code>' for o in g["occ_ids"])}
  </div>
  {"<div style='background:#f0fdf4;border:1px solid #86efac;border-radius:4px;padding:6px 12px;margin-bottom:8px'><strong>Suggested: " + str(g["suggested_resolution"]) + "</strong></div>" if g["suggested_resolution"] else ""}

  <table style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:10px">
    <tr style="background:#f1f5f9"><th style="padding:4px 8px">Code</th><th>Series</th><th>Name</th><th>Catalog</th><th>KB</th><th>T3 Prior</th></tr>
    {cand_rows}
  </table>

  <div style="font-size:12px;color:#374151;line-height:1.6">
    <strong>T1</strong> (plan inventory): {g["t1_match"] or "<em>none — no confirmed codes in this plan</em>"} &nbsp;
    <strong>T2</strong> (BOQ confirmed): {g["t2_match"] or "<em>none</em>"}<br>
    <strong>T3 top:</strong> {g["t3_ranked"][0]["code"] if g["t3_ranked"] else "n/a"} &nbsp;
    <strong>T4:</strong> {g["t4_note"]}<br>
    <strong>Legend:</strong> <code>{g["legend_status"]}</code>
  </div>

  <h4 style="margin:10px 0 4px;font-size:13px">Review Questions</h4>
  {q_html}
</div>
'''

    rc = meta['resolution_counts']
    count_cards = ''.join(
        f'<div style="display:inline-block;background:#fff;border:2px solid {STATUS_COLOR.get(s,"#555")};'
        f'border-radius:8px;padding:8px 16px;margin:4px;text-align:center;min-width:80px">'
        f'<div style="font-size:22px;font-weight:bold;color:{STATUS_COLOR.get(s,"#555")}">{n}</div>'
        f'<div style="font-size:11px;color:#555">{s.replace("_"," ")}</div></div>'
        for s, n in rc.items()
    )

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Partial Code Resolution Report — S9</title>
<style>
  body {{font-family: system-ui, sans-serif; margin: 24px; background: #f9fafb; color: #111;}}
  h1 {{color: #1e3a5f; font-size: 1.4rem;}}
  h2 {{font-size: 1.05rem; margin-top: 28px; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;}}
  table td, table th {{border: 1px solid #e5e7eb; padding: 5px 10px;}}
  th {{background:#f1f5f9; font-weight:600;}}
  code {{background:#f1f5f9;padding:1px 4px;border-radius:3px;font-size:12px;}}
  .disclaimer {{background:#fef2f2;border:2px solid #fca5a5;border-radius:8px;padding:10px 16px;margin:12px 0;}}
</style>
</head>
<body>
<h1>Partial Code Resolution Report — Stage S9</h1>
<div class="disclaimer">
  ⚠ <strong>RESEARCH-ONLY — NOT APPROVED BOQ DATA</strong> &nbsp;|&nbsp;
  <code>approved_for_boq: false</code> on all items &nbsp;|&nbsp;
  No image comparison · No vision API · No forced resolutions
</div>

<p><strong>Generated:</strong> <code>{ts}</code> &nbsp;|&nbsp;
   <strong>Partial OCCs:</strong> {meta["n_processed"]} &nbsp;|&nbsp;
   <strong>Suffix groups:</strong> {len(groups)} &nbsp;|&nbsp;
   <strong>Legend:</strong> <code>{meta["legend_status"]}</code>
</p>

<h2>Resolution Summary</h2>
<div style="margin:10px 0">{count_cards}</div>

<h2>Suffix Groups</h2>
{group_html}

<h2>Teaching Loop</h2>
<div style="background:#f0f9ff;border:2px solid #bae6fd;border-radius:8px;padding:14px 18px">
  <strong>How to resolve:</strong><br>
  {summary["teaching_loop"]["description"]}<br><br>
  <strong>Label format:</strong>
  <code>{json.dumps(summary["teaching_loop"]["human_label_format"]["example"])}</code>
</div>

<hr style="margin-top:32px">
<p style="color:#9ca3af;font-size:11px">
  Generated by 22_partial_code_resolver.py &nbsp;|&nbsp;
  REMINDER: Not approved for construction, procurement, billing, or execution.
</p>
</body></html>'''


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    t0 = time.time()
    ts = time.strftime('%Y-%m-%dT%H:%M:%S')
    print('=' * 60)
    print('Stage S9 — Partial Code Resolution')
    print('22_partial_code_resolver.py')
    print(f'Run: {ts}')
    print('=' * 60)

    # Load inputs
    print(f'\n[Load] Validation results: {IN_VALIDATION}')
    validation_data = load_json(IN_VALIDATION)
    if validation_data is None:
        print('[ERROR] validation_results.json not found. Run 20_validation_layer.py first.')
        return
    all_results = validation_data.get('results', [])
    n_partial = sum(1 for r in all_results if r.get('validation_status') in ('partial_match', 'suspicious'))
    print(f'[Load] {len(all_results)} total OCCs, {n_partial} partial/suspicious')

    print(f'[Load] SIGN_INDEX: {SIGN_INDEX}')
    kb_data = parse_sign_index(SIGN_INDEX)
    print(f'[Load] {len(kb_data)} codes in knowledge base')

    print(f'[Load] Catalog: {CATALOG_DIR}')
    catalog_codes = load_catalog_codes(CATALOG_DIR)
    print(f'[Load] {len(catalog_codes)} codes in catalog')

    print(f'[Load] Legend vocabulary: {IN_LEGEND}')
    legend_data = load_json(IN_LEGEND, {})
    n_legend_rows    = legend_data.get('n_rows', 0)
    vision_used      = legend_data.get('vision_used', False)
    legend_status    = 'pending_label_extraction'
    print(f'[Load] Legend: {n_legend_rows} rows, vision_used={vision_used} → status={legend_status}')

    # Load T1/T2 evidence sources
    inv_path = OUT_DIR / 'sign_inventory.json'
    boq_path = OUT_DIR / 'boq_unified_draft.json'
    inv_codes = load_confirmed_inventory_codes(inv_path)
    boq_codes = load_confirmed_boq_codes(boq_path)
    print(f'[T1] Confirmed inventory codes: {len(inv_codes)}')
    print(f'[T2] Approved BOQ codes: {len(boq_codes)}')

    # Resolve
    print('\n[Resolve] Processing partial codes ...')
    suffix_groups, results = resolve_all(
        validation_data, catalog_codes, kb_data, inv_codes, boq_codes
    )

    resolution_counts: Dict[str, int] = {}
    for r in results:
        s = r['resolution_status']
        resolution_counts[s] = resolution_counts.get(s, 0) + 1

    teaching_loop = build_teaching_loop_spec(suffix_groups)

    for suffix, g in suffix_groups.items():
        print(f'  Suffix "{suffix}" ({g["frequency"]}×): {g["resolution_status"]}'
              + (f' → {g["suggested_resolution"]}' if g['suggested_resolution'] else ''))
        for c in g['expansion_candidates']:
            print(f'    {c["code"]} [{c["series"]}] T3={c["t3_prior"]} {c["name"] or ""}')

    # Build summary
    summary = {
        'meta': {
            'generated_at':      ts,
            'script':            '22_partial_code_resolver.py',
            'source':            str(IN_VALIDATION.relative_to(SCRIPT_DIR)),
            'n_partial_input':   n_partial,
            'n_processed':       len(results),
            'n_suffix_groups':   len(suffix_groups),
            'resolution_counts': resolution_counts,
            'legend_status':     legend_status,
            'kb_code_count':     len(kb_data),
            'catalog_code_count':len(catalog_codes),
            'approved_for_boq':  False,
            'note':              (
                'Research-only. No image comparison. No vision API. '
                'All codes require human confirmation before any operational use.'
            ),
        },
        'suffix_groups':   suffix_groups,
        'results':         results,
        'teaching_loop':   teaching_loop,
    }

    # Write outputs
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print('\n[Write] Saving outputs ...')
    OUT_JSON.write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f'  → {OUT_JSON.relative_to(SCRIPT_DIR)}')

    OUT_MD.write_text(build_md(summary))
    print(f'  → {OUT_MD.relative_to(SCRIPT_DIR)}')

    OUT_HTML.write_text(build_html(summary))
    print(f'  → {OUT_HTML.relative_to(SCRIPT_DIR)}')

    elapsed = time.time() - t0
    print(f"""
{'=' * 60}
S9 COMPLETE
{'=' * 60}
  Partial OCCs processed : {len(results)}
  Suffix groups          : {len(suffix_groups)}
  Resolution counts      : {resolution_counts}
  Legend status          : {legend_status}

  Teaching loop          : Answer review questions per suffix group
                           to resolve {sum(v for k,v in resolution_counts.items() if k == 'ambiguous')} ambiguous groups

  Outputs:
    {OUT_JSON.relative_to(SCRIPT_DIR)}
    {OUT_MD.relative_to(SCRIPT_DIR)}
    {OUT_HTML.relative_to(SCRIPT_DIR)}

  Elapsed                : {elapsed:.1f}s

  open {OUT_HTML.relative_to(SCRIPT_DIR)}

  REMINDER: approved_for_boq: false on ALL items.
  No image comparison. No forced resolutions.
{'=' * 60}
""")


if __name__ == '__main__':
    main()
