"""
Cluster inspector — draws glyph vector paths directly from line segments.
Bypasses PDF rasterizer; each path rendered as a pure vector drawing.
Saves outputs/cluster_inspect/ for human labeling.
"""
import json
from pathlib import Path
from collections import defaultdict
import numpy as np
import cv2
import fitz

BASE     = Path(__file__).parent
OUT      = BASE / "outputs" / "cluster_inspect"
OUT.mkdir(parents=True, exist_ok=True)
PDF_PATH = "/Users/eliozedri/Downloads/50-448-02-400.pdf"
CANVAS   = 128    # px
MARGIN   = 12     # px padding inside canvas

GRAY_COLOR = (0.57, 0.57, 0.57)
GRAY_TOL   = 0.03
H_MIN, H_MAX = 7.0, 18.0
W_MIN, W_MAX = 4.0, 16.0
N_MIN, N_MAX = 8, 30
AR_MIN, AR_MAX = 0.40, 1.70

def _is_gray(c):
    return (c and len(c)==3 and
            all(abs(c[i]-GRAY_COLOR[i]) < GRAY_TOL for i in range(3)))

doc  = fitz.open(PDF_PATH)
page = doc[0]
raw  = page.get_drawings()

# Re-extract paths (same filter)
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

print(f"Extracted {len(paths)} paths")

# Load cluster assignments from v2 results
results_path = BASE / "outputs" / "vector_glyph_results.json"
with open(results_path) as f:
    results = json.load(f)

# Build cluster→paths map by matching bbox
# We'll re-cluster by matching n_items and bounding box proximity
# Simpler: re-run the descriptor pipeline with cluster assignment from saved data
# Actually: we'll group by (n, round(ar,1)) as a proxy for cluster
# — but that's imprecise. Better: sort paths and do a fresh grouping by n_items buckets.

# Since we stored cluster IDs on paths in memory during the run,
# and the v2 JSON stores per_glyph_info with cluster IDs, let's use those
# to back-reference the matching path by bbox.

# Build a lookup: (round(x0,0), round(y0,0), n) → cluster_id
bbox_to_cluster = {}
for r in results:
    for g in r.get('per_glyph_info', []):
        bb = g.get('bbox_pt')
        if bb and g.get('cluster'):
            key = (round(bb[0]), round(bb[1]), g.get('n_items',0))
            bbox_to_cluster[key] = g['cluster']

# Assign cluster to each extracted path
for p in paths:
    key = (round(p['x0']), round(p['y0']), p['n'])
    p['cluster'] = bbox_to_cluster.get(key)

cluster_paths = defaultdict(list)
for p in paths:
    if p['cluster']:
        cluster_paths[p['cluster']].append(p)

print(f"Clusters assigned: {len(cluster_paths)}")

def draw_path(path, size=CANVAS, margin=MARGIN):
    """Draw one path's line segments directly on a white canvas."""
    canvas = np.ones((size, size, 3), dtype=np.uint8) * 255
    items  = path['items']
    x0, y0, x1, y1 = path['x0'], path['y0'], path['x1'], path['y1']
    w = max(x1 - x0, 0.001)
    h = max(y1 - y0, 0.001)
    draw_w = size - 2 * margin
    draw_h = size - 2 * margin

    def to_px(px, py):
        ix = int(margin + (px - x0) / w * draw_w)
        iy = int(margin + (py - y0) / h * draw_h)
        return (np.clip(ix, 0, size-1), np.clip(iy, 0, size-1))

    for it in items:
        if it[0] != 'l': continue
        p1 = to_px(it[1].x, it[1].y)
        p2 = to_px(it[2].x, it[2].y)
        cv2.line(canvas, p1, p2, (0, 0, 0), 2)

    return canvas

# For each cluster: draw up to 6 representative paths side by side
for cl_id in sorted(cluster_paths.keys()):
    cl_list = cluster_paths[cl_id]
    n_samples = min(6, len(cl_list))
    # Pick diverse samples (spread across the list)
    step = max(1, len(cl_list) // n_samples)
    samples = cl_list[::step][:n_samples]

    frames = [draw_path(p) for p in samples]
    row = np.hstack(frames)
    # Add label strip on left
    label_strip = np.ones((CANVAS, 130, 3), dtype=np.uint8) * 240
    cv2.putText(label_strip, cl_id, (4, 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,0,0), 1)
    cv2.putText(label_strip, f"n={cl_list[0]['n']}", (4, 40),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (60,60,60), 1)
    cv2.putText(label_strip, f"AR={cl_list[0]['ar']:.2f}", (4, 58),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (60,60,60), 1)
    cv2.putText(label_strip, f"sz={len(cl_list)}", (4, 76),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (60,60,60), 1)
    combined = np.hstack([label_strip, row])
    out_path = OUT / f"{cl_id}_vector.png"
    cv2.imwrite(str(out_path), combined)

# Also make a single full-sheet grid
all_rows = []
for cl_id in sorted(cluster_paths.keys()):
    cl_list = cluster_paths[cl_id]
    n_samples = min(6, len(cl_list))
    step = max(1, len(cl_list) // n_samples)
    samples = cl_list[::step][:n_samples]
    frames = [draw_path(p) for p in samples]
    # Pad to 6 frames
    while len(frames) < 6:
        frames.append(np.ones((CANVAS, CANVAS, 3), dtype=np.uint8)*220)
    row = np.hstack(frames)
    label_strip = np.ones((CANVAS, 130, 3), dtype=np.uint8) * 240
    cv2.putText(label_strip, cl_id, (4, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,0,0), 1)
    cv2.putText(label_strip, f"n={cl_list[0]['n']} AR={cl_list[0]['ar']:.2f} sz={len(cl_list)}",
                (4, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (60,60,60), 1)
    combined = np.hstack([label_strip, row])
    all_rows.append(combined)

sheet = np.vstack(all_rows)
cv2.imwrite(str(OUT / "ALL_CLUSTERS_vector.png"), sheet)
print(f"Done. Files in {OUT}")
for f in sorted(OUT.iterdir()):
    print(f"  {f.name}")
