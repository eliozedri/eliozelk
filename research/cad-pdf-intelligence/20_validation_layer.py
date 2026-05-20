"""
20_validation_layer.py — Sign Plausibility Validation Layer v1

Validates MEDIUM-tier sign-code candidates from POC 3 against:
  1. Code format plausibility (3-digit, 101-935 range)
  2. Catalog existence (sign_catalog/sign_N.png)
  3. Knowledge-base match (SIGN_INDEX.md)
  4. Partial-code expansion (2-digit → all valid 3-digit completions)
  5. Duplicate detection (how many OCCs share this code)
  6. Evidence verification (visual crop files present on disk)

Outputs:
  outputs/validation_results.json
  outputs/validation_report.md
  outputs/validation_report.html

Does NOT upgrade approved_for_boq — everything stays false.
Research-only. No approved BOQ output.
"""
from __future__ import annotations

import json
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

# ── Paths ──────────────────────────────────────────────────────────────────────
ROOT        = Path(__file__).parent
CATALOG_DIR = ROOT / 'sign_catalog'
SIGN_INDEX  = ROOT.parent.parent / 'מקורות מידע' / 'Sign' / 'knowledge-base' / 'SIGN_INDEX.md'
OUTPUTS     = ROOT / 'outputs'
REVIEW_QUEUE = OUTPUTS / 'review_queue.json'
OUT_JSON    = OUTPUTS / 'validation_results.json'
OUT_MD      = OUTPUTS / 'validation_report.md'
OUT_HTML    = OUTPUTS / 'validation_report.html'

# ── Israeli sign series ranges ─────────────────────────────────────────────────
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

VALID_RANGE = frozenset(
    n for lo, hi, _ in SIGN_SERIES for n in range(lo, hi + 1)
)

# ── Validation status model ────────────────────────────────────────────────────
# catalog_match_status values:
#   found          – exact 3-digit match in sign_catalog/
#   not_found      – code (or all expansions) absent from catalog
#   partial_match  – 2-digit input, at least one expansion found
#   ambiguous      – multiple expansions exist (2-digit case)
#   unknown_catalog – no code to check (empty poc3_candidates)

# kb_match_status values:  same set as catalog_match_status

# validation_status values:
#   valid           – format OK, catalog+KB match found
#   partial_match   – 2-digit code with valid expansions
#   suspicious      – 2-digit code with no valid expansion
#   no_code_candidate – poc3_candidates is empty
#   format_error    – code string not parseable

# confidence_change values: unchanged / increased / decreased


# ── Parse helpers ──────────────────────────────────────────────────────────────

def parse_sign_index(path: Path) -> Dict[int, Dict]:
    """Parse SIGN_INDEX.md → {code_int: {name, series}}."""
    if not path.exists():
        print(f'[Warn] SIGN_INDEX not found: {path}')
        return {}
    text = path.read_text(encoding='utf-8')
    result: Dict[int, Dict] = {}
    current_series = 'Unknown'
    for line in text.splitlines():
        h = re.match(r'^##\s+Signs\s+[\d–-]+\s+[—–-]+\s+(.+)', line)
        if h:
            current_series = h.group(1).strip()
        m = re.match(r'\|\s*(\d{3,4})\s*\|\s*([^|]+)\|', line)
        if m:
            code = int(m.group(1))
            name = m.group(2).strip()
            result[code] = {'name': name, 'series': current_series}
    return result


def load_catalog_codes(catalog_dir: Path) -> Set[int]:
    """Glob sign_*.png and extract integer codes."""
    codes: Set[int] = set()
    if not catalog_dir.exists():
        print(f'[Warn] Catalog dir not found: {catalog_dir}')
        return codes
    for p in catalog_dir.glob('sign_*.png'):
        m = re.match(r'^sign_(\d+)\.png$', p.name)
        if m:
            codes.add(int(m.group(1)))
    return codes


def series_for(code: int) -> Optional[str]:
    for lo, hi, name in SIGN_SERIES:
        if lo <= code <= hi:
            return name
    return None


def expand_partial_code(
    raw: str,
    catalog_codes: Set[int],
    kb_data: Dict[int, Dict],
) -> List[Dict]:
    """
    For a 1- or 2-digit raw string, generate all candidates where
    prefix * 100 + int(raw) falls inside a valid sign series.
    Returns list of {code, in_catalog, in_kb, series, name}.
    """
    try:
        n = int(raw)
    except ValueError:
        return []
    if n >= 100:
        return []  # already 3-digit; no expansion needed

    candidates = []
    for prefix in range(1, 10):
        code = prefix * 100 + n
        if code not in VALID_RANGE:
            continue
        entry = {
            'code': code,
            'in_catalog': code in catalog_codes,
            'in_kb': code in kb_data,
            'series': series_for(code),
            'name': kb_data[code]['name'] if code in kb_data else None,
        }
        candidates.append(entry)
    return candidates


def check_evidence(occ_id: str, crops: Dict) -> Dict:
    """Verify which evidence files actually exist on disk."""
    out: Dict[str, object] = {}
    for key, val in crops.items():
        if isinstance(val, str):
            p = OUTPUTS / val
            out[key] = {'path': val, 'exists': p.exists()}
        elif isinstance(val, list):
            out[key] = [
                {'path': v, 'exists': (OUTPUTS / v).exists()}
                for v in val
            ]
    n_present  = sum(
        1 for v in out.values()
        if (isinstance(v, dict) and v.get('exists'))
        or (isinstance(v, list) and any(x.get('exists') for x in v))
    )
    return {'files': out, 'n_present': n_present, 'evidence_ok': n_present > 0}


# ── Core validator ─────────────────────────────────────────────────────────────

def validate_one(
    item: Dict,
    occ_to_codes: Dict[str, List[str]],
    catalog_codes: Set[int],
    kb_data: Dict[int, Dict],
) -> Dict:
    occ_id      = item['occurrence_id']
    poc3_codes  = item['auto_result'].get('poc3_candidates', [])
    poc3_conf   = item['auto_result'].get('poc3_confidence', 0.0)
    crops       = item.get('crops', {})

    evidence = check_evidence(occ_id, crops)

    # ── No code candidate ────────────────────────────────────────────────────
    if not poc3_codes:
        return {
            'occurrence_id':       occ_id,
            'poc3_code':           None,
            'poc3_confidence':     poc3_conf,
            'format_valid':        None,
            'in_series_range':     None,
            'catalog_match_status':'unknown_catalog',
            'catalog_matches':     [],
            'kb_match_status':     'unknown_kb',
            'kb_matches':          [],
            'expansion_candidates':[],
            'duplicate_count':     0,
            'duplicate_occs':      [],
            'evidence':            evidence,
            'validation_status':   'no_code_candidate',
            'confidence_change':   'unchanged',
            'adjusted_confidence': poc3_conf,
            'findings':            ['No digit sequence extracted by POC 3 for this OCC.'],
            'suggested_actions':   ['paddleocr_smoke_test', 'human_review'],
            'approved_for_boq':    False,
            'requires_review':     True,
        }

    # Use first (and typically only) code candidate
    raw = poc3_codes[0]
    findings: List[str] = []

    # ── Format check ─────────────────────────────────────────────────────────
    try:
        code_int = int(raw)
        format_valid  = (100 <= code_int <= 999)
        is_partial    = code_int < 100
        in_series     = code_int in VALID_RANGE if format_valid else None
    except ValueError:
        return {
            'occurrence_id':       occ_id,
            'poc3_code':           raw,
            'poc3_confidence':     poc3_conf,
            'format_valid':        False,
            'in_series_range':     None,
            'catalog_match_status':'unknown_catalog',
            'catalog_matches':     [],
            'kb_match_status':     'unknown_kb',
            'kb_matches':          [],
            'expansion_candidates':[],
            'duplicate_count':     0,
            'duplicate_occs':      [],
            'evidence':            evidence,
            'validation_status':   'format_error',
            'confidence_change':   'decreased',
            'adjusted_confidence': round(poc3_conf * 0.3, 4),
            'findings':            [f"Code '{raw}' is not a valid integer string."],
            'suggested_actions':   ['human_review'],
            'approved_for_boq':    False,
            'requires_review':     True,
        }

    # ── Partial-code expansion (1 or 2 digit) ────────────────────────────────
    expansion_candidates: List[Dict] = []
    if is_partial:
        expansion_candidates = expand_partial_code(raw, catalog_codes, kb_data)
        findings.append(
            f"Code '{raw}' is {len(raw)}-digit — below the catalog minimum (101). "
            f"Structural finding: POC 3 captures digit-pair adjacency; Israeli sign codes "
            f"require 3-digit triplet detection. This is a structural limitation of "
            f"13_vector_glyph_recognition.py adjacency logic."
        )

    # ── Catalog check ────────────────────────────────────────────────────────
    if format_valid and not is_partial:
        # Direct 3-digit lookup
        in_cat = code_int in catalog_codes
        catalog_matches = [code_int] if in_cat else []
        catalog_status  = 'found' if in_cat else 'not_found'
    elif is_partial:
        cat_hits = [e for e in expansion_candidates if e['in_catalog']]
        catalog_matches = [e['code'] for e in cat_hits]
        if not cat_hits:
            catalog_status = 'not_found'
        elif len(cat_hits) == 1:
            catalog_status = 'partial_match'
        else:
            catalog_status = 'ambiguous'
    else:
        catalog_matches = []
        catalog_status  = 'not_found'

    # ── KB check ─────────────────────────────────────────────────────────────
    if format_valid and not is_partial:
        in_kb_direct = code_int in kb_data
        kb_matches   = [code_int] if in_kb_direct else []
        kb_status    = 'found' if in_kb_direct else 'not_found'
    elif is_partial:
        kb_hits    = [e for e in expansion_candidates if e['in_kb']]
        kb_matches = [e['code'] for e in kb_hits]
        if not kb_hits:
            kb_status = 'not_found'
        elif len(kb_hits) == 1:
            kb_status = 'partial_match'
        else:
            kb_status = 'ambiguous'
    else:
        kb_matches = []
        kb_status  = 'not_found'

    # ── Duplicate detection ───────────────────────────────────────────────────
    dup_occs = [
        oid for oid, codes in occ_to_codes.items()
        if codes and codes[0] == raw and oid != occ_id
    ]
    dup_count = len(dup_occs)
    if dup_count > 0:
        findings.append(
            f"Code '{raw}' appears in {dup_count + 1} OCCs "
            f"({', '.join(sorted([occ_id] + dup_occs))}). "
            "High repetition may indicate a repeated sign type or a systematic POC 3 misread."
        )

    # ── Validation status + confidence ───────────────────────────────────────
    if format_valid and not is_partial:
        if in_series and (code_int in catalog_codes) and (code_int in kb_data):
            v_status         = 'valid'
            confidence_change = 'increased'
            adj_conf          = min(1.0, poc3_conf * 1.1)
        elif in_series and ((code_int in catalog_codes) or (code_int in kb_data)):
            v_status         = 'valid'
            confidence_change = 'unchanged'
            adj_conf          = poc3_conf
        else:
            v_status         = 'suspicious'
            confidence_change = 'decreased'
            adj_conf          = round(poc3_conf * 0.5, 4)
    elif is_partial and expansion_candidates:
        # Has at least one valid-series expansion
        has_cat_or_kb = any(e['in_catalog'] or e['in_kb'] for e in expansion_candidates)
        v_status         = 'partial_match'
        confidence_change = 'unchanged' if has_cat_or_kb else 'decreased'
        adj_conf          = poc3_conf if has_cat_or_kb else round(poc3_conf * 0.6, 4)
    else:
        # Partial with zero valid expansions → suspicious
        v_status         = 'suspicious'
        confidence_change = 'decreased'
        adj_conf          = round(poc3_conf * 0.3, 4)
        findings.append(
            f"Code '{raw}' has NO valid expansion in any Israeli sign series "
            f"({', '.join(str(p * 100 + code_int) for p in range(1, 10) if p * 100 + code_int < 1000)} "
            f"all fall outside valid ranges). Likely a false-positive or misidentified path pair."
        )

    # ── Suggested actions ─────────────────────────────────────────────────────
    actions: List[str] = []
    if v_status == 'valid':
        actions.append('confirm_in_boq_review')
    elif v_status == 'partial_match':
        actions.extend(['resolve_partial_code_manually', 'extend_poc3_to_triplet_detection'])
    elif v_status == 'suspicious':
        actions.extend(['flag_for_human_review', 'extend_poc3_to_triplet_detection'])
    if dup_count > 0:
        actions.append('check_duplicate_chain')
    if not evidence['evidence_ok']:
        actions.append('regenerate_crops')

    # ── Expansion detail for findings ─────────────────────────────────────────
    if expansion_candidates:
        cat_codes = [e['code'] for e in expansion_candidates if e['in_catalog']]
        kb_codes_  = [e['code'] for e in expansion_candidates if e['in_kb']]
        findings.append(
            f"Expansion candidates for '{raw}': "
            f"catalog hits={cat_codes}, KB hits={kb_codes_}."
        )
        for e in expansion_candidates:
            name_str = f" ({e['name']})" if e['name'] else ''
            findings.append(
                f"  → {e['code']} [{e['series']}]{name_str} "
                f"— catalog={'✓' if e['in_catalog'] else '✗'}, "
                f"kb={'✓' if e['in_kb'] else '✗'}"
            )
    elif is_partial:
        findings.append(
            f"No valid-series expansions found for '{raw}' in any prefix 1–9."
        )

    return {
        'occurrence_id':        occ_id,
        'poc3_code':            raw,
        'poc3_confidence':      poc3_conf,
        'format_valid':         format_valid and not is_partial,
        'is_partial_code':      is_partial,
        'in_series_range':      in_series if (format_valid and not is_partial) else None,
        'catalog_match_status': catalog_status,
        'catalog_matches':      catalog_matches,
        'kb_match_status':      kb_status,
        'kb_matches':           kb_matches,
        'expansion_candidates': expansion_candidates,
        'duplicate_count':      dup_count,
        'duplicate_occs':       sorted(dup_occs),
        'evidence':             evidence,
        'validation_status':    v_status,
        'confidence_change':    confidence_change,
        'adjusted_confidence':  round(adj_conf, 4),
        'findings':             findings,
        'suggested_actions':    actions,
        'approved_for_boq':     False,
        'requires_review':      True,
    }


# ── Markdown output ────────────────────────────────────────────────────────────

STATUS_EMOJI = {
    'valid':              '✅',
    'partial_match':      '⚠️',
    'suspicious':         '🚨',
    'no_code_candidate':  '⬜',
    'format_error':       '❌',
}

CONF_EMOJI = {
    'unchanged':  '→',
    'increased':  '↑',
    'decreased':  '↓',
}


def write_md(results: List[Dict], meta: Dict, path: Path) -> None:
    lines: List[str] = []
    a = lines.append

    a('# Sign Plausibility Validation Report')
    a(f"\nGenerated: {meta['generated_at']}")
    a(f"Source: `{meta['source_file']}`  |  Candidates validated: {meta['n_candidates']}\n")
    a('> **Research-only.** `approved_for_boq` remains `false` on all items.')
    a('> No output from this layer is approved BOQ data.\n')
    a('---\n')

    # Summary table
    a('## Summary\n')
    a('| Status | Count |')
    a('|--------|-------|')
    for status, count in meta['status_counts'].items():
        emoji = STATUS_EMOJI.get(status, '')
        a(f'| {emoji} {status} | {count} |')
    a('')

    a('| Confidence Change | Count |')
    a('|-------------------|-------|')
    for ch, cnt in meta['confidence_change_counts'].items():
        a(f'| {CONF_EMOJI.get(ch,"")} {ch} | {cnt} |')
    a('')

    a(f"**Structural finding:** {meta['structural_finding']}\n")
    a('---\n')

    # Per-OCC detail
    a('## Per-OCC Validation Results\n')
    for r in results:
        occ     = r['occurrence_id']
        v_st    = r['validation_status']
        emoji   = STATUS_EMOJI.get(v_st, '')
        code    = r['poc3_code'] if r['poc3_code'] is not None else '—'
        a(f"### {emoji} {occ} — `{code}`\n")
        a(f"- **Validation status:** `{v_st}`")
        a(f"- **POC 3 confidence:** {r['poc3_confidence']:.4f}  {CONF_EMOJI.get(r['confidence_change'],'')} adjusted: {r['adjusted_confidence']:.4f}")
        if r['poc3_code'] is not None:
            a(f"- **Format valid (3-digit):** {r.get('format_valid', '—')}")
            a(f"- **Is partial code:** {r.get('is_partial_code', False)}")
            if r.get('in_series_range') is not None:
                a(f"- **In series range:** {r['in_series_range']}")
            a(f"- **Catalog match:** `{r['catalog_match_status']}` → {r['catalog_matches'] or '[]'}")
            a(f"- **KB match:** `{r['kb_match_status']}` → {r['kb_matches'] or '[]'}")
            a(f"- **Duplicate count:** {r['duplicate_count']}"
              + (f"  (shared with {', '.join(r['duplicate_occs'])})" if r['duplicate_occs'] else ''))
        a(f"- **Evidence present:** {'yes' if r['evidence']['evidence_ok'] else 'no'} ({r['evidence']['n_present']} file(s))")
        if r['findings']:
            a('\n**Findings:**')
            for f in r['findings']:
                a(f'- {f}')
        if r['suggested_actions']:
            a('\n**Suggested actions:** ' + ', '.join(f'`{x}`' for x in r['suggested_actions']))
        a('')

    # Structural finding section
    a('---\n')
    a('## Structural Finding: POC 3 Adjacency Limitation\n')
    a(meta['structural_finding_detail'])
    a('')

    # Future validators
    a('---\n')
    a('## Future Validators (not yet implemented)\n')
    future = [
        ('Scale Validator',          'Cross-check measured dimensions against expected sign sizes from ordinance table.'),
        ('Taxonomy Validator',        'Verify G-005/G-006/G-011 element groups against known infrastructure taxonomies.'),
        ('Element Group Validator',   'Confirm element group classifications match visual overlay and path statistics.'),
        ('BOQ Consistency Validator', 'Check that sign counts + pole counts + element counts form a plausible assembly.'),
        ('Contradiction Detector',    'Flag OCCs where POC 1/2/3 results disagree above threshold.'),
        ('Red Flag Detector',         'Surface OCCs with extreme confidence drops, zero evidence, or no-code across all POCs.'),
        ('Legend Cross-Validator',    'Once legend extraction is complete, validate each recognized code against legend vocabulary.'),
    ]
    for name, desc in future:
        a(f'- **{name}:** {desc}')
    a('')
    a('---\n')
    a('*End of report.*\n')

    path.write_text('\n'.join(lines), encoding='utf-8')


# ── HTML output ────────────────────────────────────────────────────────────────

_STATUS_COLOR = {
    'valid':             '#28a745',
    'partial_match':     '#fd7e14',
    'suspicious':        '#dc3545',
    'no_code_candidate': '#6c757d',
    'format_error':      '#dc3545',
}

_CONF_COLOR = {
    'unchanged': '#6c757d',
    'increased': '#28a745',
    'decreased': '#dc3545',
}


def _badge(text: str, color: str) -> str:
    return (
        f'<span style="display:inline-block;padding:2px 8px;border-radius:4px;'
        f'background:{color};color:#fff;font-size:0.82em;font-weight:600">{text}</span>'
    )


def write_html(results: List[Dict], meta: Dict, path: Path) -> None:
    status_rows = ''.join(
        f'<tr><td>{STATUS_EMOJI.get(s,"")} {s}</td><td>{c}</td></tr>'
        for s, c in meta['status_counts'].items()
    )
    conf_rows = ''.join(
        f'<tr><td>{CONF_EMOJI.get(ch,"")} {ch}</td><td>{cnt}</td></tr>'
        for ch, cnt in meta['confidence_change_counts'].items()
    )

    cards_html = ''
    for r in results:
        occ    = r['occurrence_id']
        v_st   = r['validation_status']
        code   = r['poc3_code'] if r['poc3_code'] is not None else '—'
        color  = _STATUS_COLOR.get(v_st, '#6c757d')
        cc     = r['confidence_change']
        cc_col = _CONF_COLOR.get(cc, '#6c757d')

        exp_rows = ''
        for e in r.get('expansion_candidates', []):
            cat_badge = _badge('catalog ✓', '#28a745') if e['in_catalog'] else _badge('catalog ✗', '#6c757d')
            kb_badge  = _badge('KB ✓', '#28a745')     if e['in_kb']      else _badge('KB ✗', '#6c757d')
            name_str  = e['name'] or '—'
            exp_rows += (
                f'<tr><td><strong>{e["code"]}</strong></td>'
                f'<td>{e["series"] or "—"}</td>'
                f'<td>{name_str}</td>'
                f'<td>{cat_badge} {kb_badge}</td></tr>'
            )

        exp_table = ''
        if exp_rows:
            exp_table = (
                '<h5 style="margin:8px 0 4px">Expansion candidates</h5>'
                '<table style="width:100%;border-collapse:collapse;font-size:0.85em">'
                '<tr style="background:#f0f0f0"><th>Code</th><th>Series</th><th>Name</th><th>Match</th></tr>'
                + exp_rows + '</table>'
            )

        findings_html = ''
        if r['findings']:
            items = ''.join(f'<li>{f}</li>' for f in r['findings'])
            findings_html = f'<ul style="margin:6px 0 0 0;font-size:0.85em">{items}</ul>'

        actions_html = ''
        if r['suggested_actions']:
            badges = ' '.join(
                f'<code style="background:#e9ecef;padding:1px 5px;border-radius:3px">{x}</code>'
                for x in r['suggested_actions']
            )
            actions_html = f'<p style="margin:6px 0 0 0;font-size:0.83em"><strong>Actions:</strong> {actions_html}{badges}</p>'

        dup_str = ''
        if r['duplicate_count'] > 0:
            dup_str = (
                f'<span style="color:#856404;font-size:0.82em"> '
                f'(× {r["duplicate_count"] + 1} OCCs share this code)</span>'
            )

        cards_html += f'''
<div style="border:1px solid {color};border-radius:6px;margin:12px 0;overflow:hidden">
  <div style="background:{color};color:#fff;padding:8px 14px;display:flex;justify-content:space-between;align-items:center">
    <strong>{occ}</strong>
    <span>code: <code style="background:rgba(255,255,255,0.2);padding:1px 6px;border-radius:3px">{code}</code></span>
  </div>
  <div style="padding:12px 14px">
    <table style="border-collapse:collapse;font-size:0.88em;margin-bottom:8px">
      <tr><td style="padding:2px 12px 2px 0"><strong>Status</strong></td>
          <td>{_badge(v_st, color)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0"><strong>POC 3 confidence</strong></td>
          <td>{r["poc3_confidence"]:.4f}
              <span style="color:{cc_col};font-weight:600"> {CONF_EMOJI.get(cc,"")} {cc}</span>
              → {r["adjusted_confidence"]:.4f}</td></tr>
      <tr><td style="padding:2px 12px 2px 0"><strong>Catalog match</strong></td>
          <td>{r["catalog_match_status"]} {r["catalog_matches"] or ""}</td></tr>
      <tr><td style="padding:2px 12px 2px 0"><strong>KB match</strong></td>
          <td>{r["kb_match_status"]} {r["kb_matches"] or ""}</td></tr>
      <tr><td style="padding:2px 12px 2px 0"><strong>Duplicates</strong></td>
          <td>{r["duplicate_count"]} {dup_str}</td></tr>
      <tr><td style="padding:2px 12px 2px 0"><strong>Evidence files</strong></td>
          <td>{"✓ present" if r["evidence"]["evidence_ok"] else "✗ missing"}
              ({r["evidence"]["n_present"]})</td></tr>
    </table>
    {exp_table}
    {findings_html}
    {actions_html}
  </div>
</div>'''

    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Sign Plausibility Validation Report</title>
<style>
  body {{font-family:system-ui,-apple-system,sans-serif;max-width:900px;margin:30px auto;padding:0 20px;color:#333}}
  h1 {{border-bottom:2px solid #333;padding-bottom:8px}}
  h2 {{margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:4px}}
  table {{border-collapse:collapse;width:100%}}
  th,td {{border:1px solid #ddd;padding:6px 10px;text-align:left}}
  th {{background:#f5f5f5}}
  .meta {{color:#666;font-size:0.9em;margin-bottom:12px}}
  .warning-box {{background:#fff3cd;border:1px solid #ffc107;border-radius:5px;padding:10px 14px;margin:12px 0}}
  .structural-box {{background:#f8d7da;border:1px solid #f5c2c7;border-radius:5px;padding:12px 16px;margin:12px 0}}
  .future-ul li {{margin:6px 0}}
  code {{font-family:monospace}}
</style>
</head>
<body>
<h1>Sign Plausibility Validation Report</h1>
<p class="meta">Generated: {meta["generated_at"]} &nbsp;|&nbsp;
Source: <code>{meta["source_file"]}</code> &nbsp;|&nbsp;
Candidates validated: {meta["n_candidates"]}</p>

<div class="warning-box">
  <strong>Research-only.</strong>
  <code>approved_for_boq</code> remains <code>false</code> on all items.
  No output from this layer is approved BOQ data.
</div>

<h2>Summary</h2>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
  <div>
    <h3>By validation status</h3>
    <table>{status_rows}</table>
  </div>
  <div>
    <h3>By confidence change</h3>
    <table>{conf_rows}</table>
  </div>
</div>

<div class="structural-box">
  <strong>Structural finding:</strong> {meta["structural_finding"]}
</div>

<h2>Per-OCC Validation Results</h2>
{cards_html}

<h2>Structural Finding: POC 3 Adjacency Limitation</h2>
<div class="structural-box">
  <pre style="white-space:pre-wrap;font-size:0.87em;margin:0">{meta["structural_finding_detail"]}</pre>
</div>

<h2>Future Validators (not yet implemented)</h2>
<ul class="future-ul">
  <li><strong>Scale Validator:</strong> Cross-check measured dimensions against expected sign sizes from ordinance table.</li>
  <li><strong>Taxonomy Validator:</strong> Verify G-005/G-006/G-011 element groups against known infrastructure taxonomies.</li>
  <li><strong>Element Group Validator:</strong> Confirm element group classifications match visual overlay and path statistics.</li>
  <li><strong>BOQ Consistency Validator:</strong> Check that sign counts + pole counts + element counts form a plausible assembly.</li>
  <li><strong>Contradiction Detector:</strong> Flag OCCs where POC 1/2/3 results disagree above threshold.</li>
  <li><strong>Red Flag Detector:</strong> Surface OCCs with extreme confidence drops, zero evidence, or no-code across all POCs.</li>
  <li><strong>Legend Cross-Validator:</strong> Once legend extraction is complete, validate each recognized code against legend vocabulary.</li>
</ul>

<p style="color:#999;font-size:0.8em;margin-top:32px;border-top:1px solid #eee;padding-top:8px">
End of report. Research pipeline — no approved BOQ output.
</p>
</body>
</html>'''

    path.write_text(html, encoding='utf-8')


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    t0 = time.time()
    print('=' * 60)
    print('Validation Layer v1 — Sign Plausibility')
    print('=' * 60)

    # Load inputs
    print(f'\n[Load] Review queue: {REVIEW_QUEUE}')
    if not REVIEW_QUEUE.exists():
        print('[Error] review_queue.json not found. Run 19_run_plan_scanner_pipeline.py first.')
        return
    with REVIEW_QUEUE.open(encoding='utf-8') as fh:
        queue: List[Dict] = json.load(fh)
    print(f'[Load] {len(queue)} total OCC records in queue')

    candidates = [r for r in queue if r.get('auto_result', {}).get('poc3_tier') == 'MEDIUM']
    print(f'[Load] {len(candidates)} MEDIUM-tier candidates selected for validation')

    print(f'\n[Load] Sign index: {SIGN_INDEX}')
    kb_data = parse_sign_index(SIGN_INDEX)
    print(f'[Load] {len(kb_data)} valid sign codes in knowledge base')

    print(f'[Load] Sign catalog: {CATALOG_DIR}')
    catalog_codes = load_catalog_codes(CATALOG_DIR)
    print(f'[Load] {len(catalog_codes)} sign images in catalog')

    # Build occ→codes index for duplicate detection (across ALL candidates)
    occ_to_codes: Dict[str, List[str]] = {
        r['occurrence_id']: r['auto_result'].get('poc3_candidates', [])
        for r in candidates
    }

    # Validate
    print('\n[Validate] Running validators ...')
    results: List[Dict] = []
    for item in candidates:
        r = validate_one(item, occ_to_codes, catalog_codes, kb_data)
        results.append(r)
        v_st   = r['validation_status']
        code   = r['poc3_code'] if r['poc3_code'] is not None else '—'
        emoji  = STATUS_EMOJI.get(v_st, '')
        print(f'  {r["occurrence_id"]}  code={code:>4}  {emoji} {v_st}  '
              f'conf {r["poc3_confidence"]:.3f} {CONF_EMOJI.get(r["confidence_change"],"?")} '
              f'{r["adjusted_confidence"]:.3f}')

    # Status counts
    from collections import Counter
    status_counts = dict(Counter(r['validation_status'] for r in results))
    conf_counts   = dict(Counter(r['confidence_change'] for r in results))

    structural_finding = (
        'POC 3 (13_vector_glyph_recognition.py) detects adjacent digit-path PAIRS — '
        'producing 2-digit codes (e.g. "33", "86"). '
        'Israeli traffic sign codes are 3-digit (101–935). '
        'All current MEDIUM candidates with extracted codes are partial (2-digit). '
        'Fix required: extend adjacency detection to triplet groups to capture full 3-digit codes.'
    )
    structural_detail = (
        'Root cause: 13_vector_glyph_recognition.py groups adjacent digit-candidate paths\n'
        'into pairs (size=2). A 3-digit code "133" produces three adjacent paths; the\n'
        'current logic only captures the closest pair, yielding "33".\n\n'
        'Impact: All 6 OCCs with code "33" may represent sign 133, 433, 633, or 933.\n'
        'The 1 OCC with code "86" maps to no valid 3-digit code in any series.\n\n'
        'Recommended fix: In 13_vector_glyph_recognition.py, extend _find_adjacent_groups()\n'
        'to scan for triples (size=3) within the same x-proximity threshold, and re-run POC 3.\n\n'
        'This is a structural pipeline limitation, not a labeling error.\n'
        'No human label changes are required — fix the adjacency logic first.'
    )

    meta = {
        'generated_at':              datetime.now().isoformat(timespec='seconds'),
        'source_file':               str(REVIEW_QUEUE.relative_to(ROOT)),
        'n_candidates':              len(candidates),
        'n_with_code':               sum(1 for r in results if r['poc3_code'] is not None),
        'n_no_code':                 sum(1 for r in results if r['poc3_code'] is None),
        'status_counts':             status_counts,
        'confidence_change_counts':  conf_counts,
        'structural_finding':        structural_finding,
        'structural_finding_detail': structural_detail,
        'kb_code_count':             len(kb_data),
        'catalog_code_count':        len(catalog_codes),
        'approved_for_boq':          False,
    }

    # Write outputs
    OUTPUTS.mkdir(exist_ok=True)
    print(f'\n[Output] Writing {OUT_JSON} ...')
    payload = {'meta': meta, 'results': results}
    with OUT_JSON.open('w', encoding='utf-8') as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)

    print(f'[Output] Writing {OUT_MD} ...')
    write_md(results, meta, OUT_MD)

    print(f'[Output] Writing {OUT_HTML} ...')
    write_html(results, meta, OUT_HTML)

    elapsed = round(time.time() - t0, 1)

    print('\n' + '=' * 60)
    print('VALIDATION LAYER v1 COMPLETE')
    print('=' * 60)
    print(f'  Candidates validated : {len(candidates)}')
    print(f'  With extracted code  : {meta["n_with_code"]}')
    print(f'  Without code         : {meta["n_no_code"]}')
    print(f'  Status breakdown     : {status_counts}')
    print(f'  Confidence changes   : {conf_counts}')
    print(f'  Elapsed              : {elapsed}s')
    print()
    print('  Structural finding:')
    for line in structural_finding.split('. '):
        if line:
            print(f'    {line.strip()}.')
    print()
    print(f'  Outputs:')
    print(f'    {OUT_JSON.relative_to(ROOT)}')
    print(f'    {OUT_MD.relative_to(ROOT)}')
    print(f'    {OUT_HTML.relative_to(ROOT)}')
    print()
    print('  REMINDER: approved_for_boq is false on all items.')
    print('  All codes require human validation before operational use.')
    print('=' * 60)


if __name__ == '__main__':
    main()
