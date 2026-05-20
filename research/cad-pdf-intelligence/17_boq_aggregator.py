#!/usr/bin/env python3
"""
POC D (Stage J) — Unified BOQ Aggregator
research/cad-pdf-intelligence/17_boq_aggregator.py

Merges the two main pipeline branches into a single draft BOQ (כתב כמויות):

  Branch A — Sign / pole / review
    • outputs/sign_inventory.json       (177 OCCs, 119 pole groups, 119 assemblies)
    • outputs/review_queue.json         (tier, candidate codes, suspected issues)

  Branch B — Linear measurement
    • outputs/scale_measurement/results.json   (683 segments, 10 types, 379 runs)
    • outputs/scale_measurement/boq_draft.json (typed draft items)

All output: research-only, requires_review=True, approved_for_boq=False.
This is NOT an approved operational BOQ.
"""

from __future__ import annotations
import argparse, json, time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Any

from plan_run_context import PlanRunContext

SCRIPT_DIR  = Path(__file__).parent

# ── Input paths ───────────────────────────────────────────────────────────────
SIGN_INV    = SCRIPT_DIR / 'outputs/sign_inventory.json'
REVIEW_Q    = SCRIPT_DIR / 'outputs/review_queue.json'
MEAS_JSON   = SCRIPT_DIR / 'outputs/scale_measurement/results.json'
MEAS_BOQ    = SCRIPT_DIR / 'outputs/scale_measurement/boq_draft.json'
TAXONOMY_J  = SCRIPT_DIR / 'outputs/legend_color_match/color_taxonomy_candidates.json'
CAL_TMPL    = SCRIPT_DIR / 'outputs/legend_color_match/calibration_template.json'
ELEMENT_GRP = SCRIPT_DIR / 'outputs/element_groups.json'

# ── Output paths ──────────────────────────────────────────────────────────────
OUT         = SCRIPT_DIR / 'outputs'
OUT_JSON    = OUT / 'boq_unified_draft.json'
OUT_REPORT  = OUT / 'boq_unified_report.md'
OUT_HTML    = OUT / 'boq_unified_report.html'

# ── BOQ category constants ─────────────────────────────────────────────────────
CAT_COUNTED     = 'counted'
CAT_LINEAR      = 'measured_linear'
CAT_AREA        = 'measured_area'
CAT_REVIEW      = 'review_item'
CAT_PLACEHOLDER = 'placeholder'
# Branch C: element decomposition categories
CAT_EG_REVIEW   = 'element_group_review'    # review group needing classification
CAT_TAX_CAND    = 'taxonomy_candidate'       # high-impact unidentified color
CAT_IGNORED_BG  = 'ignored_background'       # confirmed background/noise
CAT_LIN_CAND    = 'measured_linear_candidate'# include group not yet in Branch B

HIGH_IMPACT_PT  = 1000   # drawing_area_paths >= this → high-impact

# ── Measurement display names (he/en) ────────────────────────────────────────
TYPE_LABELS = {
    'guardrail':        ('מעקה',            'Guardrail'),
    'road_marking':     ('סימון כביש',       'Road Marking'),
    'red_element':      ('סימון אדום',       'Red Element (unidentified)'),
    'barrier_pink':     ('גדר/מחסום',       'Barrier (pink)'),
    'fence_green':      ('גדר ירוקה',        'Fence (green)'),
    'marking_orange':   ('סימון כתום',       'Marking (orange)'),
    'marking_purple':   ('סימון סגול',       'Marking (purple)'),
    'marking_amber':    ('סימון ענבר',       'Marking (amber)'),
    'marking_royal':    ('סימון כחול כהה',  'Marking (royal blue)'),
    'marking_mid_blue': ('סימון כחול בינוני','Marking (mid-blue)'),
    'marking_vermilion':('סימון ורמיליון',  'Marking (vermilion)'),
}
# Element types already covered by Branch B — don't create duplicate BOQ items
_BRANCH_B_TYPES = set(TYPE_LABELS.keys())

# ─────────────────────────────────────────────────────────────────────────────


def load_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    with open(path, encoding='utf-8') as f:
        return json.load(f)


# ── Branch A: Sign / pole / review items ─────────────────────────────────────

def build_counted_items(sign_inv: Dict, review_queue: List[Dict]) -> List[Dict]:
    """
    Build counted BOQ items from sign inventory + review queue.

    Produces separate items for:
      - Physical pole locations
      - Sign plates (all)
      - Assemblies
      - Sign code candidates by tier
      - Unresolved / failed OCCs by issue category
    """
    occs       = sign_inv.get('occurrences', [])
    rq_map     = {i['occurrence_id']: i for i in review_queue}
    summary    = sign_inv.get('summary', {})
    items: List[Dict] = []
    n = 1

    # 1. Physical pole groups
    pole_groups: Dict[str, List[str]] = defaultdict(list)
    for o in occs:
        pg = o.get('pole_group_id')
        if pg:
            pole_groups[pg].append(o['occurrence_id'])

    pole_size_dist = Counter(len(v) for v in pole_groups.values())
    items.append({
        'boq_item_id':      f'BOQ-CNT-{n:03d}',
        'item_category':    CAT_COUNTED,
        'item_type':        'pole_location',
        'description_he':   'עמוד / מיקום פיזי',
        'description_en':   'Physical pole / sign post location',
        'source_branch':    'sign_review',
        'quantity':         len(pole_groups),
        'unit':             'unit',
        'page_number':      0,
        'source_ids':       list(pole_groups.keys())[:10],   # sample
        'n_source_ids':     len(pole_groups),
        'evidence_paths':   ['outputs/sign_inventory.json'],
        'confidence':       'medium',
        'detail':           {
            'pole_size_distribution': dict(pole_size_dist),
            'grouping_radius_pts':    summary.get('pole_grouping_params', {}).get('radius_pts', 50),
        },
        'requires_review':  True,
        'approved_for_boq': False,
        'review_reason':    'Pole grouping algorithm not validated against site survey.',
        'audit_notes':      f'119 pole groups from Stage G spatial clustering. '
                            f'Grouping radius = {summary.get("pole_grouping_params",{}).get("radius_pts",50)}pt.',
    })
    n += 1

    # 2. Sign plates (total)
    items.append({
        'boq_item_id':      f'BOQ-CNT-{n:03d}',
        'item_category':    CAT_COUNTED,
        'item_type':        'sign_plate',
        'description_he':   'לוחית תמרור',
        'description_en':   'Sign plate (all detected occurrences)',
        'source_branch':    'sign_review',
        'quantity':         len(occs),
        'unit':             'unit',
        'page_number':      0,
        'source_ids':       [o['occurrence_id'] for o in occs],
        'n_source_ids':     len(occs),
        'evidence_paths':   ['outputs/sign_inventory.json', 'outputs/review_queue.json'],
        'confidence':       'medium',
        'detail':           {
            'all_occurrences':      len(occs),
            'legend_matched':       summary.get('n_legend_matched', 0),
            'pending_vision':       summary.get('n_pending_vision', 0),
        },
        'requires_review':  True,
        'approved_for_boq': False,
        'review_reason':    'Sign plate count not confirmed by site survey. '
                            'May include noise clusters or miss occluded signs.',
        'audit_notes':      'Stage G sign detection: 177 OCCs from cluster analysis.',
    })
    n += 1

    # 3. Assemblies (= pole groups)
    items.append({
        'boq_item_id':      f'BOQ-CNT-{n:03d}',
        'item_category':    CAT_COUNTED,
        'item_type':        'sign_assembly',
        'description_he':   'הרכב שלטים (עמוד + לוחיות)',
        'description_en':   'Sign assembly (pole + attached plates)',
        'source_branch':    'sign_review',
        'quantity':         summary.get('n_assemblies', len(pole_groups)),
        'unit':             'assembly',
        'page_number':      0,
        'source_ids':       list(pole_groups.keys())[:10],
        'n_source_ids':     len(pole_groups),
        'evidence_paths':   ['outputs/sign_inventory.json'],
        'confidence':       'medium',
        'detail':           {
            'single_sign_poles':  pole_size_dist.get(1, 0),
            'multi_sign_poles':   sum(v for k, v in pole_size_dist.items() if k > 1),
            'max_signs_on_pole':  max(pole_size_dist.keys()) if pole_size_dist else 0,
        },
        'requires_review':  True,
        'approved_for_boq': False,
        'review_reason':    'Assembly grouping not confirmed by site survey.',
        'audit_notes':      'One assembly per pole group. 83 single-sign, 36 multi-sign.',
    })
    n += 1

    # 4. Sign code candidates by tier + confidence
    # MEDIUM tier with candidate code — best candidates
    medium_with_code = [
        i for i in review_queue
        if i['auto_result']['poc3_tier'] == 'MEDIUM'
        and i['auto_result'].get('poc3_candidates')
    ]
    if medium_with_code:
        code_counts = Counter(
            c for i in medium_with_code
            for c in i['auto_result']['poc3_candidates']
        )
        items.append({
            'boq_item_id':      f'BOQ-CNT-{n:03d}',
            'item_category':    CAT_COUNTED,
            'item_type':        'sign_code_candidate_medium',
            'description_he':   'קוד תמרור — מועמד בסבירות בינונית',
            'description_en':   'Sign code candidate — MEDIUM confidence',
            'source_branch':    'sign_review',
            'quantity':         len(medium_with_code),
            'unit':             'unit',
            'page_number':      0,
            'source_ids':       [i['occurrence_id'] for i in medium_with_code],
            'n_source_ids':     len(medium_with_code),
            'evidence_paths':   ['outputs/review_queue.json',
                                 'outputs/vector_glyph_results.json'],
            'confidence':       'medium',
            'detail': {
                'candidate_codes': dict(code_counts),
                'avg_poc3_confidence': round(
                    sum(i['auto_result']['poc3_confidence'] for i in medium_with_code)
                    / len(medium_with_code), 3),
            },
            'requires_review':  True,
            'approved_for_boq': False,
            'review_reason':    'Sign code candidates from vector glyph recognition — '
                                'not confirmed by human review.',
            'audit_notes':      'POC 3 MEDIUM tier with reconstructed digit sequence.',
        })
        n += 1

    # MEDIUM tier without confirmed code
    medium_no_code = [
        i for i in review_queue
        if i['auto_result']['poc3_tier'] == 'MEDIUM'
        and not i['auto_result'].get('poc3_candidates')
    ]
    if medium_no_code:
        items.append({
            'boq_item_id':      f'BOQ-CNT-{n:03d}',
            'item_category':    CAT_REVIEW,
            'item_type':        'sign_tier_medium_unresolved',
            'description_he':   'אזור בינוני — קוד לא ברור',
            'description_en':   'Sign tier MEDIUM — digit sequence ambiguous',
            'source_branch':    'sign_review',
            'quantity':         len(medium_no_code),
            'unit':             'review_item',
            'page_number':      0,
            'source_ids':       [i['occurrence_id'] for i in medium_no_code],
            'n_source_ids':     len(medium_no_code),
            'evidence_paths':   ['outputs/review_queue.json'],
            'confidence':       'low',
            'requires_review':  True,
            'approved_for_boq': False,
            'review_reason':    'Digit sequence extracted but no valid catalog code reconstructed.',
            'audit_notes':      'POC 3 MEDIUM tier without usable candidate codes.',
        })
        n += 1

    # LOW tier
    low_tier = [i for i in review_queue if i['auto_result']['poc3_tier'] == 'LOW']
    if low_tier:
        items.append({
            'boq_item_id':      f'BOQ-CNT-{n:03d}',
            'item_category':    CAT_REVIEW,
            'item_type':        'sign_tier_low',
            'description_he':   'אזור נמוך — דורש בדיקה',
            'description_en':   'Sign tier LOW — requires review',
            'source_branch':    'sign_review',
            'quantity':         len(low_tier),
            'unit':             'review_item',
            'source_ids':       [i['occurrence_id'] for i in low_tier],
            'n_source_ids':     len(low_tier),
            'evidence_paths':   ['outputs/review_queue.json'],
            'confidence':       'very_low',
            'requires_review':  True,
            'approved_for_boq': False,
            'review_reason':    'Low confidence — POC 3 could not reliably reconstruct a sign code.',
            'audit_notes':      'POC 3 LOW tier.',
        })
        n += 1

    # 5. FAILED OCCs by issue category
    issue_groups: Dict[str, List[str]] = defaultdict(list)
    for i in review_queue:
        if i['auto_result']['poc3_tier'] == 'FAILED':
            issue_groups[i['suspected_issue']].append(i['occurrence_id'])

    issue_labels = {
        'no_recoverable_vector_code': ('ללא קוד וקטורי',        'No recoverable vector sign code'),
        'false_adjacency_removed':    ('קיבוץ שגוי — תוקן',     'False adjacency artifact (fixed)'),
        'ambiguous_cluster':          ('אשכול דו-משמעי',         'Ambiguous glyph cluster'),
        'incomplete_code':            ('קוד חלקי',               'Incomplete digit sequence'),
        'weak_digit_sequence':        ('רצף ספרות חלש',          'Weak digit sequence'),
    }

    for issue, occ_ids in sorted(issue_groups.items(), key=lambda x: -len(x[1])):
        label_he, label_en = issue_labels.get(issue, (issue, issue))
        items.append({
            'boq_item_id':      f'BOQ-CNT-{n:03d}',
            'item_category':    CAT_REVIEW,
            'item_type':        f'failed_{issue}',
            'description_he':   label_he,
            'description_en':   label_en,
            'source_branch':    'unresolved',
            'quantity':         len(occ_ids),
            'unit':             'review_item',
            'source_ids':       occ_ids[:10],
            'n_source_ids':     len(occ_ids),
            'evidence_paths':   ['outputs/review_queue.json',
                                 'outputs/review_queue.html'],
            'confidence':       'none',
            'requires_review':  True,
            'approved_for_boq': False,
            'review_reason':    f'POC 3 FAILED — issue: {issue}.',
            'audit_notes':      'See review_queue.html for visual evidence.',
        })
        n += 1

    return items


# ── Branch B: Linear measurement items ────────────────────────────────────────

def build_linear_items(meas_data: Dict, start_n: int = 1) -> List[Dict]:
    items: List[Dict] = []
    n = start_n
    scale_info = meas_data.get('scale_info', {})
    scale_ratio  = scale_info.get('ratio', 500)
    scale_status = scale_info.get('status', 'unverified')
    scale_source = scale_info.get('source', 'unknown')

    type_totals = meas_data.get('type_totals_m', {})
    runs        = meas_data.get('runs', [])

    # Group runs by type
    runs_by_type: Dict[str, List[Dict]] = defaultdict(list)
    for r in runs:
        runs_by_type[r['type']].append(r)

    for etype in sorted(type_totals, key=lambda t: -type_totals[t]):
        total_m   = type_totals[etype]
        type_runs = runs_by_type.get(etype, [])
        label_he, label_en = TYPE_LABELS.get(etype, (etype, etype))
        longest_m = max((r['total_length_m'] for r in type_runs), default=0.0)

        items.append({
            'boq_item_id':      f'BOQ-LIN-{n:03d}',
            'item_category':    CAT_LINEAR,
            'item_type':        etype,
            'description_he':   label_he,
            'description_en':   label_en,
            'source_branch':    'measurement',
            'quantity':         round(total_m, 1),
            'unit':             'm',
            'page_number':      0,
            'source_ids':       [r['run_id'] for r in type_runs[:10]],
            'measurement_ids':  [r['run_id'] for r in type_runs],
            'n_runs':           len(type_runs),
            'longest_run_m':    round(longest_m, 1),
            'evidence_paths':   [
                f'outputs/scale_measurement/by_type/{etype}.png',
                'outputs/scale_measurement/overview.png',
            ],
            'scale_used':       f'1:{scale_ratio}',
            'scale_status':     scale_status,
            'scale_source':     scale_source,
            'color_taxonomy_confidence': 'unverified',
            'confidence':       'very_low' if scale_status != 'calibrated' else 'medium',
            'requires_review':  True,
            'approved_for_boq': False,
            'review_reason':    (
                f'Scale 1:{scale_ratio} is {scale_status}. '
                'Color taxonomy not confirmed against plan legend. '
                'Deduplication thresholds not validated against ground truth.'
            ),
            'audit_notes':      (
                f'{len(type_runs)} runs, {round(total_m,1)}m total. '
                f'Longest run: {longest_m:.1f}m. '
                f'Source: 15_scale_measurement.py.'
            ),
        })
        n += 1

    return items


# ── Placeholder / future items ─────────────────────────────────────────────────

def build_placeholder_items(start_n: int = 1) -> List[Dict]:
    n = start_n
    items = []

    for desc_he, desc_en, itype in [
        ('שטח עבודה',           'Work area',            'work_area_m2'),
        ('שטח סימון',           'Marking area',         'marking_area_m2'),
        ('שטח כבישה',           'Paving area',          'paving_area_m2'),
    ]:
        items.append({
            'boq_item_id':      f'BOQ-AREA-{n:03d}',
            'item_category':    CAT_AREA,
            'item_type':        itype,
            'description_he':   desc_he,
            'description_en':   desc_en,
            'source_branch':    'measurement',
            'quantity':         None,
            'unit':             'm2',
            'confidence':       'none',
            'requires_review':  True,
            'approved_for_boq': False,
            'review_reason':    'Area measurement not yet implemented.',
            'audit_notes':      'Placeholder — future POC: detect closed regions and measure m².',
        })
        n += 1

    items.append({
        'boq_item_id':      'BOQ-FUTURE-001',
        'item_category':    CAT_PLACEHOLDER,
        'item_type':        'human_approved_sign_code',
        'description_he':   'קוד תמרור מאושר ידנית',
        'description_en':   'Human-approved sign code quantity',
        'source_branch':    'manual_future',
        'quantity':         None,
        'unit':             'unit',
        'confidence':       'none',
        'requires_review':  True,
        'approved_for_boq': False,
        'review_reason':    'Awaiting human confirmation of sign codes from review_queue.',
        'audit_notes':      'Will be populated via teaching loop after review_queue review.',
    })

    return items


# ── System-level review flags ─────────────────────────────────────────────────

def build_system_flags(meas_data: Dict, tax_data: Optional[Dict],
                        cal_template: Optional[Dict]) -> List[Dict]:
    """
    Build review_item entries that capture system-level uncertainties:
    missing scale, unverified taxonomy, pending legend labels.
    """
    scale_info   = meas_data.get('scale_info', {}) if meas_data else {}
    dedup_audit  = meas_data.get('dedup_audit', {}) if meas_data else {}
    items        = []
    n = 1

    # Scale verification flag
    if scale_info.get('status') != 'calibrated':
        items.append({
            'boq_item_id':   f'BOQ-FLAG-{n:03d}',
            'item_category': CAT_REVIEW,
            'item_type':     'missing_scale_confirmation',
            'description_he':'אישור קנ"מ חסר',
            'description_en':'Scale not verified — all linear measurements provisional',
            'source_branch': 'measurement',
            'quantity':      1,
            'unit':          'review_item',
            'detail': {
                'current_scale':  f'1:{scale_info.get("ratio",500)}',
                'source':         scale_info.get('source','unknown'),
                'calibration_status': cal_template.get('status','?') if cal_template else '?',
                'action':         'Fill calibration_template.json with two known-distance points.',
            },
            'requires_review':  True,
            'approved_for_boq': False,
            'review_reason':    'Scale affects ALL linear measurements.',
            'evidence_paths':   ['outputs/legend_color_match/calibration_template.json'],
        })
        n += 1

    # Color taxonomy flag
    ct_conf = 'unverified'
    if tax_data:
        ct_conf = tax_data.get('meta', {}).get('color_taxonomy_confidence', 'unverified') or 'unverified'
    items.append({
        'boq_item_id':   f'BOQ-FLAG-{n:03d}',
        'item_category': CAT_REVIEW,
        'item_type':     'unconfirmed_color_taxonomy',
        'description_he':'מיפוי צבעים לא מאושר',
        'description_en':'Color-to-element-type mapping not confirmed against plan legend',
        'source_branch': 'legend',
        'quantity':      1,
        'unit':          'review_item',
        'detail': {
            'taxonomy_source': 'color_frequency_analysis + legend_icon_geometry',
            'legend_match_status': 'partial — icon colors matched, labels missing',
            'unclassified_colors': (len(tax_data.get('unclassified_colors', []))
                                    if tax_data else 'unknown'),
            'action': 'Open legend_color_match/report.html and confirm each legend row type.',
        },
        'requires_review':  True,
        'approved_for_boq': False,
        'review_reason':    'Affects which element type each color represents in BOQ.',
        'evidence_paths':   ['outputs/legend_color_match/report.html'],
    })
    n += 1

    # Legend labels missing flag
    items.append({
        'boq_item_id':   f'BOQ-FLAG-{n:03d}',
        'item_category': CAT_REVIEW,
        'item_type':     'legend_labels_missing',
        'description_he':'תוויות מקרא חסרות',
        'description_en':'Legend Hebrew labels not extracted (pending vision/manual entry)',
        'source_branch': 'legend',
        'quantity':      13,   # n_legend_rows
        'unit':          'review_item',
        'detail': {
            'n_legend_rows': 13,
            'labels_extracted': 0,
            'action': 'Stage F (07_extract_legend.py) requires vision API or manual entry.',
        },
        'requires_review':  True,
        'approved_for_boq': False,
        'review_reason':    'Without legend labels, element type names are inferred only.',
        'evidence_paths':   ['outputs/legend_color_match/legend_debug.png'],
    })
    n += 1

    # Deduplication validation flag
    if dedup_audit:
        items.append({
            'boq_item_id':   f'BOQ-FLAG-{n:03d}',
            'item_category': CAT_REVIEW,
            'item_type':     'deduplication_not_validated',
            'description_he':'ניקוי כפילויות לא אומת',
            'description_en':'Path deduplication thresholds not validated against ground truth',
            'source_branch': 'measurement',
            'quantity':      1,
            'unit':          'review_item',
            'detail': {
                'paths_before': dedup_audit.get('paths_before_dedup'),
                'paths_after':  dedup_audit.get('paths_after_dedup'),
                'removed':      dedup_audit.get('duplicates_removed'),
                'method':       dedup_audit.get('deduplication_method'),
                'risk_fp':      dedup_audit.get('risks', {}).get('false_positive', '')[:80],
                'risk_fn':      dedup_audit.get('risks', {}).get('false_negative', '')[:80],
            },
            'requires_review':  True,
            'approved_for_boq': False,
            'review_reason':    'Dedup may over- or under-count parallel structures.',
            'evidence_paths':   ['outputs/scale_measurement/dedup_audit.png'],
        })
        n += 1

    # Red element unidentified flag
    items.append({
        'boq_item_id':   f'BOQ-FLAG-{n:03d}',
        'item_category': CAT_REVIEW,
        'item_type':     'red_element_unidentified',
        'description_he':'אלמנט אדום לא מזוהה',
        'description_en':'Red element type not confirmed — high volume, needs classification',
        'source_branch': 'measurement',
        'quantity':      1,
        'unit':          'review_item',
        'detail': {
            'color_rgb':    [1.0, 0.0, 0.0],
            'total_arc_m':  '~1948m (at assumed 1:500)',
            'legend_rows':  'Rows 0, 1, 2 (confirmed in legend icon area)',
            'action':       'Review legend_debug.png rows 0-2 to identify element type.',
        },
        'requires_review':  True,
        'approved_for_boq': False,
        'review_reason':    'Red appears in legend but its element type (guardrail? marking? barrier?) is unknown.',
        'evidence_paths':   ['outputs/legend_color_match/legend_debug.png'],
    })

    return items


# ── Branch C: Element decomposition items ─────────────────────────────────────

def build_element_group_items(eg_data: Optional[Dict]) -> List[Dict]:
    """
    Build BOQ items from 18_element_decomposition.py outputs.

    Creates one item per element group, categorised as:
      taxonomy_candidate      — review group with drawing_area_paths ≥ HIGH_IMPACT_PT
      element_group_review    — review group (smaller impact)
      ignored_background      — ignore group (white fill, road background)
      measured_linear_candidate — include group NOT already in Branch B (sign_glyph)

    Include groups already in Branch B (guardrail, road_marking, …) are skipped
    to avoid duplication with BOQ-LIN-* items.
    """
    if not eg_data:
        return []

    groups = eg_data.get('groups', [])
    items: List[Dict] = []
    n = 1

    # Suggested human action by scenario
    def _action(cls: str, src: str, n_draw: int) -> str:
        if cls == 'ignore':
            return 'confirm_ignore'
        if cls == 'include':
            return 'map_to_existing_taxonomy'
        if src == 'black_stroke_heuristic':
            return 'confirm_ignore' if n_draw < 5000 else 'assign_element_type'
        if n_draw >= HIGH_IMPACT_PT:
            return 'create_new_taxonomy_rule'
        return 'assign_element_type'

    for g in groups:
        cls   = g['classification']
        etype = g['element_type']
        n_draw  = g['drawing_area_paths']
        n_total = g['n_paths']
        rgb8    = g['color_rgb8']

        # Skip include groups already covered by Branch B linear measurements
        if cls == 'include' and etype in _BRANCH_B_TYPES:
            continue

        # Determine item category
        if cls == 'ignore':
            item_cat = CAT_IGNORED_BG
        elif cls == 'include':
            # sign_glyph — include but not in Branch B
            item_cat = CAT_LIN_CAND
        elif n_draw >= HIGH_IMPACT_PT:
            item_cat = CAT_TAX_CAND
        else:
            item_cat = CAT_EG_REVIEW

        action = _action(cls, g['classification_source'], n_draw)

        audit = g['notes']
        if item_cat == CAT_TAX_CAND:
            audit = (
                f"HIGH-IMPACT: {n_draw:,} drawing-area paths. "
                f"Large enough to materially affect BOQ quantities if classified. "
                + g['notes']
            )
        if etype == 'sign_glyph':
            audit = (
                f"Gray hairline paths: total {n_total:,} paths. "
                f"Includes sign codes AND drawing annotations, dimension lines, text. "
                f"POC 3 confirmed only 165 digit-candidate paths in this color. "
                f"Spatial filtering needed to isolate actual sign codes."
            )

        items.append({
            'boq_item_id':                f'BOQ-EG-{n:03d}',
            'item_category':              item_cat,
            'item_type':                  f'element_group_{etype}',
            'group_id':                   g['group_id'],
            'color_key':                  g['color_key'],
            'color_rgb8':                 rgb8,
            'element_type':               etype,
            'description_he':             g['description_he'],
            'description_en':             g['description_en'],
            'source_branch':              'element_decomposition',
            'quantity':                   n_draw,
            'unit':                       'path',
            'page_number':                0,
            'n_paths_total':              n_total,
            'n_paths_drawing':            n_draw,
            'n_paths_title_block':        g['title_block_paths'],
            'classification':             cls,
            'classification_source':      g['classification_source'],
            'boq_category_from_taxonomy': g.get('boq_category'),
            'confidence':                 g['confidence'],
            'is_high_impact':             (cls != 'ignore') and (n_draw >= HIGH_IMPACT_PT),
            'suggested_human_action':     action,
            'requires_review':            g['requires_review'],
            'approved_for_boq':           False,
            'review_reason': (
                f"Element group classification is provisional. "
                f"Source: 18_element_decomposition.py ({g['classification_source']}). "
                f"Needs human validation before BOQ inclusion."
            ),
            'audit_notes':  audit,
            'evidence_paths': [
                'outputs/element_groups.json',
                'outputs/element_groups_report.html',
                'outputs/element_decomposition/overlay_classified.png',
            ],
        })
        n += 1

    return items


# ── Totals summary ────────────────────────────────────────────────────────────

def compute_totals(items: List[Dict]) -> Dict:
    by_cat: Dict[str, Any] = defaultdict(lambda: {'count': 0, 'quantity_sum': 0.0, 'items': []})
    for item in items:
        cat = item['item_category']
        by_cat[cat]['count'] += 1
        by_cat[cat]['items'].append(item['boq_item_id'])
        q = item.get('quantity')
        if isinstance(q, (int, float)):
            by_cat[cat]['quantity_sum'] += q

    # Specific roll-ups
    total_poles   = next((i['quantity'] for i in items if i['item_type'] == 'pole_location'), 0)
    total_plates  = next((i['quantity'] for i in items if i['item_type'] == 'sign_plate'), 0)
    total_assemblies = next((i['quantity'] for i in items if i['item_type'] == 'sign_assembly'), 0)
    code_candidates  = next((i['quantity'] for i in items if i['item_type'] == 'sign_code_candidate_medium'), 0)
    total_linear_m   = sum(i.get('quantity', 0) or 0
                          for i in items if i['item_category'] == CAT_LINEAR)

    eg_items = [i for i in items if i.get('source_branch') == 'element_decomposition']
    tax_cands = [i for i in eg_items if i['item_category'] == CAT_TAX_CAND]
    high_imp  = [i for i in eg_items if i.get('is_high_impact')]

    return {
        'by_category':    {k: dict(v) for k, v in by_cat.items()},
        'total_pole_locations':   total_poles,
        'total_sign_plates':      total_plates,
        'total_assemblies':       total_assemblies,
        'sign_code_candidates':   code_candidates,
        'total_linear_m':         round(total_linear_m, 1),
        'total_boq_items':        len(items),
        'approved_for_boq_count': sum(1 for i in items if i.get('approved_for_boq')),
        # Branch C element decomposition stats
        'n_element_group_items':  len(eg_items),
        'n_taxonomy_candidates':  len(tax_cands),
        'n_high_impact_unknowns': len(high_imp),
        'taxonomy_candidate_ids': [i['group_id'] for i in tax_cands],
        'high_impact_types':      [i['element_type'] for i in high_imp],
    }


# ── Report ─────────────────────────────────────────────────────────────────────

DISCLAIMER = '''\
> ⚠ **RESEARCH DRAFT ONLY — NOT APPROVED BOQ DATA**
> Scale 1:500 is ASSUMED. Color taxonomy is UNVERIFIED. Sign codes are UNCONFIRMED.
> All items: `requires_review: true`, `approved_for_boq: false`.
> Do not use for construction, procurement, billing, or execution.'''


def build_report(items: List[Dict], totals: Dict,
                 meas_data: Dict, elapsed: float) -> str:
    scale_info   = meas_data.get('scale_info', {}) if meas_data else {}

    def section_table(cat_items: List[Dict]) -> str:
        lines = ['| BOQ ID | Type | Description | Qty | Unit | Confidence | Review |',
                 '|--------|------|-------------|-----|------|------------|--------|']
        for i in cat_items:
            qty = f'{i["quantity"]:g}' if isinstance(i.get('quantity'), (int, float)) else '—'
            lines.append(
                f'| {i["boq_item_id"]} | `{i["item_type"]}` '
                f'| {i.get("description_he","—")} | **{qty}** | {i.get("unit","—")} '
                f'| {i.get("confidence","—")} | {i.get("requires_review", True)} |'
            )
        return '\n'.join(lines)

    counted      = [i for i in items if i['item_category'] == CAT_COUNTED]
    linear       = [i for i in items if i['item_category'] == CAT_LINEAR]
    area         = [i for i in items if i['item_category'] == CAT_AREA]
    review       = [i for i in items if i['item_category'] == CAT_REVIEW]
    placeholder  = [i for i in items if i['item_category'] == CAT_PLACEHOLDER]
    eg_review    = [i for i in items if i['item_category'] == CAT_EG_REVIEW]
    tax_cands    = [i for i in items if i['item_category'] == CAT_TAX_CAND]
    lin_cands    = [i for i in items if i['item_category'] == CAT_LIN_CAND]
    ignored_bg   = [i for i in items if i['item_category'] == CAT_IGNORED_BG]

    lines = [
        '# Unified BOQ Draft — כתב כמויות ראשוני (מחקר בלבד)',
        '',
        f'**Source PDF**: `{MEAS_JSON.parent.parent.name}/`  ',
        f'**Scale**: 1:{scale_info.get("ratio",500)} — `{scale_info.get("status","?")}` '
        f'(source: `{scale_info.get("source","?")}`)  ',
        f'**Branches merged**: Sign/pole review + Linear measurement  ',
        f'**Generated**: 17_boq_aggregator.py  ',
        '',
        DISCLAIMER,
        '',
        '---',
        '',
        '## Summary',
        '',
        '| Category | BOQ Items | Key Quantity |',
        '|----------|-----------|--------------|',
        f'| Counted (signs/poles) | {len(counted)} | {totals["total_sign_plates"]} plates, {totals["total_pole_locations"]} poles, {totals["total_assemblies"]} assemblies |',
        f'| Measured linear (Branch B) | {len(linear)} | {totals["total_linear_m"]:.1f} m total |',
        f'| Measured area | {len(area)} | (placeholders) |',
        f'| Review / uncertainty | {len(review)} | {sum(i.get("quantity",0) or 0 for i in review):.0f} items |',
        f'| Placeholder | {len(placeholder)} | — |',
        f'| **Element group review (Branch C)** | **{len(eg_review)+len(tax_cands)+len(lin_cands)+len(ignored_bg)}** | {totals["n_taxonomy_candidates"]} taxonomy candidates, {totals["n_high_impact_unknowns"]} high-impact |',
        f'| **TOTAL** | **{totals["total_boq_items"]}** | **approved_for_boq: {totals["approved_for_boq_count"]}** |',
        '',
        '---',
        '',
        '## 1 · Counted Quantities (Signs / Poles)',
        '',
        section_table(counted),
        '',
        '---',
        '',
        '## 2 · Measured Linear Quantities',
        '',
        f'*Scale: 1:{scale_info.get("ratio",500)} ({scale_info.get("status","?")}) — all values provisional*',
        '',
        section_table(linear),
        '',
        '**Note on red_element**: Red `(1,0,0)` appears in legend rows 0-2 '
        'but its element type is unidentified. ~1948m at assumed 1:500.',
        '',
        '---',
        '',
        '## 3 · Measured Area Quantities',
        '',
        section_table(area),
        '',
        '---',
        '',
        '## 4 · Review / Uncertainty Items',
        '',
        section_table(review),
        '',
        '---',
        '',
        '## 5 · What is Available Now',
        '',
        '| Item | Status |',
        '|------|--------|',
        f'| Physical pole count | {totals["total_pole_locations"]} units — unverified |',
        f'| Sign plate count | {totals["total_sign_plates"]} units — unverified |',
        f'| Sign assembly count | {totals["total_assemblies"]} units — unverified |',
        f'| Code candidates (MEDIUM+code) | {totals["sign_code_candidates"]} — requires human confirmation |',
        f'| Linear measurements | {totals["total_linear_m"]:.1f} m across 10 types — scale unverified |',
        '',
        '## 6 · What is Measured but Unverified',
        '',
        '- All linear quantities (scale 1:500 assumed, not confirmed)',
        '- Color-to-type mapping (legend icon analysis started, labels missing)',
        '- Red element type (~1,948m measured but unidentified)',
        '- Deduplication quality (957 double-drawn paths removed, thresholds not validated)',
        '',
        '## 7 · What is Counted but Unresolved',
        '',
        '- 149 OCCs: no recoverable vector sign code',
        '- 9 OCCs: false adjacency artifact (correctly flagged, no code)',
        '- 8 OCCs: MEDIUM tier but no valid digit sequence reconstructed',
        '- 4 OCCs: LOW tier — ambiguous',
        '- 0 sign codes: human-confirmed and approved for BOQ',
        '',
        '## 8 · What Requires Manual Review Before BOQ Approval',
        '',
        '| Action | Owner | Blocks |',
        '|--------|-------|--------|',
        '| Fill calibration_template.json (two known points) | Human | All linear quantities |',
        '| Confirm legend row types (legend_debug.png) | Human | Color taxonomy |',
        '| Review 14 HIGH-priority items in review_queue.html | Human | Code candidates |',
        '| Identify red element type in legend rows 0-2 | Human | red_element BOQ line |',
        '| Validate pole grouping in field or against survey | Human | Counted quantities |',
        '',
        '## 9 · What is Missing Before Operational BOQ Approval',
        '',
        '1. Scale calibration (no verified scale means no reliable measurement)',
        '2. Color taxonomy confirmation (legend labels)',
        '3. Sign code human validation (0/177 codes confirmed)',
        '4. Pole/assembly field verification',
        '5. Area measurements (not yet implemented)',
        '6. Engineering review of element classification',
        '',
        '## 5B · Element Group Review Items (Branch C)',
        '',
        '### High-Impact Taxonomy Candidates',
        '',
        section_table(tax_cands) if tax_cands else '*No taxonomy candidates.*',
        '',
        '### Element Group Review (lower impact)',
        '',
        section_table(eg_review) if eg_review else '*None.*',
        '',
        '### Measured Linear Candidates (include groups not in Branch B)',
        '',
        section_table(lin_cands) if lin_cands else '*None.*',
        '',
        '### Ignored / Background Groups',
        '',
        section_table(ignored_bg) if ignored_bg else '*None.*',
        '',
        '---',
        '',
        '## 10 · How This Advances the Plan Scanner',
        '',
        '- First unified draft joining sign, measurement, AND element decomposition branches.',
        '- Element decomposition (Branch C) surfaces 31 color groups — including high-impact',
        '  unknowns that could represent missing BOQ categories.',
        f'- {totals["n_taxonomy_candidates"]} taxonomy candidates flagged for human classification.',
        f'- {totals["n_high_impact_unknowns"]} high-impact groups have ≥{HIGH_IMPACT_PT} drawing-area paths.',
        '- Every future confirmation (scale, color, code, group type) directly updates this file.',
        '- The schema is the target state for the full BOQ approval workflow.',
        '- Recommended next: human classification of high-impact unknown groups → expand taxonomy.',
        '',
        f'*Elapsed: {elapsed:.1f}s*',
        '',
        '---',
        '*Research output. Not approved for construction, procurement, billing, or execution.*',
    ]

    return '\n'.join(lines)


# ── HTML report ───────────────────────────────────────────────────────────────

def build_html(items: List[Dict], totals: Dict,
               meas_data: Dict, elapsed: float) -> str:
    scale_info = meas_data.get('scale_info', {}) if meas_data else {}
    sr = scale_info.get('ratio', 500)
    ss = scale_info.get('status', 'unverified')

    cat_colors = {
        CAT_COUNTED:     '#e8f4fd',
        CAT_LINEAR:      '#e8fdf0',
        CAT_AREA:        '#fdf5e8',
        CAT_REVIEW:      '#fde8e8',
        CAT_PLACEHOLDER: '#f3f3f3',
    }
    conf_colors = {
        'high': 'green', 'medium': '#1a7a1a', 'low': 'orange',
        'very_low': '#cc7700', 'none': '#aaa',
    }

    def make_rows(cat_items: List[Dict]) -> str:
        rows = ''
        for i in cat_items:
            qty = f'{i["quantity"]:g}' if isinstance(i.get('quantity'), (int, float)) else '—'
            cf  = i.get('confidence', '—')
            cfc = conf_colors.get(cf, '#555')
            rows += (
                f'<tr style="background:{cat_colors.get(i["item_category"],"#fff")}">'
                f'<td><code>{i["boq_item_id"]}</code></td>'
                f'<td>{i.get("description_he","—")}</td>'
                f'<td>{i.get("description_en","—")}</td>'
                f'<td><strong>{qty}</strong></td>'
                f'<td>{i.get("unit","—")}</td>'
                f'<td style="color:{cfc}">{cf}</td>'
                f'<td title="{i.get("review_reason","")}">'
                + f'{"⚠" if i.get("requires_review") else "✓"}</td>'
                f'</tr>\n'
            )
        return rows

    counted     = [i for i in items if i['item_category'] == CAT_COUNTED]
    linear      = [i for i in items if i['item_category'] == CAT_LINEAR]
    area        = [i for i in items if i['item_category'] == CAT_AREA]
    review      = [i for i in items if i['item_category'] == CAT_REVIEW]
    placeholder = [i for i in items if i['item_category'] == CAT_PLACEHOLDER]
    eg_review   = [i for i in items if i['item_category'] == CAT_EG_REVIEW]
    tax_cands   = [i for i in items if i['item_category'] == CAT_TAX_CAND]
    lin_cands   = [i for i in items if i['item_category'] == CAT_LIN_CAND]
    ignored_bg  = [i for i in items if i['item_category'] == CAT_IGNORED_BG]

    def summary_card(label: str, value: str, color: str = '#2c7') -> str:
        return (f'<div style="display:inline-block;background:#fff;border:2px solid {color};'
                f'border-radius:8px;padding:12px 20px;margin:6px;min-width:130px;text-align:center">'
                f'<div style="font-size:1.6rem;font-weight:bold;color:{color}">{value}</div>'
                f'<div style="font-size:.8rem;color:#555">{label}</div></div>')

    return f'''<!DOCTYPE html>
<html lang="he">
<head>
<meta charset="utf-8">
<title>Unified BOQ Draft — POC D</title>
<style>
body{{font-family:system-ui,sans-serif;margin:24px;background:#f9f9f9;color:#111;direction:rtl}}
h1{{font-size:1.5rem;color:#1a3a5c}}
h2{{font-size:1.1rem;margin-top:2em;border-bottom:2px solid #e0e0e0;padding-bottom:6px}}
table{{border-collapse:collapse;width:100%;max-width:1050px;background:#fff;font-size:.83rem;margin-bottom:1.5em;direction:ltr}}
th,td{{border:1px solid #ddd;padding:5px 9px;text-align:left}}
th{{background:#eee;font-weight:600}}
.warn{{background:#fffbe6;border:2px solid #f0c040;padding:14px 18px;border-radius:8px;max-width:960px;margin:1em 0}}
.cards{{margin:1em 0}}
details{{margin:6px 0}}summary{{cursor:pointer;font-weight:600;color:#1a5}}
code{{background:#f3f3f3;padding:1px 5px;border-radius:3px;font-size:.83em}}
.toc{{background:#fff;border:1px solid #ddd;padding:12px 20px;max-width:360px;border-radius:6px;margin-bottom:1em}}
.toc a{{display:block;margin:3px 0;color:#1a5;text-decoration:none;font-size:.9rem}}
</style>
</head>
<body>
<h1>כתב כמויות ראשוני (מחקר בלבד) — Unified BOQ Draft · POC D (Stage J)</h1>
<p>
  <strong>Scale:</strong> 1:{sr} <span style="color:{"green" if ss=="calibrated" else "orange"}">
  {ss.upper()}</span> &nbsp;|&nbsp;
  <strong>Branches:</strong> Sign/Pole Review + Linear Measurement &nbsp;|&nbsp;
  <code>17_boq_aggregator.py</code>
</p>

<div class="warn">
  ⚠ <strong>RESEARCH DRAFT — NOT APPROVED BOQ DATA</strong><br>
  Scale 1:{sr} is ASSUMED. Color taxonomy is UNVERIFIED. Sign codes are UNCONFIRMED.<br>
  All items: <code>requires_review: true</code>, <code>approved_for_boq: false</code>.<br>
  Not approved for construction, procurement, billing, or execution.
</div>

<div class="cards">
{summary_card("Pole locations", str(totals["total_pole_locations"]), "#2980b9")}
{summary_card("Sign plates", str(totals["total_sign_plates"]), "#2980b9")}
{summary_card("Assemblies", str(totals["total_assemblies"]), "#2980b9")}
{summary_card("Code candidates", str(totals["sign_code_candidates"]), "#f39c12")}
{summary_card("Linear (m)", f'{totals["total_linear_m"]:.0f}m', "#27ae60")}
{summary_card("BOQ items", str(totals["total_boq_items"]), "#8e44ad")}
{summary_card("Taxonomy cands.", str(totals["n_taxonomy_candidates"]), "#c0392b")}
{summary_card("Approved", str(totals["approved_for_boq_count"]), "#e74c3c")}
</div>

<div class="toc">
<strong>Sections</strong>
<a href="#counted">1 · Counted Quantities</a>
<a href="#linear">2 · Linear Measurements</a>
<a href="#area">3 · Area Measurements</a>
<a href="#review">4 · Review Items</a>
<a href="#taxonomy">5 · Taxonomy Candidates</a>
<a href="#eg-review">6 · Element Group Review</a>
<a href="#ignored">7 · Ignored Groups</a>
<a href="#status">8 · Status Summary</a>
</div>

<h2 id="counted">1 · Counted Quantities — Signs / Poles</h2>
<table>
<tr><th>BOQ ID</th><th>Description (HE)</th><th>Description (EN)</th><th>Qty</th><th>Unit</th><th>Confidence</th><th>Review</th></tr>
{make_rows(counted)}
</table>

<h2 id="linear">2 · Measured Linear Quantities</h2>
<p><em>Scale 1:{sr} ({ss}) — all values provisional</em></p>
<table>
<tr><th>BOQ ID</th><th>Description (HE)</th><th>Description (EN)</th><th>Qty (m)</th><th>Unit</th><th>Confidence</th><th>Review</th></tr>
{make_rows(linear)}
</table>
<p><em>⚠ <code>red_element</code>: appears in legend rows 0-2 but type is unidentified. See
<a href="legend_color_match/legend_debug.png" target="_blank">legend_debug.png</a></em></p>

<h2 id="area">3 · Area Measurements + Placeholders</h2>
<table>
<tr><th>BOQ ID</th><th>Description (HE)</th><th>Description (EN)</th><th>Qty</th><th>Unit</th><th>Confidence</th><th>Review</th></tr>
{make_rows(area + placeholder)}
</table>

<h2 id="review">4 · Review / Uncertainty Items</h2>
<table>
<tr><th>BOQ ID</th><th>Description (HE)</th><th>Description (EN)</th><th>Qty</th><th>Unit</th><th>Confidence</th><th>Review</th></tr>
{make_rows(review)}
</table>

{'<h2 id="taxonomy">5 · High-Impact Taxonomy Candidates (Branch C)</h2>' if tax_cands else ''}
<p style="color:#7f2020;font-size:13px">
  These color groups have ≥{HIGH_IMPACT_PT} drawing-area paths. They are large enough to materially
  affect BOQ quantities if classified. <strong>Do not assign types without human confirmation.</strong>
</p>
{'<table><tr><th>BOQ ID</th><th>Group</th><th>Description (HE)</th><th>Description (EN)</th><th>Drawing Paths</th><th>RGB</th><th>Suggested Action</th></tr>' + ''.join(
    f'<tr style="background:#fff8f0"><td><code>{i["boq_item_id"]}</code></td>'
    f'<td>{i["group_id"]}</td><td>{i["description_he"]}</td><td>{i["description_en"]}</td>'
    f'<td><strong>{i["n_paths_drawing"]:,}</strong></td>'
    f'<td><span style="display:inline-block;width:16px;height:16px;background:rgb({i["color_rgb8"][0]},{i["color_rgb8"][1]},{i["color_rgb8"][2]});border:1px solid #aaa;vertical-align:middle"></span> {i["color_rgb8"]}</td>'
    f'<td><code>{i["suggested_human_action"]}</code></td></tr>'
    for i in tax_cands
) + '</table>' if tax_cands else '<p><em>No taxonomy candidates.</em></p>'}

<h2 id="eg-review">6 · Element Group Review Items (Branch C)</h2>
<p style="color:#555;font-size:13px">
  Smaller unidentified groups. May represent noise, construction details, or legend decorations.
</p>
{'<table><tr><th>BOQ ID</th><th>Group</th><th>Description (HE)</th><th>Description (EN)</th><th>Drawing Paths</th><th>RGB</th><th>Action</th></tr>' + ''.join(
    f'<tr style="background:#fffbf0"><td><code>{i["boq_item_id"]}</code></td>'
    f'<td>{i["group_id"]}</td><td>{i["description_he"]}</td><td>{i["description_en"]}</td>'
    f'<td>{i["n_paths_drawing"]:,}</td>'
    f'<td><span style="display:inline-block;width:14px;height:14px;background:rgb({i["color_rgb8"][0]},{i["color_rgb8"][1]},{i["color_rgb8"][2]});border:1px solid #aaa;vertical-align:middle"></span></td>'
    f'<td><code>{i["suggested_human_action"]}</code></td></tr>'
    for i in eg_review + lin_cands
) + '</table>' if (eg_review or lin_cands) else '<p><em>None.</em></p>'}

<h2 id="ignored">7 · Ignored / Background Groups</h2>
<p style="color:#555;font-size:13px">
  Classified as background, noise, or title block. Excluded from BOQ quantities.
  Confirm these are not construction-relevant before accepting.
</p>
{'<table><tr><th>BOQ ID</th><th>Group</th><th>Type</th><th>Description</th><th>Drawing Paths</th><th>Action</th></tr>' + ''.join(
    f'<tr style="background:#f5f5f5"><td><code>{i["boq_item_id"]}</code></td>'
    f'<td>{i["group_id"]}</td><td><code>{i["element_type"]}</code></td>'
    f'<td>{i["description_en"]}</td><td>{i["n_paths_drawing"]:,}</td>'
    f'<td><code>{i["suggested_human_action"]}</code></td></tr>'
    for i in ignored_bg
) + '</table>' if ignored_bg else '<p><em>None.</em></p>'}

<h2 id="status">8 · Status Summary</h2>
<table>
<tr><th>What is available now</th><th>Status</th></tr>
<tr><td>Physical pole count</td><td>{totals["total_pole_locations"]} units — unverified</td></tr>
<tr><td>Sign plate count</td><td>{totals["total_sign_plates"]} units — unverified</td></tr>
<tr><td>Sign assembly count</td><td>{totals["total_assemblies"]} units — unverified</td></tr>
<tr><td>Code candidates (MEDIUM + code)</td><td>{totals["sign_code_candidates"]} — requires human confirmation</td></tr>
<tr><td>Linear measurements</td><td>{totals["total_linear_m"]:.1f}m across 10 types — scale unverified</td></tr>
<tr><td>Approved for BOQ</td><td style="color:red;font-weight:bold">{totals["approved_for_boq_count"]} items</td></tr>
</table>

<details><summary>What requires manual review before BOQ approval</summary>
<ul>
<li>Fill <code>outputs/legend_color_match/calibration_template.json</code> with two known points → unlocks scale</li>
<li>Confirm legend row types in <a href="legend_color_match/report.html" target="_blank">legend_color_match/report.html</a></li>
<li>Review 14 HIGH-priority items in <a href="review_queue.html" target="_blank">review_queue.html</a></li>
<li>Identify red element type (legend rows 0-2)</li>
<li>Validate pole grouping in field or against survey</li>
</ul>
</details>

<p style="color:#888;font-size:.8rem;margin-top:2em">
Generated in {elapsed:.1f}s — research/cad-pdf-intelligence/17_boq_aggregator.py
</p>
</body>
</html>'''


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    t0 = time.time()
    print('=' * 60)
    print('POC D (Stage J) — Unified BOQ Aggregator')
    print('17_boq_aggregator.py')
    print('=' * 60)

    # Load inputs
    print('\n[Load] Reading pipeline outputs ...')
    sign_inv    = load_json(SIGN_INV, {})
    review_q    = load_json(REVIEW_Q, [])
    meas_data   = load_json(MEAS_JSON, {})
    tax_data    = load_json(TAXONOMY_J, None)
    cal_tmpl    = load_json(CAL_TMPL, None)
    eg_data     = load_json(ELEMENT_GRP, None)

    print(f'  sign_inventory: {len(sign_inv.get("occurrences",[]))} OCCs')
    print(f'  review_queue:   {len(review_q)} items')
    print(f'  measurement:    {len(meas_data.get("elements",[]))} elements, '
          f'{len(meas_data.get("runs",[]))} runs')
    if eg_data:
        eg_tot = eg_data.get('totals', {})
        print(f'  element_groups: {eg_tot.get("total_groups",0)} groups  '
              f'(include={eg_tot.get("n_include_groups",0)}, '
              f'review={eg_tot.get("n_review_groups",0)}, '
              f'ignore={eg_tot.get("n_ignore_groups",0)})')
    else:
        print('  element_groups: NOT FOUND — run 18_element_decomposition.py first')

    # Build BOQ items
    print('\n[Build] Building BOQ items ...')

    counted = build_counted_items(sign_inv, review_q)
    print(f'  Counted:        {len(counted)} items')

    linear = build_linear_items(meas_data, start_n=1)
    print(f'  Linear:         {len(linear)} items')

    area = build_placeholder_items(start_n=1)
    print(f'  Area/placeholders: {len(area)} items')

    flags = build_system_flags(meas_data, tax_data, cal_tmpl)
    print(f'  System flags:   {len(flags)} items')

    eg_items = build_element_group_items(eg_data)
    n_tax    = sum(1 for i in eg_items if i['item_category'] == CAT_TAX_CAND)
    n_hi     = sum(1 for i in eg_items if i.get('is_high_impact'))
    print(f'  Element groups: {len(eg_items)} items  '
          f'(taxonomy_candidates={n_tax}, high_impact={n_hi})')

    all_items = counted + linear + area + flags + eg_items
    totals    = compute_totals(all_items)
    print(f'  Total:          {totals["total_boq_items"]} BOQ items')
    print(f'  Approved:       {totals["approved_for_boq_count"]}')

    # Outputs
    elapsed = time.time() - t0
    output = {
        'meta': {
            'pipeline':          '17_boq_aggregator.py',
            'branches_merged':   ['sign_review', 'measurement', 'element_decomposition'],
            'n_items':           len(all_items),
            'approved_for_boq':  False,
            'requires_review':   True,
            'scale_status':      meas_data.get('scale_info', {}).get('status', 'unverified'),
            'color_taxonomy_status': 'unverified',
            'elapsed_s':         round(elapsed, 2),
        },
        'totals':     totals,
        'scale_info': meas_data.get('scale_info', {}),
        'items':      all_items,
    }
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f'\n[JSON]   → {OUT_JSON}')

    report = build_report(all_items, totals, meas_data, elapsed)
    OUT_REPORT.write_text(report, encoding='utf-8')
    print(f'[Report] → {OUT_REPORT}')

    html = build_html(all_items, totals, meas_data, elapsed)
    OUT_HTML.write_text(html, encoding='utf-8')
    print(f'[HTML]   → {OUT_HTML}')

    # Summary
    elapsed = time.time() - t0
    print()
    print('=' * 60)
    print('POC D COMPLETE — Unified BOQ Draft')
    print('=' * 60)
    print(f'  BOQ items total     : {totals["total_boq_items"]}')
    print(f'  Counted items       : {len(counted)}')
    print(f'    Pole locations    : {totals["total_pole_locations"]}')
    print(f'    Sign plates       : {totals["total_sign_plates"]}')
    print(f'    Assemblies        : {totals["total_assemblies"]}')
    print(f'    Code candidates   : {totals["sign_code_candidates"]}')
    print(f'  Linear items        : {len(linear)}')
    print(f'    Total linear (m)  : {totals["total_linear_m"]:.1f}m (scale unverified)')
    print(f'  Area/placeholder    : {len(area)}')
    print(f'  System flags        : {len(flags)}')
    print(f'  Element groups      : {len(eg_items)}')
    print(f'    Taxonomy cands.   : {totals["n_taxonomy_candidates"]}')
    print(f'    High-impact       : {totals["n_high_impact_unknowns"]}')
    print(f'  Approved for BOQ    : {totals["approved_for_boq_count"]}')
    print()
    print(f'  → {OUT_JSON}')
    print(f'  → {OUT_REPORT}')
    print(f'  → {OUT_HTML}')
    print(f'  Elapsed             : {elapsed:.1f}s')
    print()
    print('  open ' + str(OUT_HTML))
    print()
    print('  REMINDER: All quantities are provisional.')
    print('  Scale UNVERIFIED. Color taxonomy UNVERIFIED. Sign codes UNCONFIRMED.')
    print('  Not approved for construction, procurement, billing, or execution.')
    print('=' * 60)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Unified BOQ Aggregator (Stage J)')
    parser.add_argument(
        '--plan-run-dir', default=None,
        help='Path to a plan-scoped run directory (created by 31_upload_intake_wrapper.py). '
             'If omitted, runs in legacy mode against outputs/',
    )
    _args = parser.parse_args()
    _ctx  = PlanRunContext.from_args(_args, script_dir=SCRIPT_DIR)
    if _ctx.is_plan_scoped:
        OUT        = _ctx.outputs_dir                                    # type: ignore[assignment]
        OUT_JSON   = OUT / 'boq_unified_draft.json'
        OUT_REPORT = OUT / 'boq_unified_report.md'
        OUT_HTML   = OUT / 'boq_unified_report.html'
        SIGN_INV   = OUT / 'sign_inventory.json'
        REVIEW_Q   = OUT / 'review_queue.json'
        MEAS_JSON  = OUT / 'scale_measurement' / 'results.json'
        MEAS_BOQ   = OUT / 'scale_measurement' / 'boq_draft.json'
        TAXONOMY_J = OUT / 'legend_color_match' / 'color_taxonomy_candidates.json'
        CAL_TMPL   = OUT / 'legend_color_match' / 'calibration_template.json'
        ELEMENT_GRP = OUT / 'element_groups.json'
        _required = [SIGN_INV, REVIEW_Q]
        _missing  = [p for p in _required if not p.exists()]
        if _missing:
            print('[WARN] Plan-scoped mode: missing required inputs in run outputs dir:')
            for _p in _missing:
                print(f'  MISSING: {_p}')
            print('  Run sign detection (06/09/13) and review queue (14) stages first.')
        _ctx.ensure_dirs()
        print(_ctx.describe())
    main()
