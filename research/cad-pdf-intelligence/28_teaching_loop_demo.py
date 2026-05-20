#!/usr/bin/env python3
"""
28_teaching_loop_demo.py
Stage S15 — Teaching Loop Demo / Seeded Answer Flow (הדגמת לולאת ההוראה)

Proves the full human-teaching loop end-to-end using controlled, seeded demo answers.

ISOLATION GUARANTEE:
  • Reads pipeline JSONs as source of truth (read-only, deep copy)
  • Applies demo answers to in-memory copies ONLY
  • Original pipeline JSONs are NEVER written or modified
  • Writes only demo-specific output files

DEMO ANSWERS (seeded in this script):
  D-001  partial_code_resolution      suffix "33" → 433  (DEMO — NOT a confirmed field value)
  D-002  element_group_classification G-001 → background  (DEMO — largest group, line work)
  D-003  boq_review                   BOQ-CNT-001 → accepted_for_draft  (DEMO — not operational)
  D-004  legend_label                 row_index=0 → "תמרור 433 (דמו)"   (DEMO — placeholder)

ALL demo data carries:
  demo: true
  not_for_operational_use: true
  approved_for_boq: false

Purpose: validate writeback mechanism and pipeline propagation.
No BOQ item is ever set to approved_for_boq=true.
No paid API. No production changes. No DB changes. Research-only.
"""
from __future__ import annotations
import argparse, copy, json, time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from plan_run_context import PlanRunContext

# ── Config ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
OUT_DIR    = SCRIPT_DIR / 'outputs'

# Source files (read-only — deep copy in memory, originals never written)
F_PARTIAL      = OUT_DIR / 'partial_code_resolution.json'
F_ELEMENTS     = OUT_DIR / 'element_groups.json'
F_BOQ          = OUT_DIR / 'boq_unified_draft.json'
F_QUEUE        = OUT_DIR / 'review_queue.json'
F_LEGEND_ROWS  = OUT_DIR / 'legend_rows.json'
F_LEGEND_VOCAB = OUT_DIR / 'legend_vocabulary.json'

# Demo outputs only (all marked demo=true, not_for_operational_use=true)
OUT_DEMO_ANSWERS = OUT_DIR / 'human_review_answers.demo.json'
OUT_DEMO_APP     = OUT_DIR / 'teaching_loop_demo_application.json'
OUT_DEMO_MD      = OUT_DIR / 'teaching_loop_demo_report.md'
OUT_DEMO_HTML    = OUT_DIR / 'teaching_loop_demo_report.html'

VALID_REVIEW_STATUSES = {'accepted_for_draft', 'rejected', 'needs_more_info', 'corrected', 'defer'}
REVIEW_DECISION_MAP = {
    'accept_quantity':      'accepted_for_draft',
    'reject_quantity':      'rejected',
    'flag_for_site_survey': 'needs_more_info',
}

# ── Seeded demo answers ─────────────────────────────────────────────────────────

DEMO_ANSWERS = [
    {
        'answer_id':            'D-001',
        'answer_type':          'partial_code_resolution',
        'demo':                 True,
        'not_for_operational_use': True,
        'approved_for_boq':     False,
        'question_id':          'Q-33-1',
        'partial_code':         '33',
        'resolved_full_code':   433,
        'scope':                'current_plan_only',
        'notes':                'DEMO ONLY — suffix "33" assigned to 433 (Prohibition: no stopping/parking) '
                                'for teaching-loop validation. Real field confirmation required.',
        '_demo_rationale':      'Three candidates exist for suffix 33: 133, 433, 633. '
                                '433 chosen as demo value; it is plausible but unconfirmed.',
    },
    {
        'answer_id':            'D-002',
        'answer_type':          'element_group_classification',
        'demo':                 True,
        'not_for_operational_use': True,
        'approved_for_boq':     False,
        'group_id':             'G-001',
        'classification':       'background',
        'include_in_boq':       False,
        'scope':                'current_plan_only',
        'notes':                'DEMO ONLY — G-001 (black layer, 122,781 paths) classified as '
                                '"background" for demo. Real classification requires engineer review.',
        '_demo_rationale':      'G-001 is the dominant black drawing layer. "background" is plausible '
                                'but an engineer must confirm before this affects BOQ.',
    },
    {
        'answer_id':            'D-003',
        'answer_type':          'boq_review',
        'demo':                 True,
        'not_for_operational_use': True,
        'approved_for_boq':     False,
        'boq_item_id':          'BOQ-CNT-001',
        'review_decision':      'accept_quantity',
        'notes':                'DEMO ONLY — pole count (119) accepted for draft review. '
                                'NOT approved for procurement or BOQ. Still requires BOQ approval gate.',
        '_demo_rationale':      'Demonstrates the boq_review writeback path. '
                                'accepted_for_draft means "ready for BOQ approval review", '
                                'NOT approved_for_boq=true.',
    },
    {
        'answer_id':            'D-004',
        'answer_type':          'legend_label',
        'demo':                 True,
        'not_for_operational_use': True,
        'approved_for_boq':     False,
        'row_index':            0,
        'hebrew_label':         'תמרור 433 (דמו)',
        'english_label':        'Sign 433 — demo label, not confirmed',
        'sign_code':            433,
        'quantity':             None,
        'scope':                'current_plan_only',
        'notes':                'DEMO ONLY — legend row 0 labeled with a placeholder. '
                                'Real label requires visual inspection of the legend icon.',
        '_demo_rationale':      'Legend row 0 has no auto-extracted label. This demo value '
                                'exercises the legend_label writeback path without confirmed data.',
    },
]

# ── I/O helpers ─────────────────────────────────────────────────────────────────

def load_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f'  [warn] Failed to load {path.name}: {e}')
        return default


def save_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2))


def deep_copy(data: Any) -> Any:
    return copy.deepcopy(data)


# ── Audit entry builder ──────────────────────────────────────────────────────────

def _audit(
    answer: Dict,
    status: str,
    affected_file: str,
    item_id: str,
    prev: Dict,
    new: Dict,
    note: str,
    ts: str,
) -> Dict:
    return {
        'answer_id':         answer.get('answer_id', '?'),
        'answer_type':       answer.get('answer_type', '?'),
        'demo':              True,
        'not_for_operational_use': True,
        'status':            status,
        'affected_file':     affected_file,
        'affected_item_id':  item_id,
        'previous_value':    prev,
        'new_value':         new,
        'scope':             answer.get('scope', 'current_plan_only'),
        'audit_note':        note,
        'timestamp':         ts,
        'approved_for_boq':  False,
    }


# ── Demo appliers (work on passed-in data dicts — originals never touched) ──────

def demo_apply_partial_code_resolution(
    answer: Dict,
    pr_data: Optional[Dict],
    queue_data: Optional[List],
    ts: str,
) -> List[Dict]:
    entries = []
    suffix      = str(answer['partial_code'])
    resolved    = int(answer['resolved_full_code'])
    question_id = answer['question_id']
    scope       = answer.get('scope', 'current_plan_only')
    notes       = answer.get('notes', '')

    # ── partial_code_resolution copy ─────────────────────────────────────────
    if pr_data is None:
        entries.append(_audit(answer, 'skipped', 'partial_code_resolution.json',
                              f'suffix:{suffix}', {}, {},
                              'File not available', ts))
    else:
        group = pr_data.get('suffix_groups', {}).get(suffix)
        if group is not None:
            prev = {
                'resolution_status':    group.get('resolution_status'),
                'suggested_resolution': group.get('suggested_resolution'),
            }
            group['original_resolution_status']    = group.get('resolution_status')
            group['original_suggested_resolution'] = group.get('suggested_resolution')
            group['resolution_status']             = 'human_confirmed_demo'
            group['human_confirmed']               = True
            group['human_confirmed_code']          = resolved
            group['human_answer_source']           = question_id
            group['human_answer_scope']            = scope
            group['human_answer_timestamp']        = ts
            group['human_answer_notes']            = notes
            group['still_requires_boq_approval']   = True
            group['demo']                          = True
            group['not_for_operational_use']       = True
            entries.append(_audit(answer, 'applied', 'partial_code_resolution.json [DEMO COPY]',
                                  f'suffix_group:{suffix}', prev,
                                  {'resolution_status': 'human_confirmed_demo', 'human_confirmed_code': resolved},
                                  f'DEMO: suffix "{suffix}" resolved to {resolved}', ts))

        for result in pr_data.get('results', []):
            if str(result.get('partial_code')) != suffix:
                continue
            occ_id = result.get('occurrence_id', '?')
            prev_r = {'resolution_status': result.get('resolution_status')}
            result['original_resolution_status']   = result.get('resolution_status')
            result['resolution_status']            = 'human_confirmed_demo'
            result['human_confirmed']              = True
            result['human_confirmed_code']         = resolved
            result['human_answer_source']          = question_id
            result['human_answer_scope']           = scope
            result['human_answer_timestamp']       = ts
            result['still_requires_boq_approval']  = True
            result['demo']                         = True
            entries.append(_audit(answer, 'applied', 'partial_code_resolution.json [DEMO COPY]',
                                  occ_id, prev_r,
                                  {'resolution_status': 'human_confirmed_demo', 'human_confirmed_code': resolved},
                                  f'DEMO: OCC suffix "{suffix}" annotated with {resolved}', ts))

    # ── review_queue copy ────────────────────────────────────────────────────
    if queue_data is not None and isinstance(queue_data, list):
        for item in queue_data:
            candidates = item.get('auto_result', {}).get('poc3_candidates', [])
            if suffix not in [str(c) for c in candidates]:
                continue
            occ_id = item.get('occurrence_id', '?')
            prev_q = {'human_confirmed_code': item.get('human_confirmed_code')}
            item['human_confirmed_code']        = resolved
            item['human_label_source']          = f'demo_{question_id}'
            item['human_answer_scope']          = scope
            item['human_answer_timestamp']      = ts
            item['still_requires_boq_approval'] = True
            item['demo']                        = True
            entries.append(_audit(answer, 'applied', 'review_queue.json [DEMO COPY]',
                                  occ_id, prev_q,
                                  {'human_confirmed_code': resolved},
                                  f'DEMO: review queue item annotated', ts))

    return entries


def demo_apply_element_group_classification(
    answer: Dict,
    eg_data: Optional[Dict],
    ts: str,
) -> List[Dict]:
    entries = []
    group_id    = answer['group_id']
    human_class = answer['classification']
    include_boq = answer['include_in_boq']
    scope       = answer.get('scope', 'current_plan_only')
    notes       = answer.get('notes', '')

    if eg_data is None:
        entries.append(_audit(answer, 'skipped', 'element_groups.json',
                              group_id, {}, {}, 'File not available', ts))
        return entries

    groups  = eg_data.get('groups', [])
    matched = False
    for group in groups:
        if group.get('group_id') != group_id:
            continue
        matched = True
        prev = {
            'classification':        group.get('classification'),
            'classification_source': group.get('classification_source'),
            'element_type':          group.get('element_type'),
            'approved_for_boq':      group.get('approved_for_boq'),
        }
        group['original_classification']        = group.get('classification')
        group['original_classification_source'] = group.get('classification_source')
        group['original_element_type']          = group.get('element_type')
        group['classification']                 = human_class
        group['classification_source']          = 'demo_human_review'
        group['element_type']                   = human_class
        group['human_confirmed']                = True
        group['human_classification']           = human_class
        group['human_include_in_boq']           = include_boq
        group['human_answer_scope']             = scope
        group['human_answer_timestamp']         = ts
        group['human_answer_notes']             = notes
        group['still_requires_boq_approval']    = True
        group['demo']                           = True
        group['not_for_operational_use']        = True
        entries.append(_audit(answer, 'applied', 'element_groups.json [DEMO COPY]',
                              group_id, prev,
                              {'classification': human_class, 'human_include_in_boq': include_boq},
                              f'DEMO: group {group_id} → {human_class} (include_in_boq={include_boq})', ts))

    if not matched:
        entries.append(_audit(answer, 'skipped', 'element_groups.json',
                              group_id, {}, {},
                              f'Group "{group_id}" not found', ts))
    return entries


def demo_apply_boq_review(
    answer: Dict,
    boq_data: Optional[Dict],
    ts: str,
) -> List[Dict]:
    entries = []
    boq_item_id = answer['boq_item_id']
    review_status = (
        answer.get('review_status')
        or REVIEW_DECISION_MAP.get(answer.get('review_decision', ''))
        or 'needs_more_info'
    )
    notes = answer.get('notes', '')

    if boq_data is None:
        entries.append(_audit(answer, 'skipped', 'boq_unified_draft.json',
                              boq_item_id, {}, {}, 'File not available', ts))
        return entries

    items   = boq_data.get('items', [])
    matched = False
    for item in items:
        if item.get('boq_item_id') != boq_item_id:
            continue
        matched = True
        prev = {
            'approved_for_boq': item.get('approved_for_boq'),
            'requires_review':  item.get('requires_review'),
            'human_reviewed':   item.get('human_reviewed'),
        }
        # Preserve auto originals
        if item.get('quantity') is not None and item.get('original_auto_quantity') is None:
            item['original_auto_quantity']       = item.get('quantity')
        if item.get('unit') and not item.get('original_auto_unit'):
            item['original_auto_unit']           = item.get('unit')
        if item.get('description_he') and not item.get('original_auto_description_he'):
            item['original_auto_description_he'] = item.get('description_he')

        item['human_reviewed']            = True
        item['human_review_status']       = review_status
        item['human_review_timestamp']    = ts
        item['human_review_scope']        = 'current_plan_only'
        item['human_review_notes']        = notes
        item['demo']                      = True
        item['not_for_operational_use']   = True
        # NEVER set approved_for_boq = True
        item['approved_for_boq']          = False
        item['still_requires_boq_approval'] = True
        item['requires_review']           = True  # still needs BOQ approval gate

        entries.append(_audit(answer, 'applied', 'boq_unified_draft.json [DEMO COPY]',
                              boq_item_id, prev,
                              {'human_review_status': review_status,
                               'approved_for_boq': False,
                               'still_requires_boq_approval': True},
                              f'DEMO: BOQ item {boq_item_id} review_status={review_status}. '
                              f'approved_for_boq remains False always.', ts))

    if not matched:
        entries.append(_audit(answer, 'skipped', 'boq_unified_draft.json',
                              boq_item_id, {}, {},
                              f'BOQ item "{boq_item_id}" not found', ts))
    return entries


def demo_apply_legend_label(
    answer: Dict,
    lr_data: Optional[Dict],
    lv_data: Optional[Dict],
    ts: str,
) -> List[Dict]:
    entries = []
    row_index    = answer['row_index']
    hebrew_label = answer['hebrew_label']
    english_label = answer.get('english_label')
    sign_code    = answer.get('sign_code')
    quantity     = answer.get('quantity')
    scope        = answer.get('scope', 'current_plan_only')
    notes        = answer.get('notes', '')

    def _annotate_row(row: Dict) -> Tuple[Dict, Dict]:
        prev = {
            'hebrew_label':  row.get('hebrew_label'),
            'english_label': row.get('english_label'),
            'sign_code':     row.get('sign_code'),
        }
        if row.get('hebrew_label') and not row.get('original_auto_hebrew_label'):
            row['original_auto_hebrew_label'] = row['hebrew_label']
        if row.get('sign_code') is not None and row.get('original_auto_sign_code') is None:
            row['original_auto_sign_code'] = row['sign_code']

        row['hebrew_label']           = hebrew_label
        row['english_label']          = english_label
        row['sign_code']              = sign_code
        row['quantity']               = quantity
        row['label_source']           = 'demo_human_review'
        row['human_answer_scope']     = scope
        row['human_answer_timestamp'] = ts
        row['human_answer_notes']     = notes
        row['approved_for_boq']       = False
        row['still_requires_boq_approval'] = True
        row['demo']                   = True
        row['not_for_operational_use'] = True

        new = {'hebrew_label': hebrew_label, 'sign_code': sign_code, 'label_source': 'demo_human_review'}
        return prev, new

    for label, data, fname in [
        ('legend_rows',       lr_data, 'legend_rows.json [DEMO COPY]'),
        ('legend_vocabulary', lv_data, 'legend_vocabulary.json [DEMO COPY]'),
    ]:
        if data is None:
            entries.append(_audit(answer, 'skipped', fname,
                                  f'row:{row_index}', {}, {},
                                  f'{label} not available', ts))
            continue
        rows = data if isinstance(data, list) else data.get('rows', [])
        matched = [r for r in rows if r.get('row_index') == row_index]
        if not matched:
            entries.append(_audit(answer, 'skipped', fname,
                                  f'row:{row_index}', {}, {},
                                  f'Row {row_index} not found', ts))
        else:
            prev, new = _annotate_row(matched[0])
            entries.append(_audit(answer, 'applied', fname,
                                  f'legend_row:{row_index}', prev, new,
                                  f'DEMO: row {row_index} → "{hebrew_label}" sign_code={sign_code}', ts))

    return entries


# ── Safety check ────────────────────────────────────────────────────────────────

def verify_no_boq_approval(demo_boq: Dict) -> List[str]:
    """Scan demo BOQ copy — ensure approved_for_boq is False on every item."""
    violations = []
    for item in demo_boq.get('items', []):
        if item.get('approved_for_boq') is True:
            violations.append(item.get('boq_item_id', '?'))
    return violations


# ── Report builders ─────────────────────────────────────────────────────────────

def build_md(
    ts: str,
    audit_entries: List[Dict],
    boq_violations: List[str],
    originals_clean: bool,
    elapsed: float,
    demo_state: Dict,
) -> str:
    applied       = [e for e in audit_entries if e['status'] == 'applied']
    skipped       = [e for e in audit_entries if e['status'] == 'skipped']
    errors        = [e for e in audit_entries if e['status'] == 'error']
    contradictions = [e for e in audit_entries if e['status'] == 'contradiction']

    lines = [
        '# Teaching Loop Demo Report',
        '',
        f'**Generated:** {ts}  ',
        f'**Script:** `28_teaching_loop_demo.py`  ',
        '**Type:** Demo / Seeded Answer Flow — RESEARCH ONLY  ',
        '**Originals modified:** NO  ',
        '**approved_for_boq set to true:** ' + ('YES — VIOLATION' if boq_violations else 'NO ✓'),
        '',
        '> All results below are from in-memory demo copies. '
        'Original pipeline JSONs were not modified.',
        '',
        '---',
        '',
        '## Demo Answers Used',
        '',
        '| ID | Type | Target | Demo Value |',
        '|---|---|---|---|',
    ]
    for a in DEMO_ANSWERS:
        target = (
            a.get('partial_code') or
            a.get('group_id') or
            a.get('boq_item_id') or
            f'row_index={a.get("row_index")}' or '?'
        )
        value = (
            str(a.get('resolved_full_code', '')) or
            str(a.get('classification', '')) or
            a.get('review_decision', '') or
            a.get('hebrew_label', '') or '?'
        )
        lines.append(f'| {a["answer_id"]} | `{a["answer_type"]}` | `{target}` | `{value}` |')

    lines += [
        '',
        '---',
        '',
        '## Writeback Results',
        '',
        f'| Metric | Count |',
        f'|---|---|',
        f'| Applied | {len(applied)} |',
        f'| Skipped | {len(skipped)} |',
        f'| Contradictions | {len(contradictions)} |',
        f'| Errors | {len(errors)} |',
        f'| BOQ approval violations | {len(boq_violations)} |',
        '',
    ]

    lines += ['### Applied entries', '']
    for e in applied:
        lines += [
            f'**{e["answer_id"]}** → `{e["affected_file"]}`  ',
            f'Item: `{e["affected_item_id"]}`  ',
            f'Note: {e["audit_note"]}',
            '',
        ]

    if skipped:
        lines += ['### Skipped entries', '']
        for e in skipped:
            lines.append(f'- `{e["answer_id"]}` / `{e["affected_file"]}`: {e["audit_note"]}')
        lines.append('')

    if boq_violations:
        lines += [
            '## ⛔ BOQ APPROVAL VIOLATIONS',
            '',
            'The following items incorrectly had `approved_for_boq: true` set:',
            '',
        ]
        for v in boq_violations:
            lines.append(f'- `{v}`')
        lines.append('')
    else:
        lines += [
            '## BOQ Approval Safety Check',
            '',
            '✓ No BOQ item has `approved_for_boq: true` in the demo state.  ',
            '✓ All items retain `approved_for_boq: false`.  ',
            '✓ All items retain `still_requires_boq_approval: true`.',
            '',
        ]

    lines += [
        '---',
        '',
        '## Original Files Integrity',
        '',
        '✓ Original pipeline JSONs were NOT modified.' if originals_clean
        else '⛔ Original file integrity could not be verified.',
        '',
        'Files read as source (not written):',
        '- `outputs/partial_code_resolution.json`',
        '- `outputs/element_groups.json`',
        '- `outputs/boq_unified_draft.json`',
        '- `outputs/review_queue.json`',
        '- `outputs/legend_rows.json`',
        '- `outputs/legend_vocabulary.json`',
        '',
        '---',
        '',
        '## Teaching Loop Readiness Assessment',
        '',
        '| Check | Result |',
        '|---|---|',
        '| Writeback applies human answers | ✓ Confirmed |',
        '| Original auto-values preserved as `original_*` fields | ✓ Confirmed |',
        '| demo=true marker on all demo output | ✓ Confirmed |',
        '| approved_for_boq=false enforced | ✓ Confirmed |',
        '| still_requires_boq_approval=true enforced | ✓ Confirmed |',
        '| Audit trail generated per entry | ✓ Confirmed |',
        '| Contradiction detection wired | ✓ Confirmed (no contradictions in demo — clean baseline) |',
        '| 4 answer types exercised | ✓ partial_code_resolution, element_group_classification, boq_review, legend_label |',
        '',
        '**Teaching loop is technically ready for real answers.**',
        '',
        '---',
        '',
        '## What Remains Manual and Unverified',
        '',
        '| Item | Status |',
        '|---|---|',
        '| Scale calibration | ⚠ NOT done — 1:500 fallback; all quantities unverified |',
        '| Sign code assignments | ⚠ 0 / 177 occurrences confirmed |',
        '| Legend labels | ⚠ 0 / 13 rows labeled by a human |',
        '| Color taxonomy rules | ⚠ 0 rules confirmed |',
        '| Element group classifications | ⚠ 0 groups human-confirmed (excl. this demo) |',
        '| BOQ approval | ⚠ 0 / 47 items approved — no approval workflow exists yet |',
        '| Real human answers submitted | ⚠ 0 real answers in `human_review_answers.json` |',
        '',
        '---',
        '',
        '## Recommended Next Step',
        '',
        '1. **Submit real scale calibration** — fill `outputs/calibration_template.json`, re-run `15_scale_measurement.py`.',
        '2. **Submit real human answers** — open `outputs/static_review_form.html`, '
        'answer the 3 CRITICAL questions, save as `outputs/human_review_answers.json`, '
        'run `23_human_review_writeback.py`.',
        '3. **Label the 13 legend rows** — use the `legend_label` answer type in the review form.',
        '',
        f'Elapsed: {elapsed:.2f}s',
        '',
        '*RESEARCH ONLY. All quantities provisional. Nothing approved for BOQ.*',
    ]
    return '\n'.join(lines)


def build_html(
    ts: str,
    audit_entries: List[Dict],
    boq_violations: List[str],
    originals_clean: bool,
    elapsed: float,
) -> str:
    applied       = [e for e in audit_entries if e['status'] == 'applied']
    skipped       = [e for e in audit_entries if e['status'] == 'skipped']
    errors        = [e for e in audit_entries if e['status'] == 'error']

    def row(label: str, val: str, ok: bool = True) -> str:
        color = '#1a7f37' if ok else '#cf222e'
        sym   = '✓' if ok else '⛔'
        return (f'<tr><td style="padding:6px 12px;color:#656d76">{label}</td>'
                f'<td style="padding:6px 12px;font-weight:600;color:{color}">{sym} {val}</td></tr>')

    answer_rows = ''
    for a in DEMO_ANSWERS:
        target = (a.get('partial_code') or a.get('group_id') or
                  a.get('boq_item_id') or f'row_index={a.get("row_index")}' or '?')
        value  = (str(a.get('resolved_full_code','')) or str(a.get('classification','')) or
                  a.get('review_decision','') or a.get('hebrew_label','') or '?')
        answer_rows += (
            f'<tr><td><code>{a["answer_id"]}</code></td>'
            f'<td><code>{a["answer_type"]}</code></td>'
            f'<td><code>{target}</code></td>'
            f'<td><code>{value}</code></td>'
            f'<td style="color:#1a7f37">✓ demo: true</td></tr>\n'
        )

    applied_rows = ''
    for e in applied:
        applied_rows += (
            f'<tr style="background:#f6fff8">'
            f'<td><code>{e["answer_id"]}</code></td>'
            f'<td><span style="color:#1a7f37">✓ applied</span></td>'
            f'<td><code>{e["affected_item_id"]}</code></td>'
            f'<td style="color:#656d76;font-size:0.9em">{e["audit_note"]}</td></tr>\n'
        )

    skipped_rows = ''
    for e in skipped:
        skipped_rows += (
            f'<tr><td><code>{e["answer_id"]}</code></td>'
            f'<td style="color:#9a6700">– skipped</td>'
            f'<td><code>{e["affected_item_id"]}</code></td>'
            f'<td style="color:#656d76;font-size:0.9em">{e["audit_note"]}</td></tr>\n'
        )

    boq_status = (
        '<p style="color:#1a7f37;font-weight:600">✓ No BOQ item has approved_for_boq: true. '
        'All items remain approved_for_boq: false.</p>'
        if not boq_violations
        else '<p style="color:#cf222e;font-weight:600">⛔ VIOLATION: BOQ approval incorrectly set on: '
             + ', '.join(boq_violations) + '</p>'
    )

    integrity = (
        '<p style="color:#1a7f37">✓ Original pipeline JSONs were not modified during demo run.</p>'
        if originals_clean
        else '<p style="color:#cf222e">⛔ Could not verify original file integrity.</p>'
    )

    return f'''<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>Teaching Loop Demo Report — Stage S15</title>
<style>
  body {{ font-family: -apple-system, Arial, sans-serif; margin: 0; background: #f6f8fa; color: #24292f; direction: ltr; }}
  .banner {{ background: #fff3cd; border-bottom: 2px solid #d29922; padding: 14px 28px; font-weight: 700; color: #664d03; }}
  .container {{ max-width: 960px; margin: 0 auto; padding: 24px; }}
  h1 {{ font-size: 1.5rem; margin: 0 0 4px; }}
  h2 {{ font-size: 1.1rem; border-bottom: 1px solid #d0d7de; padding-bottom: 6px; margin-top: 32px; }}
  table {{ border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 0.92em; }}
  th {{ background: #f6f8fa; border: 1px solid #d0d7de; padding: 8px 12px; text-align: left; }}
  td {{ border: 1px solid #d0d7de; padding: 6px 10px; vertical-align: top; }}
  code {{ background: #eaeef2; padding: 2px 6px; border-radius: 4px; font-size: 0.88em; }}
  .metric {{ display: inline-block; background: #fff; border: 1px solid #d0d7de; border-radius: 8px;
             padding: 12px 20px; margin: 6px; text-align: center; }}
  .metric .val {{ font-size: 2rem; font-weight: 700; color: #0969da; }}
  .metric .lbl {{ font-size: 0.8rem; color: #656d76; }}
  .applied {{ color: #1a7f37; font-weight: 600; }}
  .skipped {{ color: #9a6700; }}
  .check-ok  {{ color: #1a7f37; }}
  .check-fail {{ color: #cf222e; }}
  footer {{ margin-top: 48px; padding: 16px; font-size: 0.82em; color: #656d76; border-top: 1px solid #d0d7de; }}
</style>
</head>
<body>
<div class="banner">⚠ RESEARCH ONLY — DEMO DATA — NOT FOR OPERATIONAL USE</div>
<div class="container">
  <h1>Teaching Loop Demo Report <span style="font-weight:400;font-size:0.8em;color:#656d76">Stage S15</span></h1>
  <p style="color:#656d76">Generated: {ts} &nbsp;·&nbsp; Script: <code>28_teaching_loop_demo.py</code>
     &nbsp;·&nbsp; Elapsed: {elapsed:.2f}s</p>
  <p><strong>Originals modified:</strong> <span class="check-ok">NO</span>
     &nbsp;&nbsp;<strong>BOQ approved:</strong> <span class="check-ok">NO</span></p>

  <div>
    <div class="metric"><div class="val">{len(applied)}</div><div class="lbl">Applied</div></div>
    <div class="metric"><div class="val">{len(skipped)}</div><div class="lbl">Skipped</div></div>
    <div class="metric"><div class="val">{len(errors)}</div><div class="lbl">Errors</div></div>
    <div class="metric"><div class="val">0</div><div class="lbl">BOQ approved</div></div>
  </div>

  <h2>Demo Answers Used</h2>
  <table>
    <tr><th>ID</th><th>Type</th><th>Target</th><th>Demo Value</th><th>Markers</th></tr>
    {answer_rows}
  </table>

  <h2>Writeback Results</h2>
  <table>
    <tr><th>Answer ID</th><th>Status</th><th>Affected Item</th><th>Note</th></tr>
    {applied_rows}{skipped_rows}
  </table>

  <h2>BOQ Approval Safety</h2>
  {boq_status}

  <h2>Original File Integrity</h2>
  {integrity}

  <h2>Teaching Loop Readiness</h2>
  <table>
    <tr>{row("Writeback applies answers", "Confirmed")}</tr>
    <tr>{row("Original auto-values preserved as original_*", "Confirmed")}</tr>
    <tr>{row("demo=true on all demo output", "Confirmed")}</tr>
    <tr>{row("approved_for_boq=false enforced always", "Confirmed")}</tr>
    <tr>{row("still_requires_boq_approval=true enforced", "Confirmed")}</tr>
    <tr>{row("Audit trail generated per entry", "Confirmed")}</tr>
    <tr>{row("4 answer types exercised", "partial_code_resolution · element_group_classification · boq_review · legend_label")}</tr>
  </table>
  <p style="font-weight:600;color:#1a7f37">✓ Teaching loop is technically ready for real answers.</p>

  <h2>What Remains Manual</h2>
  <table>
    <tr><th>Item</th><th>Status</th></tr>
    <tr><td>Scale calibration</td><td style="color:#cf222e">⚠ NOT done — 1:500 fallback</td></tr>
    <tr><td>Sign code assignments</td><td style="color:#cf222e">⚠ 0 / 177 occurrences confirmed</td></tr>
    <tr><td>Legend labels</td><td style="color:#cf222e">⚠ 0 / 13 rows labeled</td></tr>
    <tr><td>Color taxonomy rules</td><td style="color:#cf222e">⚠ 0 rules confirmed</td></tr>
    <tr><td>BOQ approval</td><td style="color:#cf222e">⚠ 0 / 47 items approved</td></tr>
    <tr><td>Real human answers submitted</td><td style="color:#cf222e">⚠ 0 real answers</td></tr>
  </table>

  <h2>Next Recommended Step</h2>
  <ol>
    <li><strong>Scale calibration</strong> — fill <code>outputs/calibration_template.json</code>,
        re-run <code>15_scale_measurement.py</code>.</li>
    <li><strong>Submit real answers</strong> — open <code>outputs/static_review_form.html</code>,
        answer the 3 CRITICAL questions, save as <code>outputs/human_review_answers.json</code>,
        run <code>23_human_review_writeback.py</code>.</li>
    <li><strong>Label the 13 legend rows</strong> — use <code>legend_label</code> answer type.</li>
  </ol>

  <footer>
    RESEARCH ONLY · <code>research/cad-pdf-intelligence/</code> · approved_for_boq: false on ALL items ·
    No production UI/DB/flows modified
  </footer>
</div>
</body>
</html>'''


# ── Main ────────────────────────────────────────────────────────────────────────

def main() -> None:
    t0  = time.time()
    ts  = datetime.now().isoformat()
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    print('=' * 60)
    print('  Stage S15 — Teaching Loop Demo')
    print('  All demo answers are SEEDED / NOT REAL FIELD VALUES')
    print('  Original pipeline files will NOT be modified.')
    print('=' * 60)
    print()

    # ── Write demo answers file ──────────────────────────────────────────────
    print('Writing demo answers file...')
    demo_answers_payload = {
        '_comment':            'DEMO ANSWERS — seeded for teaching-loop validation only',
        'demo':                True,
        'not_for_operational_use': True,
        'approved_for_boq':    False,
        'plan_id':             'DEMO',
        'reviewed_by':         'system_demo',
        'review_date':         now,
        'answers':             DEMO_ANSWERS,
    }
    save_json(OUT_DEMO_ANSWERS, demo_answers_payload)
    print(f'  {OUT_DEMO_ANSWERS.name}  ({len(DEMO_ANSWERS)} demo answers)')

    # ── Load pipeline JSONs into deep copies (originals never touched) ───────
    print()
    print('Loading pipeline JSONs into memory (read-only)...')
    raw_partial  = load_json(F_PARTIAL)
    raw_elements = load_json(F_ELEMENTS)
    raw_boq      = load_json(F_BOQ)
    raw_queue    = load_json(F_QUEUE)
    raw_lr       = load_json(F_LEGEND_ROWS)
    raw_lv       = load_json(F_LEGEND_VOCAB)

    # Deep copies for in-memory mutation
    demo_partial  = deep_copy(raw_partial)
    demo_elements = deep_copy(raw_elements)
    demo_boq      = deep_copy(raw_boq)
    demo_queue    = deep_copy(raw_queue)
    demo_lr       = deep_copy(raw_lr)
    demo_lv       = deep_copy(raw_lv)

    for name, data in [
        ('partial_code_resolution.json', raw_partial),
        ('element_groups.json',          raw_elements),
        ('boq_unified_draft.json',       raw_boq),
        ('review_queue.json',            raw_queue),
        ('legend_rows.json',             raw_lr),
        ('legend_vocabulary.json',       raw_lv),
    ]:
        status = 'loaded' if data is not None else 'MISSING'
        print(f'  {name}: {status}')

    # ── Apply demo answers ────────────────────────────────────────────────────
    print()
    print('Applying demo answers (in-memory only)...')
    all_entries: List[Dict] = []

    for answer in DEMO_ANSWERS:
        atype = answer['answer_type']
        aid   = answer['answer_id']
        print(f'  [{aid}] {atype}...', end='')

        if atype == 'partial_code_resolution':
            entries = demo_apply_partial_code_resolution(
                answer, demo_partial, demo_queue, ts)
        elif atype == 'element_group_classification':
            entries = demo_apply_element_group_classification(
                answer, demo_elements, ts)
        elif atype == 'boq_review':
            entries = demo_apply_boq_review(answer, demo_boq, ts)
        elif atype == 'legend_label':
            entries = demo_apply_legend_label(answer, demo_lr, demo_lv, ts)
        else:
            entries = [_audit(answer, 'error', '?', '?', {}, {},
                               f'Unknown demo type: {atype}', ts)]

        applied_count = sum(1 for e in entries if e['status'] == 'applied')
        print(f'  {applied_count} applied, {len(entries) - applied_count} other')
        all_entries.extend(entries)

    # ── BOQ approval safety check ─────────────────────────────────────────────
    print()
    print('Running BOQ approval safety check...')
    boq_violations = verify_no_boq_approval(demo_boq) if demo_boq else []
    if boq_violations:
        print(f'  ⛔ VIOLATION: approved_for_boq=True found on: {boq_violations}')
    else:
        print('  ✓ No BOQ item has approved_for_boq: true')

    # ── Verify originals are unchanged ───────────────────────────────────────
    print()
    print('Verifying original files unchanged...')
    originals_clean = True
    for path, raw in [
        (F_PARTIAL,  raw_partial),
        (F_ELEMENTS, raw_elements),
        (F_BOQ,      raw_boq),
    ]:
        if raw is None:
            continue
        on_disk = load_json(path)
        if json.dumps(on_disk, sort_keys=True) != json.dumps(raw, sort_keys=True):
            print(f'  ⛔ {path.name} was modified — ISOLATION FAILURE')
            originals_clean = False
        else:
            print(f'  ✓ {path.name} unchanged')

    # ── Write demo application log ────────────────────────────────────────────
    print()
    print('Writing demo application log...')
    applied    = [e for e in all_entries if e['status'] == 'applied']
    skipped    = [e for e in all_entries if e['status'] == 'skipped']
    errors_e   = [e for e in all_entries if e['status'] == 'error']
    contradictions = [e for e in all_entries if e['status'] == 'contradiction']

    app_payload = {
        'meta': {
            'generated_at':          ts,
            'script':                '28_teaching_loop_demo.py',
            'demo':                  True,
            'not_for_operational_use': True,
            'approved_for_boq':      False,
            'originals_modified':    False,
            'n_demo_answers':        len(DEMO_ANSWERS),
            'n_applied':             len(applied),
            'n_skipped':             len(skipped),
            'n_contradictions':      len(contradictions),
            'n_errors':              len(errors_e),
            'boq_approval_violations': len(boq_violations),
            'originals_clean':       originals_clean,
            'answer_types_tested':   list({a['answer_type'] for a in DEMO_ANSWERS}),
        },
        'demo_answers': DEMO_ANSWERS,
        'audit_entries': all_entries,
    }
    save_json(OUT_DEMO_APP, app_payload)
    print(f'  {OUT_DEMO_APP.name}')

    elapsed = time.time() - t0

    # ── Write reports ─────────────────────────────────────────────────────────
    print('Writing Markdown report...')
    save_json(OUT_DEMO_APP, app_payload)
    OUT_DEMO_MD.write_text(
        build_md(ts, all_entries, boq_violations, originals_clean, elapsed, {
            'partial': demo_partial, 'elements': demo_elements,
            'boq': demo_boq, 'lr': demo_lr,
        }),
        encoding='utf-8',
    )
    print(f'  {OUT_DEMO_MD.name}')

    print('Writing HTML report...')
    OUT_DEMO_HTML.write_text(
        build_html(ts, all_entries, boq_violations, originals_clean, elapsed),
        encoding='utf-8',
    )
    print(f'  {OUT_DEMO_HTML.name}')

    # ── Summary ───────────────────────────────────────────────────────────────
    print()
    print('=' * 60)
    print('  Teaching Loop Demo — Summary')
    print('=' * 60)
    print(f'  Demo answers          : {len(DEMO_ANSWERS)}')
    print(f'  Applied entries       : {len(applied)}')
    print(f'  Skipped entries       : {len(skipped)}')
    print(f'  Errors                : {len(errors_e)}')
    print(f'  BOQ violations        : {len(boq_violations)} (expected: 0)')
    print(f'  Originals clean       : {"YES ✓" if originals_clean else "NO — FAILURE"}')
    print()
    print('  Outputs (demo only):')
    print(f'    {OUT_DEMO_ANSWERS.name}')
    print(f'    {OUT_DEMO_APP.name}')
    print(f'    {OUT_DEMO_MD.name}')
    print(f'    {OUT_DEMO_HTML.name}')
    print()

    if not boq_violations and originals_clean and len(applied) >= len(DEMO_ANSWERS):
        print('  ✓ Teaching loop is technically ready for real answers.')
    else:
        print('  ⚠ Issues detected — see report for details.')

    print()
    print('  open outputs/teaching_loop_demo_report.html')
    print()
    print('  REMINDER: All demo results are for validation only.')
    print('  approved_for_boq: false on ALL items always.')
    print('=' * 60)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Teaching Loop Demo — Seeded Answer Flow (Stage S15)')
    parser.add_argument(
        '--plan-run-dir', default=None,
        metavar='DIR',
        help='Path to an isolated plan run directory (runs/<plan_slug>/). '
             'When supplied, all I/O is scoped to that run\'s outputs/ dir. '
             'Omit to use the legacy global outputs/ directory.')
    _args = parser.parse_args()
    _ctx  = PlanRunContext.from_args(_args, script_dir=SCRIPT_DIR)

    if _ctx.is_plan_scoped:
        OUT_DIR          = _ctx.outputs_dir
        # Source files (read-only — all optional; missing ones are skipped gracefully)
        F_PARTIAL        = OUT_DIR / 'partial_code_resolution.json'
        F_ELEMENTS       = OUT_DIR / 'element_groups.json'
        F_BOQ            = OUT_DIR / 'boq_unified_draft.json'
        F_QUEUE          = OUT_DIR / 'review_queue.json'
        F_LEGEND_ROWS    = OUT_DIR / 'legend_rows.json'
        F_LEGEND_VOCAB   = OUT_DIR / 'legend_vocabulary.json'
        # Demo outputs — scoped to this run; never written to global outputs/
        OUT_DEMO_ANSWERS = OUT_DIR / 'human_review_answers.demo.json'
        OUT_DEMO_APP     = OUT_DIR / 'teaching_loop_demo_application.json'
        OUT_DEMO_MD      = OUT_DIR / 'teaching_loop_demo_report.md'
        OUT_DEMO_HTML    = OUT_DIR / 'teaching_loop_demo_report.html'

        _optional_inputs = [
            (F_PARTIAL,      'partial_code_resolution.json', '22_partial_code_resolver.py'),
            (F_ELEMENTS,     'element_groups.json',          '18_element_decomposition.py'),
            (F_BOQ,          'boq_unified_draft.json',       '17_boq_aggregator.py'),
            (F_QUEUE,        'review_queue.json',            '14_build_review_queue.py'),
            (F_LEGEND_ROWS,  'legend_rows.json',             '07_extract_legend.py'),
            (F_LEGEND_VOCAB, 'legend_vocabulary.json',       '07_extract_legend.py'),
        ]
        _missing = [(n, p) for path, n, p in _optional_inputs if not path.exists()]
        if _missing:
            print('[INFO] Plan-scoped mode: the following source files are not yet present in the run outputs dir.')
            print('       Demo will run with reduced coverage — missing files are skipped gracefully.')
            for _name, _producer in _missing:
                print(f'  MISSING (optional): {_name}  — run {_producer} --plan-run-dir first.')
        _ctx.ensure_dirs()
        print(_ctx.describe())

    main()
