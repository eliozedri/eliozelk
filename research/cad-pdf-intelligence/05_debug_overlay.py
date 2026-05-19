#!/usr/bin/env python3
"""
Stage 5 — Visual Debug Overlay
Renders the PDF page at reduced scale, then generates an SVG overlay
showing all detected symbol clusters with color-coded bounding boxes.

This is the key visual quality check: do the cluster boxes land on
actual signs and markings, or just on noise?

Outputs:
  outputs/page_render.png      — raw page render at 0.3× scale
  outputs/debug_overlay.svg    — SVG with page + cluster boxes + legend
"""

import sys
import json
import base64
from pathlib import Path
from collections import Counter

import fitz

from cad_utils import SVG_STROKE, SEMANTIC_HINT, output_path, load_json


DEFAULT_PDF = "/Users/eliozedri/Downloads/50-448-02-400.pdf"

RENDER_SCALE = 0.3   # PNG render scale (4536 pts × 0.3 ≈ 1360 px wide)

# Minimum cluster member count to render (filters sub-1 noise in overlay)
MIN_MEMBERS_TO_SHOW = 1
# Clusters with bbox shorter than this won't get a label (too small to read)
LABEL_MIN_DIM = 12


def render_page_png(pdf_path: str) -> tuple[bytes, float, float]:
    """Render page 0 to PNG bytes at RENDER_SCALE. Returns (png_bytes, w, h)."""
    doc  = fitz.open(pdf_path)
    page = doc[0]
    mat  = fitz.Matrix(RENDER_SCALE, RENDER_SCALE)
    pix  = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
    png_bytes = pix.tobytes("png")
    doc.close()
    return png_bytes, pix.width, pix.height


def build_svg(
    png_bytes: bytes,
    img_w: float,
    img_h: float,
    clusters: list,
    page_display_w: float,   # landscape display width (= 4536 for this PDF)
    orig_w: float,           # mediabox portrait width (= 2551) — needed for rotation math
) -> str:
    """Build a self-contained SVG with embedded PNG background and cluster boxes.

    Coordinate system note:
      PyMuPDF get_drawings() returns coordinates in mediabox/portrait space:
        x_pm ∈ [0, orig_w=2551],  y_pm ∈ [0, 4536]
      The rendered PNG is in display/landscape space:
        x_d ∈ [0, 4536],  y_d ∈ [0, 2551]
      Rotation=270° CW transformation:
        display_x = y_pm
        display_y = orig_w - x_pm   (where orig_w = 2551)
      SVG pixel coordinates:
        svg_x = display_x * scale = y_pm * scale
        svg_y = display_y * scale = (orig_w - x_pm) * scale
    """

    scale = img_w / page_display_w   # = RENDER_SCALE ≈ 0.3

    # Embed PNG as base64 data URI
    b64 = base64.b64encode(png_bytes).decode("ascii")

    # Legend: distinct color buckets present in clusters
    legend_buckets = sorted(set(c["dominant_color"] for c in clusters))
    legend_y_start = 20
    legend_line_h  = 18
    legend_h       = len(legend_buckets) * legend_line_h + 30
    legend_w       = 220

    lines = []
    lines.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{img_w}" height="{img_h}" '
        f'viewBox="0 0 {img_w} {img_h}">'
    )

    # Background: the rendered page
    lines.append(
        f'  <image href="data:image/png;base64,{b64}" '
        f'x="0" y="0" width="{img_w}" height="{img_h}"/>'
    )

    # ── Cluster bounding boxes ─────────────────────────────────────────────────
    lines.append('  <g id="clusters" fill="none" stroke-width="1.2" opacity="0.85">')

    type_color_override = {
        "road_marking_stripe": "#ccaa00",
        "large_structure":     "#006600",
        "micro_noise":         "#aaaaaa",
    }

    for cl in clusters:
        if cl["member_count"] < MIN_MEMBERS_TO_SHOW:
            continue

        # bbox is [x0_pm, y0_pm, x1_pm, y1_pm] in PyMuPDF portrait/mediabox space
        x0_pm, y0_pm, x1_pm, y1_pm = cl["bbox"]
        # Transform to SVG (display/landscape) space
        sx0 = y0_pm * scale
        sy0 = (orig_w - x1_pm) * scale
        sw  = (y1_pm - y0_pm) * scale
        sh  = (x1_pm - x0_pm) * scale
        # Guard against negative dimensions (shouldn't happen but just in case)
        if sw <= 0 or sh <= 0:
            continue

        stroke_color = (
            type_color_override.get(cl["cluster_type"])
            or SVG_STROKE.get(cl["dominant_color"], "#00cccc")
        )

        # Thicker border for high-confidence sign candidates
        stroke_w = 2.0 if cl["confidence"] >= 0.8 else 1.2
        dash     = "" if cl["confidence"] >= 0.7 else ' stroke-dasharray="3,2"'

        lines.append(
            f'  <rect x="{sx0:.1f}" y="{sy0:.1f}" '
            f'width="{sw:.1f}" height="{sh:.1f}" '
            f'stroke="{stroke_color}" stroke-width="{stroke_w}"{dash}/>'
        )

        # Label on large-enough boxes
        if max(sw, sh) >= LABEL_MIN_DIM:
            label = f'{cl["dominant_color"][:4]} {cl["member_count"]}'
            font_size = max(5, min(9, sh * 0.5))
            lines.append(
                f'  <text x="{sx0+1:.1f}" y="{sy0 + font_size:.1f}" '
                f'font-family="monospace" font-size="{font_size:.1f}" '
                f'fill="{stroke_color}" opacity="0.9">{label}</text>'
            )

    lines.append("  </g>")

    # ── Legend ─────────────────────────────────────────────────────────────────
    lx = img_w - legend_w - 5
    ly = img_h - legend_h - 5
    lines.append(
        f'  <rect x="{lx}" y="{ly}" width="{legend_w}" height="{legend_h}" '
        f'fill="white" fill-opacity="0.82" stroke="#888" stroke-width="0.8"/>'
    )
    lines.append(
        f'  <text x="{lx+8}" y="{ly+14}" font-family="sans-serif" '
        f'font-size="10" font-weight="bold" fill="#333">Cluster Legend</text>'
    )
    for i, bucket in enumerate(legend_buckets):
        color   = SVG_STROKE.get(bucket, "#888")
        semantic = SEMANTIC_HINT.get(bucket, "")[:30]
        count   = sum(1 for c in clusters if c["dominant_color"] == bucket)
        ty = ly + legend_y_start + (i + 1) * legend_line_h
        lines.append(
            f'  <rect x="{lx+8}" y="{ty-7}" width="12" height="8" '
            f'fill="{color}" opacity="0.85"/>'
        )
        lines.append(
            f'  <text x="{lx+24}" y="{ty}" font-family="monospace" '
            f'font-size="9" fill="#222">{bucket} ({count}) — {semantic}</text>'
        )

    # ── Stats annotation ───────────────────────────────────────────────────────
    type_counts = Counter(c["cluster_type"] for c in clusters)
    stat_lines = [
        f"Total clusters: {len(clusters)}",
        f"Signs/symbols:  {type_counts.get('sign_symbol',0) + type_counts.get('compact_symbol',0)}",
        f"Road markings:  {type_counts.get('road_marking_stripe',0)}",
        f"Fragments:      {type_counts.get('symbol_fragment',0)}",
        f"Structures:     {type_counts.get('large_structure',0)}",
        f"Noise:          {type_counts.get('micro_noise',0)}",
        f"Scale: 1px = {1/scale:.0f}pt",
    ]
    sx = 5
    for i, sl in enumerate(stat_lines):
        lines.append(
            f'  <text x="{sx}" y="{12 + i*13}" font-family="monospace" '
            f'font-size="9" fill="white" '
            f'style="text-shadow: 0 0 3px black">{sl}</text>'
        )

    lines.append("</svg>")
    return "\n".join(lines)


def main():
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PDF
    print(f"[05_debug_overlay] {pdf_path}")

    # Load clusters from stage 4
    try:
        cldata = load_json("symbol_clusters.json")
        clusters = cldata["clusters"]
    except Exception as e:
        print(f"  [!] Could not load symbol_clusters.json: {e}")
        print(f"  Run 04_cluster_symbols.py first.")
        sys.exit(1)

    print(f"  Loaded {len(clusters)} clusters")

    # Render page
    print(f"  Rendering page at {RENDER_SCALE}× scale ...")
    png_bytes, img_w, img_h = render_page_png(pdf_path)

    # Save PNG
    png_path = output_path("page_render.png")
    with open(png_path, "wb") as f:
        f.write(png_bytes)
    print(f"  Page PNG → {png_path}  ({img_w}×{img_h} px)")

    # Get page dimensions from first cluster or from PyMuPDF
    doc = fitz.open(pdf_path)
    page_display_w = doc[0].rect.width    # display/landscape width = 4536
    orig_w = doc[0].mediabox.width        # portrait/mediabox width = 2551 (for rotation transform)
    doc.close()

    # Build SVG
    print(f"  Building SVG overlay ({len(clusters)} cluster boxes) ...")
    print(f"  Coordinate transform: display={page_display_w:.0f}×{img_h/RENDER_SCALE:.0f}pt, "
          f"mediabox_orig_w={orig_w:.0f}pt, scale={RENDER_SCALE}")
    svg_content = build_svg(png_bytes, img_w, img_h, clusters, page_display_w, orig_w)

    svg_path = output_path("debug_overlay.svg")
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(svg_content)
    size_kb = svg_path.stat().st_size // 1024
    print(f"  SVG overlay → {svg_path}  ({size_kb} KB)")

    # Summary
    type_counts = Counter(c["cluster_type"] for c in clusters)
    color_counts = Counter(c["dominant_color"] for c in clusters)
    high_conf = [c for c in clusters if c["confidence"] >= 0.7
                 and c["cluster_type"] in ("sign_symbol", "compact_symbol", "symbol_fragment")]

    print(f"\n  Cluster type summary:")
    for t, c in type_counts.most_common():
        print(f"    {t:<28} {c}")
    print(f"\n  Color summary:")
    for t, c in color_counts.most_common():
        print(f"    {t:<16} {c}")
    print(f"\n  High-confidence sign clusters: {len(high_conf)}")
    print(f"\n  Open {svg_path} in a browser to inspect the overlay.")


if __name__ == "__main__":
    main()
