"""
21_triplet_diagnostic.py — Triplet Root-Cause Diagnostic

Goal: determine WHY vector glyph detection produces only pairs (size=2) and never
triplets (size=3), for the 6 OCCs with reconstructed code "33".

Specifically checks:
  1. Are "first digit" paths present but filtered out by N_MIN / AR_MAX / W_MIN?
  2. Are they present but outside GAP_MAX from the pair?
  3. Are they split into a separate group?
  4. Do triplets naturally form if the extraction filter is relaxed?
  5. Is the code genuinely 2-digit on this plan (no first digit exists)?

No clustering. No production changes. Read-only diagnostic.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# ── use local venv ─────────────────────────────────────────────────────────────
VENV_SITE = Path(__file__).parent / '.venv/lib'
for p in VENV_SITE.glob('python*/site-packages'):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import fitz  # PyMuPDF

# ── Config ──────────────────────────────────────────────────────────────────────
PDF_PATH = Path('/Users/eliozedri/Downloads/50-448-02-400.pdf')
OUT      = Path(__file__).parent / 'outputs'

# Current strict filter (from 13_vector_glyph_recognition.py)
H_MIN_S, H_MAX_S    = 7.0,  18.0
W_MIN_S, W_MAX_S    = 4.0,  16.0
N_MIN_S, N_MAX_S    = 8,    30
AR_MIN_S, AR_MAX_S  = 0.40, 1.70
GRAY_COLOR          = (0.57, 0.57, 0.57)
GRAY_TOL            = 0.03

# Relaxed filter — catches simpler glyphs ("1", "7", serifs)
H_MIN_R, H_MAX_R    = 5.0,  22.0
W_MIN_R, W_MAX_R    = 1.5,  18.0
N_MIN_R, N_MAX_R    = 2,    35
AR_MIN_R, AR_MAX_R  = 0.10, 3.50

# Adjacency params (from 13_vector_glyph_recognition.py)
GAP_MAX   = 7.0
Y_TOL     = 3.0
H_RATIO   = 1.40
MAX_X_SPAN = 80.0

# OCCs with detected "33" pairs (from vector_glyph_results.json)
TARGET_OCCS = {
    'OCC-0001': {'pdf_bbox': [1217.1, 1986.4, 1291.0, 2032.0], 'code': '33', 'position': 'above'},
    'OCC-0026': {'pdf_bbox': [1502.2, 1986.4, 1575.2, 2032.0], 'code': '33', 'position': 'above'},
    'OCC-0075': {'pdf_bbox': [1742.4, 1704.0, 1811.6, 1748.2], 'code': '33', 'position': 'above'},
    'OCC-0139': {'pdf_bbox': [2022.5, 1982.1, 2091.6, 2027.0], 'code': '33', 'position': 'above'},
    'OCC-0157': {'pdf_bbox': [1982.2, 1704.0, 2051.2, 1748.2], 'code': '33', 'position': 'above'},
    'OCC-0161': {'pdf_bbox': [2116.0, 1982.1, 2185.0, 2027.0], 'code': '33', 'position': 'above'},
    'OCC-0113': {'pdf_bbox': [1844.5, 1704.0, 1913.5, 1748.2], 'code': '86', 'position': 'above'},
}

# ── Helpers ─────────────────────────────────────────────────────────────────────

def _is_gray(color) -> bool:
    if color is None:
        return False
    if not hasattr(color, '__len__') or len(color) < 3:
        return False
    return all(abs(float(c) - GRAY_COLOR[i]) <= GRAY_TOL for i, c in enumerate(color[:3]))


def _filter_reason(p_dict: Dict) -> List[str]:
    """Return list of filter checks a path FAILS under the strict filter."""
    fails = []
    n = p_dict.get('n', 0)
    h = p_dict.get('h', 0.0)
    w = p_dict.get('w', 0.0)
    ar = w / max(h, 0.001)
    if not (H_MIN_S <= h <= H_MAX_S): fails.append(f'H={h:.1f} not in [{H_MIN_S},{H_MAX_S}]')
    if not (W_MIN_S <= w <= W_MAX_S): fails.append(f'W={w:.1f} not in [{W_MIN_S},{W_MAX_S}]')
    if not (N_MIN_S <= n <= N_MAX_S): fails.append(f'N={n} not in [{N_MIN_S},{N_MAX_S}]')
    if not (AR_MIN_S <= ar <= AR_MAX_S): fails.append(f'AR={ar:.2f} not in [{AR_MIN_S},{AR_MAX_S}]')
    return fails


def extract_gray_paths_around(page: fitz.Page, cx: float, cy: float,
                               x_radius: float = 80, y_radius: float = 60) -> List[Dict]:
    """Extract ALL gray stroke paths in an expanded window, with filter diagnostics."""
    drawings = page.get_drawings()
    result = []
    for idx, p in enumerate(drawings):
        if p.get('type') != 's':
            continue
        color = p.get('color')
        if not _is_gray(color):
            continue
        pr = p.get('rect')
        if pr is None:
            continue
        items = p.get('items', [])
        if not items:
            continue
        # Position check
        pcx = (float(pr.x0) + float(pr.x1)) / 2
        pcy = (float(pr.y0) + float(pr.y1)) / 2
        if abs(pcx - cx) > x_radius or abs(pcy - cy) > y_radius:
            continue
        n   = len(items)
        h   = float(pr.height)
        w   = float(pr.width)
        ar  = w / max(h, 0.001)
        all_line_segs = all(it[0] == 'l' for it in items)
        path_dict = {
            'draw_idx':     idx,
            'x0': float(pr.x0), 'y0': float(pr.y0),
            'x1': float(pr.x1), 'y1': float(pr.y1),
            'cx': pcx, 'cy': pcy,
            'w': w, 'h': h, 'ar': ar, 'n': n,
            'all_line_segs': all_line_segs,
        }
        path_dict['strict_pass'] = (
            all_line_segs and
            H_MIN_S <= h <= H_MAX_S and
            W_MIN_S <= w <= W_MAX_S and
            N_MIN_S <= n <= N_MAX_S and
            AR_MIN_S <= ar <= AR_MAX_S
        )
        path_dict['relaxed_pass'] = (
            all_line_segs and
            H_MIN_R <= h <= H_MAX_R and
            W_MIN_R <= w <= W_MAX_R and
            N_MIN_R <= n <= N_MAX_R and
            AR_MIN_R <= ar <= AR_MAX_R
        )
        path_dict['strict_fail_reasons'] = _filter_reason(path_dict)
        result.append(path_dict)
    return result


def find_group_region(occ: Dict) -> Tuple[float, float]:
    """Estimate where the detected pair lives (above OCC in y)."""
    bbox = occ['pdf_bbox']
    cx_occ = (bbox[0] + bbox[2]) / 2
    cy_top = bbox[1]  # y0 = top of sign
    # Detected groups are "above" sign with y_offset ~6-20pt above cy_top
    return cx_occ, cy_top - 15.0  # look ~15pt above sign top


def detect_groups_from_pool(paths: List[Dict], label: str) -> List[List[Dict]]:
    """
    Run adjacency detection (same logic as 13_vector_glyph_recognition.py)
    on the given pool of paths.
    """
    sorted_paths = sorted(paths, key=lambda p: (round(p['y0'] / 2) * 2, p['x0']))
    groups: List[List[Dict]] = []
    i = 0
    while i < len(sorted_paths):
        group = [sorted_paths[i]]
        j = i + 1
        while j < len(sorted_paths):
            prev = group[-1]
            nxt  = sorted_paths[j]
            gap    = nxt['x0'] - prev['x1']
            y_diff = abs(nxt['y0'] - prev['y0'])
            h_ratio = (max(prev['h'], nxt['h']) /
                       max(min(prev['h'], nxt['h']), 0.001))
            if 0 <= gap <= GAP_MAX and y_diff <= Y_TOL and h_ratio <= H_RATIO:
                group.append(nxt)
                j += 1
            else:
                break
        x_span = group[-1]['x1'] - group[0]['x0'] if len(group) > 1 else 0
        if 2 <= len(group) <= 4 and x_span <= MAX_X_SPAN:
            groups.append(group)
            i = j
        else:
            i += 1
    return groups


# ── Main diagnostic ─────────────────────────────────────────────────────────────

def main():
    print('=' * 70)
    print('Triplet Root-Cause Diagnostic')
    print('=' * 70)

    # Load known pair locations from vector_glyph_results.json
    vg_path = OUT / 'vector_glyph_results.json'
    vg_data = json.loads(vg_path.read_text()) if vg_path.exists() else []
    known_groups: Dict[str, Dict] = {}
    for r in vg_data:
        oid = r['occurrence_id']
        if oid in TARGET_OCCS and r.get('glyph_groups'):
            grp = r['glyph_groups'][0]
            known_groups[oid] = {
                'x_span_pt': grp['x_span_pt'],
                'h_mean_pt': grp['h_mean_pt'],
                'n_items_seq': grp['n_items_seq'],
                'cluster_seq': grp['cluster_seq'],
            }
            # Compute approx pair x0/x1 from cx+x_offset
            occ_cx = (TARGET_OCCS[oid]['pdf_bbox'][0] + TARGET_OCCS[oid]['pdf_bbox'][2]) / 2
            grp_cx = occ_cx + grp.get('x_offset_pt', 0)
            known_groups[oid]['approx_pair_cx']  = grp_cx
            known_groups[oid]['approx_pair_x0']  = grp_cx - grp['x_span_pt'] / 2
            known_groups[oid]['approx_pair_x1']  = grp_cx + grp['x_span_pt'] / 2

    print(f'\n[Load] PDF: {PDF_PATH}')
    doc = fitz.open(str(PDF_PATH))
    page = doc[0]
    print(f'[Load] Page size: {page.rect.width:.0f} × {page.rect.height:.0f} pt')

    # ── Per-OCC analysis ────────────────────────────────────────────────────────
    scenario_votes = {'A_filter': 0, 'B_gap': 0, 'C_no_path': 0}
    occ_reports = []

    for occ_id, occ_info in TARGET_OCCS.items():
        bbox  = occ_info['pdf_bbox']
        code  = occ_info['code']
        cx_occ = (bbox[0] + bbox[2]) / 2
        cy_top = bbox[1]
        # Search window: 100pt wide, from 60pt above sign top to 10pt below
        search_cx = cx_occ
        search_cy = cy_top - 25.0

        paths = extract_gray_paths_around(page, search_cx, search_cy,
                                          x_radius=90, y_radius=50)
        paths.sort(key=lambda p: p['x0'])

        strict_paths  = [p for p in paths if p['strict_pass']]
        relaxed_paths = [p for p in paths if p['relaxed_pass']]
        neither_paths = [p for p in paths if not p['strict_pass'] and not p['relaxed_pass']]

        # Known pair location
        kgrp = known_groups.get(occ_id, {})
        pair_x0 = kgrp.get('approx_pair_x0', cx_occ)
        pair_x1 = kgrp.get('approx_pair_x1', cx_occ + 18)

        # Find paths to the LEFT of the pair (potential first digit)
        left_candidates = [p for p in paths if p['x1'] < pair_x0 + 2]
        right_candidates = [p for p in paths if p['x0'] > pair_x1 - 2]

        # Measure gap from each left-of-pair path to pair x0
        left_with_gap = []
        for p in left_candidates:
            gap = pair_x0 - p['x1']
            left_with_gap.append({
                'x0': p['x0'], 'x1': p['x1'], 'y0': p['y0'],
                'w': p['w'], 'h': p['h'], 'n': p['n'], 'ar': p['ar'],
                'gap_to_pair': gap,
                'strict_pass': p['strict_pass'],
                'relaxed_pass': p['relaxed_pass'],
                'strict_fail_reasons': p['strict_fail_reasons'],
            })
        left_with_gap.sort(key=lambda x: abs(x['gap_to_pair']))

        # Detect groups in strict pool near this OCC
        strict_groups  = detect_groups_from_pool(strict_paths, 'strict')
        relaxed_groups = detect_groups_from_pool(relaxed_paths, 'relaxed')

        strict_sizes  = [len(g) for g in strict_groups]
        relaxed_sizes = [len(g) for g in relaxed_groups]

        # Determine scenario
        closest_left = left_with_gap[0] if left_with_gap else None
        if closest_left:
            gap = closest_left['gap_to_pair']
            if not closest_left['strict_pass'] and closest_left['relaxed_pass']:
                scenario = 'A — path exists, filtered by strict N/AR/W'
                scenario_votes['A_filter'] += 1
            elif closest_left['strict_pass'] and gap > GAP_MAX:
                scenario = 'B — path exists in strict pool, gap > GAP_MAX'
                scenario_votes['B_gap'] += 1
            elif closest_left['strict_pass'] and gap <= GAP_MAX:
                scenario = 'B? — path exists in strict pool, gap OK (should have formed group)'
                scenario_votes['B_gap'] += 1
            elif not closest_left['relaxed_pass']:
                scenario = 'C — no suitable path to left (not in relaxed pool either)'
                scenario_votes['C_no_path'] += 1
            else:
                scenario = '? — unclear'
        else:
            scenario = 'C — no gray path found to the left at all'
            scenario_votes['C_no_path'] += 1

        occ_reports.append({
            'occ_id': occ_id, 'code': code,
            'total_gray_in_window': len(paths),
            'strict_pool_size': len(strict_paths),
            'relaxed_pool_size': len(relaxed_paths),
            'strict_groups': strict_sizes,
            'relaxed_groups': relaxed_sizes,
            'left_candidates': len(left_with_gap),
            'closest_left': closest_left,
            'scenario': scenario,
        })

        # Print per-OCC report
        print(f'\n{"─" * 60}')
        print(f'{occ_id} | code="{code}" | sign bbox x={bbox[0]:.0f}-{bbox[2]:.0f}, cy_top={cy_top:.0f}')
        print(f'  Pair approx: x0={pair_x0:.0f} x1={pair_x1:.0f}')
        print(f'  Gray paths in window: {len(paths)} | strict: {len(strict_paths)} | relaxed: {len(relaxed_paths)} | neither: {len(neither_paths)}')

        # Show ALL gray paths in window
        print(f'\n  ALL gray paths (sorted by x0):')
        for p in paths:
            tag = 'STRICT' if p['strict_pass'] else ('RELAX' if p['relaxed_pass'] else 'OUT')
            side = 'LEFT' if p['x1'] < pair_x0 else ('RIGHT' if p['x0'] > pair_x1 else 'PAIR')
            gap_str = ''
            if side == 'LEFT':
                gap_str = f'  gap→pair={pair_x0 - p["x1"]:.1f}pt'
            elif side == 'RIGHT':
                gap_str = f'  gap←pair={p["x0"] - pair_x1:.1f}pt'
            fail_str = ' | ' + '; '.join(p['strict_fail_reasons']) if p['strict_fail_reasons'] else ''
            print(f'    [{tag}] [{side}]  x0={p["x0"]:.1f} x1={p["x1"]:.1f} '
                  f'w={p["w"]:.1f} h={p["h"]:.1f} n={p["n"]} ar={p["ar"]:.2f}{gap_str}{fail_str}')

        print(f'\n  Groups (strict pool): sizes={strict_sizes}')
        for g in strict_groups:
            print(f'    {len(g)}-path: x0={g[0]["x0"]:.1f} x1={g[-1]["x1"]:.1f} '
                  f'span={g[-1]["x1"]-g[0]["x0"]:.1f}pt n_seq={[p["n"] for p in g]}')
        print(f'  Groups (relaxed pool): sizes={relaxed_sizes}')
        for g in relaxed_groups:
            print(f'    {len(g)}-path: x0={g[0]["x0"]:.1f} x1={g[-1]["x1"]:.1f} '
                  f'span={g[-1]["x1"]-g[0]["x0"]:.1f}pt n_seq={[p["n"] for p in g]}')

        print(f'\n  SCENARIO: {scenario}')

    # ── Global summary ──────────────────────────────────────────────────────────
    print(f'\n{"=" * 70}')
    print('DIAGNOSTIC SUMMARY')
    print(f'{"=" * 70}')
    print(f'\nScenario vote across {len(TARGET_OCCS)} OCCs:')
    print(f'  A (path exists, filtered by N/AR/W):  {scenario_votes["A_filter"]}')
    print(f'  B (path exists, gap > GAP_MAX):        {scenario_votes["B_gap"]}')
    print(f'  C (no suitable path to the left):      {scenario_votes["C_no_path"]}')

    majority = max(scenario_votes, key=scenario_votes.get)
    print(f'\nMost likely root cause: Scenario {majority[0]}')

    print('\nRecommendation:')
    if scenario_votes['A_filter'] >= 3:
        print('  → Approach A: Relax N_MIN (8→4), AR_MAX (1.70→2.50), W_MIN (4.0→2.5)')
        print('    Expected: triplets form naturally without new grouping logic.')
        print('    Risk: some additional noise paths enter the pool; re-cluster.')
    elif scenario_votes['B_gap'] >= 3:
        print('  → Approach B: Two-pass pair+extension.')
        print('    For each detected pair, scan left/right within GAP_MAX×2 for third path.')
        print('    Keep extraction filter; no re-clustering.')
    elif scenario_votes['C_no_path'] >= 3:
        print('  → The first digit is NOT present as a gray vector path near these pairs.')
        print('    The code may be rendered as PDF text (not drawing) or may genuinely be 2-digit.')
        print('    Check page text for sign codes with page.get_text().')
        print('    Next step: run text extraction near pairs to check for digit text elements.')
    else:
        print('  → Mixed scenario: implement Approach C (relaxed pool + multi-size window).')

    # ── Quick text extraction check ─────────────────────────────────────────────
    print(f'\n{"─" * 60}')
    print('TEXT ELEMENT CHECK — searching page text near known pair locations ...')
    words = page.get_text('words')  # [(x0,y0,x1,y1,word,block,line,word_idx)]
    for occ_id, occ_info in TARGET_OCCS.items():
        bbox = occ_info['pdf_bbox']
        cx_occ = (bbox[0] + bbox[2]) / 2
        cy_top = bbox[1]
        nearby_words = [
            w for w in words
            if abs((w[0]+w[2])/2 - cx_occ) < 80 and abs((w[1]+w[3])/2 - cy_top) < 50
        ]
        if nearby_words:
            print(f'  {occ_id}: text elements: {[(w[4], round(w[0],0), round(w[1],0)) for w in nearby_words]}')
        else:
            print(f'  {occ_id}: no text elements found nearby')

    doc.close()
    print('\nDiagnostic complete.')


if __name__ == '__main__':
    main()
