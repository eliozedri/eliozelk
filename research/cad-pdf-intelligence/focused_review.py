"""
Focused visual review: CL-10 / CL-00 sub-groups / CL-04
Outputs high-resolution panels + orientation analysis for the second label round.

Outputs:
  outputs/vector_glyph_debug/focused_review/CL-10_all_samples.png
  outputs/vector_glyph_debug/focused_review/CL-00_n28_subgroup.png
  outputs/vector_glyph_debug/focused_review/CL-00_n22_subgroup.png
  outputs/vector_glyph_debug/focused_review/CL-04_orientation.png
  outputs/vector_glyph_debug/focused_review/context_crops.png   (PDF-rasterized context)
"""
import warnings; warnings.filterwarnings("ignore")
import sys, time, json
from pathlib import Path
from collections import defaultdict, Counter
from typing import Dict, List, Tuple, Optional

import numpy as np
import cv2
import fitz
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import cdist, squareform

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE      = Path(__file__).parent
PDF_PATH  = "/Users/eliozedri/Downloads/50-448-02-400.pdf"
OUT_DIR   = BASE / "outputs" / "vector_glyph_debug" / "focused_review"
RES_JSON  = BASE / "outputs" / "vector_glyph_results.json"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Same constants as main script ─────────────────────────────────────────────
H_MIN, H_MAX    = 7.0,  18.0
W_MIN, W_MAX    = 4.0,  16.0
N_MIN, N_MAX    = 8,    30
AR_MIN, AR_MAX  = 0.40, 1.70
GRAY_COLOR      = (0.57, 0.57, 0.57)
GRAY_TOL        = 0.03
CLUSTER_DIST_THRESH = 0.05
DESC_SIZE           = 32
DESC_HU_W           = 0.70
DESC_STRUCT_W       = 0.15
DESC_HIST_W         = 0.15
RASTER_SCALE        = 8

# ── Render settings ───────────────────────────────────────────────────────────
BIG    = 240   # large glyph canvas for focused review
MARGIN = 24
LABEL_H = 30
CTX_SCALE = 12  # PDF render scale for context crops (12× = ~170 DPI equivalent)
CTX_MARGIN_PT = 20.0  # padding around glyph bbox for context


# ─────────────────────────────────────────────────────────────────────────────
# PATH EXTRACTION + CLUSTERING (same as generate_cluster_review.py)
# ─────────────────────────────────────────────────────────────────────────────

def is_gray(color):
    if color is None or len(color) != 3:
        return False
    return all(abs(color[i] - GRAY_COLOR[i]) < GRAY_TOL for i in range(3))


def compute_feature(items, x0, y0, w, h):
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


def extract_paths(page):
    result = []
    for p in page.get_drawings():
        if p.get('type') != 's':
            continue
        if not is_gray(p.get('color')):
            continue
        items = [it for it in p.get('items', []) if it[0] == 'l']
        n = len(items)
        if not (N_MIN <= n <= N_MAX):
            continue
        r = p['rect']
        w, h = float(r.width), float(r.height)
        if not (H_MIN <= h <= H_MAX and W_MIN <= w <= W_MAX):
            continue
        ar = w / max(h, 1e-4)
        if not (AR_MIN <= ar <= AR_MAX):
            continue
        x0, y0 = float(r.x0), float(r.y0)
        feat = compute_feature(items, x0, y0, w, h)
        result.append({
            'x0': x0, 'y0': y0, 'x1': float(r.x1), 'y1': float(r.y1),
            'w': w, 'h': h, 'n': n, 'ar': round(ar, 3),
            'items': items, 'feature': feat,
        })
    return result


def rasterize(path, page):
    margin = 3.0
    clip = fitz.Rect(path['x0'] - margin, path['y0'] - margin,
                     path['x1'] + margin, path['y1'] + margin)
    try:
        pix = page.get_pixmap(matrix=fitz.Matrix(RASTER_SCALE, RASTER_SCALE),
                              clip=clip, colorspace=fitz.csGRAY)
        return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w)
    except Exception:
        return None


def compute_descriptor(path, page):
    hu_part = np.zeros(7, dtype=np.float64)
    arr = rasterize(path, page)
    if arr is not None and arr.size > 0:
        _, binary = cv2.threshold(arr, 200, 255, cv2.THRESH_BINARY_INV)
        if binary.max() > 0:
            ys, xs = np.where(binary > 0)
            if len(xs) >= 2 and len(ys) >= 2:
                crop = binary[ys.min():ys.max()+1, xs.min():xs.max()+1]
                padded = np.pad(crop, 4, constant_values=0)
                b_sq = cv2.resize(padded, (DESC_SIZE, DESC_SIZE),
                                  interpolation=cv2.INTER_AREA)
                m = cv2.moments(b_sq)
                hu = cv2.HuMoments(m).flatten()
                hu_part = -np.sign(hu) * np.log10(np.abs(hu) + 1e-10)
    n_norm  = (path['n'] - N_MIN) / max(N_MAX - N_MIN, 1.0)
    ar_norm = (path['ar'] - AR_MIN) / max(AR_MAX - AR_MIN, 1.0)
    angle_h = path['feature'][2:]
    return np.concatenate([
        hu_part * DESC_HU_W,
        np.array([n_norm, ar_norm]) * DESC_STRUCT_W,
        angle_h * DESC_HIST_W,
    ]).astype(np.float32)


def cluster_paths(paths, page):
    print(f"  Descriptors for {len(paths)} paths ...", end="", flush=True)
    descs = []
    for p in paths:
        d = compute_descriptor(p, page)
        p['descriptor'] = d
        descs.append(d)
    print(" done")
    D_mat = np.array(descs, dtype=np.float32)
    n = len(D_mat)
    if n == 1:
        raw_labels = np.array([1])
    elif n == 2:
        D_pair = cdist(D_mat, D_mat, metric='cosine')
        raw_labels = np.array([1, 1] if D_pair[0,1] <= CLUSTER_DIST_THRESH else [1, 2])
    else:
        D_pair = cdist(D_mat, D_mat, metric='cosine')
        np.fill_diagonal(D_pair, 0.0)
        D_pair = np.clip(D_pair, 0.0, 2.0)
        Z = linkage(squareform(D_pair), method='average')
        raw_labels = fcluster(Z, t=CLUSTER_DIST_THRESH, criterion='distance')
    label_to_paths = defaultdict(list)
    for path, lbl in zip(paths, raw_labels):
        label_to_paths[int(lbl)].append(path)
    sorted_labels = sorted(label_to_paths.keys(), key=lambda l: -len(label_to_paths[l]))
    cl_id_map = {lbl: f"CL-{i:02d}" for i, lbl in enumerate(sorted_labels)}
    for lbl, grp in label_to_paths.items():
        for p in grp:
            p['cluster'] = cl_id_map[lbl]
    return {cl_id_map[lbl]: grp for lbl, grp in label_to_paths.items()}


# ─────────────────────────────────────────────────────────────────────────────
# DRAWING HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def draw_glyph_large(path, size=BIG, margin=MARGIN, line_w=4):
    """Draw glyph on large white canvas."""
    canvas = np.ones((size, size, 3), dtype=np.uint8) * 255
    items = path['items']
    x0, y0 = path['x0'], path['y0']
    w = max(path['x1'] - x0, 0.001)
    h = max(path['y1'] - y0, 0.001)
    dw = size - 2 * margin
    dh = size - 2 * margin

    def to_px(px, py):
        ix = int(margin + (px - x0) / w * dw)
        iy = int(margin + (py - y0) / h * dh)
        return (np.clip(ix, 0, size-1), np.clip(iy, 0, size-1))

    for it in items:
        if it[0] != 'l':
            continue
        cv2.line(canvas, to_px(it[1].x, it[1].y), to_px(it[2].x, it[2].y),
                 (0, 0, 0), line_w)
    return canvas


def draw_glyph_with_orientation(path, size=BIG, margin=MARGIN, line_w=4):
    """
    Draw glyph + orientation markers:
      - RED dot: start of first segment
      - GREEN dot: end of last segment
      - BLUE cross: centroid of all segment midpoints
      - Text: 'open at TOP/BOTTOM/LEFT/RIGHT' based on endpoint position
    """
    canvas = draw_glyph_large(path, size=size, margin=margin, line_w=line_w)
    items = [it for it in path['items'] if it[0] == 'l']
    if not items:
        return canvas

    x0, y0 = path['x0'], path['y0']
    w = max(path['x1'] - x0, 0.001)
    h = max(path['y1'] - y0, 0.001)
    dw = size - 2 * margin
    dh = size - 2 * margin

    def to_px(px, py):
        ix = int(margin + (px - x0) / w * dw)
        iy = int(margin + (py - y0) / h * dh)
        return (np.clip(ix, 0, size-1), np.clip(iy, 0, size-1))

    # Start of first segment
    start_px = to_px(items[0][1].x, items[0][1].y)
    # End of last segment
    end_px   = to_px(items[-1][2].x, items[-1][2].y)
    # Centroid of all segment midpoints
    mids = [(to_px((it[1].x + it[2].x)/2, (it[1].y + it[2].y)/2)) for it in items]
    cx = int(np.mean([m[0] for m in mids]))
    cy = int(np.mean([m[1] for m in mids]))

    # Draw markers
    cv2.circle(canvas, start_px, 7, (0, 0, 220), -1)     # RED = start
    cv2.circle(canvas, end_px,   7, (0, 180, 0),  -1)     # GREEN = end
    cv2.drawMarker(canvas, (cx, cy), (220, 100, 0),
                   cv2.MARKER_CROSS, 14, 2)                # BLUE cross = centroid

    # Gap analysis: where is the midpoint between start and end (the "opening")?
    gap_mx = (start_px[0] + end_px[0]) / 2
    gap_my = (start_px[1] + end_px[1]) / 2
    # Relative to centroid
    rel_x = gap_mx - cx
    rel_y = gap_my - cy
    if abs(rel_x) > abs(rel_y):
        opening = "RIGHT" if rel_x > 0 else "LEFT"
    else:
        opening = "BOTTOM" if rel_y > 0 else "TOP"   # image y increases downward

    cv2.putText(canvas, f"open:{opening}", (4, size - 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 180), 2)
    return canvas, opening


def render_pdf_context(path, page, scale=CTX_SCALE, margin_pt=CTX_MARGIN_PT):
    """Render a generous context crop from the PDF around the glyph bbox."""
    x0 = path['x0'] - margin_pt
    y0 = path['y0'] - margin_pt
    x1 = path['x1'] + margin_pt
    y1 = path['y1'] + margin_pt
    clip = fitz.Rect(x0, y0, x1, y1)
    try:
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale),
                              clip=clip, colorspace=fitz.csRGB)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, 3)
        return arr.copy()
    except Exception:
        return None


def make_label_strip(text, width, height=LABEL_H, bg=(245, 245, 245)):
    strip = np.full((height, width, 3), bg[::-1], dtype=np.uint8)
    cv2.putText(strip, text, (4, height - 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.38, (40, 40, 40), 1)
    return strip


def resize_to_height(img, target_h):
    h, w = img.shape[:2]
    if h == 0 or w == 0:
        return np.full((target_h, target_h, 3), 220, dtype=np.uint8)
    if h == target_h:
        return img
    scale = target_h / h
    new_w = max(1, int(w * scale))
    return cv2.resize(img, (new_w, target_h), interpolation=cv2.INTER_AREA)


def make_sample_card(path, page, idx, show_orientation=False, cluster_label=""):
    """
    One card per sample:
      Top row: [normalized glyph (BIG)] | [PDF context crop]
      Bottom strip: metadata text
    """
    if show_orientation:
        glyph_img, opening = draw_glyph_with_orientation(path, size=BIG)
    else:
        glyph_img = draw_glyph_large(path, size=BIG)
        opening = ""

    ctx = render_pdf_context(path, page)
    if ctx is not None:
        ctx_resized = resize_to_height(ctx, BIG - 4)  # leave 2px border each side
        # Add thin border to context, total height = BIG
        ctx_bordered = cv2.copyMakeBorder(ctx_resized, 2, 2, 2, 2,
                                          cv2.BORDER_CONSTANT, value=(180, 180, 180))
        # Ensure heights match exactly
        if ctx_bordered.shape[0] != BIG:
            ctx_bordered = cv2.resize(ctx_bordered, (ctx_bordered.shape[1], BIG))
        top_row = np.hstack([glyph_img, ctx_bordered])
        lbl_w = glyph_img.shape[1] + ctx_bordered.shape[1]
    else:
        top_row = glyph_img
        lbl_w = glyph_img.shape[1]

    meta = f"#{idx}  n={path['n']}  AR={path['ar']:.2f}"
    if opening:
        meta += f"  opening:{opening}"
    strip = make_label_strip(meta, lbl_w)
    return np.vstack([top_row, strip])


def pad_to_width(img, target_w, fill=240):
    h, w = img.shape[:2]
    if w >= target_w:
        return img
    pad = np.full((h, target_w - w, 3), fill, dtype=np.uint8)
    return np.hstack([img, pad])


# ─────────────────────────────────────────────────────────────────────────────
# PANEL BUILDERS
# ─────────────────────────────────────────────────────────────────────────────

def build_panel(title, subtitle, paths, page, show_orientation=False, bg=(210, 225, 240)):
    """Build a full panel with title + all sample cards in a row."""
    if not paths:
        return None

    cards = [make_sample_card(p, page, i+1, show_orientation) for i, p in enumerate(paths)]
    card_h = max(c.shape[0] for c in cards)
    card_w = max(c.shape[1] for c in cards)

    # Normalize all cards to same size
    norm = []
    for c in cards:
        if c.shape[0] < card_h:
            pad = np.full((card_h - c.shape[0], c.shape[1], 3), 240, dtype=np.uint8)
            c = np.vstack([c, pad])
        norm.append(pad_to_width(c, card_w))

    # Arrange in rows of 4
    cols = 4
    rows_list = []
    for r in range(0, len(norm), cols):
        chunk = norm[r:r+cols]
        while len(chunk) < cols:
            blank = np.full((card_h, card_w, 3), 240, dtype=np.uint8)
            chunk.append(blank)
        rows_list.append(np.hstack(chunk))

    grid = np.vstack(rows_list)
    panel_w = grid.shape[1]

    # Title bar
    title_h = 60
    title_bar = np.full((title_h, panel_w, 3), bg[::-1], dtype=np.uint8)
    cv2.putText(title_bar, title, (10, 26),
                cv2.FONT_HERSHEY_SIMPLEX, 0.70, (0, 0, 80), 2)
    cv2.putText(title_bar, subtitle, (10, 50),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (80, 40, 0), 1)

    # Legend strip (for orientation panels)
    if show_orientation:
        leg_h = 28
        legend = np.full((leg_h, panel_w, 3), (250, 250, 250), dtype=np.uint8)
        cv2.circle(legend, (16, 14), 6, (0, 0, 220), -1)
        cv2.putText(legend, "= start of first segment", (26, 18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.38, (40, 40, 40), 1)
        cv2.circle(legend, (260, 14), 6, (0, 180, 0), -1)
        cv2.putText(legend, "= end of last segment", (270, 18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.38, (40, 40, 40), 1)
        cv2.drawMarker(legend, (500, 14), (220, 100, 0), cv2.MARKER_CROSS, 12, 2)
        cv2.putText(legend, "= centroid", (514, 18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.38, (40, 40, 40), 1)
        cv2.putText(legend, "open:TOP => tail hangs DOWN (like 9)   open:BOTTOM => tail exits UP (like 6)",
                    (650, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (80, 0, 80), 1)
        return np.vstack([title_bar, legend, grid])

    return np.vstack([title_bar, grid])


# ─────────────────────────────────────────────────────────────────────────────
# CONTEXT CROPS REFERENCE SHEET
# ─────────────────────────────────────────────────────────────────────────────

def build_context_sheet(target_clusters, cluster_to_paths, results_data, page):
    """
    For each cluster, show large PDF-context crops using known bbox from results JSON.
    These are the paths that appear in OCC proximity windows (have ground-truth positions).
    """
    # Build bbox lookup from results
    bbox_map = {}  # (x0_r, y0_r, x1_r, y1_r) -> cluster
    occ_map = {}
    for rec in results_data:
        for gi in rec.get('per_glyph_info', []):
            cl = gi.get('cluster')
            bp = gi.get('bbox_pt')
            if cl in target_clusters and bp:
                key = (round(bp[0],1), round(bp[1],1), round(bp[2],1), round(bp[3],1))
                bbox_map[key] = cl
                occ_map[key] = rec['occurrence_id']

    # Match paths to known bboxes
    confirmed = {cl: [] for cl in target_clusters}
    for cl in target_clusters:
        for p in cluster_to_paths.get(cl, []):
            key = (round(p['x0'],1), round(p['y0'],1), round(p['x1'],1), round(p['y1'],1))
            if key in bbox_map:
                confirmed[cl].append((p, occ_map.get(key, '?')))

    # Deduplicate by bbox (same physical path may match multiple OCCs)
    seen_keys = set()
    deduped = {cl: [] for cl in target_clusters}
    for cl in target_clusters:
        for p, occ in confirmed[cl]:
            key = (round(p['x0'],2), round(p['y0'],2))
            if key not in seen_keys:
                seen_keys.add(key)
                deduped[cl].append((p, occ))

    all_cards = []
    for cl in target_clusters:
        entries = deduped[cl]
        if not entries:
            continue
        for p, occ in entries[:8]:
            ctx = render_pdf_context(p, page, scale=CTX_SCALE, margin_pt=30.0)
            if ctx is None:
                continue
            # Upscale to fixed height for display
            ctx_h = 300
            ctx_scaled = resize_to_height(ctx, ctx_h)
            # Draw glyph alongside
            glyph = draw_glyph_large(p, size=ctx_h, margin=20, line_w=5)
            # Label strip
            lbl_w = ctx_scaled.shape[1] + glyph.shape[1]
            meta = f"{cl}  {occ}  n={p['n']}  AR={p['ar']:.2f}"
            strip = make_label_strip(meta, lbl_w, height=28, bg=(235, 235, 245))
            card = np.vstack([np.hstack([glyph, ctx_scaled]), strip])
            all_cards.append(card)

    if not all_cards:
        return None

    # Normalize card widths
    max_w = max(c.shape[1] for c in all_cards)
    norm_cards = [pad_to_width(c, max_w) for c in all_cards]

    # Stack vertically with separators
    rows = []
    for c in norm_cards:
        rows.append(c)
        rows.append(np.full((4, c.shape[1], 3), 160, dtype=np.uint8))

    sheet = np.vstack(rows)

    # Title
    title_h = 50
    title_bar = np.full((title_h, sheet.shape[1], 3), (120, 100, 180), dtype=np.uint8)
    cv2.putText(title_bar, "Context Crops — PDF-rasterized  (left=vector, right=PDF context)",
                (10, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.60, (255, 255, 255), 2)
    return np.vstack([title_bar, sheet])


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    t0 = time.time()
    print(f"[1] Opening PDF ...")
    if not Path(PDF_PATH).exists():
        print(f"ERROR: PDF not found at {PDF_PATH}")
        sys.exit(1)
    doc = fitz.open(PDF_PATH)
    page = doc[0]

    print("[2] Extracting and clustering paths ...")
    paths = extract_paths(page)
    print(f"    {len(paths)} paths")
    clusters = cluster_paths(paths, page)
    print(f"    {len(clusters)} clusters")

    print("[3] Loading results JSON for context bbox data ...")
    with open(RES_JSON) as f:
        results_data = json.load(f)

    # ── CL-10: all 5 samples ─────────────────────────────────────────────────
    print("[4] Building CL-10 panel ...")
    cl10 = clusters.get("CL-10", [])
    print(f"    CL-10 members: {len(cl10)}")
    n_counts_10 = Counter(p['n'] for p in cl10)
    print(f"    n_items dist: {dict(sorted(n_counts_10.items()))}")

    panel10 = build_panel(
        title=f"CL-10  —  size={len(cl10)}  —  ALL SAMPLES",
        subtitle=(f"n_items={dict(sorted(n_counts_10.items()))}  "
                  "Confirm: is this consistently '0', or is there a '5' contamination?  "
                  "Left=vector drawing, Right=PDF context crop"),
        paths=cl10,
        page=page,
        show_orientation=False,
        bg=(200, 225, 210),
    )
    out10 = OUT_DIR / "CL-10_all_samples.png"
    cv2.imwrite(str(out10), panel10)
    print(f"    Saved: {out10}  ({panel10.shape[1]}×{panel10.shape[0]})")

    # ── CL-00: split by n_items ───────────────────────────────────────────────
    print("[5] Building CL-00 sub-group panels ...")
    cl00 = clusters.get("CL-00", [])
    cl00_n28 = [p for p in cl00 if p['n'] == 28]
    cl00_n22 = [p for p in cl00 if p['n'] == 22]
    cl00_other = [p for p in cl00 if p['n'] not in (28, 22)]
    print(f"    CL-00 total: {len(cl00)}  n=28:{len(cl00_n28)}  n=22:{len(cl00_n22)}  other:{len(cl00_other)}")

    panel00_28 = build_panel(
        title=f"CL-00 / n_items=28  —  {len(cl00_n28)} paths  —  Hypothesis: '8'",
        subtitle="If visually consistent (all show two closed loops = '8'), safe to add n_items-based rule",
        paths=cl00_n28,
        page=page,
        show_orientation=False,
        bg=(200, 215, 240),
    )
    out00_28 = OUT_DIR / "CL-00_n28_subgroup.png"
    cv2.imwrite(str(out00_28), panel00_28)
    print(f"    Saved: {out00_28}  ({panel00_28.shape[1]}×{panel00_28.shape[0]})")

    panel00_22 = build_panel(
        title=f"CL-00 / n_items=22  —  {len(cl00_n22)} paths  —  Hypothesis: '6' or '9' (MIXED?)",
        subtitle="Look for consistent orientation. '6': tail exits TOP.  '9': tail exits BOTTOM.  If both present → keep unknown.",
        paths=cl00_n22,
        page=page,
        show_orientation=True,  # show orientation markers for 6 vs 9 analysis
        bg=(250, 215, 190),
    )
    out00_22 = OUT_DIR / "CL-00_n22_subgroup.png"
    cv2.imwrite(str(out00_22), panel00_22)
    print(f"    Saved: {out00_22}  ({panel00_22.shape[1]}×{panel00_22.shape[0]})")

    if cl00_other:
        panel00_other = build_panel(
            title=f"CL-00 / n_items=other  —  {len(cl00_other)} paths  —  needs_review",
            subtitle="n_items values other than 28 or 22 — check what these are",
            paths=cl00_other,
            page=page,
            bg=(240, 230, 200),
        )
        out00_other = OUT_DIR / "CL-00_other_subgroup.png"
        cv2.imwrite(str(out00_other), panel00_other)
        print(f"    Saved: {out00_other}")

    # ── CL-04: orientation analysis ───────────────────────────────────────────
    print("[6] Building CL-04 orientation panel ...")
    cl04 = clusters.get("CL-04", [])
    n_counts_04 = Counter(p['n'] for p in cl04)
    print(f"    CL-04 members: {len(cl04)}  n_items={dict(sorted(n_counts_04.items()))}")

    # Sort by n_items for clear comparison
    cl04_sorted = sorted(cl04, key=lambda p: (p['n'], p['ar']))

    panel04 = build_panel(
        title=f"CL-04  —  size={len(cl04)}  —  Orientation analysis",
        subtitle=(f"n_items={dict(sorted(n_counts_04.items()))}   "
                  "open:TOP → tail hangs DOWN → '9'   "
                  "open:BOTTOM → tail exits UP → '6'   "
                  "Sorted by n_items then AR"),
        paths=cl04_sorted,
        page=page,
        show_orientation=True,
        bg=(250, 230, 210),
    )
    out04 = OUT_DIR / "CL-04_orientation.png"
    cv2.imwrite(str(out04), panel04)
    print(f"    Saved: {out04}  ({panel04.shape[1]}×{panel04.shape[0]})")

    # ── Context crops reference sheet ─────────────────────────────────────────
    print("[7] Building PDF context crops reference sheet ...")
    ctx_sheet = build_context_sheet(
        ["CL-10", "CL-00", "CL-04"],
        clusters,
        results_data,
        page,
    )
    if ctx_sheet is not None:
        out_ctx = OUT_DIR / "context_crops.png"
        cv2.imwrite(str(out_ctx), ctx_sheet)
        print(f"    Saved: {out_ctx}  ({ctx_sheet.shape[1]}×{ctx_sheet.shape[0]})")

    elapsed = time.time() - t0
    print(f"\n[Done] {elapsed:.1f}s")
    print("\n── Output files ──────────────────────────────────────────────────────")
    for f in sorted(OUT_DIR.iterdir()):
        print(f"  {f}")
    print("──────────────────────────────────────────────────────────────────────")


if __name__ == "__main__":
    main()
