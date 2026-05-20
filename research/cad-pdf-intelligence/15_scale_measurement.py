#!/usr/bin/env python3
"""
POC B (Stage H) — Scale Measurement
research/cad-pdf-intelligence/15_scale_measurement.py

Measures linear infrastructure elements (guardrails, barriers, road markings)
from AutoCAD PDF engineering plans.

Scale detection strategy (in priority order):
  1. Text-based: search for "1:N" ratio in PDF text
  2. R-annotation: find "R=N.N" annotation → fit circle to nearby arc → infer scale
  3. Config fallback: SCALE_RATIO_FALLBACK (default 500, clearly marked UNVERIFIED)

Output:
  outputs/scale_measurement/results.json       — per-element measurements + audit trail
  outputs/scale_measurement/overview.png       — annotated plan image
  outputs/scale_measurement/report.md          — Markdown summary

All measurements are research-only. requires_review=True until scale is human-verified.
No output is approved BOQ data.
"""

from __future__ import annotations
import json, math, re, time
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import cv2
import pdfplumber
import fitz  # pymupdf

# ── Paths ─────────────────────────────────────────────────────────────────────
PDF_PATH = Path('/Users/eliozedri/Downloads/50-448-02-400.pdf')
OUT      = Path('outputs/scale_measurement')
OUT.mkdir(parents=True, exist_ok=True)

OUT_JSON    = OUT / 'results.json'
OUT_HTML    = OUT / 'report.html'
OUT_REPORT  = OUT / 'report.md'
OUT_OVERVIEW = OUT / 'overview.png'
OUT_SEGMENTS = OUT / 'segments'
OUT_SEGMENTS.mkdir(exist_ok=True)

# ── Scale config ──────────────────────────────────────────────────────────────
# 1 PDF point = 25.4/72 mm on paper.
# At plan scale 1:N, 1 pt on paper = N × 25.4/72 mm = N × 0.353 mm in reality.
SCALE_RATIO_FALLBACK = 500   # used only if auto-detection fails
PT_MM = 25.4 / 72            # mm per PDF point (on paper)

# ── Drawing area boundary ─────────────────────────────────────────────────────
# Title block is on the right. Content ends before x ≈ 3900 (pdfplumber coords).
DRAW_X_MAX = 3900   # pt — exclude title block / stamp area

# ── Minimum path arc to be considered a measurable element ───────────────────
MIN_ARC_PT = 30     # pt — shorter segments are noise / decorative

# ── Element type taxonomy by stroke color (RGB 0-1 range) ────────────────────
# Derived from color-frequency analysis of 50-448-02-400.pdf
ELEMENT_TYPES: Dict[Tuple, Dict] = {
    (1.0,    1.0,    0.0   ): {'type': 'guardrail',       'he': 'מעקה',              'boq_category': 'guardrail', 'rgb8': (255, 255,   0)},
    (1.0,    0.702,  0.6   ): {'type': 'barrier_pink',    'he': 'גדר/מחסום ורוד',   'boq_category': 'barrier',   'rgb8': (255, 179, 153)},
    (0.0,    0.0,    1.0   ): {'type': 'road_marking',    'he': 'סימון כביש כחול',  'boq_category': 'marking',   'rgb8': (  0,   0, 255)},
    (0.498,  1.0,    0.498 ): {'type': 'fence_green',     'he': 'גדר ירוקה',         'boq_category': 'fence',     'rgb8': (127, 255, 127)},
    (1.0,    0.6,    0.2   ): {'type': 'marking_orange',  'he': 'סימון כתום',        'boq_category': 'marking',   'rgb8': (255, 153,  51)},
    (0.0,    0.498,  1.0   ): {'type': 'marking_mid_blue','he': 'סימון כחול בינוני', 'boq_category': 'marking',   'rgb8': (  0, 127, 255)},
    (0.8,    0.6,    1.0   ): {'type': 'marking_purple',  'he': 'סימון סגול',        'boq_category': 'other',     'rgb8': (204, 153, 255)},
    (1.0,    0.749,  0.0   ): {'type': 'marking_amber',   'he': 'סימון ענבר',        'boq_category': 'marking',   'rgb8': (255, 191,   0)},
    (0.0,    0.216,  0.867 ): {'type': 'marking_royal',   'he': 'סימון כחול כהה',   'boq_category': 'marking',   'rgb8': (  0,  55, 221)},
}

COLOR_TOL = 0.012  # tolerance for color matching (float 0-1 per channel)

# ── Raster render settings ────────────────────────────────────────────────────
RENDER_DPI  = 36    # low DPI for fast overview render (plan is huge)
RENDER_MAT  = fitz.Matrix(RENDER_DPI / 72, RENDER_DPI / 72)

OVERLAY_ALPHA = 0.65  # opacity of colored overlay on overview image

# ─────────────────────────────────────────────────────────────────────────────


def color_key(rgb: Tuple) -> Optional[Dict]:
    """Return element type dict for a color, or None if not in taxonomy."""
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
    """Search page text for a '1:N' ratio pattern."""
    text = page.extract_text() or ''
    text += ' '.join(w['text'] for w in (page.extract_words() or []))
    matches = re.findall(r'1\s*:\s*(\d+)', text)
    if matches:
        ratios = [int(m) for m in matches]
        # Prefer ratios in the plausible engineering-plan range 100-2000
        plausible = [r for r in ratios if 100 <= r <= 2000]
        if plausible:
            return plausible[0]
    return None


def fit_circle(pts: List[Tuple[float, float]]) -> Optional[float]:
    """
    Fit a circle to 2D points via algebraic least-squares (Kåsa method).
    Returns the radius in the same units as pts, or None if degenerate.
    """
    pts_arr = np.array(pts, dtype=float)
    n = len(pts_arr)
    if n < 3:
        return None
    x, y = pts_arr[:, 0], pts_arr[:, 1]
    A = np.column_stack([2*x, 2*y, np.ones(n)])
    b = x**2 + y**2
    try:
        result, _, _, _ = np.linalg.lstsq(A, b, rcond=None)
    except np.linalg.LinAlgError:
        return None
    cx, cy, _ = result
    radii = np.hypot(x - cx, y - cy)
    return float(np.mean(radii))


def detect_scale_from_r_annotation(page, pdfpage_height: float) -> Optional[Tuple[int, str]]:
    """
    Find "R=N.N" text annotation and try to infer scale by fitting a circle
    to the nearest large curved path.

    Returns (scale_ratio, note) or None.
    """
    words = page.extract_words(extra_attrs=['size']) or []
    # Reconstruct "R=N.N" from adjacent tiny words (AutoCAD renders it split)
    # Collect all word clusters
    all_text = ' '.join(w['text'] for w in words)
    r_match = re.search(r'R\s*=\s*(\d+\.?\d*)', all_text)
    if not r_match:
        # Try direct pdfplumber text block
        raw = page.extract_text() or ''
        r_match = re.search(r'R\s*=\s*(\d+\.?\d*)', raw)
    if not r_match:
        return None

    r_meters = float(r_match.group(1))
    if r_meters <= 0 or r_meters > 5000:
        return None   # implausible

    # Locate the annotation position (centroid of R= text words)
    r_words = [w for w in words if any(c.isdigit() for c in w['text'])]
    if not r_words:
        return None

    # Use the word positions to approximate annotation center
    ann_x = np.mean([w['x0'] for w in r_words[:4]])
    ann_top = np.mean([w['top'] for w in r_words[:4]])

    # Search for a substantial curved path near the annotation
    candidates = []
    for curve in (page.curves or []):
        pts = curve.get('pts', [])
        if len(pts) < 4:
            continue
        ptsl = [(p[0], pdfpage_height - p[1]) for p in pts]  # convert to top-down
        arc = arc_length(ptsl)
        if arc < 50:
            continue
        cx = np.mean([p[0] for p in ptsl])
        cy = np.mean([p[1] for p in ptsl])
        dist = math.hypot(cx - ann_x, cy - ann_top)
        if dist < 400:
            candidates.append((dist, arc, ptsl))

    if not candidates:
        return None

    candidates.sort(key=lambda x: x[0])
    # Try fitting a circle to top candidates
    for dist, arc, ptsl in candidates[:5]:
        radius_pts = fit_circle(ptsl)
        if radius_pts is None or radius_pts <= 0:
            continue
        # scale = actual_length / paper_length
        # r_meters = radius_pts * PT_M * scale  → scale = r_meters / (radius_pts * PT_M)
        scale = r_meters / (radius_pts * PT_MM / 1000)
        scale_rounded = round(scale / 50) * 50  # round to nearest 50
        if 100 <= scale_rounded <= 2000:
            note = (f'R={r_meters}m annotation → circle fit on arc '
                    f'(radius={radius_pts:.1f}pt, dist={dist:.0f}pt) → scale≈1:{scale:.0f} → '
                    f'rounded to 1:{scale_rounded}')
            return int(scale_rounded), note

    return None


def detect_scale(page, page_height: float) -> Tuple[int, str, bool]:
    """
    Returns (scale_ratio, method_note, scale_verified).
    scale_verified=False means the scale was not confirmed from the document.
    """
    # Strategy 1: text ratio
    ratio = detect_scale_from_text(page)
    if ratio:
        return ratio, f'text pattern "1:{ratio}"', True

    # Strategy 2: R-annotation circle fit
    result = detect_scale_from_r_annotation(page, page_height)
    if result:
        ratio, note = result
        return ratio, note, True

    # Strategy 3: fallback
    return (SCALE_RATIO_FALLBACK,
            f'no scale found in PDF — using config fallback 1:{SCALE_RATIO_FALLBACK}',
            False)


# ── Deduplication ─────────────────────────────────────────────────────────────

# AutoCAD renders both edges of every thick line as separate paths, creating
# near-duplicate pairs. Thresholds for classifying two segments as the same element:
DEDUP_ARC_TOL   = 0.02   # arc lengths within 2%
DEDUP_X0_TOL    = 35.0   # start x within 35pt (≈12m at 1:500 — very conservative)
DEDUP_Y0_TOL    = 35.0   # start y within 35pt


def deduplicate_elements(elements: List[Dict]) -> Tuple[List[Dict], int]:
    """
    Remove one copy from each near-duplicate pair (same type, ≈arc, ≈x0, ≈y0).
    Keeps the record with the larger arc (the outer edge, slightly longer).
    Returns (deduplicated_list, n_removed).
    """
    removed = set()
    # Group by type for efficiency
    by_type: Dict[str, List[int]] = defaultdict(list)
    for i, e in enumerate(elements):
        by_type[e['type']].append(i)

    for etype, idxs in by_type.items():
        # Sort by x0 so potential duplicates are adjacent
        idxs_sorted = sorted(idxs, key=lambda i: elements[i]['bbox_pdf'][0])
        for a in range(len(idxs_sorted)):
            ia = idxs_sorted[a]
            if ia in removed:
                continue
            ea = elements[ia]
            for b in range(a + 1, len(idxs_sorted)):
                ib = idxs_sorted[b]
                if ib in removed:
                    continue
                eb = elements[ib]
                # Early exit: too far apart in x
                if eb['bbox_pdf'][0] - ea['bbox_pdf'][0] > DEDUP_X0_TOL * 2:
                    break
                arc_a, arc_b = ea['arc_length_pt'], eb['arc_length_pt']
                if (abs(arc_a - arc_b) / max(arc_a, 0.001) <= DEDUP_ARC_TOL
                        and abs(ea['bbox_pdf'][0] - eb['bbox_pdf'][0]) <= DEDUP_X0_TOL
                        and abs(ea['bbox_pdf'][1] - eb['bbox_pdf'][1]) <= DEDUP_Y0_TOL):
                    # Remove the smaller arc (inner edge)
                    removed.add(ib if arc_a >= arc_b else ia)

    deduped = [e for i, e in enumerate(elements) if i not in removed]
    return deduped, len(removed)


# ── Path extraction and classification ───────────────────────────────────────

def extract_elements(page, page_height: float,
                     scale_ratio: int) -> List[Dict]:
    """
    Extract all colored linear elements from the drawing area.
    Returns list of element records.
    """
    m_per_pt = scale_ratio * PT_MM / 1000   # actual meters per 1 PDF point

    elements = []
    elem_id = 0

    for curve in (page.curves or []):
        raw_pts = curve.get('pts', [])
        if len(raw_pts) < 2:
            continue

        # Convert to top-down pdfplumber coords
        pts = [(p[0], page_height - p[1]) for p in raw_pts]

        # Bounding box
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        x0, x1 = min(xs), max(xs)
        t0, t1 = min(ys), max(ys)

        # Exclude title block
        if x0 > DRAW_X_MAX:
            continue

        arc_pt = arc_length(pts)
        if arc_pt < MIN_ARC_PT:
            continue

        color = curve.get('stroking_color')
        meta  = color_key(color)
        if meta is None:
            continue   # not a known element type

        arc_m = arc_pt * m_per_pt
        elem_id += 1

        elements.append({
            'element_id':       f'MEAS-{elem_id:05d}',
            'type':             meta['type'],
            'type_he':          meta['he'],
            'boq_category':     meta['boq_category'],
            'stroke_color_rgb': list(color),
            'arc_length_pt':    round(arc_pt, 2),
            'arc_length_m':     round(arc_m, 3),
            'bbox_pdf':         [round(x0, 1), round(t0, 1), round(x1, 1), round(t1, 1)],
            'n_pts':            len(pts),
            # audit trail
            'scale_ratio':      scale_ratio,
            'scale_verified':   False,  # updated after scale detection
            'measurement_method': 'arc_length_polyline',
            'requires_review':  True,
            'approved_for_boq': False,
            'human_confirmed_length_m': None,
            'human_label_source': None,
        })

    return elements


# ── Connected-component grouping ──────────────────────────────────────────────

def group_into_runs(elements: List[Dict],
                    snap_dist: float = 4.0) -> List[Dict]:
    """
    Group adjacent same-type elements into 'runs' (e.g. a continuous guardrail).
    Two elements are adjacent if one endpoint is within snap_dist of another's endpoint.
    Returns run records with total_length_m.
    """
    # Build endpoint → element_id map per type
    type_elements: Dict[str, List[Dict]] = defaultdict(list)
    for e in elements:
        type_elements[e['type']].append(e)

    runs = []
    run_id = 0

    for etype, elems in type_elements.items():
        if not elems:
            continue
        # Union-find
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

        # Build endpoint list: each element has 2 endpoints
        eps = []
        for i, e in enumerate(elems):
            bbox = e['bbox_pdf']
            eps.append(((bbox[0], bbox[1]), i))  # top-left corner as proxy
            eps.append(((bbox[2], bbox[3]), i))  # bottom-right corner

        # Snap close endpoints
        for a in range(len(eps)):
            for b in range(a+1, len(eps)):
                pa, ia = eps[a]
                pb, ib = eps[b]
                if math.hypot(pa[0]-pb[0], pa[1]-pb[1]) <= snap_dist:
                    union(ia, ib)

        # Collect components
        comp: Dict[int, List[int]] = defaultdict(list)
        for i in range(len(elems)):
            comp[find(i)].append(i)

        for members in comp.values():
            run_id += 1
            total_m  = sum(elems[i]['arc_length_m']  for i in members)
            total_pt = sum(elems[i]['arc_length_pt'] for i in members)
            all_bboxes = [elems[i]['bbox_pdf'] for i in members]
            x0 = min(b[0] for b in all_bboxes)
            t0 = min(b[1] for b in all_bboxes)
            x1 = max(b[2] for b in all_bboxes)
            t1 = max(b[3] for b in all_bboxes)
            elem_ids = [elems[i]['element_id'] for i in members]

            runs.append({
                'run_id':         f'RUN-{run_id:04d}',
                'type':           etype,
                'type_he':        elems[members[0]]['he'] if 'he' in elems[members[0]] else elems[members[0]]['type_he'],
                'boq_category':   elems[members[0]]['boq_category'],
                'n_segments':     len(members),
                'total_length_m': round(total_m, 3),
                'total_length_pt':round(total_pt, 2),
                'bbox_pdf':       [round(x0,1), round(t0,1), round(x1,1), round(t1,1)],
                'element_ids':    elem_ids,
                'scale_ratio':    elems[members[0]]['scale_ratio'],
                'scale_verified': elems[members[0]]['scale_verified'],
                'requires_review':True,
                'approved_for_boq': False,
                'human_confirmed_length_m': None,
            })

    runs.sort(key=lambda r: -r['total_length_m'])
    return runs


# ── Overview image ─────────────────────────────────────────────────────────────

def build_overview(elements: List[Dict], page_w: float, page_h: float) -> np.ndarray:
    """Render a low-res overview with colored element overlays."""
    doc  = fitz.open(PDF_PATH)
    page = doc[0]
    pix  = page.get_pixmap(matrix=RENDER_MAT, colorspace=fitz.csRGB)
    img  = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, 3).copy()
    doc.close()

    scale_x = pix.w / page_w
    scale_y = pix.h / page_h
    overlay = img.copy()

    # Draw each element as a thick colored line
    for e in elements:
        meta = next((m for ref, m in ELEMENT_TYPES.items()
                     if e['type'] == m['type']), None)
        if meta is None:
            continue
        r, g, b = meta['rgb8']
        bbox = e['bbox_pdf']
        x0 = int(bbox[0] * scale_x)
        y0 = int(bbox[1] * scale_y)
        x1 = int(bbox[2] * scale_x)
        y1 = int(bbox[3] * scale_y)
        # Draw rect outline in element color
        cv2.rectangle(overlay, (x0, y0), (x1, y1), (b, g, r), 1)

    blended = cv2.addWeighted(overlay, OVERLAY_ALPHA, img, 1 - OVERLAY_ALPHA, 0)

    # Legend
    legend_y = 30
    for ref, meta in ELEMENT_TYPES.items():
        r, g, b = meta['rgb8']
        cv2.rectangle(blended, (10, legend_y - 10), (30, legend_y + 2), (b, g, r), -1)
        cv2.putText(blended, meta['type'], (35, legend_y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 0, 0), 1)
        legend_y += 18

    return blended


# ── Report ─────────────────────────────────────────────────────────────────────

def build_report(elements: List[Dict], runs: List[Dict],
                 scale_ratio: int, scale_note: str, scale_verified: bool,
                 elapsed: float) -> str:

    type_totals: Dict[str, float] = defaultdict(float)
    type_counts: Dict[str, int]   = defaultdict(int)
    for e in elements:
        type_totals[e['type']] += e['arc_length_m']
        type_counts[e['type']] += 1

    lines = [
        '# Scale Measurement Report — POC B (Stage H)',
        '',
        f'**PDF**: `{PDF_PATH.name}`',
        f'**Scale**: 1:{scale_ratio}  '
        f'({("VERIFIED" if scale_verified else "UNVERIFIED — requires human confirmation")})',
        f'**Scale detection**: {scale_note}',
        f'**m per PDF point**: {scale_ratio * PT_MM / 1000:.5f} m/pt',
        '',
        '> **Research only. No measurement is approved BOQ data.**',
        '> All lengths require human verification before operational use.',
        '',
        '## Summary by element type',
        '',
        '| Type | Type (HE) | BOQ Category | Segments | Total (m) | Longest run (m) |',
        '|------|-----------|--------------|----------|-----------|-----------------|',
    ]

    # Build longest-run lookup
    longest_run: Dict[str, float] = defaultdict(float)
    for r in runs:
        if r['total_length_m'] > longest_run[r['type']]:
            longest_run[r['type']] = r['total_length_m']

    meta_by_type = {m['type']: m for m in ELEMENT_TYPES.values()}
    for etype in sorted(type_totals, key=lambda t: -type_totals[t]):
        meta = meta_by_type.get(etype, {})
        lines.append(
            f"| {etype} | {meta.get('he','')} | {meta.get('boq_category','')} "
            f"| {type_counts[etype]} | **{type_totals[etype]:.1f}** "
            f"| {longest_run.get(etype, 0.0):.1f} |"
        )

    lines += [
        '',
        '## Top 20 runs by length',
        '',
        '| Run ID | Type | Length (m) | Segments | Scale |',
        '|--------|------|------------|----------|-------|',
    ]
    for r in runs[:20]:
        lines.append(
            f"| {r['run_id']} | {r['type']} | **{r['total_length_m']:.1f}** "
            f"| {r['n_segments']} | 1:{r['scale_ratio']} {'✓' if r['scale_verified'] else '⚠'} |"
        )

    lines += [
        '',
        '## BOQ draft structure',
        '',
        '```',
        '# DRAFT BOQ — requires_review = True for all items',
    ]
    boq_cats: Dict[str, float] = defaultdict(float)
    for r in runs:
        boq_cats[r['boq_category']] += r['total_length_m']
    for cat, total in sorted(boq_cats.items(), key=lambda x: -x[1]):
        lines.append(f'  {cat:<15} : {total:.1f} m  (UNVERIFIED)')
    lines += [
        '```',
        '',
        f'**Elapsed**: {elapsed:.1f}s',
        '',
        '---',
        '*Scale not verified by licensed surveyor. Measurements are for research only.*',
    ]

    return '\n'.join(lines)


# ── HTML report ───────────────────────────────────────────────────────────────

def build_html(elements: List[Dict], runs: List[Dict],
               scale_ratio: int, scale_note: str, scale_verified: bool,
               elapsed: float) -> str:

    type_totals: Dict[str, float] = defaultdict(float)
    type_counts: Dict[str, int]   = defaultdict(int)
    for e in elements:
        type_totals[e['type']] += e['arc_length_m']
        type_counts[e['type']] += 1

    meta_by_type = {m['type']: m for m in ELEMENT_TYPES.values()}

    rows_summary = ''
    for etype in sorted(type_totals, key=lambda t: -type_totals[t]):
        meta = meta_by_type.get(etype, {})
        rgb  = meta.get('rgb8', (200, 200, 200))
        swatch = f'background:rgb({rgb[0]},{rgb[1]},{rgb[2]})'
        rows_summary += (
            f'<tr>'
            f'<td><span style="display:inline-block;width:14px;height:14px;{swatch};border:1px solid #888"></span> {etype}</td>'
            f'<td>{meta.get("he","")}</td>'
            f'<td>{meta.get("boq_category","")}</td>'
            f'<td>{type_counts[etype]}</td>'
            f'<td><strong>{type_totals[etype]:.1f} m</strong></td>'
            f'</tr>\n'
        )

    rows_runs = ''
    for r in runs[:40]:
        sv = '✓' if r['scale_verified'] else '⚠'
        rows_runs += (
            f'<tr>'
            f'<td>{r["run_id"]}</td>'
            f'<td>{r["type"]}</td>'
            f'<td>{r["type_he"]}</td>'
            f'<td><strong>{r["total_length_m"]:.1f}</strong></td>'
            f'<td>{r["n_segments"]}</td>'
            f'<td>1:{r["scale_ratio"]} {sv}</td>'
            f'</tr>\n'
        )

    verified_badge = ('<span style="color:green">✓ VERIFIED</span>'
                      if scale_verified else
                      '<span style="color:orange">⚠ UNVERIFIED — requires human confirmation</span>')

    return f'''<!DOCTYPE html>
<html lang="he">
<head>
<meta charset="utf-8">
<title>Scale Measurement — POC B</title>
<style>
body{{font-family:system-ui,sans-serif;margin:24px;background:#f9f9f9}}
h1{{font-size:1.4rem}}h2{{font-size:1.1rem;margin-top:2em}}
table{{border-collapse:collapse;width:100%;max-width:900px;background:#fff;font-size:.88rem}}
th,td{{border:1px solid #ccc;padding:6px 10px;text-align:left}}
th{{background:#eee}}
.warn{{background:#fffbe6;border:1px solid #f0c040;padding:12px;border-radius:4px;max-width:860px}}
img{{max-width:100%;border:1px solid #ccc;margin-top:12px}}
</style>
</head>
<body>
<h1>Scale Measurement — POC B (Stage H)</h1>
<p><strong>PDF:</strong> {PDF_PATH.name} &nbsp;|&nbsp;
   <strong>Scale:</strong> 1:{scale_ratio} {verified_badge}</p>
<p><em>Scale method:</em> {scale_note}</p>
<div class="warn">⚠ Research only. No measurement is approved BOQ data.
All lengths require human verification before operational use.</div>

<h2>Overview image</h2>
<img src="overview.png" alt="plan overview with element overlays">

<h2>Summary by element type</h2>
<table>
<tr><th>Type</th><th>Type (HE)</th><th>BOQ Category</th><th>Segments</th><th>Total length</th></tr>
{rows_summary}
</table>

<h2>Top 40 runs</h2>
<table>
<tr><th>Run ID</th><th>Type</th><th>HE</th><th>Length (m)</th><th>Segments</th><th>Scale</th></tr>
{rows_runs}
</table>
<p style="color:#888;font-size:.8rem">Generated in {elapsed:.1f}s — research/cad-pdf-intelligence/15_scale_measurement.py</p>
</body>
</html>'''


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    t0 = time.time()

    print('=' * 60)
    print('POC B (Stage H) — Scale Measurement')
    print('15_scale_measurement.py')
    print('=' * 60)

    print(f'\n[Load] Opening PDF: {PDF_PATH}')
    with pdfplumber.open(PDF_PATH) as pdf:
        page = pdf.pages[0]
        page_w, page_h = page.width, page.height
        print(f'[Load] Page size: {page_w:.0f} × {page_h:.0f} pt  '
              f'({page_w*PT_MM:.0f} × {page_h*PT_MM:.0f} mm on paper)')

        # ── Scale detection ────────────────────────────────────────────────
        print('\n[Scale] Detecting scale ...')
        scale_ratio, scale_note, scale_verified = detect_scale(page, page_h)
        m_per_pt = scale_ratio * PT_MM / 1000
        print(f'[Scale] 1:{scale_ratio}  ({scale_note})')
        print(f'[Scale] 1 PDF pt = {m_per_pt:.5f} m in reality')
        if not scale_verified:
            print('[Scale] WARNING: scale UNVERIFIED — all measurements marked requires_review=True')

        # ── Element extraction ─────────────────────────────────────────────
        print('\n[Extract] Extracting colored linear elements ...')
        elements = extract_elements(page, page_h, scale_ratio)
        for e in elements:
            e['scale_verified'] = scale_verified
        print(f'[Extract] Found {len(elements)} element segments (before dedup)')

        # ── Deduplication ──────────────────────────────────────────────────
        elements, n_dedup = deduplicate_elements(elements)
        print(f'[Dedup]  Removed {n_dedup} near-duplicate paths '
              f'(AutoCAD double-draws both edges of thick lines)')
        print(f'[Dedup]  {len(elements)} unique segments remain')

        # Per-type summary
        type_totals: Dict[str, float] = defaultdict(float)
        type_counts: Dict[str, int]   = defaultdict(int)
        for e in elements:
            type_totals[e['type']] += e['arc_length_m']
            type_counts[e['type']] += 1
        for etype in sorted(type_totals, key=lambda t: -type_totals[t]):
            print(f'  {etype:<22} : {type_counts[etype]:5d} segments  '
                  f'{type_totals[etype]:8.1f} m total')

    # ── Grouping into runs ─────────────────────────────────────────────────
    print('\n[Group] Connecting adjacent segments into runs ...')
    runs = group_into_runs(elements)
    print(f'[Group] {len(runs)} runs')

    run_type_totals: Dict[str, float] = defaultdict(float)
    for r in runs:
        run_type_totals[r['type']] += r['total_length_m']

    for etype in sorted(run_type_totals, key=lambda t: -run_type_totals[t]):
        print(f'  {etype:<22} : {run_type_totals[etype]:.1f} m  '
              f'({sum(1 for r in runs if r["type"]==etype)} runs)')

    # ── Overview image ─────────────────────────────────────────────────────
    print('\n[Overview] Rendering plan overview with overlays ...')
    overview = build_overview(elements, page_w, page_h)
    cv2.imwrite(str(OUT_OVERVIEW), overview)
    print(f'[Overview] → {OUT_OVERVIEW}  ({overview.shape[1]}×{overview.shape[0]}px)')

    # ── JSON output ────────────────────────────────────────────────────────
    elapsed = time.time() - t0
    output = {
        'meta': {
            'pdf': str(PDF_PATH),
            'scale_ratio': scale_ratio,
            'scale_verified': scale_verified,
            'scale_note': scale_note,
            'm_per_pt': m_per_pt,
            'n_elements': len(elements),
            'n_dedup_removed': n_dedup,
            'n_runs': len(runs),
            'draw_x_max': DRAW_X_MAX,
            'min_arc_pt': MIN_ARC_PT,
            'elapsed_s': round(elapsed, 2),
            'approved_for_boq': False,
            'requires_review': True,
        },
        'type_totals_m': {k: round(v, 2) for k, v in type_totals.items()},
        'runs': runs,
        'elements': elements,
    }
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f'\n[JSON] → {OUT_JSON}')

    # ── Report ─────────────────────────────────────────────────────────────
    report_md = build_report(elements, runs, scale_ratio, scale_note, scale_verified, elapsed)
    OUT_REPORT.write_text(report_md, encoding='utf-8')
    print(f'[Report] → {OUT_REPORT}')

    html = build_html(elements, runs, scale_ratio, scale_note, scale_verified, elapsed)
    OUT_HTML.write_text(html, encoding='utf-8')
    print(f'[HTML] → {OUT_HTML}')

    # ── Summary ────────────────────────────────────────────────────────────
    elapsed = time.time() - t0
    print()
    print('=' * 60)
    print('POC B COMPLETE')
    print('=' * 60)
    print(f'  Scale                : 1:{scale_ratio}  '
          f'({"VERIFIED" if scale_verified else "UNVERIFIED"})')
    print(f'  Element segments     : {len(elements)}')
    print(f'  Runs (connected)     : {len(runs)}')
    print()
    print('  Element type totals:')
    for etype in sorted(type_totals, key=lambda t: -type_totals[t]):
        print(f'    {etype:<22} : {type_totals[etype]:.1f} m')
    print()
    print(f'  Overview PNG         : {OUT_OVERVIEW}')
    print(f'  JSON                 : {OUT_JSON}')
    print(f'  Report               : {OUT_REPORT}')
    print(f'  HTML                 : {OUT_HTML}')
    print(f'  Elapsed              : {elapsed:.1f}s')
    print()
    print('  Open in browser:')
    print(f'  open {OUT_HTML}')
    print()
    print('  REMINDER: No output is approved BOQ data.')
    print('  All measurements require human validation before operational use.')
    print('=' * 60)


if __name__ == '__main__':
    main()
