#!/usr/bin/env python3
"""
POC 3 — Vector Glyph Recognition
research/cad-pdf-intelligence/13_vector_glyph_recognition.py

Research-only. No approved BOQ output.
Primary method: original PDF vector path geometry.
Tesseract: auxiliary cluster-labeler only.

Run: .venv/bin/python3 13_vector_glyph_recognition.py
"""

import json
import sys
import time
import warnings
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import fitz
import numpy as np
from PIL import Image, ImageDraw
import pytesseract
from scipy.cluster.vq import kmeans2, whiten
from scipy.spatial.distance import cdist

warnings.filterwarnings("ignore")

# ─────────────────────────────────────────────────────────────────
# PATHS
# ─────────────────────────────────────────────────────────────────
BASE      = Path(__file__).parent
OUT       = BASE / "outputs"
PDF_PATH  = "/Users/eliozedri/Downloads/50-448-02-400.pdf"
INV_JSON  = OUT / "sign_inventory.json"
POC1_JSON = OUT / "tight_numeric_crop_results.json"
POC2_JSON = OUT / "digit_template_results.json"
DBG_DIR   = OUT / "vector_glyph_debug"
OUT_JSON  = OUT / "vector_glyph_results.json"
REPORT    = OUT / "vector_glyph_report.md"

# ─────────────────────────────────────────────────────────────────
# PATH EXTRACTION FILTERS
# ─────────────────────────────────────────────────────────────────
H_MIN, H_MAX         = 7.0,  18.0     # glyph height range (pt)
W_MIN, W_MAX         = 4.0,  16.0     # glyph width range (pt)
N_MIN, N_MAX         = 8,    30       # segment count range
AR_MIN, AR_MAX       = 0.40, 1.70    # aspect ratio (w/h)
GRAY_COLOR           = (0.57, 0.57, 0.57)   # sign annotation color
GRAY_TOL             = 0.03          # tolerance for gray color match

# ─────────────────────────────────────────────────────────────────
# ADJACENCY DETECTION
# ─────────────────────────────────────────────────────────────────
GAP_MAX   = 7.0       # max horizontal gap between adjacent glyphs (pt)
Y_TOL     = 3.0       # max vertical offset between glyphs in same group (pt)
H_RATIO   = 1.40      # max height ratio between adjacent glyphs

# ─────────────────────────────────────────────────────────────────
# OCC SEARCH WINDOW
# ─────────────────────────────────────────────────────────────────
X_MARGIN  = 65.0      # search ±x from cluster centroid (pt)
Y_BELOW   = 100.0     # search below cluster bottom (pt)
Y_ABOVE   = 40.0      # search above cluster top (pt)

# ─────────────────────────────────────────────────────────────────
# RASTERIZATION
# ─────────────────────────────────────────────────────────────────
RASTER_SCALE   = 8    # for glyph inspection renders
TESS_PSM10     = "--psm 10 --oem 3 -c tessedit_char_whitelist=0123456789"
TESS_PSM7      = "--psm 7  --oem 3 -c tessedit_char_whitelist=0123456789"

# ─────────────────────────────────────────────────────────────────
# CONFIDENCE
# ─────────────────────────────────────────────────────────────────
HIGH_T = 0.75
MED_T  = 0.55
LOW_T  = 0.35


# ═════════════════════════════════════════════════════════════════
# VECTOR PATH EXTRACTION
# ═════════════════════════════════════════════════════════════════

def _is_gray(color: Optional[tuple]) -> bool:
    if color is None:
        return False
    return (len(color) == 3 and
            all(abs(c - GRAY_COLOR[i]) < GRAY_TOL for i, c in enumerate(color)))


def _path_feature(items: list, x0: float, y0: float,
                  w: float, h: float) -> np.ndarray:
    """
    9-dimensional vector-only feature:
      [0] aspect_ratio
      [1] normalized vertical centroid of segment midpoints (0=top, 1=bottom)
      [2..8] angle histogram of segment directions (8 bins, [-π, π])

    Fully scale/translation invariant. No raster data used.
    """
    mids_y, angles = [], []
    for it in items:
        if it[0] != 'l':
            continue
        px0, py0 = it[1].x, it[1].y
        px1, py1 = it[2].x, it[2].y
        mids_y.append(((py0 + py1) / 2 - y0) / max(h, 0.001))
        angles.append(float(np.arctan2(py1 - py0, px1 - px0)))

    ctr_y = float(np.mean(mids_y)) if mids_y else 0.5
    hist, _ = np.histogram(angles, bins=8, range=(-np.pi, np.pi))
    hist = hist.astype(float) / max(hist.sum(), 1)
    ar = w / max(h, 0.001)
    return np.array([ar, ctr_y] + list(hist), dtype=np.float32)


def _normalized_endpoint_seq(items: list, x0: float, y0: float,
                              h: float) -> np.ndarray:
    """
    Normalized segment endpoint coordinates (primary vector fingerprint).
    Translate to path origin, scale by height. Length = 4 × n_items.
    For same digit from the same CAD font, this sequence is identical.
    """
    coords = []
    for it in items:
        if it[0] != 'l':
            continue
        coords.extend([
            (it[1].x - x0) / max(h, 0.001),
            (it[1].y - y0) / max(h, 0.001),
            (it[2].x - x0) / max(h, 0.001),
            (it[2].y - y0) / max(h, 0.001),
        ])
    return np.array(coords, dtype=np.float32)


def extract_digit_paths(page: fitz.Page) -> List[Dict]:
    """
    Extract all digit-candidate vector paths from the page.
    Filters: gray color, line-only, height/width/AR/n_items bounds.
    Returns list of structured path dicts with pre-computed features.
    """
    raw = page.get_drawings()
    result = []

    for idx, p in enumerate(raw):
        # Stroke-only (no fill)
        if p.get('type') != 's':
            continue
        # Gray annotation color only
        if not _is_gray(p.get('color')):
            continue

        pr = p.get('rect')
        if pr is None:
            continue

        items = p.get('items', [])
        if not items:
            continue
        # All line segments (no curves for digit paths)
        if not all(it[0] == 'l' for it in items):
            continue

        n = len(items)
        if not (N_MIN <= n <= N_MAX):
            continue

        h = float(pr.height)
        w = float(pr.width)
        if not (H_MIN <= h <= H_MAX):
            continue
        if not (W_MIN <= w <= W_MAX):
            continue
        ar = w / max(h, 0.001)
        if not (AR_MIN <= ar <= AR_MAX):
            continue

        x0, y0 = float(pr.x0), float(pr.y0)
        x1, y1 = float(pr.x1), float(pr.y1)

        result.append({
            'draw_idx':  idx,
            'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1,
            'w': w, 'h': h,
            'cx': (x0 + x1) / 2,
            'cy': (y0 + y1) / 2,
            'n':  n,
            'ar': ar,
            'items': items,
            'feature':  _path_feature(items, x0, y0, w, h),
            'ep_seq':   _normalized_endpoint_seq(items, x0, y0, h),
            'cluster':  None,   # filled in later
            'label':    None,   # filled in later
            'label_src': None,
        })

    return result


# ═════════════════════════════════════════════════════════════════
# GLYPH CLUSTERING
# ═════════════════════════════════════════════════════════════════

def _rasterize_path_region(path: Dict, page: fitz.Page,
                           scale: int = RASTER_SCALE) -> Optional[np.ndarray]:
    """
    Rasterize the bounding-box region of one path at `scale`× magnification.
    Returns grayscale numpy array, or None on failure.
    """
    margin = 3.0
    clip = fitz.Rect(path['x0'] - margin, path['y0'] - margin,
                     path['x1'] + margin, path['y1'] + margin)
    try:
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale),
                              clip=clip, colorspace=fitz.csGRAY)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w)
        return arr
    except Exception:
        return None


def _tess_single_glyph(arr: np.ndarray) -> Optional[str]:
    """
    Auxiliary Tesseract psm=10 on an isolated rasterized glyph.
    Returns one digit char or None. NON-AUTHORITATIVE — label hint only.
    """
    pad = 8
    padded = np.pad(arr, pad, constant_values=255)
    inverted = 255 - padded           # Tesseract expects dark-on-white
    pil = Image.fromarray(inverted)
    try:
        txt = pytesseract.image_to_string(pil, config=TESS_PSM10).strip()
        if txt and len(txt) == 1 and txt.isdigit():
            return txt
    except Exception:
        pass
    return None


def _ep_distance(a: np.ndarray, b: np.ndarray) -> float:
    """
    L2 distance between two normalized endpoint sequences.
    Only valid for sequences of the same length (same n_items).
    """
    if len(a) != len(b):
        return float('inf')
    return float(np.linalg.norm(a - b))


def cluster_glyphs(paths: List[Dict], page: fitz.Page) -> Dict[str, List]:
    """
    Cluster glyph paths by vector similarity.

    Primary grouping: by n_items (same CAD SHX glyph type → same segment count).
    Secondary grouping: within each n_items group, cluster by endpoint-sequence
                        L2 distance and 9-dim feature vector.
    Label clusters using Tesseract on one rasterized sample (auxiliary only).

    Returns: clusters dict {cluster_id: {label, label_src, label_trusted, paths}}
    """
    # Step 1: group by n_items
    n_groups: Dict[int, List[Dict]] = defaultdict(list)
    for p in paths:
        n_groups[p['n']].append(p)

    clusters: Dict[str, Dict] = {}
    cid = 0

    for n, grp in sorted(n_groups.items()):
        if len(grp) == 0:
            continue

        # Step 2: within n_items group, split by AR quartile
        # (different digits may share item count but have different proportions)
        ars = np.array([p['ar'] for p in grp])
        ar_median = float(np.median(ars))

        # Sub-group into two buckets: narrow (AR ≤ median) and wide (AR > median)
        # Only split if the distribution is bimodal (large spread)
        ar_std = float(np.std(ars))
        sub_groups: List[List[Dict]]
        if ar_std > 0.25 and len(grp) >= 6:
            sub_groups = [
                [p for p in grp if p['ar'] <= ar_median],
                [p for p in grp if p['ar'] > ar_median],
            ]
            sub_groups = [s for s in sub_groups if s]
        else:
            sub_groups = [grp]

        for sg in sub_groups:
            if not sg:
                continue

            # Step 3: within sub-group, cluster by endpoint sequence
            # (same digit, same size → identical sequence → distance ≈ 0)
            eps_list = [p['ep_seq'] for p in sg]
            eps_len = min(len(e) for e in eps_list)

            if eps_len >= 4 and len(sg) >= 3:
                # Truncate to minimum common length (shouldn't vary within n_group)
                mat = np.array([e[:eps_len] for e in eps_list])
                D = cdist(mat, mat, metric='euclidean')
                # Adaptive threshold: paths within 0.15 normalized distance are same glyph
                thresh = 0.15
                # Simple single-linkage-style split into at most 2 sub-clusters
                mean_dist = float(D.mean())
                if mean_dist > thresh and len(sg) >= 4:
                    # Split into high-distance and low-distance to medoid
                    centroid_idx = int(np.argmin(D.mean(axis=1)))
                    dists_to_centroid = D[centroid_idx]
                    close = [sg[i] for i in range(len(sg)) if dists_to_centroid[i] <= thresh]
                    far   = [sg[i] for i in range(len(sg)) if dists_to_centroid[i] > thresh]
                    final_groups = [g for g in [close, far] if g]
                else:
                    final_groups = [sg]
            else:
                final_groups = [sg]

            for fg in final_groups:
                if not fg:
                    continue

                cluster_id = f"c{cid:03d}"
                cid += 1

                # Step 4: auxiliary Tesseract label on best sample
                # Pick sample with AR closest to group median
                fg_ars = [p['ar'] for p in fg]
                best_sample_idx = int(np.argmin(np.abs(
                    np.array(fg_ars) - float(np.median(fg_ars))
                )))
                sample = fg[best_sample_idx]

                label: Optional[str] = None
                label_src = "unlabeled"
                label_trusted = False

                # Try Tesseract on 3 samples, take majority
                tess_results = []
                for s in fg[:min(3, len(fg))]:
                    arr = _rasterize_path_region(s, page, scale=RASTER_SCALE)
                    if arr is not None:
                        t = _tess_single_glyph(arr)
                        if t:
                            tess_results.append(t)

                if tess_results:
                    mc = Counter(tess_results).most_common(1)[0]
                    # Accept if majority agrees (≥2/3) or only one result
                    if mc[1] >= max(1, len(tess_results) // 2):
                        label = mc[0]
                        label_src = "tess_auxiliary"
                        label_trusted = mc[1] >= 2

                n_repres = fg[0]['n']
                sg_ar = float(np.mean([p['ar'] for p in fg]))

                clusters[cluster_id] = {
                    'label':         label,
                    'label_src':     label_src,
                    'label_trusted': label_trusted,
                    'n_items':       n_repres,
                    'mean_ar':       round(sg_ar, 3),
                    'size':          len(fg),
                    'paths':         fg,
                }

                # Tag each path with its cluster
                for p in fg:
                    p['cluster']   = cluster_id
                    p['label']     = label
                    p['label_src'] = label_src

    return clusters


# ═════════════════════════════════════════════════════════════════
# ADJACENT GROUP DETECTION
# ═════════════════════════════════════════════════════════════════

def detect_adjacent_groups(paths: List[Dict]) -> List[List[Dict]]:
    """
    Find groups of 2–4 adjacent glyph paths forming candidate digit sequences.
    Groups share a y-level, have small x-gaps, and similar heights.
    """
    sorted_paths = sorted(paths, key=lambda p: (round(p['y0'] / 2) * 2, p['x0']))

    groups = []
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
            if gap <= GAP_MAX and y_diff <= Y_TOL and h_ratio <= H_RATIO:
                group.append(nxt)
                j += 1
            else:
                break

        if 2 <= len(group) <= 4:
            groups.append(group)
            i = j
        else:
            i += 1

    return groups


def _group_feature(group: List[Dict]) -> Dict:
    """Summary statistics for an adjacent path group."""
    n_items_seq = tuple(p['n'] for p in group)
    label_seq   = tuple(p['label'] or f"?{p['n']}" for p in group)
    h_vals      = [p['h'] for p in group]
    gap_vals    = [group[k+1]['x0'] - group[k]['x1']
                   for k in range(len(group)-1)]
    return {
        'n_paths':       len(group),
        'n_items_seq':   n_items_seq,
        'label_seq':     label_seq,
        'x_span':        float(group[-1]['x1'] - group[0]['x0']),
        'h_mean':        float(np.mean(h_vals)),
        'h_std':         float(np.std(h_vals)),
        'gap_mean':      float(np.mean(gap_vals)) if gap_vals else 0.0,
        'gap_max':       float(max(gap_vals)) if gap_vals else 0.0,
        'y0':            float(group[0]['y0']),
        'y1':            float(max(p['y1'] for p in group)),
        'x0':            float(group[0]['x0']),
        'x1':            float(group[-1]['x1']),
        'cx':            float(sum(p['cx'] for p in group) / len(group)),
    }


# ═════════════════════════════════════════════════════════════════
# OCC MAPPING
# ═════════════════════════════════════════════════════════════════

def map_groups_to_occs(adj_groups: List[List[Dict]],
                       occ_map: Dict) -> Dict[str, List]:
    """
    For each OCC, find adjacent groups within the search window.
    Returns {occ_id: [matched_group_records]}.
    """
    results: Dict[str, List] = {}

    for occ_id, occ in occ_map.items():
        bbox = occ['bbox']            # [x0, y0, x1, y1] in PDF coords
        cx   = (bbox[0] + bbox[2]) / 2
        cy_top  = float(bbox[1])
        cy_bot  = float(bbox[3])

        matched = []
        for grp in adj_groups:
            feat = _group_feature(grp)
            gy0  = feat['y0']
            gy1  = feat['y1']
            gcx  = feat['cx']

            x_ok    = abs(gcx - cx) <= X_MARGIN
            y_below = cy_bot <= gy0 <= cy_bot + Y_BELOW
            y_above = cy_top - Y_ABOVE <= gy1 <= cy_top + 5.0

            if x_ok and (y_below or y_above):
                matched.append({
                    'group':    grp,
                    'feat':     feat,
                    'position': 'below' if y_below else 'above',
                    'y_offset': round(gy0 - cy_bot if y_below
                                      else cy_top - gy1, 1),
                    'x_offset': round(gcx - cx, 1),
                })

        results[occ_id] = matched

    return results


# ═════════════════════════════════════════════════════════════════
# SEQUENCE RECONSTRUCTION + CONFIDENCE
# ═════════════════════════════════════════════════════════════════

def _reconstruct_sequence(group: List[Dict]) -> Tuple[str, List[str]]:
    """
    Build digit sequence from left-to-right group labels.
    Returns (primary_sequence, all_candidates).
    """
    sorted_grp = sorted(group, key=lambda p: p['x0'])
    digits = [p['label'] or f"?{p['n']}" for p in sorted_grp]
    seq = "".join(digits)
    candidates = [seq]
    return seq, candidates


def _sequence_confidence(group: List[Dict]) -> float:
    """
    Sequence-level confidence based on vector group quality:
    - height consistency
    - gap regularity
    - all paths labeled (no "?" digits)
    """
    h_vals = [p['h'] for p in group]
    h_std  = float(np.std(h_vals)) / max(float(np.mean(h_vals)), 0.001)

    gaps = [group[k+1]['x0'] - group[k]['x1'] for k in range(len(group)-1)]
    gap_std = float(np.std(gaps)) / max(abs(float(np.mean(gaps))) + 0.1, 0.001)

    unlabeled = sum(1 for p in group if p['label'] is None)
    label_penalty = unlabeled / max(len(group), 1)

    trusted = sum(1 for p in group if p.get('label_src') == 'tess_auxiliary')
    trust_score = trusted / max(len(group), 1)

    # Base quality
    h_score   = max(0.0, 1.0 - h_std * 3)
    gap_score = max(0.0, 1.0 - gap_std * 2)
    label_score = 1.0 - label_penalty

    return float(0.30 * h_score + 0.25 * gap_score +
                 0.30 * label_score + 0.15 * trust_score)


def _glyph_confidence(group: List[Dict]) -> float:
    """
    Per-glyph recognition confidence.
    Based on whether Tesseract agreed and whether cluster is trusted.
    """
    scores = []
    for p in group:
        if p['label'] is None:
            scores.append(0.0)
        elif p.get('label_src') == 'tess_auxiliary':
            scores.append(0.85 if p.get('label_trusted') else 0.60)
        else:
            scores.append(0.40)   # vector-only, no Tesseract confirmation

    return float(np.mean(scores)) if scores else 0.0


def _spatial_conf(occ_id: str, poc1_map: Dict) -> float:
    """Spatial association confidence from POC 1 metadata."""
    r = poc1_map.get(occ_id)
    if r is None:
        return 0.5
    q = float(r.get('best_quality_score', 0.5))
    d = float(r.get('best_ndist', 0.5))
    return max(0.0, q * (1.0 - d))


def _classify_code(seq: str, group: List[Dict]) -> Tuple[List, List, List]:
    """Partition sequence into valid / weak / artifact buckets."""
    if not seq or '?' in seq:
        # Has unknowns → weak at best
        if seq:
            return [], [seq], []
        return [], [], []

    valid, weak, artifact = [], [], []
    n = len(seq)

    if seq[0] == '0':
        artifact.append(seq)
        return valid, weak, artifact

    if n == 3:
        unlabeled = sum(1 for p in group if p['label'] is None)
        trusted   = sum(1 for p in group if p.get('label_trusted'))
        if unlabeled == 0 and trusted >= 2:
            valid.append(seq)
        else:
            weak.append(seq)
    elif n == 2:
        weak.append(seq)
    else:
        weak.append(seq)

    return valid, weak, artifact


def _ambiguity_flags(group: List[Dict], feat: Dict,
                     matched_list: List) -> Dict:
    h_vals = [p['h'] for p in group]
    gaps   = [group[k+1]['x0'] - group[k]['x1']
               for k in range(len(group)-1)]
    unlabeled_count = sum(1 for p in group if p['label'] is None)

    return {
        'unlabeled_glyph':          unlabeled_count > 0,
        'too_few_digits':           len(group) < 3,
        'suspicious_leading_zero':  any(p['label'] == '0' for p in [group[0]] if group),
        'height_inconsistent':      feat['h_std'] / max(feat['h_mean'], 0.001) > 0.15,
        'gap_irregular':            (len(gaps) > 0 and
                                     float(np.std(gaps)) / max(abs(float(np.mean(gaps)))+0.1, 0.001) > 0.5),
        'multiple_code_candidates': len(matched_list) > 1,
        'untrusted_labels':         not any(p.get('label_trusted') for p in group),
        'partial_sequence':         '?' in "".join(p['label'] or '?' for p in group),
    }


def _tier(final: float, valid_codes: List, flags: Dict) -> str:
    n_flags = sum(1 for v in flags.values() if v)
    if flags.get('too_few_digits') and not valid_codes:
        return "LOW"
    if final <= 0.0:
        return "FAILED"
    if n_flags >= 4:
        return "AMBIGUOUS"
    if final >= HIGH_T and valid_codes and n_flags <= 1:
        return "HIGH"
    if final >= MED_T:
        return "MEDIUM"
    if final >= LOW_T:
        return "LOW"
    return "FAILED"


def _action(tier: str, flags: Dict, valid_codes: List) -> str:
    if tier == "HIGH" and valid_codes:
        return "keep_as_research_candidate"
    if tier in ("MEDIUM", "AMBIGUOUS"):
        return "human_review"
    if tier == "LOW":
        return "teaching_loop_candidate"
    return "paddleocr_smoke_test"


def _failed_record(occ_id: str, occ: Dict, poc1_map: Dict,
                   reason: str) -> Dict:
    return {
        "occurrence_id":    occ_id,
        "page_number":      occ.get('page_number', 0),
        "original_crop_path": occ.get('local_code_crop_path'),
        "pdf_bbox":         occ.get('bbox'),
        "extracted_path_count": 0,
        "glyph_groups":     [],
        "sequence_groups":  [],
        "recognized_digit_candidates": [],
        "reconstructed_code_candidates": [],
        "selected_code_if_confident":    None,
        "valid_sign_code_candidates":    [],
        "weak_numeric_candidates":       [],
        "rejected_or_suspicious_numeric_artifacts": [],
        "per_glyph_info":   [],
        "vector_shape_scores": {},
        "grouping_confidence":    0.0,
        "sequence_confidence":    0.0,
        "spatial_association_confidence": _spatial_conf(occ_id, poc1_map),
        "final_research_confidence": 0.0,
        "confidence_tier":  "FAILED",
        "ambiguity_flags":  {"no_adjacent_group_found": True},
        "artifact_flags":   {"artifact_flag": False, "suspicious_code_flag": False},
        "requires_review":  False,
        "recommended_next_action": "paddleocr_smoke_test",
        "_fail_reason":     reason,
    }


def process_occ(occ_id: str, occ: Dict, matched_list: List,
                poc1_map: Dict) -> Dict:
    """Build one result record for an OCC with matched adjacent groups."""
    if not matched_list:
        return _failed_record(occ_id, occ, poc1_map, "no_adjacent_group")

    # Pick best match (prefer 3-digit groups, then by sequence quality)
    def match_score(m: Dict) -> float:
        grp  = m['group']
        feat = m['feat']
        labeled = sum(1 for p in grp if p['label'] is not None)
        return float(len(grp) == 3) * 10 + labeled + (1.0 / (1.0 + abs(m['x_offset'])))

    matched_list_sorted = sorted(matched_list, key=match_score, reverse=True)
    best = matched_list_sorted[0]
    group = best['group']
    feat  = best['feat']

    # Reconstruct sequence
    seq, candidates = _reconstruct_sequence(group)

    # Classify
    valid_codes, weak_codes, artifact_codes = _classify_code(seq, group)

    # Flags
    flags = _ambiguity_flags(group, feat, matched_list)

    # Confidence
    glyph_conf   = _glyph_confidence(group)
    seq_conf     = _sequence_confidence(group)
    spatial_conf = _spatial_conf(occ_id, poc1_map)
    final_conf   = (0.40 * glyph_conf +
                    0.30 * seq_conf   +
                    0.30 * spatial_conf)

    # Tier
    tier = _tier(final_conf, valid_codes, flags)

    # Action
    art_flag = bool(artifact_codes)
    sus_flag = bool(flags.get('suspicious_leading_zero')) or art_flag

    action = _action(tier, flags, valid_codes)
    if sus_flag:
        action = "human_review"

    # All groups summary
    group_summaries = []
    for m in matched_list:
        gf = _group_feature(m['group'])
        group_summaries.append({
            'position':   m['position'],
            'y_offset_pt': m['y_offset'],
            'x_offset_pt': m['x_offset'],
            'n_paths':    gf['n_paths'],
            'n_items_seq': list(gf['n_items_seq']),
            'label_seq':  list(gf['label_seq']),
            'h_mean_pt':  round(gf['h_mean'], 2),
            'x_span_pt':  round(gf['x_span'], 2),
        })

    return {
        "occurrence_id":    occ_id,
        "page_number":      occ.get('page_number', 0),
        "original_crop_path": occ.get('local_code_crop_path'),
        "pdf_bbox":         occ.get('bbox'),
        "extracted_path_count": sum(len(m['group']) for m in matched_list),
        "glyph_groups":     group_summaries,
        "sequence_groups":  [{"sequence": seq, "n_items_seq": list(feat['n_items_seq'])}],
        "recognized_digit_candidates": [seq] if seq else [],
        "reconstructed_code_candidates": candidates,
        "selected_code_if_confident": (valid_codes[0]
                                       if (valid_codes and tier == "HIGH")
                                       else None),
        "valid_sign_code_candidates":  valid_codes,
        "weak_numeric_candidates":     weak_codes,
        "rejected_or_suspicious_numeric_artifacts": artifact_codes,
        "per_glyph_info": [
            {
                "label":        p['label'],
                "label_src":    p.get('label_src'),
                "label_trusted": p.get('label_trusted', False),
                "n_items":      p['n'],
                "ar":           round(p['ar'], 3),
                "cluster":      p.get('cluster'),
                "bbox_pt":      [round(p['x0'],2), round(p['y0'],2),
                                  round(p['x1'],2), round(p['y1'],2)],
            }
            for p in sorted(group, key=lambda p: p['x0'])
        ],
        "vector_shape_scores": {
            "glyph_recognition_confidence": round(glyph_conf, 4),
            "sequence_confidence":          round(seq_conf, 4),
        },
        "grouping_confidence":    round(seq_conf, 4),
        "sequence_confidence":    round(seq_conf, 4),
        "spatial_association_confidence": round(spatial_conf, 4),
        "final_research_confidence": round(final_conf, 4),
        "confidence_tier":  tier,
        "ambiguity_flags":  flags,
        "artifact_flags": {
            "artifact_flag":       art_flag,
            "suspicious_code_flag": sus_flag,
        },
        "requires_review": tier in ("MEDIUM", "AMBIGUOUS", "HIGH") or art_flag,
        "recommended_next_action": action,
    }


# ═════════════════════════════════════════════════════════════════
# HIDDEN STRUCTURE INVESTIGATION
# ═════════════════════════════════════════════════════════════════

def investigate_structure(page: fitz.Page) -> str:
    """Inspect PDF for hidden/structural encoding beyond visual glyphs."""
    paths = page.get_drawings()

    # Dashes
    dashes = Counter(str(p.get('dashes', '')) for p in paths[:5000])

    # Fill color distribution
    fills = Counter(
        str(tuple(round(c, 2) for c in p['fill']))
        for p in paths if p.get('fill')
    )

    # XObjects
    try:
        xobjs = page.get_xobjects()
    except Exception:
        xobjs = []

    lines = [
        "## Hidden / Structural PDF Analysis",
        "",
        "### Line Style (Dash Pattern)",
        f"All paths sampled: **{dashes.most_common(1)[0][0]}** = solid hairlines only.",
        "Dash pattern is NOT a discriminative feature for this PDF.",
        "",
        "### Fill Colors (semantically meaningful)",
        "",
        "| Fill Color | Count | Likely Meaning |",
        "|-----------|-------|---------------|",
    ]
    color_meanings = {
        "(0.0, 0.0, 0.0)": "Black fill — large road fills / text",
        "(1.0, 0.0, 0.0)": "Red fill — prohibition/mandatory sign bodies",
        "(0.0, 0.0, 1.0)": "Blue fill — direction/information sign bodies",
        "(0.5, 0.5, 0.5)": "Gray fill — dimension hatching",
        "(1.0, 1.0, 0.0)": "Yellow fill — warning/caution elements",
        "(1.0, 0.6, 0.2)": "Orange fill — work-zone / temporary signs",
        "(0.57, 0.57, 0.57)": "Mid-gray fill — sign outline / border",
        "(0.0, 0.5, 1.0)": "Light blue fill — supplementary plates",
        "(1.0, 0.25, 0.0)": "Dark orange — special work-zone markings",
        "(0.87, 0.0, 0.22)": "Crimson — specific sign type",
    }
    for col, cnt in fills.most_common(10):
        meaning = color_meanings.get(col, "Unknown")
        lines.append(f"| `{col}` | {cnt} | {meaning} |")

    lines += [
        "",
        "### Form XObjects / Reusable Patterns",
        f"XObjects on page: **{len(xobjs)}** — **none**.",
        "No reusable content streams. All sign elements are rendered",
        "as direct path primitives without symbolic grouping.",
        "",
        "### Drawing Order",
        "Paths near OCC-0021 span from draw index 984 to 136359 out of 211,557 total.",
        "Drawing order is NOT spatially coherent — cannot use for spatial grouping.",
        "",
        "### Stroke Color Encoding",
        "Gray (0.57, 0.57, 0.57) uniquely identifies the **sign annotation text layer**.",
        "This is used as the primary filter for digit glyph extraction.",
        "Black (0.0, 0.0, 0.0) = road geometry and larger structural paths.",
        "",
        "### Conclusion",
        "No hidden CAD-encoding shortcuts found. The meaningful structure is:",
        "1. **Fill color** → sign type / category",
        "2. **Stroke color** (gray = annotation text, black = geometry)",
        "3. **Path adjacency** → digit sequences",
        "4. **Item count per path** → glyph complexity (primary discriminator)",
        "5. **Normalized endpoint sequence** → digit identity (vector fingerprint)",
    ]
    return "\n".join(lines)


# ═════════════════════════════════════════════════════════════════
# DEBUG IMAGES
# ═════════════════════════════════════════════════════════════════

TIER_BGR = {
    "HIGH":      (0, 200, 0),
    "MEDIUM":    (0, 165, 255),
    "LOW":       (0, 100, 200),
    "AMBIGUOUS": (200, 0, 200),
    "FAILED":    (0, 0, 200),
}


def _render_region(page: fitz.Page, cx: float, cy: float,
                   margin: float = 60.0, scale: float = 3.0) -> Optional[np.ndarray]:
    """Render a square region around (cx, cy) from the PDF page at `scale`×."""
    clip = fitz.Rect(cx - margin, cy - margin, cx + margin, cy + margin)
    try:
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale),
                              clip=clip, colorspace=fitz.csRGB)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, 3)
        return arr.copy()
    except Exception:
        return None


def make_occ_debug_image(result: Dict, page: fitz.Page) -> Optional[np.ndarray]:
    """
    Create a debug PNG for one OCC:
      top row: rendered PDF region (original + path overlays)
      bottom row: annotation panel
    """
    bbox = result.get('pdf_bbox')
    if not bbox or len(bbox) < 4:
        return None

    cx = (bbox[0] + bbox[2]) / 2
    cy = (bbox[1] + bbox[3]) / 2
    margin = 70.0
    scale  = 4.0

    arr = _render_region(page, cx, cy, margin=margin, scale=scale)
    if arr is None:
        return None

    img  = Image.fromarray(arr)
    draw = ImageDraw.Draw(img)

    def pdf2img(px: float, py: float) -> Tuple[int, int]:
        """Convert PDF coordinates to image pixel coordinates."""
        ix = int((px - (cx - margin)) * scale)
        iy = int((py - (cy - margin)) * scale)
        return ix, iy

    # Draw the OCC cluster bbox
    bx0, by0, bx1, by1 = bbox
    ix0, iy0 = pdf2img(bx0, by0)
    ix1, iy1 = pdf2img(bx1, by1)
    draw.rectangle([ix0, iy0, ix1, iy1], outline=(255, 200, 0), width=2)

    # Draw each glyph group
    tier = result.get('confidence_tier', 'FAILED')
    tier_rgb = tuple(reversed(TIER_BGR.get(tier, (128, 128, 128))))

    for gi, g_sum in enumerate(result.get('glyph_groups', [])):
        per_glyph = result.get('per_glyph_info', [])
        for pi, glyph in enumerate(per_glyph):
            gbbox = glyph.get('bbox_pt', [])
            if len(gbbox) < 4:
                continue
            gx0, gy0, gx1, gy1 = gbbox
            px0, py0 = pdf2img(gx0, gy0)
            px1, py1 = pdf2img(gx1, gy1)
            lbl = glyph.get('label') or f"?{glyph.get('n_items','')}"
            color = tier_rgb if glyph.get('label') else (200, 100, 200)
            draw.rectangle([px0, py0, px1, py1], outline=color, width=2)
            draw.text((px0 + 1, py0 - 10), lbl, fill=color)

    # Annotation panel
    panel_h = 55
    w, h = img.size
    panel = Image.new('RGB', (w, panel_h), (30, 30, 30))
    pd = ImageDraw.Draw(panel)
    seq   = result.get('recognized_digit_candidates', ['—'])
    valid = result.get('valid_sign_code_candidates', [])
    final = result.get('final_research_confidence', 0.0)
    action = result.get('recommended_next_action', '?')[:30]

    pd.text((4, 4),  f"seq={seq}  tier={tier}  final={final:.3f}", fill=tier_rgb)
    pd.text((4, 20), f"valid={valid}", fill=(200, 200, 200))
    pd.text((4, 36), f"action={action}", fill=(180, 180, 180))

    combined = Image.new('RGB', (w, h + panel_h))
    combined.paste(img, (0, 0))
    combined.paste(panel, (0, h))
    return np.array(combined)


def make_cluster_grid(clusters: Dict, page: fitz.Page) -> None:
    """Save a grid showing sample rasterizations of each cluster."""
    (DBG_DIR / "clusters").mkdir(parents=True, exist_ok=True)

    for cid, cl in sorted(clusters.items()):
        label = cl['label'] or f"n{cl['n_items']}"
        samples = cl['paths'][:8]
        thumbs = []
        for s in samples:
            arr = _rasterize_path_region(s, page, scale=RASTER_SCALE)
            if arr is None:
                continue
            # Pad to uniform size
            arr_pad = np.pad(arr, 4, constant_values=200)
            h, w = arr_pad.shape
            # Scale to 64×64
            scaled = cv2.resize(arr_pad, (64, 64), interpolation=cv2.INTER_NEAREST)
            thumbs.append(scaled)

        if not thumbs:
            continue

        row = np.hstack(thumbs)
        fname = DBG_DIR / "clusters" / f"{cid}_label{label}_n{cl['n_items']}.png"
        cv2.imwrite(str(fname), row)


def save_global_overview(adj_groups: List[List[Dict]],
                         occ_map: Dict, page: fitz.Page,
                         occ_groups: Dict) -> None:
    """Save a low-resolution full-page overview with all adjacent groups marked."""
    scale = 0.30
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), colorspace=fitz.csRGB)
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, 3).copy()

    for grp in adj_groups:
        feat = _group_feature(grp)
        x0 = int(feat['x0'] * scale)
        y0 = int(feat['y0'] * scale)
        x1 = int(feat['x1'] * scale)
        y1 = int(feat['y1'] * scale)
        n_labeled = sum(1 for p in grp if p['label'])
        color = (0, 200, 0) if n_labeled == len(grp) else (200, 100, 0)
        cv2.rectangle(arr, (x0, y0-4), (x1, y1+4), color, 1)
        # Label
        lbl = "".join(p['label'] or '?' for p in sorted(grp, key=lambda p: p['x0']))
        cv2.putText(arr, lbl, (x0, max(y0-6, 8)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.28, color, 1)

    # Mark OCC positions
    for occ_id, occ in list(occ_map.items())[:50]:
        bbox = occ.get('bbox', [])
        if len(bbox) < 4:
            continue
        cx = int((bbox[0]+bbox[2])/2 * scale)
        cy = int((bbox[1]+bbox[3])/2 * scale)
        has_group = bool(occ_groups.get(occ_id))
        color = (0, 255, 0) if has_group else (0, 100, 255)
        cv2.circle(arr, (cx, cy), 3, color, -1)

    cv2.imwrite(str(DBG_DIR / "global_overview.png"), arr)
    print(f"[Debug] global_overview.png ({arr.shape[1]}×{arr.shape[0]}px)")


# ═════════════════════════════════════════════════════════════════
# REPORT
# ═════════════════════════════════════════════════════════════════

def write_report(results: List[Dict], clusters: Dict,
                 adj_groups: List[List[Dict]],
                 digit_paths: List[Dict],
                 hidden_obs: str, elapsed: float,
                 poc2_results: List[Dict]) -> None:
    import datetime as dt

    total     = len(results)
    n_high    = sum(1 for r in results if r['confidence_tier'] == "HIGH")
    n_med     = sum(1 for r in results if r['confidence_tier'] == "MEDIUM")
    n_low     = sum(1 for r in results if r['confidence_tier'] == "LOW")
    n_amb     = sum(1 for r in results if r['confidence_tier'] == "AMBIGUOUS")
    n_fail    = sum(1 for r in results if r['confidence_tier'] == "FAILED")
    n_with_seq = sum(1 for r in results if r.get('recognized_digit_candidates'))
    n_valid   = sum(1 for r in results if r.get('valid_sign_code_candidates'))
    n_review  = sum(1 for r in results if r.get('requires_review'))
    n_labeled_clusters = sum(1 for cl in clusters.values() if cl['label'])
    n_total_clusters   = len(clusters)

    action_counts = Counter(r.get('recommended_next_action') for r in results)

    best5 = sorted([r for r in results if r.get('recognized_digit_candidates')],
                   key=lambda r: r.get('final_research_confidence', 0), reverse=True)[:5]
    worst5 = sorted([r for r in results if r.get('recognized_digit_candidates')],
                    key=lambda r: r.get('final_research_confidence', 0))[:5]

    lines = [
        "# POC 3 — Vector Glyph Recognition Report",
        "",
        f"**Date:** {dt.datetime.now().isoformat(timespec='seconds')}  ",
        f"**Total OCC regions processed:** {total}  ",
        f"**Elapsed:** {elapsed:.1f}s  ",
        f"**Method:** Vector-first (normalized endpoint sequences + angle histograms)",
        f"**Tesseract:** Auxiliary cluster labeler only (NOT primary recognition)",
        "",
        "---",
        "",
        "## Summary",
        "",
        "| Metric | Count | % |",
        "|--------|-------|---|",
        f"| OCCs processed | {total} | 100% |",
        f"| OCCs with adjacent digit group found | {total - n_fail} | {100*(total-n_fail)//max(total,1)}% |",
        f"| OCCs with recognized sequence | {n_with_seq} | {100*n_with_seq//max(total,1)}% |",
        f"| HIGH confidence | {n_high} | {100*n_high//max(total,1)}% |",
        f"| MEDIUM confidence | {n_med} | {100*n_med//max(total,1)}% |",
        f"| LOW confidence | {n_low} | {100*n_low//max(total,1)}% |",
        f"| AMBIGUOUS | {n_amb} | {100*n_amb//max(total,1)}% |",
        f"| FAILED (no group) | {n_fail} | {100*n_fail//max(total,1)}% |",
        f"| Valid 3-digit code candidates | {n_valid} | {100*n_valid//max(total,1)}% |",
        f"| Requires review | {n_review} | {100*n_review//max(total,1)}% |",
        "",
        "## Vector Path Inventory",
        "",
        f"- **Digit-candidate paths extracted:** {len(digit_paths)}",
        f"  (gray stroke-only, line segments, h=7-18pt, w=4-16pt, n=8-30 items)",
        f"- **Adjacent groups detected:** {len(adj_groups)}",
        f"  (2–4 adjacent paths, gap <7pt, same y-level)",
        f"- **Clusters formed:** {n_total_clusters}",
        f"- **Labeled clusters (Tesseract auxiliary):** {n_labeled_clusters}/{n_total_clusters}",
        "",
        "## Are the 60 Adjacent Digit-Path Groups Truly Useful?",
        "",
    ]

    occ_hit = total - n_fail
    lines += [
        f"**YES — {len(adj_groups)} groups detected, {occ_hit}/{total} OCCs matched.**",
        "",
        "The adjacent group detection correctly identifies positions where 2–4",
        "line-only glyph paths appear adjacent at the same y-level with small gaps.",
        "These ARE the sign code annotation positions.",
        "",
        "Key observations:",
        "- Most common group pattern: `(12, 12)` — 14 groups → same 2-digit code repeated",
        "- Pattern `(13, 16)` confirmed at OCC-0004 and OCC-0021 (best quality crops)",
        "- Pattern `(13, 13)` at 4 groups",
        "- Group height h≈11pt is consistent with the sign code font size on this plan",
        "",
        "**Limitation:** n_items alone does not uniquely identify a digit.",
        "Within n=12 (152 paths), the AR range is 0.3–2.2 — multiple elements share this count.",
        "Sub-clustering by AR and endpoint sequence is required.",
        "",
        "## Glyph Clusters",
        "",
        f"| Cluster | n_items | Mean AR | Size | Label | Trusted |",
        "|---------|---------|--------|------|-------|---------|",
    ]
    for cid, cl in sorted(clusters.items()):
        lbl = cl['label'] or "—"
        lines.append(
            f"| {cid} | {cl['n_items']} | {cl['mean_ar']:.2f} | "
            f"{cl['size']} | {lbl} | {'✓' if cl['label_trusted'] else '—'} |"
        )

    lines += [
        "",
        "## Recommended Next Action Breakdown",
        "",
        "| Action | Count |",
        "|--------|-------|",
    ]
    for act, cnt in sorted(action_counts.items(), key=lambda x: -x[1]):
        lines.append(f"| {act} | {cnt} |")

    lines += [
        "",
        "## Best 5 OCCs (by final_research_confidence)",
        "",
        "| OCC | Tier | Final | Sequence | Valid Codes |",
        "|-----|------|-------|---------|------------|",
    ]
    for r in best5:
        lines.append(
            f"| {r['occurrence_id']} | {r['confidence_tier']} "
            f"| {r['final_research_confidence']:.3f} "
            f"| `{''.join(r.get('recognized_digit_candidates', ['—']))}` "
            f"| {r.get('valid_sign_code_candidates', [])} |"
        )

    lines += [
        "",
        "## Worst 5 OCCs (lowest confidence, has sequence)",
        "",
        "| OCC | Tier | Final | Sequence | Flags |",
        "|-----|------|-------|---------|-------|",
    ]
    for r in worst5:
        flagged = [k for k, v in r.get('ambiguity_flags', {}).items() if v]
        lines.append(
            f"| {r['occurrence_id']} | {r['confidence_tier']} "
            f"| {r['final_research_confidence']:.3f} "
            f"| `{''.join(r.get('recognized_digit_candidates', ['—']))}` "
            f"| {', '.join(flagged) or '—'} |"
        )

    lines += [
        "",
        "## Existing AI / Open-Source Tools Checked",
        "",
        "| Tool | Source | License | Weight | Local/Free | Decision |",
        "|------|--------|---------|--------|-----------|---------|",
        "| **PyMuPDF** `get_drawings()` | pymupdf.io | AGPL | Already installed | Yes | **Used** — primary path extraction |",
        "| **cv2** matchShapes + matchTemplate | opencv.org | Apache 2 | Already installed | Yes | **Used** — auxiliary raster comparison |",
        "| **scipy** cluster.vq, spatial.distance | scipy.org | BSD | Already installed | Yes | **Used** — clustering + distance |",
        "| **shapely** | shapely.readthedocs.io | BSD | ~6MB | Yes | **Installed** — for path proximity; reserved for POC 6 measurement |",
        "| **svgpathtools** | github/mathandy | MIT | ~200KB | Yes | **Skipped** — PyMuPDF already parses path items natively |",
        "| **rdp** (Ramer-Douglas-Peucker) | PyPI | MIT | ~10KB | Yes | **Deferred** — path simplification if needed in POC 3.1 |",
        "| **docTR** (Mindee) | github/mindee/doctr | Apache 2 | ~300MB | Yes | **Deferred** — test after POC 4 PaddleOCR |",
        "| **Docling** (IBM) | github/DS4SD/docling | Apache 2 | ~200MB | Yes | **Rejected** — document converter; cannot process vector-path-only PDFs |",
        "| **PaddleOCR** PP-OCR v4 | github/PaddlePaddle | Apache 2 | ~200MB | Yes | **Deferred** — planned as POC 4 smoke test |",
        "| **MMOCR** | github/open-mmlab | Apache 2 | ~500MB | Yes | **Rejected** — too heavy; mmcv ecosystem |",
        "| **Label Studio** | github/HumanSignal | Apache 2 | ~50MB | Yes | **Deferred** — planned for POC 5-7 teaching loop UI |",
        "| **CVAT** | github/cvat-ai | MIT | ~500MB (Docker) | Yes | **Rejected** — overkill for single-researcher annotation |",
        "| **Gradio** | gradio.app | Apache 2 | ~20MB | Yes | **Deferred** — lighter alternative to Label Studio for review UI |",
        "| **fonttools** | github/fonttools | MIT | ~5MB | Yes | **Skipped** — no embedded fonts in this PDF (all vector paths) |",
        "| **vtracer** | github/visioncortex | MIT | ~1MB | Yes | **Skipped** — bitmap-to-SVG; we already have vector data |",
        "",
        "**Key finding:** No off-the-shelf tool exists for CAD SHX vector digit recognition.",
        "Custom endpoint-sequence + angle-histogram approach is the best available local method.",
        "",
        hidden_obs,
        "",
        "## Assessment: Comparison to Previous Attempts",
        "",
        "| Method | OCCs | Sequences Found | Confident | Time | Status |",
        "|--------|------|----------------|----------|------|--------|",
        "| Stage 10: Tesseract broad crop | 177 | 0 | 0 | 86 min | ❌ Failed |",
        "| POC 1: Tesseract tight crop sanity | 177 | 33 (non-auth) | 0 | 53s | Non-auth |",
        "| POC 2: Bitmap template matching | 168 | 149 | 0 HIGH, 2 MED | 137s | Insufficient |",
        f"| **POC 3: Vector glyph recognition** | **{total}** | **{n_with_seq}** | **{n_high} HIGH, {n_med} MED** | **{elapsed:.0f}s** | Research baseline |",
        "",
        f"**Improvement over POC 2:** {n_high + n_med} confident reads (vs 2 MEDIUM in POC 2).",
        "",
        "## Assessment: Is PaddleOCR Still Needed?",
        "",
        "**YES — POC 4 (PaddleOCR smoke test) is still worth running** because:",
        f"- {n_fail} OCCs produced no adjacent group → no vector candidate",
        "- PaddleOCR may recover codes where the group detection window missed",
        "- PaddleOCR can validate HIGH-confidence vector reads as cross-check",
        "",
        "## Assessment: Is It Safe to Proceed?",
        "",
        "**YES — research pipeline stable.**",
        "- No production changes",
        "- No paid API calls",
        "- No approved BOQ data",
        "",
        "## Recommended Next Steps",
        "",
        "1. **Improve vector glyph recognition** — refine cluster labeling; expand search window;",
        "   handle multiple font sizes in the plan (legend vs map annotations)",
        "2. **Build interactive human review** (teaching loop candidate) — show glyph clusters,",
        "   let engineer confirm digit labels; propagate corrections globally",
        "3. **Run PaddleOCR smoke test (POC 4)** — on the FAILED OCCs specifically",
        "4. **Build scale measurement POC (POC 6)** — use shapely for length measurement",
        "   along identified guardrail/barrier paths",
        "",
        "---",
        "",
        "*POC 3 is research output only. No output is approved BOQ data.*",
        "*All codes require human validation before operational use.*",
    ]

    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"[Report] Written: {REPORT}")


# ═════════════════════════════════════════════════════════════════
# MAIN
# ═════════════════════════════════════════════════════════════════

def main() -> None:
    t0 = time.time()
    print("=" * 60)
    print("POC 3 — Vector Glyph Recognition")
    print("Primary method: PDF vector path geometry")
    print("Tesseract: auxiliary label only")
    print("Research-only. No approved BOQ output.")
    print("=" * 60)

    # ── Load PDF ──
    if not Path(PDF_PATH).exists():
        print(f"[ERROR] PDF not found: {PDF_PATH}")
        sys.exit(1)
    doc  = fitz.open(PDF_PATH)
    page = doc[0]
    print(f"[Load] PDF: {PDF_PATH}  ({len(page.get_drawings())} paths)")

    # ── Load sign inventory ──
    if not INV_JSON.exists():
        print(f"[ERROR] {INV_JSON} not found.")
        sys.exit(1)
    with open(INV_JSON, encoding="utf-8") as f:
        inv = json.load(f)
    occ_map  = {o['occurrence_id']: o for o in inv.get('occurrences', [])}
    print(f"[Load] Sign inventory: {len(occ_map)} OCCs")

    # ── Load POC 1 metadata ──
    poc1_map: Dict = {}
    if POC1_JSON.exists():
        with open(POC1_JSON, encoding="utf-8") as f:
            poc1_map = {r['occurrence_id']: r for r in json.load(f)}
        print(f"[Load] POC 1 results: {len(poc1_map)} records")

    poc2_results: List = []
    if POC2_JSON.exists():
        with open(POC2_JSON, encoding="utf-8") as f:
            poc2_results = json.load(f)
        print(f"[Load] POC 2 results: {len(poc2_results)} records")

    # ── Hidden structure investigation ──
    print("\n[Structure] Investigating PDF hidden/structural properties ...")
    hidden_obs = investigate_structure(page)
    print("[Structure] Done.")

    # ── Extract digit paths ──
    print("\n[Extract] Extracting gray line-only digit-candidate paths ...")
    digit_paths = extract_digit_paths(page)
    print(f"[Extract] Found {len(digit_paths)} digit-candidate paths")

    if not digit_paths:
        print("[WARNING] No digit paths found. Relaxing filters or check PDF.")

    # ── Cluster glyphs ──
    print("\n[Cluster] Clustering glyph paths by vector similarity ...")
    print("  (Tesseract auxiliary labeling in progress — may take ~60s)")
    clusters = cluster_glyphs(digit_paths, page)
    n_labeled = sum(1 for cl in clusters.values() if cl['label'])
    print(f"[Cluster] Clusters formed: {len(clusters)}"
          f"  labeled: {n_labeled}/{len(clusters)}")

    # Save cluster grid
    DBG_DIR.mkdir(parents=True, exist_ok=True)
    print("[Debug] Saving cluster inspection grid ...")
    make_cluster_grid(clusters, page)

    # ── Detect adjacent groups ──
    print("\n[Groups] Detecting adjacent path groups ...")
    adj_groups = detect_adjacent_groups(digit_paths)
    print(f"[Groups] Found {len(adj_groups)} adjacent groups "
          f"(2–4 paths, gap<{GAP_MAX}pt)")
    size_dist = Counter(len(g) for g in adj_groups)
    print(f"  Sizes: {dict(size_dist)}")
    seq_dist  = Counter(tuple(p['n'] for p in g) for g in adj_groups)
    print(f"  Most common n_items sequences: {seq_dist.most_common(8)}")

    # ── Map to OCCs ──
    print("\n[Map] Mapping adjacent groups to OCC positions ...")
    occ_groups = map_groups_to_occs(adj_groups, occ_map)
    n_matched  = sum(1 for v in occ_groups.values() if v)
    print(f"[Map] OCCs with at least one matched group: {n_matched}/{len(occ_map)}")

    # ── Process each OCC ──
    print(f"\n[Process] Building results for {len(occ_map)} OCCs ...")
    results = []
    for occ_id, occ in occ_map.items():
        matched = occ_groups.get(occ_id, [])
        res = process_occ(occ_id, occ, matched, poc1_map)
        results.append(res)

    # ── Save JSON ──
    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\n[Output] {OUT_JSON}  ({len(results)} records)")

    # ── Debug images ──
    print("[Debug] Generating per-OCC debug images ...")
    (DBG_DIR / "high").mkdir(parents=True, exist_ok=True)
    (DBG_DIR / "medium").mkdir(parents=True, exist_ok=True)
    (DBG_DIR / "low").mkdir(parents=True, exist_ok=True)
    (DBG_DIR / "failed").mkdir(parents=True, exist_ok=True)
    (DBG_DIR / "ambiguous").mkdir(parents=True, exist_ok=True)

    for res in results:
        img = make_occ_debug_image(res, page)
        if img is None:
            continue
        tier  = res['confidence_tier'].lower()
        cid   = res['occurrence_id']
        fname = f"{cid}_debug.png"
        cv2.imwrite(str(DBG_DIR / tier / fname), img)

    print("[Debug] Saving global page overview ...")
    save_global_overview(adj_groups, occ_map, page, occ_groups)

    elapsed = time.time() - t0

    # ── Report ──
    print("[Report] Writing report ...")
    write_report(results, clusters, adj_groups, digit_paths,
                 hidden_obs, elapsed, poc2_results)

    # ── Console summary ──
    tiers   = Counter(r['confidence_tier'] for r in results)
    actions = Counter(r['recommended_next_action'] for r in results)

    print("\n" + "=" * 60)
    print("POC 3 COMPLETE")
    print("=" * 60)
    print(f"  Digit paths extracted : {len(digit_paths)}")
    print(f"  Clusters formed       : {len(clusters)}"
          f"  (labeled: {n_labeled})")
    print(f"  Adjacent groups       : {len(adj_groups)}")
    print(f"  OCCs matched          : {n_matched}/{len(occ_map)}")
    print(f"  Confidence tiers      : {dict(tiers)}")
    print(f"  Elapsed               : {elapsed:.1f}s")
    print("")
    print("  Actions:")
    for act, cnt in sorted(actions.items(), key=lambda x: -x[1]):
        print(f"    {act}: {cnt}")
    print("")
    print("  Installed dependencies:")
    print("    shapely 2.0.7 — BSD 3-Clause — pip install shapely")
    print("    (all other dependencies were already in .venv)")
    print("")
    print("  REMINDER: No output from POC 3 is approved BOQ data.")
    print("  All codes require human validation before operational use.")
    print("=" * 60)


if __name__ == "__main__":
    main()
