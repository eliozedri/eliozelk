#!/usr/bin/env python3
"""
23_human_review_writeback.py
Stage S10 — Human Review Write-Back / Teaching Rules (תרגול ולמידה)

Applies human answers to research pipeline outputs using in-place annotation
with full audit safeguards.

Rules:
  • Never auto-approves for BOQ (approved_for_boq stays false always)
  • Preserves all original automatic values alongside human fields
  • Detects contradictions — flags them, never silently overwrites
  • If no real answers file exists → generate example/template only, apply 0
  • Do not apply example answers as real answers

Supported answer types:
  1. partial_code_resolution   — suffix "33" → 433
  2. element_group_classification — G-005 → work_zone
  3. scale_calibration         — two-point distance → scale
  4. color_taxonomy_rule       — color → element_type + action_type
  5. sign_code_confirmation    — OCC-XXXX → confirmed code
  6. ignore_rule               — group / color / region → ignore

Inputs:
  outputs/human_review_answers.json       (real answers — optional)

Outputs (always written):
  outputs/human_review_answers.example.json
  outputs/human_review_application.json
  outputs/human_review_application_report.md
  outputs/human_review_application_report.html

Modified in-place (only when real answers exist and apply):
  outputs/partial_code_resolution.json
  outputs/element_groups.json
  outputs/boq_unified_draft.json
  outputs/review_queue.json
  outputs/validation_results.json

Research-only. approved_for_boq: false on ALL items always.
"""
from __future__ import annotations
import json, time
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple

# ── Config ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
OUT_DIR    = SCRIPT_DIR / 'outputs'

IN_ANSWERS  = OUT_DIR / 'human_review_answers.json'

OUT_EXAMPLE = OUT_DIR / 'human_review_answers.example.json'
OUT_LOG     = OUT_DIR / 'human_review_application.json'
OUT_MD      = OUT_DIR / 'human_review_application_report.md'
OUT_HTML    = OUT_DIR / 'human_review_application_report.html'

# Files that may be annotated in-place
F_PARTIAL    = OUT_DIR / 'partial_code_resolution.json'
F_ELEMENTS   = OUT_DIR / 'element_groups.json'
F_BOQ        = OUT_DIR / 'boq_unified_draft.json'
F_QUEUE      = OUT_DIR / 'review_queue.json'
F_VALIDATION = OUT_DIR / 'validation_results.json'

REQUIRED_FIELDS: Dict[str, List[str]] = {
    'partial_code_resolution':    ['answer_id', 'question_id', 'partial_code', 'resolved_full_code', 'scope'],
    'element_group_classification':['answer_id', 'group_id', 'classification', 'include_in_boq', 'scope'],
    'scale_calibration':           ['answer_id', 'calibration_id', 'point_a', 'point_b', 'real_world_distance_m'],
    'color_taxonomy_rule':         ['answer_id', 'color', 'element_type', 'action_type', 'scope'],
    'sign_code_confirmation':      ['answer_id', 'occurrence_id', 'confirmed_code', 'source'],
    'ignore_rule':                 ['answer_id', 'target_type', 'target_id', 'reason', 'scope'],
}

VALID_SCOPES = {'current_plan_only', 'project_rule', 'company_rule_candidate'}
VALID_TARGET_TYPES = {'group', 'color', 'path_class', 'region'}
VALID_ELEMENT_CLASSIFICATIONS = {
    'work_zone', 'guardrail', 'barrier', 'marking', 'pavement_marking',
    'road_edge', 'drainage', 'signage', 'background', 'noise', 'unknown',
}
VALID_ACTION_TYPES = {'existing', 'new', 'remove', 'cover', 'temporary', 'permanent', 'unknown'}

# ── I/O helpers ─────────────────────────────────────────────────────────────────

def load_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f'[Warn] Failed to load {path}: {e}')
        return default


def save_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2))


# ── Answer validation ──────────────────────────────────────────────────────────

def validate_answer(answer: Dict) -> Tuple[bool, str]:
    """Return (valid, error_message). Empty error = valid."""
    atype = answer.get('answer_type')
    if atype not in REQUIRED_FIELDS:
        return False, f'Unknown answer_type "{atype}"'

    for field in REQUIRED_FIELDS[atype]:
        if field not in answer or answer[field] is None:
            return False, f'Missing required field "{field}" for type "{atype}"'

    scope = answer.get('scope', 'current_plan_only')
    if atype not in ('scale_calibration',) and scope not in VALID_SCOPES:
        return False, f'Invalid scope "{scope}" — must be one of {sorted(VALID_SCOPES)}'

    if atype == 'sign_code_confirmation':
        try:
            code = int(answer['confirmed_code'])
            if code < 101 or code > 999:
                return False, f'confirmed_code {code} outside valid range 101–999'
        except (ValueError, TypeError):
            return False, 'confirmed_code must be a valid integer'

    if atype == 'partial_code_resolution':
        try:
            code = int(answer['resolved_full_code'])
            if code < 101 or code > 999:
                return False, f'resolved_full_code {code} outside valid range 101–999'
        except (ValueError, TypeError):
            return False, 'resolved_full_code must be a valid integer'

    if atype == 'color_taxonomy_rule':
        if answer.get('action_type') not in VALID_ACTION_TYPES:
            return False, f'Invalid action_type "{answer.get("action_type")}"'

    if atype == 'element_group_classification':
        if answer.get('classification') not in VALID_ELEMENT_CLASSIFICATIONS:
            return False, f'Invalid classification "{answer.get("classification")}"'
        if not isinstance(answer.get('include_in_boq'), bool):
            return False, 'include_in_boq must be boolean'

    if atype == 'ignore_rule':
        if answer.get('target_type') not in VALID_TARGET_TYPES:
            return False, f'Invalid target_type "{answer.get("target_type")}"'

    return True, ''


# ── Conflict detection ─────────────────────────────────────────────────────────

def high_confidence(item: Dict, field: str = 'confidence') -> bool:
    """Returns True if item has a high-confidence auto result that warrants conflict detection."""
    conf = item.get(field, '')
    if isinstance(conf, float):
        return conf >= 0.85
    return str(conf).upper() in ('HIGH', 'CONFIRMED', 'CERTAIN')


# ── Appliers ───────────────────────────────────────────────────────────────────

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
        'answer_id':       answer.get('answer_id', '?'),
        'answer_type':     answer.get('answer_type', '?'),
        'status':          status,   # applied | skipped | contradiction | error
        'affected_file':   affected_file,
        'affected_item_id':item_id,
        'previous_value':  prev,
        'new_value':       new,
        'scope':           answer.get('scope', 'current_plan_only'),
        'audit_note':      note,
        'timestamp':       ts,
    }


def apply_partial_code_resolution(answer: Dict, ts: str) -> List[Dict]:
    """
    Applies a partial_code_resolution answer.
    Annotates matching results in partial_code_resolution.json and review_queue.json.
    """
    entries = []
    suffix       = str(answer['partial_code'])
    resolved     = int(answer['resolved_full_code'])
    question_id  = answer['question_id']
    scope        = answer.get('scope', 'current_plan_only')
    notes        = answer.get('notes', '')

    # ── partial_code_resolution.json ──────────────────────────────────────────
    pr_data = load_json(F_PARTIAL)
    if pr_data is None:
        entries.append(_audit(answer, 'skipped', str(F_PARTIAL.relative_to(SCRIPT_DIR)),
                              f'suffix:{suffix}', {}, {},
                              'partial_code_resolution.json not found — run 22_partial_code_resolver.py', ts))
    else:
        modified = False
        # Annotate suffix_groups
        group = pr_data.get('suffix_groups', {}).get(suffix)
        if group is not None:
            prev = {
                'resolution_status': group.get('resolution_status'),
                'suggested_resolution': group.get('suggested_resolution'),
            }
            conflict = (
                group.get('human_confirmed') and
                group.get('human_confirmed_code') != resolved
            )
            if conflict:
                group['contradiction_detected'] = True
                group['requires_review'] = True
                entries.append(_audit(answer, 'contradiction', str(F_PARTIAL.relative_to(SCRIPT_DIR)),
                                      f'suffix_group:{suffix}', prev,
                                      {'human_confirmed_code': resolved},
                                      f'Conflicts with existing human_confirmed_code={group.get("human_confirmed_code")}', ts))
            else:
                group['original_resolution_status']   = group.get('resolution_status')
                group['original_suggested_resolution'] = group.get('suggested_resolution')
                group['resolution_status']             = 'human_confirmed'
                group['human_confirmed']               = True
                group['human_confirmed_code']          = resolved
                group['human_answer_source']           = question_id
                group['human_answer_scope']            = scope
                group['human_answer_timestamp']        = ts
                group['human_answer_notes']            = notes
                group['still_requires_boq_approval']   = True
                modified = True
                entries.append(_audit(answer, 'applied', str(F_PARTIAL.relative_to(SCRIPT_DIR)),
                                      f'suffix_group:{suffix}', prev,
                                      {'resolution_status': 'human_confirmed', 'human_confirmed_code': resolved},
                                      f'Suffix "{suffix}" resolved to {resolved} (scope={scope})', ts))

        # Annotate individual results with matching suffix
        for result in pr_data.get('results', []):
            if str(result.get('partial_code')) != suffix:
                continue
            occ_id = result.get('occurrence_id', '?')
            prev_r = {
                'resolution_status': result.get('resolution_status'),
                'suggested_resolution': result.get('suggested_resolution'),
            }
            result['original_resolution_status']   = result.get('resolution_status')
            result['original_suggested_resolution'] = result.get('suggested_resolution')
            result['resolution_status']             = 'human_confirmed'
            result['human_confirmed']               = True
            result['human_confirmed_code']          = resolved
            result['human_answer_source']           = question_id
            result['human_answer_scope']            = scope
            result['human_answer_timestamp']        = ts
            result['still_requires_boq_approval']   = True
            modified = True
            entries.append(_audit(answer, 'applied', str(F_PARTIAL.relative_to(SCRIPT_DIR)),
                                  occ_id, prev_r,
                                  {'resolution_status': 'human_confirmed', 'human_confirmed_code': resolved},
                                  f'OCC suffix "{suffix}" annotated with human answer {resolved}', ts))

        if modified:
            save_json(F_PARTIAL, pr_data)

    # ── review_queue.json ─────────────────────────────────────────────────────
    queue = load_json(F_QUEUE)
    if queue is not None and isinstance(queue, list):
        rq_modified = False
        for item in queue:
            # Match by poc3 candidate suffix
            candidates = item.get('auto_result', {}).get('poc3_candidates', [])
            if suffix not in [str(c) for c in candidates]:
                continue
            occ_id = item.get('occurrence_id', '?')
            prev_q = {
                'human_confirmed_code': item.get('human_confirmed_code'),
                'human_label_source':   item.get('human_label_source'),
            }
            conflict = (
                item.get('human_confirmed_code') and
                item.get('human_confirmed_code') != resolved
            )
            if conflict:
                item['contradiction_detected'] = True
                item['requires_review'] = True
                entries.append(_audit(answer, 'contradiction', str(F_QUEUE.relative_to(SCRIPT_DIR)),
                                      occ_id, prev_q, {'human_confirmed_code': resolved},
                                      f'Conflicts with existing human_confirmed_code={item.get("human_confirmed_code")}', ts))
            else:
                item['original_human_confirmed_code'] = item.get('human_confirmed_code')
                item['original_human_label_source']   = item.get('human_label_source')
                item['human_confirmed_code']           = resolved
                item['human_label_source']             = f'human_review_{question_id}'
                item['human_answer_scope']             = scope
                item['human_answer_timestamp']         = ts
                item['still_requires_boq_approval']    = True
                rq_modified = True
                entries.append(_audit(answer, 'applied', str(F_QUEUE.relative_to(SCRIPT_DIR)),
                                      occ_id, prev_q,
                                      {'human_confirmed_code': resolved, 'human_label_source': f'human_review_{question_id}'},
                                      f'Review queue item annotated', ts))

        if rq_modified:
            save_json(F_QUEUE, queue)

    return entries


def apply_element_group_classification(answer: Dict, ts: str) -> List[Dict]:
    """Applies an element_group_classification answer to element_groups.json."""
    entries = []
    group_id     = answer['group_id']
    human_class  = answer['classification']
    include_boq  = answer['include_in_boq']  # bool
    scope        = answer.get('scope', 'current_plan_only')
    notes        = answer.get('notes', '')

    eg_data = load_json(F_ELEMENTS)
    if eg_data is None:
        entries.append(_audit(answer, 'skipped', str(F_ELEMENTS.relative_to(SCRIPT_DIR)),
                              group_id, {}, {},
                              'element_groups.json not found', ts))
        return entries

    groups = eg_data.get('groups', [])
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
        conflict = (
            group.get('human_confirmed') and
            group.get('human_classification') != human_class
        )
        if conflict:
            group['contradiction_detected'] = True
            group['requires_review'] = True
            entries.append(_audit(answer, 'contradiction', str(F_ELEMENTS.relative_to(SCRIPT_DIR)),
                                  group_id, prev, {'human_classification': human_class},
                                  f'Conflicts with existing human_classification={group.get("human_classification")}', ts))
        else:
            # Check for auto-result conflict (high-confidence auto says something different)
            auto_class = group.get('classification', '')
            if high_confidence(group) and auto_class not in ('review', 'unknown', '') and auto_class != human_class:
                group['auto_human_divergence'] = True
            group['original_classification']        = group.get('classification')
            group['original_classification_source'] = group.get('classification_source')
            group['original_element_type']          = group.get('element_type')
            group['classification']                 = human_class
            group['classification_source']          = 'human_review'
            group['element_type']                   = human_class
            group['human_confirmed']                = True
            group['human_classification']           = human_class
            group['human_include_in_boq']           = include_boq
            group['human_answer_scope']             = scope
            group['human_answer_timestamp']         = ts
            group['human_answer_notes']             = notes
            group['still_requires_boq_approval']    = True
            # Do NOT set approved_for_boq = True
            entries.append(_audit(answer, 'applied', str(F_ELEMENTS.relative_to(SCRIPT_DIR)),
                                  group_id, prev,
                                  {'classification': human_class, 'human_include_in_boq': include_boq},
                                  f'Group {group_id} classified as {human_class} (include_in_boq={include_boq}, scope={scope})', ts))

    if not matched:
        entries.append(_audit(answer, 'skipped', str(F_ELEMENTS.relative_to(SCRIPT_DIR)),
                              group_id, {}, {},
                              f'Group "{group_id}" not found in element_groups.json', ts))
        return entries

    save_json(F_ELEMENTS, eg_data)
    return entries


def apply_scale_calibration(answer: Dict, ts: str) -> List[Dict]:
    """
    Applies scale calibration reference to boq_unified_draft.json scale_info.
    Note: actual recalculation of measurements requires re-running 15_scale_measurement.py.
    """
    entries = []
    cal_id = answer['calibration_id']
    pt_a   = answer['point_a']
    pt_b   = answer['point_b']
    dist_m = float(answer['real_world_distance_m'])
    notes  = answer.get('notes', '')

    boq = load_json(F_BOQ)
    if boq is None:
        entries.append(_audit(answer, 'skipped', str(F_BOQ.relative_to(SCRIPT_DIR)),
                              cal_id, {}, {},
                              'boq_unified_draft.json not found', ts))
        return entries

    scale_info = boq.get('scale_info', {})
    prev = {
        'scale_status':  scale_info.get('scale_status'),
        'human_calibration_applied': scale_info.get('human_calibration_applied'),
    }
    scale_info['human_calibration_applied']    = True
    scale_info['human_calibration_id']         = cal_id
    scale_info['human_calibration_point_a']    = pt_a
    scale_info['human_calibration_point_b']    = pt_b
    scale_info['human_real_world_distance_m']  = dist_m
    scale_info['human_calibration_timestamp']  = ts
    scale_info['human_calibration_notes']      = notes
    scale_info['scale_status']                 = 'pending_recalculation_with_human_calibration'
    scale_info['recalculation_instruction']    = 'Re-run 15_scale_measurement.py with calibration_template.json'
    boq['scale_info'] = scale_info

    save_json(F_BOQ, boq)
    entries.append(_audit(answer, 'applied', str(F_BOQ.relative_to(SCRIPT_DIR)),
                          cal_id, prev,
                          {'scale_status': 'pending_recalculation_with_human_calibration',
                           'human_real_world_distance_m': dist_m},
                          f'Calibration {cal_id} recorded. Re-run 15_scale_measurement.py to apply.', ts))
    return entries


def apply_color_taxonomy_rule(answer: Dict, ts: str) -> List[Dict]:
    """
    Applies a color_taxonomy_rule to all element_groups matching the color.
    color can be an RGB tuple [r,g,b] 0–255 or a color_key string 'r,g,b'.
    """
    entries = []
    color_raw   = answer['color']
    elem_type   = answer['element_type']
    action_type = answer['action_type']
    scope       = answer.get('scope', 'current_plan_only')
    notes       = answer.get('notes', '')

    # Normalize color to color_key string
    if isinstance(color_raw, list) and len(color_raw) == 3:
        color_key = ','.join(f'{v:.2f}' for v in [c / 255.0 for c in color_raw])
        color_rgb8 = color_raw
    elif isinstance(color_raw, str):
        color_key = color_raw
        color_rgb8 = None
    else:
        entries.append(_audit(answer, 'error', str(F_ELEMENTS.relative_to(SCRIPT_DIR)),
                              str(color_raw), {}, {},
                              f'Cannot parse color format: {color_raw}', ts))
        return entries

    eg_data = load_json(F_ELEMENTS)
    if eg_data is None:
        entries.append(_audit(answer, 'skipped', str(F_ELEMENTS.relative_to(SCRIPT_DIR)),
                              str(color_raw), {}, {},
                              'element_groups.json not found', ts))
        return entries

    groups = eg_data.get('groups', [])
    matched_any = False
    for group in groups:
        gkey = group.get('color_key', '')
        # Flexible match: exact key or fuzzy RGB8
        is_match = (gkey == color_key)
        if not is_match and color_rgb8:
            grgb8 = group.get('color_rgb8', [])
            is_match = grgb8 == color_rgb8
        if not is_match:
            continue

        matched_any = True
        group_id = group.get('group_id', '?')
        prev = {
            'element_type':          group.get('element_type'),
            'classification_source': group.get('classification_source'),
        }
        group['original_element_type']          = group.get('element_type')
        group['original_classification_source'] = group.get('classification_source')
        group['element_type']                   = elem_type
        group['human_action_type']              = action_type
        group['classification_source']          = 'human_color_taxonomy_rule'
        group['human_confirmed']                = True
        group['human_answer_scope']             = scope
        group['human_answer_timestamp']         = ts
        group['human_answer_notes']             = notes
        group['still_requires_boq_approval']    = True
        entries.append(_audit(answer, 'applied', str(F_ELEMENTS.relative_to(SCRIPT_DIR)),
                              group_id, prev,
                              {'element_type': elem_type, 'human_action_type': action_type},
                              f'Color taxonomy rule applied (color={color_key}, scope={scope})', ts))

    if not matched_any:
        entries.append(_audit(answer, 'skipped', str(F_ELEMENTS.relative_to(SCRIPT_DIR)),
                              str(color_raw), {}, {},
                              f'No element group found with color_key "{color_key}"', ts))
        return entries

    save_json(F_ELEMENTS, eg_data)
    return entries


def apply_sign_code_confirmation(answer: Dict, ts: str) -> List[Dict]:
    """
    Applies a sign_code_confirmation to review_queue.json and validation_results.json.
    """
    entries = []
    occ_id       = answer['occurrence_id']
    confirmed    = int(answer['confirmed_code'])
    source       = answer.get('source', 'human_review')
    notes        = answer.get('notes', '')

    # ── review_queue.json ─────────────────────────────────────────────────────
    queue = load_json(F_QUEUE)
    if queue is not None and isinstance(queue, list):
        matched = False
        for item in queue:
            if item.get('occurrence_id') != occ_id:
                continue
            matched = True
            prev = {
                'human_confirmed_code': item.get('human_confirmed_code'),
                'human_label_source':   item.get('human_label_source'),
            }
            conflict = (
                item.get('human_confirmed_code') and
                item.get('human_confirmed_code') != confirmed
            )
            if conflict:
                item['contradiction_detected'] = True
                item['requires_review'] = True
                entries.append(_audit(answer, 'contradiction', str(F_QUEUE.relative_to(SCRIPT_DIR)),
                                      occ_id, prev, {'human_confirmed_code': confirmed},
                                      f'Conflicts with existing human_confirmed_code={item.get("human_confirmed_code")}', ts))
            else:
                item['original_human_confirmed_code'] = item.get('human_confirmed_code')
                item['original_human_label_source']   = item.get('human_label_source')
                item['human_confirmed_code']           = confirmed
                item['human_label_source']             = source
                item['human_answer_timestamp']         = ts
                item['human_answer_notes']             = notes
                item['still_requires_boq_approval']    = True
                entries.append(_audit(answer, 'applied', str(F_QUEUE.relative_to(SCRIPT_DIR)),
                                      occ_id, prev,
                                      {'human_confirmed_code': confirmed, 'human_label_source': source},
                                      f'Sign code {confirmed} confirmed for {occ_id}', ts))
        if not matched:
            entries.append(_audit(answer, 'skipped', str(F_QUEUE.relative_to(SCRIPT_DIR)),
                                  occ_id, {}, {},
                                  f'OCC "{occ_id}" not found in review_queue.json', ts))
        else:
            save_json(F_QUEUE, queue)

    # ── validation_results.json ───────────────────────────────────────────────
    val_data = load_json(F_VALIDATION)
    if val_data is not None:
        for result in val_data.get('results', []):
            if result.get('occurrence_id') != occ_id:
                continue
            prev_v = {'adjusted_confidence': result.get('adjusted_confidence')}
            result['human_confirmed']          = True
            result['human_confirmed_code']     = confirmed
            result['human_label_source']       = source
            result['human_answer_timestamp']   = ts
            result['still_requires_boq_approval'] = True
            entries.append(_audit(answer, 'applied', str(F_VALIDATION.relative_to(SCRIPT_DIR)),
                                  occ_id, prev_v,
                                  {'human_confirmed_code': confirmed},
                                  f'Validation record annotated', ts))
        save_json(F_VALIDATION, val_data)

    return entries


def apply_ignore_rule(answer: Dict, ts: str) -> List[Dict]:
    """
    Applies an ignore_rule to mark a group, color, or region as ignorable.
    """
    entries = []
    target_type = answer['target_type']
    target_id   = answer['target_id']
    reason      = answer['reason']
    scope       = answer.get('scope', 'current_plan_only')
    notes       = answer.get('notes', '')

    # ── element_groups.json ───────────────────────────────────────────────────
    eg_data = load_json(F_ELEMENTS)
    if eg_data is not None:
        groups = eg_data.get('groups', [])
        eg_modified = False
        for group in groups:
            match = False
            if target_type == 'group' and group.get('group_id') == target_id:
                match = True
            elif target_type == 'color' and (
                group.get('color_key') == target_id or
                str(group.get('color_rgb8')) == str(target_id)
            ):
                match = True

            if not match:
                continue

            group_id = group.get('group_id', '?')
            prev = {'classification': group.get('classification'), 'requires_review': group.get('requires_review')}
            group['original_classification'] = group.get('classification')
            group['classification']          = 'ignore'
            group['classification_source']   = 'human_ignore_rule'
            group['human_confirmed']         = True
            group['human_ignore_reason']     = reason
            group['human_answer_scope']      = scope
            group['human_answer_timestamp']  = ts
            group['human_answer_notes']      = notes
            group['requires_review']         = False
            group['still_requires_boq_approval'] = True
            eg_modified = True
            entries.append(_audit(answer, 'applied', str(F_ELEMENTS.relative_to(SCRIPT_DIR)),
                                  group_id, prev,
                                  {'classification': 'ignore', 'requires_review': False},
                                  f'Ignore rule applied ({target_type}={target_id}, reason={reason})', ts))

        if eg_modified:
            save_json(F_ELEMENTS, eg_data)

    # ── review_queue.json — mark review items for ignored groups ──────────────
    queue = load_json(F_QUEUE)
    if queue is not None and isinstance(queue, list) and target_type == 'group':
        rq_modified = False
        for item in queue:
            # Group-level ignore applies to items whose crops reference this group
            if target_id not in str(item.get('crops', '')):
                continue
            item['human_ignored']           = True
            item['human_ignore_reason']     = reason
            item['human_answer_scope']      = scope
            item['human_answer_timestamp']  = ts
            rq_modified = True
            entries.append(_audit(answer, 'applied', str(F_QUEUE.relative_to(SCRIPT_DIR)),
                                  item.get('occurrence_id', '?'), {},
                                  {'human_ignored': True},
                                  f'Ignore rule propagated from group {target_id}', ts))
        if rq_modified:
            save_json(F_QUEUE, queue)

    if not entries:
        entries.append(_audit(answer, 'skipped', 'element_groups.json',
                              target_id, {}, {},
                              f'No items matched target_type={target_type}, target_id={target_id}', ts))

    return entries


# ── Dispatcher ─────────────────────────────────────────────────────────────────

APPLIERS = {
    'partial_code_resolution':     apply_partial_code_resolution,
    'element_group_classification':apply_element_group_classification,
    'scale_calibration':           apply_scale_calibration,
    'color_taxonomy_rule':         apply_color_taxonomy_rule,
    'sign_code_confirmation':      apply_sign_code_confirmation,
    'ignore_rule':                 apply_ignore_rule,
}


def apply_all(answers: List[Dict], ts: str) -> List[Dict]:
    all_entries: List[Dict] = []
    for answer in answers:
        atype = answer.get('answer_type', '')
        valid, err = validate_answer(answer)
        if not valid:
            all_entries.append(_audit(answer, 'error', 'validation', answer.get('answer_id', '?'),
                                      {}, {}, f'Invalid answer: {err}', ts))
            continue
        applier = APPLIERS.get(atype)
        if applier is None:
            all_entries.append(_audit(answer, 'error', 'dispatch', answer.get('answer_id', '?'),
                                      {}, {}, f'No applier for type "{atype}"', ts))
            continue
        entries = applier(answer, ts)
        all_entries.extend(entries)
    return all_entries


# ── Example/template ───────────────────────────────────────────────────────────

def build_example_json() -> Dict:
    return {
        "_comment": (
            "This is a TEMPLATE only. Copy to human_review_answers.json and fill in real answers. "
            "Do NOT rename this file — example answers are never applied as real answers."
        ),
        "plan_id": "50-448-02-400",
        "reviewed_by": "HUMAN_NAME",
        "review_date": "YYYY-MM-DD",
        "answers": [
            {
                "answer_id": "A-001",
                "answer_type": "partial_code_resolution",
                "question_id": "Q-33-1",
                "partial_code": "33",
                "resolved_full_code": 433,
                "scope": "current_plan_only",
                "confidence": "human_confirmed",
                "notes": "Visually confirmed as 'No stopping or parking' (433) at OCC-0001"
            },
            {
                "answer_id": "A-002",
                "answer_type": "element_group_classification",
                "group_id": "G-005",
                "classification": "work_zone",
                "include_in_boq": True,
                "scope": "current_plan_only",
                "notes": "Orange dashed lines — work zone boundary markings"
            },
            {
                "answer_id": "A-003",
                "answer_type": "scale_calibration",
                "calibration_id": "CAL-001",
                "point_a": {"x_pdf": 1200.0, "y_pdf": 500.0, "label": "Chainage 0+000"},
                "point_b": {"x_pdf": 2400.0, "y_pdf": 500.0, "label": "Chainage 0+050"},
                "real_world_distance_m": 50.0,
                "confidence": "surveyed",
                "notes": "Distance between two known chainage markers"
            },
            {
                "answer_id": "A-004",
                "answer_type": "color_taxonomy_rule",
                "color": [255, 165, 0],
                "element_type": "work_zone_boundary",
                "action_type": "temporary",
                "scope": "current_plan_only",
                "notes": "Orange lines are temporary construction zone boundaries"
            },
            {
                "answer_id": "A-005",
                "answer_type": "sign_code_confirmation",
                "occurrence_id": "OCC-0003",
                "confirmed_code": 433,
                "source": "human_read_written_code",
                "notes": "Code clearly printed next to sign symbol"
            },
            {
                "answer_id": "A-006",
                "answer_type": "ignore_rule",
                "target_type": "group",
                "target_id": "G-001",
                "reason": "Title block and border lines — background noise, not road infrastructure",
                "scope": "current_plan_only",
                "notes": ""
            }
        ]
    }


# ── Report builders ─────────────────────────────────────────────────────────────

def _status_counts(entries: List[Dict]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for e in entries:
        s = e['status']
        counts[s] = counts.get(s, 0) + 1
    return counts


def build_md(summary: Dict) -> str:
    meta    = summary['meta']
    entries = summary['applied_entries']
    sc      = _status_counts(entries)
    ts      = meta['generated_at']

    lines = [
        '# Human Review Write-Back Report — Stage S10',
        '',
        f'Generated: `{ts}`',
        '',
        '> ⚠ **RESEARCH-ONLY** — `approved_for_boq: false` on all items.',
        '> `still_requires_boq_approval: true` on all human-confirmed items.',
        '',
        '## Summary',
        '',
        '| Metric | Value |',
        '|--------|-------|',
        f'| Answers file exists | {"Yes" if meta["answers_file_exists"] else "No"} |',
        f'| Answers loaded | {meta["n_answers_loaded"]} |',
        f'| Applied | {sc.get("applied", 0)} |',
        f'| Skipped | {sc.get("skipped", 0)} |',
        f'| Contradictions | {sc.get("contradiction", 0)} |',
        f'| Errors | {sc.get("error", 0)} |',
        '',
    ]

    if not meta['answers_file_exists']:
        lines += [
            '## Status: No Real Answers File',
            '',
            f'`{IN_ANSWERS.relative_to(SCRIPT_DIR)}` does not exist.',
            '',
            f'Template written to: `{OUT_EXAMPLE.relative_to(SCRIPT_DIR)}`',
            '',
            'To start the teaching loop:',
            '1. Copy `outputs/human_review_answers.example.json` → `outputs/human_review_answers.json`',
            '2. Fill in real answers (delete or update example entries)',
            '3. Re-run `22_partial_code_resolver.py` then `23_human_review_writeback.py`',
        ]
        return '\n'.join(lines)

    lines += ['## Applied Changes', '', '| Status | Answer ID | Type | Item | Note |', '|--------|-----------|------|------|------|']
    for e in entries:
        lines.append(f'| {e["status"]} | {e["answer_id"]} | {e["answer_type"]} | `{e["affected_item_id"]}` | {e["audit_note"][:80]} |')

    if sc.get('contradiction', 0) > 0:
        lines += ['', '## Contradictions Detected', '', '> These items require manual review — human answer conflicts with existing data.', '']
        for e in entries:
            if e['status'] == 'contradiction':
                lines.append(f'- **{e["affected_item_id"]}** ({e["answer_type"]}): {e["audit_note"]}')

    lines += [
        '',
        '## Teaching Loop Status',
        '',
        f'Pending review questions: {meta.get("n_pending_questions", "unknown")}',
        '',
        '## Next Steps',
        '',
        '- Run `19_run_plan_scanner_pipeline.py` to refresh pipeline status',
        '- Pending: legend label extraction (requires ANTHROPIC_API_KEY)',
        '- Pending: BOQ approval workflow (separate human gate)',
        '',
        '---',
        '*Research output. Not approved for construction, procurement, billing, or execution.*',
    ]
    return '\n'.join(lines)


STATUS_COLOR = {
    'applied':        '#15803d',
    'skipped':        '#b45309',
    'contradiction':  '#dc2626',
    'error':          '#7c3aed',
}

HTML_BADGE = {
    'applied':       '<span style="background:#15803d;color:#fff;padding:2px 6px;border-radius:3px;font-size:11px">applied</span>',
    'skipped':       '<span style="background:#b45309;color:#fff;padding:2px 6px;border-radius:3px;font-size:11px">skipped</span>',
    'contradiction': '<span style="background:#dc2626;color:#fff;padding:2px 6px;border-radius:3px;font-size:11px">⚠ contradiction</span>',
    'error':         '<span style="background:#7c3aed;color:#fff;padding:2px 6px;border-radius:3px;font-size:11px">error</span>',
}


def build_html(summary: Dict) -> str:
    meta    = summary['meta']
    entries = summary['applied_entries']
    sc      = _status_counts(entries)
    ts      = meta['generated_at']

    count_cards = ''.join(
        f'<div style="display:inline-block;background:#fff;border:2px solid {STATUS_COLOR.get(s,"#555")};'
        f'border-radius:8px;padding:8px 16px;margin:4px;text-align:center;min-width:70px">'
        f'<div style="font-size:22px;font-weight:bold;color:{STATUS_COLOR.get(s,"#555")}">{n}</div>'
        f'<div style="font-size:11px;color:#555">{s}</div></div>'
        for s, n in sc.items()
    )

    entry_rows = ''
    for e in entries:
        badge = HTML_BADGE.get(e['status'], e['status'])
        entry_rows += (
            f'<tr>'
            f'<td>{badge}</td>'
            f'<td><code>{e["answer_id"]}</code></td>'
            f'<td><code>{e["answer_type"]}</code></td>'
            f'<td><code>{e["affected_item_id"]}</code></td>'
            f'<td style="font-size:12px;color:#374151">{e["audit_note"][:100]}</td>'
            f'<td style="font-size:11px;color:#6b7280">{e["scope"]}</td>'
            f'</tr>\n'
        )

    no_answers_banner = ''
    if not meta['answers_file_exists']:
        no_answers_banner = (
            '<div style="background:#fef3c7;border:2px solid #f59e0b;border-radius:8px;padding:14px 18px;margin:12px 0">'
            '<strong>No real answers file found.</strong><br>'
            f'Create <code>outputs/human_review_answers.json</code> from the example template to start the teaching loop.<br>'
            f'Template: <code>{OUT_EXAMPLE.relative_to(SCRIPT_DIR)}</code>'
            '</div>'
        )

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Human Review Write-Back Report — S10</title>
<style>
  body {{font-family: system-ui, sans-serif; margin: 24px; background: #f9fafb; color: #111;}}
  h1 {{color: #1e3a5f; font-size: 1.4rem;}}
  h2 {{font-size: 1.05rem; margin-top: 28px; border-bottom: 2px solid #e5e7eb; padding-bottom: 5px;}}
  table {{border-collapse: collapse; width: 100%; background: #fff; font-size: 13px; margin-top: 8px;}}
  th, td {{border: 1px solid #e5e7eb; padding: 5px 10px; text-align: left;}}
  th {{background: #f1f5f9; font-weight: 600;}}
  code {{background: #f1f5f9; padding: 1px 4px; border-radius: 3px; font-size: 12px;}}
  .disclaimer {{background: #fef2f2; border: 2px solid #fca5a5; border-radius: 8px; padding: 10px 16px; margin: 12px 0;}}
  .teaching-box {{background: #f0fdf4; border: 2px solid #86efac; border-radius: 8px; padding: 14px 18px; margin: 12px 0;}}
</style>
</head>
<body>
<h1>Human Review Write-Back Report — Stage S10 (תרגול ולמידה)</h1>

<div class="disclaimer">
  ⚠ <strong>RESEARCH-ONLY — NOT APPROVED BOQ DATA</strong> &nbsp;|&nbsp;
  <code>approved_for_boq: false</code> &nbsp;|&nbsp;
  <code>still_requires_boq_approval: true</code> on all human-confirmed items
</div>

<p><strong>Generated:</strong> <code>{ts}</code> &nbsp;|&nbsp;
   <strong>Answers file:</strong> {"<code>✅ exists</code>" if meta["answers_file_exists"] else "<code>❌ not found</code>"} &nbsp;|&nbsp;
   <strong>Answers loaded:</strong> {meta["n_answers_loaded"]}
</p>

{no_answers_banner}

<h2>Resolution Counts</h2>
<div style="margin: 10px 0">{count_cards}</div>

<h2>Applied Changes</h2>
<table>
  <tr><th>Status</th><th>Answer ID</th><th>Type</th><th>Item</th><th>Note</th><th>Scope</th></tr>
  {entry_rows if entry_rows else '<tr><td colspan="6" style="color:#6b7280"><em>No changes applied.</em></td></tr>'}
</table>

<div class="teaching-box">
  <h3 style="margin:0 0 8px">Teaching Loop — תרגול ולמידה</h3>
  <strong>Pending questions:</strong> {meta.get("n_pending_questions", 0)}<br>
  <strong>How to resolve:</strong> Copy <code>outputs/human_review_answers.example.json</code> →
  <code>outputs/human_review_answers.json</code>, fill in real answers, re-run this script.<br>
  <strong>Scope model:</strong> <code>current_plan_only</code> (default) →
  <code>project_rule</code> → <code>company_rule_candidate</code>
</div>

<hr style="margin-top:32px">
<p style="color:#9ca3af;font-size:11px">
  Generated by 23_human_review_writeback.py &nbsp;|&nbsp;
  REMINDER: Not approved for construction, procurement, billing, or execution.
</p>
</body></html>'''


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    t0 = time.time()
    ts = time.strftime('%Y-%m-%dT%H:%M:%S')
    print('=' * 60)
    print('Stage S10 — Human Review Write-Back (תרגול ולמידה)')
    print('23_human_review_writeback.py')
    print(f'Run: {ts}')
    print('=' * 60)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Always write the example template
    print(f'\n[Template] Writing example answers template ...')
    example = build_example_json()
    save_json(OUT_EXAMPLE, example)
    print(f'  → {OUT_EXAMPLE.relative_to(SCRIPT_DIR)}')

    # Check for real answers file
    answers_file_exists = IN_ANSWERS.exists()
    print(f'\n[Answers] {IN_ANSWERS.relative_to(SCRIPT_DIR)} — {"found" if answers_file_exists else "NOT FOUND"}')

    answers: List[Dict] = []
    if answers_file_exists:
        raw = load_json(IN_ANSWERS, {})
        answers = raw.get('answers', []) if isinstance(raw, dict) else []
        # Guard: do not apply example file as real answers
        if raw.get('_comment') and 'TEMPLATE' in str(raw.get('_comment', '')):
            print('[Warn] Loaded file appears to be the example template — skipping to avoid applying example answers')
            answers = []
        print(f'[Answers] Loaded {len(answers)} answers')
    else:
        print('[Answers] No real answers file — generating template only, applying 0 answers')

    # Apply answers
    all_entries: List[Dict] = []
    if answers:
        print('\n[Apply] Processing answers ...')
        all_entries = apply_all(answers, ts)
        sc = _status_counts(all_entries)
        print(f'[Apply] applied={sc.get("applied",0)} skipped={sc.get("skipped",0)} '
              f'contradiction={sc.get("contradiction",0)} error={sc.get("error",0)}')

    # Count pending review questions
    n_pending = 0
    pr_data = load_json(F_PARTIAL)
    if pr_data:
        for g in pr_data.get('suffix_groups', {}).values():
            if g.get('resolution_status') in ('ambiguous', 'unresolved') and not g.get('human_confirmed'):
                n_pending += len(g.get('review_questions', []))

    # Build application log
    sc = _status_counts(all_entries)
    app_log = {
        'meta': {
            'generated_at':       ts,
            'script':             '23_human_review_writeback.py',
            'answers_file':       str(IN_ANSWERS.relative_to(SCRIPT_DIR)),
            'answers_file_exists':answers_file_exists,
            'n_answers_loaded':   len(answers),
            'n_applied':          sc.get('applied', 0),
            'n_skipped':          sc.get('skipped', 0),
            'n_contradictions':   sc.get('contradiction', 0),
            'n_errors':           sc.get('error', 0),
            'n_pending_questions':n_pending,
            'approved_for_boq':   False,
            'note':               'Research-only. still_requires_boq_approval: true on all annotated items.',
        },
        'applied_entries': all_entries,
    }

    # Write outputs
    print('\n[Write] Saving outputs ...')
    save_json(OUT_LOG, app_log)
    print(f'  → {OUT_LOG.relative_to(SCRIPT_DIR)}')

    OUT_MD.write_text(build_md(app_log))
    print(f'  → {OUT_MD.relative_to(SCRIPT_DIR)}')

    OUT_HTML.write_text(build_html(app_log))
    print(f'  → {OUT_HTML.relative_to(SCRIPT_DIR)}')

    elapsed = time.time() - t0
    m = app_log['meta']
    print(f"""
{'=' * 60}
S10 COMPLETE
{'=' * 60}
  Answers file        : {"found" if m["answers_file_exists"] else "not found (0 applied)"}
  Answers loaded      : {m["n_answers_loaded"]}
  Applied             : {m["n_applied"]}
  Skipped             : {m["n_skipped"]}
  Contradictions      : {m["n_contradictions"]}
  Errors              : {m["n_errors"]}
  Pending questions   : {m["n_pending_questions"]}

  Template            : {OUT_EXAMPLE.relative_to(SCRIPT_DIR)}
  Application log     : {OUT_LOG.relative_to(SCRIPT_DIR)}
  Report              : {OUT_HTML.relative_to(SCRIPT_DIR)}

  Elapsed             : {elapsed:.1f}s

  To start teaching loop:
    cp {OUT_EXAMPLE.relative_to(SCRIPT_DIR)} outputs/human_review_answers.json
    # edit answers / remove example entries
    .venv/bin/python3 23_human_review_writeback.py

  open {OUT_HTML.relative_to(SCRIPT_DIR)}

  REMINDER: approved_for_boq: false on ALL items.
  still_requires_boq_approval: true on all human-confirmed items.
{'=' * 60}
""")


if __name__ == '__main__':
    main()
