#!/usr/bin/env python3
"""
POC B (Stage H) — Scale Measurement  v2
research/cad-pdf-intelligence/15_scale_measurement.py

Measures linear infrastructure elements (guardrails, barriers, road markings)
from AutoCAD PDF engineering plans.

Scale detection strategy (priority order):
  1. Text-based  : search for "1:N" ratio in PDF text
  2. R-annotation: find "R=N.N" annotation → fit circle to nearby arc → infer scale
  3. Config fallback: SCALE_RATIO_FALLBACK (default 500, clearly UNVERIFIED)

New in v2:
  - Structured scale_info block with source / status / calibration model
  - Manual calibration readiness data model
  - BOQ-oriented output (boq_draft.json) with all quantity types
  - Color taxonomy metadata (source, confidence, legend_match_status)
  - Deduplication audit (before/after counts, risks, sample pairs)
  - Per-type overlay images (outputs/scale_measurement/by_type/<type>.png)
  - Deduplication debug overlay (dedup_audit.png)
  - Honest status reporting in all outputs

All measurements: research-only, requires_review=True.
Not approved BOQ data.
"""

from __future__ import annotations
import argparse, json, math, re, time
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import cv2
import pdfplumber
import fitz  # pymupdf

from plan_run_context import PlanRunContext

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR    = Path(__file__).parent
PDF_PATH      = Path('/Users/eliozedri/Downloads/50-448-02-400.pdf')
OUT           = SCRIPT_DIR / 'outputs' / 'scale_measurement'
# Note: OUT.mkdir() moved into main() so plan-scoped overrides take effect first.

OUT_JSON      = OUT / 'results.json'
OUT_BOQ       = OUT / 'boq_draft.json'
OUT_HTML      = OUT / 'report.html'
OUT_REPORT    = OUT / 'report.md'
OUT_OVERVIEW  = OUT / 'overview.png'
OUT_DEDUP_DBG = OUT / 'dedup_audit.png'

# ── Scale config ──────────────────────────────────────────────────────────────
# 1 PDF point = 25.4/72 mm on paper.
# At plan scale 1:N, 1 pt on paper = N × 25.4/72 mm = N × 0.353 mm in reality.
SCALE_RATIO_FALLBACK = 500
PT_MM = 25.4 / 72    # mm per PDF point (on paper)

# ── Drawing area boundary ─────────────────────────────────────────────────────
DRAW_X_MAX = 3900    # pt — exclude title block area (dates found at x > 4000)

# ── Minimum arc to be a measurable element ────────────────────────────────────
MIN_ARC_PT = 30      # pt

# ── Deduplication thresholds ──────────────────────────────────────────────────
# AutoCAD renders both edges of every thick line as separate paths.
# Two paths of the same type are treated as one element if:
DEDUP_ARC_TOL = 0.02    # arc lengths within 2%
DEDUP_X0_TOL  = 35.0    # start-x within 35 pt
DEDUP_Y0_TOL  = 35.0    # start-y within 35 pt

# ── Element color taxonomy ────────────────────────────────────────────────────
# v1 (original): Derived from RGB frequency analysis.
# v2 addition: red_element + marking_vermilion confirmed in legend rows 0-2, 7, 9
#              by POC C (16_legend_color_match.py).
# All entries: color_taxonomy_confidence='unverified' until legend labels confirmed.
ELEMENT_TYPES: Dict[Tuple, Dict] = {
    # ── v1 — frequency-derived ─────────────────────────────────────────────────
    (1.0,    1.0,    0.0   ): {'type': 'guardrail',          'he': 'מעקה',                'boq_category': 'guardrail', 'rgb8': (255, 255,   0), 'taxonomy_source': 'frequency_analysis'},
    (1.0,    0.702,  0.6   ): {'type': 'barrier_pink',       'he': 'גדר/מחסום ורוד',     'boq_category': 'barrier',   'rgb8': (255, 179, 153), 'taxonomy_source': 'frequency_analysis'},
    (0.0,    0.0,    1.0   ): {'type': 'road_marking',       'he': 'סימון כביש כחול',    'boq_category': 'marking',   'rgb8': (  0,   0, 255), 'taxonomy_source': 'frequency_analysis'},
    (0.498,  1.0,    0.498 ): {'type': 'fence_green',        'he': 'גדר ירוקה',           'boq_category': 'fence',     'rgb8': (127, 255, 127), 'taxonomy_source': 'frequency_analysis'},
    (1.0,    0.6,    0.2   ): {'type': 'marking_orange',     'he': 'סימון כתום',          'boq_category': 'marking',   'rgb8': (255, 153,  51), 'taxonomy_source': 'frequency_analysis'},
    (0.0,    0.498,  1.0   ): {'type': 'marking_mid_blue',   'he': 'סימון כחול בינוני',  'boq_category': 'marking',   'rgb8': (  0, 127, 255), 'taxonomy_source': 'frequency_analysis'},
    (0.8,    0.6,    1.0   ): {'type': 'marking_purple',     'he': 'סימון סגול',          'boq_category': 'other',     'rgb8': (204, 153, 255), 'taxonomy_source': 'frequency_analysis'},
    (1.0,    0.749,  0.0   ): {'type': 'marking_amber',      'he': 'סימון ענבר',          'boq_category': 'marking',   'rgb8': (255, 191,   0), 'taxonomy_source': 'frequency_analysis'},
    (0.0,    0.216,  0.867 ): {'type': 'marking_royal',      'he': 'סימון כחול כהה',     'boq_category': 'marking',   'rgb8': (  0,  55, 221), 'taxonomy_source': 'frequency_analysis'},
    # ── v2 — legend-derived (POC C, 16_legend_color_match.py) ─────────────────
    (1.0,    0.0,    0.0   ): {'type': 'red_element',        'he': 'סימון אדום (לא מזוהה)', 'boq_category': 'marking', 'rgb8': (255,   0,   0), 'taxonomy_source': 'legend_icon_rows_0_1_2'},
    (1.0,    0.247,  0.0   ): {'type': 'marking_vermilion',  'he': 'סימון ורמיליון',      'boq_category': 'marking',   'rgb8': (255,  63,   0), 'taxonomy_source': 'legend_icon_rows_7_9'},
}

COLOR_TOL   = 0.015   # slightly wider to catch 0.247 vs 0.25 edge cases

# ── Render settings ───────────────────────────────────────────────────────────
RENDER_DPI = 36
RENDER_MAT = fitz.Matrix(RENDER_DPI / 72, RENDER_DPI / 72)

# ─────────────────────────────────────────────────────────────────────────────


def color_key(rgb: Optional[Tuple]) -> Optional[Dict]:
    if rgb is None:
        return None
    for ref, meta in ELEMENT_TYPES.items():
        if all(abs(a - b) <= COLOR_TOL for a, b in zip(rgb, ref)):
            return meta
    return None


def arc_length(pts: List[Tuple[float, float]]) -> float:
    return sum(
        math.hypot(pts[i+1][0] - pts[i][0], pts[i+1][1] - pts[i][1])
        for i in range(len(pts) - 1)
    )


# ── Scale detection ───────────────────────────────────────────────────────────

def detect_scale_from_text(page) -> Optional[int]:
    text = page.extract_text() or ''
    text += ' '.join(w['text'] for w in (page.extract_words() or []))
    matches = re.findall(r'1\s*:\s*(\d+)', text)
    if matches:
        plausible = [int(m) for m in matches if 100 <= int(m) <= 2000]
        if plausible:
            return plausible[0]
    return None


def fit_circle(pts: List[Tuple[float, float]]) -> Optional[float]:
    arr = np.array(pts, dtype=float)
    if len(arr) < 3:
        return None
    x, y = arr[:, 0], arr[:, 1]
    A = np.column_stack([2*x, 2*y, np.ones(len(arr))])
    b = x**2 + y**2
    try:
        res, _, _, _ = np.linalg.lstsq(A, b, rcond=None)
    except np.linalg.LinAlgError:
        return None
    cx, cy, _ = res
    return float(np.mean(np.hypot(x - cx, y - cy)))


def detect_scale_from_r_annotation(page, page_h: float) -> Optional[Tuple[int, str]]:
    words = page.extract_words(extra_attrs=['size']) or []
    all_text = ' '.join(w['text'] for w in words)
    m = re.search(r'R\s*=\s*(\d+\.?\d*)', all_text) or \
        re.search(r'R\s*=\s*(\d+\.?\d*)', page.extract_text() or '')
    if not m:
        return None
    r_m = float(m.group(1))
    if not (0 < r_m <= 5000):
        return None

    dwords = [w for w in words if any(c.isdigit() for c in w['text'])]
    if not dwords:
        return None
    ann_x   = np.mean([w['x0']  for w in dwords[:4]])
    ann_top = np.mean([w['top'] for w in dwords[:4]])

    cands = []
    for c in (page.curves or []):
        pts = c.get('pts', [])
        if len(pts) < 4:
            continue
        ptsl = [(p[0], page_h - p[1]) for p in pts]
        al   = arc_length(ptsl)
        if al < 50:
            continue
        cx = np.mean([p[0] for p in ptsl])
        cy = np.mean([p[1] for p in ptsl])
        d  = math.hypot(cx - ann_x, cy - ann_top)
        if d < 400:
            cands.append((d, al, ptsl))

    cands.sort(key=lambda x: x[0])
    for dist, _, ptsl in cands[:5]:
        r_pts = fit_circle(ptsl)
        if r_pts and r_pts > 0:
            scale = r_m / (r_pts * PT_MM / 1000)
            sr    = round(scale / 50) * 50
            if 100 <= sr <= 2000:
                note = (f'R={r_m}m annotation → circle fit '
                        f'(r={r_pts:.1f}pt, dist={dist:.0f}pt) → 1:{scale:.0f} → rounded 1:{sr}')
                return int(sr), note
    return None


def detect_scale(page, page_h: float) -> Tuple[int, str, str, bool]:
    """Returns (ratio, source_key, note, verified)."""
    ratio = detect_scale_from_text(page)
    if ratio:
        return ratio, 'title_block_text', f'text pattern "1:{ratio}"', True

    res = detect_scale_from_r_annotation(page, page_h)
    if res:
        ratio, note = res
        return ratio, 'r_annotation_circle_fit', note, True

    return (SCALE_RATIO_FALLBACK,
            'fallback_assumption',
            f'no scale found in PDF — using config fallback 1:{SCALE_RATIO_FALLBACK}',
            False)


def build_scale_info(ratio: int, source: str, note: str, verified: bool) -> Dict:
    status = 'verified' if verified else 'unverified'
    return {
        'ratio':        ratio,
        'source':       source,
        'status':       status,
        'requires_human_scale_confirmation': not verified,
        'detection_note': note,
        'm_per_pt':     round(ratio * PT_MM / 1000, 6),
        'calibration': {
            'status':               'not_calibrated',
            'method':               None,
            'point_a_pdf':          None,
            'point_b_pdf':          None,
            'known_distance_m':     None,
            'derived_m_per_pt':     None,
            'calibrated_by':        None,
            'calibrated_at':        None,
            'note': (
                'To manually calibrate: identify two points with a known real-world distance. '
                'Record their PDF coordinates (x, y) in point_a_pdf and point_b_pdf. '
                'Enter the real-world distance in known_distance_m. '
                'derived_m_per_pt = known_distance_m / hypot(dx_pt, dy_pt). '
                'Re-run the script with use_calibration=True to recalculate all measurements.'
            ),
        },
    }


def build_color_taxonomy() -> Dict:
    return {
        'source':                          'color_frequency_analysis',
        'confidence':                      'unverified',
        'legend_match_status':             'not_checked',
        'requires_human_color_confirmation': True,
        'note': (
            'Mapping derived from RGB frequency analysis of vector paths in this specific plan. '
            'Not confirmed against the plan legend (מקרא). '
            'Colors may differ across plans, AutoCAD versions, or project standards. '
            'Do not assume this mapping applies to other PDF plans without re-verification.'
        ),
        'mapping': {
            str(list(k)): {
                'type':         v['type'],
                'he':           v['he'],
                'boq_category': v['boq_category'],
                'confidence':   'unverified',
            }
            for k, v in ELEMENT_TYPES.items()
        },
    }


# ── Path extraction ───────────────────────────────────────────────────────────

def extract_elements(page, page_h: float, scale_ratio: int,
                     scale_verified: bool) -> List[Dict]:
    m_per_pt  = scale_ratio * PT_MM / 1000
    elements  = []
    elem_id   = 0

    for curve in (page.curves or []):
        raw = curve.get('pts', [])
        if len(raw) < 2:
            continue
        pts = [(p[0], page_h - p[1]) for p in raw]
        xs  = [p[0] for p in pts]
        ys  = [p[1] for p in pts]
        x0, x1 = min(xs), max(xs)
        t0, t1 = min(ys), max(ys)

        if x0 > DRAW_X_MAX:
            continue

        al = arc_length(pts)
        if al < MIN_ARC_PT:
            continue

        meta = color_key(curve.get('stroking_color'))
        if meta is None:
            continue

        elem_id += 1
        elements.append({
            'element_id':           f'MEAS-{elem_id:05d}',
            'type':                 meta['type'],
            'type_he':              meta['he'],
            'boq_category':         meta['boq_category'],
            'stroke_color_rgb':     list(curve['stroking_color']),
            'arc_length_pt':        round(al, 2),
            'arc_length_m':         round(al * m_per_pt, 3),
            'bbox_pdf':             [round(x0,1), round(t0,1), round(x1,1), round(t1,1)],
            'n_pts':                len(pts),
            'scale_ratio':          scale_ratio,
            'scale_verified':       scale_verified,
            'color_taxonomy_source':'color_frequency_analysis',
            'color_taxonomy_confidence': 'unverified',
            'measurement_method':   'arc_length_polyline',
            'requires_review':      True,
            'approved_for_boq':     False,
            'human_confirmed_length_m': None,
            'human_label_source':   None,
        })

    return elements


# ── Deduplication ─────────────────────────────────────────────────────────────

def deduplicate_elements(elements: List[Dict]
                          ) -> Tuple[List[Dict], List[Dict], Dict]:
    """
    Remove one copy from each near-duplicate pair (same type, ≈arc, ≈x0, ≈y0).
    AutoCAD renders both edges of every thick line as separate paths.

    Returns (kept, removed, audit_dict).
    """
    removed_idx  = set()
    sample_pairs = []

    by_type: Dict[str, List[int]] = defaultdict(list)
    for i, e in enumerate(elements):
        by_type[e['type']].append(i)

    for etype, idxs in by_type.items():
        sorted_idxs = sorted(idxs, key=lambda i: elements[i]['bbox_pdf'][0])
        for a in range(len(sorted_idxs)):
            ia = sorted_idxs[a]
            if ia in removed_idx:
                continue
            ea = elements[ia]
            for b in range(a + 1, len(sorted_idxs)):
                ib = sorted_idxs[b]
                if ib in removed_idx:
                    continue
                eb = elements[ib]
                if eb['bbox_pdf'][0] - ea['bbox_pdf'][0] > DEDUP_X0_TOL * 2:
                    break
                arc_a, arc_b = ea['arc_length_pt'], eb['arc_length_pt']
                if (abs(arc_a - arc_b) / max(arc_a, 0.001) <= DEDUP_ARC_TOL
                        and abs(ea['bbox_pdf'][0] - eb['bbox_pdf'][0]) <= DEDUP_X0_TOL
                        and abs(ea['bbox_pdf'][1] - eb['bbox_pdf'][1]) <= DEDUP_Y0_TOL):
                    removed_idx.add(ib if arc_a >= arc_b else ia)
                    if len(sample_pairs) < 5:
                        sample_pairs.append({
                            'kept':    ea['element_id'],
                            'removed': eb['element_id'],
                            'arc_kept_pt':    round(max(arc_a, arc_b), 2),
                            'arc_removed_pt': round(min(arc_a, arc_b), 2),
                            'dx_pt':   round(abs(ea['bbox_pdf'][0] - eb['bbox_pdf'][0]), 2),
                            'dy_pt':   round(abs(ea['bbox_pdf'][1] - eb['bbox_pdf'][1]), 2),
                            'type':    etype,
                        })

    kept    = [e for i, e in enumerate(elements) if i not in removed_idx]
    removed = [e for i, e in enumerate(elements) if i     in removed_idx]

    audit = {
        'paths_before_dedup':   len(elements),
        'paths_after_dedup':    len(kept),
        'duplicates_removed':   len(removed),
        'deduplication_method': 'bbox_arc_proximity_matching',
        'thresholds': {
            'arc_tolerance_pct': DEDUP_ARC_TOL * 100,
            'x0_tolerance_pt':   DEDUP_X0_TOL,
            'y0_tolerance_pt':   DEDUP_Y0_TOL,
        },
        'risks': {
            'false_positive': (
                'Threshold too aggressive: adjacent parallel structures (e.g., two nearby '
                'guardrail runs) with similar arc lengths may be incorrectly collapsed into one.'
            ),
            'false_negative': (
                'Threshold too loose: widely spaced parallel edges of the same thick line '
                'may both be kept, doubling the measured quantity.'
            ),
            'current_assessment': 'requires_review — thresholds not validated against ground truth',
        },
        'requires_review': True,
        'sample_pairs':  sample_pairs,
    }
    return kept, removed, audit


# ── Connected-component grouping ──────────────────────────────────────────────

def group_into_runs(elements: List[Dict], snap: float = 4.0) -> List[Dict]:
    type_elems: Dict[str, List[Dict]] = defaultdict(list)
    for e in elements:
        type_elems[e['type']].append(e)

    runs  = []
    run_n = 0

    for etype, elems in type_elems.items():
        parent = list(range(len(elems)))

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        def union(i, j):
            ri, rj = find(i), find(j)
            if ri != rj:
                parent[ri] = rj

        eps = []
        for i, e in enumerate(elems):
            b = e['bbox_pdf']
            eps.append(((b[0], b[1]), i))
            eps.append(((b[2], b[3]), i))

        for a in range(len(eps)):
            for b_idx in range(a+1, len(eps)):
                pa, ia = eps[a]
                pb, ib = eps[b_idx]
                if math.hypot(pa[0]-pb[0], pa[1]-pb[1]) <= snap:
                    union(ia, ib)

        comp: Dict[int, List[int]] = defaultdict(list)
        for i in range(len(elems)):
            comp[find(i)].append(i)

        for members in comp.values():
            run_n += 1
            total_m  = sum(elems[i]['arc_length_m']  for i in members)
            total_pt = sum(elems[i]['arc_length_pt'] for i in members)
            bboxes   = [elems[i]['bbox_pdf'] for i in members]
            x0 = min(b[0] for b in bboxes); t0 = min(b[1] for b in bboxes)
            x1 = max(b[2] for b in bboxes); t1 = max(b[3] for b in bboxes)

            runs.append({
                'run_id':           f'RUN-{run_n:04d}',
                'type':             etype,
                'type_he':          elems[members[0]]['type_he'],
                'boq_category':     elems[members[0]]['boq_category'],
                'n_segments':       len(members),
                'total_length_m':   round(total_m, 3),
                'total_length_pt':  round(total_pt, 2),
                'bbox_pdf':         [round(x0,1), round(t0,1), round(x1,1), round(t1,1)],
                'element_ids':      [elems[i]['element_id'] for i in members],
                'scale_ratio':      elems[members[0]]['scale_ratio'],
                'scale_verified':   elems[members[0]]['scale_verified'],
                'requires_review':  True,
                'approved_for_boq': False,
                'human_confirmed_length_m': None,
            })

    runs.sort(key=lambda r: -r['total_length_m'])
    return runs


# ── BOQ draft ────────────────────────────────────────────────────────────────

def build_boq_draft(elements: List[Dict], runs: List[Dict],
                    scale_info: Dict, color_taxonomy: Dict) -> Dict:
    type_totals: Dict[str, float] = defaultdict(float)
    type_nsegs:  Dict[str, int]   = defaultdict(int)
    type_nruns:  Dict[str, int]   = defaultdict(int)
    for r in runs:
        type_totals[r['type']] += r['total_length_m']
        type_nruns[r['type']]  += 1
    for e in elements:
        type_nsegs[e['type']] += 1

    items = []
    n = 1
    meta_map = {m['type']: (k, m) for k, m in ELEMENT_TYPES.items()}

    for etype in sorted(type_totals, key=lambda t: -type_totals[t]):
        color_key_tup, meta = meta_map.get(etype, (None, {}))
        items.append({
            'item_id':              f'BOQ-LIN-{n:03d}',
            'item_type':            'measured_linear_quantity',
            'description':          f"{etype} / {meta.get('he','')}",
            'boq_category':         meta.get('boq_category', 'unknown'),
            'color_classification': str([round(c, 3) for c in color_key_tup]) if color_key_tup else 'unknown',
            'color_taxonomy_source':     color_taxonomy['source'],
            'color_taxonomy_confidence': color_taxonomy['confidence'],
            'requires_human_color_confirmation': True,
            'segment_count':        type_nsegs[etype],
            'run_count':            type_nruns[etype],
            'total_length_m':       round(type_totals[etype], 2),
            'scale_used':           scale_info['ratio'],
            'scale_status':         scale_info['status'],
            'confidence':           'very_low',  # scale + color both unverified
            'requires_review':      True,
            'approved_for_boq':     False,
            'human_approved_quantity': None,
            'human_approved_unit':     None,
            'evidence_overlay':     'scale_measurement/overview.png',
            'per_type_overlay':     f'scale_measurement/by_type/{etype}.png',
            'notes': (
                f"Scale 1:{scale_info['ratio']} is {scale_info['status']}. "
                f"Color taxonomy is {color_taxonomy['confidence']}. "
                'Both require human confirmation before operational use.'
            ),
        })
        n += 1

    # Placeholder items for future quantity types
    items += [
        {
            'item_id':   'BOQ-AREA-001',
            'item_type': 'measured_area_quantity',
            'description': 'area measurement (not yet implemented)',
            'status':    'placeholder',
            'notes':     'Future: detect closed regions and compute m² (road surface, paved area).',
        },
        {
            'item_id':   'BOQ-COUNT-001',
            'item_type': 'counted_quantity',
            'description': 'sign / pole / assembly counts (from POC 3 — vector glyph recognition)',
            'status':    'placeholder',
            'notes':     'Future: join review_queue.json approved_for_boq items here.',
        },
        {
            'item_id':   'BOQ-HUMAN-001',
            'item_type': 'human_approved_quantity',
            'description': 'human-approved measurements (awaiting review)',
            'status':    'placeholder',
            'notes':     'Items where human_approved_quantity overrides auto measurement.',
        },
    ]

    return {
        'status':                'provisional',
        'scale_status':          scale_info['status'],
        'color_taxonomy_status': color_taxonomy['confidence'],
        'approved_for_boq':      False,
        'requires_review':       True,
        'disclaimer': (
            'PROVISIONAL MEASUREMENTS ONLY. '
            f"Scale 1:{scale_info['ratio']} is ASSUMED, not verified from the plan document. "
            'Color-to-element mapping has NOT been confirmed against the plan legend (מקרא). '
            'Not approved for construction, execution, procurement, or billing. '
            'Treat as research draft only until all items marked requires_review are resolved.'
        ),
        'items': items,
    }


# ── Raster rendering helpers ──────────────────────────────────────────────────

def render_base_image(page_w: float, page_h: float) -> np.ndarray:
    doc = fitz.open(PDF_PATH)
    pix = doc[0].get_pixmap(matrix=RENDER_MAT, colorspace=fitz.csRGB)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, 3).copy()
    doc.close()
    return img


def pdf_to_img(x: float, y: float, img_w: int, img_h: int,
               page_w: float, page_h: float) -> Tuple[int, int]:
    return (int(x * img_w / page_w), int(y * img_h / page_h))


def draw_element_rect(canvas: np.ndarray, elem: Dict,
                      img_w: int, img_h: int,
                      page_w: float, page_h: float,
                      bgr: Tuple[int,int,int], thickness: int = 1) -> None:
    b = elem['bbox_pdf']
    x0, y0 = pdf_to_img(b[0], b[1], img_w, img_h, page_w, page_h)
    x1, y1 = pdf_to_img(b[2], b[3], img_w, img_h, page_w, page_h)
    x0, x1 = min(x0,x1), max(x0,x1)
    y0, y1 = min(y0,y1), max(y0,y1)
    cv2.rectangle(canvas, (x0,y0), (max(x1,x0+1), max(y1,y0+1)), bgr, thickness)


def build_overview(elements: List[Dict],
                   page_w: float, page_h: float) -> np.ndarray:
    base    = render_base_image(page_w, page_h)
    ih, iw  = base.shape[:2]
    overlay = base.copy()
    meta_by_type = {m['type']: m for m in ELEMENT_TYPES.values()}

    for e in elements:
        meta = meta_by_type.get(e['type'])
        if not meta:
            continue
        r, g, b = meta['rgb8']
        draw_element_rect(overlay, e, iw, ih, page_w, page_h, (b, g, r), 1)

    blended = cv2.addWeighted(overlay, 0.7, base, 0.3, 0)

    # Legend
    ly = 22
    for _, meta in ELEMENT_TYPES.items():
        r, g, b = meta['rgb8']
        cv2.rectangle(blended, (8, ly-10), (22, ly+2), (b,g,r), -1)
        cv2.putText(blended, meta['type'], (26, ly),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.32, (20,20,20), 1)
        ly += 16

    return blended


def build_per_type_overlays(elements: List[Dict],
                             page_w: float, page_h: float) -> Dict[str, str]:
    """Generate one PNG per element type. Returns type→path mapping."""
    base = render_base_image(page_w, page_h)
    ih, iw = base.shape[:2]
    paths: Dict[str, str] = {}
    meta_by_type = {m['type']: m for m in ELEMENT_TYPES.values()}

    by_type: Dict[str, List[Dict]] = defaultdict(list)
    for e in elements:
        by_type[e['type']].append(e)

    for etype, elems in by_type.items():
        canvas = base.copy()
        meta   = meta_by_type.get(etype)
        if not meta:
            continue
        r, g, b = meta['rgb8']
        for e in elems:
            draw_element_rect(canvas, e, iw, ih, page_w, page_h, (b, g, r), 2)

        out_path = OUT / 'by_type' / f'{etype}.png'
        cv2.imwrite(str(out_path), canvas)
        paths[etype] = str(out_path)

    return paths


def build_dedup_overlay(kept: List[Dict], removed: List[Dict],
                        page_w: float, page_h: float) -> np.ndarray:
    """Green = kept segments, Red = removed duplicates."""
    base   = render_base_image(page_w, page_h)
    ih, iw = base.shape[:2]
    canvas = base.copy()

    for e in removed:
        draw_element_rect(canvas, e, iw, ih, page_w, page_h, (0, 0, 200), 1)  # red
    for e in kept:
        draw_element_rect(canvas, e, iw, ih, page_w, page_h, (0, 180, 0), 1)  # green

    blended = cv2.addWeighted(canvas, 0.75, base, 0.25, 0)
    cv2.putText(blended, 'GREEN = kept   RED = deduplicated (removed)', (8, 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (10, 10, 10), 1)
    return blended


# ── Text report ───────────────────────────────────────────────────────────────

DISCLAIMER = (
    '> **PROVISIONAL MEASUREMENTS — NOT APPROVED BOQ DATA**  \n'
    '> Scale is assumed (1:500), not verified from the plan.  \n'
    '> Color taxonomy not confirmed against plan legend (מקרא).  \n'
    '> Not approved for construction, execution, procurement, or billing.  \n'
    '> All items carry `requires_review = true`.'
)


def build_report(elements: List[Dict], runs: List[Dict],
                 scale_info: Dict, color_taxonomy: Dict,
                 dedup_audit: Dict, boq: Dict, elapsed: float) -> str:
    type_totals: Dict[str, float] = defaultdict(float)
    type_counts: Dict[str, int]   = defaultdict(int)
    for e in elements:
        type_totals[e['type']] += e['arc_length_m']
        type_counts[e['type']] += 1

    longest_run: Dict[str, float] = defaultdict(float)
    for r in runs:
        if r['total_length_m'] > longest_run[r['type']]:
            longest_run[r['type']] = r['total_length_m']

    meta_map = {m['type']: m for m in ELEMENT_TYPES.values()}
    sr = scale_info['ratio']
    ss = scale_info['status'].upper()

    lines = [
        '# Scale Measurement Report — POC B v2 (Stage H)',
        '',
        f'**PDF**: `{PDF_PATH.name}`  ',
        f'**Scale**: 1:{sr}  — `{ss}`  ',
        f'**Scale source**: `{scale_info["source"]}`  ',
        f'**Detection note**: {scale_info["detection_note"]}  ',
        f'**m per PDF point**: {scale_info["m_per_pt"]:.6f}  ',
        f'**Requires human scale confirmation**: `{scale_info["requires_human_scale_confirmation"]}`',
        '',
        DISCLAIMER,
        '',
        '---',
        '',
        '## 1 · Scale Status',
        '',
        f'| Field | Value |',
        f'|-------|-------|',
        f'| ratio | 1:{sr} |',
        f'| source | `{scale_info["source"]}` |',
        f'| status | `{scale_info["status"]}` |',
        f'| requires_human_scale_confirmation | `{scale_info["requires_human_scale_confirmation"]}` |',
        '',
        '### Manual calibration readiness',
        '',
        '```json',
        json.dumps(scale_info['calibration'], indent=2, ensure_ascii=False),
        '```',
        '',
        '---',
        '',
        '## 2 · Color Taxonomy',
        '',
        f'| Field | Value |',
        f'|-------|-------|',
        f'| source | `{color_taxonomy["source"]}` |',
        f'| confidence | `{color_taxonomy["confidence"]}` |',
        f'| legend_match_status | `{color_taxonomy["legend_match_status"]}` |',
        f'| requires_human_color_confirmation | `{color_taxonomy["requires_human_color_confirmation"]}` |',
        '',
        f'> {color_taxonomy["note"]}',
        '',
        '| Color (RGB) | Type | HE | BOQ Category | Confidence |',
        '|-------------|------|----|--------------|------------|',
    ]
    for col, info in color_taxonomy['mapping'].items():
        lines.append(f'| `{col}` | {info["type"]} | {info["he"]} | {info["boq_category"]} | {info["confidence"]} |')

    lines += [
        '',
        '---',
        '',
        '## 3 · Deduplication Audit',
        '',
        f'| Field | Value |',
        f'|-------|-------|',
        f'| paths before dedup | {dedup_audit["paths_before_dedup"]} |',
        f'| paths after dedup  | {dedup_audit["paths_after_dedup"]} |',
        f'| duplicates removed | {dedup_audit["duplicates_removed"]} |',
        f'| method | `{dedup_audit["deduplication_method"]}` |',
        f'| arc tolerance | {dedup_audit["thresholds"]["arc_tolerance_pct"]:.0f}% |',
        f'| x0 tolerance | {dedup_audit["thresholds"]["x0_tolerance_pt"]:.0f} pt |',
        f'| y0 tolerance | {dedup_audit["thresholds"]["y0_tolerance_pt"]:.0f} pt |',
        f'| requires_review | `{dedup_audit["requires_review"]}` |',
        '',
        '**Risks:**',
        f'- False positive: {dedup_audit["risks"]["false_positive"]}',
        f'- False negative: {dedup_audit["risks"]["false_negative"]}',
        '',
        '**Sample deduplicated pairs:**',
        '',
        '| Kept | Removed | Arc kept (pt) | Arc removed (pt) | dx | dy | Type |',
        '|------|---------|---------------|------------------|----|----|------|',
    ]
    for sp in dedup_audit['sample_pairs']:
        lines.append(
            f'| {sp["kept"]} | {sp["removed"]} | {sp["arc_kept_pt"]} '
            f'| {sp["arc_removed_pt"]} | {sp["dx_pt"]} | {sp["dy_pt"]} | {sp["type"]} |'
        )
    lines.append(f'\n*Debug overlay: `outputs/scale_measurement/dedup_audit.png`*')

    lines += [
        '',
        '---',
        '',
        '## 4 · Measured Quantities (provisional)',
        '',
        '| Type | HE | BOQ Category | Segments | Total (m) | Longest run (m) |',
        '|------|----|--------------|----------|-----------|-----------------|',
    ]
    for etype in sorted(type_totals, key=lambda t: -type_totals[t]):
        meta = meta_map.get(etype, {})
        lines.append(
            f'| {etype} | {meta.get("he","")} | {meta.get("boq_category","")} '
            f'| {type_counts[etype]} | **{type_totals[etype]:.1f}** '
            f'| {longest_run.get(etype, 0):.1f} |'
        )

    lines += [
        '',
        '---',
        '',
        '## 5 · BOQ Draft (provisional)',
        '',
        f'Status: `{boq["status"]}` | Scale: `{boq["scale_status"]}` | Color taxonomy: `{boq["color_taxonomy_status"]}`',
        '',
        '| Item ID | Type | Length (m) | Scale | Confidence | Approved |',
        '|---------|------|------------|-------|------------|----------|',
    ]
    for item in boq['items']:
        if item.get('status') == 'placeholder':
            lines.append(f'| {item["item_id"]} | {item["item_type"]} | — | — | placeholder | ✗ |')
        else:
            lines.append(
                f'| {item["item_id"]} | {item["item_type"]} '
                f'| {item.get("total_length_m",""):>8} | 1:{item.get("scale_used","")} '
                f'({item.get("scale_status","")}) | {item.get("confidence","")} | ✗ |'
            )

    lines += [
        '',
        '---',
        '',
        '## 6 · Debug Outputs',
        '',
        '| File | Description |',
        '|------|-------------|',
        '| `scale_measurement/overview.png` | All element types overlaid on plan raster |',
        '| `scale_measurement/dedup_audit.png` | Green = kept, Red = deduplicated |',
    ]
    for etype in sorted(type_totals):
        lines.append(f'| `scale_measurement/by_type/{etype}.png` | {etype} segments only |')

    lines += [
        '',
        '---',
        '',
        '## 7 · Recommended Next Steps',
        '',
        '| Option | Description | Priority |',
        '|--------|-------------|----------|',
        '| A | **Manual scale calibration POC** — user marks two known-distance points; system derives m/pt | HIGH — unlocks reliable measurements |',
        '| B | **Color taxonomy / legend matching POC** — extract plan legend (מקרא), match to color taxonomy | HIGH — confirms element types |',
        '| C | **Draft BOQ aggregation POC** — merge sign counts (POC 3) + measurements into one BOQ draft | MEDIUM — requires A+B first |',
        '| D | **Interactive plan decomposition POC** — detect visual element groups, include/ignore candidates | MEDIUM — broader scan capability |',
        '| E | **Review/approval workflow** — interactive review queue for human confirmation of quantities | MEDIUM — depends on C |',
        '',
        f'*Elapsed: {elapsed:.1f}s*',
        '',
        '---',
        '*Scale not verified by licensed surveyor. Measurements are for research only.*',
    ]

    return '\n'.join(lines)


# ── HTML report ───────────────────────────────────────────────────────────────

def build_html(elements: List[Dict], runs: List[Dict],
               scale_info: Dict, color_taxonomy: Dict,
               dedup_audit: Dict, boq: Dict, elapsed: float) -> str:

    type_totals: Dict[str, float] = defaultdict(float)
    type_counts: Dict[str, int]   = defaultdict(int)
    for e in elements:
        type_totals[e['type']] += e['arc_length_m']
        type_counts[e['type']] += 1

    meta_by_type = {m['type']: m for m in ELEMENT_TYPES.values()}
    sr = scale_info['ratio']
    ss = scale_info['status']
    vbadge = ('<span style="color:green;font-weight:bold">✓ VERIFIED</span>'
              if ss == 'verified' else
              '<span style="color:orange;font-weight:bold">⚠ UNVERIFIED</span>')

    # Summary table rows
    rows_sum = ''
    for etype in sorted(type_totals, key=lambda t: -type_totals[t]):
        meta = meta_by_type.get(etype, {})
        r, g, b = meta.get('rgb8', (200,200,200))
        sw = f'background:rgb({r},{g},{b})'
        rows_sum += (
            f'<tr>'
            f'<td><span style="display:inline-block;width:14px;height:14px;{sw};border:1px solid #888"></span>'
            f' {etype}</td>'
            f'<td>{meta.get("he","")}</td><td>{meta.get("boq_category","")}</td>'
            f'<td>{type_counts[etype]}</td>'
            f'<td><strong>{type_totals[etype]:.1f} m</strong></td>'
            f'<td><a href="by_type/{etype}.png" target="_blank">overlay</a></td>'
            f'</tr>\n'
        )

    # BOQ draft rows
    rows_boq = ''
    for item in boq['items']:
        if item.get('status') == 'placeholder':
            rows_boq += (
                f'<tr style="color:#aaa">'
                f'<td>{item["item_id"]}</td><td>{item["item_type"]}</td>'
                f'<td colspan="4"><em>{item["description"]}</em></td>'
                f'</tr>\n'
            )
        else:
            rows_boq += (
                f'<tr>'
                f'<td>{item["item_id"]}</td>'
                f'<td>{item["item_type"]}</td>'
                f'<td>{item.get("description","")}</td>'
                f'<td><strong>{item.get("total_length_m",""):g} m</strong></td>'
                f'<td>1:{item.get("scale_used","")} ({item.get("scale_status","")})</td>'
                f'<td><span style="color:red">✗ not approved</span></td>'
                f'</tr>\n'
            )

    # Dedup sample
    rows_dedup = ''
    for sp in dedup_audit['sample_pairs']:
        rows_dedup += (
            f'<tr><td>{sp["kept"]}</td><td>{sp["removed"]}</td>'
            f'<td>{sp["arc_kept_pt"]}</td><td>{sp["arc_removed_pt"]}</td>'
            f'<td>{sp["dx_pt"]}</td><td>{sp["dy_pt"]}</td><td>{sp["type"]}</td></tr>\n'
        )

    # Color taxonomy rows
    rows_tax = ''
    for col, info in color_taxonomy['mapping'].items():
        rows_tax += (
            f'<tr><td><code>{col}</code></td><td>{info["type"]}</td>'
            f'<td>{info["he"]}</td><td>{info["boq_category"]}</td>'
            f'<td><span style="color:orange">{info["confidence"]}</span></td></tr>\n'
        )

    return f'''<!DOCTYPE html>
<html lang="he">
<head>
<meta charset="utf-8">
<title>Scale Measurement v2 — POC B</title>
<style>
body{{font-family:system-ui,sans-serif;margin:24px;background:#f9f9f9;color:#111}}
h1{{font-size:1.4rem}}h2{{font-size:1.1rem;margin-top:2.2em;border-bottom:1px solid #ddd;padding-bottom:4px}}
table{{border-collapse:collapse;width:100%;max-width:960px;background:#fff;font-size:.85rem;margin-bottom:1em}}
th,td{{border:1px solid #ccc;padding:5px 9px;text-align:left}}th{{background:#eee}}
.warn{{background:#fffbe6;border:2px solid #f0c040;padding:14px 18px;border-radius:6px;max-width:900px;margin-bottom:1em}}
.ok{{background:#f0fff4;border:1px solid #6fcf97;padding:10px 14px;border-radius:4px}}
img{{max-width:100%;border:1px solid #ccc;margin:8px 0}}
details{{margin:8px 0}}summary{{cursor:pointer;font-weight:600}}
code{{background:#f3f3f3;padding:1px 4px;border-radius:3px;font-size:.85em}}
</style>
</head>
<body>
<h1>Scale Measurement v2 — POC B (Stage H)</h1>
<p>
  <strong>PDF:</strong> {PDF_PATH.name}&nbsp;|&nbsp;
  <strong>Scale:</strong> 1:{sr} {vbadge}&nbsp;|&nbsp;
  <strong>Source:</strong> <code>{scale_info["source"]}</code>
</p>
<div class="warn">
  ⚠ <strong>PROVISIONAL MEASUREMENTS — NOT APPROVED BOQ DATA</strong><br>
  Scale 1:{sr} is <strong>ASSUMED</strong>, not verified from the plan document.<br>
  Color taxonomy not confirmed against plan legend (מקרא).<br>
  Not approved for construction, execution, procurement, or billing.<br>
  All items: <code>requires_review = true</code>, <code>approved_for_boq = false</code>.
</div>

<h2>1 · Scale Status</h2>
<table><tr><th>Field</th><th>Value</th></tr>
<tr><td>ratio</td><td>1:{sr}</td></tr>
<tr><td>source</td><td><code>{scale_info["source"]}</code></td></tr>
<tr><td>status</td><td>{vbadge}</td></tr>
<tr><td>detection_note</td><td>{scale_info["detection_note"]}</td></tr>
<tr><td>m_per_pt</td><td>{scale_info["m_per_pt"]:.6f}</td></tr>
<tr><td>requires_human_scale_confirmation</td><td><strong>{scale_info["requires_human_scale_confirmation"]}</strong></td></tr>
</table>
<details><summary>Manual calibration model (click to expand)</summary>
<pre style="background:#f3f3f3;padding:12px;font-size:.82rem">{json.dumps(scale_info["calibration"], indent=2, ensure_ascii=False)}</pre>
</details>

<h2>2 · Color Taxonomy</h2>
<table><tr><th>Field</th><th>Value</th></tr>
<tr><td>source</td><td><code>{color_taxonomy["source"]}</code></td></tr>
<tr><td>confidence</td><td><span style="color:orange"><strong>{color_taxonomy["confidence"]}</strong></span></td></tr>
<tr><td>legend_match_status</td><td><code>{color_taxonomy["legend_match_status"]}</code></td></tr>
<tr><td>requires_human_color_confirmation</td><td><strong>{color_taxonomy["requires_human_color_confirmation"]}</strong></td></tr>
</table>
<p><em>{color_taxonomy["note"]}</em></p>
<table>
<tr><th>Color (RGB)</th><th>Type</th><th>HE</th><th>BOQ Category</th><th>Confidence</th></tr>
{rows_tax}
</table>

<h2>3 · Deduplication Audit</h2>
<table><tr><th>Field</th><th>Value</th></tr>
<tr><td>paths before dedup</td><td>{dedup_audit["paths_before_dedup"]}</td></tr>
<tr><td>paths after dedup</td><td><strong>{dedup_audit["paths_after_dedup"]}</strong></td></tr>
<tr><td>duplicates removed</td><td>{dedup_audit["duplicates_removed"]}</td></tr>
<tr><td>method</td><td><code>{dedup_audit["deduplication_method"]}</code></td></tr>
<tr><td>arc tolerance</td><td>{dedup_audit["thresholds"]["arc_tolerance_pct"]:.0f}%</td></tr>
<tr><td>x0 / y0 tolerance</td><td>{dedup_audit["thresholds"]["x0_tolerance_pt"]:.0f} pt</td></tr>
<tr><td>requires_review</td><td><strong>{dedup_audit["requires_review"]}</strong></td></tr>
</table>
<p><strong>Risks:</strong><br>
False positive: {dedup_audit["risks"]["false_positive"]}<br>
False negative: {dedup_audit["risks"]["false_negative"]}</p>
<details><summary>Sample deduplicated pairs</summary>
<table>
<tr><th>Kept</th><th>Removed</th><th>Arc kept (pt)</th><th>Arc removed (pt)</th><th>dx</th><th>dy</th><th>Type</th></tr>
{rows_dedup}
</table></details>
<p><a href="dedup_audit.png" target="_blank">View dedup overlay (green=kept, red=removed)</a></p>

<h2>4 · Overview Image</h2>
<img src="overview.png" alt="plan overview with element overlays">

<h2>5 · Measured Quantities (provisional)</h2>
<table>
<tr><th>Type</th><th>HE</th><th>BOQ Category</th><th>Segments</th><th>Total (m)</th><th>Per-type overlay</th></tr>
{rows_sum}
</table>

<h2>6 · BOQ Draft (provisional)</h2>
<div class="warn">Status: <strong>{boq["status"]}</strong> | Scale: <strong>{boq["scale_status"]}</strong> | Color taxonomy: <strong>{boq["color_taxonomy_status"]}</strong></div>
<table>
<tr><th>Item ID</th><th>Type</th><th>Description</th><th>Length</th><th>Scale</th><th>Approved</th></tr>
{rows_boq}
</table>

<h2>7 · Recommended Next Steps</h2>
<table>
<tr><th>Option</th><th>Description</th><th>Priority</th></tr>
<tr><td>A</td><td><strong>Manual scale calibration POC</strong> — user marks two known-distance points; system derives m/pt</td><td><span style="color:red">HIGH</span> — unlocks reliable measurements</td></tr>
<tr><td>B</td><td><strong>Color taxonomy / legend matching POC</strong> — extract plan legend, match to color taxonomy</td><td><span style="color:red">HIGH</span> — confirms element types</td></tr>
<tr><td>C</td><td><strong>Draft BOQ aggregation POC</strong> — merge sign counts + measurements into one BOQ draft</td><td>MEDIUM — requires A+B first</td></tr>
<tr><td>D</td><td><strong>Interactive plan decomposition</strong> — detect visual element groups</td><td>MEDIUM</td></tr>
<tr><td>E</td><td><strong>Review/approval workflow</strong> — interactive queue for human confirmation</td><td>MEDIUM — depends on C</td></tr>
</table>

<p style="color:#888;font-size:.8rem">Generated in {elapsed:.1f}s — research/cad-pdf-intelligence/15_scale_measurement.py v2</p>
</body>
</html>'''


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    t0 = time.time()

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'by_type').mkdir(exist_ok=True)

    print('=' * 60)
    print('POC B v2 (Stage H) — Scale Measurement')
    print('15_scale_measurement.py')
    print('=' * 60)

    print(f'\n[Load] Opening PDF: {PDF_PATH}')
    with pdfplumber.open(PDF_PATH) as pdf:
        page   = pdf.pages[0]
        page_w, page_h = page.width, page.height
        print(f'[Load] Page: {page_w:.0f} × {page_h:.0f} pt  '
              f'({page_w*PT_MM:.0f} × {page_h*PT_MM:.0f} mm on paper)')

        # ── Scale ──────────────────────────────────────────────────────────
        print('\n[Scale] Detecting scale ...')
        ratio, source, note, verified = detect_scale(page, page_h)
        scale_info = build_scale_info(ratio, source, note, verified)
        m_per_pt   = scale_info['m_per_pt']
        print(f'[Scale] 1:{ratio}  source={source}  verified={verified}')
        print(f'[Scale] {note}')
        if not verified:
            print('[Scale] WARNING: scale UNVERIFIED — all measurements '
                  'marked requires_review=True')

        # ── Color taxonomy ─────────────────────────────────────────────────
        color_taxonomy = build_color_taxonomy()

        # ── Extract elements ───────────────────────────────────────────────
        print('\n[Extract] Extracting colored linear elements ...')
        raw_elements = extract_elements(page, page_h, ratio, verified)
        print(f'[Extract] {len(raw_elements)} segments (before dedup)')

        # ── Dedup ──────────────────────────────────────────────────────────
        elements, removed, dedup_audit = deduplicate_elements(raw_elements)
        print(f'[Dedup]  Removed {dedup_audit["duplicates_removed"]} near-duplicate paths')
        print(f'[Dedup]  {len(elements)} unique segments remain')

        type_totals: Dict[str, float] = defaultdict(float)
        type_counts: Dict[str, int]   = defaultdict(int)
        for e in elements:
            type_totals[e['type']] += e['arc_length_m']
            type_counts[e['type']] += 1
        for etype in sorted(type_totals, key=lambda t: -type_totals[t]):
            print(f'  {etype:<22} : {type_counts[etype]:5d} segs  '
                  f'{type_totals[etype]:8.1f} m')

    # ── Group runs ─────────────────────────────────────────────────────────
    print('\n[Group] Building runs ...')
    runs = group_into_runs(elements)
    print(f'[Group] {len(runs)} runs')

    # ── BOQ draft ──────────────────────────────────────────────────────────
    boq = build_boq_draft(elements, runs, scale_info, color_taxonomy)
    print(f'\n[BOQ] {len(boq["items"])} draft items  status={boq["status"]}')

    # ── Render images ──────────────────────────────────────────────────────
    print('\n[Images] Rendering overlays ...')
    overview = build_overview(elements, page_w, page_h)
    cv2.imwrite(str(OUT_OVERVIEW), overview)
    print(f'  overview:    {OUT_OVERVIEW}')

    per_type = build_per_type_overlays(elements, page_w, page_h)
    print(f'  per-type:    {len(per_type)} images → {OUT}/by_type/')

    dedup_img = build_dedup_overlay(elements, removed, page_w, page_h)
    cv2.imwrite(str(OUT_DEDUP_DBG), dedup_img)
    print(f'  dedup audit: {OUT_DEDUP_DBG}')

    # ── JSON ───────────────────────────────────────────────────────────────
    elapsed = time.time() - t0
    output = {
        'meta': {
            'pdf':          str(PDF_PATH),
            'draw_x_max':   DRAW_X_MAX,
            'min_arc_pt':   MIN_ARC_PT,
            'n_elements':   len(elements),
            'n_runs':       len(runs),
            'elapsed_s':    round(elapsed, 2),
            'approved_for_boq':  False,
            'requires_review':   True,
        },
        'scale_info':       scale_info,
        'color_taxonomy':   color_taxonomy,
        'dedup_audit':      dedup_audit,
        'type_totals_m':    {k: round(v, 2) for k, v in type_totals.items()},
        'runs':             runs,
        'elements':         elements,
    }
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f'\n[JSON]   → {OUT_JSON}')

    with open(OUT_BOQ, 'w', encoding='utf-8') as f:
        json.dump(boq, f, ensure_ascii=False, indent=2)
    print(f'[BOQ]    → {OUT_BOQ}')

    report = build_report(elements, runs, scale_info, color_taxonomy,
                          dedup_audit, boq, elapsed)
    OUT_REPORT.write_text(report, encoding='utf-8')
    print(f'[Report] → {OUT_REPORT}')

    html = build_html(elements, runs, scale_info, color_taxonomy,
                      dedup_audit, boq, elapsed)
    OUT_HTML.write_text(html, encoding='utf-8')
    print(f'[HTML]   → {OUT_HTML}')

    # ── Summary ────────────────────────────────────────────────────────────
    elapsed = time.time() - t0
    print()
    print('=' * 60)
    print('POC B v2 COMPLETE')
    print('=' * 60)
    print(f'  Scale                : 1:{ratio}  '
          f'({scale_info["status"].upper()}) — source: {source}')
    print(f'  Segments (deduped)   : {len(elements)}'
          f'  (removed {dedup_audit["duplicates_removed"]} duplicates)')
    print(f'  Runs                 : {len(runs)}')
    print(f'  BOQ draft items      : {len(boq["items"])}')
    print()
    print('  Measured quantities:')
    for etype in sorted(type_totals, key=lambda t: -type_totals[t]):
        print(f'    {etype:<22} : {type_totals[etype]:.1f} m')
    print()
    print('  Outputs:')
    print(f'    {OUT_JSON}')
    print(f'    {OUT_BOQ}')
    print(f'    {OUT_OVERVIEW}')
    print(f'    {OUT_DEDUP_DBG}')
    print(f'    {OUT / "by_type"}/ ({len(per_type)} images)')
    print(f'    {OUT_REPORT}')
    print(f'    {OUT_HTML}')
    print(f'  Elapsed              : {elapsed:.1f}s')
    print()
    print('  open ' + str(OUT_HTML))
    print()
    print('  REMINDER: Scale UNVERIFIED. Color taxonomy UNVERIFIED.')
    print('  No output is approved BOQ data.')
    print('=' * 60)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Scale Measurement — POC B v2 (Stage H)')
    parser.add_argument(
        '--plan-run-dir', default=None, metavar='DIR',
        help='Path to an isolated plan run directory (runs/<plan_slug>/). '
             'When supplied, all I/O is scoped to that run. '
             'Omit to use the legacy global outputs/ directory.')
    _args = parser.parse_args()
    _ctx  = PlanRunContext.from_args(_args, script_dir=SCRIPT_DIR)

    if _ctx.is_plan_scoped:
        PDF_PATH      = _ctx.source_pdf_path
        OUT           = _ctx.outputs_dir / 'scale_measurement'
        OUT_JSON      = OUT / 'results.json'
        OUT_BOQ       = OUT / 'boq_draft.json'
        OUT_HTML      = OUT / 'report.html'
        OUT_REPORT    = OUT / 'report.md'
        OUT_OVERVIEW  = OUT / 'overview.png'
        OUT_DEDUP_DBG = OUT / 'dedup_audit.png'

        if not PDF_PATH.exists():
            print(f'[WARN] Plan-scoped mode: source PDF not found: {PDF_PATH}')
            print('  Run 31_upload_intake_wrapper.py first to register the source PDF.')
        _ctx.ensure_dirs()
        print(_ctx.describe())

    main()
