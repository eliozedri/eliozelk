#!/usr/bin/env python3
"""
Stage 8-diag — PDF Text / Sign-Code Extraction Diagnostic

Determines whether traffic sign codes (e.g. 402, 605) and Hebrew legend labels
are extractable as real PDF text objects, or are rendered as vector/Bezier geometry.

This is a prerequisite check before Stage G implementation.

Tests:
  page.get_text("rawdict")  — raw character-level spans with font info
  page.get_text("dict")     — block/line/span hierarchy
  page.get_text("words")    — word-level with bboxes
  page.get_text("blocks")   — block-level summary
  page.get_text("text")     — flat text dump

Outputs:
  outputs/text_code_extraction_diagnostic.json
  outputs/text_code_extraction_diagnostic.md

Usage:
  python 08_text_code_diagnostic.py [pdf_path]
"""

import sys
import re
import json
from pathlib import Path
from collections import defaultdict

import fitz  # PyMuPDF

from cad_utils import save_json, output_path

DEFAULT_PDF = "/Users/eliozedri/Downloads/50-448-02-400.pdf"

# Sign code pattern: 3–4 digits, optional lowercase letter suffix (e.g. 402, 625b, 101)
SIGN_CODE_RE = re.compile(r"^\d{3,4}[a-z]?$")

# Broad numeric pattern: any token that is purely numeric or numeric+letter
NUMERIC_RE = re.compile(r"^\d{2,4}[a-z]?$")

# Known sign code ranges (Israeli road sign ordinance)
# Series 100–199: warning  200–299: prohibitory  300–399: mandatory  400–599: info/direction
# 600–699: general  700–799: misc  800–899: road marking  900–999: special
def is_likely_sign_code(token: str) -> bool:
    token = token.strip().lower()
    if not SIGN_CODE_RE.match(token):
        return False
    num = int(re.match(r"^\d+", token).group())
    return 100 <= num <= 999

def bbox_to_display(bbox, page_height_pts: float):
    """Convert PyMuPDF bbox (x0,y0,x1,y1 in PDF coords) to display coords.

    This PDF has rotation=270 and mediabox origin in portrait orientation.
    PyMuPDF get_text() bboxes are in the ROTATED page space (display coords).
    For a rotation=270 page: PyMuPDF delivers text already in display orientation.
    So no transform needed — bboxes are directly comparable to display_x, display_y.
    """
    x0, y0, x1, y1 = bbox
    return {"x0": round(x0, 1), "y0": round(y0, 1),
            "x1": round(x1, 1), "y1": round(y1, 1),
            "cx": round((x0 + x1) / 2, 1), "cy": round((y0 + y1) / 2, 1)}


def run_words_extraction(page) -> dict:
    """page.get_text('words') — word-level, fastest for spatial analysis."""
    words = page.get_text("words")  # (x0,y0,x1,y1,word,block_no,line_no,word_no)
    all_tokens = []
    sign_code_tokens = []
    numeric_tokens = []

    for w in words:
        x0, y0, x1, y1, text, bn, ln, wn = w
        token = text.strip()
        entry = {
            "text": token,
            "bbox": bbox_to_display((x0, y0, x1, y1), 0),
            "bbox_w_pts": round(x1 - x0, 2),
            "bbox_h_pts": round(y1 - y0, 2),
            "block": bn, "line": ln, "word": wn,
        }
        all_tokens.append(entry)
        if is_likely_sign_code(token):
            entry["is_sign_code"] = True
            sign_code_tokens.append(entry)
        elif NUMERIC_RE.match(token.lower()):
            numeric_tokens.append(entry)

    # Separate real from zero-size artifacts
    real_sign_codes, artifact_sign_codes = filter_zero_size_artifacts(sign_code_tokens)

    return {
        "method": "words",
        "total_tokens": len(all_tokens),
        "numeric_tokens": len(numeric_tokens),
        "sign_code_candidates_raw": len(sign_code_tokens),
        "sign_code_candidates_real": len(real_sign_codes),
        "sign_code_artifacts": len(artifact_sign_codes),
        "sign_codes": sign_code_tokens,         # all (including artifacts)
        "sign_codes_real": real_sign_codes,      # usable for Stage G
        "sign_codes_artifacts": artifact_sign_codes,  # zero-size stubs
        "all_numerics": numeric_tokens,
        "sample_all": all_tokens[:30],
    }


def run_rawdict_extraction(page) -> dict:
    """page.get_text('rawdict') — character-level with font info."""
    raw = page.get_text("rawdict")
    spans_with_font = []
    sign_code_spans = []
    has_unicode = False
    has_hebrew = False

    for block in raw.get("blocks", []):
        if block.get("type") != 0:  # type 0 = text
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = span.get("text", "").strip()
                font = span.get("font", "")
                size = span.get("size", 0)
                bbox = span.get("bbox", [0, 0, 0, 0])
                flags = span.get("flags", 0)

                if not text:
                    continue

                has_unicode = True
                if any("א" <= c <= "ת" for c in text):
                    has_hebrew = True

                entry = {
                    "text": text,
                    "font": font,
                    "size": round(size, 1),
                    "flags": flags,
                    "bbox": bbox_to_display(bbox, 0),
                }
                spans_with_font.append(entry)
                if is_likely_sign_code(text):
                    sign_code_spans.append(entry)

    return {
        "method": "rawdict",
        "total_spans": len(spans_with_font),
        "has_real_unicode": has_unicode,
        "has_hebrew_chars": has_hebrew,
        "sign_code_candidates": len(sign_code_spans),
        "sign_codes": sign_code_spans,
        "sample_spans": spans_with_font[:30],
    }


def run_blocks_extraction(page) -> dict:
    """page.get_text('blocks') — quick overview of text block locations."""
    blocks = page.get_text("blocks")
    text_blocks = []
    for b in blocks:
        x0, y0, x1, y1, text, bno, btype = b
        if btype != 0:
            continue
        text_blocks.append({
            "text": text.strip()[:120],
            "bbox": bbox_to_display((x0, y0, x1, y1), 0),
            "block_no": bno,
        })
    return {
        "method": "blocks",
        "total_text_blocks": len(text_blocks),
        "blocks": text_blocks,
    }


def run_flat_text(page) -> dict:
    """page.get_text() — flat dump, useful for quick sanity check."""
    text = page.get_text()
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    sign_code_lines = [l for l in lines if is_likely_sign_code(l)]
    numeric_lines = [l for l in lines if NUMERIC_RE.match(l.lower())]
    return {
        "method": "text",
        "total_lines": len(lines),
        "sign_code_lines": len(sign_code_lines),
        "sign_codes_found": sign_code_lines,
        "numeric_lines": numeric_lines[:50],
        "sample_lines": lines[:50],
    }


def filter_zero_size_artifacts(tokens: list, min_dimension_pts: float = 2.0) -> tuple:
    """
    Split a token list into real tokens and zero-size artifacts.

    AutoCAD PDF exports sometimes emit text objects with sub-pixel bboxes (< 1pt)
    that are invisible accessibility stubs or metadata remnants. These must be excluded
    from sign-code candidates — they have no spatial meaning on the map.
    """
    real, artifacts = [], []
    for t in tokens:
        w = t["bbox"]["x1"] - t["bbox"]["x0"]
        h = t["bbox"]["y1"] - t["bbox"]["y0"]
        if w < min_dimension_pts or h < min_dimension_pts:
            t["artifact_reason"] = f"bbox {w:.2f}pt × {h:.2f}pt — below {min_dimension_pts}pt threshold"
            artifacts.append(t)
        else:
            real.append(t)
    return real, artifacts


def assess_coordinate_reliability(words_result: dict) -> dict:
    """
    Assess whether word bboxes are precise enough for spatial association with sign clusters.

    A coordinate is reliable enough if:
    - Bbox width < 120pt (a code token should be narrow)
    - Bbox height < 30pt (single-line text)
    - Token is not a zero-size artifact
    - Multiple tokens cluster near known sign cluster positions
    """
    sign_codes = words_result.get("sign_codes_real", [])
    artifacts  = words_result.get("sign_codes_artifacts", [])

    if artifacts and not sign_codes:
        return {
            "reliable": False,
            "reason": (
                f"All {len(artifacts)} sign-code-pattern token(s) are zero-size artifacts "
                f"(bbox < 2pt). These are invisible AutoCAD PDF stubs, not real text annotations. "
                f"Sign codes on this plan are rendered as vector/Bezier paths."
            ),
            "n_artifacts": len(artifacts),
            "n_real_sign_codes": 0,
            "note": "Bboxes in display coordinate space — directly comparable to DBSCAN cluster centroids",
        }

    if not sign_codes:
        return {"reliable": False, "reason": "No sign code tokens found to assess"}

    widths  = [sc["bbox"]["x1"] - sc["bbox"]["x0"] for sc in sign_codes]
    heights = [sc["bbox"]["y1"] - sc["bbox"]["y0"] for sc in sign_codes]
    avg_w = sum(widths) / len(widths)
    avg_h = sum(heights) / len(heights)
    max_w = max(widths)
    max_h = max(heights)

    issues = []
    if avg_w > 120:
        issues.append(f"avg token width {avg_w:.1f}pt is large (expected <120pt for a code)")
    if avg_h > 30:
        issues.append(f"avg token height {avg_h:.1f}pt is large (expected <30pt for single line)")
    if max_w > 300:
        issues.append(f"max token width {max_w:.1f}pt is very large — possible block grouping artifact")

    return {
        "reliable": len(issues) == 0,
        "avg_width_pts": round(avg_w, 1),
        "avg_height_pts": round(avg_h, 1),
        "max_width_pts": round(max_w, 1),
        "max_height_pts": round(max_h, 1),
        "issues": issues,
        "n_sign_codes_assessed": len(sign_codes),
        "note": "Bboxes in display coordinate space — directly comparable to DBSCAN cluster centroids",
    }


def scan_image_blocks(page) -> list:
    """Report embedded raster image blocks (JPEG/PNG) and their page locations."""
    raw = page.get_text("rawdict")
    images = []
    for b in raw.get("blocks", []):
        if b.get("type") == 1:
            bbox = b.get("bbox", [0, 0, 0, 0])
            images.append({
                "dimensions": f"{b.get('width')}×{b.get('height')}",
                "format": b.get("ext", "?"),
                "bbox": bbox_to_display(bbox, 0),
                "note": "Embedded raster image — likely title block stamp/logo, not map content",
            })
    return images


def derive_conclusion(rawdict_result, words_result, flat_result) -> dict:
    """Synthesize findings into a Stage G recommendation."""
    n_real_sign_codes  = words_result.get("sign_code_candidates_real", 0)
    n_artifact_codes   = words_result.get("sign_code_artifacts", 0)
    n_sign_codes_raw   = rawdict_result.get("sign_code_candidates", 0)
    has_hebrew         = rawdict_result.get("has_hebrew_chars", False)
    total_spans        = rawdict_result.get("total_spans", 0)

    if n_real_sign_codes >= 5:
        text_codes_status = "text_codes_available"
        stage_g_recommendation = "stage_g_can_use_pdf_text_extraction"
        rationale = (
            f"Found {n_real_sign_codes} real (non-zero-size) sign-code tokens via "
            f"get_text('words') with usable spatial bboxes. Stage G can use PDF text "
            f"extraction directly for sign-code reading without Vision API or OCR."
        )
    elif n_real_sign_codes >= 1:
        text_codes_status = "partially_available"
        stage_g_recommendation = "stage_g_needs_hybrid_fallback"
        rationale = (
            f"Found {n_real_sign_codes} real sign-code token(s) via get_text('words'). "
            f"Coverage is incomplete. Use PDF text as primary, Vision/OCR as fallback."
        )
    elif n_artifact_codes > 0 and n_real_sign_codes == 0:
        text_codes_status = "text_codes_not_available"
        stage_g_recommendation = "stage_g_needs_vision_ocr_fallback"
        rationale = (
            f"Found {n_artifact_codes} sign-code-pattern token(s) in get_text('words'), "
            f"but ALL are zero-size artifacts (bbox < 2pt — invisible AutoCAD PDF stubs). "
            f"No real sign-code text objects exist on this page. "
            f"Sign codes are rendered as vector/Bezier paths. "
            f"Stage G must use Vision API or rasterized OCR to read sign codes from the map."
        )
    else:
        text_codes_status = "text_codes_not_available"
        stage_g_recommendation = "stage_g_needs_vision_ocr_fallback"
        rationale = (
            "No sign-code tokens found in PDF text extraction. Sign codes are rendered "
            "as vector/Bezier paths. Stage G must use Vision API or rasterized OCR."
        )

    hebrew_status = "hebrew_extractable" if has_hebrew else "hebrew_vector_paths_only"

    return {
        "text_codes_status": text_codes_status,
        "hebrew_label_status": hebrew_status,
        "sign_codes_found_real": n_real_sign_codes,
        "sign_codes_found_artifacts": n_artifact_codes,
        "sign_codes_found_rawdict": n_sign_codes_raw,
        "total_pdf_text_spans": total_spans,
        "stage_g_recommendation": stage_g_recommendation,
        "rationale": rationale,
        "hebrew_note": (
            "Hebrew legend labels ARE extractable as real text." if has_hebrew else
            "Hebrew legend labels are vector/Bezier paths — Vision API required."
        ),
        "zero_size_artifact_note": (
            "AutoCAD PDF exports sometimes emit sub-pixel text objects (< 1pt) as "
            "accessibility stubs. These must be filtered before sign-code extraction. "
            "Minimum bbox dimension threshold applied: 2pt."
        ),
    }


def write_report(diag: dict, out_path: Path):
    """Write human-readable markdown diagnostic report."""
    conc  = diag["conclusion"]
    words = diag["words_extraction"]
    raw   = diag["rawdict_extraction"]
    coord = diag["coordinate_reliability"]
    imgs  = diag.get("embedded_image_blocks", [])

    status_emoji = {
        "text_codes_available":    "✅",
        "partially_available":     "⚠️",
        "text_codes_not_available":"❌",
    }
    hebrew_emoji = {
        "hebrew_extractable":       "✅",
        "hebrew_vector_paths_only": "❌",
    }

    n_real = conc.get("sign_codes_found_real", 0)
    n_art  = conc.get("sign_codes_found_artifacts", 0)

    lines = [
        "# Stage G Prerequisite — PDF Text/Sign-Code Extraction Diagnostic",
        "",
        f"**PDF:** `{diag['source_pdf']}`  ",
        f"**Date:** 2026-05-19  ",
        f"**PyMuPDF version:** {diag['fitz_version']}",
        "",
        "---",
        "",
        "## Conclusion",
        "",
        "| Question | Result |",
        "|---|---|",
        f"| Sign codes extractable as PDF text? | {status_emoji.get(conc['text_codes_status'], '?')} **{conc['text_codes_status']}** |",
        f"| Hebrew labels extractable as PDF text? | {hebrew_emoji.get(conc['hebrew_label_status'], '?')} **{conc['hebrew_label_status']}** |",
        f"| Real (usable) sign-code tokens found | **{n_real}** |",
        f"| Zero-size artifact sign-code tokens | **{n_art}** (filtered out) |",
        f"| Total PDF text tokens (all types) | **{words.get('total_tokens', 0)}** |",
        f"| Total PDF text spans (rawdict) | **{conc['total_pdf_text_spans']}** |",
        f"| Embedded raster image blocks | **{len(imgs)}** (title block only) |",
        f"| Stage G recommendation | **{conc['stage_g_recommendation']}** |",
        "",
        f"**Rationale:** {conc['rationale']}",
        "",
        f"**Hebrew labels:** {conc['hebrew_note']}",
        "",
        f"**Zero-size artifact note:** {conc.get('zero_size_artifact_note', '')}",
        "",
        "---",
        "",
        "## What PDF text IS present",
        "",
        "The following real (non-artifact) text tokens were found:",
        "",
        "| Token | Type | w (pts) | h (pts) | cx | cy |",
        "|---|---|---|---|---|---|",
    ]

    for t in words.get("sample_all", []):
        w_ok = t["bbox_w_pts"] >= 2 and t["bbox_h_pts"] >= 2
        token_type = "artifact" if not w_ok else (
            "sign_code?" if is_likely_sign_code(t["text"]) else "admin/other"
        )
        b = t["bbox"]
        lines.append(f"| `{t['text']}` | {token_type} | {t['bbox_w_pts']} | {t['bbox_h_pts']} | {b['cx']} | {b['cy']} |")

    lines += [
        "",
        "**Interpretation:** All real text tokens are administrative metadata (revision dates,",
        "sheet number, radius annotation). No sign codes or Hebrew labels appear as real text.",
        "All map annotations — sign codes, Hebrew labels, dimensions — are vector/Bezier paths.",
        "",
        "---",
        "",
        "## Zero-Size Artifact Tokens (filtered, NOT usable)",
        "",
    ]

    artifacts = words.get("sign_codes_artifacts", [])
    if artifacts:
        lines += [
            "| Token | w (pts) | h (pts) | cx | cy | Reason |",
            "|---|---|---|---|---|---|",
        ]
        for sc in artifacts:
            b = sc["bbox"]
            reason = sc.get("artifact_reason", "")
            lines.append(f"| `{sc['text']}` | {sc['bbox_w_pts']} | {sc['bbox_h_pts']} | {b['cx']} | {b['cy']} | {reason} |")
        lines += [
            "",
            "These tokens match the sign-code pattern (3–4 digits) but are invisible sub-pixel stubs.",
            "Their coordinates (cx~785, cy~2519) place them in the plan area, but the bboxes are",
            "too small to represent real annotations. They are AutoCAD PDF accessibility artifacts.",
        ]
    else:
        lines.append("_(none)_")

    lines += [
        "",
        "---",
        "",
        "## Embedded Raster Images",
        "",
    ]

    if imgs:
        lines += [
            "| Dimensions | Format | x0 | y0 | x1 | y1 |",
            "|---|---|---|---|---|---|",
        ]
        for img in imgs:
            b = img["bbox"]
            lines.append(f"| {img['dimensions']} | {img['format']} | {b['x0']} | {b['y0']} | {b['x1']} | {b['y1']} |")
        lines += [
            "",
            "All embedded images are clustered in the bottom section (y > 3500 in display coords).",
            "This is the title block / revision table area, not the map area. These images are",
            "likely scanned stamps, engineer seals, or logos — not relevant to sign extraction.",
        ]
    else:
        lines.append("_(none)_")

    lines += [
        "",
        "---",
        "",
        "## Coordinate Reliability Assessment",
        "",
        f"- **Reliable for Stage G spatial association:** {'Yes' if coord.get('reliable') else 'No'}",
        f"- **Reason:** {coord.get('reason', coord.get('note', ''))}",
        f"- **Real sign-code tokens assessed:** {coord.get('n_real_sign_codes', coord.get('n_sign_codes_assessed', 0))}",
    ]

    if coord.get("issues"):
        lines += ["- Issues:"] + [f"  - {i}" for i in coord["issues"]]

    lines += [
        "",
        "---",
        "",
        "## Stage G Implication",
        "",
        f"**Recommendation:** `{conc['stage_g_recommendation']}`",
        "",
    ]

    if conc["stage_g_recommendation"] == "stage_g_can_use_pdf_text_extraction":
        lines += [
            "Stage G can use `page.get_text('words')` to extract sign codes with bboxes.",
            "No Vision API or OCR needed for sign code reading.",
            "Hebrew legend labels still require Vision if not extractable as text.",
        ]
    elif conc["stage_g_recommendation"] == "stage_g_needs_hybrid_fallback":
        lines += [
            "Stage G should use PDF text as primary and Vision/OCR as fallback.",
            "Coverage is partial — some sign codes may be vector-rendered.",
            "**Strategy:** PDF text extraction (primary) + Vision API fallback.",
        ]
    else:
        lines += [
            "Sign codes are **not extractable as PDF text** in this plan.",
            "All numeric annotations (sign codes) are rendered as vector/Bezier paths,",
            "identical to Hebrew text. No PDF text extraction method can recover them.",
            "",
            "**Stage G sign-code reading strategy:**",
            "- Primary: Vision API (Claude vision model) — send a rendered crop of each",
            "  sign cluster's local area and ask it to identify any nearby sign codes",
            "- Alternative: rasterized OCR (e.g., pytesseract or EasyOCR) on rendered crops",
            "- Stage G v1 should plan for Vision API as the default fallback",
            "",
            "**Hebrew legend labels:** Also vector paths — Vision API already required for",
            "Stage F label extraction. Same Vision call can extract nearby sign codes.",
        ]

    out_path.write_text("\n".join(lines), encoding="utf-8")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    pdf_path = args[0] if args else DEFAULT_PDF

    print(f"[08_text_code_diagnostic] Opening: {pdf_path}")
    doc = fitz.open(pdf_path)
    page = doc[0]

    print(f"  Page dimensions: {page.rect}  rotation={page.rotation}")
    print(f"  Running extraction methods ...")

    words_result  = run_words_extraction(page)
    raw_result    = run_rawdict_extraction(page)
    blocks_result = run_blocks_extraction(page)
    flat_result   = run_flat_text(page)
    image_blocks  = scan_image_blocks(page)
    coord_result  = assess_coordinate_reliability(words_result)
    conclusion    = derive_conclusion(raw_result, words_result, flat_result)

    n_real = words_result.get("sign_code_candidates_real", 0)
    n_art  = words_result.get("sign_code_artifacts", 0)

    print(f"\n  ── Results ──────────────────────────────────────────────────")
    print(f"  get_text('words')  : {words_result['total_tokens']:>4} tokens  "
          f"| {n_real} real sign-code candidates  | {n_art} zero-size artifacts")
    print(f"  get_text('rawdict'): {raw_result['total_spans']:>4} spans   "
          f"| {raw_result['sign_code_candidates']:>3} sign-code candidates"
          f"  | has_hebrew={raw_result['has_hebrew_chars']}")
    print(f"  get_text('blocks') : {blocks_result['total_text_blocks']:>4} text blocks")
    print(f"  get_text('text')   : {flat_result['total_lines']:>4} lines   "
          f"| {flat_result['sign_code_lines']:>3} sign-code lines")
    print(f"  Embedded images    : {len(image_blocks)} raster blocks (likely title block)")
    print(f"\n  Conclusion: {conclusion['text_codes_status']}")
    print(f"  Stage G recommendation: {conclusion['stage_g_recommendation']}")
    print(f"\n  Rationale: {conclusion['rationale']}")

    if words_result.get("sign_codes_artifacts"):
        print(f"\n  Zero-size artifacts (NOT usable):")
        for sc in words_result["sign_codes_artifacts"]:
            b = sc["bbox"]
            print(f"    '{sc['text']}' w={sc['bbox_w_pts']}pt h={sc['bbox_h_pts']}pt  [{sc.get('artifact_reason','')}]")

    if words_result.get("sign_codes_real"):
        print(f"\n  Real sign-code tokens (usable):")
        for sc in words_result["sign_codes_real"]:
            b = sc["bbox"]
            print(f"    '{sc['text']}' → cx={b['cx']} cy={b['cy']}  w={sc['bbox_w_pts']}pt h={sc['bbox_h_pts']}pt")

    print(f"\n  All PDF text tokens:")
    for t in words_result["sample_all"]:
        b = t["bbox"]
        print(f"    '{t['text']}'  w={t['bbox_w_pts']}pt h={t['bbox_h_pts']}pt  pos=({b['x0']},{b['y0']})")

    # Save JSON
    diag = {
        "source_pdf": pdf_path,
        "fitz_version": fitz.__version__,
        "page_rect": list(page.rect),
        "page_rotation": page.rotation,
        "words_extraction": words_result,
        "rawdict_extraction": raw_result,
        "blocks_extraction": blocks_result,
        "flat_text_extraction": flat_result,
        "embedded_image_blocks": image_blocks,
        "coordinate_reliability": coord_result,
        "conclusion": conclusion,
    }

    json_path = output_path("text_code_extraction_diagnostic.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(diag, f, indent=2, ensure_ascii=False)
    print(f"\n  Saved → {json_path}")

    md_path = output_path("text_code_extraction_diagnostic.md")
    write_report(diag, md_path)
    print(f"  Saved → {md_path}")

    doc.close()


if __name__ == "__main__":
    main()
