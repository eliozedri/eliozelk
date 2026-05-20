"""
Targeted orientation analysis: CL-00 n=22 paths in OCC-0112 / OCC-0120 / OCC-0121.

For each OCC, shows:
  - Left:  orientation-annotated glyph of the CL-00 n=22 path
  - Right: PDF context crop centred on that path (not the OCC sign)
  - Bottom strip: metadata including x-distance between digit group and OCC sign

Outputs:
  outputs/vector_glyph_debug/cl00_n22_orientation/OCC-0112.png
  outputs/vector_glyph_debug/cl00_n22_orientation/OCC-0120.png
  outputs/vector_glyph_debug/cl00_n22_orientation/OCC-0121.png
  outputs/vector_glyph_debug/cl00_n22_orientation/summary.png
"""
import warnings; warnings.filterwarnings("ignore")
import sys, json
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
import cv2
import fitz

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE     = Path(__file__).parent
PDF_PATH = "/Users/eliozedri/Downloads/50-448-02-400.pdf"
OUT_DIR  = BASE / "outputs" / "vector_glyph_debug" / "cl00_n22_orientation"
RES_JSON = BASE / "outputs" / "vector_glyph_results.json"
OUT_DIR.mkdir(parents=True, exist_ok=True)

TARGET_OCCS = ["OCC-0112", "OCC-0120", "OCC-0121"]

# Same extraction constants as main script
H_MIN, H_MAX    = 7.0,  18.0
W_MIN, W_MAX    = 4.0,  16.0
N_MIN, N_MAX    = 8,    30
AR_MIN, AR_MAX  = 0.40, 1.70
GRAY_COLOR      = (0.57, 0.57, 0.57)
GRAY_TOL        = 0.03

BIG       = 260   # glyph canvas size
MARGIN    = 28
RASTER_SC = 8
CTX_SC    = 12    # PDF context render scale


def is_gray(c):
    return (c is not None and len(c) == 3 and
            all(abs(c[i] - GRAY_COLOR[i]) < GRAY_TOL for i in range(3)))


def extract_paths(page):
    out = []
    for p in page.get_drawings():
        if p.get('type') != 's' or not is_gray(p.get('color')):
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
        out.append({
            'x0': float(r.x0), 'y0': float(r.y0),
            'x1': float(r.x1), 'y1': float(r.y1),
            'w': w, 'h': h, 'n': n, 'ar': round(ar, 3),
            'items': items,
        })
    return out


def find_path_by_bbox(paths, bbox_pt, tol=0.5):
    """Return the extracted path whose bbox matches bbox_pt within tol."""
    x0t, y0t, x1t, y1t = bbox_pt
    for p in paths:
        if (abs(p['x0'] - x0t) < tol and abs(p['y0'] - y0t) < tol and
                abs(p['x1'] - x1t) < tol and abs(p['y1'] - y1t) < tol):
            return p
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Drawing helpers
# ─────────────────────────────────────────────────────────────────────────────

def draw_oriented(path, size=BIG, margin=MARGIN, lw=5) -> Tuple[np.ndarray, str]:
    """Draw glyph with red-start / green-end markers. Returns (image, opening_str)."""
    canvas = np.ones((size, size, 3), dtype=np.uint8) * 255
    items  = [it for it in path['items'] if it[0] == 'l']
    x0, y0 = path['x0'], path['y0']
    w = max(path['x1'] - x0, 0.001)
    h = max(path['y1'] - y0, 0.001)
    dw, dh = size - 2 * margin, size - 2 * margin

    def px(vx, vy):
        ix = int(margin + (vx - x0) / w * dw)
        iy = int(margin + (vy - y0) / h * dh)
        return (np.clip(ix, 0, size-1), np.clip(iy, 0, size-1))

    for it in items:
        cv2.line(canvas, px(it[1].x, it[1].y), px(it[2].x, it[2].y), (0, 0, 0), lw)

    if not items:
        return canvas, "no_segments"

    start_pt = px(items[0][1].x, items[0][1].y)
    end_pt   = px(items[-1][2].x, items[-1][2].y)
    mids     = [px((it[1].x + it[2].x)/2, (it[1].y + it[2].y)/2) for it in items]
    cx       = int(np.mean([m[0] for m in mids]))
    cy       = int(np.mean([m[1] for m in mids]))

    cv2.circle(canvas, start_pt, 9, (0, 0, 220), -1)    # RED  = start
    cv2.circle(canvas, end_pt,   9, (0, 180, 0),  -1)    # GREEN = end
    cv2.drawMarker(canvas, (cx, cy), (220, 100, 0), cv2.MARKER_CROSS, 16, 2)

    gx = (start_pt[0] + end_pt[0]) / 2 - cx
    gy = (start_pt[1] + end_pt[1]) / 2 - cy
    if abs(gx) > abs(gy):
        opening = "RIGHT" if gx > 0 else "LEFT"
    else:
        opening = "BOTTOM" if gy > 0 else "TOP"

    # Assessment label
    if opening == "BOTTOM":
        assess = "likely 6 (open:BOTTOM)"
        col = (0, 140, 0)
    elif opening == "TOP":
        assess = "likely 9 (open:TOP)"
        col = (0, 100, 200)
    else:
        assess = f"ambiguous (open:{opening})"
        col = (0, 0, 160)

    cv2.putText(canvas, f"open:{opening}", (6, size - 38),
                cv2.FONT_HERSHEY_SIMPLEX, 0.52, col, 2)
    cv2.putText(canvas, assess, (6, size - 14),
                cv2.FONT_HERSHEY_SIMPLEX, 0.44, col, 1)
    return canvas, opening


def ctx_crop(path, page, margin_pt=30.0, scale=CTX_SC) -> Optional[np.ndarray]:
    clip = fitz.Rect(path['x0'] - margin_pt, path['y0'] - margin_pt,
                     path['x1'] + margin_pt, path['y1'] + margin_pt)
    try:
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale),
                              clip=clip, colorspace=fitz.csRGB)
        return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, 3).copy()
    except Exception:
        return None


def occ_ctx_crop(occ_bbox, page, margin_pt=25.0, scale=CTX_SC) -> Optional[np.ndarray]:
    """Render context crop around the OCC sign bbox."""
    x0, y0, x1, y1 = occ_bbox
    clip = fitz.Rect(x0 - margin_pt, y0 - margin_pt, x1 + margin_pt, y1 + margin_pt)
    try:
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale),
                              clip=clip, colorspace=fitz.csRGB)
        return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, 3).copy()
    except Exception:
        return None


def resize_h(img, target_h):
    h, w = img.shape[:2]
    if h == 0 or w == 0:
        return np.full((target_h, target_h, 3), 200, dtype=np.uint8)
    if h == target_h:
        return img
    nw = max(1, int(w * target_h / h))
    return cv2.resize(img, (nw, target_h), interpolation=cv2.INTER_AREA)


def label_strip(text: str, width: int, height: int = 32,
                bg=(245, 245, 245), fc=(30, 30, 30)) -> np.ndarray:
    s = np.full((height, width, 3), bg[::-1], dtype=np.uint8)
    # split long text across lines if needed
    lines = text.split('\n')
    y = 18
    for line in lines[:2]:
        cv2.putText(s, line, (6, y), cv2.FONT_HERSHEY_SIMPLEX, 0.38, fc[::-1], 1)
        y += 14
    return s


def legend_strip(width: int) -> np.ndarray:
    h = 30
    leg = np.full((h, width, 3), (250, 250, 250), dtype=np.uint8)
    cv2.circle(leg, (14, 15), 7, (0, 0, 220), -1)
    cv2.putText(leg, "= path start", (24, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (40,40,40), 1)
    cv2.circle(leg, (160, 15), 7, (0, 180, 0), -1)
    cv2.putText(leg, "= path end", (170, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (40,40,40), 1)
    cv2.drawMarker(leg, (310, 15), (220, 100, 0), cv2.MARKER_CROSS, 12, 2)
    cv2.putText(leg, "= centroid", (325, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (40,40,40), 1)
    cv2.putText(leg, "open:BOTTOM => likely '6'   open:TOP => likely '9'   open:LEFT/RIGHT => ambiguous",
                (460, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (100, 0, 100), 1)
    return leg


def title_bar(text: str, width: int, bg=(200, 215, 240)) -> np.ndarray:
    bar = np.full((52, width, 3), bg[::-1], dtype=np.uint8)
    cv2.putText(bar, text, (10, 34), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 80), 2)
    return bar


# ─────────────────────────────────────────────────────────────────────────────
# Build one OCC panel
# ─────────────────────────────────────────────────────────────────────────────

def build_occ_panel(occ_id: str, cl00_n22_path, occ_bbox, group_info, page) -> np.ndarray:
    """
    Panel layout (left to right):
      [oriented glyph] | [path context crop] | [OCC sign context crop]
    Below: metadata strip with opening assessment + spatial distance note.
    """
    glyph_img, opening = draw_oriented(cl00_n22_path)

    path_ctx = ctx_crop(cl00_n22_path, page, margin_pt=35)
    sign_ctx = occ_ctx_crop(occ_bbox, page, margin_pt=30)

    # Compute spatial distance between path centroid and OCC centroid
    path_cx = (cl00_n22_path['x0'] + cl00_n22_path['x1']) / 2
    path_cy = (cl00_n22_path['y0'] + cl00_n22_path['y1']) / 2
    occ_cx  = (occ_bbox[0] + occ_bbox[2]) / 2
    occ_cy  = (occ_bbox[1] + occ_bbox[3]) / 2
    dist_x  = abs(path_cx - occ_cx)
    dist_y  = abs(path_cy - occ_cy)
    dist_pt = (dist_x**2 + dist_y**2)**0.5

    # Assessment text
    if opening == "BOTTOM":
        assess = "LIKELY 6 (open:BOTTOM, tail exits upward)"
    elif opening == "TOP":
        assess = "LIKELY 9 (open:TOP, tail hangs downward)"
    else:
        assess = f"AMBIGUOUS (open:{opening} — not 6 or 9)"

    # Build top row
    target_h = BIG
    cols = [glyph_img]

    if path_ctx is not None:
        pc = resize_h(path_ctx, target_h - 4)
        pc = cv2.copyMakeBorder(pc, 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=(160,160,160))
        if pc.shape[0] != target_h:
            pc = cv2.resize(pc, (pc.shape[1], target_h))
        cols.append(pc)

    if sign_ctx is not None:
        sc = resize_h(sign_ctx, target_h - 4)
        sc = cv2.copyMakeBorder(sc, 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=(180, 100, 100))
        if sc.shape[0] != target_h:
            sc = cv2.resize(sc, (sc.shape[1], target_h))
        cols.append(sc)

    top_row = np.hstack(cols)
    panel_w = top_row.shape[1]

    # Metadata strip
    meta1 = (f"{occ_id}  |  CL-00 n={cl00_n22_path['n']}  AR={cl00_n22_path['ar']:.2f}"
             f"  path@({cl00_n22_path['x0']:.0f},{cl00_n22_path['y0']:.0f})  "
             f"occ@({occ_bbox[0]:.0f},{occ_bbox[1]:.0f})")
    meta2 = (f"dist(path→sign): dx={dist_x:.0f}pt  dy={dist_y:.0f}pt  d={dist_pt:.0f}pt  "
             f"|  group x_span={group_info['x_span']:.0f}pt  "
             f"|  assessment: {assess}")

    strip_h = 54
    strip = np.full((strip_h, panel_w, 3), (245, 245, 245), dtype=np.uint8)
    cv2.putText(strip, meta1, (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (30,30,30), 1)
    cv2.putText(strip, meta2, (6, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (0,0,120), 1)

    # Warning if path is far from sign
    if dist_pt > 100:
        warn = f"WARNING: digit path is {dist_pt:.0f}pt from sign — likely false adjacency group"
        cv2.putText(strip, warn, (6, strip_h - 6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.36, (0, 0, 220), 1)

    # Section labels above each column
    col_labels_h = 22
    col_labels = np.full((col_labels_h, panel_w, 3), (220, 220, 235), dtype=np.uint8)
    cv2.putText(col_labels, "GLYPH + ORIENTATION (CL-00 n=22 path)",
                (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0,0,80), 1)
    if path_ctx is not None:
        lx = glyph_img.shape[1] + 6
        cv2.putText(col_labels, "PDF context @ glyph location",
                    (lx, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0,80,0), 1)
    if sign_ctx is not None:
        lx2 = glyph_img.shape[1] + (cols[1].shape[1] if len(cols) > 1 else 0) + 6
        cv2.putText(col_labels, "OCC SIGN context (red border)",
                    (lx2, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0,0,160), 1)

    return np.vstack([col_labels, top_row, strip])


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    print("[1] Opening PDF ...")
    doc = fitz.open(PDF_PATH)
    page = doc[0]

    print("[2] Extracting paths ...")
    all_paths = extract_paths(page)
    print(f"    {len(all_paths)} paths")

    print("[3] Loading results JSON ...")
    with open(RES_JSON) as f:
        results = json.load(f)

    occ_panels = []
    out_files  = []

    for occ_id in TARGET_OCCS:
        rec = next((r for r in results if r['occurrence_id'] == occ_id), None)
        if rec is None:
            print(f"  {occ_id}: NOT FOUND in results JSON")
            continue

        # Find the CL-00 n=22 path (first position, leftmost, label=None)
        cl00_glyph = next(
            (g for g in rec['per_glyph_info']
             if g['cluster'] == 'CL-00' and g['n_items'] == 22),
            None
        )
        if cl00_glyph is None:
            print(f"  {occ_id}: no CL-00 n=22 glyph found")
            continue

        bbox_pt  = cl00_glyph['bbox_pt']  # [x0, y0, x1, y1]
        occ_bbox = rec['pdf_bbox']        # [x0, y0, x1, y1]

        # Match physical path
        path = find_path_by_bbox(all_paths, bbox_pt)
        if path is None:
            print(f"  {occ_id}: could not match CL-00 n=22 path from bbox {bbox_pt}")
            continue

        # Get group info (x_span)
        best_group = max(
            (g for g in rec.get('glyph_groups', []) if g['n_paths'] == 3),
            key=lambda g: g.get('n_paths', 0),
            default={'x_span': 0}
        )
        group_info = {'x_span': best_group.get('x_span_pt', 0)}

        print(f"  {occ_id}: path found  n={path['n']}  bbox=({path['x0']:.1f},{path['y0']:.1f})")

        panel = build_occ_panel(occ_id, path, occ_bbox, group_info, page)

        # Add title + legend
        pw = panel.shape[1]
        tb = title_bar(
            f"CL-00 n=22 Orientation Analysis  —  {occ_id}  —  ('6' vs '9' check)",
            pw
        )
        leg = legend_strip(pw)
        full = np.vstack([tb, leg, panel])

        out = OUT_DIR / f"{occ_id}.png"
        cv2.imwrite(str(out), full)
        print(f"    Saved: {out}  ({full.shape[1]}×{full.shape[0]})")
        out_files.append(out)
        occ_panels.append(full)

    # Combined summary sheet
    if occ_panels:
        max_w = max(p.shape[1] for p in occ_panels)
        normalized = []
        for p in occ_panels:
            if p.shape[1] < max_w:
                pad = np.full((p.shape[0], max_w - p.shape[1], 3), 240, dtype=np.uint8)
                p = np.hstack([p, pad])
            normalized.append(p)

        sep = np.full((6, max_w, 3), 120, dtype=np.uint8)
        sheet_parts = []
        for p in normalized:
            sheet_parts.append(p)
            sheet_parts.append(sep)
        summary = np.vstack(sheet_parts)

        # Summary title
        sh_bar = np.full((60, max_w, 3), (180, 210, 200), dtype=np.uint8)
        cv2.putText(sh_bar, "CL-00 n=22 Orientation — All 3 OCCs  (OCC-0112 / OCC-0120 / OCC-0121)",
                    (10, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 80), 2)
        cv2.putText(sh_bar, "NOTE: All 3 OCCs reference the SAME physical path. See spatial distance warnings in each strip.",
                    (10, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (160, 0, 0), 1)
        summary = np.vstack([sh_bar, summary])

        out_summary = OUT_DIR / "summary.png"
        cv2.imwrite(str(out_summary), summary)
        print(f"    Saved summary: {out_summary}")
        out_files.append(out_summary)

    print("\n── Output files ──────────────────────────────────────────────────────")
    for f in out_files:
        print(f"  {f}")
    print("──────────────────────────────────────────────────────────────────────")


if __name__ == "__main__":
    main()
