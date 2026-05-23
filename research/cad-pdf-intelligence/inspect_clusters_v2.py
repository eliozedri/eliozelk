"""Quick per-cluster image generator for human labeling (0.05 threshold run)."""
import json
import numpy as np
import cv2
import fitz
from pathlib import Path

PDF = Path("/Users/eliozedri/Downloads/50-448-02-400.pdf")
OUT = Path("outputs/cluster_inspect_v2")
OUT.mkdir(exist_ok=True)

GRAY = (0.57, 0.57, 0.57)
N_MIN, N_MAX = 8, 30
H_MIN, H_MAX = 7.0, 18.0
W_MIN, W_MAX = 4.0, 16.0
CANVAS = 160
MARGIN = 20

def is_gray(c):
    return c and all(abs(c[i] - GRAY[i]) < 0.03 for i in range(3))

def draw_path(path, size=CANVAS, margin=MARGIN):
    canvas = np.ones((size, size, 3), dtype=np.uint8) * 255
    items = path['items']
    x0, y0, x1, y1 = path['x0'], path['y0'], path['x1'], path['y1']
    w = max(x1 - x0, 0.001); h = max(y1 - y0, 0.001)
    dw = size - 2 * margin; dh = size - 2 * margin
    def to_px(px, py):
        ix = int(margin + (px - x0) / w * dw)
        iy = int(margin + (py - y0) / h * dh)
        return (np.clip(ix, 0, size-1), np.clip(iy, 0, size-1))
    for it in items:
        if it[0] != 'l': continue
        cv2.line(canvas, to_px(it[1].x, it[1].y), to_px(it[2].x, it[2].y), (0, 0, 0), 3)
    return canvas

# Load paths from PDF
doc = fitz.open(str(PDF))
page = doc[0]
paths = []
for p in page.get_drawings():
    sc = p.get('color')
    if not is_gray(sc): continue
    fc = p.get('fill')
    if fc is not None: continue
    items = [it for it in p.get('items', []) if it[0] == 'l']
    n = len(items)
    if not (N_MIN <= n <= N_MAX): continue
    r = p['rect']
    w = r.width; h = r.height
    if not (H_MIN <= h <= H_MAX and W_MIN <= w <= W_MAX): continue
    ar = w / max(h, 0.001)
    paths.append({'x0': r.x0, 'y0': r.y0, 'x1': r.x1, 'y1': r.y1, 'n': n, 'ar': round(ar, 2), 'items': items})

print(f"Loaded {len(paths)} candidate paths")

# Load cluster assignments from results
with open("outputs/vector_glyph_results.json") as f:
    results = json.load(f)

# Build path→cluster map using bbox matching
cluster_map = {}
for occ in results:
    for g in (occ.get('glyph_groups') or []):
        # We need per_glyph_info which has cluster per path
        pass
# Use per_glyph_info instead
for occ in results:
    for gi in (occ.get('per_glyph_info') or []):
        cl = gi.get('cluster')
        bp = gi.get('bbox_pt')
        if cl and bp:
            key = (round(bp[0],1), round(bp[1],1), round(bp[2],1), round(bp[3],1))
            cluster_map[key] = cl

print(f"Cluster map entries: {len(cluster_map)}")

# Assign clusters to paths
cluster_paths = {}
for p in paths:
    key = (round(p['x0'],1), round(p['y0'],1), round(p['x1'],1), round(p['y1'],1))
    cl = cluster_map.get(key)
    if cl:
        cluster_paths.setdefault(cl, []).append(p)

print(f"Clusters with paths: {len(cluster_paths)}")

# Draw top clusters (by size, focus on those in adjacent groups)
top_clusters = sorted(cluster_paths.keys(), key=lambda c: -len(cluster_paths[c]))
priority = ['CL-00','CL-01','CL-02','CL-03','CL-04','CL-07','CL-09','CL-10','CL-11',
            'CL-12','CL-13','CL-15','CL-17','CL-22','CL-23','CL-33']
ordered = [c for c in priority if c in cluster_paths] + [c for c in top_clusters if c not in priority]

for cl_id in ordered[:20]:
    ps = cluster_paths[cl_id]
    n_show = min(8, len(ps))
    samples = ps[:n_show]
    row = []
    for p in samples:
        img = draw_path(p)
        label = np.ones((20, CANVAS, 3), dtype=np.uint8) * 240
        cv2.putText(label, f"n={p['n']} AR={p['ar']}", (4, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0,0,0), 1)
        cell = np.vstack([img, label])
        row.append(cell)
    header = np.ones((30, CANVAS * n_show, 3), dtype=np.uint8) * 200
    cv2.putText(header, f"{cl_id}  size={len(ps)}", (6, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0,0,100), 2)
    grid = np.hstack(row)
    out = np.vstack([header, grid])
    cv2.imwrite(str(OUT / f"{cl_id}.png"), out)
    print(f"  {cl_id}: {len(ps)} paths, {n_show} shown")

print("Done.")
