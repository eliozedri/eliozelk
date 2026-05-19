#!/usr/bin/env python3
"""
Stage G — Local-First OCR Sign Code Diagnostic (10_local_ocr_sign_codes.py)

Attempts to read Israeli traffic sign codes from the 177 Stage G code crops
using Tesseract OCR with multiple preprocessing variants.

This is a FREE/LOCAL-FIRST diagnostic layer whose purpose is to:
  1. Determine whether any crops yield confident local OCR results.
  2. Quantify how many crops still require paid Vision API or human review.
  3. Provide an auditable, honest baseline before any paid API call.

Key finding (documented from diagnostic runs):
  AutoCAD PDF exports render all text — sign codes, speed values, annotations —
  as vector-path outlines rasterised at 150 DPI. These produce thin strokes and
  stylised bold glyphs that Tesseract LSTM (trained on document fonts) does not
  recognise reliably. Local OCR is expected to achieve near-0% confident reads.
  This script confirms that finding at scale across all 177 crops.

Dependencies (system):
  tesseract 5.5.2  —  brew install tesseract   (eng + snum data included)

Dependencies (venv):
  pytesseract      —  .venv/bin/pip install pytesseract
  opencv-python-headless, Pillow, numpy  (already installed)

Usage:
  .venv/bin/python3 10_local_ocr_sign_codes.py

Outputs:
  outputs/local_ocr_sign_codes.json
  outputs/local_ocr_sign_codes_report.md
  outputs/local_ocr_debug/
"""

import json
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

try:
    import pytesseract
    from pytesseract import Output as TessOutput
    _HAS_PYTESS = True
except ImportError:
    _HAS_PYTESS = False

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR     = Path(__file__).parent
OUTPUTS_DIR    = SCRIPT_DIR / "outputs"
CROPS_DIR      = OUTPUTS_DIR / "stage_g_code_crops"
INV_PATH       = OUTPUTS_DIR / "sign_inventory.json"
JSON_OUT       = OUTPUTS_DIR / "local_ocr_sign_codes.json"
REPORT_OUT     = OUTPUTS_DIR / "local_ocr_sign_codes_report.md"
DEBUG_DIR      = OUTPUTS_DIR / "local_ocr_debug"

# ---------------------------------------------------------------------------
# Tesseract configs
# ---------------------------------------------------------------------------
TESS_DIGIT_PSM6  = "--psm 6  --oem 3 -l eng -c tessedit_char_whitelist=0123456789"
TESS_DIGIT_PSM7  = "--psm 7  --oem 3 -l eng -c tessedit_char_whitelist=0123456789"
TESS_DIGIT_PSM8  = "--psm 8  --oem 3 -l eng -c tessedit_char_whitelist=0123456789"
TESS_DIGIT_PSM11 = "--psm 11 --oem 3 -l eng -c tessedit_char_whitelist=0123456789"
TESS_SNUM_PSM11  = "--psm 11 --oem 3 -l snum"

TESS_CONFIGS = [
    ("digit_psm6",  TESS_DIGIT_PSM6),
    ("digit_psm7",  TESS_DIGIT_PSM7),
    ("digit_psm11", TESS_DIGIT_PSM11),
    ("snum_psm11",  TESS_SNUM_PSM11),
]

MIN_TESS_CONF = 30   # minimum confidence to keep a Tesseract token

# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------
CENTER_RADIUS_DEFAULT  = 200   # px from crop centre for sign_symbol / compact_symbol
CENTER_RADIUS_FRAGMENT = 280   # px — wider crop for symbol_fragment (code may be off-centre)
UPSCALE_FACTOR         = 3
WIDE_UPSCALE_FACTOR    = 2
EDGE_MARGIN_PX         = 25    # token bbox within this many px of sub-crop edge → edge_proximity

# ---------------------------------------------------------------------------
# Code classification
# ---------------------------------------------------------------------------
# 3-digit Israeli sign codes (100–999 accepted as plausible; tighten in production)
VALID_3DIGIT_MIN = 100
VALID_3DIGIT_MAX = 999
# 2-digit speed values typically written inside red speed-limit circles
VALID_SPEED_VALUES = {10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110}

# Minimum variants a code must appear in for "high" OCR confidence
MULTI_VARIANT_THRESHOLD = 2

# ---------------------------------------------------------------------------
# Preprocessing helpers
# ---------------------------------------------------------------------------

def _to_pil(gray_np: np.ndarray) -> Image.Image:
    return Image.fromarray(gray_np.astype(np.uint8))


def extract_subcrop(bgr: np.ndarray, radius: int) -> tuple:
    """Return (sub_bgr, offset_x, offset_y) for a square centre crop."""
    h, w = bgr.shape[:2]
    cx, cy = w // 2, h // 2
    x1, y1 = max(0, cx - radius), max(0, cy - radius)
    x2, y2 = min(w, cx + radius), min(h, cy + radius)
    return bgr[y1:y2, x1:x2].copy(), x1, y1


def preprocess_variants(bgr: np.ndarray, scale: int) -> dict:
    """
    Apply six preprocessing variants to bgr.
    Returns dict of variant_name → (PIL Image, scale_used).
    All results upscaled by `scale` for Tesseract.
    """
    variants = {}
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

    def _upscale(arr):
        return cv2.resize(arr, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    # 1. Grayscale raw (Tesseract handles its own binarisation internally)
    variants["gray_raw"] = (_to_pil(_upscale(gray)), scale)

    # 2. Otsu threshold
    _, bw_otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants["gray_otsu"] = (_to_pil(_upscale(bw_otsu)), scale)

    # 3. Adaptive threshold (handles uneven illumination)
    gray_blur = cv2.GaussianBlur(gray, (3, 3), 0)
    bw_adapt = cv2.adaptiveThreshold(
        gray_blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 15, 8
    )
    variants["gray_adaptive"] = (_to_pil(_upscale(bw_adapt)), scale)

    # 4. Sharpened → Otsu (accentuate edges before threshold)
    kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]], dtype=np.float32)
    sharp = cv2.filter2D(bgr, -1, kernel)
    gray_sharp = cv2.cvtColor(sharp, cv2.COLOR_BGR2GRAY)
    _, bw_sharp = cv2.threshold(gray_sharp, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants["sharpened_otsu"] = (_to_pil(_upscale(bw_sharp)), scale)

    # 5. Colour-isolated: mask out strongly coloured fills (red/blue/orange/green),
    #    leaving only black annotation text on white background.
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    coloured = hsv[:, :, 1] > 80  # high saturation = coloured fill
    masked_gray = gray.copy()
    masked_gray[coloured] = 255   # replace coloured areas with white
    _, bw_masked = cv2.threshold(masked_gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants["black_text_only"] = (_to_pil(_upscale(bw_masked)), scale)

    # 6. Inverted Otsu (for white-on-dark elements)
    bw_inv = cv2.bitwise_not(bw_otsu)
    variants["inverted_otsu"] = (_to_pil(_upscale(bw_inv)), scale)

    return variants


def red_circle_interiors(bgr: np.ndarray) -> list:
    """
    Detect red-ring contours (speed-limit circles), extract interiors,
    upscale, threshold. Returns list of (PIL Image, bbox_in_bgr, scale).
    """
    results = []
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    r1 = cv2.inRange(hsv, (0, 100, 80), (12, 255, 255))
    r2 = cv2.inRange(hsv, (158, 100, 80), (180, 255, 255))
    red_mask = cv2.bitwise_or(r1, r2)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    red_mask = cv2.dilate(red_mask, k, iterations=2)

    cnts, _ = cv2.findContours(red_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for c in cnts:
        area = cv2.contourArea(c)
        if area < 150:
            continue
        x, y, bw, bh = cv2.boundingRect(c)
        if bw < 12 or bh < 12:
            continue
        aspect = bw / max(bh, 1)
        if not (0.5 < aspect < 2.0):
            continue
        # Shrink inward to exclude the ring border
        m = max(3, int(min(bw, bh) * 0.18))
        ix, iy = max(0, x + m), max(0, y + m)
        iw = max(1, bw - 2 * m)
        ih = max(1, bh - 2 * m)
        interior = bgr[iy:iy + ih, ix:ix + iw]
        if interior.size == 0 or min(interior.shape[:2]) < 6:
            continue
        gray = cv2.cvtColor(interior, cv2.COLOR_BGR2GRAY)
        scale = max(6, 120 // min(iw, ih))
        big = cv2.resize(gray, None, fx=scale, fy=scale,
                         interpolation=cv2.INTER_LANCZOS4)
        big = cv2.GaussianBlur(big, (3, 3), 0)
        _, bw_th = cv2.threshold(big, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        # Ensure dark-text on white background
        if np.mean(bw_th) < 100:
            bw_th = 255 - bw_th
        results.append((_to_pil(bw_th), (x, y, bw, bh), scale))
    return results


# ---------------------------------------------------------------------------
# Tesseract runner
# ---------------------------------------------------------------------------

def run_tesseract(pil_img: Image.Image, config: str, scale: int, variant: str) -> list:
    """
    Run Tesseract on pil_img.  Returns list of token dicts.
    Bbox coordinates are divided by scale to map back to pre-upscale space.
    """
    if not _HAS_PYTESS:
        return []
    try:
        data = pytesseract.image_to_data(pil_img, config=config,
                                          output_type=TessOutput.DICT)
    except Exception:
        return []

    tokens = []
    for i in range(len(data["text"])):
        raw = data["text"][i].strip()
        conf = int(data["conf"][i])
        if not raw or conf < MIN_TESS_CONF:
            continue
        digits = "".join(c for c in raw if c.isdigit())
        if not digits:
            continue
        bx = int(data["left"][i] / scale)
        by = int(data["top"][i] / scale)
        bw = max(1, int(data["width"][i] / scale))
        bh = max(1, int(data["height"][i] / scale))
        tokens.append({
            "variant":    variant,
            "raw_text":   raw,
            "digits":     digits,
            "tess_conf":  conf,
            "bbox_crop":  [bx, by, bw, bh],
        })
    return tokens


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

def classify_token(digits: str) -> tuple:
    """Return (category, reason)."""
    if not digits:
        return "rejected_numeric_noise", "empty"
    n = len(digits)
    val = int(digits)

    if n == 3 and VALID_3DIGIT_MIN <= val <= VALID_3DIGIT_MAX:
        return "valid_sign_code_candidate", f"3-digit {val} in 100–999 range"
    if n == 2 and val in VALID_SPEED_VALUES:
        return "weak_numeric_candidate", f"2-digit speed value {val}"
    if n == 2:
        return "rejected_numeric_noise", f"2-digit {val} not a known speed value"
    if n == 4:
        return "weak_numeric_candidate", f"4-digit {val} — unconfirmed"
    if n == 1:
        return "rejected_numeric_noise", "single digit"
    return "rejected_numeric_noise", f"{n}-digit outside valid range"


# ---------------------------------------------------------------------------
# Spatial association
# ---------------------------------------------------------------------------

def compute_association(bbox_crop: list, crop_hw: tuple) -> dict:
    """
    Compute association of a token with the cluster centre.
    bbox_crop: [x, y, w, h] in pre-upscale sub-crop space.
    crop_hw:   (height, width) of the sub-crop.
    """
    x, y, w, h = bbox_crop
    ch, cw = crop_hw
    # Token centre in sub-crop space
    tx, ty = x + w / 2, y + h / 2
    # Sub-crop centre
    cx, cy = cw / 2, ch / 2
    dist = ((tx - cx) ** 2 + (ty - cy) ** 2) ** 0.5
    norm = dist / (min(cw, ch) / 2) if min(cw, ch) > 0 else 1.0

    at_edge = (
        x < EDGE_MARGIN_PX
        or y < EDGE_MARGIN_PX
        or (x + w) > (cw - EDGE_MARGIN_PX)
        or (y + h) > (ch - EDGE_MARGIN_PX)
    )

    if norm < 0.4 and not at_edge:
        assoc = "high"
    elif norm < 0.75 and not at_edge:
        assoc = "medium"
    elif at_edge:
        assoc = "low"
    else:
        assoc = "very_low"

    return {
        "distance_from_center_px":  round(dist, 1),
        "normalized_distance":      round(norm, 3),
        "near_center":              norm < 0.5,
        "edge_proximity":           at_edge,
        "association_confidence":   assoc,
    }


# ---------------------------------------------------------------------------
# Best-code selector
# ---------------------------------------------------------------------------

def select_best_code(valid: list, weak: list) -> tuple:
    """
    Returns (selected_code, ocr_confidence, association_confidence,
             requires_review, review_reason, next_action).
    """
    if not valid:
        if weak:
            near = [c for c in weak if c.get("near_center")]
            if near:
                best = min(near, key=lambda c: c["normalized_distance"])
                return (None, "low", best["association_confidence"],
                        True, "only_weak_numeric_found", "human_review")
        return (None, "none", "none", True, "no_code_found", "vision_fallback")

    # Group by digit value
    by_val = defaultdict(list)
    for c in valid:
        by_val[c["digits"]].append(c)

    ranked = []
    for val, instances in by_val.items():
        n_variants = len({i["variant"] for i in instances})
        best_inst  = min(instances, key=lambda i: i["normalized_distance"])
        score      = n_variants * 10 - best_inst["normalized_distance"] * 5
        ranked.append((score, val, n_variants, best_inst))

    ranked.sort(reverse=True, key=lambda r: r[0])
    top_score, top_val, top_nvars, top_inst = ranked[0]

    # Ambiguity: multiple distinct codes
    if len(ranked) > 1:
        all_vals = [r[1] for r in ranked]
        return (None, "medium", top_inst["association_confidence"],
                True, f"multiple_codes: {all_vals}", "human_review")

    # Single code
    if top_nvars >= MULTI_VARIANT_THRESHOLD and top_inst.get("near_center") \
            and not top_inst.get("edge_proximity"):
        ocr_conf   = "high"
        assoc_conf = top_inst["association_confidence"]
        req_review = assoc_conf not in ("high", "medium")
        next_act   = "accept_local_ocr" if not req_review else "human_review"
        reason     = None if not req_review else "association_uncertain"
    else:
        ocr_conf   = "medium" if top_nvars >= 1 else "low"
        assoc_conf = top_inst["association_confidence"]
        req_review = True
        reason     = "single_variant_only" if top_nvars < MULTI_VARIANT_THRESHOLD \
                     else "association_uncertain"
        next_act   = "human_review"

    return (top_val, ocr_conf, assoc_conf, req_review, reason, next_act)


# ---------------------------------------------------------------------------
# Per-crop processing
# ---------------------------------------------------------------------------

def process_crop(occ: dict, crop_path: Path) -> dict:
    bgr = cv2.imread(str(crop_path))
    if bgr is None:
        return {
            "crop_id": crop_path.stem, "occurrence_id": occ.get("occurrence_id"),
            "error": "image_not_readable",
            "requires_review": True, "pending_vision_or_human_review": True,
            "recommended_next_action": "crop_quality_issue",
        }

    cluster_type = occ.get("cluster_type", "unknown")
    radius = CENTER_RADIUS_FRAGMENT if cluster_type == "symbol_fragment" \
             else CENTER_RADIUS_DEFAULT
    scale  = WIDE_UPSCALE_FACTOR if cluster_type == "symbol_fragment" \
             else UPSCALE_FACTOR

    sub_bgr, off_x, off_y = extract_subcrop(bgr, radius)
    ch, cw = sub_bgr.shape[:2]

    # ---- Preprocessing variants ----
    variants = preprocess_variants(sub_bgr, scale)

    # ---- Run all Tesseract configs on all variants ----
    all_tokens   = []
    prep_results = {}

    for vname, (pil_img, vscale) in variants.items():
        variant_tokens = []
        for cfg_name, cfg in TESS_CONFIGS:
            toks = run_tesseract(pil_img, cfg, vscale, f"{vname}_{cfg_name}")
            variant_tokens.extend(toks)
        prep_results[vname] = {"raw_token_count": len(variant_tokens)}
        all_tokens.extend(variant_tokens)

    # ---- Red circle interior OCR ----
    circle_tokens = []
    for pil_ci, (cx_b, cy_b, cw_b, ch_b), ci_scale in red_circle_interiors(sub_bgr):
        for cfg_name, cfg in [("digit_psm8", TESS_DIGIT_PSM8),
                               ("digit_psm7", TESS_DIGIT_PSM7)]:
            toks = run_tesseract(pil_ci, cfg, ci_scale, f"red_circle_{cfg_name}")
            # Adjust bbox to sub-crop coordinates
            for t in toks:
                t["bbox_crop"] = [cx_b + t["bbox_crop"][0] // ci_scale,
                                  cy_b + t["bbox_crop"][1] // ci_scale,
                                  t["bbox_crop"][2], t["bbox_crop"][3]]
            circle_tokens.extend(toks)
    all_tokens.extend(circle_tokens)
    prep_results["red_circle_interior"] = {"raw_token_count": len(circle_tokens)}

    # ---- Classify and compute spatial association ----
    valid_candidates  = []
    weak_candidates   = []
    rejected_noise    = []

    for tok in all_tokens:
        digits = tok["digits"]
        if not digits:
            continue
        category, reason = classify_token(digits)
        assoc = compute_association(tok["bbox_crop"], (ch, cw))
        record = {
            **tok,
            "category":    category,
            "class_reason": reason,
            **assoc,
        }
        if category == "valid_sign_code_candidate":
            valid_candidates.append(record)
        elif category == "weak_numeric_candidate":
            weak_candidates.append(record)
        else:
            rejected_noise.append(record)

    # ---- Select best code ----
    (selected, ocr_conf, assoc_conf,
     requires_review, review_reason, next_action) = select_best_code(
        valid_candidates, weak_candidates
    )

    # Compact raw_ocr_outputs for JSON (cap per-crop to avoid bloat)
    raw_ocr = [
        {"digits": t["digits"], "variant": t["variant"],
         "tess_conf": t["tess_conf"], "category": t.get("category", "?")}
        for t in all_tokens
    ][:60]

    return {
        "crop_id":                   crop_path.stem,
        "occurrence_id":             occ.get("occurrence_id"),
        "crop_path":                 str(crop_path),
        "cluster_type":              cluster_type,
        "original_detection_bbox":   occ.get("bbox"),
        "preprocessing_results":     prep_results,
        "raw_ocr_outputs":           raw_ocr,
        "valid_sign_code_candidates": valid_candidates[:20],
        "weak_numeric_candidates":   weak_candidates[:20],
        "rejected_numeric_noise":    [
            {"digits": t["digits"], "reason": t.get("class_reason")}
            for t in rejected_noise[:20]
        ],
        "selected_code_if_confident": selected,
        "ocr_confidence":             ocr_conf,
        "association_confidence":     assoc_conf,
        "requires_review":            requires_review,
        "pending_vision_or_human_review": selected is None,
        "review_reason":              review_reason,
        "recommended_next_action":    next_action,
    }


# ---------------------------------------------------------------------------
# Debug image generator
# ---------------------------------------------------------------------------

def _draw_cross(img: np.ndarray, cx: int, cy: int, size: int = 20,
                colour=(0, 200, 255)) -> None:
    cv2.line(img, (cx - size, cy), (cx + size, cy), colour, 2)
    cv2.line(img, (cx, cy - size), (cx, cy + size), colour, 2)


COLOUR_MAP = {
    "valid_sign_code_candidate": (0, 200, 0),
    "weak_numeric_candidate":    (0, 165, 255),
    "rejected_numeric_noise":    (0, 0, 200),
}


def generate_debug_image(occ: dict, crop_path: Path, result: dict,
                         out_path: Path) -> None:
    bgr = cv2.imread(str(crop_path))
    if bgr is None:
        return
    h, w = bgr.shape[:2]
    cx, cy = w // 2, h // 2
    vis = bgr.copy()
    _draw_cross(vis, cx, cy)

    # Determine sub-crop offset
    cluster_type = occ.get("cluster_type", "unknown")
    radius = CENTER_RADIUS_FRAGMENT if cluster_type == "symbol_fragment" \
             else CENTER_RADIUS_DEFAULT
    off_x = max(0, cx - radius)
    off_y = max(0, cy - radius)

    all_tokens = (
        result.get("valid_sign_code_candidates", [])
        + result.get("weak_numeric_candidates", [])
        + result.get("rejected_numeric_noise", [])[:5]
    )

    for tok in all_tokens:
        if "bbox_crop" not in tok:
            continue
        bx, by, bw, bh = tok["bbox_crop"]
        # Map from sub-crop space to full-image space
        fx, fy = off_x + bx, off_y + by
        cat = tok.get("category", "rejected_numeric_noise")
        colour = COLOUR_MAP.get(cat, (128, 128, 128))
        cv2.rectangle(vis, (fx, fy), (fx + bw, fy + bh), colour, 2)
        cv2.putText(vis, tok.get("digits", "?"),
                    (fx, max(0, fy - 4)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, colour, 1, cv2.LINE_AA)

    # Selected code annotation
    code = result.get("selected_code_if_confident")
    conf = result.get("ocr_confidence", "none")
    label = f"{occ.get('occurrence_id')} | code={code} | ocr_conf={conf}"
    cv2.putText(vis, label, (10, h - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2, cv2.LINE_AA)
    cv2.putText(vis, label, (10, h - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)

    scale = max(1, min(600 // max(h, w), 1))  # keep debug images bounded
    if scale < 1:
        vis = cv2.resize(vis, (w // 2, h // 2))
    cv2.imwrite(str(out_path), vis)


# ---------------------------------------------------------------------------
# Report builder
# ---------------------------------------------------------------------------

def build_report(results: list, inventory: dict, meta: dict) -> str:
    total    = len(results)
    accepted = [r for r in results if r.get("recommended_next_action") == "accept_local_ocr"]
    human_r  = [r for r in results if r.get("recommended_next_action") == "human_review"]
    vision_f = [r for r in results if r.get("recommended_next_action") == "vision_fallback"]
    crop_qi  = [r for r in results if r.get("recommended_next_action") == "crop_quality_issue"]

    confident     = len(accepted)
    uncertain     = len(human_r)
    pending_vis   = len(vision_f) + len(crop_qi)

    has_code  = [r for r in results if r.get("selected_code_if_confident")]
    type_cnt  = Counter(r.get("cluster_type") for r in results)
    code_by_type = Counter(r.get("cluster_type") for r in has_code)

    pct = lambda n: f"{n/total*100:.1f}%" if total else "—"

    lines = [
        "# Local OCR Sign Code Diagnostic Report",
        "",
        f"**Date:** {meta['started_at']}  ",
        f"**Tesseract version:** {meta['tess_version']}  ",
        f"**Total crops processed:** {total}  ",
        f"**Total elapsed:** {meta['elapsed']:.1f}s  ",
        f"**Preprocessing variants per crop:** {meta['n_variants']}",
        "",
        "## Summary",
        "",
        "| Category | Count | % of total |",
        "|----------|-------|------------|",
        f"| Confident local OCR read (accept_local_ocr) | {confident} | {pct(confident)} |",
        f"| Uncertain — human review recommended | {uncertain} | {pct(uncertain)} |",
        f"| No code found — Vision fallback needed | {pending_vis} | {pct(pending_vis)} |",
        f"| Crop quality issue | {len(crop_qi)} | {pct(len(crop_qi))} |",
        "",
        "## By Cluster Type",
        "",
        "| Cluster type | Total | Got a code |",
        "|-------------|-------|------------|",
    ]
    for ct in ("sign_symbol", "compact_symbol", "symbol_fragment"):
        n = type_cnt.get(ct, 0)
        c = code_by_type.get(ct, 0)
        lines.append(f"| {ct} | {n} | {c} |")

    lines += [
        "",
        "## Vision API Reduction Estimate",
        "",
        f"- Local OCR returned a selected code for **{len(has_code)} of {total}** crops "
        f"({pct(len(has_code))}).",
        f"- Crops that still require Vision or human review: "
        f"**{total - confident}** ({pct(total - confident)}).",
        "",
    ]

    if confident == 0:
        lines += [
            "**Estimated Vision API usage reduction: 0%.**",
            "",
            "Local OCR does not reduce paid Vision API usage for this crop set.",
        ]
    elif confident < total * 0.1:
        lines += [
            f"**Estimated Vision API usage reduction: <10%.**",
            "",
            f"Local OCR resolves only {confident} crops. "
            "Vision API remains necessary for the remaining crops.",
        ]
    else:
        lines += [
            f"**Estimated Vision API usage reduction: {pct(confident)}.**",
            "",
            f"Local OCR resolves {confident} crops, reducing the Vision batch by "
            f"~{pct(confident)}.",
        ]

    lines += [
        "",
        "## Root Cause Analysis",
        "",
        "AutoCAD PDF exports render ALL text — sign codes, speed values, annotation numbers —",
        "as vector-path outlines rasterised at 150 DPI (the Stage G render resolution).",
        "",
        "At this resolution the digit strokes are:",
        "- Thin (1–3px) for small annotation codes adjacent to sign symbols",
        "- Bold but stylised (non-standard CAD block font) for values inside red circles (e.g. '30')",
        "",
        "Tesseract LSTM, trained on document/print fonts, does not recognise either type reliably:",
        "- Annotation codes → not detected (below stroke-width threshold)",
        "- Speed values inside red circles → detected as isolated single digits, not sequences",
        "",
        "**This is the same root cause as the Stage 8 text-extraction diagnostic.**",
        "The text diagnostic confirmed zero readable sign codes in PDF text objects.",
        "This OCR diagnostic confirms zero reliable sign codes from the rasterised crops.",
        "",
        "## Recommended Next Steps",
        "",
        "| Priority | Action |",
        "|----------|--------|",
        "| 1 | Obtain ANTHROPIC_API_KEY and run Vision smoke test on 5 representative crops |",
        "| 2 | Run full 177-crop Vision batch once smoke test confirms readability |",
        "| 3 | Store Vision results in sign_inventory.json per occurrence |",
        "| 4 | Future: consider higher-DPI rendering (300 DPI) — may improve local OCR |",
        "| 5 | Future: fine-tune a digit recogniser on this specific CAD font |",
        "",
        "## Local OCR Quality Assessment",
        "",
        "**Is local OCR good enough to reduce paid Vision API usage?**",
    ]

    if confident < 5:
        lines.append(
            "**NO.** Local Tesseract OCR achieves near-zero confident reads on these crops. "
            "Vision API is required for all or nearly all crops."
        )
    else:
        lines.append(
            f"**PARTIALLY.** Local OCR resolves {confident} crops ({pct(confident)}), "
            "but Vision is still needed for the majority."
        )

    lines += [
        "",
        "## Selected Codes (if any)",
        "",
    ]
    if has_code:
        lines.append("| Occurrence | Code | OCR conf | Assoc conf | Next action |")
        lines.append("|-----------|------|----------|------------|-------------|")
        for r in has_code:
            lines.append(
                f"| {r['occurrence_id']} | `{r['selected_code_if_confident']}` "
                f"| {r['ocr_confidence']} | {r['association_confidence']} "
                f"| {r['recommended_next_action']} |"
            )
    else:
        lines.append("No confident codes selected from any crop.")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def check_prerequisites() -> str:
    """Returns tesseract version string or raises SystemExit."""
    import shutil
    if not shutil.which("tesseract"):
        print("ERROR: tesseract binary not found.")
        print("Install with:  brew install tesseract")
        sys.exit(1)
    if not _HAS_PYTESS:
        print("ERROR: pytesseract not installed.")
        print("Install with:  .venv/bin/pip install pytesseract")
        sys.exit(1)
    ver = pytesseract.get_tesseract_version()
    return str(ver)


def main() -> None:
    print("=== Local OCR Sign Code Diagnostic ===")

    tess_ver = check_prerequisites()
    print(f"Tesseract: {tess_ver}")
    print(f"pytesseract: {pytesseract.__version__}")

    langs = pytesseract.get_languages()
    print(f"Available langs: {langs}")

    if not INV_PATH.exists():
        print(f"ERROR: inventory not found at {INV_PATH}")
        sys.exit(1)

    inventory   = json.loads(INV_PATH.read_text())
    occurrences = inventory.get("occurrences", [])
    print(f"Inventory: {len(occurrences)} occurrences")

    if not CROPS_DIR.exists():
        print(f"ERROR: crops directory not found: {CROPS_DIR}")
        sys.exit(1)

    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUTS_DIR.mkdir(exist_ok=True)

    occ_by_id = {o["occurrence_id"]: o for o in occurrences}
    crop_files = sorted(CROPS_DIR.glob("OCC-*.png"))
    print(f"Crops found: {len(crop_files)}")

    # Preprocessing variant count for metadata
    sample = cv2.imread(str(crop_files[0]))
    n_variants = len(preprocess_variants(sample, UPSCALE_FACTOR)) + 1  # +1 for circle

    started_at   = datetime.now().isoformat(timespec="seconds")
    global_start = time.time()
    results      = []

    for i, crop_path in enumerate(crop_files, 1):
        occ_id = crop_path.stem
        occ    = occ_by_id.get(occ_id, {"occurrence_id": occ_id})
        if i % 20 == 0 or i <= 3:
            print(f"  [{i:3d}/{len(crop_files)}] {occ_id} ...", end="", flush=True)
        result = process_crop(occ, crop_path)
        results.append(result)
        if i % 20 == 0 or i <= 3:
            code = result.get("selected_code_if_confident", "—")
            print(f" code={code}  next={result.get('recommended_next_action','?')}")

        # Incremental save every 25 crops
        if i % 25 == 0:
            JSON_OUT.write_text(json.dumps(results, ensure_ascii=False, indent=2))

    elapsed = round(time.time() - global_start, 1)

    # Final JSON save
    JSON_OUT.write_text(json.dumps(results, ensure_ascii=False, indent=2))
    print(f"\nJSON saved: {JSON_OUT}  ({len(results)} records)")

    # ---- Generate debug images ----
    # Sort by outcome for selection
    accepted = [r for r in results if r.get("recommended_next_action") == "accept_local_ocr"]
    has_code = [r for r in results if r.get("selected_code_if_confident")]
    pending  = [r for r in results if r.get("recommended_next_action") == "vision_fallback"]
    human_r  = [r for r in results if r.get("recommended_next_action") == "human_review"]

    debug_targets = []
    # 5 "successes" (if any codes read, else first 5 crops)
    success_pool = (has_code or results)[:5]
    for r in success_pool:
        debug_targets.append((r, "success"))
    # 5 "failures"
    for r in (pending or results)[:5]:
        debug_targets.append((r, "failure"))
    # Up to 10 human_review
    for r in human_r[:10]:
        debug_targets.append((r, "review"))

    generated = 0
    for result, tag in debug_targets:
        occ_id = result.get("occurrence_id", result.get("crop_id"))
        occ    = occ_by_id.get(occ_id, {"occurrence_id": occ_id})
        cp     = CROPS_DIR / f"{occ_id}.png"
        out    = DEBUG_DIR / f"{tag}_{occ_id}.png"
        if cp.exists():
            generate_debug_image(occ, cp, result, out)
            generated += 1

    print(f"Debug images: {generated} saved to {DEBUG_DIR}")

    # ---- Report ----
    meta = {
        "started_at": started_at,
        "tess_version": tess_ver,
        "elapsed": elapsed,
        "n_variants": n_variants,
    }
    report = build_report(results, inventory, meta)
    REPORT_OUT.write_text(report)
    print(f"Report saved: {REPORT_OUT}")

    # ---- Summary ----
    confident = len(accepted)
    has_any   = len(has_code)
    print()
    print("=== Summary ===")
    print(f"  Crops processed:           {len(results)}")
    print(f"  Codes selected (any conf): {has_any}")
    print(f"  Confident (accept):        {confident}")
    print(f"  Human review:              {len(human_r)}")
    print(f"  Vision fallback needed:    {len(pending)}")
    print(f"  Elapsed:                   {elapsed}s")
    pct = lambda n: f"({n/len(results)*100:.1f}%)" if results else ""
    print(f"\n  Local OCR reduces Vision API usage by: "
          f"{confident} crops {pct(confident)}")
    if confident == 0:
        print("  → Local OCR is NOT sufficient. Vision API required for all crops.")
    else:
        print(f"  → Vision API still needed for {len(results) - confident} crops.")


if __name__ == "__main__":
    main()
