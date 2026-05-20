#!/usr/bin/env python3
"""
POC C (Stage I) — Legend Color Matching + Scale Calibration Readiness
research/cad-pdf-intelligence/16_legend_color_match.py

Two parallel tasks:
  1. COLOR TAXONOMY: match measured path colors to legend icon colors.
     Uses Stage F legend_rows.json bboxes. Extracts dominant vector path color
     from each legend icon area — no paid API needed.
     Also searches for a secondary legend section that may contain guardrail/barrier colors.

  2. SCALE CALIBRATION: attempt graphic scale bar detection, then produce a
     calibration_template.json ready for user-supplied two-point input.
     Recalculates measurements if calibration data is present.

All outputs: requires_review=True, approved_for_boq=False.
"""

from __future__ import annotations
import argparse, json, math, re, time
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import cv2
import pdfplumber
import fitz

from plan_run_context import PlanRunContext

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR   = Path(__file__).parent
PDF_PATH     = Path('/Users/eliozedri/Downloads/50-448-02-400.pdf')
LEGEND_JSON  = SCRIPT_DIR / 'outputs' / 'legend_rows.json'
MEAS_JSON    = SCRIPT_DIR / 'outputs' / 'scale_measurement' / 'results.json'
BOQ_JSON     = SCRIPT_DIR / 'outputs' / 'scale_measurement' / 'boq_draft.json'

OUT          = SCRIPT_DIR / 'outputs' / 'legend_color_match'
# Note: OUT.mkdir() moved into main() so plan-scoped overrides take effect first.

OUT_TAX      = OUT / 'color_taxonomy_candidates.json'
OUT_CAL_TPL  = OUT / 'calibration_template.json'
OUT_CAL_RES  = OUT / 'calibration_result.json'
OUT_REPORT   = OUT / 'report.md'
OUT_HTML     = OUT / 'report.html'
OUT_DBG_LEG  = OUT / 'legend_debug.png'
OUT_DBG_PLAN = OUT / 'scale_bar_debug.png'

# ── Constants ─────────────────────────────────────────────────────────────────
PT_MM   = 25.4 / 72        # mm per PDF point on paper
COLOR_MATCH_TOL = 0.05     # tolerance for RGB channel matching (0-1 range)

RENDER_DPI = 72
RENDER_MAT = fitz.Matrix(RENDER_DPI / 72, RENDER_DPI / 72)

# ── Known element taxonomy (from 15_scale_measurement.py) ────────────────────
KNOWN_TYPES: Dict[Tuple, Dict] = {
    (1.0,    1.0,    0.0   ): {'type': 'guardrail',       'he': 'מעקה',              'boq_category': 'guardrail'},
    (1.0,    0.702,  0.6   ): {'type': 'barrier_pink',    'he': 'גדר/מחסום ורוד',   'boq_category': 'barrier'},
    (0.0,    0.0,    1.0   ): {'type': 'road_marking',    'he': 'סימון כביש כחול',  'boq_category': 'marking'},
    (0.498,  1.0,    0.498 ): {'type': 'fence_green',     'he': 'גדר ירוקה',         'boq_category': 'fence'},
    (1.0,    0.6,    0.2   ): {'type': 'marking_orange',  'he': 'סימון כתום',        'boq_category': 'marking'},
    (0.0,    0.498,  1.0   ): {'type': 'marking_mid_blue','he': 'סימון כחול בינוני', 'boq_category': 'marking'},
    (0.8,    0.6,    1.0   ): {'type': 'marking_purple',  'he': 'סימון סגול',        'boq_category': 'other'},
    (1.0,    0.749,  0.0   ): {'type': 'marking_amber',   'he': 'סימון ענבר',        'boq_category': 'marking'},
    (0.0,    0.216,  0.867 ): {'type': 'marking_royal',   'he': 'סימון כחול כהה',   'boq_category': 'marking'},
}

# ── New color discoveries (not yet in 15_scale_measurement.py) ───────────────
NEW_CANDIDATE_TYPES: Dict[Tuple, Dict] = {
    (1.0,  0.0,   0.0   ): {'type': 'red_element',       'he': 'סימון אדום',         'boq_category': 'marking',   'discovery': 'legend_rows_0_1_2'},
    (1.0,  0.247, 0.0   ): {'type': 'marking_vermilion', 'he': 'סימון ורמיליון',     'boq_category': 'marking',   'discovery': 'legend_rows_7_9'},
    (0.749,0.0,   1.0   ): {'type': 'marking_violet',    'he': 'סימון סגול כהה',    'boq_category': 'other',     'discovery': 'legend_row_8'},
    (0.502,0.502, 0.502 ): {'type': 'infra_gray',         'he': 'תשתית אפורה',        'boq_category': 'structure', 'discovery': 'color_analysis'},
    (0.945,0.945, 0.945 ): {'type': 'surface_light',     'he': 'משטח/מסגרת בהירה',  'boq_category': 'structure', 'discovery': 'color_analysis'},
}

ALL_TYPES = {**KNOWN_TYPES, **NEW_CANDIDATE_TYPES}


def match_color(rgb: Tuple, tol: float = COLOR_MATCH_TOL) -> Optional[Dict]:
    if rgb is None:
        return None
    for ref, meta in ALL_TYPES.items():
        if all(abs(a - b) <= tol for a, b in zip(rgb, ref)):
            return {'ref': list(ref), **meta}
    return None


def rgb_distance(a: Tuple, b: Tuple) -> float:
    return math.sqrt(sum((x - y)**2 for x, y in zip(a, b)))


# ── Legend color extraction ───────────────────────────────────────────────────

def extract_legend_row_colors(page, page_h: float,
                               rows: List[Dict]) -> List[Dict]:
    """
    For each legend row, find dominant vector path color in the icon bbox.
    Returns list of match records.
    """
    curves  = page.curves or []
    results = []

    for row in rows:
        ib = row['icon_bbox']   # [x0, y0_pdf, x1, y1_pdf] — PDF bottom-up
        x0, y0b, x1, y1b = ib
        t0 = page_h - y1b       # top-down top
        t1 = page_h - y0b       # top-down bottom

        color_arc: Dict[Tuple, float] = defaultdict(float)
        for c in curves:
            pts = c.get('pts', [])
            if not pts:
                continue
            cxs   = [p[0] for p in pts]
            ctops = [page_h - p[1] for p in pts]
            cx    = (min(cxs) + max(cxs)) / 2
            cy    = (min(ctops) + max(ctops)) / 2
            if x0 <= cx <= x1 and t0 <= cy <= t1:
                al  = sum(math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1])
                          for i in range(len(pts)-1))
                col = c.get('stroking_color')
                if col:
                    color_arc[col] += al

        if not color_arc:
            results.append({
                'row_index':        row['row_index'],
                'icon_bbox_top_down': [round(x0,1), round(t0,1), round(x1,1), round(t1,1)],
                'dominant_color':   None,
                'color_match':      None,
                'all_colors':       [],
                'confidence':       'no_paths_found',
                'requires_review':  True,
            })
            continue

        top_colors = sorted(color_arc.items(), key=lambda x: -x[1])
        dom_color  = top_colors[0][0]
        dom_arc    = top_colors[0][1]
        total_arc  = sum(v for _, v in top_colors)
        dom_frac   = dom_arc / max(total_arc, 0.001)

        match = match_color(dom_color)
        if match is None:
            # Find nearest known color
            nearest = min(ALL_TYPES.keys(), key=lambda r: rgb_distance(r, dom_color))
            dist    = rgb_distance(nearest, dom_color)
            match   = {'ref': list(nearest), **ALL_TYPES[nearest],
                       'match_method': 'nearest_rgb', 'rgb_distance': round(dist, 4)}
        else:
            match['match_method'] = 'exact_tol'
            match['rgb_distance'] = 0.0

        confidence = ('high'   if dom_frac >= 0.85 and match.get('match_method') == 'exact_tol' else
                      'medium' if dom_frac >= 0.60 else
                      'low')

        results.append({
            'row_index':          row['row_index'],
            'icon_bbox_top_down': [round(x0,1), round(t0,1), round(x1,1), round(t1,1)],
            'dominant_color_rgb': list(dom_color),
            'dominant_arc_frac':  round(dom_frac, 3),
            'color_match':        match,
            'all_colors':         [
                {'rgb': list(c), 'arc_pt': round(a, 1), 'frac': round(a/total_arc, 3)}
                for c, a in top_colors[:4]
            ],
            'confidence':         confidence,
            'requires_review':    confidence != 'high',
        })

    return results


def search_secondary_legend(page, page_h: float) -> List[Dict]:
    """
    Search the drawing area for groups of colored horizontal lines next to
    each other — typical of a linear element legend (guardrail, barrier etc.)
    that may be separate from the sign legend Stage F found.

    Strategy: find x-bands where multiple distinct colors appear as short-medium
    horizontal segments within a compact vertical range.
    """
    curves = page.curves or []
    DRAW_X_MIN, DRAW_X_MAX = 50, 3900

    # Collect horizontal-ish segments grouped by y-band
    y_band_size = 30    # pt
    bands: Dict[int, Dict[Tuple, float]] = defaultdict(lambda: defaultdict(float))

    for c in curves:
        pts = c.get('pts', [])
        if len(pts) < 2:
            continue
        xs   = [p[0] for p in pts]
        tops = [page_h - p[1] for p in pts]
        x0, x1 = min(xs), max(xs)
        t0, t1 = min(tops), max(tops)
        arc    = sum(math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1])
                     for i in range(len(pts)-1))

        # Filter: moderate length, roughly horizontal, inside drawing area
        if not (20 < arc < 300 and (x1-x0) > (t1-t0) * 0.5
                and DRAW_X_MIN < x0 < DRAW_X_MAX):
            continue

        col = c.get('stroking_color')
        if col and col not in ((0,0,0), (1,1,1)):
            band_key = int(t0 / y_band_size)
            bands[band_key][col] += arc

    # Find bands with 2+ distinct colors → candidate legend rows
    legend_cands = []
    for band_key, color_arcs in bands.items():
        if len(color_arcs) >= 2:
            t_center = band_key * y_band_size + y_band_size / 2
            top_cols = sorted(color_arcs.items(), key=lambda x: -x[1])[:3]
            legend_cands.append({
                't_center': round(t_center, 1),
                't_range':  [round(band_key*y_band_size, 1),
                             round((band_key+1)*y_band_size, 1)],
                'n_colors': len(color_arcs),
                'colors':   [{'rgb': list(c), 'arc_pt': round(a, 1)}
                             for c, a in top_cols],
            })

    legend_cands.sort(key=lambda x: -x['n_colors'])
    return legend_cands[:15]


# ── Scale bar detection ───────────────────────────────────────────────────────

def detect_graphic_scale_bar(page, page_h: float) -> Optional[Dict]:
    """
    Look for a graphic scale bar:
    - A cluster of alternating filled black/white rectangles (rects)
    - OR a horizontal line with vertical tick marks at ends
    - Located in the drawing area (x < 3900)
    Returns calibration-ready dict or None.
    """
    rects = page.rects or []
    DRAW_X_MAX = 3900

    # Find small filled rects (scale bar segments)
    small_rects = []
    for r in rects:
        if r.get('x0', 9999) > DRAW_X_MAX:
            continue
        w = r.get('x1', 0) - r.get('x0', 0)
        h = r.get('height', 0)
        if 5 < w < 300 and 3 < h < 40:
            fill = r.get('non_stroking_color')
            small_rects.append({
                'x0': r['x0'], 'x1': r['x1'],
                'top': r['top'], 'bottom': r['bottom'],
                'w': w, 'h': h,
                'fill': fill,
            })

    if not small_rects:
        return None

    # Group by approximate y-position (within 5pt) to find horizontal sequences
    small_rects.sort(key=lambda r: (round(r['top'] / 5) * 5, r['x0']))
    groups: Dict[int, List[Dict]] = defaultdict(list)
    for r in small_rects:
        y_key = round(r['top'] / 5)
        groups[y_key].append(r)

    # A scale bar group has ≥2 adjacent rects of similar height, alternating color
    for y_key, grp in groups.items():
        grp.sort(key=lambda r: r['x0'])
        if len(grp) < 2:
            continue
        heights = [r['h'] for r in grp]
        h_mean  = sum(heights) / len(heights)
        if all(abs(h - h_mean) < 3 for h in heights):
            total_w = grp[-1]['x1'] - grp[0]['x0']
            return {
                'found':          True,
                'method':         'alternating_filled_rects',
                'x0':             round(grp[0]['x0'], 1),
                'x1':             round(grp[-1]['x1'], 1),
                'top':            round(grp[0]['top'], 1),
                'total_width_pt': round(total_w, 2),
                'n_segments':     len(grp),
                'note':           ('Graphic scale bar candidate found. '
                                   'Measure the labeled real-world distance and '
                                   'set known_distance_m in calibration_template.json.'),
                'calibration_ready': {
                    'point_a_pdf': [round(grp[0]['x0'], 1), round(grp[0]['top'], 1)],
                    'point_b_pdf': [round(grp[-1]['x1'], 1), round(grp[0]['top'], 1)],
                    'known_distance_m': None,
                    'status': 'pending_user_input',
                },
            }

    return None


# ── Calibration template ───────────────────────────────────────────────────────

def build_calibration_template(scale_bar: Optional[Dict],
                                page_w: float, page_h: float) -> Dict:
    """
    Build a calibration_template.json the user fills in with known points.
    If a scale bar was auto-detected, pre-fill its endpoints.
    """
    if scale_bar and scale_bar.get('found'):
        cr = scale_bar['calibration_ready']
        point_a = cr['point_a_pdf']
        point_b = cr['point_b_pdf']
        method  = 'graphic_scale_bar_auto_detected'
        status  = 'pending_user_input'
        note    = ('Graphic scale bar detected. Read its real-world label '
                   '(e.g. "0    20m") and enter known_distance_m.')
    else:
        point_a = None
        point_b = None
        method  = 'two_point_manual'
        status  = 'pending_user_input'
        note    = (
            'No scale bar auto-detected. To calibrate:\n'
            '1. Open the PDF in a viewer that shows coordinates.\n'
            '2. Find two points with a known real-world distance '
            '   (e.g., a dimension line, a lane width=3.75m, '
            '   a chainage station separation).\n'
            '3. Fill in point_a_pdf, point_b_pdf, known_distance_m.\n'
            '4. Set status to "ready" and re-run this script.\n'
            '   The script will compute derived_m_per_pt and recalculate all measurements.'
        )

    return {
        'status':             status,
        'method':             method,
        'point_a_pdf':        point_a,        # [x, y_top_down] in pdfplumber coords
        'point_b_pdf':        point_b,
        'known_distance_m':   None,
        'derived_m_per_pt':   None,
        'derived_scale_ratio':None,
        'calibrated_by':      None,
        'calibrated_at':      None,
        'page_size_pt':       [page_w, page_h],
        'note':               note,
        'examples': {
            'lane_width':     '3.75m (standard Israeli road lane)',
            'guardrail_post_spacing': '2.0m or 4.0m',
            'chainage_interval':      'typically 20m or 50m apart on plan',
        },
    }


def apply_calibration(template: Dict) -> Optional[Dict]:
    """
    If template has valid points + known_distance_m, compute derived values.
    Returns calibration result dict or None if pending.
    """
    if template['status'] != 'ready':
        return None
    pa = template.get('point_a_pdf')
    pb = template.get('point_b_pdf')
    d  = template.get('known_distance_m')
    if not (pa and pb and d and d > 0):
        return None

    dist_pt = math.hypot(pb[0]-pa[0], pb[1]-pa[1])
    if dist_pt < 1:
        return None

    m_per_pt      = d / dist_pt
    scale_ratio   = round(m_per_pt / (PT_MM / 1000))

    return {
        'status':           'calibrated',
        'point_a_pdf':      pa,
        'point_b_pdf':      pb,
        'known_distance_m': d,
        'pdf_distance_pt':  round(dist_pt, 3),
        'derived_m_per_pt': round(m_per_pt, 8),
        'derived_scale_ratio': scale_ratio,
        'method':           template['method'],
        'note':             f'Scale 1:{scale_ratio} derived from user-supplied calibration.',
    }


def recalculate_with_calibration(meas_data: Dict, cal_result: Dict) -> Dict:
    """Recalculate all arc_length_m values using derived_m_per_pt."""
    m_per_pt = cal_result['derived_m_per_pt']
    scale    = cal_result['derived_scale_ratio']

    updated = json.loads(json.dumps(meas_data))
    updated['scale_info']['ratio']             = scale
    updated['scale_info']['status']            = 'calibrated'
    updated['scale_info']['source']            = 'user_manual_calibration'
    updated['scale_info']['requires_human_scale_confirmation'] = False
    updated['scale_info']['m_per_pt']          = m_per_pt
    updated['scale_info']['calibration']       = cal_result

    type_totals: Dict[str, float] = defaultdict(float)
    for e in updated['elements']:
        new_m = round(e['arc_length_pt'] * m_per_pt, 3)
        e['arc_length_m']   = new_m
        e['scale_ratio']    = scale
        e['scale_verified'] = True
        type_totals[e['type']] += new_m

    for r in updated['runs']:
        new_m = round(r['total_length_pt'] * m_per_pt, 3)
        r['total_length_m'] = new_m
        r['scale_ratio']    = scale
        r['scale_verified'] = True

    updated['type_totals_m'] = {k: round(v, 2) for k, v in type_totals.items()}
    updated['meta']['calibration_applied'] = True
    return updated


# ── Unknown color discovery ───────────────────────────────────────────────────

def find_high_volume_unclassified(page, page_h: float,
                                   known: Dict, min_total_pt: float = 5000
                                   ) -> List[Dict]:
    """
    Find colors with high total arc length in the drawing area that are not
    in the known taxonomy. These are likely missing element types.
    """
    DRAW_X_MAX = 3900
    color_arc: Dict[Tuple, float] = defaultdict(float)

    for c in (page.curves or []):
        pts = c.get('pts', [])
        if len(pts) < 2:
            continue
        xs  = [p[0] for p in pts]
        x0  = min(xs)
        if x0 > DRAW_X_MAX:
            continue
        al  = sum(math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1])
                  for i in range(len(pts)-1))
        col = c.get('stroking_color')
        if col:
            color_arc[col] += al

    unclassified = []
    for col, total in sorted(color_arc.items(), key=lambda x: -x[1]):
        if total < min_total_pt:
            continue
        if not any(all(abs(a-b) <= COLOR_MATCH_TOL for a,b in zip(col, ref))
                   for ref in known):
            nearest_ref  = min(known, key=lambda r: rgb_distance(r, col))
            nearest_meta = known[nearest_ref]
            unclassified.append({
                'color_rgb':      list(col),
                'total_arc_pt':   round(total, 1),
                'nearest_known':  {'rgb': list(nearest_ref), **nearest_meta},
                'rgb_distance':   round(rgb_distance(nearest_ref, col), 4),
                'status':         'unclassified_high_volume',
                'requires_review': True,
                'note':           'High-volume color not in taxonomy — needs human classification.',
            })

    return unclassified


# ── Debug images ──────────────────────────────────────────────────────────────

def build_legend_debug(page, page_h: float,
                        rows: List[Dict],
                        matches: List[Dict],
                        page_w: float) -> np.ndarray:
    """Render the legend region with color match annotations."""
    if not rows:
        return np.zeros((100, 400, 3), dtype=np.uint8)

    # Find legend region bounds
    all_x0 = min(r['row_bbox'][0] for r in rows)
    all_x1 = max(r['row_bbox'][2] for r in rows)
    all_y0 = min(page_h - r['row_bbox'][3] for r in rows)
    all_y1 = max(page_h - r['row_bbox'][1] for r in rows)

    doc   = fitz.open(PDF_PATH)
    clip  = fitz.Rect(all_x0, all_y0, all_x1, all_y1)
    # Scale for readability
    scale = min(3.0, 800 / max(all_x1 - all_x0, 1))
    mat   = fitz.Matrix(scale, scale)
    pix   = doc[0].get_pixmap(matrix=mat, clip=clip, colorspace=fitz.csRGB)
    img   = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, 3).copy()
    doc.close()

    ih, iw = img.shape[:2]
    region_w = all_x1 - all_x0
    region_h = all_y1 - all_y0

    for i, (row, match_rec) in enumerate(zip(rows, matches)):
        row_t0 = page_h - row['row_bbox'][3]
        row_t1 = page_h - row['row_bbox'][1]
        iy0 = int((row_t0 - all_y0) / region_h * ih)
        iy1 = int((row_t1 - all_y0) / region_h * ih)
        iy0, iy1 = max(0, iy0), min(ih, iy1)

        # Draw row border
        cv2.rectangle(img, (0, iy0), (iw-1, iy1), (100, 100, 100), 1)

        # Color swatch from match
        cm = match_rec.get('color_match')
        if cm and 'ref' in cm:
            ref = cm['ref']
            b, g, r = int(ref[2]*255), int(ref[1]*255), int(ref[0]*255)
            cv2.rectangle(img, (2, iy0+2), (20, min(iy1-2, iy0+20)), (b,g,r), -1)

        # Label
        label = (cm.get('type','?')[:18] if cm else 'no match')
        conf  = match_rec.get('confidence','?')
        cv2.putText(img, f'{i}: {label} ({conf})', (24, iy0+14),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.38, (20,20,20), 1)

    return img


def build_scale_bar_debug(page, page_h: float, page_w: float,
                           scale_bar: Optional[Dict]) -> np.ndarray:
    """Render the bottom portion of the plan showing scale bar search area."""
    doc   = fitz.open(PDF_PATH)
    # Bottom quarter of plan
    y_from = page_h * 0.6
    clip  = fitz.Rect(0, y_from, min(page_w, 3900), page_h)
    mat   = fitz.Matrix(0.5, 0.5)
    pix   = doc[0].get_pixmap(matrix=mat, clip=clip, colorspace=fitz.csRGB)
    img   = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, 3).copy()
    doc.close()

    if scale_bar and scale_bar.get('found'):
        ih, iw = img.shape[:2]
        clip_h = page_h - y_from
        sx = scale_bar['x0'] / page_w * iw
        ex = scale_bar['x1'] / page_w * iw
        sy = (scale_bar['top'] - y_from) / clip_h * ih
        cv2.rectangle(img, (int(sx), int(sy)-5), (int(ex), int(sy)+10), (0,0,255), 2)
        cv2.putText(img, f'Scale bar candidate ({scale_bar["total_width_pt"]:.0f}pt)',
                    (int(sx), int(sy)-10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0,0,200), 1)
    else:
        cv2.putText(img, 'No graphic scale bar found', (20, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0,0,180), 2)

    return img


# ── Report ─────────────────────────────────────────────────────────────────────

def build_report(matches: List[Dict], unclassified: List[Dict],
                  scale_bar: Optional[Dict], cal_template: Dict,
                  cal_result: Optional[Dict], secondary: List[Dict],
                  elapsed: float) -> str:

    lines = [
        '# Legend Color Match + Scale Calibration Readiness — POC C (Stage I)',
        '',
        f'**PDF**: `{PDF_PATH.name}`',
        '',
        '> **Research only. All results require human validation.**',
        '> Color taxonomy: unverified until legend labels are confirmed.',
        '> Scale: unverified until calibration is completed.',
        '',
        '---',
        '',
        '## 1 · Legend Icon Color Matches',
        '',
        '| Row | Dominant Color | Matched Type | HE | BOQ Cat | Confidence | Needs Review |',
        '|-----|---------------|-------------|-----|---------|------------|--------------|',
    ]
    for m in matches:
        cm   = m.get('color_match') or {}
        rgb  = str([round(x,2) for x in m['dominant_color_rgb']]) if m.get('dominant_color_rgb') else 'none'
        lines.append(
            f'| {m["row_index"]} | `{rgb}` | {cm.get("type","?")} '
            f'| {cm.get("he","?")} | {cm.get("boq_category","?")} '
            f'| {m["confidence"]} | {m["requires_review"]} |'
        )

    lines += [
        '',
        '---',
        '',
        '## 2 · High-Volume Unclassified Colors',
        '',
        '*(Colors with significant total arc length in the plan but not in current taxonomy)*',
        '',
        '| Color RGB | Total arc (pt) | Nearest known type | RGB dist | Needs Review |',
        '|-----------|---------------|-------------------|---------|--------------|',
    ]
    for u in unclassified:
        lines.append(
            f'| `{u["color_rgb"]}` | {u["total_arc_pt"]:.0f} '
            f'| {u["nearest_known"]["type"]} | {u["rgb_distance"]:.4f} | ✓ |'
        )

    lines += [
        '',
        '---',
        '',
        '## 3 · Secondary Legend Search',
        '',
        '*(Drawing-area bands with ≥2 distinct colors — may indicate informal legend sections)*',
        '',
    ]
    if secondary:
        lines += [
            '| y-center (pt) | n_colors | Colors |',
            '|--------------|----------|--------|',
        ]
        for s in secondary[:8]:
            col_str = ', '.join(str(c['rgb']) for c in s['colors'][:3])
            lines.append(f'| {s["t_center"]} | {s["n_colors"]} | {col_str} |')
    else:
        lines.append('*No secondary legend bands detected.*')

    lines += [
        '',
        '---',
        '',
        '## 4 · Graphic Scale Bar Detection',
        '',
    ]
    if scale_bar and scale_bar.get('found'):
        lines += [
            f'**Found:** {scale_bar["method"]}',
            f'- x: {scale_bar["x0"]:.1f} → {scale_bar["x1"]:.1f} pt',
            f'- Total width: {scale_bar["total_width_pt"]:.1f} pt',
            f'- Segments: {scale_bar["n_segments"]}',
            f'- Note: {scale_bar["note"]}',
        ]
    else:
        lines.append('**Not found.** No graphic scale bar detected in drawing area.')
    lines.append('')

    lines += [
        '---',
        '',
        '## 5 · Calibration Template',
        '',
        f'Status: `{cal_template["status"]}`  |  Method: `{cal_template["method"]}`',
        '',
        '```json',
        json.dumps(cal_template, indent=2, ensure_ascii=False),
        '```',
        '',
    ]

    if cal_result:
        lines += [
            '---',
            '',
            '## 6 · Applied Calibration',
            '',
            f'Status: `{cal_result["status"]}`',
            f'- derived_m_per_pt: `{cal_result["derived_m_per_pt"]}`',
            f'- derived_scale_ratio: `1:{cal_result["derived_scale_ratio"]}`',
            '',
        ]

    lines += [
        '---',
        '',
        '## 7 · What Still Requires Human Confirmation',
        '',
        '| Item | Status | Action needed |',
        '|------|--------|---------------|',
        '| Scale ratio | UNVERIFIED | Fill in calibration_template.json with two known points |',
        '| Color taxonomy | UNVERIFIED | Confirm each legend row type against plan legend (מקרא) |',
        '| Red element type | UNCLASSIFIED | Identify what red (1,0,0) represents in this plan |',
        '| Legend row labels | MISSING | Stage F labels pending (requires paid vision or manual entry) |',
        '| Secondary legend | REQUIRES REVIEW | Check if secondary color bands are real legend sections |',
        '',
        '---',
        '',
        '## 8 · How This Advances the Plan Scanner',
        '',
        '- **Color taxonomy** is now grounded in legend geometry, not just frequency heuristics.',
        '- **Red element** discovered as high-volume unclassified type — needs BOQ entry.',
        '- **Calibration infrastructure** is in place — one fill-in to unlock accurate measurements.',
        '- **Next step**: update 15_scale_measurement.py to include red + discovered colors.',
        '',
        f'*Elapsed: {elapsed:.1f}s*',
    ]

    return '\n'.join(lines)


def build_html(matches: List[Dict], unclassified: List[Dict],
               scale_bar: Optional[Dict], cal_template: Dict,
               cal_result: Optional[Dict], elapsed: float) -> str:

    rows_match = ''
    for m in matches:
        cm  = m.get('color_match') or {}
        rgb = m.get('dominant_color_rgb')
        sw  = (f'background:rgb({int(rgb[0]*255)},{int(rgb[1]*255)},{int(rgb[2]*255)})'
               if rgb else 'background:#ccc')
        conf_col = {'high':'green','medium':'orange','low':'red','no_paths_found':'gray'}.get(
            m['confidence'], 'gray')
        rows_match += (
            f'<tr>'
            f'<td>{m["row_index"]}</td>'
            f'<td><span style="display:inline-block;width:14px;height:14px;{sw};border:1px solid #888"></span>'
            f' {str([round(x,2) for x in rgb] if rgb else [])}</td>'
            f'<td>{cm.get("type","?")}</td>'
            f'<td>{cm.get("he","?")}</td>'
            f'<td>{cm.get("boq_category","?")}</td>'
            f'<td style="color:{conf_col}">{m["confidence"]}</td>'
            f'<td>{"✓" if m["requires_review"] else ""}</td>'
            f'</tr>\n'
        )

    rows_unclass = ''
    for u in unclassified:
        r,g,b = [int(x*255) for x in u['color_rgb']]
        rows_unclass += (
            f'<tr>'
            f'<td><span style="display:inline-block;width:14px;height:14px;'
            f'background:rgb({r},{g},{b});border:1px solid #888"></span>'
            f' {u["color_rgb"]}</td>'
            f'<td>{u["total_arc_pt"]:.0f}</td>'
            f'<td>{u["nearest_known"]["type"]}</td>'
            f'<td>{u["rgb_distance"]:.4f}</td>'
            f'<td><span style="color:red">⚠ needs classification</span></td>'
            f'</tr>\n'
        )

    sb_html = (
        f'<p style="color:green">✓ Found: {scale_bar["method"]} — '
        f'width={scale_bar["total_width_pt"]:.1f}pt</p>'
        if scale_bar and scale_bar.get('found') else
        '<p style="color:orange">⚠ No graphic scale bar auto-detected.</p>'
    )

    return f'''<!DOCTYPE html>
<html lang="he">
<head>
<meta charset="utf-8">
<title>Legend Color Match — POC C</title>
<style>
body{{font-family:system-ui,sans-serif;margin:24px;background:#f9f9f9;color:#111}}
h1{{font-size:1.4rem}}h2{{font-size:1.1rem;margin-top:2em;border-bottom:1px solid #ddd;padding-bottom:4px}}
table{{border-collapse:collapse;width:100%;max-width:960px;background:#fff;font-size:.85rem;margin-bottom:1em}}
th,td{{border:1px solid #ccc;padding:5px 9px;text-align:left}}th{{background:#eee}}
.warn{{background:#fffbe6;border:2px solid #f0c040;padding:12px 16px;border-radius:6px;max-width:900px;margin:1em 0}}
img{{max-width:100%;border:1px solid #ccc;margin:6px 0}}
pre{{background:#f3f3f3;padding:12px;border-radius:4px;font-size:.82rem;overflow-x:auto}}
details{{margin:6px 0}}summary{{cursor:pointer;font-weight:600}}
</style>
</head>
<body>
<h1>Legend Color Match + Scale Calibration Readiness — POC C (Stage I)</h1>
<div class="warn">
  ⚠ <strong>Research only.</strong> All results require human validation.<br>
  Color taxonomy: unverified until legend labels are confirmed against the plan (מקרא).<br>
  Scale: unverified until calibration is completed.
</div>

<h2>1 · Legend Icon Color Matches</h2>
<p><em>Dominant vector path color extracted from each legend row's icon bounding box.</em></p>
<table>
<tr><th>Row</th><th>Dominant Color</th><th>Matched Type</th><th>HE</th><th>BOQ Cat</th><th>Confidence</th><th>Needs Review</th></tr>
{rows_match}
</table>
<img src="legend_debug.png" alt="legend debug overlay">

<h2>2 · High-Volume Unclassified Colors</h2>
<p><em>Colors with large total arc length in the plan that are not in the current taxonomy.</em></p>
<table>
<tr><th>Color</th><th>Total arc (pt)</th><th>Nearest known</th><th>RGB dist</th><th>Status</th></tr>
{rows_unclass}
</table>

<h2>3 · Graphic Scale Bar Detection</h2>
{sb_html}
<img src="scale_bar_debug.png" alt="scale bar search area">

<h2>4 · Calibration Template</h2>
<p>Status: <strong>{cal_template["status"]}</strong> | Method: <code>{cal_template["method"]}</code></p>
<details><summary>calibration_template.json (click to expand)</summary>
<pre>{json.dumps(cal_template, indent=2, ensure_ascii=False)}</pre>
</details>
<p>Edit <code>outputs/legend_color_match/calibration_template.json</code>,
set <code>status: "ready"</code> and fill in the two points, then re-run to get
calibrated measurements.</p>

<p style="color:#888;font-size:.8rem">Generated in {elapsed:.1f}s — research/cad-pdf-intelligence/16_legend_color_match.py</p>
</body>
</html>'''


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    t0 = time.time()

    OUT.mkdir(parents=True, exist_ok=True)

    print('=' * 60)
    print('POC C (Stage I) — Legend Color Match + Scale Calibration')
    print('16_legend_color_match.py')
    print('=' * 60)

    # Load legend rows
    print(f'\n[Load] {LEGEND_JSON}')
    with open(LEGEND_JSON) as f:
        legend_data = json.load(f)
    rows = legend_data.get('rows', [])
    print(f'[Load] {len(rows)} legend rows')

    # Load existing measurements
    meas_data = None
    if MEAS_JSON.exists():
        with open(MEAS_JSON) as f:
            meas_data = json.load(f)
        print(f'[Load] Measurement data: {MEAS_JSON.name} '
              f'({len(meas_data.get("elements",[]))} elements)')

    print(f'\n[PDF] Opening {PDF_PATH.name} ...')
    with pdfplumber.open(PDF_PATH) as pdf:
        page   = pdf.pages[0]
        page_w, page_h = page.width, page.height

        # ── Legend color extraction ────────────────────────────────────────
        print('\n[Legend] Extracting dominant colors from legend icon bboxes ...')
        matches = extract_legend_row_colors(page, page_h, rows)
        for m in matches:
            cm = m.get('color_match') or {}
            print(f'  Row {m["row_index"]:2d}: {str(m.get("dominant_color_rgb","none"))[:25]} → '
                  f'{cm.get("type","?")}  ({m["confidence"]})')

        # ── Secondary legend search ────────────────────────────────────────
        print('\n[Legend2] Searching for secondary legend bands ...')
        secondary = search_secondary_legend(page, page_h)
        print(f'[Legend2] {len(secondary)} candidate bands found')

        # ── Unclassified high-volume colors ────────────────────────────────
        print('\n[Colors] Finding high-volume unclassified colors ...')
        unclassified = find_high_volume_unclassified(page, page_h, ALL_TYPES, min_total_pt=5000)
        print(f'[Colors] {len(unclassified)} unclassified high-volume colors:')
        for u in unclassified:
            print(f'  {u["color_rgb"]}  total={u["total_arc_pt"]:.0f}pt  '
                  f'nearest={u["nearest_known"]["type"]}  dist={u["rgb_distance"]:.4f}')

        # ── Scale bar detection ────────────────────────────────────────────
        print('\n[Scale] Detecting graphic scale bar ...')
        scale_bar = detect_graphic_scale_bar(page, page_h)
        if scale_bar and scale_bar.get('found'):
            print(f'[Scale] Found: {scale_bar["method"]} '
                  f'width={scale_bar["total_width_pt"]:.1f}pt')
        else:
            print('[Scale] No graphic scale bar detected')

    # ── Calibration template ───────────────────────────────────────────────
    print('\n[Cal] Building calibration template ...')
    cal_template = build_calibration_template(scale_bar, page_w, page_h)
    cal_result   = apply_calibration(cal_template)
    if cal_result:
        print(f'[Cal] Calibration applied: 1:{cal_result["derived_scale_ratio"]}')
    else:
        print(f'[Cal] Status: {cal_template["status"]} — no calibration applied')

    # ── Recalculate if calibrated ──────────────────────────────────────────
    recalc_data = None
    if cal_result and meas_data:
        print('\n[Recalc] Recalculating measurements with calibration ...')
        recalc_data = recalculate_with_calibration(meas_data, cal_result)
        print(f'[Recalc] Done. Scale 1:{cal_result["derived_scale_ratio"]}')

    # ── Debug images ───────────────────────────────────────────────────────
    print('\n[Images] Rendering debug images ...')
    with pdfplumber.open(PDF_PATH) as pdf:
        page = pdf.pages[0]
        ph   = page.height

    legend_img = build_legend_debug(page, ph, rows, matches, page_w)
    cv2.imwrite(str(OUT_DBG_LEG), legend_img)
    print(f'  legend_debug.png  ({legend_img.shape[1]}×{legend_img.shape[0]}px)')

    scale_img = build_scale_bar_debug(page, ph, page_w, scale_bar)
    cv2.imwrite(str(OUT_DBG_PLAN), scale_img)
    print(f'  scale_bar_debug.png  ({scale_img.shape[1]}×{scale_img.shape[0]}px)')

    # ── JSON outputs ───────────────────────────────────────────────────────
    elapsed = time.time() - t0

    taxonomy_output = {
        'meta': {
            'pdf': str(PDF_PATH),
            'n_legend_rows': len(rows),
            'n_matches': len(matches),
            'n_unclassified_high_volume': len(unclassified),
            'approved_for_boq': False,
            'requires_review': True,
        },
        'legend_matches':    matches,
        'unclassified_colors': unclassified,
        'secondary_legend_bands': secondary,
        'new_candidate_types': [
            {'color_rgb': list(k), **v}
            for k, v in NEW_CANDIDATE_TYPES.items()
        ],
    }
    with open(OUT_TAX, 'w', encoding='utf-8') as f:
        json.dump(taxonomy_output, f, ensure_ascii=False, indent=2)
    print(f'\n[JSON] → {OUT_TAX}')

    with open(OUT_CAL_TPL, 'w', encoding='utf-8') as f:
        json.dump(cal_template, f, ensure_ascii=False, indent=2)
    print(f'[JSON] → {OUT_CAL_TPL}')

    if cal_result:
        with open(OUT_CAL_RES, 'w', encoding='utf-8') as f:
            json.dump(cal_result, f, ensure_ascii=False, indent=2)
        print(f'[JSON] → {OUT_CAL_RES}')

    if recalc_data:
        out_recalc = Path('outputs/scale_measurement/results_calibrated.json')
        with open(out_recalc, 'w', encoding='utf-8') as f:
            json.dump(recalc_data, f, ensure_ascii=False, indent=2)
        print(f'[JSON] → {out_recalc}')

    # ── Reports ────────────────────────────────────────────────────────────
    elapsed = time.time() - t0
    report = build_report(matches, unclassified, scale_bar, cal_template,
                          cal_result, secondary, elapsed)
    OUT_REPORT.write_text(report, encoding='utf-8')
    print(f'[Report] → {OUT_REPORT}')

    html = build_html(matches, unclassified, scale_bar, cal_template,
                      cal_result, elapsed)
    OUT_HTML.write_text(html, encoding='utf-8')
    print(f'[HTML]   → {OUT_HTML}')

    # ── Summary ────────────────────────────────────────────────────────────
    print()
    print('=' * 60)
    print('POC C COMPLETE')
    print('=' * 60)
    print(f'  Legend rows analysed   : {len(rows)}')
    print(f'  Color matches          : {len(matches)}')
    print(f'  Unclassified (high vol): {len(unclassified)}')
    print(f'  Secondary legend bands : {len(secondary)}')
    sb_status = ('FOUND' if scale_bar and scale_bar.get('found') else 'NOT FOUND')
    print(f'  Graphic scale bar      : {sb_status}')
    print(f'  Calibration status     : {cal_template["status"]}')
    print()
    print('  Outputs:')
    for p in [OUT_TAX, OUT_CAL_TPL, OUT_DBG_LEG, OUT_DBG_PLAN, OUT_REPORT, OUT_HTML]:
        print(f'    {p}')
    print(f'  Elapsed                : {elapsed:.1f}s')
    print()
    print('  open ' + str(OUT_HTML))
    print()
    print('  REMINDER: Color taxonomy UNVERIFIED. Scale UNVERIFIED.')
    print('  All outputs require human validation before BOQ use.')
    print('=' * 60)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Legend Color Match + Scale Calibration — POC C (Stage I)')
    parser.add_argument(
        '--plan-run-dir', default=None, metavar='DIR',
        help='Path to an isolated plan run directory (runs/<plan_slug>/). '
             'When supplied, all I/O is scoped to that run. '
             'Omit to use the legacy global outputs/ directory.')
    _args = parser.parse_args()
    _ctx  = PlanRunContext.from_args(_args, script_dir=SCRIPT_DIR)

    if _ctx.is_plan_scoped:
        PDF_PATH     = _ctx.source_pdf_path
        LEGEND_JSON  = _ctx.outputs_dir / 'legend_rows.json'
        MEAS_JSON    = _ctx.outputs_dir / 'scale_measurement' / 'results.json'
        BOQ_JSON     = _ctx.outputs_dir / 'scale_measurement' / 'boq_draft.json'
        OUT          = _ctx.outputs_dir / 'legend_color_match'
        OUT_TAX      = OUT / 'color_taxonomy_candidates.json'
        OUT_CAL_TPL  = OUT / 'calibration_template.json'
        OUT_CAL_RES  = OUT / 'calibration_result.json'
        OUT_REPORT   = OUT / 'report.md'
        OUT_HTML     = OUT / 'report.html'
        OUT_DBG_LEG  = OUT / 'legend_debug.png'
        OUT_DBG_PLAN = OUT / 'scale_bar_debug.png'

        if not PDF_PATH.exists():
            print(f'[WARN] Plan-scoped mode: source PDF not found: {PDF_PATH}')
            print('  Run 31_upload_intake_wrapper.py first to register the source PDF.')
        if not LEGEND_JSON.exists():
            print(f'[WARN] Plan-scoped mode: missing required input in run outputs dir:')
            print(f'  MISSING (required): {LEGEND_JSON}')
            print('  Run 07_extract_legend.py --plan-run-dir first.')
        _ctx.ensure_dirs()
        print(_ctx.describe())

    main()
