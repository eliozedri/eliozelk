#!/usr/bin/env python3
"""
Stage 1 — PDF Inspection
Extracts metadata, page geometry, OCG layer info, object counts, embedded images.
Output: outputs/inspection_report.json
"""

import sys
import json
import subprocess
from pathlib import Path
from collections import Counter

import fitz        # PyMuPDF
import pdfplumber

from cad_utils import save_json, bucket_color


DEFAULT_PDF = "/Users/eliozedri/Downloads/50-448-02-400.pdf"


def inspect_pdf(pdf_path: str) -> dict:
    path = Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    result = {
        "file": {
            "name": path.name,
            "stem": path.stem,
            "size_bytes": path.stat().st_size,
            "size_mb": round(path.stat().st_size / 1_048_576, 2),
        },
        "metadata": {},
        "ocg_layers": {"count": 0, "layers": [], "note": ""},
        "pages": [],
        "pdfinfo_cli": {},
        "summary": {},
    }

    # ── PyMuPDF metadata ───────────────────────────────────────────────────────
    doc = fitz.open(str(path))
    meta = doc.metadata
    result["metadata"] = {
        "format":        meta.get("format", ""),
        "title":         meta.get("title", ""),
        "author":        meta.get("author", ""),
        "creator":       meta.get("creator", ""),
        "producer":      meta.get("producer", ""),
        "creation_date": meta.get("creationDate", ""),
        "mod_date":      meta.get("modDate", ""),
        "encryption":    meta.get("encryption"),
    }

    # ── OCG / Optional Content Groups (= CAD layers) ──────────────────────────
    ocgs = doc.get_ocgs()
    if ocgs:
        result["ocg_layers"]["count"] = len(ocgs)
        result["ocg_layers"]["note"] = "CAD layers preserved in PDF"
        for xref, props in ocgs.items():
            result["ocg_layers"]["layers"].append({
                "xref":    xref,
                "name":    props.get("name", ""),
                "visible": props.get("on", True),
            })
    else:
        result["ocg_layers"]["note"] = (
            "No OCG layers found — PDF was plotted without layer preservation "
            "(pdfplot16 flattens all CAD layers to a single stream)"
        )

    # ── Per-page analysis ──────────────────────────────────────────────────────
    totals = {"drawings": 0, "words": 0, "images": 0}

    for page_idx, page in enumerate(doc):
        drawings  = page.get_drawings()
        words     = page.get_text("words")
        all_images = page.get_images(full=True)

        # Geometry breakdown
        item_type_counts = Counter()
        fill_count = 0
        stroke_count = 0
        stroke_colors = Counter()
        fill_colors   = Counter()
        widths        = Counter()

        for d in drawings:
            if d.get("fill") is not None:
                fill_count += 1
                fc = d["fill"]
                if fc is not None:
                    fill_colors[bucket_color(fc)] += 1
            sc = d.get("color")
            if sc is not None:
                stroke_count += 1
                stroke_colors[bucket_color(sc)] += 1
            widths[round(d.get("width", 0), 2)] += 1
            for item in d.get("items", []):
                t = item[0]
                if   t == "l":  item_type_counts["line"]      += 1
                elif t == "c":  item_type_counts["bezier"]     += 1
                elif t == "re": item_type_counts["rectangle"]  += 1
                elif t == "qu": item_type_counts["quad"]       += 1
                else:           item_type_counts["other"]      += 1

        # Image details
        image_details = []
        for img in all_images:
            xref = img[0]
            try:
                blob = doc.extract_image(xref)
                image_details.append({
                    "xref":        xref,
                    "width":       blob["width"],
                    "height":      blob["height"],
                    "format":      blob["ext"],
                    "colorspace":  blob["colorspace"],
                    "size_bytes":  len(blob["image"]),
                })
            except Exception as e:
                image_details.append({"xref": xref, "error": str(e)})

        page_info = {
            "page_number":         page_idx + 1,
            "width_pts":           round(page.rect.width, 2),
            "height_pts":          round(page.rect.height, 2),
            "rotation_degrees":    page.rotation,
            "total_drawing_paths": len(drawings),
            "filled_paths":        fill_count,
            "stroked_paths":       stroke_count,
            "geometry_items":      dict(item_type_counts),
            "dominant_stroke_colors": dict(stroke_colors.most_common(10)),
            "dominant_fill_colors":   dict(fill_colors.most_common(10)),
            "line_widths_top5":    dict(widths.most_common(5)),
            "text_words":          len(words),
            "text_sample":         [w[4] for w in words[:15]],
            "embedded_images":     image_details,
        }
        result["pages"].append(page_info)
        totals["drawings"] += len(drawings)
        totals["words"]    += len(words)
        totals["images"]   += len(all_images)

    doc.close()

    # ── pdfplumber — char-level cross-check ───────────────────────────────────
    with pdfplumber.open(str(path)) as pdf:
        for i, page in enumerate(pdf.pages):
            chars = page.chars
            fonts = sorted(set(c.get("fontname", "") for c in chars if c.get("fontname")))
            sizes = sorted(set(round(c.get("size", 0), 1) for c in chars))
            result["pages"][i]["pdfplumber"] = {
                "char_count":    len(chars),
                "unique_fonts":  fonts,
                "font_sizes_pt": sizes,
                "line_count":    len(page.lines),
                "curve_count":   len(page.curves),
                "rect_count":    len(page.rects),
            }

    # ── pdfinfo CLI ───────────────────────────────────────────────────────────
    try:
        proc = subprocess.run(
            ["pdfinfo", str(path)],
            capture_output=True, text=True, timeout=10,
        )
        for line in proc.stdout.strip().splitlines():
            if ":" in line:
                k, _, v = line.partition(":")
                result["pdfinfo_cli"][k.strip()] = v.strip()
    except Exception as e:
        result["pdfinfo_cli"]["error"] = str(e)

    # ── Summary ───────────────────────────────────────────────────────────────
    creator = result["metadata"].get("creator", "")
    producer = result["metadata"].get("producer", "")
    result["summary"] = {
        "page_count":            len(result["pages"]),
        "total_vector_paths":    totals["drawings"],
        "total_text_words":      totals["words"],
        "total_embedded_images": totals["images"],
        "has_ocg_layers":        result["ocg_layers"]["count"] > 0,
        "is_autocad_origin":     "AutoCAD" in creator,
        "autocad_version":       creator,
        "pdf_plot_driver":       producer,
        "verdict": (
            "AutoCAD-plotted PDF: dense vector geometry, no CAD layers, "
            "sparse real text (rest rendered as vector outlines). "
            "Suitable for geometry+color-based analysis."
            if "AutoCAD" in creator else
            "Unknown origin — verify manually."
        ),
    }

    return result


def main():
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PDF
    print(f"[01_inspect] {pdf_path}")

    report = inspect_pdf(pdf_path)
    out = save_json(report, "inspection_report.json")
    print(f"  Saved → {out}")

    s = report["summary"]
    print(f"\n  Pages:          {s['page_count']}")
    print(f"  Vector paths:   {s['total_vector_paths']:,}")
    print(f"  Text words:     {s['total_text_words']}")
    print(f"  Images:         {s['total_embedded_images']}")
    print(f"  OCG layers:     {report['ocg_layers']['count']}  ({report['ocg_layers']['note']})")
    print(f"  Creator:        {s['autocad_version']}")
    print(f"  Driver:         {s['pdf_plot_driver']}")
    print(f"\n  Verdict: {s['verdict']}")


if __name__ == "__main__":
    main()
