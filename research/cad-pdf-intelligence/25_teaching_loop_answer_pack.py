"""
Stage S12 — Teaching Loop Answer Pack
Consolidates all pending human review questions into a structured,
priority-ordered document ready for human input.

Outputs:
  outputs/teaching_loop_answer_pack.json
  outputs/teaching_loop_answer_pack.md
  outputs/teaching_loop_answer_pack.html
  outputs/human_review_answers.template.json
"""

from __future__ import annotations

import json
import math
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

SCRIPT_DIR = Path(__file__).parent
OUT_DIR = SCRIPT_DIR / 'outputs'

# Source files
F_PARTIAL = OUT_DIR / 'partial_code_resolution.json'
F_ELEMENT_GROUPS = OUT_DIR / 'element_groups.json'
F_LEGEND_ROWS = OUT_DIR / 'legend_rows.json'
F_REVIEW_QUEUE = OUT_DIR / 'review_queue.json'
F_BOQ = OUT_DIR / 'boq_unified_draft.json'
F_SCALE = OUT_DIR / 'scale_measurement' / 'results.json'
F_VALIDATION = OUT_DIR / 'validation_results.json'

# Output files
F_JSON = OUT_DIR / 'teaching_loop_answer_pack.json'
F_MD = OUT_DIR / 'teaching_loop_answer_pack.md'
F_HTML = OUT_DIR / 'teaching_loop_answer_pack.html'
F_TEMPLATE = OUT_DIR / 'human_review_answers.template.json'


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def load_json(path: Path) -> Any:
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


PRIORITY_ORDER = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}

QUESTION_TYPE_LABELS = {
    'partial_code_resolution': 'Partial Code Resolution',
    'scale_calibration': 'Scale Calibration',
    'element_group_classification': 'Element Group Classification',
    'color_taxonomy_rule': 'Color Taxonomy Rule',
    'legend_label': 'Legend Label',
    'sign_code_confirmation': 'Sign Code Confirmation',
    'ignore_rule': 'Ignore Rule',
    'boq_review': 'BOQ Review',
}

PRIORITY_COLORS = {
    'critical': '#b71c1c',
    'high': '#e65100',
    'medium': '#f57c00',
    'low': '#388e3c',
}

PIPELINE_PATHS = {
    'partial_code_resolution.json': 'outputs/partial_code_resolution.json',
    'element_groups.json': 'outputs/element_groups.json',
    'legend_rows.json': 'outputs/legend_rows.json',
    'review_queue.json': 'outputs/review_queue.json',
    'boq_unified_draft.json': 'outputs/boq_unified_draft.json',
    'scale_measurement/results.json': 'outputs/scale_measurement/results.json',
    'validation_results.json': 'outputs/validation_results.json',
}


def _q(
    question_id: str,
    question_type: str,
    priority: str,
    business_impact: str,
    affected_items_count: int,
    affected_quantity_if_known: Optional[Any],
    evidence_paths: List[str],
    question_text: str,
    answer_schema: Dict[str, Any],
    example_answer: Dict[str, Any],
    applied_to: str,
    affects_boq: bool = False,
    affects_review_queue: bool = False,
    affects_measurement: bool = False,
    affects_taxonomy: bool = False,
    affects_teaching_rules: bool = False,
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return {
        'question_id': question_id,
        'question_type': question_type,
        'priority': priority,
        'business_impact': business_impact,
        'affected_items_count': affected_items_count,
        'affected_quantity_if_known': affected_quantity_if_known,
        'evidence_paths': evidence_paths,
        'question_text': question_text,
        'answer_schema': answer_schema,
        'example_answer': example_answer,
        'applied_to': applied_to,
        'impact_flags': {
            'affects_boq': affects_boq,
            'affects_review_queue': affects_review_queue,
            'affects_measurement': affects_measurement,
            'affects_taxonomy': affects_taxonomy,
            'affects_teaching_rules': affects_teaching_rules,
        },
        'context': context or {},
        'status': 'pending',
    }


# ─────────────────────────────────────────────
# Question builders
# ─────────────────────────────────────────────

def build_scale_questions(scale_data: Optional[Dict]) -> List[Dict]:
    questions = []
    if scale_data is None:
        scale_info = {'ratio': 500, 'source': 'fallback_assumption', 'status': 'unverified'}
    else:
        scale_info = scale_data.get('scale_info', {})

    if scale_info.get('status') in ('unverified', 'not_calibrated', None):
        questions.append(_q(
            question_id='Q-SCALE-001',
            question_type='scale_calibration',
            priority='critical',
            business_impact=(
                'All linear measurements (road markings, guardrails, barriers) are calculated '
                'using an assumed 1:500 scale that was NOT detected in the PDF. '
                'If the real scale differs, every meter-based quantity in the BOQ is wrong.'
            ),
            affected_items_count=17,
            affected_quantity_if_known='All BOQ-LIN-* items + scale_measurement/results.json',
            evidence_paths=[
                'outputs/scale_measurement/results.json',
                'outputs/scale_measurement/report.html',
                'outputs/boq_unified_draft.json',
            ],
            question_text=(
                'The AutoCAD PDF did not contain a readable scale bar. '
                'The pipeline assumed 1:500 as a fallback.\n\n'
                'To manually calibrate:\n'
                '1. Open the plan PDF in a viewer that shows coordinates.\n'
                '2. Find two points whose real-world distance you know '
                '(e.g., a road section with a marked length, two known survey points).\n'
                '3. Record their PDF coordinates (x, y) in points.\n'
                '4. Record the real-world distance in metres.\n'
                '5. Fill in the fields below.'
            ),
            answer_schema={
                'answer_type': 'scale_calibration',
                'REQUIRED': ['confirmed_scale_ratio'],
                'fields': {
                    'confirmed_scale_ratio': {
                        'type': 'integer',
                        'description': 'Scale denominator (e.g. 500 for 1:500, 250 for 1:250)',
                    },
                    'calibration_method': {
                        'type': 'string',
                        'enum': ['known_distance', 'scale_bar_manual', 'confirmed_fallback'],
                        'description': 'How the scale was determined',
                    },
                    'point_a_pdf': {
                        'type': 'array',
                        'items': 'number',
                        'description': '[x, y] in PDF points for calibration point A',
                    },
                    'point_b_pdf': {
                        'type': 'array',
                        'items': 'number',
                        'description': '[x, y] in PDF points for calibration point B',
                    },
                    'known_distance_m': {
                        'type': 'number',
                        'description': 'Real-world distance in metres between A and B',
                    },
                    'scope': {
                        'type': 'string',
                        'enum': ['current_plan_only', 'project_rule'],
                        'description': 'Whether this scale applies only to this plan or all plans in the project',
                    },
                    'note': {'type': 'string', 'description': 'Optional note'},
                },
            },
            example_answer={
                'answer_type': 'scale_calibration',
                'confirmed_scale_ratio': 500,
                'calibration_method': 'confirmed_fallback',
                'point_a_pdf': None,
                'point_b_pdf': None,
                'known_distance_m': None,
                'scope': 'current_plan_only',
                'note': 'Confirmed: standard municipal plan uses 1:500',
            },
            applied_to='scale_measurement/results.json → re-derives all BOQ-LIN-* quantities',
            affects_boq=True,
            affects_measurement=True,
            context={
                'current_ratio': scale_info.get('ratio', 500),
                'current_source': scale_info.get('source', 'fallback_assumption'),
                'calibration': scale_info.get('calibration', {}),
            },
        ))
    return questions


def build_partial_code_questions(pcr_data: Optional[Dict]) -> List[Dict]:
    questions = []
    if pcr_data is None:
        return questions

    suffix_groups = pcr_data.get('suffix_groups', {})
    results = pcr_data.get('results', [])

    for suffix, grp in suffix_groups.items():
        status = grp.get('resolution_status')
        freq = grp.get('frequency', 0)
        candidates = [c['code'] for c in grp.get('expansion_candidates', [])]
        occ_ids = [r['occurrence_id'] for r in results if r.get('partial_code') == int(suffix)]

        if status == 'ambiguous':
            questions.append(_q(
                question_id=f'Q-PCR-{suffix}',
                question_type='partial_code_resolution',
                priority='critical',
                business_impact=(
                    f'{freq} sign occurrence(s) detected with reconstructed code "{suffix}" — '
                    f'a 2-digit sequence that cannot map to any Israeli traffic sign (minimum 3 digits). '
                    f'These cannot be added to the BOQ until the correct 3-digit code is confirmed. '
                    f'Valid expansions found in catalog: {candidates}.'
                ),
                affected_items_count=freq,
                affected_quantity_if_known=freq,
                evidence_paths=[
                    f'outputs/review_items/{occ_id}.png' for occ_id in occ_ids
                ] + [
                    f'outputs/vector_glyph_debug/medium/{occ_id}_debug.png' for occ_id in occ_ids
                ] + [
                    'outputs/partial_code_resolution_report.html',
                    'outputs/partial_code_resolution.json',
                ],
                question_text=(
                    f'The vector glyph recognition system detected a 2-digit sequence "{suffix}" '
                    f'on {freq} sign occurrence(s): {", ".join(occ_ids)}.\n\n'
                    f'The leading digit is missing (likely due to proximity to adjacent graphics '
                    f'causing the pipeline to read only the last 2 digits).\n\n'
                    f'Valid 3-digit expansions in the Israeli sign catalog:\n'
                    + '\n'.join(
                        f'  • {c} — {_sign_series_label(c)}'
                        for c in candidates
                    )
                    + f'\n\nPlease review the crop images for these {freq} occurrence(s) and '
                    f'confirm which 3-digit sign code is correct, OR provide a new code if none match.'
                ),
                answer_schema={
                    'answer_type': 'partial_code_resolution',
                    'REQUIRED': ['suffix', 'confirmed_code'],
                    'fields': {
                        'suffix': {
                            'type': 'string',
                            'description': f'Must be "{suffix}"',
                            'const': suffix,
                        },
                        'confirmed_code': {
                            'type': ['integer', 'null'],
                            'description': (
                                f'The confirmed 3-digit sign code. '
                                f'Choose from {candidates} or enter a new valid code. '
                                f'null = cannot be determined (marks as unresolvable).'
                            ),
                        },
                        'scope': {
                            'type': 'string',
                            'enum': ['current_plan_only', 'project_rule'],
                        },
                        'note': {'type': 'string'},
                    },
                },
                example_answer={
                    'answer_type': 'partial_code_resolution',
                    'suffix': suffix,
                    'confirmed_code': candidates[0] if candidates else None,
                    'scope': 'current_plan_only',
                    'note': f'Reviewed crop images — leading digit is clearly X, therefore code is {candidates[0] if candidates else "?"}',
                },
                applied_to=(
                    'partial_code_resolution.json (all ambiguous results for this suffix) → '
                    'review_queue.json (sets human_confirmed_code) → '
                    'BOQ-FUTURE-001 (human-approved sign code quantity)'
                ),
                affects_boq=True,
                affects_review_queue=True,
                affects_teaching_rules=True,
                context={
                    'suffix': suffix,
                    'occurrence_ids': occ_ids,
                    'expansion_candidates': candidates,
                    'resolution_status': status,
                    't3_ranked': grp.get('t3_ranked', []),
                },
            ))

        elif status == 'invalid_partial':
            questions.append(_q(
                question_id=f'Q-PCR-{suffix}',
                question_type='partial_code_resolution',
                priority='high',
                business_impact=(
                    f'1 occurrence (OCC-{occ_ids[0] if occ_ids else "?"}) produced code "{suffix}" '
                    f'which has NO valid 3-digit expansion in the Israeli traffic sign catalog. '
                    f'It may be a noise artifact, a non-standard sign, or an OCR/vector error. '
                    f'Decision needed: ignore it, or manually enter a code.'
                ),
                affected_items_count=1,
                affected_quantity_if_known=1,
                evidence_paths=[
                    f'outputs/review_items/{occ_id}.png' for occ_id in occ_ids
                ] + [
                    'outputs/partial_code_resolution_report.html',
                ],
                question_text=(
                    f'Occurrence {occ_ids[0] if occ_ids else "unknown"} produced a code "{suffix}" '
                    f'with no valid 3-digit expansion in any Israeli sign series (101–935).\n\n'
                    f'Please review the crop image and choose one:\n'
                    f'  A) Enter the correct sign code manually (if you can read it from the plan)\n'
                    f'  B) Mark as noise/artifact (to be excluded from BOQ)\n'
                    f'  C) Flag for site survey (unknown — needs physical inspection)'
                ),
                answer_schema={
                    'answer_type': 'partial_code_resolution',
                    'REQUIRED': ['suffix', 'confirmed_code'],
                    'fields': {
                        'suffix': {'type': 'string', 'const': suffix},
                        'confirmed_code': {
                            'type': ['integer', 'null'],
                            'description': 'Correct code if known, or null to mark unresolvable',
                        },
                        'mark_as_noise': {
                            'type': 'boolean',
                            'description': 'Set true if this is a noise artifact to exclude',
                        },
                        'scope': {
                            'type': 'string',
                            'enum': ['current_plan_only', 'project_rule'],
                        },
                        'note': {'type': 'string'},
                    },
                },
                example_answer={
                    'answer_type': 'partial_code_resolution',
                    'suffix': suffix,
                    'confirmed_code': None,
                    'mark_as_noise': True,
                    'scope': 'current_plan_only',
                    'note': 'Reviewed crop — appears to be a stray hairline artifact, not a real sign.',
                },
                applied_to='review_queue.json → marks occurrence as excluded or assigns confirmed_code',
                affects_boq=True,
                affects_review_queue=True,
                context={'suffix': suffix, 'occurrence_ids': occ_ids},
            ))

    return questions


def _sign_series_label(code: int) -> str:
    series = [
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
    for lo, hi, label in series:
        if lo <= code <= hi:
            return label
    return 'Unknown series'


def build_element_group_questions(eg_data: Optional[Dict]) -> List[Dict]:
    questions = []
    if eg_data is None:
        return questions

    groups = eg_data.get('groups', [])
    review_groups = [g for g in groups if g.get('classification') == 'review']

    # Sort by n_paths descending (highest impact first)
    review_groups = sorted(review_groups, key=lambda g: g.get('n_paths', 0), reverse=True)

    for g in review_groups:
        gid = g['group_id']
        n_paths = g.get('n_paths', 0)
        rgb8 = g.get('color_rgb8', [0, 0, 0])
        color_key = g.get('color_key', '')
        element_type = g.get('element_type', 'unknown')

        # Priority based on path count
        if n_paths > 50000:
            priority = 'critical'
        elif n_paths > 5000:
            priority = 'high'
        elif n_paths > 500:
            priority = 'medium'
        else:
            priority = 'low'

        rgb_str = f'rgb({rgb8[0]}, {rgb8[1]}, {rgb8[2]})' if rgb8 else 'unknown'

        questions.append(_q(
            question_id=f'Q-EG-{gid}',
            question_type='element_group_classification',
            priority=priority,
            business_impact=(
                f'{n_paths:,} vector paths in this color group are unclassified. '
                f'Without knowing what this color represents, these paths cannot be '
                f'included in any BOQ line item with confidence. '
                f'Color: {rgb_str} ({color_key}).'
            ),
            affected_items_count=n_paths,
            affected_quantity_if_known=n_paths,
            evidence_paths=[
                f'outputs/element_decomposition/{gid}_sample.png'
                if (OUT_DIR / 'element_decomposition' / f'{gid}_sample.png').exists()
                else f'outputs/element_groups_report.html',
                'outputs/element_groups.json',
            ],
            question_text=(
                f'Element group {gid} contains {n_paths:,} vector paths with color {rgb_str}.\n'
                f'Current auto-classification: {element_type} (provisional, requires_review=True).\n\n'
                f'Please look at the plan and identify what this color represents:\n'
                f'  • Road marking (white, yellow, blue stripes)\n'
                f'  • Sign glyph (gray hairline — sign code vector)\n'
                f'  • Guardrail / safety barrier\n'
                f'  • Structural element (wall, curb, island)\n'
                f'  • Utility / infrastructure (cable, pipe)\n'
                f'  • Background / fill (not a real element)\n'
                f'  • Noise artifact (to exclude)\n'
                f'  • Other (describe in note)'
            ),
            answer_schema={
                'answer_type': 'element_group_classification',
                'REQUIRED': ['group_id', 'confirmed_element_type', 'include_in_boq'],
                'fields': {
                    'group_id': {'type': 'string', 'const': gid},
                    'confirmed_element_type': {
                        'type': 'string',
                        'enum': [
                            'road_marking', 'sign_glyph', 'guardrail', 'barrier',
                            'structural_element', 'utility_line', 'background_fill',
                            'noise_artifact', 'other',
                        ],
                    },
                    'confirmed_description_he': {
                        'type': ['string', 'null'],
                        'description': 'Hebrew name for this element type',
                    },
                    'confirmed_description_en': {
                        'type': ['string', 'null'],
                        'description': 'English name for this element type',
                    },
                    'include_in_boq': {
                        'type': 'boolean',
                        'description': 'Should paths of this color be counted in the BOQ?',
                    },
                    'boq_category': {
                        'type': ['string', 'null'],
                        'description': 'BOQ line item category if include_in_boq=true',
                    },
                    'scope': {
                        'type': 'string',
                        'enum': ['current_plan_only', 'project_rule', 'company_rule_candidate'],
                    },
                    'note': {'type': 'string'},
                },
            },
            example_answer={
                'answer_type': 'element_group_classification',
                'group_id': gid,
                'confirmed_element_type': 'road_marking',
                'confirmed_description_he': 'סימון כביש',
                'confirmed_description_en': 'Road marking',
                'include_in_boq': True,
                'boq_category': 'road_markings_m',
                'scope': 'project_rule',
                'note': 'Checked plan — this blue matches the road marking legend entry.',
            },
            applied_to=(
                f'element_groups.json (updates {gid}) → '
                'boq_unified_draft.json (updates corresponding BOQ-EG-* items)'
            ),
            affects_boq=True,
            affects_taxonomy=True,
            affects_teaching_rules=True,
            context={
                'group_id': gid,
                'color_key': color_key,
                'color_rgb8': rgb8,
                'color_rgb_str': rgb_str,
                'n_paths': n_paths,
                'current_element_type': element_type,
                'current_classification': g.get('classification'),
            },
        ))
    return questions


def build_legend_label_questions(legend_data: Any) -> List[Dict]:
    questions = []
    if legend_data is None:
        return questions

    rows = legend_data if isinstance(legend_data, list) else legend_data.get('rows', [])
    unlabeled = [r for r in rows if not r.get('hebrew_label')]

    for row in unlabeled:
        row_idx = row.get('row_index', row.get('index', '?'))
        icon_path = row.get('icon_crop_path', '')
        questions.append(_q(
            question_id=f'Q-LGD-{str(row_idx).zfill(3)}',
            question_type='legend_label',
            priority='medium',
            business_impact=(
                'This legend row defines what a color/pattern means on the plan. '
                'Without this label, the element type for that color is inferred only. '
                'Each unlabeled legend row affects the accuracy of BOQ color taxonomy.'
            ),
            affected_items_count=1,
            affected_quantity_if_known=None,
            evidence_paths=[
                f'outputs/{icon_path}' if icon_path else 'outputs/legend_region_crop.png',
                'outputs/legend_extraction_report.md',
                'outputs/legend_rows.json',
            ],
            question_text=(
                f'Legend row {row_idx} has no label (the OCR pipeline could not extract Hebrew text).\n\n'
                f'Please open the plan PDF, locate the legend (מקרא מפה), '
                f'find row {row_idx} (zero-indexed from the top of the legend), '
                f'and enter the label and, if present, the sign code and quantity.'
            ),
            answer_schema={
                'answer_type': 'legend_label',
                'REQUIRED': ['row_index', 'hebrew_label'],
                'fields': {
                    'row_index': {'type': 'integer', 'const': row_idx},
                    'hebrew_label': {
                        'type': 'string',
                        'description': 'Full Hebrew label as it appears in the legend',
                    },
                    'english_label': {
                        'type': ['string', 'null'],
                        'description': 'English translation (optional)',
                    },
                    'sign_code': {
                        'type': ['integer', 'null'],
                        'description': 'Sign code if this row represents a specific traffic sign',
                    },
                    'quantity': {
                        'type': ['number', 'null'],
                        'description': 'Quantity shown in legend (if present)',
                    },
                    'color_rgb': {
                        'type': ['array', 'null'],
                        'items': 'integer',
                        'description': '[R, G, B] of the legend icon color (optional)',
                    },
                    'scope': {'type': 'string', 'enum': ['current_plan_only']},
                    'note': {'type': 'string'},
                },
            },
            example_answer={
                'answer_type': 'legend_label',
                'row_index': row_idx,
                'hebrew_label': 'תמרור אזהרה',
                'english_label': 'Warning sign',
                'sign_code': 133,
                'quantity': 6,
                'color_rgb': None,
                'scope': 'current_plan_only',
                'note': '',
            },
            applied_to='legend_rows.json → legend_vocabulary.json → color_taxonomy → BOQ-FLAG-003',
            affects_boq=True,
            affects_taxonomy=True,
            context={
                'row_index': row_idx,
                'row_bbox': row.get('row_bbox'),
                'icon_crop_path': icon_path,
                'current_hebrew_label': row.get('hebrew_label'),
                'current_sign_code': row.get('sign_code'),
                'current_quantity': row.get('quantity'),
            },
        ))
    return questions


def build_sign_code_confirmation_questions(rq_data: Optional[List]) -> List[Dict]:
    questions = []
    if not rq_data:
        return questions

    # Group by suspected issue and priority
    by_issue: Dict[str, List] = {}
    for item in rq_data:
        prio = item.get('review_priority', 'LOW')
        issue = item.get('suspected_issue', 'unknown')
        if prio not in ('HIGH', 'MEDIUM'):
            continue
        # Skip items already resolved
        if item.get('human_confirmed_code') and not item.get('still_requires_boq_approval'):
            continue
        key = f'{prio}_{issue}'
        by_issue.setdefault(key, []).append(item)

    # CRITICAL: incomplete_code HIGH items (no vector code at all)
    incomplete_high = [
        i for i in rq_data
        if i.get('review_priority') == 'HIGH'
        and i.get('suspected_issue') == 'incomplete_code'
        and not i.get('human_confirmed_code')
    ]
    if incomplete_high:
        occ_ids = [i['occurrence_id'] for i in incomplete_high]
        questions.append(_q(
            question_id='Q-SCC-INCOMPLETE',
            question_type='sign_code_confirmation',
            priority='high',
            business_impact=(
                f'{len(incomplete_high)} sign occurrence(s) could not produce any digit sequence — '
                f'the vector glyph recognition system found no recoverable code. '
                f'These cannot be typed automatically. Manual code entry from the plan is required.'
            ),
            affected_items_count=len(incomplete_high),
            affected_quantity_if_known=len(incomplete_high),
            evidence_paths=[
                f'outputs/review_items/{occ_id}.png' for occ_id in occ_ids[:8]
            ] + ['outputs/review_queue.html'],
            question_text=(
                f'The following {len(incomplete_high)} occurrence(s) produced no recoverable '
                f'sign code from vector analysis: {", ".join(occ_ids)}.\n\n'
                f'For each occurrence, please open the corresponding crop image '
                f'(outputs/review_items/<OCC_ID>.png) and manually enter the sign code '
                f'you can read from the plan.'
            ),
            answer_schema={
                'answer_type': 'sign_code_confirmation',
                'REQUIRED': ['occurrence_id', 'confirmed_code'],
                'fields': {
                    'occurrence_id': {
                        'type': 'string',
                        'description': f'One of: {occ_ids}',
                    },
                    'confirmed_code': {
                        'type': ['integer', 'null'],
                        'description': 'Sign code read from plan. null = cannot read.',
                    },
                    'label_source': {'type': 'string', 'const': 'human_manual'},
                    'scope': {
                        'type': 'string',
                        'enum': ['current_plan_only', 'project_rule'],
                    },
                    'note': {'type': 'string'},
                },
            },
            example_answer={
                'answer_type': 'sign_code_confirmation',
                'occurrence_id': occ_ids[0] if occ_ids else 'OCC-XXXX',
                'confirmed_code': 133,
                'label_source': 'human_manual',
                'scope': 'current_plan_only',
                'note': 'Read directly from plan — sign code visible near pole cluster at km 1.4',
            },
            applied_to=(
                'review_queue.json (sets human_confirmed_code per occurrence) → '
                'BOQ-FUTURE-001 (human-approved sign code quantity)'
            ),
            affects_boq=True,
            affects_review_queue=True,
            context={'occurrence_ids': occ_ids, 'issue': 'incomplete_code'},
        ))

    # MEDIUM: false adjacency + ambiguous cluster
    medium_items = [
        i for i in rq_data
        if i.get('review_priority') == 'MEDIUM'
        and i.get('suspected_issue') in ('false_adjacency_removed', 'ambiguous_cluster')
        and not i.get('human_confirmed_code')
    ]
    if medium_items:
        occ_ids = [i['occurrence_id'] for i in medium_items]
        issue_counts = {}
        for i in medium_items:
            k = i.get('suspected_issue', 'unknown')
            issue_counts[k] = issue_counts.get(k, 0) + 1

        questions.append(_q(
            question_id='Q-SCC-MEDIUM',
            question_type='sign_code_confirmation',
            priority='medium',
            business_impact=(
                f'{len(medium_items)} occurrence(s) with ambiguous or repaired digit sequences. '
                f'Issue breakdown: {", ".join(f"{v}× {k}" for k, v in issue_counts.items())}. '
                f'These may have been over-corrected by the false-adjacency filter, '
                f'or the cluster shape was ambiguous. Manual review can recover valid codes.'
            ),
            affected_items_count=len(medium_items),
            affected_quantity_if_known=len(medium_items),
            evidence_paths=[
                f'outputs/review_items/{occ_id}.png' for occ_id in occ_ids[:8]
            ] + ['outputs/review_queue.html'],
            question_text=(
                f'The following {len(medium_items)} occurrence(s) have ambiguous or '
                f'repaired sign codes: {", ".join(occ_ids)}.\n\n'
                f'For false_adjacency_removed items: the pipeline removed a glyph it thought '
                f'was a spurious adjacency artifact — it may have been wrong.\n'
                f'For ambiguous_cluster items: the cluster shape matched multiple code patterns.\n\n'
                f'Please review crop images and confirm or correct the sign code for each.'
            ),
            answer_schema={
                'answer_type': 'sign_code_confirmation',
                'REQUIRED': ['occurrence_id', 'confirmed_code'],
                'fields': {
                    'occurrence_id': {'type': 'string'},
                    'confirmed_code': {'type': ['integer', 'null']},
                    'label_source': {'type': 'string', 'const': 'human_manual'},
                    'scope': {'type': 'string', 'enum': ['current_plan_only', 'project_rule']},
                    'note': {'type': 'string'},
                },
            },
            example_answer={
                'answer_type': 'sign_code_confirmation',
                'occurrence_id': occ_ids[0] if occ_ids else 'OCC-XXXX',
                'confirmed_code': 401,
                'label_source': 'human_manual',
                'scope': 'current_plan_only',
                'note': 'False adjacency filter was wrong — leading digit 4 is clearly visible in crop.',
            },
            applied_to='review_queue.json (sets human_confirmed_code) → BOQ-FUTURE-001',
            affects_boq=True,
            affects_review_queue=True,
            context={'occurrence_ids': occ_ids, 'issue_breakdown': issue_counts},
        ))

    return questions


def build_color_taxonomy_questions(eg_data: Optional[Dict]) -> List[Dict]:
    questions = []
    if eg_data is None:
        return questions

    groups = eg_data.get('groups', [])
    # Red element — confirmed in plan but type unknown (G-004 has classification=include but still flagged)
    red_group = next((g for g in groups if g.get('element_type') == 'red_element'), None)

    if red_group:
        questions.append(_q(
            question_id='Q-CTX-RED',
            question_type='color_taxonomy_rule',
            priority='high',
            business_impact=(
                f'The red color group (G-004, rgb(255,0,0)) contains {red_group.get("n_paths", 0):,} paths '
                f'classified as "red_element" — a generic placeholder. '
                f'The BOQ line item (BOQ-LIN-002) shows 1,948 m of "Red Element (unidentified)". '
                f'This needs a real element type name for the BOQ to be client-readable.'
            ),
            affected_items_count=1,
            affected_quantity_if_known='BOQ-LIN-002: 1948.2 m',
            evidence_paths=[
                'outputs/element_groups_report.html',
                'outputs/legend_region_crop.png',
                'outputs/boq_unified_draft.json',
            ],
            question_text=(
                'The plan contains a red color layer (RGB 255,0,0) with ~16,034 paths. '
                'The pipeline classified it as "red_element" (a placeholder).\n\n'
                'Please check the plan legend to confirm what the red color represents. '
                'Common options:\n'
                '  • Guardrail (מעקה)\n'
                '  • Safety barrier / Jersey barrier (מחסום בטיחות)\n'
                '  • Demolition / removal zone (הריסה)\n'
                '  • Proposed road element (הצעה)\n'
                '  • Other — describe in note'
            ),
            answer_schema={
                'answer_type': 'color_taxonomy_rule',
                'REQUIRED': ['color_rgb', 'confirmed_element_type'],
                'fields': {
                    'color_rgb': {
                        'type': 'array',
                        'items': 'integer',
                        'const': [255, 0, 0],
                    },
                    'confirmed_element_type': {
                        'type': 'string',
                        'enum': [
                            'guardrail', 'safety_barrier', 'demolition_zone',
                            'proposed_element', 'road_marking', 'other',
                        ],
                    },
                    'confirmed_description_he': {'type': 'string'},
                    'confirmed_description_en': {'type': 'string'},
                    'scope': {
                        'type': 'string',
                        'enum': ['current_plan_only', 'project_rule', 'company_rule_candidate'],
                    },
                    'note': {'type': 'string'},
                },
            },
            example_answer={
                'answer_type': 'color_taxonomy_rule',
                'color_rgb': [255, 0, 0],
                'confirmed_element_type': 'guardrail',
                'confirmed_description_he': 'מעקה',
                'confirmed_description_en': 'Guardrail',
                'scope': 'current_plan_only',
                'note': 'Red = guardrail per legend row 3.',
            },
            applied_to=(
                'element_groups.json (G-004 description fields) → '
                'boq_unified_draft.json (BOQ-LIN-002 description) → '
                'scale_measurement/results.json (color taxonomy)'
            ),
            affects_boq=True,
            affects_taxonomy=True,
            context={
                'group_id': red_group.get('group_id'),
                'n_paths': red_group.get('n_paths'),
                'current_element_type': red_group.get('element_type'),
            },
        ))

    return questions


def build_ignore_rule_questions(eg_data: Optional[Dict]) -> List[Dict]:
    questions = []
    if eg_data is None:
        return questions

    groups = eg_data.get('groups', [])
    # Groups with very few paths that are still unclassified
    tiny_groups = [
        g for g in groups
        if g.get('classification') == 'review' and g.get('n_paths', 0) < 10
    ]
    if tiny_groups:
        gids = [g['group_id'] for g in tiny_groups]
        details = [(g['group_id'], g['n_paths'], g.get('color_rgb8', [])) for g in tiny_groups]
        questions.append(_q(
            question_id='Q-IGN-TINY',
            question_type='ignore_rule',
            priority='low',
            business_impact=(
                f'{len(tiny_groups)} color groups have fewer than 10 paths each '
                f'and are unclassified. Combined they represent < 50 paths. '
                f'Decision: ignore (exclude from BOQ) or investigate individually.'
            ),
            affected_items_count=len(tiny_groups),
            affected_quantity_if_known=sum(g.get('n_paths', 0) for g in tiny_groups),
            evidence_paths=['outputs/element_groups_report.html', 'outputs/element_groups.json'],
            question_text=(
                f'The following {len(tiny_groups)} element groups each have fewer than 10 vector paths '
                f'and could not be classified automatically:\n\n'
                + '\n'.join(
                    f'  • {gid}: {n} path(s), RGB {rgb}'
                    for gid, n, rgb in details
                )
                + '\n\nShould these tiny groups be:\n'
                '  A) Ignored (noise/stray artifacts — exclude from BOQ)\n'
                '  B) Investigated individually (each may have meaning)\n\n'
                'If you choose B, separate element_group_classification questions will be needed.'
            ),
            answer_schema={
                'answer_type': 'ignore_rule',
                'REQUIRED': ['group_ids', 'decision'],
                'fields': {
                    'group_ids': {
                        'type': 'array',
                        'items': 'string',
                        'description': f'Must be a subset of {gids}',
                    },
                    'decision': {
                        'type': 'string',
                        'enum': ['ignore_all', 'investigate_individually'],
                    },
                    'scope': {
                        'type': 'string',
                        'enum': ['current_plan_only', 'project_rule'],
                    },
                    'note': {'type': 'string'},
                },
            },
            example_answer={
                'answer_type': 'ignore_rule',
                'group_ids': gids,
                'decision': 'ignore_all',
                'scope': 'current_plan_only',
                'note': 'These appear to be rendering artifacts from the PDF export.',
            },
            applied_to='element_groups.json (sets classification=ignore for listed groups)',
            affects_boq=False,
            affects_taxonomy=True,
            context={'group_ids': gids, 'details': details},
        ))
    return questions


def build_boq_review_questions(boq_data: Optional[Dict]) -> List[Dict]:
    questions = []
    if boq_data is None:
        return questions

    items = boq_data.get('items', [])
    scale_items = [i for i in items if i.get('boq_item_id', '').startswith('BOQ-LIN-')]
    count_items = [i for i in items if i.get('boq_item_id', '').startswith('BOQ-CNT-')]
    flag_items = [i for i in items if i.get('boq_item_id', '').startswith('BOQ-FLAG-')]

    if scale_items:
        total_m = sum(
            i.get('quantity', 0) or 0
            for i in scale_items
            if isinstance(i.get('quantity'), (int, float))
        )
        questions.append(_q(
            question_id='Q-BOQ-SCALE',
            question_type='boq_review',
            priority='medium',
            business_impact=(
                f'All {len(scale_items)} linear BOQ items total ~{total_m:,.0f} m but use '
                f'an unverified 1:500 scale. If scale is wrong, all quantities are wrong. '
                f'Answer Q-SCALE-001 first — this question is blocked until scale is confirmed.'
            ),
            affected_items_count=len(scale_items),
            affected_quantity_if_known=f'{total_m:,.0f} m (provisional)',
            evidence_paths=[
                'outputs/boq_unified_report.html',
                'outputs/scale_measurement/report.html',
            ],
            question_text=(
                f'After confirming the scale (Q-SCALE-001), review the {len(scale_items)} linear BOQ '
                f'items below.\n\nFor each item, confirm whether:\n'
                f'  • The element type name is correct for your BOQ\n'
                f'  • The quantity is in the expected order of magnitude\n'
                f'  • The deduplication result looks reasonable\n\n'
                f'Items: {", ".join(i["boq_item_id"] for i in scale_items)}'
            ),
            answer_schema={
                'answer_type': 'boq_review',
                'REQUIRED': ['boq_item_id', 'review_decision'],
                'fields': {
                    'boq_item_id': {'type': 'string'},
                    'review_decision': {
                        'type': 'string',
                        'enum': ['accept_quantity', 'reject_quantity', 'flag_for_site_survey'],
                    },
                    'override_quantity': {
                        'type': ['number', 'null'],
                        'description': 'Override quantity in same unit if reject_quantity',
                    },
                    'note': {'type': 'string'},
                },
            },
            example_answer={
                'answer_type': 'boq_review',
                'boq_item_id': 'BOQ-LIN-001',
                'review_decision': 'accept_quantity',
                'override_quantity': None,
                'note': 'Road marking quantity of 2639 m matches site expectation.',
            },
            applied_to='boq_unified_draft.json (review_decision field per item)',
            affects_boq=True,
            context={
                'boq_item_ids': [i['boq_item_id'] for i in scale_items],
                'total_provisional_m': total_m,
                'blocked_by': 'Q-SCALE-001',
            },
        ))

    if count_items:
        questions.append(_q(
            question_id='Q-BOQ-CNT',
            question_type='boq_review',
            priority='medium',
            business_impact=(
                f'{len(count_items)} count-based BOQ items (poles, sign plates, assemblies) '
                f'are not confirmed by site survey. The pipeline counted 177 sign plate '
                f'occurrences and 119 pole locations but these may include noise clusters '
                f'or miss occluded signs.'
            ),
            affected_items_count=len(count_items),
            affected_quantity_if_known='177 sign plates, 119 poles (provisional)',
            evidence_paths=[
                'outputs/boq_unified_report.html',
                'outputs/sign_inventory_debug_overlay.png',
                'outputs/pole_cluster_zoom.png',
            ],
            question_text=(
                f'Review the {len(count_items)} count-based BOQ items. '
                f'The pipeline detected:\n'
                f'  • 177 sign plate occurrences (all gray clusters)\n'
                f'  • 119 pole/post locations\n'
                f'  • 119 sign assemblies (pole + plates)\n\n'
                f'Please cross-reference with your site survey data or plan count and confirm '
                f'whether these quantities are reasonable. '
                f'Note: each item still requires_review=True and approved_for_boq=False.'
            ),
            answer_schema={
                'answer_type': 'boq_review',
                'REQUIRED': ['boq_item_id', 'review_decision'],
                'fields': {
                    'boq_item_id': {'type': 'string'},
                    'review_decision': {
                        'type': 'string',
                        'enum': ['accept_quantity', 'reject_quantity', 'flag_for_site_survey'],
                    },
                    'override_quantity': {'type': ['integer', 'null']},
                    'note': {'type': 'string'},
                },
            },
            example_answer={
                'answer_type': 'boq_review',
                'boq_item_id': 'BOQ-CNT-002',
                'review_decision': 'flag_for_site_survey',
                'override_quantity': None,
                'note': 'Plan is too complex to count manually — will confirm on site.',
            },
            applied_to='boq_unified_draft.json (review_decision field per item)',
            affects_boq=True,
            context={'boq_item_ids': [i['boq_item_id'] for i in count_items]},
        ))

    return questions


# ─────────────────────────────────────────────
# Consolidate + sort
# ─────────────────────────────────────────────

def build_all_questions(
    scale_data, pcr_data, eg_data, legend_data, rq_data, boq_data
) -> List[Dict]:
    questions = []
    questions += build_scale_questions(scale_data)
    questions += build_partial_code_questions(pcr_data)
    questions += build_color_taxonomy_questions(eg_data)
    questions += build_sign_code_confirmation_questions(rq_data)
    questions += build_element_group_questions(eg_data)
    questions += build_legend_label_questions(legend_data)
    questions += build_boq_review_questions(boq_data)
    questions += build_ignore_rule_questions(eg_data)

    # Sort: priority first, then question_id
    questions.sort(key=lambda q: (
        PRIORITY_ORDER.get(q['priority'], 99),
        q['question_id'],
    ))
    return questions


# ─────────────────────────────────────────────
# Template builder
# ─────────────────────────────────────────────

def build_template(questions: List[Dict]) -> Dict:
    """Pre-populated stubs with null/FILL_IN values — one entry per question."""
    answers = []
    for q in questions:
        schema = q['answer_schema']
        required = schema.get('REQUIRED', [])
        fields = schema.get('fields', {})
        stub: Dict[str, Any] = {
            '_question_id': q['question_id'],
            '_question_type': q['question_type'],
            '_priority': q['priority'],
            '_business_impact': q['business_impact'],
            '_status': 'FILL_IN',
            '_comment': (
                f'TEMPLATE — fill in fields marked FILL_IN or null. '
                f'Required: {required}. Remove this _comment line when done.'
            ),
        }
        # Populate with null or FILL_IN
        for field, spec in fields.items():
            if isinstance(spec, dict):
                if 'const' in spec:
                    stub[field] = spec['const']
                elif spec.get('type') == 'boolean':
                    stub[field] = None
                elif spec.get('type') in ('integer', 'number'):
                    stub[field] = None
                elif spec.get('type') == 'array':
                    stub[field] = None
                else:
                    stub[field] = 'FILL_IN' if field in required else None
            else:
                stub[field] = None
        answers.append(stub)

    return {
        '_comment': (
            'Teaching Loop Answer Template — generated by 25_teaching_loop_answer_pack.py. '
            'Fill in each entry and save as human_review_answers.json '
            'then run 23_human_review_writeback.py to apply. '
            'Do NOT apply this template file directly — the guard checks for _comment containing TEMPLATE.'
        ),
        'meta': {
            'generated_at': datetime.now().isoformat(),
            'total_questions': len(questions),
            'source': '25_teaching_loop_answer_pack.py',
        },
        'answers': answers,
    }


# ─────────────────────────────────────────────
# Markdown renderer
# ─────────────────────────────────────────────

def build_markdown(questions: List[Dict], meta: Dict) -> str:
    now = meta['generated_at']
    total = meta['total_questions']
    by_priority = meta['by_priority']

    lines = [
        '# Teaching Loop Answer Pack',
        f'Generated: {now}  ',
        f'Total questions: {total}  ',
        '',
        '## Summary',
        '| Priority | Count |',
        '|----------|-------|',
    ]
    for p in ['critical', 'high', 'medium', 'low']:
        lines.append(f'| {p.upper()} | {by_priority.get(p, 0)} |')

    lines += ['', '---', '']

    current_priority = None
    for q in questions:
        prio = q['priority']
        if prio != current_priority:
            current_priority = prio
            lines += [f'## {prio.upper()} Questions', '']

        lines += [
            f'### {q["question_id"]} — {QUESTION_TYPE_LABELS.get(q["question_type"], q["question_type"])}',
            '',
            f'**Priority:** {prio.upper()}  ',
            f'**Type:** {q["question_type"]}  ',
            f'**Affected items:** {q["affected_items_count"]}  ',
        ]
        if q.get('affected_quantity_if_known') is not None:
            lines.append(f'**Quantity:** {q["affected_quantity_if_known"]}  ')

        lines += [
            '',
            f'**Business Impact:** {q["business_impact"]}',
            '',
            '**Question:**',
            '',
            q['question_text'],
            '',
        ]

        flags = q.get('impact_flags', {})
        active_flags = [k.replace('affects_', '') for k, v in flags.items() if v]
        if active_flags:
            lines.append(f'**Affects:** {", ".join(active_flags)}  ')

        if q.get('evidence_paths'):
            lines += ['', '**Evidence:**']
            for p in q['evidence_paths'][:5]:
                lines.append(f'- `{p}`')

        lines += [
            '',
            f'**Applied to:** {q["applied_to"]}',
            '',
            '---',
            '',
        ]

    return '\n'.join(lines)


# ─────────────────────────────────────────────
# HTML renderer
# ─────────────────────────────────────────────

def build_html(questions: List[Dict], meta: Dict) -> str:
    now = meta['generated_at']
    total = meta['total_questions']
    by_priority = meta['by_priority']
    by_type = meta['by_type']

    # Nav links per priority
    priority_nav = ''.join(
        f'<a href="#section-{p}" class="nav-pill" style="background:{PRIORITY_COLORS[p]}">'
        f'{p.upper()} ({by_priority.get(p, 0)})</a> '
        for p in ['critical', 'high', 'medium', 'low']
        if by_priority.get(p, 0) > 0
    )

    # Summary table
    sum_rows = ''.join(
        f'<tr><td><span class="badge" style="background:{PRIORITY_COLORS[p]}">{p.upper()}</span></td>'
        f'<td>{by_priority.get(p, 0)}</td></tr>'
        for p in ['critical', 'high', 'medium', 'low']
    )
    type_rows = ''.join(
        f'<tr><td>{QUESTION_TYPE_LABELS.get(t, t)}</td><td>{cnt}</td></tr>'
        for t, cnt in sorted(by_type.items(), key=lambda x: -x[1])
    )

    # Build sections grouped by priority
    sections_html = ''
    current_priority = None
    for q in questions:
        prio = q['priority']
        color = PRIORITY_COLORS[prio]

        if prio != current_priority:
            if current_priority is not None:
                sections_html += '</div>'  # close previous section
            current_priority = prio
            label = prio.upper()
            cnt = by_priority.get(prio, 0)
            sections_html += (
                f'<div id="section-{prio}" class="priority-section">'
                f'<h2 style="color:{color}; border-left:6px solid {color}; padding-left:12px">'
                f'{label} — {cnt} Question(s)</h2>'
            )

        # Evidence links
        evidence_html = ''
        for ep in q.get('evidence_paths', [])[:5]:
            ep_abs = str(OUT_DIR / ep) if not ep.startswith('outputs/') else str(SCRIPT_DIR / ep)
            # use relative paths for href
            evidence_html += f'<a href="{ep}" class="evidence-link" title="{ep}">{Path(ep).name}</a> '

        # Impact flags
        flags = q.get('impact_flags', {})
        flag_html = ' '.join(
            f'<span class="flag">{k.replace("affects_", "")}</span>'
            for k, v in flags.items() if v
        )

        # Candidates / context summary
        ctx = q.get('context', {})
        ctx_html = ''
        if ctx:
            ctx_items = []
            for k, v in ctx.items():
                if v is not None and not (isinstance(v, (list, dict)) and not v):
                    val_str = str(v)[:80]
                    ctx_items.append(f'<span class="ctx-item"><b>{k}:</b> {val_str}</span>')
            if ctx_items:
                ctx_html = f'<div class="ctx-box">{"  ".join(ctx_items)}</div>'

        # Answer schema short display
        schema = q['answer_schema']
        required = schema.get('REQUIRED', [])
        schema_html = f'<div class="schema-box"><b>Required fields:</b> {", ".join(required)}</div>'

        # Example answer
        ex = q.get('example_answer', {})
        ex_json = json.dumps(ex, ensure_ascii=False, indent=2)

        sections_html += f'''
<div class="question-card" id="{q["question_id"]}">
  <div class="card-header" style="border-left:5px solid {color}">
    <div class="card-id">{q["question_id"]}</div>
    <div class="card-meta">
      <span class="badge" style="background:{color}">{prio.upper()}</span>
      <span class="type-tag">{QUESTION_TYPE_LABELS.get(q["question_type"], q["question_type"])}</span>
      {flag_html}
    </div>
  </div>
  <div class="card-body">
    <div class="impact-box">
      <b>Business Impact:</b> {q["business_impact"]}
    </div>
    <div class="stats-row">
      <span><b>Affected items:</b> {q["affected_items_count"]}</span>
      {"<span><b>Quantity:</b> " + str(q["affected_quantity_if_known"]) + "</span>" if q["affected_quantity_if_known"] is not None else ""}
    </div>
    <div class="question-text">{q["question_text"].replace(chr(10), "<br>")}</div>
    {ctx_html}
    {schema_html}
    <details class="example-block">
      <summary>Example answer (JSON)</summary>
      <pre class="json-pre">{ex_json}</pre>
    </details>
    <div class="applied-to"><b>Applied to:</b> {q["applied_to"]}</div>
    {"<div class='evidence-row'><b>Evidence:</b> " + evidence_html + "</div>" if evidence_html else ""}
  </div>
</div>'''

    if current_priority is not None:
        sections_html += '</div>'  # close last section

    css = '''
body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f2f5; margin: 0; padding: 0; color: #1a1a1a; }
.topbar { background: #1a237e; color: white; padding: 16px 32px; position: sticky; top: 0; z-index: 100; display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.topbar h1 { margin: 0; font-size: 1.2rem; flex: 1; }
.topbar .meta { font-size: 0.8rem; opacity: 0.8; }
.nav-pill { display: inline-block; padding: 4px 12px; border-radius: 16px; color: white; text-decoration: none; font-size: 0.85rem; font-weight: 600; margin: 2px; }
.main { max-width: 1100px; margin: 0 auto; padding: 24px 16px; }
.summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 32px; }
.summary-card { background: white; border-radius: 8px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.12); }
.summary-card h3 { margin: 0 0 12px; font-size: 0.95rem; color: #555; }
table { width: 100%; border-collapse: collapse; }
td, th { padding: 6px 10px; text-align: left; border-bottom: 1px solid #eee; font-size: 0.88rem; }
.priority-section { margin-bottom: 40px; }
.priority-section h2 { font-size: 1.15rem; margin-bottom: 16px; }
.question-card { background: white; border-radius: 8px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); overflow: hidden; }
.card-header { padding: 12px 16px; background: #fafafa; display: flex; align-items: center; gap: 12px; }
.card-id { font-family: monospace; font-size: 1rem; font-weight: 700; color: #222; min-width: 160px; }
.card-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 12px; color: white; font-size: 0.78rem; font-weight: 700; }
.type-tag { background: #e8eaf6; color: #3949ab; padding: 2px 8px; border-radius: 10px; font-size: 0.78rem; }
.flag { background: #e0f2f1; color: #00695c; padding: 2px 6px; border-radius: 8px; font-size: 0.75rem; }
.card-body { padding: 16px; }
.impact-box { background: #fff8e1; border-left: 4px solid #f9a825; padding: 10px 14px; border-radius: 4px; font-size: 0.88rem; margin-bottom: 12px; }
.stats-row { display: flex; gap: 20px; font-size: 0.85rem; margin-bottom: 10px; color: #555; }
.question-text { background: #f5f5f5; padding: 12px; border-radius: 6px; font-size: 0.88rem; margin-bottom: 12px; white-space: pre-wrap; line-height: 1.6; }
.ctx-box { background: #e8f5e9; border-radius: 4px; padding: 8px 12px; font-size: 0.8rem; margin-bottom: 10px; }
.ctx-item { margin-right: 16px; display: inline-block; }
.schema-box { background: #e3f2fd; padding: 8px 12px; border-radius: 4px; font-size: 0.82rem; margin-bottom: 10px; }
.example-block { margin-bottom: 10px; }
.example-block summary { cursor: pointer; font-size: 0.85rem; color: #1565c0; padding: 4px 0; }
.json-pre { background: #263238; color: #80cbc4; padding: 12px; border-radius: 6px; font-size: 0.8rem; overflow-x: auto; max-height: 300px; }
.applied-to { font-size: 0.82rem; color: #555; margin-bottom: 8px; }
.evidence-row { font-size: 0.82rem; }
.evidence-link { display: inline-block; background: #ede7f6; color: #4527a0; padding: 2px 8px; border-radius: 10px; text-decoration: none; margin: 2px; font-size: 0.78rem; }
.evidence-link:hover { background: #d1c4e9; }
'''

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Teaching Loop Answer Pack</title>
<style>{css}</style>
</head>
<body>
<div class="topbar">
  <h1>Teaching Loop Answer Pack</h1>
  <span class="meta">Generated: {now} &nbsp;|&nbsp; {total} questions</span>
  <div>{priority_nav}</div>
</div>
<div class="main">
  <div class="summary-grid">
    <div class="summary-card">
      <h3>By Priority</h3>
      <table><tr><th>Priority</th><th>Questions</th></tr>{sum_rows}</table>
    </div>
    <div class="summary-card">
      <h3>By Type</h3>
      <table><tr><th>Type</th><th>Questions</th></tr>{type_rows}</table>
    </div>
  </div>
  {sections_html}
</div>
</body>
</html>'''


# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────

def main() -> None:
    print('Stage S12 — Teaching Loop Answer Pack')
    print('=' * 50)

    # Load data
    print('Loading pipeline outputs...')
    scale_data = load_json(F_SCALE)
    pcr_data = load_json(F_PARTIAL)
    eg_data = load_json(F_ELEMENT_GROUPS)
    legend_data = load_json(F_LEGEND_ROWS)
    rq_data = load_json(F_REVIEW_QUEUE)
    boq_data = load_json(F_BOQ)

    # Build questions
    print('Building question set...')
    questions = build_all_questions(scale_data, pcr_data, eg_data, legend_data, rq_data, boq_data)

    # Compute metadata
    from collections import Counter
    by_priority = dict(Counter(q['priority'] for q in questions))
    by_type = dict(Counter(q['question_type'] for q in questions))
    now = datetime.now().isoformat()
    meta = {
        'generated_at': now,
        'total_questions': len(questions),
        'by_priority': by_priority,
        'by_type': by_type,
        'source_files': list(PIPELINE_PATHS.values()),
        'approved_for_boq': False,
        'paid_api_used': False,
        'production_modified': False,
    }

    # Write JSON
    pack = {'meta': meta, 'questions': questions}
    with open(F_JSON, 'w', encoding='utf-8') as f:
        json.dump(pack, f, ensure_ascii=False, indent=2)
    print(f'  Written: {F_JSON}')

    # Write Markdown
    md = build_markdown(questions, meta)
    with open(F_MD, 'w', encoding='utf-8') as f:
        f.write(md)
    print(f'  Written: {F_MD}')

    # Write HTML
    html = build_html(questions, meta)
    with open(F_HTML, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'  Written: {F_HTML}')

    # Write template
    template = build_template(questions)
    with open(F_TEMPLATE, 'w', encoding='utf-8') as f:
        json.dump(template, f, ensure_ascii=False, indent=2)
    print(f'  Written: {F_TEMPLATE}')

    # Summary
    print()
    print('Question summary:')
    for p in ['critical', 'high', 'medium', 'low']:
        cnt = by_priority.get(p, 0)
        if cnt:
            print(f'  {p.upper():10s}: {cnt}')
    print()
    print('By type:')
    for t, cnt in sorted(by_type.items(), key=lambda x: -x[1]):
        label = QUESTION_TYPE_LABELS.get(t, t)
        print(f'  {label:40s}: {cnt}')
    print()
    print(f'Total: {len(questions)} questions')
    print()
    print('Next steps:')
    print('  1. Open outputs/teaching_loop_answer_pack.html in a browser')
    print('  2. Copy outputs/human_review_answers.template.json to outputs/human_review_answers.json')
    print('  3. Fill in your answers (start with CRITICAL, then HIGH)')
    print('  4. Run 23_human_review_writeback.py to apply answers')
    print()
    print('Stage S12 complete.')


if __name__ == '__main__':
    main()
