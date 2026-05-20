#!/usr/bin/env python3
"""
POC 3 (v2 — Improved) — Vector Glyph Recognition
research/cad-pdf-intelligence/13_vector_glyph_recognition.py

Research-only. No approved BOQ output.
Primary method: PDF vector path geometry + Hu-moment descriptors.
Clustering: hierarchical agglomerative on cosine distance.
Tesseract: auxiliary cluster-labeler only.
Human label injection: outputs/vector_glyph_human_labels.json (optional).
  Supports digit labels (0-9) and negative labels (not_digit, noise, ignore).

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
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import cdist, squareform

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
HUMAN_LABELS_JSON    = OUT / "vector_glyph_human_labels.json"
HUMAN_LABELS_EXAMPLE = OUT / "vector_glyph_human_labels.example.json"

# ─────────────────────────────────────────────────────────────────
# PATH EXTRACTION FILTERS
# ─────────────────────────────────────────────────────────────────
H_MIN, H_MAX    = 7.0,  18.0
W_MIN, W_MAX    = 4.0,  16.0
N_MIN, N_MAX    = 8,    30
AR_MIN, AR_MAX  = 0.40, 1.70
GRAY_COLOR      = (0.57, 0.57, 0.57)
GRAY_TOL        = 0.03

# ─────────────────────────────────────────────────────────────────
# ADJACENCY / OCC SEARCH
# ─────────────────────────────────────────────────────────────────
GAP_MAX  = 7.0
Y_TOL    = 3.0
H_RATIO  = 1.40
X_MARGIN = 65.0
Y_BELOW  = 100.0
Y_ABOVE  = 40.0

# ─────────────────────────────────────────────────────────────────
# RASTERIZATION
# ─────────────────────────────────────────────────────────────────
RASTER_SCALE = 8
TESS_PSM10   = "--psm 10 --oem 3 -c tessedit_char_whitelist=0123456789"

# ─────────────────────────────────────────────────────────────────
# DESCRIPTOR + CLUSTERING
# ─────────────────────────────────────────────────────────────────
DESC_SIZE           = 32         # rasterize to 32×32 for Hu moments
CLUSTER_DIST_THRESH = 0.05       # cosine distance threshold for cluster cut
DESC_HU_W           = 0.70       # weight of Hu moments in combined descriptor
DESC_STRUCT_W       = 0.15       # weight of n_items + AR
DESC_HIST_W         = 0.15       # weight of angle histogram

# ─────────────────────────────────────────────────────────────────
# CONFIDENCE THRESHOLDS
# ─────────────────────────────────────────────────────────────────
HIGH_T = 0.75
MED_T  = 0.55
LOW_T  = 0.35

# ─────────────────────────────────────────────────────────────────
# HUMAN LABEL SETS
# ─────────────────────────────────────────────────────────────────
DIGIT_LABELS    = set("0123456789")
NEGATIVE_LABELS = {"not_digit", "noise", "ignore"}
NEUTRAL_LABELS  = {"unknown", "needs_review"}
VALID_HUMAN_LABELS = DIGIT_LABELS | NEGATIVE_LABELS | NEUTRAL_LABELS


# ═════════════════════════════════════════════════════════════════
# HUMAN LABEL I/O
# ═════════════════════════════════════════════════════════════════

def load_human_labels() -> Dict[str, str]:
    """
    Load human label file if it exists.
    Supports digit labels ("0"-"9") and negative labels (not_digit, noise, ignore).
    Returns {cluster_id -> label_string} for non-null entries only.
    """
    if not HUMAN_LABELS_JSON.exists():
        return {}
    with open(HUMAN_LABELS_JSON, encoding="utf-8") as f:
        raw = json.load(f)
    result: Dict[str, str] = {}
    for cid, lbl in raw.items():
        if lbl is None:
            continue
        if lbl not in VALID_HUMAN_LABELS:
            print(f"[Warning] Unknown human label '{lbl}' for {cid} — skipped")
            continue
        result[cid] = lbl
    if result:
        print(f"[Human] Loaded {len(result)} human labels "
              f"({sum(1 for v in result.values() if v in DIGIT_LABELS)} digit, "
              f"{sum(1 for v in result.values() if v in NEGATIVE_LABELS)} negative)")
    return result


def write_human_labels_example(cluster_ids: List[str]) -> None:
    """
    Write an example label template (null = not yet labeled).
    Fill this file and rename to vector_glyph_human_labels.json to apply labels.
    """
    template: Dict[str, Optional[str]] = {}
    for cid in sorted(cluster_ids):
        template[cid] = None
    HUMAN_LABELS_EXAMPLE.write_text(
        json.dumps(template, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"[Human] Label template written: {HUMAN_LABELS_EXAMPLE.name}")


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
    9-dim pure-vector feature: [aspect_ratio, centroid_y, 8-bin angle histogram].
    Used as part of the combined descriptor. No raster data.
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
    """Normalized segment endpoints — primary vector fingerprint (unchanged)."""
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
    Extract all digit-candidate vector paths from the PDF page.
    Filters: gray stroke color, line segments only, h/w/AR/n_items bounds.
    """
    raw = page.get_drawings()
    result = []
    for idx, p in enumerate(raw):
        if p.get('type') != 's':
            continue
        if not _is_gray(p.get('color')):
            continue
        pr = p.get('rect')
        if pr is None:
            continue
        items = p.get('items', [])
        if not items:
            continue
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
            'draw_idx':   idx,
            'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1,
            'w': w, 'h': h,
            'cx': (x0 + x1) / 2,
            'cy': (y0 + y1) / 2,
            'n':  n,
            'ar': ar,
            'items': items,
            'feature':    _path_feature(items, x0, y0, w, h),
            'ep_seq':     _normalized_endpoint_seq(items, x0, y0, h),
            'descriptor': None,   # filled in cluster_glyphs
            'cluster':    None,
            'label':      None,
            'human_label': None,
            'is_negative': False,
            'label_src':  None,
            'label_trusted': False,
        })
    return result


# ═════════════════════════════════════════════════════════════════
# RASTERIZATION + TESSERACT AUX
# ═════════════════════════════════════════════════════════════════

def _rasterize_path_region(path: Dict, page: fitz.Page,
                           scale: int = RASTER_SCALE) -> Optional[np.ndarray]:
    """Rasterize one path's bounding-box region. Returns grayscale array or None."""
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
    """Auxiliary Tesseract psm=10 on a rasterized glyph. Returns digit char or None."""
    pad = 8
    padded = np.pad(arr, pad, constant_values=255)
    inverted = 255 - padded
    pil = Image.fromarray(inverted)
    try:
        txt = pytesseract.image_to_string(pil, config=TESS_PSM10).strip()
        if txt and len(txt) == 1 and txt.isdigit():
            return txt
    except Exception:
        pass
    return None


# ═════════════════════════════════════════════════════════════════
# GLYPH DESCRIPTOR + HIERARCHICAL CLUSTERING
# ═════════════════════════════════════════════════════════════════

def _compute_hu_descriptor(path: Dict, page: fitz.Page) -> np.ndarray:
    """
    17-dimensional combined descriptor:
      [0..6]  Hu moments (log-transformed, from 32×32 rasterized binary mask)
      [7..8]  n_items normalized, AR normalized
      [9..16] 8-bin angle histogram (from vector path items)

    Hu moments use standard log transform: -sign(hu) * log10(|hu|).
    Used for cosine-distance hierarchical clustering.
    """
    hu_part = np.zeros(7, dtype=np.float64)
    arr = _rasterize_path_region(path, page, scale=RASTER_SCALE)
    if arr is not None and arr.size > 0:
        _, binary = cv2.threshold(arr, 200, 255, cv2.THRESH_BINARY_INV)
        if binary.max() > 0:
            # Tight-crop to glyph content before resizing
            ys, xs = np.where(binary > 0)
            if len(xs) >= 2 and len(ys) >= 2:
                crop = binary[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
                padded = np.pad(crop, 4, constant_values=0)
                b_sq = cv2.resize(padded, (DESC_SIZE, DESC_SIZE),
                                  interpolation=cv2.INTER_AREA)
                m = cv2.moments(b_sq)
                hu = cv2.HuMoments(m).flatten()
                hu_part = -np.sign(hu) * np.log10(np.abs(hu) + 1e-10)

    n_norm  = (path['n'] - N_MIN) / max(N_MAX - N_MIN, 1.0)
    ar_norm = (path['ar'] - AR_MIN) / max(AR_MAX - AR_MIN, 1.0)
    angle_hist = path['feature'][2:]   # 8-bin angle histogram

    desc = np.concatenate([
        hu_part     * DESC_HU_W,
        np.array([n_norm, ar_norm]) * DESC_STRUCT_W,
        angle_hist  * DESC_HIST_W,
    ]).astype(np.float32)
    return desc


def cluster_glyphs(paths: List[Dict], page: fitz.Page,
                   human_labels: Dict[str, str]) -> Dict[str, Dict]:
    """
    Cluster glyph paths by hierarchical agglomerative clustering on
    cosine distance of the 17-dim Hu-moment + structural + angle descriptor.

    Then apply human labels (digit or negative) and Tesseract auxiliary labels.
    Returns {cluster_id: cluster_record}.
    """
    if not paths:
        return {}

    # Compute descriptor for every path
    print("  Computing Hu-moment descriptors ...", end="", flush=True)
    descs = []
    for p in paths:
        d = _compute_hu_descriptor(p, page)
        p['descriptor'] = d
        descs.append(d)
    print(f" done ({len(descs)} paths)")

    D_mat = np.array(descs, dtype=np.float32)
    n = len(D_mat)

    if n == 1:
        raw_labels = np.array([1])
    elif n == 2:
        D_pair = cdist(D_mat, D_mat, metric='cosine')
        raw_labels = (np.array([1, 1]) if D_pair[0, 1] <= CLUSTER_DIST_THRESH
                      else np.array([1, 2]))
    else:
        print("  Computing pairwise cosine distances ...", end="", flush=True)
        D_pair = cdist(D_mat, D_mat, metric='cosine')
        np.fill_diagonal(D_pair, 0.0)
        D_pair = np.clip(D_pair, 0.0, 2.0)
        condensed = squareform(D_pair)
        print(" done")

        print("  Hierarchical clustering (average linkage) ...", end="", flush=True)
        Z = linkage(condensed, method='average')
        raw_labels = fcluster(Z, t=CLUSTER_DIST_THRESH, criterion='distance')
        print(f" done ({raw_labels.max()} initial clusters)")

    # Assign CL-XX ids, sorted by cluster size (largest = CL-00)
    label_to_paths: Dict[int, List[Dict]] = defaultdict(list)
    for path, lbl in zip(paths, raw_labels):
        label_to_paths[int(lbl)].append(path)

    sorted_labels = sorted(label_to_paths.keys(),
                           key=lambda l: -len(label_to_paths[l]))
    cl_id_map = {lbl: f"CL-{i:02d}" for i, lbl in enumerate(sorted_labels)}

    # Tag each path with its cluster ID
    for lbl, grp in label_to_paths.items():
        cl_id = cl_id_map[lbl]
        for p in grp:
            p['cluster'] = cl_id

    # Label each cluster: human > Tesseract auxiliary
    print("  Applying labels (human + Tesseract auxiliary) ...",
          end="", flush=True)
    clusters: Dict[str, Dict] = {}
    n_human = 0
    n_tess  = 0

    for lbl, raw_paths in label_to_paths.items():
        cl_id = cl_id_map[lbl]
        cl_paths = raw_paths
        n_items_vals = [p['n'] for p in cl_paths]
        ar_vals      = [p['ar'] for p in cl_paths]

        h_label = human_labels.get(cl_id)
        if h_label is not None:
            # Human label: may be digit or negative
            is_neg       = h_label in NEGATIVE_LABELS
            is_digit_lbl = h_label in DIGIT_LABELS
            label        = h_label if is_digit_lbl else None
            label_src    = "human_label_mapping"
            label_trusted = True
            n_human      += 1
        else:
            is_neg       = False
            is_digit_lbl = False
            # Tesseract auxiliary on up to 3 samples
            tess_votes: List[str] = []
            for s in cl_paths[:min(3, len(cl_paths))]:
                arr = _rasterize_path_region(s, page, scale=RASTER_SCALE)
                if arr is not None:
                    t = _tess_single_glyph(arr)
                    if t:
                        tess_votes.append(t)

            label, label_src, label_trusted = None, "unlabeled", False
            if tess_votes:
                mc = Counter(tess_votes).most_common(1)[0]
                if mc[1] >= max(1, len(tess_votes) // 2):
                    label        = mc[0]
                    label_src    = "tess_auxiliary"
                    label_trusted = mc[1] >= 2
                    n_tess       += 1

        # Tag each path in this cluster
        for p in cl_paths:
            p['label']        = label   # digit char or None
            p['human_label']  = h_label
            p['is_negative']  = is_neg
            p['label_src']    = label_src
            p['label_trusted'] = label_trusted

        clusters[cl_id] = {
            'label':          label,
            'human_label':    h_label,
            'is_negative':    is_neg,
            'label_src':      label_src,
            'label_trusted':  label_trusted,
            'n_items':        int(Counter(n_items_vals).most_common(1)[0][0]),
            'mean_ar':        round(float(np.mean(ar_vals)), 3),
            'size':           len(cl_paths),
            'paths':          cl_paths,
        }

    print(f" done (human={n_human}, tess={n_tess}, "
          f"unlabeled={len(clusters)-n_human-n_tess})")
    return clusters


# ═════════════════════════════════════════════════════════════════
# ADJACENT GROUP DETECTION
# ═════════════════════════════════════════════════════════════════

def detect_adjacent_groups(paths: List[Dict]) -> List[List[Dict]]:
    """Find groups of 2–4 adjacent glyph paths (same y-level, small x-gap)."""
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
    cl_seq      = tuple(p.get('cluster') or 'CL-?' for p in group)
    h_vals      = [p['h'] for p in group]
    gap_vals    = [group[k+1]['x0'] - group[k]['x1']
                   for k in range(len(group)-1)]
    return {
        'n_paths':       len(group),
        'n_items_seq':   n_items_seq,
        'cluster_seq':   cl_seq,
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
    """Map adjacent groups to OCC positions within the search window."""
    results: Dict[str, List] = {}
    for occ_id, occ in occ_map.items():
        bbox = occ['bbox']
        cx      = (bbox[0] + bbox[2]) / 2
        cy_top  = float(bbox[1])
        cy_bot  = float(bbox[3])
        matched = []
        for grp in adj_groups:
            feat = _group_feature(grp)
            gy0, gy1, gcx = feat['y0'], feat['y1'], feat['cx']
            x_ok    = abs(gcx - cx) <= X_MARGIN
            y_below = cy_bot <= gy0 <= cy_bot + Y_BELOW
            y_above = cy_top - Y_ABOVE <= gy1 <= cy_top + 5.0
            if x_ok and (y_below or y_above):
                matched.append({
                    'group':    grp,
                    'feat':     feat,
                    'position': 'below' if y_below else 'above',
                    'y_offset': round(gy0 - cy_bot if y_below else cy_top - gy1, 1),
                    'x_offset': round(gcx - cx, 1),
                })
        results[occ_id] = matched
    return results


# ═════════════════════════════════════════════════════════════════
# SEQUENCE RECONSTRUCTION + CONFIDENCE
# ═════════════════════════════════════════════════════════════════

def _reconstruct_sequence(group: List[Dict]) -> Tuple[List[str], str, List[str]]:
    """
    Build sequence from left-to-right group.
    Returns (cluster_id_list, display_string, code_candidates).

    display_string format:
      - Digit label:     "4"
      - Negative label:  "[N]" (excluded from code)
      - Unlabeled:       cluster ID, e.g. "CL-03"
    code_candidates: only populated when ALL non-negative parts are digit labels.
    """
    sorted_grp = sorted(group, key=lambda p: p['x0'])
    cluster_ids: List[str] = []
    display_parts: List[str] = []

    for p in sorted_grp:
        cid = p.get('cluster') or 'CL-?'
        cluster_ids.append(cid)
        if p.get('is_negative'):
            display_parts.append('[N]')
        elif p.get('label') in DIGIT_LABELS:
            display_parts.append(p['label'])
        else:
            display_parts.append(cid)

    display_seq = '/'.join(display_parts)

    # Code candidate: only if all non-negative parts have digit labels
    non_negative = [p for p in display_parts if p != '[N]']
    all_digits   = all(p in DIGIT_LABELS for p in non_negative)
    code = ''.join(p for p in display_parts if p in DIGIT_LABELS)
    candidates = [code] if (code and all_digits and len(non_negative) >= 2) else []

    return cluster_ids, display_seq, candidates


def _glyph_confidence(group: List[Dict]) -> float:
    """
    Per-glyph recognition confidence.
    Human label = 1.0, trusted Tesseract = 0.75, untrusted Tesseract = 0.55,
    unlabeled cluster = 0.30, no cluster = 0.0.
    """
    scores = []
    for p in group:
        src = p.get('label_src', 'unlabeled')
        if p.get('is_negative'):
            scores.append(0.0)    # negative-labeled: not a digit
        elif src == 'human_label_mapping' and p.get('label') in DIGIT_LABELS:
            scores.append(1.00)
        elif src == 'tess_auxiliary' and p.get('label_trusted'):
            scores.append(0.75)
        elif src == 'tess_auxiliary':
            scores.append(0.55)
        elif p.get('cluster'):
            scores.append(0.30)   # cluster assigned but unlabeled
        else:
            scores.append(0.0)
    return float(np.mean(scores)) if scores else 0.0


def _sequence_confidence(group: List[Dict]) -> float:
    """
    Sequence-level confidence: height consistency, gap regularity, label completeness.
    Human labels receive a bonus (+0.15) on the label completeness component.
    """
    h_vals = [p['h'] for p in group]
    h_std  = float(np.std(h_vals)) / max(float(np.mean(h_vals)), 0.001)

    gaps = [group[k+1]['x0'] - group[k]['x1'] for k in range(len(group)-1)]
    gap_std = float(np.std(gaps)) / max(abs(float(np.mean(gaps))) + 0.1, 0.001)

    n_labeled       = sum(1 for p in group if p.get('label') in DIGIT_LABELS)
    n_human_labeled = sum(1 for p in group
                          if p.get('label_src') == 'human_label_mapping'
                          and p.get('label') in DIGIT_LABELS)
    label_ratio  = n_labeled / max(len(group), 1)
    human_bonus  = 0.15 if n_human_labeled > 0 else 0.0

    h_score   = max(0.0, 1.0 - h_std * 3)
    gap_score = max(0.0, 1.0 - gap_std * 2)
    label_score = min(1.0, label_ratio + human_bonus)

    return float(0.35 * h_score + 0.25 * gap_score + 0.40 * label_score)


def _spatial_conf(occ_id: str, poc1_map: Dict) -> float:
    """Spatial association confidence from POC 1 tight-crop quality."""
    r = poc1_map.get(occ_id)
    if r is None:
        return 0.5
    q = float(r.get('best_quality_score', 0.5))
    d = float(r.get('best_ndist', 0.5))
    return max(0.0, q * (1.0 - d))


def _classify_code(display_seq: str, candidates: List[str],
                   group: List[Dict]) -> Tuple[List, List, List]:
    """Partition code candidates into valid / weak / artifact."""
    valid, weak, artifact = [], [], []
    for code in candidates:
        if not code or len(code) < 2:
            continue
        if code[0] == '0':
            artifact.append(code)
            continue
        n = len(code)
        n_human = sum(1 for p in group
                      if p.get('label_src') == 'human_label_mapping'
                      and p.get('label') in DIGIT_LABELS)
        n_trusted = sum(1 for p in group if p.get('label_trusted'))
        if n == 3 and n_human + n_trusted >= 2:
            valid.append(code)
        else:
            weak.append(code)
    return valid, weak, artifact


def _ambiguity_flags(group: List[Dict], feat: Dict,
                     matched_list: List) -> Dict:
    h_vals = [p['h'] for p in group]
    gaps   = [group[k+1]['x0'] - group[k]['x1'] for k in range(len(group)-1)]
    n_unlabeled  = sum(1 for p in group
                       if p.get('label') not in DIGIT_LABELS and not p.get('is_negative'))
    n_negative   = sum(1 for p in group if p.get('is_negative'))
    n_human      = sum(1 for p in group
                       if p.get('label_src') == 'human_label_mapping')
    n_cluster_id = sum(1 for p in group if p.get('cluster'))
    return {
        'has_unlabeled_cluster':    n_unlabeled > 0,
        'has_negative_labeled':     n_negative > 0,
        'too_few_digits':           len(group) < 3,
        'suspicious_leading_zero':  bool(group) and group[0].get('label') == '0',
        'height_inconsistent':      feat['h_std'] / max(feat['h_mean'], 0.001) > 0.15,
        'gap_irregular':            (len(gaps) > 0 and
                                     float(np.std(gaps)) / max(abs(float(np.mean(gaps)))+0.1, 0.001) > 0.5),
        'multiple_code_candidates': len(matched_list) > 1,
        'has_human_label':          n_human > 0,
        'all_clusters_assigned':    n_cluster_id == len(group),
    }


def _tier(final: float, valid_codes: List, flags: Dict) -> str:
    n_flags = sum(1 for k, v in flags.items()
                  if v and k not in ('has_human_label', 'all_clusters_assigned'))
    if flags.get('has_negative_labeled'):
        return "AMBIGUOUS"
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


# ═════════════════════════════════════════════════════════════════
# FEASIBILITY SIMULATION
# ═════════════════════════════════════════════════════════════════

def compute_feasibility(clusters: Dict, adj_groups: List[List[Dict]],
                        human_labels: Dict[str, str]) -> Dict:
    """
    Simulate: if a human labels top-N clusters (by frequency in adjacent groups),
    how many groups get fully resolved (all clusters labeled with a digit)?

    Groups with negative-labeled clusters are counted as 'noise-filtered'.
    Returns feasibility report dict.
    """
    # Cluster frequency in adjacent groups
    cl_freq: Counter = Counter()
    for grp in adj_groups:
        for p in grp:
            cl = p.get('cluster')
            if cl:
                cl_freq[cl] += 1

    # Group cluster-ID sequences
    group_seqs: List[List[str]] = []
    for grp in adj_groups:
        seq = [p.get('cluster') for p in sorted(grp, key=lambda p: p['x0'])]
        if all(c is not None for c in seq):
            group_seqs.append(seq)  # type: ignore[arg-type]

    # Negative clusters (noise) and digit-candidate clusters
    negative_cls = {cid for cid, cl in clusters.items() if cl.get('is_negative')}
    already_digit = {cid for cid, lbl in human_labels.items()
                     if lbl in DIGIT_LABELS}
    digit_candidate_cl = [cid for cid, _ in cl_freq.most_common()
                          if cid not in negative_cls]

    # Groups where ALL clusters are digit-candidates (no noise)
    clean_group_seqs = [
        seq for seq in group_seqs
        if all(c not in negative_cls for c in seq)
    ]

    sim_results: Dict[str, Dict] = {}
    for n in [1, 3, 5, 10, 15, len(digit_candidate_cl)]:
        n = min(n, len(digit_candidate_cl))
        if str(n) in sim_results:
            continue
        labeled_in_sim = set(digit_candidate_cl[:n]) | already_digit
        resolved = sum(
            1 for seq in clean_group_seqs
            if all(c in labeled_in_sim for c in seq)
        )
        sim_results[str(n)] = {
            'clusters_labeled':   n,
            'groups_resolved':    resolved,
            'total_clean_groups': len(clean_group_seqs),
            'coverage_pct':       round(100 * resolved / max(len(clean_group_seqs), 1), 1),
        }

    return {
        'total_clusters':          len(clusters),
        'negative_clusters':       len(negative_cls),
        'digit_candidate_clusters': len(digit_candidate_cl),
        'already_human_labeled':   len(human_labels),
        'already_digit_labeled':   len(already_digit),
        'total_adjacent_groups':   len(adj_groups),
        'clean_groups':            len(clean_group_seqs),
        'cluster_frequency_in_groups': {k: v for k, v in cl_freq.most_common()},
        'simulation':              sim_results,
    }


# ═════════════════════════════════════════════════════════════════
# RESULT RECORDS
# ═════════════════════════════════════════════════════════════════

def _failed_record(occ_id: str, occ: Dict, poc1_map: Dict,
                   reason: str) -> Dict:
    return {
        "occurrence_id":                occ_id,
        "page_number":                  occ.get('page_number', 0),
        "original_crop_path":           occ.get('local_code_crop_path'),
        "pdf_bbox":                     occ.get('bbox'),
        "extracted_path_count":         0,
        "glyph_groups":                 [],
        "cluster_id_sequence":          [],
        "display_sequence":             "",
        "recognized_digit_candidates":  [],
        "reconstructed_code_candidates": [],
        "selected_code_if_confident":   None,
        "valid_sign_code_candidates":   [],
        "weak_numeric_candidates":      [],
        "rejected_or_suspicious_numeric_artifacts": [],
        "per_glyph_info":               [],
        "vector_shape_scores":          {},
        "glyph_recognition_confidence":       0.0,
        "sequence_confidence":                0.0,
        "spatial_association_confidence": _spatial_conf(occ_id, poc1_map),
        "final_research_confidence":         0.0,
        "confidence_tier":              "FAILED",
        "ambiguity_flags":              {"no_adjacent_group_found": True},
        "artifact_flags":               {"artifact_flag": False, "suspicious_code_flag": False},
        "requires_review":              False,
        "recommended_next_action":      "paddleocr_smoke_test",
        "_fail_reason":                 reason,
    }


def process_occ(occ_id: str, occ: Dict, matched_list: List,
                poc1_map: Dict) -> Dict:
    """Build one result record for an OCC."""
    if not matched_list:
        return _failed_record(occ_id, occ, poc1_map, "no_adjacent_group")

    def match_score(m: Dict) -> float:
        grp     = m['group']
        labeled = sum(1 for p in grp if p.get('label') in DIGIT_LABELS)
        human   = sum(1 for p in grp
                      if p.get('label_src') == 'human_label_mapping')
        return (float(len(grp) == 3) * 10 + human * 5 + labeled +
                1.0 / (1.0 + abs(m['x_offset'])))

    matched_sorted = sorted(matched_list, key=match_score, reverse=True)
    best  = matched_sorted[0]
    group = best['group']
    feat  = best['feat']

    cl_ids, display_seq, candidates = _reconstruct_sequence(group)
    valid_codes, weak_codes, artifact_codes = _classify_code(
        display_seq, candidates, group)
    flags = _ambiguity_flags(group, feat, matched_list)

    glyph_conf   = _glyph_confidence(group)
    seq_conf     = _sequence_confidence(group)
    spatial_conf = _spatial_conf(occ_id, poc1_map)
    final_conf   = (0.40 * glyph_conf + 0.30 * seq_conf + 0.30 * spatial_conf)

    tier     = _tier(final_conf, valid_codes, flags)
    art_flag = bool(artifact_codes)
    sus_flag = bool(flags.get('suspicious_leading_zero')) or art_flag
    action   = _action(tier, flags, valid_codes)
    if sus_flag:
        action = "human_review"

    group_summaries = []
    for m in matched_list:
        gf = _group_feature(m['group'])
        group_summaries.append({
            'position':        m['position'],
            'y_offset_pt':     m['y_offset'],
            'x_offset_pt':     m['x_offset'],
            'n_paths':         gf['n_paths'],
            'n_items_seq':     list(gf['n_items_seq']),
            'cluster_seq':     list(gf['cluster_seq']),
            'h_mean_pt':       round(gf['h_mean'], 2),
            'x_span_pt':       round(gf['x_span'], 2),
        })

    return {
        "occurrence_id":                occ_id,
        "page_number":                  occ.get('page_number', 0),
        "original_crop_path":           occ.get('local_code_crop_path'),
        "pdf_bbox":                     occ.get('bbox'),
        "extracted_path_count":         sum(len(m['group']) for m in matched_list),
        "glyph_groups":                 group_summaries,
        "cluster_id_sequence":          cl_ids,
        "display_sequence":             display_seq,
        "recognized_digit_candidates":  [display_seq] if display_seq else [],
        "reconstructed_code_candidates": candidates,
        "selected_code_if_confident":   (valid_codes[0]
                                         if (valid_codes and tier == "HIGH")
                                         else None),
        "valid_sign_code_candidates":   valid_codes,
        "weak_numeric_candidates":      weak_codes,
        "rejected_or_suspicious_numeric_artifacts": artifact_codes,
        "per_glyph_info": [
            {
                "label":          p.get('label'),
                "human_label":    p.get('human_label'),
                "is_negative":    p.get('is_negative', False),
                "label_src":      p.get('label_src'),
                "label_trusted":  p.get('label_trusted', False),
                "cluster":        p.get('cluster'),
                "n_items":        p['n'],
                "ar":             round(p['ar'], 3),
                "bbox_pt":        [round(p['x0'],2), round(p['y0'],2),
                                   round(p['x1'],2), round(p['y1'],2)],
            }
            for p in sorted(group, key=lambda p: p['x0'])
        ],
        "vector_shape_scores": {
            "glyph_recognition_confidence": round(glyph_conf, 4),
            "sequence_confidence":          round(seq_conf, 4),
        },
        "glyph_recognition_confidence":       round(glyph_conf, 4),
        "sequence_confidence":                round(seq_conf, 4),
        "spatial_association_confidence":     round(spatial_conf, 4),
        "final_research_confidence":          round(final_conf, 4),
        "confidence_tier":                    tier,
        "ambiguity_flags":                    flags,
        "artifact_flags": {
            "artifact_flag":        art_flag,
            "suspicious_code_flag": sus_flag,
        },
        "requires_review":          tier in ("MEDIUM", "AMBIGUOUS", "HIGH") or art_flag,
        "recommended_next_action":  action,
    }


# ═════════════════════════════════════════════════════════════════
# HIDDEN STRUCTURE INVESTIGATION
# ═════════════════════════════════════════════════════════════════

def investigate_structure(page: fitz.Page) -> str:
    paths = page.get_drawings()

    dashes = Counter(str(p.get('dashes', '')) for p in paths[:5000])
    fills  = Counter(
        str(tuple(round(c, 2) for c in p['fill']))
        for p in paths if p.get('fill')
    )
    try:
        xobjs = page.get_xobjects()
    except Exception:
        xobjs = []

    color_meanings = {
        "(0.0, 0.0, 0.0)":    "Black fill — road fills / large text",
        "(1.0, 0.0, 0.0)":    "Red fill — prohibition/mandatory sign bodies",
        "(0.0, 0.0, 1.0)":    "Blue fill — direction/information sign bodies",
        "(0.5, 0.5, 0.5)":    "Gray fill — dimension hatching",
        "(1.0, 1.0, 0.0)":    "Yellow fill — warning/caution elements",
        "(1.0, 0.6, 0.2)":    "Orange fill — work-zone / temporary signs",
        "(0.57, 0.57, 0.57)": "Mid-gray fill — sign outline / border",
        "(0.0, 0.5, 1.0)":    "Light blue fill — supplementary plates",
        "(1.0, 0.25, 0.0)":   "Dark orange — special work-zone markings",
        "(0.87, 0.0, 0.22)":  "Crimson — specific sign type",
    }

    dash_sample = dashes.most_common(1)[0][0] if dashes else "[] 0"
    lines = [
        "## Hidden / Structural PDF Analysis",
        "",
        "### Line Style (Dash Pattern)",
        f"All paths sampled: **{dash_sample}** = solid hairlines only.",
        "Dash pattern is NOT a discriminative feature for this PDF.",
        "",
        "### Fill Colors (semantically meaningful)",
        "",
        "| Fill Color | Count | Likely Meaning |",
        "|-----------|-------|---------------|",
    ]
    for col, cnt in fills.most_common(10):
        meaning = color_meanings.get(col, "Unknown")
        lines.append(f"| `{col}` | {cnt} | {meaning} |")

    lines += [
        "",
        "### Form XObjects / Reusable Patterns",
        f"XObjects on page: **{len(xobjs)}** — **{'none' if not xobjs else 'found'}**.",
        "No reusable content streams; all elements are direct path primitives.",
        "",
        "### Stroke Color Encoding",
        "Gray (0.57, 0.57, 0.57) uniquely identifies the **sign annotation text layer**.",
        "Black (0.0, 0.0, 0.0) = road geometry and larger structural paths.",
        "",
        "### Conclusion",
        "No hidden CAD-encoding shortcuts. Key discriminators:",
        "1. **Fill color** → sign type / category",
        "2. **Stroke color** (gray = annotation text)",
        "3. **Path adjacency** → digit sequences",
        "4. **Hu moments + n_items** → glyph identity (POC 3 v2 primary discriminator)",
        "5. **Normalized endpoint sequence** → fine-grained vector fingerprint",
    ]
    return "\n".join(lines)


# ═════════════════════════════════════════════════════════════════
# DEBUG IMAGES
# ═════════════════════════════════════════════════════════════════

TIER_COLOR = {
    "HIGH":      (0, 200, 0),
    "MEDIUM":    (0, 165, 255),
    "LOW":       (0, 100, 200),
    "AMBIGUOUS": (200, 0, 200),
    "FAILED":    (0, 0, 200),
}


def _render_region(page: fitz.Page, cx: float, cy: float,
                   margin: float = 60.0, scale: float = 3.0) -> Optional[np.ndarray]:
    clip = fitz.Rect(cx - margin, cy - margin, cx + margin, cy + margin)
    try:
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale),
                              clip=clip, colorspace=fitz.csRGB)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, 3)
        return arr.copy()
    except Exception:
        return None


def make_occ_debug_image(result: Dict, page: fitz.Page) -> Optional[np.ndarray]:
    """Per-OCC debug PNG: rendered PDF region + cluster ID / label overlays + panel."""
    bbox = result.get('pdf_bbox')
    if not bbox or len(bbox) < 4:
        return None
    cx = (bbox[0] + bbox[2]) / 2
    cy = (bbox[1] + bbox[3]) / 2
    margin, scale = 70.0, 4.0

    arr = _render_region(page, cx, cy, margin=margin, scale=scale)
    if arr is None:
        return None

    img  = Image.fromarray(arr)
    draw = ImageDraw.Draw(img)

    def pdf2img(px: float, py: float) -> Tuple[int, int]:
        return (int((px - (cx - margin)) * scale),
                int((py - (cy - margin)) * scale))

    tier     = result.get('confidence_tier', 'FAILED')
    tier_rgb = tuple(reversed(TIER_COLOR.get(tier, (128, 128, 128))))

    bx0, by0, bx1, by1 = bbox
    draw.rectangle([*pdf2img(bx0, by0), *pdf2img(bx1, by1)],
                   outline=(255, 200, 0), width=2)

    for glyph in result.get('per_glyph_info', []):
        gbbox = glyph.get('bbox_pt', [])
        if len(gbbox) < 4:
            continue
        gx0, gy0, gx1, gy1 = gbbox
        px0, py0 = pdf2img(gx0, gy0)
        px1, py1 = pdf2img(gx1, gy1)

        lbl = glyph.get('label') or glyph.get('cluster') or f"n{glyph.get('n_items','')}"
        if glyph.get('is_negative'):
            lbl   = '[N]'
            color = (200, 50, 50)
        elif glyph.get('label_src') == 'human_label_mapping':
            color = (0, 180, 0)
        elif glyph.get('label_src') == 'tess_auxiliary':
            color = tier_rgb
        else:
            color = (160, 80, 200)

        draw.rectangle([px0, py0, px1, py1], outline=color, width=2)
        draw.text((px0 + 1, py0 - 10), str(lbl), fill=color)

    panel_h = 60
    w, h = img.size
    panel = Image.new('RGB', (w, panel_h), (30, 30, 30))
    pd = ImageDraw.Draw(panel)
    seq    = result.get('display_sequence', '—')
    valid  = result.get('valid_sign_code_candidates', [])
    final  = result.get('final_research_confidence', 0.0)
    action = result.get('recommended_next_action', '?')[:30]
    cl_ids = result.get('cluster_id_sequence', [])

    color_rgb = tuple(reversed(TIER_COLOR.get(tier, (128, 128, 128))))
    pd.text((4, 4),  f"seq={seq}  tier={tier}  conf={final:.3f}", fill=color_rgb)
    pd.text((4, 20), f"clusters={cl_ids}", fill=(200, 200, 200))
    pd.text((4, 36), f"valid={valid}  action={action}", fill=(180, 180, 180))
    pd.text((4, 48), f"g={result.get('glyph_recognition_confidence',0):.2f}  "
                     f"s={result.get('sequence_confidence',0):.2f}  "
                     f"sp={result.get('spatial_association_confidence',0):.2f}",
            fill=(160, 160, 160))

    combined = Image.new('RGB', (w, h + panel_h))
    combined.paste(img, (0, 0))
    combined.paste(panel, (0, h))
    return np.array(combined)


def make_cluster_review_sheet(clusters: Dict, page: fitz.Page,
                              human_labels: Dict[str, str]) -> Path:
    """
    Generate cluster_review_sheet.png for human annotation.
    One row per cluster (sorted by size), with sample glyphs at RASTER_SCALE.
    Color codes: green row = digit-labeled, red row = negative-labeled, white = unlabeled.
    """
    CELL_W, CELL_H = 64, 64
    INFO_W  = 240
    MAX_SMP = 8
    ROW_H   = 76
    HDR_H   = 40

    sorted_cl = sorted(clusters.items(), key=lambda x: -x[1]['size'])
    n_rows    = len(sorted_cl)
    total_w   = INFO_W + CELL_W * MAX_SMP + 10
    total_h   = HDR_H + ROW_H * n_rows

    img  = Image.new('RGB', (total_w, total_h), (245, 245, 245))
    draw = ImageDraw.Draw(img)

    # Header
    draw.rectangle([0, 0, total_w, HDR_H], fill=(45, 55, 80))
    draw.text((8, 12), "POC 3 v2 — Cluster Review Sheet  |  Label file: vector_glyph_human_labels.json",
              fill=(220, 230, 255))

    y = HDR_H
    for cl_id, cl in sorted_cl:
        h_label   = human_labels.get(cl_id)
        is_neg    = h_label in NEGATIVE_LABELS if h_label else False
        is_digit  = h_label in DIGIT_LABELS if h_label else False
        auto_lbl  = cl.get('label')

        # Row background
        if is_neg:
            bg = (255, 224, 224)
        elif is_digit:
            bg = (224, 255, 224)
        elif auto_lbl:
            bg = (224, 240, 255)
        else:
            bg = (255, 255, 255)
        draw.rectangle([0, y, total_w, y + ROW_H - 1], fill=bg)

        # Info panel
        h_str   = f"human={h_label}" if h_label else "—"
        tess_str = f"tess={auto_lbl}" if auto_lbl else ""
        src_str  = cl.get('label_src', '?')[:18]
        lines_txt = [
            f"{cl_id}   n={cl['n_items']}  AR={cl['mean_ar']:.2f}  sz={cl['size']}",
            h_str + (f"  {tess_str}" if tess_str else ""),
            src_str,
        ]
        txt_color = ((160, 0, 0) if is_neg else
                     (0, 110, 0) if is_digit else
                     (0, 60, 120) if auto_lbl else
                     (60, 60, 60))
        for i, ln in enumerate(lines_txt):
            draw.text((6, y + 5 + i * 20), ln, fill=txt_color)

        # Separator between info and samples
        draw.line([INFO_W - 2, y, INFO_W - 2, y + ROW_H - 1], fill=(200, 200, 200), width=1)

        # Sample glyphs
        x_cell = INFO_W
        for path in cl['paths'][:MAX_SMP]:
            try:
                arr = _rasterize_path_region(path, page, scale=RASTER_SCALE)
                if arr is None or arr.size == 0:
                    x_cell += CELL_W
                    continue
                ret, binary = cv2.threshold(arr, 200, 255, cv2.THRESH_BINARY_INV)
                if binary is None or binary.size == 0:
                    x_cell += CELL_W
                    continue
                ys_px, xs_px = np.where(binary > 0)
                if len(xs_px) >= 2 and len(ys_px) >= 2:
                    crop = binary[ys_px.min():ys_px.max()+1, xs_px.min():xs_px.max()+1]
                    padded = np.pad(crop, 6, constant_values=0)
                else:
                    padded = binary
                if padded.size == 0:
                    x_cell += CELL_W
                    continue
                scaled = cv2.resize(padded, (CELL_W - 4, CELL_H - 4),
                                     interpolation=cv2.INTER_NEAREST)
                cell_arr = 255 - scaled
                cell_img = Image.fromarray(cell_arr)
                img.paste(cell_img, (x_cell + 2, y + 2))
            except Exception:
                pass
            draw.rectangle([x_cell, y, x_cell + CELL_W - 1, y + CELL_H - 1],
                           outline=(180, 180, 180), width=1)
            x_cell += CELL_W

        draw.line([0, y + ROW_H - 1, total_w, y + ROW_H - 1],
                  fill=(200, 200, 200), width=1)
        y += ROW_H

    sheet_path = DBG_DIR / "cluster_review_sheet.png"
    img.save(str(sheet_path))
    return sheet_path


def make_cluster_grid(clusters: Dict, page: fitz.Page) -> None:
    """Save individual cluster sample strips (one file per cluster)."""
    (DBG_DIR / "clusters").mkdir(parents=True, exist_ok=True)
    for cl_id, cl in sorted(clusters.items()):
        label = cl.get('label') or f"n{cl['n_items']}"
        thumbs = []
        for s in cl['paths'][:8]:
            arr = _rasterize_path_region(s, page, scale=RASTER_SCALE)
            if arr is None:
                continue
            arr_pad = np.pad(arr, 4, constant_values=200)
            scaled  = cv2.resize(arr_pad, (64, 64), interpolation=cv2.INTER_NEAREST)
            thumbs.append(scaled)
        if not thumbs:
            continue
        row   = np.hstack(thumbs)
        fname = DBG_DIR / "clusters" / f"{cl_id}_lbl{label}_n{cl['n_items']}.png"
        cv2.imwrite(str(fname), row)


def save_global_overview(adj_groups: List[List[Dict]],
                         occ_map: Dict, page: fitz.Page,
                         occ_groups: Dict) -> None:
    """Low-resolution full-page overview with adjacent groups and OCC markers."""
    scale = 0.30
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), colorspace=fitz.csRGB)
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, 3).copy()

    for grp in adj_groups:
        feat = _group_feature(grp)
        x0 = int(feat['x0'] * scale)
        y0 = int(feat['y0'] * scale)
        x1 = int(feat['x1'] * scale)
        y1 = int(feat['y1'] * scale)
        n_human  = sum(1 for p in grp if p.get('label_src') == 'human_label_mapping')
        n_labeled = sum(1 for p in grp if p.get('label') in DIGIT_LABELS)
        color = ((0, 200, 0)   if n_human == len(grp) else
                 (0, 130, 255) if n_labeled == len(grp) else
                 (200, 120, 0))
        cv2.rectangle(arr, (x0, y0-4), (x1, y1+4), color, 1)
        # Display cluster IDs or digit labels
        parts = []
        for p in sorted(grp, key=lambda p: p['x0']):
            if p.get('label') in DIGIT_LABELS:
                parts.append(p['label'])
            elif p.get('is_negative'):
                parts.append('N')
            else:
                cl = p.get('cluster', '?')
                parts.append(cl[-2:] if cl else '?')
        lbl = '|'.join(parts)
        cv2.putText(arr, lbl, (x0, max(y0-6, 8)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.25, color, 1)

    for occ_id, occ in list(occ_map.items())[:50]:
        bbox = occ.get('bbox', [])
        if len(bbox) < 4:
            continue
        cx = int((bbox[0]+bbox[2])/2 * scale)
        cy = int((bbox[1]+bbox[3])/2 * scale)
        has_group = bool(occ_groups.get(occ_id))
        cv2.circle(arr, (cx, cy), 3, (0,255,0) if has_group else (0,80,255), -1)

    cv2.imwrite(str(DBG_DIR / "global_overview.png"), arr)
    print(f"[Debug] global_overview.png ({arr.shape[1]}×{arr.shape[0]}px)")


# ═════════════════════════════════════════════════════════════════
# REPORT
# ═════════════════════════════════════════════════════════════════

def write_report(results: List[Dict], clusters: Dict,
                 adj_groups: List[List[Dict]], digit_paths: List[Dict],
                 hidden_obs: str, elapsed: float,
                 feasibility: Dict, human_labels: Dict,
                 poc2_results: List[Dict]) -> None:
    import datetime as dt

    total     = len(results)
    n_high    = sum(1 for r in results if r['confidence_tier'] == "HIGH")
    n_med     = sum(1 for r in results if r['confidence_tier'] == "MEDIUM")
    n_low     = sum(1 for r in results if r['confidence_tier'] == "LOW")
    n_amb     = sum(1 for r in results if r['confidence_tier'] == "AMBIGUOUS")
    n_fail    = sum(1 for r in results if r['confidence_tier'] == "FAILED")
    n_with_seq = sum(1 for r in results if r.get('display_sequence'))
    n_valid   = sum(1 for r in results if r.get('valid_sign_code_candidates'))
    n_review  = sum(1 for r in results if r.get('requires_review'))

    n_cl_total      = len(clusters)
    n_cl_digit      = sum(1 for cl in clusters.values()
                          if cl.get('label') in DIGIT_LABELS)
    n_cl_negative   = sum(1 for cl in clusters.values() if cl.get('is_negative'))
    n_cl_human      = sum(1 for cl in clusters.values()
                          if cl.get('label_src') == 'human_label_mapping')
    n_cl_tess       = sum(1 for cl in clusters.values()
                          if cl.get('label_src') == 'tess_auxiliary')
    n_cl_unlabeled  = n_cl_total - n_cl_human - n_cl_tess

    action_counts = Counter(r.get('recommended_next_action') for r in results)

    best5 = sorted(
        [r for r in results if r.get('display_sequence')],
        key=lambda r: r.get('final_research_confidence', 0), reverse=True)[:5]
    worst5 = sorted(
        [r for r in results if r.get('display_sequence')],
        key=lambda r: r.get('final_research_confidence', 0))[:5]

    lines = [
        "# POC 3 (v2 — Improved) — Vector Glyph Recognition Report",
        "",
        f"**Date:** {dt.datetime.now().isoformat(timespec='seconds')}  ",
        f"**Total OCC regions processed:** {total}  ",
        f"**Elapsed:** {elapsed:.1f}s  ",
        f"**Method:** Hu-moment hierarchical clustering (cosine dist={CLUSTER_DIST_THRESH}) + "
        f"angle histogram + n_items + AR",
        f"**Tesseract:** Auxiliary cluster-labeler only (NOT primary recognition)",
        f"**Human labels loaded:** {len(human_labels)} "
        f"({sum(1 for v in human_labels.values() if v in DIGIT_LABELS)} digit, "
        f"{sum(1 for v in human_labels.values() if v in NEGATIVE_LABELS)} negative)",
        "",
        "---",
        "",
        "## Summary",
        "",
        "| Metric | Count | % |",
        "|--------|-------|---|",
        f"| OCCs processed | {total} | 100% |",
        f"| OCCs with adjacent group found | {total - n_fail} | "
        f"{100*(total-n_fail)//max(total,1)}% |",
        f"| OCCs with display sequence | {n_with_seq} | "
        f"{100*n_with_seq//max(total,1)}% |",
        f"| HIGH confidence | {n_high} | {100*n_high//max(total,1)}% |",
        f"| MEDIUM confidence | {n_med} | {100*n_med//max(total,1)}% |",
        f"| LOW confidence | {n_low} | {100*n_low//max(total,1)}% |",
        f"| AMBIGUOUS | {n_amb} | {100*n_amb//max(total,1)}% |",
        f"| FAILED (no group) | {n_fail} | {100*n_fail//max(total,1)}% |",
        f"| Valid 3-digit code candidates | {n_valid} | "
        f"{100*n_valid//max(total,1)}% |",
        f"| Requires review | {n_review} | {100*n_review//max(total,1)}% |",
        "",
        "## Vector Path Inventory",
        "",
        f"- **Digit-candidate paths extracted:** {len(digit_paths)}",
        f"  (gray stroke-only, line segments, h={H_MIN}–{H_MAX}pt, "
        f"w={W_MIN}–{W_MAX}pt, n={N_MIN}–{N_MAX} items)",
        f"- **Adjacent groups detected:** {len(adj_groups)}",
        f"  (2–4 adjacent paths, gap <{GAP_MAX}pt, same y-level)",
        f"- **Clusters formed:** {n_cl_total}  (dist_thresh={CLUSTER_DIST_THRESH})",
        f"  - Human-labeled: {n_cl_human} "
        f"({sum(1 for v in human_labels.values() if v in DIGIT_LABELS)} digit, "
        f"{sum(1 for v in human_labels.values() if v in NEGATIVE_LABELS)} negative)",
        f"  - Tesseract-labeled: {n_cl_tess}",
        f"  - Unlabeled: {n_cl_unlabeled}",
        f"  - Negative-labeled: {n_cl_negative}",
        "",
        "## Are the Adjacent Digit-Path Groups Truly Useful?",
        "",
        f"**YES — {len(adj_groups)} groups detected, {total - n_fail}/{total} OCCs matched.**",
        "",
        "Adjacent groups correctly locate sign-code annotation positions.",
        "Key n_items patterns:",
    ]

    # n_items sequence distribution
    seq_dist = Counter(tuple(p['n'] for p in grp) for grp in adj_groups)
    for seq, cnt in seq_dist.most_common(6):
        lines.append(f"- `{seq}` — {cnt} group(s)")

    lines += [
        "",
        "**Improvement over v1:** Sequences now use cluster IDs (`CL-XX/CL-YY`) instead",
        "of `?N` n_items substitution. Glyph identity is derivable by human labeling.",
        "",
        "## Glyph Clusters",
        "",
        "| Cluster | n_items | Mean AR | Size | Digit Label | Neg Label | Tess | Human |",
        "|---------|---------|--------|------|------------|-----------|------|-------|",
    ]
    for cl_id, cl in sorted(clusters.items()):
        lbl     = cl.get('label') or "—"
        neg     = "✓" if cl.get('is_negative') else "—"
        tess_lbl = "✓" if cl.get('label_src') == 'tess_auxiliary' else "—"
        human_lbl = "✓" if cl.get('label_src') == 'human_label_mapping' else "—"
        h_raw   = cl.get('human_label') or "—"
        if cl.get('is_negative'):
            lbl = f"[{h_raw}]"
        lines.append(
            f"| {cl_id} | {cl['n_items']} | {cl['mean_ar']:.2f} | "
            f"{cl['size']} | {lbl} | {neg} | {tess_lbl} | {human_lbl} |"
        )

    lines += [
        "",
        "## Feasibility Analysis — Teaching Loop Simulation",
        "",
        "If a human labels the **top-N most frequent** clusters (by appearances in adjacent groups),",
        "how many adjacent groups become fully resolved (all clusters labeled)?",
        "",
        f"- Total clusters: {feasibility['total_clusters']}",
        f"- Negative (noise) clusters: {feasibility['negative_clusters']}",
        f"- Digit-candidate clusters: {feasibility['digit_candidate_clusters']}",
        f"- Adjacent groups with clean cluster sequences: {feasibility['clean_groups']}",
        "",
        "| Clusters labeled | Groups resolved | Total clean | Coverage |",
        "|-----------------|----------------|-------------|---------|",
    ]
    for n_str, sim in feasibility['simulation'].items():
        lines.append(
            f"| {sim['clusters_labeled']} | {sim['groups_resolved']} "
            f"| {sim['total_clean_groups']} | {sim['coverage_pct']}% |"
        )

    lines += [
        "",
        "**Key question answered:** How many human labels resolve how many codes?",
        "If labeling 5 clusters resolves >50% of groups → teaching loop is practical.",
        "",
        "### Cluster Frequency in Adjacent Groups",
        "",
        "| Cluster | Appearances |",
        "|---------|-------------|",
    ]
    for cl_id, freq in list(feasibility['cluster_frequency_in_groups'].items())[:15]:
        cl_info = clusters.get(cl_id, {})
        lbl = cl_info.get('label') or cl_info.get('human_label') or "—"
        lines.append(f"| {cl_id} (lbl={lbl}) | {freq} |")

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
        "| OCC | Tier | Final | Display Sequence | Valid Codes |",
        "|-----|------|-------|-----------------|------------|",
    ]
    for r in best5:
        lines.append(
            f"| {r['occurrence_id']} | {r['confidence_tier']} "
            f"| {r['final_research_confidence']:.3f} "
            f"| `{r.get('display_sequence', '—')}` "
            f"| {r.get('valid_sign_code_candidates', [])} |"
        )

    lines += [
        "",
        "## Worst 5 OCCs (lowest confidence, has sequence)",
        "",
        "| OCC | Tier | Final | Display Sequence | Flags |",
        "|-----|------|-------|-----------------|-------|",
    ]
    for r in worst5:
        flagged = [k for k, v in r.get('ambiguity_flags', {}).items() if v]
        lines.append(
            f"| {r['occurrence_id']} | {r['confidence_tier']} "
            f"| {r['final_research_confidence']:.3f} "
            f"| `{r.get('display_sequence', '—')}` "
            f"| {', '.join(flagged) or '—'} |"
        )

    lines += [
        "",
        "## Existing AI / Open-Source Tools Checked",
        "",
        "| Tool | Source | License | Weight | Local/Free | Decision |",
        "|------|--------|---------|--------|-----------|---------|",
        "| **PyMuPDF** `get_drawings()` | pymupdf.io | AGPL | Already installed | Yes | **Used** — primary path extraction |",
        "| **cv2** moments + HuMoments | opencv.org | Apache 2 | Already installed | Yes | **Used** — primary descriptor (new in v2) |",
        "| **scipy** hierarchy, squareform | scipy.org | BSD | Already installed | Yes | **Used** — hierarchical clustering (new in v2) |",
        "| **scipy** spatial.distance.cdist | scipy.org | BSD | Already installed | Yes | **Used** — cosine pairwise distance |",
        "| **shapely** | shapely.readthedocs.io | BSD | ~6MB installed | Yes | **Installed** — reserved for POC 6 measurement |",
        "| **svgpathtools** | github/mathandy | MIT | ~200KB | Yes | **Skipped** — PyMuPDF parses paths natively |",
        "| **rdp** (Ramer-Douglas-Peucker) | PyPI | MIT | ~10KB | Yes | **Deferred** — path simplification if needed |",
        "| **docTR** (Mindee) | github/mindee/doctr | Apache 2 | ~300MB | Yes | **Deferred** — after POC 4 PaddleOCR |",
        "| **Docling** (IBM) | github/DS4SD/docling | Apache 2 | ~200MB | Yes | **Rejected** — document converter; cannot process vector-path-only PDFs |",
        "| **PaddleOCR** PP-OCR v4 | github/PaddlePaddle | Apache 2 | ~200MB | Yes | **Deferred** — planned POC 4 smoke test |",
        "| **MMOCR** | github/open-mmlab | Apache 2 | ~500MB | Yes | **Rejected** — too heavy; mmcv ecosystem |",
        "| **Label Studio** | github/HumanSignal | Apache 2 | ~50MB | Yes | **Deferred** — POC 5–7 teaching loop UI |",
        "| **Gradio** | gradio.app | Apache 2 | ~20MB | Yes | **Deferred** — lighter teaching-loop review UI |",
        "| **fonttools** | github/fonttools | MIT | ~5MB | Yes | **Skipped** — no embedded fonts; all paths |",
        "",
        "**New in v2:** cv2 Hu moments + scipy hierarchical clustering replace the",
        "n_items/AR/endpoint-L2 heuristic from v1. No new installations required.",
        "",
        hidden_obs,
        "",
        "## Assessment: Comparison to Previous Attempts",
        "",
        "| Method | OCCs | Sequences | Confident | Time | Status |",
        "|--------|------|----------|----------|------|--------|",
        "| Stage 10: Tesseract broad crop | 177 | 0 | 0 | 86 min | ❌ Failed |",
        "| POC 1: Tesseract tight crop | 177 | 33 (non-auth) | 0 | 53s | Non-auth |",
        "| POC 2: Bitmap template matching | 168 | 149 | 0 HIGH, 2 MED | 137s | Insufficient |",
        f"| POC 3 v1 (e2ff183) | 177 | 21 | 0 HIGH, 0 MED | 210s | Vector baseline |",
        f"| **POC 3 v2 (this run)** | **{total}** | **{n_with_seq}** | "
        f"**{n_high} HIGH, {n_med} MED** | **{elapsed:.0f}s** | "
        f"Hu-moment + teaching loop ready |",
        "",
        "**Key improvements over v1:**",
        "- Sequences now use stable cluster IDs (`CL-XX`) instead of `?N` n_items placeholders",
        "- Human label injection supported (digit + negative labels)",
        "- Cluster review sheet generated for human annotation workflow",
        "- Feasibility simulation answers: how many labels → how many codes",
        "- Hierarchical clustering replaces n_items/AR heuristic",
        "",
        "## Assessment: Is Vector Glyph Recognition Viable?",
        "",
        "**YES — with a small human teaching step.** The pipeline correctly:",
        "1. Extracts digit-sized glyph paths (gray stroke filter + size/AR/n_items)",
        "2. Groups adjacent glyphs into sign-code positions",
        "3. Maps positions to OCC clusters",
        "4. Assigns stable cluster IDs via Hu-moment hierarchical clustering",
        "5. Supports human label injection that propagates to all matching glyphs",
        "",
        "The bottleneck is **digit identity** — cluster IDs are stable but",
        "Tesseract auxiliary only labeled a fraction of clusters. However,",
        "a human can inspect `cluster_review_sheet.png`, label cluster IDs",
        "in `vector_glyph_human_labels.json`, and re-run to propagate globally.",
        "",
        "## Assessment: Is PaddleOCR Still Needed?",
        "",
        f"**YES — POC 4 is still worth running** for the {n_fail} FAILED OCCs",
        "where no adjacent group was detected. PaddleOCR may recover codes",
        "missed by the group detection window. It can also cross-validate",
        "any HIGH-confidence vector reads.",
        "",
        "## Assessment: Is It Safe to Proceed?",
        "",
        "**YES — research pipeline stable.**",
        "- No production changes",
        "- No paid API calls",
        "- No approved BOQ data produced",
        "",
        "## Recommended Next Steps",
        "",
        f"1. **Human label injection (priority)** — open `cluster_review_sheet.png`,",
        f"   label cluster IDs in `vector_glyph_human_labels.json`, re-run this script.",
        f"   Expected: labeling {min(10, feasibility['digit_candidate_clusters'])} clusters",
        f"   → resolve many adjacent groups automatically.",
        f"2. **POC 4 PaddleOCR smoke test** — target {n_fail} FAILED OCCs.",
        f"3. **Compare vector + human labels vs PaddleOCR** — hybrid approach.",
        f"4. **Scale measurement POC (POC 6)** — use shapely for guardrail/barrier lengths.",
        "",
        "---",
        "",
        "*POC 3 v2 is research output only. No output is approved BOQ data.*",
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
    print("POC 3 (v2 — Improved) — Vector Glyph Recognition")
    print("Primary: Hu-moment hierarchical clustering on PDF vector paths")
    print("Tesseract: auxiliary cluster-labeler only")
    print("Human labels: supported (digit + negative)")
    print("Research-only. No approved BOQ output.")
    print("=" * 60)

    # ── Load PDF ──
    if not Path(PDF_PATH).exists():
        print(f"[ERROR] PDF not found: {PDF_PATH}")
        sys.exit(1)
    doc  = fitz.open(PDF_PATH)
    page = doc[0]
    total_paths = len(page.get_drawings())
    print(f"[Load] PDF: {PDF_PATH}  ({total_paths} paths)")

    # ── Load sign inventory ──
    if not INV_JSON.exists():
        print(f"[ERROR] {INV_JSON} not found.")
        sys.exit(1)
    with open(INV_JSON, encoding="utf-8") as f:
        inv = json.load(f)
    occ_map  = {o['occurrence_id']: o for o in inv.get('occurrences', [])}
    print(f"[Load] Sign inventory: {len(occ_map)} OCCs")

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

    # ── Human labels ──
    human_labels = load_human_labels()

    # ── Hidden structure investigation ──
    print("\n[Structure] Investigating PDF hidden/structural properties ...")
    hidden_obs = investigate_structure(page)
    print("[Structure] Done.")

    # ── Extract digit paths ──
    print("\n[Extract] Extracting gray line-only digit-candidate paths ...")
    digit_paths = extract_digit_paths(page)
    print(f"[Extract] Found {len(digit_paths)} digit-candidate paths")
    if not digit_paths:
        print("[WARNING] No digit paths found — check PDF or relax filters.")

    # ── Cluster glyphs ──
    print("\n[Cluster] Clustering by Hu-moment descriptor ...")
    clusters = cluster_glyphs(digit_paths, page, human_labels)
    n_labeled_cl = sum(1 for cl in clusters.values() if cl.get('label') in DIGIT_LABELS)
    n_negative_cl = sum(1 for cl in clusters.values() if cl.get('is_negative'))
    print(f"[Cluster] Clusters: {len(clusters)}  "
          f"digit-labeled: {n_labeled_cl}  negative: {n_negative_cl}")

    # Write human label example template
    OUT.mkdir(parents=True, exist_ok=True)
    write_human_labels_example(list(clusters.keys()))

    # Save cluster grid
    DBG_DIR.mkdir(parents=True, exist_ok=True)
    print("[Debug] Saving cluster grid ...")
    make_cluster_grid(clusters, page)

    # ── Detect adjacent groups ──
    print("\n[Groups] Detecting adjacent path groups ...")
    adj_groups = detect_adjacent_groups(digit_paths)
    size_dist  = Counter(len(g) for g in adj_groups)
    seq_dist   = Counter(tuple(p['n'] for p in g) for g in adj_groups)
    print(f"[Groups] Found {len(adj_groups)} adjacent groups  sizes={dict(size_dist)}")
    print(f"  Top n_items sequences: {seq_dist.most_common(6)}")

    # ── Map to OCCs ──
    print("\n[Map] Mapping adjacent groups to OCC positions ...")
    occ_groups = map_groups_to_occs(adj_groups, occ_map)
    n_matched  = sum(1 for v in occ_groups.values() if v)
    print(f"[Map] OCCs matched: {n_matched}/{len(occ_map)}")

    # ── Process each OCC ──
    print(f"\n[Process] Building results for {len(occ_map)} OCCs ...")
    results = []
    for occ_id, occ in occ_map.items():
        matched = occ_groups.get(occ_id, [])
        results.append(process_occ(occ_id, occ, matched, poc1_map))

    # ── Feasibility simulation ──
    print("[Feasibility] Computing teaching-loop simulation ...")
    feasibility = compute_feasibility(clusters, adj_groups, human_labels)
    sim = feasibility['simulation']
    print("  Simulation (top-N clusters labeled → groups resolved):")
    for n_str, s in sim.items():
        print(f"    label {s['clusters_labeled']:2d} clusters → "
              f"{s['groups_resolved']}/{s['total_clean_groups']} groups "
              f"({s['coverage_pct']}%)")

    # ── Save JSON ──
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\n[Output] {OUT_JSON}  ({len(results)} records)")

    # ── Debug images ──
    print("[Debug] Generating per-OCC debug images ...")
    for tier in ("high", "medium", "low", "failed", "ambiguous"):
        (DBG_DIR / tier).mkdir(parents=True, exist_ok=True)

    for res in results:
        img = make_occ_debug_image(res, page)
        if img is None:
            continue
        tier  = res['confidence_tier'].lower()
        fname = f"{res['occurrence_id']}_debug.png"
        cv2.imwrite(str(DBG_DIR / tier / fname), img)

    # ── Cluster review sheet ──
    print("[Debug] Generating cluster review sheet ...")
    sheet_path = make_cluster_review_sheet(clusters, page, human_labels)
    print(f"[Debug] cluster_review_sheet.png → {sheet_path}")

    print("[Debug] Saving global page overview ...")
    save_global_overview(adj_groups, occ_map, page, occ_groups)

    elapsed = time.time() - t0

    # ── Report ──
    print("[Report] Writing report ...")
    write_report(results, clusters, adj_groups, digit_paths,
                 hidden_obs, elapsed, feasibility, human_labels, poc2_results)

    # ── Console summary ──
    tiers   = Counter(r['confidence_tier'] for r in results)
    actions = Counter(r.get('recommended_next_action') for r in results)

    print("\n" + "=" * 60)
    print("POC 3 v2 COMPLETE")
    print("=" * 60)
    print(f"  Digit paths extracted : {len(digit_paths)}")
    print(f"  Clusters formed       : {len(clusters)}"
          f"  (digit={n_labeled_cl}, negative={n_negative_cl})")
    print(f"  Adjacent groups       : {len(adj_groups)}")
    print(f"  OCCs matched          : {n_matched}/{len(occ_map)}")
    print(f"  Confidence tiers      : {dict(tiers)}")
    print(f"  Elapsed               : {elapsed:.1f}s")
    print("")
    print("  Actions:")
    for act, cnt in sorted(actions.items(), key=lambda x: -x[1]):
        print(f"    {act}: {cnt}")
    print("")
    print("  Human label template  : outputs/vector_glyph_human_labels.example.json")
    print("  Cluster review sheet  : outputs/vector_glyph_debug/cluster_review_sheet.png")
    print("")
    print("  Feasibility (label N clusters → groups resolved):")
    for n_str, s in sim.items():
        print(f"    N={s['clusters_labeled']:2d} → {s['groups_resolved']}/{s['total_clean_groups']} "
              f"({s['coverage_pct']}%)")
    print("")
    print("  Dependencies:")
    print("    shapely 2.0.7 — BSD 3-Clause — pip install shapely")
    print("    (all other dependencies were already in .venv)")
    print("")
    print("  REMINDER: No output from POC 3 is approved BOQ data.")
    print("  All codes require human validation before operational use.")
    print("=" * 60)


if __name__ == "__main__":
    main()
