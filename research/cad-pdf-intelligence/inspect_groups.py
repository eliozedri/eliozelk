"""
Draw each of the 21 adjacent groups as a left-to-right glyph sequence.
Outputs: outputs/group_inspect/group_NNN.png
Also saves outputs/group_inspect/ALL_GROUPS.png (full sheet).
"""
import json
from pathlib import Path
from collections import defaultdict
import numpy as np
import cv2
import fitz

BASE     = Path(__file__).parent
OUT      = BASE / "outputs" / "group_inspect"
OUT.mkdir(parents=True, exist_ok=True)
PDF_PATH = "/Users/eliozedri/Downloads/50-448-02-400.pdf"

GRAY_COLOR = (0.57, 0.57, 0.57)
GRAY_TOL   = 0.03
H_MIN, H_MAX = 7.0, 18.0
W_MIN, W_MAX = 4.0, 16.0
N_MIN, N_MAX = 8, 30
AR_MIN, AR_MAX = 0.40, 1.70
GAP_MAX, Y_TOL, H_RATIO = 7.0, 3.0, 1.40
CANVAS = 180

def _is_gray(c):
    return (c and len(c)==3 and
            all(abs(c[i]-GRAY_COLOR[i]) < GRAY_TOL for i in range(3)))

doc  = fitz.open(PDF_PATH)
page = doc[0]
raw  = page.get_drawings()

paths = []
for p in raw:
    if p.get('type') != 's': continue
    if not _is_gray(p.get('color')): continue
    pr = p.get('rect')
    if not pr: continue
    items = p.get('items', [])
    if not items or not all(it[0]=='l' for it in items): continue
    n = len(items)
    if not (N_MIN <= n <= N_MAX): continue
    h, w = float(pr.height), float(pr.width)
    if not (H_MIN <= h <= H_MAX) or not (W_MIN <= w <= W_MAX): continue
    ar = w / max(h, 0.001)
    if not (AR_MIN <= ar <= AR_MAX): continue
    paths.append({'n': n, 'ar': ar, 'h': h, 'w': w,
                  'x0': float(pr.x0), 'y0': float(pr.y0),
                  'x1': float(pr.x1), 'y1': float(pr.y1),
                  'items': items})

# Detect adjacent groups (same logic as main script)
sorted_paths = sorted(paths, key=lambda p: (round(p['y0']/2)*2, p['x0']))
adj_groups = []
i = 0
while i < len(sorted_paths):
    grp = [sorted_paths[i]]
    j = i + 1
    while j < len(sorted_paths):
        prev, nxt = grp[-1], sorted_paths[j]
        gap   = nxt['x0'] - prev['x1']
        ydiff = abs(nxt['y0'] - prev['y0'])
        hr    = max(prev['h'], nxt['h']) / max(min(prev['h'], nxt['h']), 0.001)
        if gap <= GAP_MAX and ydiff <= Y_TOL and hr <= H_RATIO:
            grp.append(nxt); j += 1
        else: break
    if 2 <= len(grp) <= 4:
        adj_groups.append(grp); i = j
    else: i += 1

print(f"Adjacent groups: {len(adj_groups)}")

def draw_path(path, size=CANVAS, margin=18):
    canvas = np.ones((size, size, 3), dtype=np.uint8) * 255
    items = path['items']
    x0, y0, x1, y1 = path['x0'], path['y0'], path['x1'], path['y1']
    w_range = max(x1-x0, 0.001)
    h_range = max(y1-y0, 0.001)
    dw = size - 2*margin
    dh = size - 2*margin
    def to_px(px, py):
        ix = int(margin + (px-x0)/w_range*dw)
        iy = int(margin + (py-y0)/h_range*dh)
        return (np.clip(ix,0,size-1), np.clip(iy,0,size-1))
    for it in items:
        if it[0]!='l': continue
        cv2.line(canvas, to_px(it[1].x, it[1].y), to_px(it[2].x, it[2].y), (0,0,0), 2)
    return canvas

# Also load OCC results so we can annotate which OCC each group matches
results_path = BASE / "outputs" / "vector_glyph_results.json"
with open(results_path) as f:
    results = json.load(f)

# Build a set of (round(x0), round(y0)) for each matched group in results
matched_positions = set()
matched_occ_map = {}  # position key → occ_id
for r in results:
    for g in r.get('glyph_groups', []):
        pass  # glyph_groups don't have individual glyph bboxes easily
    for gi in r.get('per_glyph_info', []):
        bb = gi.get('bbox_pt')
        if bb:
            key = (round(bb[0]), round(bb[1]))
            matched_occ_map[key] = r['occurrence_id']

all_rows = []
for gi, grp in enumerate(adj_groups):
    sorted_grp = sorted(grp, key=lambda p: p['x0'])
    frames = [draw_path(p) for p in sorted_grp]
    row_img = np.hstack(frames)

    # Find OCC match
    occ_ids = set()
    for p in grp:
        key = (round(p['x0']), round(p['y0']))
        if key in matched_occ_map:
            occ_ids.add(matched_occ_map[key])
    occ_str = ','.join(sorted(occ_ids)) or 'unmatched'

    # Info strip
    n_seq = '/'.join(str(p['n']) for p in sorted_grp)
    ar_seq = '/'.join(f"{p['ar']:.2f}" for p in sorted_grp)
    info_h = CANVAS
    info_w = 200
    info = np.ones((info_h, info_w, 3), dtype=np.uint8) * 240
    cv2.putText(info, f"G{gi:02d}", (4, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,0,0), 1)
    cv2.putText(info, f"n={n_seq}", (4, 42), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (40,40,40), 1)
    cv2.putText(info, f"AR={ar_seq}", (4, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (40,40,40), 1)
    cv2.putText(info, occ_str[:22], (4, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.33, (0,0,160), 1)

    combined = np.hstack([info, row_img])
    out_path = OUT / f"G{gi:02d}_n{n_seq.replace('/','_')}.png"
    cv2.imwrite(str(out_path), combined)
    all_rows.append(combined)

sheet = np.vstack(all_rows)
cv2.imwrite(str(OUT / "ALL_GROUPS.png"), sheet)
print(f"Done. {len(adj_groups)} groups saved to {OUT}")
