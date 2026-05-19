#!/usr/bin/env python3
"""
Stage F — Legend Extraction
Smart Hybrid Legend Pipeline for CAD PDF Intelligence.

Extracts the plan legend (מקרא מפה) as a structured vocabulary for downstream
sign recognition, quantity reconciliation, and execution report generation.

Detection strategy (ordered by reliability):
  1. Horizontal line density on low-DPI render (legend rows have dense separators)
  2. Large bordered rectangle detection via page.get_drawings()
  3. Fallback: right 22% strip of display space (common Israeli plan layout)

Row segmentation: horizontal projection profile on rendered legend image.
Icon extraction: right ICON_COL_FRAC of each row (RTL: icons on right in Hebrew plans).
Vision (optional): full legend crop → Claude Vision → structured semantic row data.
                   Skipped gracefully if ANTHROPIC_API_KEY is not configured.

Inputs:
  [pdf_path]   — CAD PDF (defaults to standard sample)

Outputs:
  outputs/legend_region_detection.json   — detected region, method, confidence
  outputs/legend_rows.json               — per-row geometric + semantic data
  outputs/legend_vocabulary.json         — merged plan vocabulary (ready for Stage G/H/I)
  outputs/legend_debug_overlay.png       — full-page render with legend + rows annotated
  outputs/legend_region_crop.png         — rendered legend region (for inspection)
  outputs/legend_extraction_report.md    — human-readable summary
  outputs/legend_icons/row_NNN.png       — icon crops per row
"""

import sys
import os
import json
import base64
import time
from pathlib import Path
from typing import Optional, List, Dict, Tuple

import numpy as np
import cv2
import fitz  # PyMuPDF

from cad_utils import output_path, save_json


DEFAULT_PDF = "/Users/eliozedri/Downloads/50-448-02-400.pdf"
PAGE_NUM    = 0          # page index to process
RENDER_DPI  = 150        # DPI for legend region rendering (icon crops, row segmentation)
FULL_DPI    = 72         # DPI for full-page render (legend detection only)

# Row segmentation thresholds
MIN_ROW_HEIGHT_PX = 50   # rows shorter than this are skipped (noise / separator lines)

# Icon column heuristic: right fraction of each legend row (RTL Hebrew layout)
# Icons appear on the right; Hebrew description text appears on the left.
ICON_COL_FRAC = 0.35

# Vision model (used only if ANTHROPIC_API_KEY is set)
VISION_MODEL = "claude-opus-4-5"


# ── Coordinate transforms (page rotation = 270°) ────────────────────────────────
# page.rect    = (0, 0, 4536, 2551) — display / landscape space
# page.mediabox = (0, 0, 2551, 4536) — PyMuPDF portrait / mediabox space
# Transform: display_x = pm_y,  display_y = orig_w - pm_x  (orig_w = mediabox.width = 2551)

def display_to_pm(dx0: float, dy0: float, dx1: float, dy1: float,
                  orig_w: float) -> Tuple[float, float, float, float]:
    """Display (landscape) rect → mediabox (portrait) rect."""
    return (orig_w - dy1, dx0, orig_w - dy0, dx1)

def pm_to_display(px0: float, py0: float, px1: float, py1: float,
                  orig_w: float) -> Tuple[float, float, float, float]:
    """Mediabox (portrait) rect → display (landscape) rect."""
    return (py0, orig_w - px1, py1, orig_w - px0)


# ── Page rendering ─────────────────────────────────────────────────────────────

def render_display_region(page: fitz.Page, dx0: float, dy0: float,
                           dx1: float, dy1: float, dpi: float) -> np.ndarray:
    """Render a display-space rect to a BGR numpy array at the given DPI."""
    scale = dpi / 72.0
    clip  = fitz.Rect(dx0, dy0, dx1, dy1) & page.rect
    if clip.is_empty or clip.width < 2 or clip.height < 2:
        return np.zeros((10, 10, 3), dtype=np.uint8)
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=clip, colorspace=fitz.csRGB)
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


# ── Strategy 1: Bordered region in edge strip ─────────────────────────────────

def _detect_via_line_density(page: fitz.Page,
                              display_w: float, display_h: float) -> Optional[Dict]:
    """
    Render only the RIGHT edge strip (outer 25%) and find the bordered legend region.

    Legend detection logic:
      1. Find all horizontal lines spanning ≥ 25% of the strip width.
      2. Classify lines as 'border' (spans ≥ 60%) vs. 'separator' (narrower).
      3. Top and bottom border lines bound the entire legend box.
      4. Return the full bounding rect from top-border to bottom-border.

    This is robust against the main road map, which is in the inner 75% of the page.
    """
    EDGE_FRAC = 0.25
    scale     = FULL_DPI / 72.0
    edge_x0   = display_w * (1.0 - EDGE_FRAC)

    pix = page.get_pixmap(
        matrix=fitz.Matrix(scale, scale),
        clip=fitz.Rect(edge_x0, 0, display_w, display_h),
        colorspace=fitz.csGRAY,
    )
    img      = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
    h_s, w_s = img.shape

    _, binary = cv2.threshold(img, 200, 255, cv2.THRESH_BINARY_INV)

    # Detect horizontal lines spanning ≥ 25% of strip width
    kern_w = max(w_s // 4, 15)
    kernel  = cv2.getStructuringElement(cv2.MORPH_RECT, (kern_w, 1))
    h_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
    proj    = np.sum(h_lines, axis=1)
    thresh  = max(w_s * 0.10, 10)

    # Collect contiguous horizontal-line bands
    bands   = []
    in_band = False
    b_start = 0
    for i, v in enumerate(proj):
        if v >= thresh and not in_band:
            in_band, b_start = True, i
        elif v < thresh and in_band:
            in_band = False
            bands.append((b_start, i))
    if in_band:
        bands.append((b_start, h_s))

    if len(bands) < 2:
        return None

    # Classify each band as 'border' (full-width: ≥60% span) or 'separator' (narrower)
    border_ys  = []
    all_col_xs = []
    for ys, ye in bands:
        row_active = np.where(np.sum(h_lines[ys:ye, :], axis=0) > 0)[0]
        if len(row_active) == 0:
            continue
        span = row_active[-1] - row_active[0]
        all_col_xs.extend([int(row_active[0]), int(row_active[-1])])
        if span >= w_s * 0.60:
            border_ys.append((ys + ye) // 2)

    if len(border_ys) < 2:
        # No clear full-width borders — use first and last band with reasonable span
        border_ys = [bands[0][0], bands[-1][1]]

    y_top = min(border_ys)
    y_bot = max(border_ys)

    if y_bot - y_top < 30:
        return None

    # X extent: widest span across all detected line bands
    xs = min(all_col_xs) if all_col_xs else 0
    xe = max(all_col_xs) if all_col_xs else w_s - 1

    pad   = 8
    dx0   = max(0.0,       edge_x0 + xs / scale - pad)
    dy0   = max(0.0,       y_top / scale - pad)
    dx1   = min(display_w, edge_x0 + xe / scale + pad)
    dy1   = min(display_h, y_bot / scale + pad)

    return {
        "display_rect":        (dx0, dy0, dx1, dy1),
        "n_row_separators":    len(bands) - len(border_ys),
        "n_full_border_lines": len(border_ys),
    }


# ── Strategy 2: Large bordered rectangles ─────────────────────────────────────

def _detect_via_drawings(page: fitz.Page, orig_w: float,
                          display_w: float, display_h: float) -> Optional[Dict]:
    """
    Scan page.get_drawings() for large rect-shaped paths near page x-edges.
    Drawings are in mediabox (portrait) space — transform to display before scoring.
    """
    candidates = []
    for d in page.get_drawings():
        r = d.get("rect")
        if r is None:
            continue
        rw, rh = r.width, r.height
        if rw < 30 or rh < 30:
            continue
        area   = rw * rh
        if area < 5000:
            continue
        aspect = max(rw, rh) / max(min(rw, rh), 0.1)
        if aspect > 20:
            continue

        ddx0, ddy0, ddx1, ddy1 = pm_to_display(r.x0, r.y0, r.x1, r.y1, orig_w)
        cx_frac = ((ddx0 + ddx1) / 2) / display_w
        # Only consider rects in the outer 20% of display width (legend is near edge)
        if min(cx_frac, 1 - cx_frac) > 0.20:
            continue

        candidates.append({"area": area, "display_rect": (ddx0, ddy0, ddx1, ddy1)})

    if not candidates:
        return None
    candidates.sort(key=lambda c: -c["area"])
    return {"display_rect": candidates[0]["display_rect"]}


# ── Master detection ───────────────────────────────────────────────────────────

def detect_legend_region(page: fitz.Page, orig_w: float) -> Dict:
    """
    Multi-strategy legend detection.  Returns dict with:
      display_rect   — [x0, y0, x1, y1] in display / landscape coords
      pm_rect        — [x0, y0, x1, y1] in mediabox / portrait coords
      method         — which strategy was used
      confidence     — 0.0–1.0 estimate
    """
    display_w = page.rect.width   # 4536
    display_h = page.rect.height  # 2551

    r1 = _detect_via_line_density(page, display_w, display_h)
    if r1:
        dr = r1["display_rect"]
        return {
            "display_rect": list(dr),
            "pm_rect":      list(display_to_pm(*dr, orig_w)),
            "method":       "line_density",
            "confidence":   0.75,
            "detail":       r1,
        }

    r2 = _detect_via_drawings(page, orig_w, display_w, display_h)
    if r2:
        dr = r2["display_rect"]
        return {
            "display_rect": list(dr),
            "pm_rect":      list(display_to_pm(*dr, orig_w)),
            "method":       "large_rect",
            "confidence":   0.50,
        }

    # Fallback: right 22% strip of display width
    dx0 = display_w * 0.78
    return {
        "display_rect": [dx0, 0.0, display_w, display_h],
        "pm_rect":      list(display_to_pm(dx0, 0.0, display_w, display_h, orig_w)),
        "method":       "fallback_right_strip",
        "confidence":   0.10,
        "warning":      "No reliable legend detection — using right-side fallback.",
    }


# ── Sign legend sub-box detection ─────────────────────────────────────────────

def find_sign_legend_subbox(page: fitz.Page, orig_w: float,
                             legend_disp_rect: List[float]) -> Optional[List[float]]:
    """
    Within the detected legend region, find the SIGN LEGEND SUB-BOX.

    The right side of a typical Israeli traffic plan has:
      - A map overview box (top portion, roughly square)
      - The sign legend box (lower portion, taller than wide)
      - Project info / title block (right column)

    We find the sign legend box by scanning page.get_drawings() for bordered rectangles
    that are:
      - In the LEFT 55% of the legend region (not the right project-info column)
      - NOT the full plan frame (too large)
      - NOT the map overview box (too wide — wider than it is tall)
      - Taller than it is wide (portrait orientation → legend box)

    Falls back to the bottom 65% of the left 55% strip if no clear candidate is found.
    """
    ldx0, ldy0, ldx1, ldy1 = legend_disp_rect
    region_w = ldx1 - ldx0
    region_h = ldy1 - ldy0

    # Search the LEFT 55% of the legend region
    search_x1 = ldx0 + region_w * 0.55

    candidates = []
    for d in page.get_drawings():
        r = d.get("rect")
        if r is None:
            continue
        # Transform pm → display
        dx0, dy0, dx1, dy1 = pm_to_display(r.x0, r.y0, r.x1, r.y1, orig_w)
        rw, rh = dx1 - dx0, dy1 - dy0

        # Must overlap the search region
        if dx1 < ldx0 or dx0 > search_x1:
            continue
        if dy1 < ldy0 or dy0 > ldy1:
            continue

        # Must be a meaningful bordered rectangle (not a tiny line)
        if rw < 50 or rh < 80:
            continue

        area = rw * rh
        if area < 5000:
            continue

        # Exclude the full-plan frame (area > 80% of full page area)
        if area > 4536 * 2551 * 0.80:
            continue

        # Prefer taller-than-wide (portrait legend box, not landscape map overview)
        portrait_score = rh / max(rw, 1)

        candidates.append({
            "display_rect": [dx0, dy0, dx1, dy1],
            "area":         area,
            "portrait":     portrait_score,
        })

    if not candidates:
        # Fallback: bottom 65% of left 55% of the legend region
        return [ldx0, ldy0 + region_h * 0.35, search_x1, ldy1]

    # Sort by portrait orientation score first, then by area
    candidates.sort(key=lambda c: (-c["portrait"], -c["area"]))
    return candidates[0]["display_rect"]


# ── Row segmentation ──────────────────────────────────────────────────────────

def segment_rows(legend_bgr: np.ndarray,
                 legend_disp_rect: List[float]) -> List[Dict]:
    """
    Segment the sign legend image into rows using Y-projection gap detection.

    Each sign legend row has content (text + icon) producing dense dark pixels.
    Between rows there is whitespace or a thin separator line (< 5px) producing
    near-zero pixel density. We find row boundaries at those low-density bands.

    Falls back to 5 equal-height rows if no gaps are found.
    """
    h_img, w_img = legend_bgr.shape[:2]
    gray = cv2.cvtColor(legend_bgr, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 230, 255, cv2.THRESH_BINARY_INV)

    # Y-projection: how many dark pixels per horizontal strip
    content_proj = np.sum(binary, axis=1).astype(np.float32)

    # Smooth with a wide kernel so thin separator lines and small gaps between
    # the sign icon and the code-number text don't split a row into fragments.
    # 25px ≈ 12pt at 150 DPI — smaller than any real sign row gap but larger than
    # the gap between the icon and its code number below it.
    kernel_smooth = np.ones(25, dtype=np.float32) / 25
    content_proj = np.convolve(content_proj, kernel_smooth, mode="same")

    # Gap threshold: rows with < 8% of the max density are considered "empty"
    max_density = content_proj.max()
    if max_density == 0:
        # No content found — return single "unknown" row
        return _make_row(0, 0, h_img, w_img, legend_disp_rect)

    gap_thresh = max_density * 0.08

    # Find contiguous gap bands
    is_gap = content_proj <= gap_thresh
    gap_bands = []
    in_gap, g_start = False, 0
    for i, g in enumerate(is_gap):
        if g and not in_gap:
            in_gap, g_start = True, i
        elif not g and in_gap:
            in_gap = False
            gap_bands.append((g_start, i))
    if in_gap:
        gap_bands.append((g_start, h_img))

    # Build row boundaries: between consecutive gap bands
    # Use the CENTER of each gap band as the dividing line between rows
    if len(gap_bands) < 2:
        # No clear gaps — fall back to single row or 5 equal rows
        return _make_row(0, 0, h_img, w_img, legend_disp_rect)

    boundaries = [0]
    for gb_start, gb_end in gap_bands:
        center = (gb_start + gb_end) // 2
        boundaries.append(center)
    boundaries.append(h_img)

    # Build rows
    dx0, dy0, dx1, dy1 = legend_disp_rect
    lgnd_w = dx1 - dx0
    lgnd_h = dy1 - dy0
    sx     = lgnd_w / max(w_img, 1)
    sy     = lgnd_h / max(h_img, 1)

    # Icon column: right ICON_COL_FRAC of each row
    icon_px0 = int(w_img * (1.0 - ICON_COL_FRAC))

    rows = []
    for i in range(len(boundaries) - 1):
        ry0, ry1 = boundaries[i], boundaries[i + 1]
        row_h = ry1 - ry0
        if row_h < MIN_ROW_HEIGHT_PX:
            continue

        # Skip gap-only rows (where content_proj stays near zero throughout)
        row_density = content_proj[ry0:ry1].max()
        if row_density <= gap_thresh:
            continue

        rows += _make_row(len(rows), ry0, ry1, w_img, legend_disp_rect,
                          icon_px0=icon_px0, sx=sx, sy=sy, dx0=dx0, dy0=dy0, dx1=dx1)

    return rows


def _make_row(row_idx: int, ry0: int, ry1: int, w_img: int,
              legend_disp_rect: List[float],
              icon_px0: Optional[int] = None,
              sx: float = 1.0, sy: float = 1.0,
              dx0: float = 0.0, dy0: float = 0.0, dx1: float = 0.0) -> List[Dict]:
    """Build a list containing a single row dict (convenience)."""
    if icon_px0 is None:
        icon_px0 = int(w_img * (1.0 - ICON_COL_FRAC))
        ldx0, ldy0, ldx1, ldy1 = legend_disp_rect
        dx0, dy0, dx1 = ldx0, ldy0, ldx1
        lgnd_w = ldx1 - ldx0
        lgnd_h = ldy1 - ldy0
        sx = lgnd_w / max(w_img, 1)
        sy = lgnd_h / max(ry1 - ry0, 1)

    return [{
        "row_index":      row_idx,
        "page_number":    PAGE_NUM,
        "row_bbox_px":    [0, ry0, w_img, ry1],
        "row_bbox":       [dx0,          dy0 + ry0 * sy, dx1,           dy0 + ry1 * sy],
        "icon_bbox":      [dx0 + icon_px0 * sx, dy0 + ry0 * sy,
                           dx1,           dy0 + ry1 * sy],
        "text_bbox":      [dx0,          dy0 + ry0 * sy,
                           dx0 + icon_px0 * sx, dy0 + ry1 * sy],
        "row_height_px":  ry1 - ry0,
        "icon_crop_path": None,
        "hebrew_label":   None,
        "english_label":  None,
        "sign_code":      None,
        "quantity":       None,
        "confidence":     None,
        "source":         "geometric_only",
        "uncertainty":    None,
    }]


# ── Icon crop extraction ───────────────────────────────────────────────────────

def crop_icons(rows: List[Dict], legend_bgr: np.ndarray) -> List[Dict]:
    """
    Crop each row's icon zone from the rendered legend image.
    Saves to outputs/legend_icons/row_NNN.png.
    """
    icons_dir = output_path("legend_icons")
    icons_dir.mkdir(exist_ok=True)
    # Remove stale crops from previous runs
    for old in icons_dir.glob("row_*.png"):
        old.unlink()

    h_img, w_img = legend_bgr.shape[:2]

    for row in rows:
        ry0 = row["row_bbox_px"][1]
        ry1 = row["row_bbox_px"][3]
        ix0 = int(w_img * (1.0 - ICON_COL_FRAC))

        crop = legend_bgr[ry0:ry1, ix0:]
        if crop.size == 0 or crop.shape[0] < 2 or crop.shape[1] < 2:
            continue

        out_path = icons_dir / f"row_{row['row_index']:03d}.png"
        cv2.imwrite(str(out_path), crop)
        # Store as relative path from the research dir
        row["icon_crop_path"] = str(
            out_path.relative_to(Path(__file__).parent)
        )

    return rows


# ── Vision extraction (optional) ──────────────────────────────────────────────

_VISION_PROMPT = """This is the legend (מקרא מפה) from an Israeli traffic arrangement plan PDF.
Each row in this legend shows one type of sign or symbol used in the plan.
The legend is in Hebrew (right-to-left). Icons/symbols appear on the right side of each row;
Hebrew description text appears on the left side.

Please extract structured data for each row. Return ONLY a valid JSON array — no markdown, no explanation.
Each element must have exactly these fields:
{
  "row_index": <integer, 0-based counting from the first non-header row at the top>,
  "hebrew_label": "<Hebrew text label for this sign/symbol, or null if unreadable>",
  "english_label": "<English translation or standard name, or null>",
  "sign_code": "<sign/symbol code number visible in the row (e.g. '101', '201-1', 'B-15'), or null>",
  "quantity": <integer quantity declared for this sign in the plan, or null>,
  "confidence": <float 0.0 to 1.0 for how confident you are in this row's extraction>,
  "uncertainty": "<brief notes on what is unclear or ambiguous, or null>"
}

Skip the header row (the מקרא title at the top).
Return only the JSON array.
"""


def run_vision_extraction(legend_bgr: np.ndarray) -> Optional[List[Dict]]:
    """
    Send the rendered legend image to Claude Vision for semantic row extraction.
    Returns list of vision row dicts, or None if API unavailable.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        print("  [Vision] ANTHROPIC_API_KEY not set — geometric-only mode.")
        print("  [Vision] Set the key and re-run to add: Hebrew labels, sign codes, quantities.")
        return None

    try:
        import anthropic
    except ImportError:
        print("  [Vision] anthropic package not installed — skipping Vision.")
        return None

    # Encode legend as base64 PNG
    _, buf = cv2.imencode(".png", legend_bgr)
    b64    = base64.standard_b64encode(buf.tobytes()).decode("utf-8")

    try:
        client = anthropic.Anthropic(api_key=api_key)
        print(f"  [Vision] Sending legend crop to {VISION_MODEL} ...")
        t0 = time.perf_counter()

        msg = client.messages.create(
            model=VISION_MODEL,
            max_tokens=2048,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type":       "base64",
                            "media_type": "image/png",
                            "data":       b64,
                        },
                    },
                    {"type": "text", "text": _VISION_PROMPT},
                ],
            }],
        )
        elapsed = time.perf_counter() - t0
        print(f"  [Vision] Response received in {elapsed:.1f}s")

        raw = msg.content[0].text.strip()
        if raw.startswith("```"):
            lines = raw.splitlines()
            raw   = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        vision_rows = json.loads(raw)
        print(f"  [Vision] Extracted {len(vision_rows)} semantic rows")
        return vision_rows

    except Exception as e:
        print(f"  [Vision] Call failed: {e}")
        return None


def merge_vision(geom_rows: List[Dict],
                 vision_rows: Optional[List[Dict]]) -> List[Dict]:
    """
    Overlay Vision semantic data onto geometric rows.
    Unmatched geometric rows keep source=geometric_only with a clear uncertainty note.
    """
    api_key_configured = bool(os.environ.get("ANTHROPIC_API_KEY", "").strip())

    if not vision_rows:
        for row in geom_rows:
            if api_key_configured:
                row["source"]      = "vision_failed"
                row["uncertainty"] = "Vision API call failed — check logs."
            else:
                row["source"]      = "pending_vision_configuration"
                row["uncertainty"] = (
                    "Set ANTHROPIC_API_KEY and re-run Stage F to extract "
                    "Hebrew labels, sign codes, and quantities."
                )
        return geom_rows

    vision_by_idx = {v["row_index"]: v for v in vision_rows}

    for row in geom_rows:
        v = vision_by_idx.get(row["row_index"])
        if v:
            row["hebrew_label"]  = v.get("hebrew_label")
            row["english_label"] = v.get("english_label")
            row["sign_code"]     = v.get("sign_code")
            row["quantity"]      = v.get("quantity")
            row["confidence"]    = v.get("confidence")
            row["uncertainty"]   = v.get("uncertainty")
            row["source"]        = "full_legend_vision"
        else:
            row["source"]      = "geometric_only"
            row["uncertainty"] = "Row not matched in Vision response."

    return geom_rows


# ── Debug overlay ──────────────────────────────────────────────────────────────

def build_debug_overlay(page: fitz.Page, detection: Dict,
                         rows: List[Dict]) -> np.ndarray:
    """Full-page render at 20% scale, annotated with legend region and row bboxes."""
    SCALE = 0.20
    pix   = page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), colorspace=fitz.csRGB)
    arr   = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    img   = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)

    dr   = detection["display_rect"]
    lx0  = int(dr[0] * SCALE)
    ly0  = int(dr[1] * SCALE)
    lx1  = int(dr[2] * SCALE)
    ly1  = int(dr[3] * SCALE)
    cv2.rectangle(img, (lx0, ly0), (lx1, ly1), (255, 200, 0), 2)  # cyan-ish frame

    label = f"Legend: {detection['method']} conf={detection['confidence']:.2f}"
    cv2.putText(img, label, (lx0, max(ly0 - 4, 10)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.28, (255, 200, 0), 1, cv2.LINE_AA)

    for row in rows:
        rb  = row["row_bbox"]
        rx0 = int(rb[0] * SCALE); ry0 = int(rb[1] * SCALE)
        rx1 = int(rb[2] * SCALE); ry1 = int(rb[3] * SCALE)
        cv2.rectangle(img, (rx0, ry0), (rx1, ry1), (0, 200, 100), 1)   # row: green

        ib  = row["icon_bbox"]
        ix0 = int(ib[0] * SCALE); iy0 = int(ib[1] * SCALE)
        ix1 = int(ib[2] * SCALE); iy1 = int(ib[3] * SCALE)
        cv2.rectangle(img, (ix0, iy0), (ix1, iy1), (0, 140, 255), 1)   # icon zone: orange

        tag = f"R{row['row_index']}"
        if row.get("sign_code"):
            tag += f"/{row['sign_code']}"
        cv2.putText(img, tag, (rx0 + 1, ry0 + 7),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.20, (0, 200, 100), 1, cv2.LINE_AA)

    return img


# ── Report ─────────────────────────────────────────────────────────────────────

def write_report(vocab: Dict, pdf_path: str, t_elapsed: float) -> Path:
    rows      = vocab["rows"]
    n         = len(rows)
    n_crops   = sum(1 for r in rows if r.get("icon_crop_path"))
    vis_used  = vocab["vision_used"]
    vis_conf  = vocab["vision_configured"]

    lines = [
        "# Stage F — Legend Extraction Report",
        "",
        f"**PDF:** `{pdf_path}`  ",
        f"**Page:** {PAGE_NUM}  ",
        f"**Detection method:** {vocab['detection_method']}  ",
        f"**Detection confidence:** {vocab['detection_confidence']:.2f}  ",
        f"**Elapsed:** {t_elapsed:.1f}s  ",
        "",
        "---",
        "## Results",
        "",
        "| Metric | Value |",
        "|--------|-------|",
        f"| Legend rows detected | {n} |",
        f"| Icon crops saved | {n_crops} |",
        f"| Vision API configured | {'Yes' if vis_conf else 'No'} |",
        f"| Vision actually used | {'Yes' if vis_used else 'No'} |",
        "",
    ]

    if n == 0:
        lines.append("_No rows detected. Check legend detection confidence and debug overlay._")
    else:
        lines += [
            "## Row Summary",
            "",
            "| Row | Height px | Source | Sign Code | Hebrew Label | Qty | Conf |",
            "|-----|-----------|--------|-----------|--------------|-----|------|",
        ]
        for r in rows:
            code  = r.get("sign_code") or "—"
            label = (r.get("hebrew_label") or "—")[:30]
            qty   = str(r.get("quantity") or "—")
            conf  = f"{r['confidence']:.2f}" if r.get("confidence") is not None else "—"
            lines.append(
                f"| {r['row_index']} | {r['row_height_px']} | {r['source']} "
                f"| {code} | {label} | {qty} | {conf} |"
            )

    lines += [
        "",
        "---",
        "## Vision Status",
        "",
    ]
    if vis_used:
        lines += [
            "Claude Vision was used. Semantic fields extracted per row:",
            "- `hebrew_label` — Hebrew text label",
            "- `english_label` — English normalized name",
            "- `sign_code` — sign/symbol code number",
            "- `quantity` — declared plan quantity",
        ]
    else:
        lines += [
            "Claude Vision was **not** used.",
            f"ANTHROPIC_API_KEY {'not set' if not vis_conf else 'set but call failed'}.  ",
            "",
            "Geometric outputs are complete and useful without Vision:",
            "- Legend region bounding box (`legend_region_detection.json`)",
            "- Per-row bboxes: `row_bbox`, `icon_bbox`, `text_bbox`",
            "- Icon crops: `outputs/legend_icons/row_NNN.png`",
            "",
            "Semantic fields (`hebrew_label`, `sign_code`, `quantity`) are `null` with",
            "`source: pending_vision_configuration`. To unlock:",
            "```bash",
            "export ANTHROPIC_API_KEY=<your-key>",
            "python 07_extract_legend.py <pdf_path>",
            "```",
        ]

    lines += [
        "",
        "---",
        "## Downstream Use (Stage G / H / I)",
        "",
        "Stage F outputs are the **plan-scoped vocabulary** — not a global catalog.",
        "Every plan teaches the system its own sign vocabulary via its legend.",
        "",
        "**Stage G — Sign Matching:**",
        "  Use `icon_crop_path` images as per-plan reference templates.",
        "  These icons are drawn in the same AutoCAD schematic style as the map signs,",
        "  eliminating the style gap that limits Stage E (catalog photos vs. schematics).",
        "",
        "**Stage H — Quantity Reconciliation:**",
        "  Compare `quantity` (legend declared) vs. detected sign count on map.",
        "  Discrepancies flag items for review before installation.",
        "",
        "**Stage I — Execution Report:**",
        "  Use `hebrew_label` + `sign_code` + `quantity` as declared scope.",
        "  Compare against installed/detected signs for completion status.",
        "",
        "---",
        "## Known Limitations",
        "",
        f"- Detection method: `{vocab['detection_method']}` (confidence={vocab['detection_confidence']:.2f})",
        "- Hebrew text is rendered as vector paths in this CAD PDF (not actual text).",
        "  Only 14 text blocks are extractable (numeric dates/codes). Hebrew labels",
        "  require Vision or OCR — geometric extraction cannot read them.",
        "- Icon column heuristic: right 35% of each row (RTL Hebrew layout).",
        "  Some plans may have a different icon column position.",
        "- Row segmentation relies on horizontal separator lines being detectable.",
        "  Legends without visible ruled lines may not segment correctly.",
    ]

    path = output_path("legend_extraction_report.md")
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PDF
    t_start  = time.perf_counter()

    print(f"[07_extract_legend] {pdf_path}")

    if not Path(pdf_path).exists():
        print(f"  [!] PDF not found: {pdf_path}")
        sys.exit(1)

    doc    = fitz.open(pdf_path)
    page   = doc[PAGE_NUM]
    orig_w = page.mediabox.width  # 2551 for this plan
    print(f"  Page rect={page.rect}  mediabox_w={orig_w:.0f}pt  rotation={page.rotation}°")

    # ── 1/6 Detect legend region ──────────────────────────────────────────────
    print("\n  [1/6] Detecting legend region ...")
    detection = detect_legend_region(page, orig_w)
    dr = detection["display_rect"]
    print(f"  Method: {detection['method']}  confidence={detection['confidence']:.2f}")
    print(f"  Display rect: ({dr[0]:.0f},{dr[1]:.0f}) → ({dr[2]:.0f},{dr[3]:.0f})")
    if "warning" in detection:
        print(f"  [!] {detection['warning']}")
    save_json(detection, "legend_region_detection.json")

    # ── 2/6 Render — full region + sign legend sub-box ────────────────────────
    print("\n  [2/6] Rendering legend region and sign legend sub-box ...")
    legend_bgr = render_display_region(page, *dr, RENDER_DPI)
    print(f"  Full region render: {legend_bgr.shape[1]}×{legend_bgr.shape[0]}px @ {RENDER_DPI}dpi")
    cv2.imwrite(str(output_path("legend_region_crop.png")), legend_bgr)

    # Detect the sign legend sub-box (excludes map overview and project-info column)
    subbox = find_sign_legend_subbox(page, orig_w, dr)
    detection["sign_legend_subbox"] = subbox
    print(f"  Sign legend sub-box: ({subbox[0]:.0f},{subbox[1]:.0f}) → ({subbox[2]:.0f},{subbox[3]:.0f})")

    # Render the sub-box specifically for row segmentation and icon crops
    subbox_bgr = render_display_region(page, *subbox, RENDER_DPI)
    print(f"  Sub-box render:  {subbox_bgr.shape[1]}×{subbox_bgr.shape[0]}px @ {RENDER_DPI}dpi")
    cv2.imwrite(str(output_path("legend_subbox_crop.png")), subbox_bgr)
    # Also save updated detection JSON
    save_json(detection, "legend_region_detection.json")

    # ── 3/6 Segment rows ──────────────────────────────────────────────────────
    print("\n  [3/6] Segmenting rows within sign legend sub-box ...")
    rows = segment_rows(subbox_bgr, subbox)
    print(f"  Detected {len(rows)} rows")
    for r in rows[:6]:
        print(f"    R{r['row_index']}: h={r['row_height_px']}px  y={r['row_bbox'][1]:.0f}-{r['row_bbox'][3]:.0f}")

    # ── 4/6 Crop icons ────────────────────────────────────────────────────────
    print("\n  [4/6] Cropping icon zones ...")
    rows = crop_icons(rows, subbox_bgr)
    n_crops = sum(1 for r in rows if r.get("icon_crop_path"))
    print(f"  Saved {n_crops} icon crops → outputs/legend_icons/")

    # ── 5/6 Vision (optional) ─────────────────────────────────────────────────
    print("\n  [5/6] Vision semantic extraction ...")
    vision_data = run_vision_extraction(subbox_bgr)
    rows = merge_vision(rows, vision_data)
    save_json({"pdf": pdf_path, "page": PAGE_NUM, "rows": rows}, "legend_rows.json")

    # ── 6/6 Vocabulary + outputs ──────────────────────────────────────────────
    print("\n  [6/6] Building vocabulary and outputs ...")
    vocab = {
        "source_pdf":             pdf_path,
        "page_number":            PAGE_NUM,
        "detection_method":       detection["method"],
        "detection_confidence":   detection["confidence"],
        "n_rows":                 len(rows),
        "vision_used":            any(r.get("source") == "full_legend_vision" for r in rows),
        "vision_configured":      bool(os.environ.get("ANTHROPIC_API_KEY", "").strip()),
        "rows":                   rows,
    }
    if not vocab["vision_configured"]:
        vocab["vision_note"] = (
            "ANTHROPIC_API_KEY not set. Semantic fields (hebrew_label, english_label, "
            "sign_code, quantity) are pending_vision_configuration. "
            "All geometric outputs (bboxes, icon crops) are complete and usable for "
            "Stage G template matching without Vision."
        )

    save_json(vocab, "legend_vocabulary.json")

    # Use sub-box as the annotated region in the overlay
    detection_for_overlay = dict(detection)
    detection_for_overlay["display_rect"] = subbox
    overlay = build_debug_overlay(page, detection_for_overlay, rows)
    cv2.imwrite(str(output_path("legend_debug_overlay.png")), overlay)

    t_elapsed = time.perf_counter() - t_start
    report_path = write_report(vocab, pdf_path, t_elapsed)

    doc.close()

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n  ─── Stage F Complete {'─'*40}")
    print(f"  Elapsed:       {t_elapsed:.1f}s")
    print(f"  Detection:     {detection['method']}  (conf={detection['confidence']:.2f})")
    print(f"  Rows:          {len(rows)}")
    print(f"  Icon crops:    {n_crops}")
    print(f"  Vision:        {'Yes' if vocab['vision_used'] else 'No — ANTHROPIC_API_KEY not set'}")
    print(f"  Sub-box:       ({subbox[0]:.0f},{subbox[1]:.0f})→({subbox[2]:.0f},{subbox[3]:.0f})")
    print(f"  Outputs:")
    print(f"    outputs/legend_region_detection.json")
    print(f"    outputs/legend_rows.json")
    print(f"    outputs/legend_vocabulary.json")
    print(f"    outputs/legend_debug_overlay.png")
    print(f"    outputs/legend_region_crop.png")
    print(f"    outputs/legend_subbox_crop.png")
    print(f"    {report_path}")
    print(f"    outputs/legend_icons/  ({n_crops} files)")
    print(f"  {'─'*56}")


if __name__ == "__main__":
    main()
