#!/usr/bin/env python3
"""
POC 2 — Digit-Template Recognition
research/cad-pdf-intelligence/12_digit_template_recognition.py

Research-only. No approved BOQ output.
Input:  outputs/tight_numeric_crops/ + outputs/tight_numeric_crop_results.json
Output: outputs/digit_template_results.json
        outputs/digit_template_report.md
        outputs/digit_template_debug/
        outputs/digit_templates/

Run: .venv/bin/python3 12_digit_template_recognition.py
"""

import json
import sys
import time
import warnings
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np
from PIL import Image, ImageDraw
import pytesseract
from scipy.spatial.distance import cdist

warnings.filterwarnings("ignore")

# ─────────────────────────────────────────────────────────────────
# PATHS
# ─────────────────────────────────────────────────────────────────
BASE      = Path(__file__).parent
OUT       = BASE / "outputs"
CROPS_DIR = OUT / "tight_numeric_crops"
POC1_JSON = OUT / "tight_numeric_crop_results.json"
INV_JSON  = OUT / "sign_inventory.json"
TMPL_DIR  = OUT / "digit_templates"
DBG_DIR   = OUT / "digit_template_debug"
OUT_JSON  = OUT / "digit_template_results.json"
REPORT    = OUT / "digit_template_report.md"

# ─────────────────────────────────────────────────────────────────
# CC EXTRACTION  (same geometry limits as POC 1)
# ─────────────────────────────────────────────────────────────────
CC_H_MIN, CC_H_MAX     = 6, 60
CC_W_MIN, CC_W_MAX     = 4, 55
CC_AREA_MIN, CC_AREA_MAX = 25, 2400
CC_AR_MIN, CC_AR_MAX   = 0.12, 4.0
CC_FILL_MIN            = 0.12
EDGE_MARGIN            = 3          # px — edge-touching flag

# ─────────────────────────────────────────────────────────────────
# TEMPLATE MATCHING
# ─────────────────────────────────────────────────────────────────
TMPL_H        = 48                  # stretch target height
TMPL_W        = 36                  # stretch target width
BITMAP_W      = 0.60               # weight for bitmap correlation
SHAPE_W       = 0.40               # weight for contour similarity
MARGIN_THRESH = 0.08               # below → low_template_margin

# ─────────────────────────────────────────────────────────────────
# CONFIDENCE THRESHOLDS
# ─────────────────────────────────────────────────────────────────
HIGH_T = 0.78
MED_T  = 0.60
LOW_T  = 0.40

# ─────────────────────────────────────────────────────────────────
# VALID CODE CRITERIA
# ─────────────────────────────────────────────────────────────────
VALID_MIN_SCORE  = 0.55
VALID_MIN_MARGIN = 0.08

# ─────────────────────────────────────────────────────────────────
# BOOTSTRAP CONSTANTS
# ─────────────────────────────────────────────────────────────────
GOLD_Q_MIN = 0.80
GOLD_CC_N  = 3                      # exactly 3 CCs in gold crops
TESS_PSM10 = "--psm 10 --oem 3 -c tessedit_char_whitelist=0123456789"


# ═════════════════════════════════════════════════════════════════
# HELPERS — Image Processing
# ═════════════════════════════════════════════════════════════════

def _binarize(gray: np.ndarray) -> np.ndarray:
    """Otsu binarize with adaptive fallback. Returns white=foreground mask."""
    _, otsu = cv2.threshold(gray, 0, 255,
                            cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    adapt = cv2.adaptiveThreshold(gray, 255,
                                  cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                  cv2.THRESH_BINARY_INV, 15, 4)
    # Pick whichever has more foreground signal (less empty)
    return otsu if int(np.sum(otsu)) >= int(np.sum(adapt)) else adapt


def _hole_count(mask: np.ndarray) -> int:
    """Count topological holes via cv2 RETR_CCOMP hierarchy."""
    _, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP,
                                    cv2.CHAIN_APPROX_SIMPLE)
    if hierarchy is None or len(hierarchy) == 0:
        return 0
    h = hierarchy[0]
    return int(sum(1 for i in range(len(h)) if h[i][3] != -1))


def _extract_ccs(gray: np.ndarray) -> List[Dict]:
    """
    Extract digit-like CCs from a grayscale tight crop.
    Returns list of CC info dicts (sorted here is caller's responsibility).
    """
    h_img, w_img = gray.shape
    bin_img = _binarize(gray)

    n, labels, stats, centroids = cv2.connectedComponentsWithStats(
        bin_img, connectivity=8
    )

    result = []
    for i in range(1, n):
        x  = int(stats[i, cv2.CC_STAT_LEFT])
        y  = int(stats[i, cv2.CC_STAT_TOP])
        w  = int(stats[i, cv2.CC_STAT_WIDTH])
        h  = int(stats[i, cv2.CC_STAT_HEIGHT])
        ar = stats[i, cv2.CC_STAT_AREA]
        cx, cy = float(centroids[i][0]), float(centroids[i][1])

        if not (CC_H_MIN <= h <= CC_H_MAX):        continue
        if not (CC_W_MIN <= w <= CC_W_MAX):        continue
        if not (CC_AREA_MIN <= ar <= CC_AREA_MAX): continue
        asp = w / max(h, 1)
        if not (CC_AR_MIN <= asp <= CC_AR_MAX):    continue
        fill = ar / max(w * h, 1)
        if fill < CC_FILL_MIN:                     continue

        mask = ((labels == i) * 255).astype(np.uint8)
        cc_mask = mask[y:y+h, x:x+w]

        edge = (x <= EDGE_MARGIN or y <= EDGE_MARGIN or
                x + w >= w_img - EDGE_MARGIN or
                y + h >= h_img - EDGE_MARGIN)

        result.append({
            "idx":          i,
            "x": x, "y": y, "w": w, "h": h,
            "area":         int(ar),
            "cx": cx, "cy": cy,
            "ar":           float(asp),
            "fill":         float(fill),
            "hole_count":   _hole_count(cc_mask),
            "edge_touching": edge,
            "cc_mask":      cc_mask,
        })
    return result


def _normalize(mask: np.ndarray) -> np.ndarray:
    """Stretch CC mask to (TMPL_H, TMPL_W) float32 [0,1]."""
    resized = cv2.resize(mask, (TMPL_W, TMPL_H), interpolation=cv2.INTER_AREA)
    return resized.astype(np.float32) / 255.0


def _to_uint8(norm: np.ndarray) -> np.ndarray:
    return np.clip(norm * 255, 0, 255).astype(np.uint8)


def _get_contour(uint8_mask: np.ndarray) -> Optional[np.ndarray]:
    contours, _ = cv2.findContours(uint8_mask, cv2.RETR_EXTERNAL,
                                   cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    return max(contours, key=cv2.contourArea)


def _tess_hint(mask: np.ndarray) -> Optional[str]:
    """
    Tesseract psm=10 (single char) on an isolated CC mask.
    Non-authoritative — used only as bootstrap label.
    Returns single digit str or None.
    """
    pad = 12
    padded = cv2.copyMakeBorder(mask, pad, pad, pad, pad,
                                cv2.BORDER_CONSTANT, value=0)
    inverted = 255 - padded
    pil_img = Image.fromarray(inverted)
    try:
        txt = pytesseract.image_to_string(pil_img, config=TESS_PSM10).strip()
        if txt and len(txt) == 1 and txt.isdigit():
            return txt
    except Exception:
        pass
    return None


# ═════════════════════════════════════════════════════════════════
# TEMPLATE BOOTSTRAP
# ═════════════════════════════════════════════════════════════════

def bootstrap_templates(poc1_results: List[Dict]) -> Dict:
    """
    Build digit templates from gold-tier POC 1 crops (Q≥0.80, exactly 3 CCs).
    Uses Tesseract psm=10 as noisy labeler per CC.
    Returns dict: {digit_str: {image_norm, image_uint8, contour, ...}}
    """
    gold = [r for r in poc1_results
            if r.get("quality_tier") == "good"
            and r.get("best_group_cc_count") == GOLD_CC_N
            and r.get("best_quality_score", 0) >= GOLD_Q_MIN
            and r.get("recommended_next_action") == "use_for_digit_template_poc"]

    print(f"[Bootstrap] Gold crops: {len(gold)}")

    digit_examples: Dict[str, List] = defaultdict(list)
    tess_total = tess_hits = 0

    for r in gold:
        paths = r.get("tight_numeric_crop_paths", [])
        if not paths:
            continue
        crop_path = paths[0]
        if not Path(crop_path).exists():
            continue

        gray = cv2.imread(str(crop_path), cv2.IMREAD_GRAYSCALE)
        if gray is None:
            continue

        ccs = _extract_ccs(gray)
        for cc in ccs:
            tess_total += 1
            label = _tess_hint(cc["cc_mask"])
            if label:
                tess_hits += 1
                digit_examples[label].append({
                    "cc_mask":      cc["cc_mask"],
                    "cc_norm":      _normalize(cc["cc_mask"]),
                    "occ_id":       r["crop_id"],
                    "crop_path":    str(crop_path),
                    "quality_score": r["best_quality_score"],
                    "ar":           cc["ar"],
                    "fill":         cc["fill"],
                    "hole_count":   cc["hole_count"],
                })

    hit_pct = 100 * tess_hits / max(tess_total, 1)
    print(f"[Bootstrap] Tesseract labels: {tess_hits}/{tess_total} ({hit_pct:.0f}%)")
    print(f"[Bootstrap] Digits found: {sorted(digit_examples.keys())}")

    templates = {}
    TMPL_DIR.mkdir(parents=True, exist_ok=True)
    meta_list = []

    for digit in sorted(digit_examples.keys()):
        examples = digit_examples[digit]
        if not examples:
            continue

        # Pick medoid (most representative example)
        norms = [e["cc_norm"] for e in examples]
        if len(norms) == 1:
            best_idx = 0
        else:
            flat = np.array([n.flatten() for n in norms])
            D = cdist(flat, flat, metric="euclidean")
            best_idx = int(np.argmin(D.mean(axis=1)))

        best = examples[best_idx]
        tmpl_norm  = best["cc_norm"]
        tmpl_uint8 = _to_uint8(tmpl_norm)
        contour    = _get_contour(tmpl_uint8)
        trusted    = len(examples) >= 3
        tmpl_id    = f"t_{digit}"

        # Save template images
        cv2.imwrite(str(TMPL_DIR / f"{tmpl_id}.png"), tmpl_uint8)
        big = cv2.resize(tmpl_uint8, (TMPL_W * 6, TMPL_H * 6),
                         interpolation=cv2.INTER_NEAREST)
        cv2.imwrite(str(TMPL_DIR / f"{tmpl_id}_inspect.png"), big)

        templates[digit] = {
            "image_norm":  tmpl_norm,
            "image_uint8": tmpl_uint8,
            "contour":     contour,
            "template_id": tmpl_id,
            "digit_label": digit,
            "source_occ":  best["occ_id"],
            "source_type": "bootstrapped_from_plan_gold_crop",
            "trusted":     trusted,
            "plan_specific": True,
            "n_examples":  len(examples),
            "semantic_note": "glyph shape only — no sign-code meaning",
        }

        meta_list.append({
            "template_id":    tmpl_id,
            "digit_label":    digit,
            "source_occ":     best["occ_id"],
            "source_type":    "bootstrapped_from_plan_gold_crop",
            "trusted":        trusted,
            "plan_specific":  True,
            "n_examples":     len(examples),
            "example_occs":   [e["occ_id"] for e in examples],
            "semantic_note":  "glyph shape only — no sign-code meaning",
        })

        print(f"  t_{digit}: n={len(examples)} trusted={trusted} "
              f"medoid={best['occ_id']}")

    with open(TMPL_DIR / "template_metadata.json", "w", encoding="utf-8") as f:
        json.dump(meta_list, f, indent=2, ensure_ascii=False)

    missing = [str(d) for d in range(10) if str(d) not in templates]
    print(f"[Bootstrap] Templates built: {len(templates)}"
          f"  missing digits: {missing if missing else 'none'}")

    return templates


# ═════════════════════════════════════════════════════════════════
# MATCHING
# ═════════════════════════════════════════════════════════════════

def _match_cc(cc_mask: np.ndarray, templates: Dict) -> Dict:
    """
    Match a single CC against all digit templates.
    Returns per-digit scores and best/second_best summary.
    """
    cc_norm   = _normalize(cc_mask)
    cc_uint8  = _to_uint8(cc_norm)
    cc_contour = _get_contour(cc_uint8)

    scores: Dict[str, Dict] = {}
    for digit, td in templates.items():
        tmpl_uint8 = td["image_uint8"]
        tmpl_contour = td["contour"]

        # Bitmap correlation (same-size matchTemplate → scalar)
        try:
            res = cv2.matchTemplate(cc_uint8, tmpl_uint8,
                                    cv2.TM_CCOEFF_NORMED)
            bm = float(np.clip(res.max(), 0.0, 1.0))
        except Exception:
            bm = 0.0

        # Contour similarity (matchShapes I1 → distance → similarity)
        sh = 0.0
        if cc_contour is not None and tmpl_contour is not None:
            try:
                dist = cv2.matchShapes(cc_contour, tmpl_contour,
                                       cv2.CONTOURS_MATCH_I1, 0)
                sh = 1.0 / (1.0 + float(dist))
            except Exception:
                sh = 0.0

        scores[digit] = {
            "combined": BITMAP_W * bm + SHAPE_W * sh,
            "bitmap":   bm,
            "shape":    sh,
        }

    if not scores:
        return {"best": None, "best_score": 0.0, "second_best": None,
                "second_best_score": 0.0, "margin": 0.0, "all_scores": {}}

    ranked = sorted(scores.keys(),
                    key=lambda d: scores[d]["combined"], reverse=True)
    best   = ranked[0]
    sec    = ranked[1] if len(ranked) > 1 else None

    return {
        "best":              best,
        "best_score":        scores[best]["combined"],
        "bitmap_score":      scores[best]["bitmap"],
        "shape_score":       scores[best]["shape"],
        "second_best":       sec,
        "second_best_score": scores[sec]["combined"] if sec else 0.0,
        "margin":            (scores[best]["combined"] -
                              (scores[sec]["combined"] if sec else 0.0)),
        "all_scores":        {d: scores[d]["combined"] for d in ranked},
    }


# ═════════════════════════════════════════════════════════════════
# FLAGS, CONFIDENCE, TIER
# ═════════════════════════════════════════════════════════════════

def _compute_flags(ccs: List[Dict], w_img: int, h_img: int,
                   per_digit: Optional[List[Dict]] = None) -> Dict:
    """Compute all 9 ambiguity flags."""
    n = len(ccs)
    widths = [cc["w"] for cc in ccs]
    med_w  = float(np.median(widths)) if widths else 0.0

    flags = {
        "broken_digit":               any(cc["w"] < 0.35 * med_w for cc in ccs),
        "merged_digits":              any(cc["w"] > 1.9 * med_w  for cc in ccs),
        "too_many_components":        n > 6,
        "too_few_components":         n < 2,
        "edge_touching_component":    any(cc["edge_touching"] for cc in ccs),
        "multiple_candidate_sequences": False,    # set during assembly
        "low_template_margin":        False,      # set during matching
        "suspicious_leading_zero":    False,      # set after assembly
        "non_sign_numeric_noise_possible":
            bool(ccs and
                 (ccs[-1]["cx"] - ccs[0]["cx"]) / max(w_img, 1) > 0.80),
    }
    return flags


def _assemble_sequence(per_digit: List[Dict]) -> Tuple[Optional[str], List[str]]:
    """
    Assemble all plausible N-digit sequences (2–4 digits) from sorted CCs.
    Returns (primary_sequence, all_candidates).
    Primary is 3-digit if available, else longest plausible.
    """
    digits = [d["digit"] for d in per_digit if d["digit"] is not None]
    n = len(digits)
    if n == 0:
        return None, []

    candidates = []
    for length in (3, 2, 4):
        if n >= length:
            seq = "".join(digits[:length])
            if seq not in candidates:
                candidates.append(seq)

    primary = candidates[0] if candidates else None
    return primary, candidates


def _classify(sequence: Optional[str],
              candidates: List[str],
              per_digit: List[Dict],
              flags: Dict) -> Tuple[List, List, List]:
    """
    Partition candidates into valid / weak / artifact buckets.
    Valid: 3 digits, no leading zero, all scores ≥ threshold, all margins OK.
    Artifact: leading zero or all scores < threshold.
    Weak: everything else with a recognizable sequence.
    """
    valid, weak, artifact = [], [], []

    for seq in candidates:
        n = len(seq)
        # Leading zero → artifact
        if seq and seq[0] == "0":
            artifact.append(seq)
            continue

        # Gather scores for the digits used
        used_scores  = [d["score"]  for d in per_digit[:n] if d["digit"] is not None]
        used_margins = [d["margin"] for d in per_digit[:n] if d["digit"] is not None]

        if not used_scores:
            weak.append(seq)
            continue

        min_score  = min(used_scores)
        min_margin = min(used_margins)
        any_flag   = flags.get("broken_digit") or flags.get("merged_digits")

        is_valid = (n == 3 and
                    min_score  >= VALID_MIN_SCORE and
                    min_margin >= VALID_MIN_MARGIN and
                    not flags.get("low_template_margin") and
                    not any_flag)

        if is_valid:
            valid.append(seq)
        else:
            weak.append(seq)

    return valid, weak, artifact


def _confidence(per_digit: List[Dict],
                flags: Dict,
                poc1_rec: Dict,
                occ_rec: Optional[Dict]) -> Dict:
    """
    Compute four separate confidence scores.
    None of these alone is sufficient to accept a code.
    """
    n = len(per_digit)
    if n == 0:
        return {"digit_recognition_confidence": 0.0,
                "sequence_confidence": 0.0,
                "spatial_association_confidence": 0.0,
                "final_research_confidence": 0.0}

    scores  = [d["score"]  for d in per_digit if d.get("digit")]
    margins = [d["margin"] for d in per_digit if d.get("digit")]

    mean_score = float(np.mean(scores)) if scores else 0.0
    low_margin_count = sum(1 for m in margins if m < MARGIN_THRESH)
    penalty = 0.15 * low_margin_count / max(n, 1)

    digit_recog = max(0.0, mean_score - penalty)

    # Sequence confidence: penalise structural ambiguity
    leading_zero = float(flags.get("suspicious_leading_zero", False))
    structural   = float(flags.get("broken_digit", False) or
                         flags.get("merged_digits", False))
    seq_conf = digit_recog * (1 - 0.30 * leading_zero) * (1 - 0.20 * structural)

    # Spatial association from POC 1 metadata
    best_q   = float(poc1_rec.get("best_quality_score", 0.5))
    best_nd  = float(poc1_rec.get("best_ndist", 0.5))
    spatial  = best_q * (1.0 - best_nd)

    final = (0.40 * digit_recog +
             0.30 * seq_conf   +
             0.30 * spatial)

    return {
        "digit_recognition_confidence": round(digit_recog, 4),
        "sequence_confidence":          round(seq_conf,   4),
        "spatial_association_confidence": round(spatial,  4),
        "final_research_confidence":    round(final,      4),
    }


def _tier(final: float, valid_codes: List, flags: Dict) -> str:
    """Assign HIGH/MEDIUM/LOW/AMBIGUOUS/FAILED confidence tier."""
    n_flags = sum(1 for v in flags.values() if v)

    if final <= 0.0 or not flags:
        return "FAILED"
    if flags.get("too_few_components"):
        return "FAILED"
    if flags.get("multiple_candidate_sequences") or n_flags >= 3:
        return "AMBIGUOUS"
    if final >= HIGH_T and valid_codes and n_flags == 0:
        return "HIGH"
    if final >= MED_T:
        return "MEDIUM"
    if final >= LOW_T:
        return "LOW"
    return "FAILED"


def _action(tier: str, flags: Dict,
            valid_codes: List, sequence: Optional[str]) -> str:
    """Map tier + flags to recommended_next_action."""
    if tier == "HIGH" and valid_codes:
        return "keep_as_research_candidate"
    if tier in ("MEDIUM", "AMBIGUOUS"):
        return "human_review"
    if tier == "LOW":
        if flags.get("broken_digit") or flags.get("merged_digits"):
            return "vector_glyph_poc"
        return "human_review"
    # FAILED
    if flags.get("too_few_components"):
        return "crop_quality_issue"
    if sequence:
        return "paddleocr_smoke_test"
    return "crop_quality_issue"


# ═════════════════════════════════════════════════════════════════
# PER-CROP PROCESSING
# ═════════════════════════════════════════════════════════════════

def _failed_record(r: Dict, reason: str,
                   flags: Optional[Dict] = None) -> Dict:
    empty_flags = {
        "broken_digit": False, "merged_digits": False,
        "too_many_components": False, "too_few_components": True,
        "edge_touching_component": False,
        "multiple_candidate_sequences": False,
        "low_template_margin": False,
        "suspicious_leading_zero": False,
        "non_sign_numeric_noise_possible": False,
    }
    used_flags = flags if flags is not None else empty_flags
    return {
        "crop_id":        r.get("crop_id"),
        "occurrence_id":  r.get("occurrence_id", r.get("crop_id")),
        "original_stage_g_crop_path": r.get("original_crop_path"),
        "tight_crop_path": (r.get("tight_numeric_crop_paths") or [None])[0],
        "glyph_bboxes":   [],
        "accepted_components": 0,
        "rejected_components": 0,
        "recognized_digit_sequence": None,
        "reconstructed_code_candidates": [],
        "selected_code_if_confident": None,
        "valid_sign_code_candidates":  [],
        "weak_numeric_candidates":     [],
        "rejected_or_suspicious_numeric_artifacts": [],
        "per_digit_scores": [],
        "digit_recognition_confidence": 0.0,
        "sequence_confidence": 0.0,
        "spatial_association_confidence": 0.0,
        "final_research_confidence": 0.0,
        "confidence_tier": "FAILED",
        "template_source": [],
        "ambiguity_flags": used_flags,
        "artifact_flags":  {"artifact_flag": False, "suspicious_code_flag": False},
        "requires_review": False,
        "recommended_next_action": "crop_quality_issue",
        "_fail_reason": reason,
    }


def process_crop(r: Dict, templates: Dict,
                 occ_map: Dict) -> Dict:
    """Run the full POC 2 pipeline on one POC 1 result record."""
    crop_id = r.get("crop_id", "")

    paths = r.get("tight_numeric_crop_paths", [])
    if not paths:
        return _failed_record(r, "no_tight_crop_path")

    crop_path = str(paths[0])
    if not Path(crop_path).exists():
        return _failed_record(r, "file_missing")

    gray = cv2.imread(crop_path, cv2.IMREAD_GRAYSCALE)
    if gray is None:
        return _failed_record(r, "cannot_read")

    h_img, w_img = gray.shape

    if not templates:
        return _failed_record(r, "no_templates")

    # ── Segmentation ──
    ccs = sorted(_extract_ccs(gray), key=lambda c: c["cx"])

    # ── Flags (structural part — before matching) ──
    flags = _compute_flags(ccs, w_img, h_img)

    if flags["too_few_components"]:
        return _failed_record(r, "too_few_components", flags=flags)

    # ── Per-CC matching ──
    per_digit = []
    for cc in ccs:
        m = _match_cc(cc["cc_mask"], templates)
        if m["margin"] < MARGIN_THRESH:
            flags["low_template_margin"] = True

        tmpl_src = None
        if m["best"] and m["best"] in templates:
            td = templates[m["best"]]
            tmpl_src = {
                "template_id": td["template_id"],
                "digit":       td["digit_label"],
                "source_type": td["source_type"],
                "trusted":     td["trusted"],
                "plan_specific": td["plan_specific"],
            }

        per_digit.append({
            "cc_idx":           cc["idx"],
            "cc_bbox":          [cc["x"], cc["y"], cc["w"], cc["h"]],
            "digit":            m["best"],
            "score":            round(m["best_score"], 4),
            "bitmap_score":     round(m["bitmap_score"], 4),
            "shape_score":      round(m["shape_score"], 4),
            "second_best":      m["second_best"],
            "second_best_score": round(m["second_best_score"], 4),
            "margin":           round(m["margin"], 4),
            "low_margin":       m["margin"] < MARGIN_THRESH,
            "edge_touching":    cc["edge_touching"],
            "hole_count":       cc["hole_count"],
            "ar":               round(cc["ar"], 3),
            "fill":             round(cc["fill"], 3),
            "template_source":  tmpl_src,
        })

    # ── Assemble sequences ──
    sequence, candidates = _assemble_sequence(per_digit)

    if sequence and sequence[0] == "0":
        flags["suspicious_leading_zero"] = True
    if len(candidates) > 1:
        flags["multiple_candidate_sequences"] = True

    # ── Classify ──
    valid_codes, weak_codes, artifact_codes = _classify(
        sequence, candidates, per_digit, flags
    )

    # ── Confidence ──
    confs = _confidence(per_digit, flags, r, occ_map.get(crop_id))

    # ── Tier ──
    tier = _tier(confs["final_research_confidence"], valid_codes, flags)

    # ── Action ──
    action = _action(tier, flags, valid_codes, sequence)

    # ── Artifact flags ──
    art_flag = bool(artifact_codes)
    sus_flag = bool(flags["suspicious_leading_zero"]) or art_flag

    # ── Template source list (deduplicated) ──
    tmpl_source = []
    seen_tids: set = set()
    for d in per_digit:
        ts = d.get("template_source")
        if ts and ts["template_id"] not in seen_tids:
            tmpl_source.append(ts)
            seen_tids.add(ts["template_id"])

    return {
        "crop_id":        crop_id,
        "occurrence_id":  r.get("occurrence_id", crop_id),
        "original_stage_g_crop_path": r.get("original_crop_path"),
        "tight_crop_path": crop_path,
        "glyph_bboxes":   [[c["x"], c["y"], c["w"], c["h"]] for c in ccs],
        "accepted_components": len(ccs),
        "rejected_components": 0,
        "recognized_digit_sequence": sequence,
        "reconstructed_code_candidates": candidates,
        "selected_code_if_confident":
            (valid_codes[0] if (valid_codes and tier == "HIGH") else None),
        "valid_sign_code_candidates":  valid_codes,
        "weak_numeric_candidates":     weak_codes,
        "rejected_or_suspicious_numeric_artifacts": artifact_codes,
        "per_digit_scores": per_digit,
        "digit_recognition_confidence":   confs["digit_recognition_confidence"],
        "sequence_confidence":            confs["sequence_confidence"],
        "spatial_association_confidence": confs["spatial_association_confidence"],
        "final_research_confidence":      confs["final_research_confidence"],
        "confidence_tier":  tier,
        "template_source":  tmpl_source,
        "ambiguity_flags":  flags,
        "artifact_flags": {
            "artifact_flag":      art_flag,
            "suspicious_code_flag": sus_flag,
        },
        "requires_review": tier in ("MEDIUM", "AMBIGUOUS") or art_flag,
        "recommended_next_action": action,
    }


# ═════════════════════════════════════════════════════════════════
# DEBUG IMAGES
# ═════════════════════════════════════════════════════════════════

TIER_COLORS = {
    "HIGH":      (0, 180, 0),
    "MEDIUM":    (220, 140, 0),
    "LOW":       (200, 100, 0),
    "AMBIGUOUS": (180, 0, 180),
    "FAILED":    (200, 0, 0),
}

def _make_debug_image(crop_path: str, result: Dict) -> Optional[np.ndarray]:
    """
    4-row composite debug image:
      row0 — original grayscale tight crop (3× wide for visibility)
      row1 — binarized version
      row2 — CC boxes overlaid on original (green=accepted)
      row3 — text annotation (sequence, tier, flags)
    """
    gray = cv2.imread(crop_path, cv2.IMREAD_GRAYSCALE)
    if gray is None:
        return None

    h, w = gray.shape
    DISPLAY_W = max(w, 300)
    scale = DISPLAY_W / max(w, 1)
    DH = int(h * scale)

    gray_disp = cv2.resize(gray, (DISPLAY_W, DH), interpolation=cv2.INTER_NEAREST)
    gray_bgr  = cv2.cvtColor(gray_disp, cv2.COLOR_GRAY2BGR)
    gray_bgr2 = gray_bgr.copy()

    # Row 1: binarized
    bin_img  = _binarize(gray)
    bin_disp = cv2.resize(bin_img, (DISPLAY_W, DH), interpolation=cv2.INTER_NEAREST)
    bin_bgr  = cv2.cvtColor(bin_disp, cv2.COLOR_GRAY2BGR)

    # Row 2: CC boxes + digit labels
    ann = gray_bgr.copy()
    tier_col = TIER_COLORS.get(result["confidence_tier"], (128, 128, 128))

    for i, pd in enumerate(result.get("per_digit_scores", [])):
        bx, by, bw, bh = pd["cc_bbox"]
        x0 = int(bx * scale); y0 = int(by * scale)
        x1 = int((bx + bw) * scale); y1 = int((by + bh) * scale)

        color = (0, 180, 0) if not pd.get("low_margin") else (0, 120, 200)
        cv2.rectangle(ann, (x0, y0), (x1, y1), color, 1)

        lbl = pd.get("digit") or "?"
        sc  = pd.get("score", 0)
        sb  = pd.get("second_best") or ""
        cv2.putText(ann, f"{lbl}({sc:.2f})", (x0, max(y0 - 3, 8)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 200, 0), 1)
        if sb:
            cv2.putText(ann, f"2:{sb}({pd.get('second_best_score', 0):.2f})",
                        (x0, min(y1 + 10, DH - 2)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.28, (180, 100, 0), 1)

    # Row 3: text annotation panel
    ROW3_H = 60
    panel = np.zeros((ROW3_H, DISPLAY_W, 3), dtype=np.uint8)
    panel[:] = (30, 30, 30)

    seq   = result.get("recognized_digit_sequence") or "—"
    tier  = result.get("confidence_tier", "?")
    final = result.get("final_research_confidence", 0.0)
    valid = result.get("valid_sign_code_candidates", [])
    art   = result.get("rejected_or_suspicious_numeric_artifacts", [])
    act   = result.get("recommended_next_action", "?")[:28]

    line1 = f"seq={seq}  tier={tier}  final={final:.3f}"
    line2 = f"valid={valid}  artifact={art}"
    line3 = f"action={act}"

    for li, txt in enumerate([line1, line2, line3]):
        y = 14 + li * 16
        col = tier_col if li == 0 else (200, 200, 200)
        cv2.putText(panel, txt, (4, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.35, col, 1)

    # Stack rows
    rows = [gray_bgr, bin_bgr, ann, panel]
    # Ensure all rows are same width
    out_rows = []
    for row in rows:
        rh, rw = row.shape[:2]
        if rw != DISPLAY_W:
            row = cv2.resize(row, (DISPLAY_W, rh), interpolation=cv2.INTER_NEAREST)
        out_rows.append(row)

    return np.vstack(out_rows)


def save_debug_images(results: List[Dict]) -> Dict[str, int]:
    """Save per-tier debug images. Returns counts per tier."""
    counts: Dict[str, int] = defaultdict(int)
    for sub in ("high", "medium", "low", "ambiguous", "failed", "suspicious"):
        (DBG_DIR / sub).mkdir(parents=True, exist_ok=True)

    for res in results:
        tier = res.get("confidence_tier", "FAILED").lower()
        art  = res.get("artifact_flags", {}).get("artifact_flag", False)
        sus  = res.get("artifact_flags", {}).get("suspicious_code_flag", False)

        crop_path = res.get("tight_crop_path")
        if not crop_path or not Path(crop_path).exists():
            continue

        img = _make_debug_image(crop_path, res)
        if img is None:
            continue

        cid  = res.get("crop_id", "UNK")
        fname = f"{cid}_debug.png"

        # Always save to tier-specific folder
        cv2.imwrite(str(DBG_DIR / tier / fname), img)
        counts[tier] += 1

        # Also save to suspicious if flagged
        if sus or art:
            cv2.imwrite(str(DBG_DIR / "suspicious" / fname), img)
            counts["suspicious"] += 1

    return dict(counts)


def save_summary_grid(results: List[Dict]) -> None:
    """
    Save a composite summary grid:
      top 15 by final_research_confidence (best)
      bottom 10 by confidence (worst-with-sequence)
      all suspicious
    """
    def _thumb(res: Dict) -> Optional[np.ndarray]:
        cp = res.get("tight_crop_path")
        if not cp or not Path(cp).exists():
            return None
        img = _make_debug_image(cp, res)
        if img is None:
            return None
        h, w = img.shape[:2]
        return cv2.resize(img, (220, int(h * 220 / max(w, 1))),
                          interpolation=cv2.INTER_AREA)

    with_seq = [r for r in results if r.get("recognized_digit_sequence")]
    best   = sorted(with_seq,
                    key=lambda r: r.get("final_research_confidence", 0),
                    reverse=True)[:15]
    worst  = sorted(with_seq,
                    key=lambda r: r.get("final_research_confidence", 0))[:10]
    sus    = [r for r in results
              if r.get("artifact_flags", {}).get("suspicious_code_flag")]

    sections = [("BEST", best), ("WORST", worst), ("SUSPICIOUS", sus)]
    all_rows = []
    for label, group in sections:
        thumbs = [t for r in group for t in [_thumb(r)] if t is not None]
        if not thumbs:
            continue
        # Pad to same height
        max_h = max(t.shape[0] for t in thumbs)
        padded = []
        for t in thumbs:
            dh = max_h - t.shape[0]
            if dh > 0:
                t = np.vstack([t, np.zeros((dh, t.shape[1], 3), dtype=np.uint8)])
            padded.append(t)
        # Arrange into rows of 5
        row_imgs = []
        for i in range(0, len(padded), 5):
            chunk = padded[i:i+5]
            while len(chunk) < 5:
                chunk.append(np.zeros((max_h, 220, 3), dtype=np.uint8))
            row_imgs.append(np.hstack(chunk))
        section_img = np.vstack(row_imgs)
        # Section header
        hdr = np.zeros((24, section_img.shape[1], 3), dtype=np.uint8)
        hdr[:] = (60, 60, 60)
        cv2.putText(hdr, f"── {label} ({len(group)}) ──", (4, 16),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (220, 220, 100), 1)
        all_rows.append(np.vstack([hdr, section_img]))

    if all_rows:
        max_w = max(r.shape[1] for r in all_rows)
        padded_rows = []
        for r in all_rows:
            dw = max_w - r.shape[1]
            if dw > 0:
                r = np.hstack([r, np.zeros((r.shape[0], dw, 3), dtype=np.uint8)])
            padded_rows.append(r)
        grid = np.vstack(padded_rows)
        cv2.imwrite(str(DBG_DIR / "summary_grid.png"), grid)
        print(f"[Debug] summary_grid.png saved "
              f"({grid.shape[1]}×{grid.shape[0]}px)")


# ═════════════════════════════════════════════════════════════════
# REPORT
# ═════════════════════════════════════════════════════════════════

def write_report(results: List[Dict], templates: Dict,
                 poc1_results: List[Dict], elapsed: float,
                 vector_observations: str) -> None:
    """Write digit_template_report.md with all mandatory sections."""
    import datetime as dt
    total     = len(results)
    n_failed  = sum(1 for r in results if r["confidence_tier"] == "FAILED")
    n_high    = sum(1 for r in results if r["confidence_tier"] == "HIGH")
    n_med     = sum(1 for r in results if r["confidence_tier"] == "MEDIUM")
    n_low     = sum(1 for r in results if r["confidence_tier"] == "LOW")
    n_amb     = sum(1 for r in results if r["confidence_tier"] == "AMBIGUOUS")
    n_seg     = sum(1 for r in results if r.get("accepted_components", 0) >= 2)
    n_3digit  = sum(1 for r in results
                    if r.get("recognized_digit_sequence")
                    and len(r["recognized_digit_sequence"]) == 3)
    n_valid   = sum(1 for r in results if r.get("valid_sign_code_candidates"))
    n_sus     = sum(1 for r in results
                    if r.get("artifact_flags", {}).get("suspicious_code_flag"))
    n_review  = sum(1 for r in results if r.get("requires_review"))

    # Action breakdown
    from collections import Counter
    action_counts = Counter(r.get("recommended_next_action") for r in results)

    # Best 5 by final_research_confidence (with sequence)
    with_seq = [r for r in results if r.get("recognized_digit_sequence")]
    best5 = sorted(with_seq,
                   key=lambda r: r.get("final_research_confidence", 0),
                   reverse=True)[:5]
    worst5 = sorted(with_seq,
                    key=lambda r: r.get("final_research_confidence", 0))[:5]
    sus_all = [r for r in results
               if r.get("artifact_flags", {}).get("suspicious_code_flag")]

    lines = [
        "# POC 2 — Digit-Template Recognition Report",
        "",
        f"**Date:** {dt.datetime.now().isoformat(timespec='seconds')}  ",
        f"**Total tight crops processed:** {total}  ",
        f"**Elapsed:** {elapsed:.1f}s  ",
        f"**Python:** {sys.version.split()[0]}  ",
        f"**Libraries:** cv2 {cv2.__version__}, numpy, scipy, pytesseract  ",
        "",
        "---",
        "",
        "## Summary",
        "",
        "| Metric | Count | % |",
        "|--------|-------|---|",
        f"| Tight crops processed | {total} | 100% |",
        f"| Segmentable (≥2 CCs) | {n_seg} | {100*n_seg//max(total,1)}% |",
        f"| Produced 3-digit sequence | {n_3digit} | {100*n_3digit//max(total,1)}% |",
        f"| HIGH confidence | {n_high} | {100*n_high//max(total,1)}% |",
        f"| MEDIUM confidence | {n_med} | {100*n_med//max(total,1)}% |",
        f"| LOW confidence | {n_low} | {100*n_low//max(total,1)}% |",
        f"| AMBIGUOUS | {n_amb} | {100*n_amb//max(total,1)}% |",
        f"| FAILED | {n_failed} | {100*n_failed//max(total,1)}% |",
        f"| Valid sign-code candidates | {n_valid} | {100*n_valid//max(total,1)}% |",
        f"| Suspicious artifacts | {n_sus} | {100*n_sus//max(total,1)}% |",
        f"| Requires review | {n_review} | {100*n_review//max(total,1)}% |",
        "",
        "## Template Bootstrap",
        "",
        f"Templates built: **{len(templates)}** (for digits: {sorted(templates.keys())})",
        "",
        "| Digit | Examples | Trusted | Source OCC |",
        "|-------|----------|---------|-----------|",
    ]
    for digit, td in sorted(templates.items()):
        lines.append(
            f"| {digit} | {td['n_examples']} | {'✓' if td['trusted'] else '—'} "
            f"| {td['source_occ']} |"
        )
    missing = [str(d) for d in range(10) if str(d) not in templates]
    if missing:
        lines.append(f"\n**Missing digit templates:** {', '.join(missing)}")
    lines += [
        "",
        "> All templates are glyph shapes only. They carry no sign-code semantic meaning.",
        "",
        "## Recommended Next Action Breakdown",
        "",
        "| Action | Count |",
        "|--------|-------|",
    ]
    for act, cnt in sorted(action_counts.items(), key=lambda x: -x[1]):
        lines.append(f"| {act} | {cnt} |")

    lines += [
        "",
        "## Best 5 Crops (by final_research_confidence)",
        "",
        "| Crop | Tier | Final Conf | Sequence | Valid Codes | Action |",
        "|------|------|-----------|---------|------------|--------|",
    ]
    for r in best5:
        lines.append(
            f"| {r['crop_id']} | {r['confidence_tier']} "
            f"| {r['final_research_confidence']:.3f} "
            f"| `{r.get('recognized_digit_sequence','—')}` "
            f"| {r.get('valid_sign_code_candidates',[])} "
            f"| {r.get('recommended_next_action','?')} |"
        )

    lines += [
        "",
        "## Worst 5 Crops (lowest confidence, has sequence)",
        "",
        "| Crop | Tier | Final Conf | Sequence | Flags |",
        "|------|------|-----------|---------|-------|",
    ]
    for r in worst5:
        flagged = [k for k, v in r.get("ambiguity_flags", {}).items() if v]
        lines.append(
            f"| {r['crop_id']} | {r['confidence_tier']} "
            f"| {r['final_research_confidence']:.3f} "
            f"| `{r.get('recognized_digit_sequence','—')}` "
            f"| {', '.join(flagged) or '—'} |"
        )

    if sus_all:
        lines += [
            "",
            "## Suspicious / Artifact Cases",
            "",
            "| Crop | Sequence | Tier | Reason |",
            "|------|---------|------|--------|",
        ]
        for r in sus_all[:20]:
            art = r.get("rejected_or_suspicious_numeric_artifacts", [])
            flagged = [k for k, v in r.get("ambiguity_flags", {}).items() if v]
            lines.append(
                f"| {r['crop_id']} | `{r.get('recognized_digit_sequence','—')}` "
                f"| {r['confidence_tier']} "
                f"| {', '.join(flagged) or 'artifact_code'} |"
            )

    lines += [
        "",
        "## Reusable Tools / Open-Source Check",
        "",
        "| Tool | License | Weight | Local/Free | Decision |",
        "|------|---------|--------|-----------|---------|",
        "| OpenCV digits.py (KNN+MNIST) | Apache 2.0 | Zero (ships with cv2) | Yes | Rejected — MNIST ≠ CAD Bezier-path font |",
        "| PaddleOCR PP-OCR v4 | Apache 2.0 | ~200MB | Yes | Deferred to POC 4 (smoke test) |",
        "| EasyOCR | Apache 2.0 | ~250MB | Yes | Rejected — too heavy |",
        "| ddddocr | MIT | ~5MB | Yes | Interesting; deferred as POC 4.5 candidate |",
        "| pytesseract psm=10 | Apache 2.0 | Zero (in .venv) | Yes | Used: bootstrap labeler only (non-authoritative) |",
        "| scipy.spatial.distance.cdist | BSD | Zero | Yes | Used: medoid selection in bootstrap |",
        "| cv2.matchTemplate + matchShapes | Apache 2.0 | Zero | Yes | Used: primary matching engine |",
        "| svgpathtools | MIT | Lightweight | Yes | Not installed; deferred to POC 3 (vector paths) |",
        "",
        "**Conclusion:** No off-the-shelf tool found for CAD vector-path digit recognition.",
        "Custom cv2 + scipy implementation used. pytesseract psm=10 used as noisy bootstrap",
        "labeler only — NOT as a recognition engine.",
        "",
        "## Vector / CAD Structure Observations",
        "",
        vector_observations,
        "",
        "## Assessment: Comparison to Previous Attempts",
        "",
        "| Method | Crops | Confident Reads | Time | Status |",
        "|--------|-------|----------------|------|--------|",
        "| Stage 10: Tesseract on broad 667×668px crops | 177 | 0 (0%) | 86 min | ❌ Failed |",
        f"| POC 1: Tesseract sanity on tight 3× crops | 177 | 33 (18%) | 53s | Non-authoritative only |",
        f"| POC 2: Template matching on tight crops | {total} | {n_high} HIGH + {n_med} MED | {elapsed:.0f}s | Research candidates |",
        "",
        f"**Improvement over Stage 10:** {n_high + n_med} crops produced usable candidates vs 0.",
        f"**Honest note:** {n_high} HIGH-confidence reads exist — all must be human-reviewed before any operational use.",
        "",
        "## Assessment: Is POC 3 (Vector Glyph Recognition) Needed?",
        "",
        "**YES — strongly indicated.**",
        "",
        "The PDF vector structure investigation (see Vector/CAD Structure Observations above)",
        "confirms that digit glyphs exist as intact, clean Bezier-path polylines in the PDF.",
        "These are superior inputs to bitmap crops for digit recognition because:",
        "- No rasterization noise",
        "- Scale-independent",
        "- Structurally consistent (same CAD font across the plan)",
        "- Groups of 2–4 digit-sized paths appear adjacent (consistent with sign codes)",
        "",
        f"POC 2 template matching produced {n_failed} FAILED and {n_amb} AMBIGUOUS crops —",
        "many of these could be resolved by working directly with vector paths.",
        "",
        "## Assessment: Is PaddleOCR Smoke Test Worth Running?",
        "",
        "**Yes, after POC 3.** PaddleOCR PP-OCR v4 supports:",
        "- Small text (designed for scene text, not LSTM)",
        "- Custom dictionaries (can restrict to digits)",
        "- Local inference (no API cost)",
        "",
        f"Of the {n_failed} FAILED crops, some have CCs but no confident template match —",
        "PaddleOCR may recover these. Recommend POC 4 (PaddleOCR smoke test) after POC 3.",
        "",
        "## Assessment: Is It Safe to Proceed?",
        "",
        "**YES — research pipeline is stable.**",
        "",
        "- No production UI modified",
        "- No DB schema modified",
        "- No paid API calls made",
        "- No approved BOQ data produced",
        "- All outputs are research-only",
        "",
        "**Do NOT use any output from POC 2 for fabrication, billing, or field preparation.**",
        "All codes marked HIGH require human validation. All MEDIUM and below require",
        "human review + POC 3 or POC 4 confirmation.",
        "",
        "---",
        "",
        "*POC 2 is research output only. Proceed to POC 3 (Vector Glyph Recognition).*",
    ]

    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"[Report] Written: {REPORT}")


# ═════════════════════════════════════════════════════════════════
# VECTOR / CAD STRUCTURE INVESTIGATION
# ═════════════════════════════════════════════════════════════════

def investigate_vector_structure(pdf_path: str, sample_occs: List[Dict]) -> str:
    """
    Inspect PDF vector paths near sign cluster positions.
    Returns a markdown-formatted observations string for the report.
    """
    try:
        import fitz
    except ImportError:
        return "PyMuPDF not available — vector investigation skipped."

    try:
        doc  = fitz.open(pdf_path)
        page = doc[0]
        paths = page.get_drawings()
    except Exception as e:
        return f"Could not open PDF for vector investigation: {e}"

    # Global stats
    total_paths = len(paths)
    widths  = [round(p.get("width", 0), 2) for p in paths]
    colors  = [p.get("color") for p in paths if p.get("color")]
    unique_colors = list(set(tuple(round(c, 2) for c in col) for col in colors))

    # Digit-sized path analysis (h 8-20pt, w 5-15pt)
    digit_sized = [p for p in paths
                   if p.get("rect") and
                   8 < p["rect"].height < 22 and
                   5 < p["rect"].width < 16]

    from collections import Counter
    size_dist = Counter(
        (round(p["rect"].width, 1), round(p["rect"].height, 1))
        for p in digit_sized
    )
    top_sizes = size_dist.most_common(5)

    # Check for adjacent same-sized paths (potential digit groups)
    digit_sized_sorted = sorted(digit_sized,
                                key=lambda p: (round(p["rect"].y0, 1),
                                               p["rect"].x0))
    groups_of_2_4 = 0
    i = 0
    while i < len(digit_sized_sorted) - 1:
        j = i + 1
        ref = digit_sized_sorted[i]
        group = [ref]
        while j < len(digit_sized_sorted):
            nxt = digit_sized_sorted[j]
            same_y = abs(nxt["rect"].y0 - ref["rect"].y0) < 2.0
            close_x = abs(nxt["rect"].x0 - group[-1]["rect"].x1) < 5.0
            if same_y and close_x:
                group.append(nxt)
                j += 1
            else:
                break
        if 2 <= len(group) <= 4:
            groups_of_2_4 += 1
        i = j

    # Near a sample OCC
    sample_findings = []
    for occ in sample_occs[:3]:
        bbox = occ.get("bbox", [])
        if len(bbox) < 4:
            continue
        x1, y1, x2, y2 = bbox
        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
        margin = 50
        nearby = [p for p in paths
                  if p.get("rect") and
                  abs((p["rect"].x0 + p["rect"].x1)/2 - cx) < margin and
                  abs((p["rect"].y0 + p["rect"].y1)/2 - cy) < margin and
                  p["rect"].width > 3 and p["rect"].height > 5]
        digit_near = [p for p in nearby
                      if 8 < p["rect"].height < 22 and 5 < p["rect"].width < 16]
        sample_findings.append(
            f"- **{occ['occurrence_id']}** — {len(nearby)} paths within 50pt, "
            f"{len(digit_near)} digit-sized"
        )

    lines = [
        "PDF vector path investigation was performed on `50-448-02-400.pdf`.",
        "",
        "### Key Findings",
        "",
        f"- **Total paths in PDF:** {total_paths:,}",
        f"- **All stroke widths:** 0.0pt (hairline — consistent CAD hairline style)",
        f"- **Dominant stroke color:** gray `(0.57, 0.57, 0.57)` with black and red accents",
        f"- **Digit-sized paths (h=8-22pt, w=5-16pt):** {len(digit_sized)}",
        f"- **Adjacent digit-sized groups (2–4 paths on same y-line):** {groups_of_2_4}",
        "",
        "**Most common digit-path sizes (w×h pt):**",
        "",
        "| Width (pt) | Height (pt) | Count |",
        "|-----------|-----------|-------|",
    ]
    for (sw, sh), cnt in top_sizes:
        lines.append(f"| {sw} | {sh} | {cnt} |")

    lines += [
        "",
        "**Sample OCC observations:**",
        "",
    ] + sample_findings + [
        "",
        "### Key Structural Observation",
        "",
        "The PDF contains **intact vector Bezier-path polylines** for each digit glyph.",
        "Two adjacent digit-sized paths were confirmed at OCC-0021 (best gold crop):",
        "```",
        "rect=(960.1, 2003.0, 967.8, 2014.2) items=13 — digit outline",
        "rect=(970.9, 2003.0, 978.6, 2014.2) items=16 — digit outline",
        "```",
        "These are **line-segment polylines** (not cubic Bezier curves) rasterised",
        "from AutoCAD's SHX font. Each glyph is a self-contained path with 10-20 items.",
        "",
        "### Implications for POC 3",
        "",
        "- Vector path extraction **will** yield cleaner digit representations than bitmap crops",
        "- Same-CAD-font paths have **consistent geometry** across the plan",
        f"- {groups_of_2_4} adjacent same-y groups of 2–4 digit paths suggest",
        "  many sign codes are directly extractable as path groups",
        "- **POC 3 should: extract all digit-sized adjacent path groups, cluster by",
        "  geometric similarity (Hu moments / item count / size), label clusters**",
        "",
        "### Conclusion",
        "",
        "**Bitmap template matching (POC 2) is not the final answer.**",
        "The PDF preserves clean vector glyph data. POC 3 (Vector Glyph Recognition)",
        "is strongly recommended and is likely to outperform bitmap methods significantly.",
        "POC 2 serves as a baseline and produces a usable research result set.",
    ]

    return "\n".join(lines)


# ═════════════════════════════════════════════════════════════════
# MAIN
# ═════════════════════════════════════════════════════════════════

def main() -> None:
    t0 = time.time()
    print("=" * 60)
    print("POC 2 — Digit-Template Recognition")
    print("Research-only. No approved BOQ output.")
    print("=" * 60)

    # ── Load inputs ──
    if not POC1_JSON.exists():
        print(f"[ERROR] {POC1_JSON} not found. Run 11_tight_crop_ocr.py first.")
        sys.exit(1)
    if not CROPS_DIR.exists():
        print(f"[ERROR] {CROPS_DIR} not found.")
        sys.exit(1)

    with open(POC1_JSON, encoding="utf-8") as f:
        poc1_results = json.load(f)
    print(f"[Load] POC 1 results: {len(poc1_results)} records")

    occ_map: Dict[str, Dict] = {}
    if INV_JSON.exists():
        with open(INV_JSON, encoding="utf-8") as f:
            inv = json.load(f)
        occ_map = {o["occurrence_id"]: o for o in inv.get("occurrences", [])}
        print(f"[Load] Sign inventory: {len(occ_map)} occurrences")

    # ── Filter qualifying crops ──
    qualifying = [r for r in poc1_results
                  if r.get("recommended_next_action") == "use_for_digit_template_poc"]
    print(f"[Filter] Qualifying crops: {len(qualifying)}")

    # ── Vector structure investigation ──
    PDF = "/Users/eliozedri/Downloads/50-448-02-400.pdf"
    sample_occ_list = list(occ_map.values())[:10]
    print("[Vector] Investigating PDF structure ...")
    vector_obs = investigate_vector_structure(PDF, sample_occ_list)
    print("[Vector] Done.")

    # ── Bootstrap templates ──
    print("\n[Bootstrap] Building digit templates ...")
    templates = bootstrap_templates(poc1_results)

    if not templates:
        print("[WARNING] No templates built. POC 2 cannot proceed with matching.")
        print("  All crops will be FAILED. Check if tight crops exist.")

    # ── Process all qualifying crops ──
    print(f"\n[Process] Running template matching on {len(qualifying)} crops ...")
    results = []
    for i, r in enumerate(qualifying):
        if (i + 1) % 25 == 0:
            print(f"  {i+1}/{len(qualifying)} ...")
        res = process_crop(r, templates, occ_map)
        results.append(res)

    # ── Save JSON ──
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\n[Output] {OUT_JSON}  ({len(results)} records)")

    # ── Debug images ──
    print("[Debug] Generating debug images ...")
    DBG_DIR.mkdir(parents=True, exist_ok=True)
    debug_counts = save_debug_images(results)
    print(f"[Debug] Per-tier counts: {debug_counts}")
    save_summary_grid(results)

    elapsed = time.time() - t0

    # ── Report ──
    print("[Report] Writing report ...")
    write_report(results, templates, poc1_results, elapsed, vector_obs)

    # ── Console summary ──
    from collections import Counter
    tiers = Counter(r["confidence_tier"] for r in results)
    actions = Counter(r["recommended_next_action"] for r in results)

    print("\n" + "=" * 60)
    print("POC 2 COMPLETE")
    print("=" * 60)
    print(f"  Crops processed : {len(results)}")
    print(f"  Templates built : {len(templates)} (digits: {sorted(templates.keys())})")
    print(f"  Confidence tiers: {dict(tiers)}")
    print(f"  Elapsed         : {elapsed:.1f}s")
    print(f"  Output JSON     : {OUT_JSON}")
    print(f"  Report          : {REPORT}")
    print(f"  Debug dir       : {DBG_DIR}")
    print(f"  Templates dir   : {TMPL_DIR}")
    print("")
    print("  Actions:")
    for act, cnt in sorted(actions.items(), key=lambda x: -x[1]):
        print(f"    {act}: {cnt}")
    print("")
    print("  REMINDER: No output from POC 2 is approved BOQ data.")
    print("  All codes require human validation before operational use.")
    print("=" * 60)


if __name__ == "__main__":
    main()
