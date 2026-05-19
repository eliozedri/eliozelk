#!/usr/bin/env python3
"""
Stage 3 — Color and Geometry Analysis
- Detailed color distribution per semantic bucket
- Density map: divide page into grid, count paths per cell
- Size distribution of filled shapes
- Repeated-pattern detection (identical size+color combinations)
- Object density hot-zones

Input: reads PDF directly + loads vector_objects.json (for candidate symbols)
Output: outputs/color_geometry_report.json
"""

import sys
import math
from pathlib import Path
from collections import Counter, defaultdict

import fitz

from cad_utils import bucket_color, SEMANTIC_HINT, save_json, load_json


DEFAULT_PDF = "/Users/eliozedri/Downloads/50-448-02-400.pdf"

# Density grid dimensions
GRID_COLS = 24
GRID_ROWS = 14


def analyze(pdf_path: str) -> dict:
    path = Path(pdf_path)
    doc  = fitz.open(str(path))
    page = doc[0]
    page_w = page.rect.width
    page_h = page.rect.height

    cell_w = page_w / GRID_COLS
    cell_h = page_h / GRID_ROWS

    # Per-bucket accumulator
    bucket_stats = defaultdict(lambda: {
        "total_paths": 0,
        "filled_paths": 0,
        "stroked_paths": 0,
        "item_types": Counter(),
        "semantic": "",
    })

    # Density grid — counts all paths whose centroid falls in a cell
    density_grid = [[0] * GRID_COLS for _ in range(GRID_ROWS)]

    # Filled-shape size×color patterns
    size_color_patterns = Counter()

    # Accumulate per-color: list of bboxes for spatial analysis
    color_positions = defaultdict(list)   # bucket → [cx, cy, ...]

    drawings = page.get_drawings()
    for d in drawings:
        fill   = d.get("fill")
        stroke = d.get("color")
        rect   = d.get("rect")
        items  = d.get("items", [])

        # Primary color = fill if present, else stroke
        primary_bucket = bucket_color(fill) if fill else bucket_color(stroke)
        bs = bucket_stats[primary_bucket]
        bs["total_paths"] += 1
        bs["semantic"] = SEMANTIC_HINT.get(primary_bucket, "unclassified")
        if fill:
            bs["filled_paths"] += 1
        if stroke:
            bs["stroked_paths"] += 1
        for item in items:
            t = item[0]
            label = {"l": "line", "c": "bezier", "re": "rect", "qu": "quad"}.get(t, "other")
            bs["item_types"][label] += 1

        # Density grid
        if rect:
            cx = (rect.x0 + rect.x1) / 2
            cy = (rect.y0 + rect.y1) / 2
            col = min(int(cx / cell_w), GRID_COLS - 1)
            row = min(int(cy / cell_h), GRID_ROWS - 1)
            density_grid[row][col] += 1
            color_positions[primary_bucket].append([round(cx, 0), round(cy, 0)])

        # Size+color pattern for filled shapes in symbol range
        if fill and rect:
            w = rect.width
            h = rect.height
            if 5 <= w <= 350 and 5 <= h <= 350:
                key = f"{round(w)}x{round(h)}_{bucket_color(fill)}"
                size_color_patterns[key] += 1

    doc.close()

    # ── Repeated patterns (potential sign families) ────────────────────────────
    repeated = []
    for pattern, count in size_color_patterns.most_common(40):
        if count >= 3:
            size_str, _, color = pattern.rpartition("_")
            w_str, _, h_str = size_str.partition("x")
            repeated.append({
                "pattern":  pattern,
                "count":    count,
                "size_pts": f"{w_str}×{h_str}",
                "color":    color,
                "semantic": SEMANTIC_HINT.get(color, "unclassified"),
            })

    # ── Density hot-zones (top 10 cells) ──────────────────────────────────────
    flat_cells = []
    for r in range(GRID_ROWS):
        for c in range(GRID_COLS):
            cnt = density_grid[r][c]
            if cnt > 0:
                flat_cells.append({
                    "row": r, "col": c,
                    "count": cnt,
                    "x_range": [round(c * cell_w, 0), round((c + 1) * cell_w, 0)],
                    "y_range": [round(r * cell_h, 0), round((r + 1) * cell_h, 0)],
                })
    flat_cells.sort(key=lambda x: -x["count"])
    hot_zones = flat_cells[:15]

    # ── Compact bucket summary ─────────────────────────────────────────────────
    bucket_summary = {}
    for bucket, stats in sorted(bucket_stats.items(), key=lambda x: -x[1]["total_paths"]):
        bucket_summary[bucket] = {
            "total_paths":   stats["total_paths"],
            "filled_paths":  stats["filled_paths"],
            "stroked_paths": stats["stroked_paths"],
            "item_types":    dict(stats["item_types"].most_common()),
            "semantic":      stats["semantic"],
        }

    # ── Color spatial spread (std dev of positions) ───────────────────────────
    color_spread = {}
    for bucket, positions in color_positions.items():
        if len(positions) < 4:
            continue
        xs = [p[0] for p in positions]
        ys = [p[1] for p in positions]
        mean_x = sum(xs) / len(xs)
        mean_y = sum(ys) / len(ys)
        std_x  = math.sqrt(sum((x - mean_x) ** 2 for x in xs) / len(xs))
        std_y  = math.sqrt(sum((y - mean_y) ** 2 for y in ys) / len(ys))
        color_spread[bucket] = {
            "count":  len(positions),
            "mean":   [round(mean_x, 1), round(mean_y, 1)],
            "std":    [round(std_x, 1), round(std_y, 1)],
            "spread": "wide" if std_x > page_w * 0.25 else "concentrated",
        }

    # ── Size buckets for filled shapes (5–350px) ──────────────────────────────
    # Load from stage 2 if available, else recount
    try:
        v2 = load_json("vector_objects.json")
        size_distribution = v2.get("size_distribution", {})
    except Exception:
        size_distribution = {}

    return {
        "source_pdf": path.name,
        "page_size_pts": [round(page_w, 1), round(page_h, 1)],
        "grid": {
            "cols": GRID_COLS,
            "rows": GRID_ROWS,
            "cell_size_pts": [round(cell_w, 1), round(cell_h, 1)],
        },
        "bucket_summary":      bucket_summary,
        "color_spatial_spread": color_spread,
        "repeated_patterns":   repeated,
        "hot_zones":           hot_zones,
        "density_grid":        density_grid,
        "size_distribution":   size_distribution,
        "interpretation": {
            "dominant_structure":  "black paths form road outlines and structural geometry",
            "road_fill":           "gray_mid paths fill road carriageways",
            "sign_candidates":     "red and blue filled shapes are primary sign candidates",
            "marking_candidates":  "yellow filled shapes are road marking candidates",
            "work_zone_elements":  "orange filled shapes mark work zone barriers/cones",
            "note": (
                "Wide spread of a color = distributed across the whole plan "
                "(structural, markings). Concentrated = signs clustered in work zone."
            ),
        },
    }


def main():
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PDF
    print(f"[03_analyze_colors_geometry] {pdf_path}")

    data = analyze(pdf_path)
    out  = save_json(data, "color_geometry_report.json")
    print(f"  Saved → {out}")

    print(f"\n  Color bucket breakdown:")
    print(f"  {'Bucket':<16} {'Total':>8} {'Filled':>8} {'Semantic'}")
    print(f"  {'-'*58}")
    for bucket, stats in data["bucket_summary"].items():
        print(f"  {bucket:<16} {stats['total_paths']:>8,} {stats['filled_paths']:>8,}   {stats['semantic']}")

    print(f"\n  Top repeated size×color patterns (≥3 occurrences):")
    for p in data["repeated_patterns"][:15]:
        print(f"    {p['count']:>4}×  {p['size_pts']:<10}  {p['color']:<14} → {p['semantic']}")

    print(f"\n  Top density hot-zones (grid {GRID_COLS}×{GRID_ROWS}):")
    for z in data["hot_zones"][:5]:
        print(f"    row={z['row']:2d} col={z['col']:2d}  paths={z['count']:,}  "
              f"x=[{z['x_range'][0]:.0f}–{z['x_range'][1]:.0f}]  "
              f"y=[{z['y_range'][0]:.0f}–{z['y_range'][1]:.0f}]")


if __name__ == "__main__":
    main()
