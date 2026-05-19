#!/usr/bin/env python3
"""
Stage 2 — Vector Extraction
Extracts all drawing paths from the PDF and writes a structured report.
Also produces a filtered candidate_symbols list for downstream clustering.

Output: outputs/vector_objects.json
  - summary stats
  - color distribution
  - size distribution of filled shapes
  - candidate_symbols: filled shapes in realistic symbol-size range (5–350 pts)
"""

import sys
from pathlib import Path
from collections import Counter, defaultdict

import fitz  # PyMuPDF

from cad_utils import bucket_color, SEMANTIC_HINT, save_json


DEFAULT_PDF = "/Users/eliozedri/Downloads/50-448-02-400.pdf"

# ── Candidate filter thresholds ────────────────────────────────────────────────
MIN_SYMBOL_PTS  =   5    # smaller than this = sub-pixel noise
MAX_SYMBOL_PTS  = 350    # larger than this = road fill / background area
# Near-white threshold: skip background-white fills
WHITE_THRESHOLD = 0.88   # r, g, b all > this → background white
# Large gray road-fill skip: mid-gray AND large bbox
GRAY_MID_BRIGHTNESS_LO = 0.42
GRAY_MID_BRIGHTNESS_HI = 0.65
GRAY_CHROMA_MAX         = 0.06


def is_near_white(rgb):
    if rgb is None:
        return False
    return all(c > WHITE_THRESHOLD for c in rgb)

def is_large_road_gray(rgb, width, height):
    if rgb is None:
        return False
    r, g, b = rgb
    chroma = max(r, g, b) - min(r, g, b)
    brightness = max(r, g, b)
    is_gray = (chroma < GRAY_CHROMA_MAX and
               GRAY_MID_BRIGHTNESS_LO < brightness < GRAY_MID_BRIGHTNESS_HI)
    return is_gray and width > 150 and height > 150


def extract_vectors(pdf_path: str) -> dict:
    path = Path(pdf_path)
    doc = fitz.open(str(path))

    all_stroke_colors = Counter()
    all_fill_colors   = Counter()
    all_widths        = Counter()
    size_buckets      = Counter()   # for filled shapes
    total_paths       = 0
    total_filled      = 0

    # Candidate symbols: filtered list for Stage 4
    candidate_symbols = []

    for page_idx, page in enumerate(doc):
        page_w = page.rect.width
        page_h = page.rect.height
        drawings = page.get_drawings()
        total_paths += len(drawings)

        for path_idx, d in enumerate(drawings):
            fill   = d.get("fill")
            stroke = d.get("color")
            width  = d.get("width", 0.0)
            rect   = d.get("rect")

            # Color tracking (all paths)
            if stroke is not None:
                all_stroke_colors[bucket_color(stroke)] += 1
            if fill is not None:
                total_filled += 1
                all_fill_colors[bucket_color(fill)] += 1

            all_widths[round(width, 2)] += 1

            # ── Candidate symbol filter ────────────────────────────────────────
            if fill is None or rect is None:
                continue
            bbox_w = rect.width
            bbox_h = rect.height
            if not (MIN_SYMBOL_PTS <= bbox_w <= MAX_SYMBOL_PTS and
                    MIN_SYMBOL_PTS <= bbox_h <= MAX_SYMBOL_PTS):
                # Track size distribution for reporting
                if fill is not None:
                    if bbox_w < 5 or bbox_h < 5:
                        size_buckets["<5px"] += 1
                    elif bbox_w > 350 or bbox_h > 350:
                        size_buckets[">350px"] += 1
                continue

            if is_near_white(fill):
                size_buckets["near_white_skip"] += 1
                continue
            if is_large_road_gray(fill, bbox_w, bbox_h):
                size_buckets["road_gray_skip"] += 1
                continue

            # Classify size
            max_dim = max(bbox_w, bbox_h)
            if max_dim < 20:
                size_bucket = "micro_5_20"
            elif max_dim < 50:
                size_bucket = "small_20_50"
            elif max_dim < 100:
                size_bucket = "medium_50_100"
            elif max_dim < 200:
                size_bucket = "large_100_200"
            else:
                size_bucket = "xlarge_200_350"

            size_buckets[size_bucket] += 1

            color_bucket = bucket_color(fill)
            stroke_bucket = bucket_color(stroke) if stroke else "none"

            candidate_symbols.append({
                "page":          page_idx,
                "path_idx":      path_idx,
                "bbox":          [round(rect.x0, 1), round(rect.y0, 1),
                                   round(rect.x1, 1), round(rect.y1, 1)],
                "width_pts":     round(bbox_w, 1),
                "height_pts":    round(bbox_h, 1),
                "cx":            round((rect.x0 + rect.x1) / 2, 1),
                "cy":            round((rect.y0 + rect.y1) / 2, 1),
                "fill_rgb":      [round(c, 3) for c in fill],
                "fill_bucket":   color_bucket,
                "stroke_bucket": stroke_bucket,
                "size_class":    size_bucket,
                "page_w":        round(page_w, 1),
                "page_h":        round(page_h, 1),
            })

    doc.close()

    # Build color distribution table
    color_distribution = {}
    for bucket in sorted(set(list(all_stroke_colors) + list(all_fill_colors))):
        color_distribution[bucket] = {
            "stroke_paths": all_stroke_colors.get(bucket, 0),
            "fill_paths":   all_fill_colors.get(bucket, 0),
            "semantic":     SEMANTIC_HINT.get(bucket, "unclassified"),
        }

    return {
        "source_pdf": str(path.name),
        "summary": {
            "total_paths":            total_paths,
            "total_filled_paths":     total_filled,
            "candidates_before_filter": sum(
                v for k, v in size_buckets.items()
                if k not in ("<5px", ">350px", "near_white_skip", "road_gray_skip")
            ),
            "filtered_near_white":    size_buckets.get("near_white_skip", 0),
            "filtered_road_gray":     size_buckets.get("road_gray_skip", 0),
            "filtered_too_small":     size_buckets.get("<5px", 0),
            "filtered_too_large":     size_buckets.get(">350px", 0),
            "candidate_symbol_count": len(candidate_symbols),
            "noise_reduction_pct":    round(
                (1 - len(candidate_symbols) / max(total_paths, 1)) * 100, 2
            ),
        },
        "size_distribution": dict(size_buckets),
        "color_distribution": color_distribution,
        "dominant_stroke_colors": dict(all_stroke_colors.most_common(12)),
        "dominant_fill_colors":   dict(all_fill_colors.most_common(12)),
        "line_widths_top5":       dict(all_widths.most_common(5)),
        "candidate_symbols":      candidate_symbols,
    }


def main():
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PDF
    print(f"[02_extract_vectors] {pdf_path}")

    data = extract_vectors(pdf_path)
    out = save_json(data, "vector_objects.json", indent=None)  # compact — may be several MB
    print(f"  Saved → {out}  ({out.stat().st_size // 1024} KB)")

    s = data["summary"]
    print(f"\n  Total paths:              {s['total_paths']:,}")
    print(f"  Filled paths:             {s['total_filled_paths']:,}")
    print(f"  Filtered — near-white:    {s['filtered_near_white']:,}")
    print(f"  Filtered — road gray:     {s['filtered_road_gray']:,}")
    print(f"  Filtered — too small:     {s['filtered_too_small']:,}")
    print(f"  Filtered — too large:     {s['filtered_too_large']:,}")
    print(f"  Candidate symbols:        {s['candidate_symbol_count']:,}")
    print(f"  Noise reduction:          {s['noise_reduction_pct']}%")

    print(f"\n  Top fill color buckets:")
    for k, v in data["dominant_fill_colors"].items():
        semantic = data["color_distribution"].get(k, {}).get("semantic", "")
        print(f"    {k:<14} {v:>6}  ({semantic})")


if __name__ == "__main__":
    main()
