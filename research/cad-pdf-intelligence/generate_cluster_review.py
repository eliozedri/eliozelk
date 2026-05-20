"""
Standalone cluster review image generator for human labeling.

Outputs:
  outputs/vector_glyph_debug/cluster_review_sheet_detailed.png  — full grid
  outputs/vector_glyph_debug/cluster_zoom_review/CL-XX.png       — per-cluster zoom

Does NOT use Tesseract, paid APIs, or modify production systems.
"""
import warnings; warnings.filterwarnings("ignore")
import sys, time
from pathlib import Path
from collections import defaultdict, Counter
from typing import Dict, List, Optional

import numpy as np
import cv2
import fitz
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import cdist, squareform

# ── Paths ────────────────────────────────────────────────────────────────────
BASE     = Path(__file__).parent
PDF_PATH = "/Users/eliozedri/Downloads/50-448-02-400.pdf"
DBG_DIR  = BASE / "outputs" / "vector_glyph_debug"
OUT_DIR  = DBG_DIR / "cluster_zoom_review"
SHEET    = DBG_DIR / "cluster_review_sheet_detailed.png"
DBG_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Extraction filters (must match main script exactly) ───────────────────────
H_MIN, H_MAX   = 7.0,  18.0
W_MIN, W_MAX   = 4.0,  16.0
N_MIN, N_MAX   = 8,    30
AR_MIN, AR_MAX = 0.40, 1.70
GRAY_COLOR     = (0.57, 0.57, 0.57)
GRAY_TOL       = 0.03

# ── Clustering (must match main script exactly) ────────────────────────────────
CLUSTER_DIST_THRESH = 0.05
DESC_SIZE           = 32
DESC_HU_W           = 0.70
DESC_STRUCT_W       = 0.15
DESC_HIST_W         = 0.15
RASTER_SCALE        = 8

# ── Render settings ───────────────────────────────────────────────────────────
CELL_SZ    = 160   # glyph canvas size per sample cell
MARGIN     = 16    # margin inside each glyph canvas
LABEL_H    = 26    # height of per-glyph label strip
MAX_SHOW   = 10    # max samples per cluster on overview sheet
ZOOM_SHOW  = 16    # max samples on per-cluster zoom image

# Ambiguous clusters that need extra attention
AMBIGUOUS = {"CL-04", "CL-13", "CL-23", "CL-33", "CL-12", "CL-15", "CL-22", "CL-00"}

# My pre-analysis assessment (to annotate images)
ASSESSMENT = {
    "CL-00": ("MIXED",           "6 / 8 / 9 — still mixed"),
    "CL-03": ("3",               "HIGH"),
    "CL-04": ("6?",              "MEDIUM — needs review"),
    "CL-07": ("5",               "HIGH"),
    "CL-10": ("0",               "HIGH"),
    "CL-12": ("2?",              "MEDIUM — needs review"),
    "CL-13": ("0?",              "MEDIUM (Tesseract: 3)"),
    "CL-15": ("2?",              "MEDIUM — needs review"),
    "CL-17": ("2",               "HIGH"),
    "CL-22": ("2?",              "MEDIUM — needs review"),
    "CL-23": ("6? or 4?",        "LOW (Tesseract: 4)"),
    "CL-33": ("7?",              "LOW — single sample"),
}


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def is_gray(color):
    if color is None or len(color) != 3:
        return False
    return all(abs(color[i] - GRAY_COLOR[i]) < GRAY_TOL for i in range(3))


def compute_feature(items, x0, y0, w, h):
    """9-dim feature matching main script exactly: [AR, ctr_y, 8-bin angle hist over (-π,π)]."""
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
    """Extract all digit-candidate hairline paths from the page."""
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
            'items': items,
            'feature': feat,   # [0]=AR, [1]=ctr_y, [2:]=8-bin angle hist
        })
    return result


def rasterize(path, page):
    """Rasterize path bbox region to grayscale array."""
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
    """17-dim descriptor: Hu×7 + n_items + AR + angle_hist×8."""
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
    angle_h = path['feature'][2:]   # 8-bin angle histogram (same as main script)
    return np.concatenate([
        hu_part * DESC_HU_W,
        np.array([n_norm, ar_norm]) * DESC_STRUCT_W,
        angle_h * DESC_HIST_W,
    ]).astype(np.float32)


def cluster_paths(paths, page):
    """Hierarchical agglomerative clustering — returns paths with cluster tags."""
    print(f"  Computing descriptors for {len(paths)} paths ...", end="", flush=True)
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
        print("  Pairwise cosine distances ...", end="", flush=True)
        D_pair = cdist(D_mat, D_mat, metric='cosine')
        np.fill_diagonal(D_pair, 0.0)
        D_pair = np.clip(D_pair, 0.0, 2.0)
        condensed = squareform(D_pair)
        print(" done")
        print("  Hierarchical clustering ...", end="", flush=True)
        Z = linkage(condensed, method='average')
        raw_labels = fcluster(Z, t=CLUSTER_DIST_THRESH, criterion='distance')
        print(f" done → {raw_labels.max()} initial clusters")

    label_to_paths = defaultdict(list)
    for path, lbl in zip(paths, raw_labels):
        label_to_paths[int(lbl)].append(path)
    sorted_labels = sorted(label_to_paths.keys(), key=lambda l: -len(label_to_paths[l]))
    cl_id_map = {lbl: f"CL-{i:02d}" for i, lbl in enumerate(sorted_labels)}

    for lbl, grp in label_to_paths.items():
        cl_id = cl_id_map[lbl]
        for p in grp:
            p['cluster'] = cl_id

    return {cl_id_map[lbl]: grp for lbl, grp in label_to_paths.items()}


# ─────────────────────────────────────────────────────────────────────────────
# DRAWING
# ─────────────────────────────────────────────────────────────────────────────

def draw_glyph(path, size=CELL_SZ, margin=MARGIN, line_w=3):
    """Draw one glyph path on a white canvas using cv2.line."""
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


def make_glyph_cell(path, size=CELL_SZ):
    """Draw glyph + metadata strip below."""
    img = draw_glyph(path, size=size)
    strip = np.ones((LABEL_H, size, 3), dtype=np.uint8) * 245
    cv2.putText(strip, f"n={path['n']}  AR={path['ar']:.2f}",
                (4, 17), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (60, 60, 60), 1)
    return np.vstack([img, strip])


def make_cluster_header(cl_id, n_total, assessment, note, is_ambig, w):
    """Render a header bar for a cluster block."""
    h = 44
    bg_color = (255, 230, 210) if is_ambig else (220, 235, 255)
    bar = np.full((h, w, 3), bg_color[::-1], dtype=np.uint8)  # BGR
    label, conf = assessment if assessment else ("?", "unknown")
    main_text = f"{cl_id}   n={n_total}   label={label}   [{conf}]"
    cv2.putText(bar, main_text, (8, 18),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 80), 2)
    cv2.putText(bar, note, (8, 36),
                cv2.FONT_HERSHEY_SIMPLEX, 0.38, (100, 60, 0), 1)
    return bar


def make_cl00_subgroup_header(label, n, w):
    h = 32
    bar = np.full((h, w, 3), (210, 245, 255), dtype=np.uint8)
    cv2.putText(bar, label, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 80, 0), 2)
    return bar


# ─────────────────────────────────────────────────────────────────────────────
# SHEET BUILDERS
# ─────────────────────────────────────────────────────────────────────────────

def build_cluster_row(cl_id, paths, max_show=MAX_SHOW):
    """Build a single row panel for a cluster (header + up to max_show cells)."""
    n_show = min(max_show, len(paths))
    samples = paths[:n_show]
    cells = [make_glyph_cell(p) for p in samples]
    cell_w = CELL_SZ
    cell_h = CELL_SZ + LABEL_H
    row_w = cell_w * n_show
    header = make_cluster_header(
        cl_id, len(paths),
        ASSESSMENT.get(cl_id, ("?", "unknown")),
        f"samples shown: {n_show}/{len(paths)}",
        cl_id in AMBIGUOUS,
        row_w
    )
    row = np.hstack(cells)
    return np.vstack([header, row])


def build_cl00_zoom(paths, max_show=ZOOM_SHOW):
    """Special zoom for CL-00: split by n_items and show subgroups."""
    n28 = [p for p in paths if p['n'] == 28]
    n22 = [p for p in paths if p['n'] == 22]
    other = [p for p in paths if p['n'] not in (28, 22)]

    groups = [
        (f"CL-00 / n_items=28  ({len(n28)} paths)  — likely '8'", n28),
        (f"CL-00 / n_items=22  ({len(n22)} paths)  — likely '6' or '9'", n22),
        (f"CL-00 / n_items=other  ({len(other)} paths)  — unknown", other),
    ]

    blocks = []
    ref_w = None
    for label, grp in groups:
        if not grp:
            continue
        n_show = min(max_show, len(grp))
        cells = [make_glyph_cell(p) for p in grp[:n_show]]
        row_img = np.hstack(cells)
        row_w = row_img.shape[1]
        if ref_w is None:
            ref_w = row_w
        elif row_w < ref_w:
            pad = np.ones((row_img.shape[0], ref_w - row_w, 3), dtype=np.uint8) * 240
            row_img = np.hstack([row_img, pad])
        elif row_w > ref_w:
            row_img = row_img[:, :ref_w]
        header = make_cl00_subgroup_header(label, len(grp), row_img.shape[1])
        blocks.append(np.vstack([header, row_img]))

    if not blocks:
        return None

    # Normalize widths
    max_w = max(b.shape[1] for b in blocks)
    normalized = []
    for b in blocks:
        if b.shape[1] < max_w:
            pad = np.ones((b.shape[0], max_w - b.shape[1], 3), dtype=np.uint8) * 240
            b = np.hstack([b, pad])
        normalized.append(b)

    title_h = 50
    title = np.full((title_h, max_w, 3), (180, 180, 220), dtype=np.uint8)
    cv2.putText(title, "CL-00  MIXED — split by n_items for human review",
                (12, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 100), 2)
    return np.vstack([title] + normalized)


def build_cluster_zoom(cl_id, paths, max_show=ZOOM_SHOW):
    """Full-detail zoom image for one cluster (all samples up to max_show)."""
    n_show = min(max_show, len(paths))
    samples = paths[:n_show]

    # Sort by n_items for easy comparison
    samples_sorted = sorted(samples, key=lambda p: p['n'])

    n_cols = min(8, n_show)
    n_rows = (n_show + n_cols - 1) // n_cols

    cells = [make_glyph_cell(p, size=CELL_SZ) for p in samples_sorted]
    # pad to full grid
    while len(cells) % n_cols != 0:
        blank = np.ones((CELL_SZ + LABEL_H, CELL_SZ, 3), dtype=np.uint8) * 240
        cells.append(blank)

    rows_img = []
    for r in range(n_rows):
        chunk = cells[r * n_cols:(r + 1) * n_cols]
        rows_img.append(np.hstack(chunk))

    grid = np.vstack(rows_img)
    grid_w = grid.shape[1]

    # Title bar
    title_h = 60
    title = np.full((title_h, grid_w, 3), (200, 220, 240), dtype=np.uint8)
    label, conf = ASSESSMENT.get(cl_id, ("?", "unknown"))
    t1 = f"{cl_id}   total_size={len(paths)}   showing={n_show}"
    t2 = f"Suggested label: [{label}]   Confidence: {conf}"
    cv2.putText(title, t1, (10, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 100), 2)
    cv2.putText(title, t2, (10, 44), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (80, 0, 0), 1)

    # n_items distribution footer
    n_counts = Counter(p['n'] for p in paths)
    footer_h = 28
    footer = np.full((footer_h, grid_w, 3), (240, 240, 240), dtype=np.uint8)
    n_text = "n_items dist: " + "  ".join(f"n={k}:{v}" for k, v in sorted(n_counts.items()))
    cv2.putText(footer, n_text, (8, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (60, 60, 60), 1)

    return np.vstack([title, grid, footer])


def build_detail_sheet(clusters_dict):
    """
    Full overview sheet: one row per cluster, sorted by CL id.
    Ambiguous clusters shown first, then HIGH-confidence ones.
    """
    ordered = sorted(clusters_dict.keys(), key=lambda c: (
        0 if c in AMBIGUOUS else 1,  # ambiguous first
        int(c.split('-')[1])          # then by number
    ))

    blocks = []
    for cl_id in ordered:
        paths = clusters_dict[cl_id]
        row = build_cluster_row(cl_id, paths)
        # Add separator
        sep = np.full((6, row.shape[1], 3), 160, dtype=np.uint8)
        blocks.append(row)
        blocks.append(sep)

    if not blocks:
        return None

    max_w = max(b.shape[1] for b in blocks)
    normalized = []
    for b in blocks:
        if b.shape[1] < max_w:
            pad = np.ones((b.shape[0], max_w - b.shape[1], 3), dtype=np.uint8) * 200
            b = np.hstack([b, pad])
        normalized.append(b)

    # Page title
    title_h = 70
    title = np.full((title_h, max_w, 3), (100, 100, 160), dtype=np.uint8)
    cv2.putText(title, "Cluster Review Sheet — DETAILED  (thresh=0.05)",
                (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2)
    cv2.putText(title, "ORANGE header = ambiguous / needs review.  BLUE header = high confidence.",
                (12, 52), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (220, 220, 255), 1)

    return np.vstack([title] + normalized)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    t0 = time.time()
    print(f"[1] Opening PDF: {PDF_PATH}")
    if not Path(PDF_PATH).exists():
        print(f"ERROR: PDF not found at {PDF_PATH}")
        sys.exit(1)
    doc = fitz.open(PDF_PATH)
    page = doc[0]
    print(f"    Page size: {page.rect}")

    print("[2] Extracting digit-candidate paths ...")
    paths = extract_paths(page)
    print(f"    Extracted: {len(paths)} paths")

    print("[3] Clustering (thresh=0.05, cosine, average linkage) ...")
    clusters_dict = cluster_paths(paths, page)
    n_cl = len(clusters_dict)
    print(f"    Clusters: {n_cl}")
    for cl_id in sorted(clusters_dict.keys()):
        grp = clusters_dict[cl_id]
        n_counts = Counter(p['n'] for p in grp)
        print(f"    {cl_id}: size={len(grp)}  n_items={dict(sorted(n_counts.items()))}")

    print("\n[4] Generating per-cluster zoom images ...")
    zoom_paths = []

    for cl_id in sorted(clusters_dict.keys()):
        grp = clusters_dict[cl_id]
        is_ambig = cl_id in AMBIGUOUS

        if cl_id == "CL-00":
            img = build_cl00_zoom(grp, max_show=ZOOM_SHOW)
        else:
            img = build_cluster_zoom(cl_id, grp, max_show=ZOOM_SHOW)

        if img is None:
            print(f"    {cl_id}: skipped (empty)")
            continue

        fname = OUT_DIR / f"{cl_id}.png"
        cv2.imwrite(str(fname), img)
        zoom_paths.append(fname)
        flag = "  *** AMBIGUOUS ***" if is_ambig else ""
        print(f"    {cl_id}: saved ({img.shape[1]}x{img.shape[0]}){flag}")

    print("\n[5] Generating full detail review sheet ...")
    sheet = build_detail_sheet(clusters_dict)
    if sheet is not None:
        cv2.imwrite(str(SHEET), sheet)
        print(f"    Saved: {SHEET}  ({sheet.shape[1]}x{sheet.shape[0]})")

    elapsed = time.time() - t0
    print(f"\n[Done] {elapsed:.1f}s")
    print("\n── Output files ──────────────────────────────────────────────────────")
    print(f"  Review sheet : {SHEET}")
    print(f"  Zoom dir     : {OUT_DIR}")
    for p in sorted(zoom_paths):
        print(f"    {p.name}")
    print("──────────────────────────────────────────────────────────────────────")
    print("Inspect the images, then confirm labels. Do NOT write JSON until approved.")


if __name__ == "__main__":
    main()
