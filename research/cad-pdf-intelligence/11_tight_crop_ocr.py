#!/usr/bin/env python3
"""
POC 1 — Tight Numeric Region Crop Extraction
(11_tight_crop_ocr.py)

Goal: NOT to repeat the Stage 10 approach of running Tesseract on the full
      667×668px context crops. That confirmed 0% confident reads because the
      crops are too broad and the digit strokes are too small/noisy for LSTM.

      This script isolates candidate numeric-code regions within each Stage G
      crop using connected-component (CC) analysis, extracts tight sub-images
      around each candidate, upscales 3×, and only then attempts a lightweight
      OCR sanity check.

Primary output: tight_numeric_crops/ — clean small number crops for POC 2
                (digit-template recognition) and POC 3 (vector glyph).

OCR here is a secondary sanity check only, not a code-acceptance mechanism.

Usage:
    .venv/bin/python3 11_tight_crop_ocr.py

Inputs:
    outputs/stage_g_code_crops/     177 × ~667px PNG crops from Stage G
    outputs/sign_inventory.json     occurrence metadata (cluster_type, bbox, etc.)

Outputs:
    outputs/tight_numeric_crops/            tight sub-images, 3× upscaled
    outputs/tight_numeric_debug/            debug overlays
    outputs/tight_numeric_crop_results.json one record per occurrence
    outputs/tight_numeric_crop_report.md    summary report
"""

import cv2
import json
import math
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np

try:
    import pytesseract
    from PIL import Image as PILImage
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR   = Path(__file__).parent
OUTPUTS_DIR  = SCRIPT_DIR / "outputs"
CROPS_DIR    = OUTPUTS_DIR / "stage_g_code_crops"
INV_PATH     = OUTPUTS_DIR / "sign_inventory.json"
OUT_CROPS    = OUTPUTS_DIR / "tight_numeric_crops"
OUT_DEBUG    = OUTPUTS_DIR / "tight_numeric_debug"
RESULTS_JSON = OUTPUTS_DIR / "tight_numeric_crop_results.json"
REPORT_MD    = OUTPUTS_DIR / "tight_numeric_crop_report.md"

# ---------------------------------------------------------------------------
# Algorithm parameters (validated against live OCC-0031 CC data)
# ---------------------------------------------------------------------------
CC_HEIGHT_MIN   = 6       # px — minimum digit stroke height
CC_HEIGHT_MAX   = 60      # px — maximum (excludes large sign bodies)
CC_WIDTH_MIN    = 4       # px
CC_WIDTH_MAX    = 55      # px
CC_AREA_MIN     = 25      # px² — excludes single-pixel noise
CC_AREA_MAX     = 2400    # px² — excludes large filled sign bodies
CC_AR_MIN       = 0.12    # width/height — very narrow tall strokes
CC_AR_MAX       = 4.0     # width/height — very wide thin strokes
CC_FILL_MIN     = 0.12    # area/(w*h) — not just a 1-pixel outline
EDGE_MARGIN     = 15      # px — reject CCs this close to crop border
PROXIMITY_CAP   = 0.65    # normalized distance — hard filter (65% of half-diagonal)
LINE_Y_TOL_FAC  = 0.60    # fraction of max(h1,h2) for same-line grouping
WORD_X_GAP_FAC  = 2.5     # max horizontal gap as multiple of max(w1,w2)
GROUP_MIN_CCS   = 2       # minimum CCs in a candidate group
GROUP_MAX_CCS   = 5       # maximum CCs in a candidate group
TOP_N_GROUPS    = 3       # save at most N tight crops per occurrence
TIGHT_MARGIN    = 5       # px margin around group bbox
TIGHT_MIN_W     = 8       # px — skip crops smaller than this (too small to OCR)
TIGHT_MIN_H     = 6       # px
UPSCALE         = 3       # 3× upscale before OCR
DEBUG_EVERY     = 10      # save debug overlay every Nth crop (plus good/medium)

# Quality tier thresholds
QUALITY_GOOD    = 0.62
QUALITY_MEDIUM  = 0.35

TESSERACT_CONFIG = "--psm 7 --oem 3 -c tessedit_char_whitelist=0123456789"


# ---------------------------------------------------------------------------
# Connected-component analysis
# ---------------------------------------------------------------------------

def _digit_like_ccs(gray: np.ndarray) -> list[dict]:
    """
    Threshold the grayscale crop and return all CCs matching digit geometry.
    Returns list of dicts with x, y, w, h, area, cx, cy.
    """
    h_img, w_img = gray.shape

    results = []
    # Run on Otsu and (if few CCs) adaptive threshold; take union
    for method in ("otsu", "adaptive"):
        if method == "otsu":
            _, binary = cv2.threshold(gray, 0, 255,
                                      cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        else:
            binary = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY_INV, 11, 2
            )

        n, _lbl, stats, centroids = cv2.connectedComponentsWithStats(
            binary, connectivity=8
        )

        for i in range(1, n):
            x, y, w, h, area = int(stats[i, cv2.CC_STAT_LEFT]), \
                                int(stats[i, cv2.CC_STAT_TOP]),  \
                                int(stats[i, cv2.CC_STAT_WIDTH]),\
                                int(stats[i, cv2.CC_STAT_HEIGHT]),\
                                int(stats[i, cv2.CC_STAT_AREA])
            ccx, ccy = float(centroids[i][0]), float(centroids[i][1])

            if not (CC_HEIGHT_MIN <= h <= CC_HEIGHT_MAX):
                continue
            if not (CC_WIDTH_MIN <= w <= CC_WIDTH_MAX):
                continue
            if not (CC_AREA_MIN <= area <= CC_AREA_MAX):
                continue

            ar = w / max(h, 1)
            if not (CC_AR_MIN <= ar <= CC_AR_MAX):
                continue

            fill = area / max(w * h, 1)
            if fill < CC_FILL_MIN:
                continue

            # Edge proximity filter
            if (ccx < EDGE_MARGIN or ccx > w_img - EDGE_MARGIN or
                    ccy < EDGE_MARGIN or ccy > h_img - EDGE_MARGIN):
                continue

            results.append({
                "method": method,
                "x": x, "y": y, "w": w, "h": h,
                "area": area, "ar": round(ar, 3), "fill": round(fill, 3),
                "cx": round(ccx, 1), "cy": round(ccy, 1),
            })

        if method == "otsu" and len(results) >= 5:
            break  # Otsu was good enough; skip adaptive

    # Deduplicate by centroid proximity (merge Otsu and adaptive duplicates)
    deduped = []
    for cc in results:
        duplicate = False
        for d in deduped:
            if abs(cc["cx"] - d["cx"]) < 4 and abs(cc["cy"] - d["cy"]) < 4:
                duplicate = True
                break
        if not duplicate:
            deduped.append(cc)

    return deduped


def _add_proximity(ccs: list[dict], w_img: int, h_img: int) -> list[dict]:
    """Add normalized distance from crop center to each CC."""
    cx, cy = w_img / 2, h_img / 2
    half_diag = math.sqrt(cx ** 2 + cy ** 2)
    for cc in ccs:
        dist = math.sqrt((cc["cx"] - cx) ** 2 + (cc["cy"] - cy) ** 2)
        cc["ndist"] = round(dist / half_diag, 4)
    return ccs


def _filter_by_proximity(ccs: list[dict]) -> tuple[list[dict], list[dict]]:
    """Split CCs into near-center (pass) and far (reject)."""
    near, far = [], []
    for cc in ccs:
        (near if cc["ndist"] <= PROXIMITY_CAP else far).append(cc)
    return near, far


# ---------------------------------------------------------------------------
# Text-line grouping
# ---------------------------------------------------------------------------

def _group_into_lines(ccs: list[dict]) -> list[list[dict]]:
    """
    Group CCs into horizontal text lines by y-centroid proximity.
    Returns list of lines, each line a list of CCs sorted by x.
    """
    if not ccs:
        return []

    sorted_by_y = sorted(ccs, key=lambda c: c["cy"])
    lines: list[list[dict]] = []
    current_line: list[dict] = [sorted_by_y[0]]

    for cc in sorted_by_y[1:]:
        # Tolerance: fraction of the taller of the two CCs
        tol = LINE_Y_TOL_FAC * max(current_line[-1]["h"], cc["h"])
        if abs(cc["cy"] - current_line[-1]["cy"]) <= tol:
            current_line.append(cc)
        else:
            lines.append(current_line)
            current_line = [cc]
    lines.append(current_line)

    # Sort each line by x
    return [sorted(line, key=lambda c: c["cx"]) for line in lines]


def _split_line_into_words(line: list[dict]) -> list[list[dict]]:
    """
    Split a text line into separate word groups if a large horizontal gap exists.
    """
    if len(line) <= 1:
        return [line]

    words: list[list[dict]] = []
    current_word: list[dict] = [line[0]]

    for cc in line[1:]:
        prev = current_word[-1]
        prev_right = prev["x"] + prev["w"]
        gap = cc["x"] - prev_right
        max_w = max(prev["w"], cc["w"])
        if gap > WORD_X_GAP_FAC * max_w:
            words.append(current_word)
            current_word = [cc]
        else:
            current_word.append(cc)
    words.append(current_word)
    return words


# ---------------------------------------------------------------------------
# Candidate scoring
# ---------------------------------------------------------------------------

def _group_bbox(group: list[dict], w_img: int, h_img: int, margin: int = TIGHT_MARGIN
                ) -> tuple[int, int, int, int]:
    """Bounding box of all CCs in group, expanded by margin, clipped to image."""
    x1 = max(0, min(cc["x"] for cc in group) - margin)
    y1 = max(0, min(cc["y"] for cc in group) - margin)
    x2 = min(w_img, max(cc["x"] + cc["w"] for cc in group) + margin)
    y2 = min(h_img, max(cc["y"] + cc["h"] for cc in group) + margin)
    return x1, y1, x2, y2


def _score_group(group: list[dict], w_img: int, h_img: int) -> dict:
    """Compute quality score and component scores for a candidate CC group."""
    n = len(group)

    # Proximity of group centroid to crop center
    gcx = sum(cc["cx"] for cc in group) / n
    gcy = sum(cc["cy"] for cc in group) / n
    half_diag = math.sqrt((w_img / 2) ** 2 + (h_img / 2) ** 2)
    dist = math.sqrt((gcx - w_img / 2) ** 2 + (gcy - h_img / 2) ** 2)
    ndist = dist / half_diag
    proximity_score = 1.0 - ndist

    # Length preference (3-char codes = best)
    length_score = {1: 0.45, 2: 0.75, 3: 1.0, 4: 0.85, 5: 0.55}.get(n, 0.40)

    # Height consistency within group
    heights = [cc["h"] for cc in group]
    mean_h = sum(heights) / len(heights)
    std_h = math.sqrt(sum((h - mean_h) ** 2 for h in heights) / len(heights))
    height_consistency = 1.0 - min(std_h / max(mean_h, 1), 1.0)

    quality = (0.50 * proximity_score +
               0.30 * length_score +
               0.20 * height_consistency)

    return {
        "quality": round(quality, 4),
        "proximity_score": round(proximity_score, 4),
        "length_score": round(length_score, 4),
        "height_consistency": round(height_consistency, 4),
        "ndist": round(ndist, 4),
        "cc_count": n,
        "group_cx": round(gcx, 1),
        "group_cy": round(gcy, 1),
    }


# ---------------------------------------------------------------------------
# Tight crop extraction
# ---------------------------------------------------------------------------

def _extract_tight_crop(gray: np.ndarray, x1: int, y1: int, x2: int, y2: int
                         ) -> Optional[np.ndarray]:
    """Extract sub-image, check minimum size, upscale, sharpen."""
    crop = gray[y1:y2, x1:x2]
    if crop.shape[1] < TIGHT_MIN_W or crop.shape[0] < TIGHT_MIN_H:
        return None

    # 3× upscale
    h_up = crop.shape[0] * UPSCALE
    w_up = crop.shape[1] * UPSCALE
    up = cv2.resize(crop, (w_up, h_up), interpolation=cv2.INTER_LANCZOS4)

    # Unsharp mask — enhances stroke edges
    blurred = cv2.GaussianBlur(up, (0, 0), 1.2)
    sharp = cv2.addWeighted(up, 1.6, blurred, -0.6, 0)
    sharp = np.clip(sharp, 0, 255).astype(np.uint8)
    return sharp


# ---------------------------------------------------------------------------
# OCR sanity check (secondary — non-authoritative)
# ---------------------------------------------------------------------------

def _ocr_sanity_check(tight_up: np.ndarray) -> dict:
    """Run Tesseract on a tight upscaled crop. Returns raw text and candidates."""
    if not TESSERACT_AVAILABLE:
        return {"raw": None, "codes": [], "error": "pytesseract not available"}
    try:
        pil_img = PILImage.fromarray(tight_up)
        raw = pytesseract.image_to_string(pil_img, config=TESSERACT_CONFIG).strip()
        # Extract 2-4 digit sequences
        codes = []
        clean = "".join(c for c in raw if c.isdigit())
        if 2 <= len(clean) <= 4:
            codes.append(clean)
        return {"raw": raw, "codes": codes, "error": None}
    except Exception as exc:
        return {"raw": None, "codes": [], "error": str(exc)}


# ---------------------------------------------------------------------------
# Debug overlay
# ---------------------------------------------------------------------------

def _make_debug_overlay(
    gray: np.ndarray,
    all_digit_ccs: list[dict],
    far_ccs: list[dict],
    candidates: list[dict],     # scored groups with bbox info
    best_idx: int,
) -> np.ndarray:
    """Draw debug overlay on a colour copy of the grayscale crop."""
    overlay = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    h_img, w_img = gray.shape

    # Crop center crosshair (yellow)
    cx, cy = w_img // 2, h_img // 2
    cv2.drawMarker(overlay, (cx, cy), (0, 255, 255), cv2.MARKER_CROSS, 40, 2)

    # Far/rejected CCs (dark gray — small dots to not clutter)
    for cc in far_ccs[:80]:  # cap to avoid excessive drawing
        cv2.rectangle(overlay,
                      (cc["x"], cc["y"]),
                      (cc["x"] + cc["w"], cc["y"] + cc["h"]),
                      (80, 80, 80), 1)

    # All digit-like CCs within proximity (green)
    for cc in all_digit_ccs:
        cv2.rectangle(overlay,
                      (cc["x"], cc["y"]),
                      (cc["x"] + cc["w"], cc["y"] + cc["h"]),
                      (0, 210, 0), 1)

    # Candidate groups (blue bboxes + score label)
    for k, cand in enumerate(candidates):
        x1, y1, x2, y2 = cand["x1"], cand["y1"], cand["x2"], cand["y2"]
        color = (255, 80, 0) if k != best_idx else (0, 0, 255)
        thick = 3 if k == best_idx else 2
        cv2.rectangle(overlay, (x1, y1), (x2, y2), color, thick)
        label = f"Q={cand['score']['quality']:.2f} n={cand['score']['cc_count']}"
        label_y = max(y1 - 4, 12)
        cv2.putText(overlay, label, (x1, label_y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.38, color, 1, cv2.LINE_AA)

    return overlay


# ---------------------------------------------------------------------------
# Main per-crop processing
# ---------------------------------------------------------------------------

def _quality_tier(best_quality: float, best_n: int) -> str:
    if best_n == 0:
        return "no_candidate"
    if best_quality >= QUALITY_GOOD and best_n >= 2:
        return "good"
    if best_quality >= QUALITY_MEDIUM:
        return "medium"
    return "poor"


def _recommended_action(tier: str, best_n: int, ocr_codes: list) -> str:
    if tier == "good" and best_n >= 3:
        return "use_for_digit_template_poc"
    if tier in ("good", "medium") and best_n >= 2:
        # Also useful for vector glyph
        return "use_for_digit_template_poc"
    if tier == "medium" and best_n == 1:
        return "use_for_vector_glyph_poc"
    if tier == "poor":
        return "human_review"
    return "crop_quality_issue"


def process_crop(
    occ: dict,
    crop_path: Path,
    out_crops: Path,
    out_debug: Path,
    crop_index: int,
) -> dict:
    """Full POC 1 pipeline for one crop. Returns result record."""
    occ_id = occ["occurrence_id"]

    # --- Load ---
    img_bgr = cv2.imread(str(crop_path))
    if img_bgr is None:
        return {
            "crop_id": occ_id,
            "occurrence_id": occ_id,
            "original_crop_path": str(crop_path),
            "error": "Could not load image",
            "quality_tier": "crop_quality_issue",
            "recommended_next_action": "crop_quality_issue",
        }

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    h_img, w_img = gray.shape

    # --- CC analysis ---
    all_ccs = _digit_like_ccs(gray)
    all_ccs = _add_proximity(all_ccs, w_img, h_img)

    near_ccs, far_ccs = _filter_by_proximity(all_ccs)

    # Rejection summary
    total_cc_count = len(all_ccs)
    rejected_summary = {
        "total_digit_like": total_cc_count,
        "after_proximity_filter": len(near_ccs),
        "rejected_far": len(far_ccs),
    }

    # --- Line → word grouping ---
    lines = _group_into_lines(near_ccs)
    word_groups: list[list[dict]] = []
    for line in lines:
        words = _split_line_into_words(line)
        for word in words:
            if GROUP_MIN_CCS <= len(word) <= GROUP_MAX_CCS:
                word_groups.append(word)

    # --- Score groups ---
    scored: list[dict] = []
    for group in word_groups:
        score = _score_group(group, w_img, h_img)
        x1, y1, x2, y2 = _group_bbox(group, w_img, h_img)
        scored.append({
            "group": group,
            "score": score,
            "x1": x1, "y1": y1, "x2": x2, "y2": y2,
        })

    scored.sort(key=lambda g: g["score"]["quality"], reverse=True)
    top_candidates = scored[:TOP_N_GROUPS]

    # --- Extract tight crops ---
    tight_crop_paths = []
    candidate_bboxes = []
    all_ocr = []
    all_codes = []

    for k, cand in enumerate(top_candidates):
        x1, y1, x2, y2 = cand["x1"], cand["y1"], cand["x2"], cand["y2"]
        tight = _extract_tight_crop(gray, x1, y1, x2, y2)
        if tight is None:
            continue

        # Save tight crop
        fname = out_crops / f"{occ_id}_cand_{k}.png"
        cv2.imwrite(str(fname), tight)
        tight_crop_paths.append(str(fname))

        candidate_bboxes.append({
            "bbox": [x1, y1, x2 - x1, y2 - y1],
            "quality_score": cand["score"]["quality"],
            "ndist": cand["score"]["ndist"],
            "cc_count": cand["score"]["cc_count"],
        })

        # OCR sanity check on tight crop
        ocr = _ocr_sanity_check(tight)
        all_ocr.append(ocr["raw"])
        all_codes.extend(ocr["codes"])

    # --- Best candidate stats ---
    best_quality = top_candidates[0]["score"]["quality"] if top_candidates else 0.0
    best_n       = top_candidates[0]["score"]["cc_count"] if top_candidates else 0
    best_ndist   = top_candidates[0]["score"]["ndist"] if top_candidates else 1.0
    tier         = _quality_tier(best_quality, best_n)
    action       = _recommended_action(tier, best_n, all_codes)

    # --- Debug overlay ---
    save_debug = (crop_index % DEBUG_EVERY == 0) or tier in ("good", "medium")
    if save_debug:
        best_idx = 0
        overlay = _make_debug_overlay(gray, near_ccs, far_ccs, top_candidates, best_idx)
        dbg_path = out_debug / f"{occ_id}_debug.png"
        cv2.imwrite(str(dbg_path), overlay)

    # --- Build result record ---
    return {
        "crop_id": occ_id,
        "occurrence_id": occ_id,
        "cluster_type": occ.get("cluster_type", "?"),
        "original_crop_path": str(crop_path),
        "tight_numeric_crop_paths": tight_crop_paths,
        "candidate_bboxes": candidate_bboxes,
        "candidate_quality_score": [c["score"]["quality"] for c in top_candidates[:len(tight_crop_paths)]],
        "distance_from_center": [c["score"]["ndist"] for c in top_candidates[:len(tight_crop_paths)]],
        "edge_proximity_flag": any(
            cc["ndist"] < 0.05 for cc in near_ccs
        ),
        "rejected_regions_summary": rejected_summary,
        "optional_ocr_raw_output": all_ocr,
        "optional_ocr_candidate_codes": list(set(c for c in all_codes if c)),
        "total_digit_like_ccs": total_cc_count,
        "near_center_ccs": len(near_ccs),
        "candidate_groups_found": len(word_groups),
        "tight_crops_saved": len(tight_crop_paths),
        "best_quality_score": round(best_quality, 4),
        "best_group_cc_count": best_n,
        "best_ndist": round(best_ndist, 4),
        "quality_tier": tier,
        "requires_review": tier in ("poor", "no_candidate"),
        "recommended_next_action": action,
    }


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def build_report(results: list[dict], elapsed: float, started_at: str) -> str:
    tiers = {"good": 0, "medium": 0, "poor": 0, "no_candidate": 0}
    for r in results:
        tiers[r.get("quality_tier", "no_candidate")] += 1

    total = len(results)
    with_candidate = total - tiers["no_candidate"]
    ocr_hits = sum(1 for r in results if r.get("optional_ocr_candidate_codes"))

    # Tight crop success rate
    good_pct   = 100 * tiers["good"] / max(total, 1)
    medium_pct = 100 * tiers["medium"] / max(total, 1)
    poor_pct   = 100 * tiers["poor"] / max(total, 1)
    none_pct   = 100 * tiers["no_candidate"] / max(total, 1)

    # Action breakdown
    action_counts: dict[str, int] = {}
    for r in results:
        a = r.get("recommended_next_action", "?")
        action_counts[a] = action_counts.get(a, 0) + 1

    # Best cases (sort by quality)
    valid = [r for r in results if r.get("quality_tier") != "no_candidate"]
    valid.sort(key=lambda r: r.get("best_quality_score", 0), reverse=True)
    best_5 = valid[:5]
    worst_5 = valid[-5:] if len(valid) >= 5 else valid

    lines = [
        "# POC 1 — Tight Numeric Crop Report",
        "",
        f"**Date:** {started_at}  ",
        f"**Total crops processed:** {total}  ",
        f"**Elapsed:** {elapsed:.1f}s  ",
        f"**Upscale factor:** {UPSCALE}×  ",
        f"**OCR sanity check:** {'Tesseract (non-authoritative)' if TESSERACT_AVAILABLE else 'Unavailable'}  ",
        "",
        "## Summary",
        "",
        "| Tier | Count | % |",
        "|------|-------|---|",
        f"| Good (quality ≥ {QUALITY_GOOD}, ≥ 2 CCs) | {tiers['good']} | {good_pct:.1f}% |",
        f"| Medium (quality {QUALITY_MEDIUM}–{QUALITY_GOOD}) | {tiers['medium']} | {medium_pct:.1f}% |",
        f"| Poor (quality < {QUALITY_MEDIUM}) | {tiers['poor']} | {poor_pct:.1f}% |",
        f"| No candidate found | {tiers['no_candidate']} | {none_pct:.1f}% |",
        f"| **Crops with ≥ 1 candidate** | **{with_candidate}** | **{100*with_candidate/max(total,1):.1f}%** |",
        "",
        "## OCR Sanity Check (Secondary — Non-Authoritative)",
        "",
        f"- Crops where tight-crop OCR returned a 2–4 digit result: **{ocr_hits}** of {total}",
        f"- Note: these are candidate reads from tight crops only.",
        "  A result here does NOT mean the code has been confirmed.",
        "  These are inputs for cross-check in POC 2 (digit templates), not accepted codes.",
        "",
        "## Recommended Next Action Breakdown",
        "",
        "| Action | Count |",
        "|--------|-------|",
    ]
    for action, count in sorted(action_counts.items(), key=lambda x: -x[1]):
        lines.append(f"| {action} | {count} |")

    lines += [
        "",
        "## Best 5 Tight Crops (by quality score)",
        "",
        "| OCC | Tier | Quality | CC count | ndist | OCR codes |",
        "|-----|------|---------|---------|-------|-----------|",
    ]
    for r in best_5:
        codes = ", ".join(r.get("optional_ocr_candidate_codes", []) or []) or "—"
        lines.append(
            f"| {r['occurrence_id']} | {r['quality_tier']} | "
            f"{r.get('best_quality_score', 0):.3f} | {r.get('best_group_cc_count', 0)} | "
            f"{r.get('best_ndist', 0):.3f} | `{codes}` |"
        )

    lines += [
        "",
        "## Worst 5 Tight Crops (lowest quality, has a candidate)",
        "",
        "| OCC | Tier | Quality | CC count | ndist | Action |",
        "|-----|------|---------|---------|-------|--------|",
    ]
    for r in worst_5:
        lines.append(
            f"| {r['occurrence_id']} | {r['quality_tier']} | "
            f"{r.get('best_quality_score', 0):.3f} | {r.get('best_group_cc_count', 0)} | "
            f"{r.get('best_ndist', 0):.3f} | {r.get('recommended_next_action', '?')} |"
        )

    lines += [
        "",
        "## Assessment: Does Tight Cropping Improve Readability?",
        "",
    ]

    # Infer from data
    if tiers["good"] + tiers["medium"] >= total * 0.40:
        assessment = (
            f"**YES — tight cropping shows clear improvement.** "
            f"{tiers['good']+tiers['medium']} of {total} crops ({(tiers['good']+tiers['medium'])*100//total}%) "
            f"have at least a medium-quality numeric region candidate. "
            f"These tight crops are significantly smaller and cleaner than the original 667×668px context crops."
        )
    elif tiers["good"] + tiers["medium"] >= total * 0.20:
        assessment = (
            f"**PARTIAL — tight cropping helped for a subset.** "
            f"{tiers['good']+tiers['medium']} of {total} crops ({(tiers['good']+tiers['medium'])*100//total}%) "
            f"have at least a medium-quality candidate. Remaining crops may benefit from POC 3 (vector glyph)."
        )
    else:
        assessment = (
            f"**LIMITED — most crops still have no good candidate.** "
            f"Only {tiers['good']+tiers['medium']} of {total} crops produced medium/good candidates. "
            f"Root cause likely the same vector-path CAD font. "
            f"Proceed to POC 3 (vector glyph) as the next priority."
        )

    lines += [
        assessment,
        "",
        "## Assessment: Are Tight Crops Suitable for POC 2 (Digit Templates)?",
        "",
    ]

    digit_template_count = action_counts.get("use_for_digit_template_poc", 0)
    if digit_template_count >= 20:
        poc2_ready = (
            f"**YES — POC 2 is justified.** {digit_template_count} crops are flagged "
            f"`use_for_digit_template_poc`. This is a sufficient sample set for extracting "
            f"individual digit templates from speed-limit circle crops."
        )
    elif digit_template_count >= 5:
        poc2_ready = (
            f"**MARGINAL — POC 2 may still be worthwhile.** {digit_template_count} good-quality "
            f"tight crops are available. Extract digit templates from these, test against POC 1 "
            f"output, then decide whether to run the full batch."
        )
    else:
        poc2_ready = (
            f"**UNCERTAIN — only {digit_template_count} crops suitable for digit templates.** "
            f"Prioritise POC 3 (vector glyph) which does not depend on OCR-quality tight crops."
        )

    lines += [
        poc2_ready,
        "",
        "## Known Failure Modes Observed",
        "",
        "| Failure mode | Description |",
        "|-------------|-------------|",
        "| CAD vector-path font | Digit strokes are Bezier paths rasterised at 150 DPI — thin strokes break into fragments |",
        "| Sign symbol at center | Large sign symbol body CCs may dominate the center region |",
        "| Sparse near-center CCs | Some crops have very few digit-like CCs near center (code may be far from centroid) |",
        "| Multi-code ambiguity | Multiple candidate groups in one crop — all saved; ranked by proximity |",
        "",
        "---",
        "",
        "*This report is a research output. No confirmed sign codes are produced here. "
        "Tight crops are inputs for POC 2 (digit-template recognition) and POC 3 "
        "(vector glyph recognition). Proceed only after reviewing debug overlays.*",
    ]

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print("=== POC 1 — Tight Numeric Region Crop Extraction ===")
    print(f"Crops dir:   {CROPS_DIR}")
    print(f"Inventory:   {INV_PATH}")
    print(f"Tesseract:   {'available' if TESSERACT_AVAILABLE else 'NOT available — OCR skip'}")

    # Load inventory
    if not INV_PATH.exists():
        print(f"ERROR: {INV_PATH} not found — run Stage G first")
        return
    inventory = json.loads(INV_PATH.read_text())
    occurrences = inventory.get("occurrences", [])
    by_id = {o["occurrence_id"]: o for o in occurrences}
    print(f"Inventory:   {len(occurrences)} occurrences")

    # Find crops
    crop_files = sorted(CROPS_DIR.glob("OCC-*.png"))
    print(f"Crops found: {len(crop_files)}")

    # Create output directories
    OUT_CROPS.mkdir(parents=True, exist_ok=True)
    OUT_DEBUG.mkdir(parents=True, exist_ok=True)

    started_at   = datetime.now().isoformat(timespec="seconds")
    global_start = time.time()
    results      = []

    print()
    for idx, crop_path in enumerate(crop_files):
        occ_id = crop_path.stem  # e.g. "OCC-0001"
        occ    = by_id.get(occ_id, {"occurrence_id": occ_id})

        result = process_crop(occ, crop_path, OUT_CROPS, OUT_DEBUG, idx)
        results.append(result)

        # Progress report every 10
        if (idx + 1) % 10 == 0 or idx == 0:
            tier   = result.get("quality_tier", "?")
            q      = result.get("best_quality_score", 0)
            n_cand = result.get("tight_crops_saved", 0)
            codes  = result.get("optional_ocr_candidate_codes", [])
            print(
                f"  [{idx+1:3d}/{len(crop_files)}] {occ_id} "
                f"tier={tier:12s} Q={q:.3f} crops={n_cand} "
                f"ocr={codes if codes else '—'}"
            )

        # Incremental save
        RESULTS_JSON.write_text(json.dumps(results, ensure_ascii=False, indent=2))

    elapsed = round(time.time() - global_start, 1)

    # Final save
    RESULTS_JSON.write_text(json.dumps(results, ensure_ascii=False, indent=2))
    print(f"\nJSON saved:  {RESULTS_JSON}")

    report = build_report(results, elapsed, started_at)
    REPORT_MD.write_text(report)
    print(f"Report:      {REPORT_MD}")

    # Summary
    tiers = {"good": 0, "medium": 0, "poor": 0, "no_candidate": 0}
    for r in results:
        tiers[r.get("quality_tier", "no_candidate")] += 1

    ocr_hits = sum(1 for r in results if r.get("optional_ocr_candidate_codes"))

    print()
    print("=== Summary ===")
    print(f"  Total processed:   {len(results)}")
    print(f"  Good candidates:   {tiers['good']}")
    print(f"  Medium candidates: {tiers['medium']}")
    print(f"  Poor candidates:   {tiers['poor']}")
    print(f"  No candidate:      {tiers['no_candidate']}")
    print(f"  OCR 2-4 digit hit: {ocr_hits}")
    print(f"  Elapsed:           {elapsed}s")
    print()
    print(f"  Tight crops saved to: {OUT_CROPS}")
    print(f"  Debug overlays:       {OUT_DEBUG}")


if __name__ == "__main__":
    main()
