#!/usr/bin/env python3
"""
Stage G v1 — Sign Inventory + Pole Assembly Grouping  (Research Only)

Uses Stage F legend icon crops as plan-specific templates to identify where
each sign type appears on the map. Vision API reads nearby sign codes.

Evidence hierarchy:
  1. Vision API code reading (primary — confirmed by diagnostic)
  2. Plan-specific legend icon match (same CAD style = strongest visual)
  3. Catalog template match (Stage E — fallback, style gap persists)
  4. Color/shape heuristic — classification only, never identity

All outputs are labelled RESEARCH and must not be used operationally
without human review and approval.

Inputs:
  outputs/symbol_clusters.json     — Stage 4 DBSCAN clusters
  outputs/legend_vocabulary.json   — Stage F legend metadata
  outputs/legend_rows.json         — Stage F per-row data
  outputs/legend_icons/row_NNN.png — Stage F icon crops (plan-specific templates)
  [pdf_path]                       — PDF to render crops from

Outputs:
  outputs/sign_inventory.json
  outputs/sign_inventory_report.md
  outputs/sign_inventory_debug_overlay.png
  outputs/pole_grouping_debug_overlay.png
  outputs/noise_report.json
  outputs/stage_g_code_crops/occ_NNNN.png
"""

import sys
import os
import re
import json
import math
import base64
import time
from pathlib import Path
from collections import defaultdict, Counter
from typing import Optional, List, Dict, Tuple

import numpy as np
import cv2
import fitz  # PyMuPDF

from cad_utils import output_path, load_json

# ── Global configuration ───────────────────────────────────────────────────────

DEFAULT_PDF = "/Users/eliozedri/Downloads/50-448-02-400.pdf"

RENDER_DPI          = 150     # DPI for all renders
CLUSTER_PADDING_PTS = 35      # padding around cluster bbox for legend matching
CODE_CROP_PADDING_PTS = 160   # padding around cluster centroid for Vision code crop

# Legend matching thresholds (Canny TM_CCOEFF_NORMED)
LEGEND_MATCH_THRESHOLD  = 0.08   # minimum score to record a legend match
LEGEND_MATCH_TIER_MEDIUM = 0.20  # above this = medium confidence
LEGEND_MATCH_TIER_HIGH   = 0.35  # above this = high confidence

# Candidate cluster types to process
TARGET_TYPES = {"sign_symbol", "compact_symbol", "symbol_fragment"}

# Preprocessing parameters (shared with Stage E)
NORM_SIZE  = 128
CANNY_LOW  = 40
CANNY_HIGH = 120

# ── Pole grouping parameters (configurable — NOT hardcoded) ────────────────────
# Tune per project. Visual debug confirmation required before trusting grouping.
POLE_GROUPING_RADIUS_PTS     = 50.0   # max centroid distance for same-pole grouping
POLE_GROUPING_MAX_SIGNS      = 5      # assemblies larger than this → flag for review
POLE_GROUPING_VERTICAL_BIAS  = True   # prefer vertical stacking; penalize horizontal
POLE_GROUPING_AMBIGUITY_FLAG = True   # mark requires_review when grouping is ambiguous

# Vision model
VISION_MODEL = "claude-opus-4-5"
VISION_PROMPT = (
    "You are analyzing a crop from an Israeli traffic arrangement engineering plan (CAD/PDF). "
    "The image shows a sign location on the plan map. "
    "Look for any traffic sign code number near this sign. "
    "Israeli sign codes are typically 3-4 digit numbers (e.g. 402, 605, 625b, 101). "
    "The number may appear as small text next to, below, or above the sign icon. "
    "Return ONLY valid JSON in this exact format:\n"
    '{"code_candidates": [{"code": "402", "confidence": 0.9, "location": "below sign", "notes": "clear"}], '
    '"overall_notes": "..."}\n'
    "If no code is visible, return: "
    '{"code_candidates": [], "overall_notes": "no sign code visible in this crop"}'
)


# ── Coordinate helpers ─────────────────────────────────────────────────────────

def pm_to_display(pm_x: float, pm_y: float, mediabox_w: float) -> Tuple[float, float]:
    """Mediabox (portrait) → display (landscape). display_x = pm_y, display_y = w - pm_x."""
    return pm_y, mediabox_w - pm_x

def display_to_pm(dx: float, dy: float, mediabox_w: float) -> Tuple[float, float]:
    """Display (landscape) → mediabox (portrait). pm_x = w - dy, pm_y = dx."""
    return mediabox_w - dy, dx

def cluster_display_centroid(cluster: dict, mediabox_w: float) -> Tuple[float, float]:
    """Return the cluster centroid in display coordinates."""
    pm_cx, pm_cy = cluster["centroid"]
    return pm_to_display(pm_cx, pm_cy, mediabox_w)

def cluster_display_bbox(cluster: dict, mediabox_w: float) -> Tuple[float, float, float, float]:
    """Return cluster bbox in display coords (x0,y0,x1,y1)."""
    pm_x0, pm_y0, pm_x1, pm_y1 = cluster["bbox"]
    dx0 = pm_y0; dy0 = mediabox_w - pm_x1
    dx1 = pm_y1; dy1 = mediabox_w - pm_x0
    return dx0, dy0, dx1, dy1


# ── Preprocessing (shared with Stage E) ───────────────────────────────────────

def _color_mask(hsv: np.ndarray, bucket: str) -> np.ndarray:
    def m(lo, hi):
        return cv2.inRange(hsv, np.array(lo, np.uint8), np.array(hi, np.uint8))
    if bucket == "red":
        return cv2.bitwise_or(m([0, 110, 90], [10, 255, 255]), m([160, 110, 90], [180, 255, 255]))
    if bucket == "orange":
        return m([8, 110, 140], [22, 255, 255])
    if bucket == "yellow":
        return m([22, 90, 140], [35, 255, 255])
    if bucket == "blue":
        return m([100, 70, 70], [130, 255, 255])
    if bucket == "blue_light":
        return m([80, 55, 90], [140, 255, 255])
    if bucket == "green":
        return m([35, 55, 55], [85, 255, 255])
    if bucket == "purple":
        return m([130, 55, 55], [165, 255, 255])
    if bucket in ("black", "gray_dark"):
        return m([0, 0, 0], [180, 60, 90])
    return cv2.bitwise_not(m([0, 0, 200], [180, 30, 255]))


def preprocess_to_canny(
    bgr: np.ndarray,
    bucket: Optional[str] = None,
    prefer_center: bool = False,
) -> Optional[np.ndarray]:
    """Extract dominant contour → normalize to NORM_SIZE → Canny edges."""
    if bgr is None or bgr.size == 0:
        return None
    h, w = bgr.shape[:2]
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)

    if bucket:
        mask = _color_mask(hsv, bucket)
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k, iterations=2)
    else:
        mask = cv2.bitwise_not(
            cv2.inRange(bgr, np.array([200, 200, 200], np.uint8), np.array([255, 255, 255], np.uint8))
        )

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = [c for c in contours if cv2.contourArea(c) >= 60]

    chosen = None
    if contours:
        if prefer_center:
            cx_i, cy_i = w / 2.0, h / 2.0
            min_area = max(60, w * h * 0.01)
            pool = [c for c in contours if cv2.contourArea(c) >= min_area] or contours
            def _d(c):
                M = cv2.moments(c)
                return (M["m10"]/M["m00"] - cx_i)**2 + (M["m01"]/M["m00"] - cy_i)**2 if M["m00"] else 1e9
            chosen = min(pool, key=_d)
        else:
            chosen = max(contours, key=cv2.contourArea)

    if chosen is not None:
        x, y, cw, ch = cv2.boundingRect(chosen)
        mg = max(3, int(min(cw, ch) * 0.07))
        x  = max(0, x - mg); y = max(0, y - mg)
        cw = min(w - x, cw + 2*mg); ch = min(h - y, ch + 2*mg)
        crop = bgr[y:y+ch, x:x+cw]
    else:
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 238, 255, cv2.THRESH_BINARY_INV)
        nz = cv2.findNonZero(thresh)
        crop = bgr[nz[...,0,1].min():nz[...,0,1].max(), nz[...,0,0].min():nz[...,0,0].max()] if nz is not None else bgr

    if crop is None or crop.size == 0 or crop.shape[0] < 5 or crop.shape[1] < 5:
        return None

    norm = cv2.resize(crop, (NORM_SIZE, NORM_SIZE), interpolation=cv2.INTER_AREA)
    gray_n = cv2.cvtColor(norm, cv2.COLOR_BGR2GRAY)
    return cv2.Canny(gray_n, CANNY_LOW, CANNY_HIGH)


# ── Legend template loading ────────────────────────────────────────────────────

def load_legend_templates(legend_rows: list, icons_dir: Path) -> List[Dict]:
    """
    Load and preprocess legend icon crops.
    Returns list of template dicts with Canny edge arrays.
    """
    templates = []
    for row in legend_rows:
        idx = row["row_index"]
        icon_path = icons_dir / f"row_{idx:03d}.png"
        if not icon_path.exists():
            continue
        bgr = cv2.imread(str(icon_path))
        if bgr is None:
            continue

        # Check there's enough content to match (filter near-empty rows)
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        non_white = int(np.sum(gray < 240))
        if non_white < 200:   # virtually empty — separator or near-blank row
            continue

        edges = preprocess_to_canny(bgr, bucket=None, prefer_center=False)
        if edges is None:
            continue

        templates.append({
            "row_index":   idx,
            "icon_path":   str(icon_path),
            "edges":       edges,
            "non_white_px": non_white,
            "sign_code":   row.get("sign_code"),
            "hebrew_label": row.get("hebrew_label"),
        })

    print(f"  Loaded {len(templates)} legend templates (of {len(legend_rows)} rows)")
    return templates


# ── PDF crop rendering ─────────────────────────────────────────────────────────

def _render_display_rect(page: fitz.Page, dx0: float, dy0: float,
                         dx1: float, dy1: float) -> Optional[np.ndarray]:
    """Render a rectangle defined in display (page) coordinates at RENDER_DPI."""
    clip = fitz.Rect(dx0, dy0, dx1, dy1) & page.rect
    if clip.is_empty or clip.width < 4 or clip.height < 4:
        return None
    scale = RENDER_DPI / 72.0
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=clip, colorspace=fitz.csRGB)
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def render_cluster_crop(page: fitz.Page, cluster: dict, mediabox_w: float,
                        padding: float = CLUSTER_PADDING_PTS) -> Optional[np.ndarray]:
    """Render a tight crop around a cluster's display bbox for legend matching."""
    dx0, dy0, dx1, dy1 = cluster_display_bbox(cluster, mediabox_w)
    return _render_display_rect(page, dx0 - padding, dy0 - padding, dx1 + padding, dy1 + padding)


def render_code_crop(page: fitz.Page, cluster: dict, mediabox_w: float,
                     padding: float = CODE_CROP_PADDING_PTS) -> Optional[np.ndarray]:
    """Render a wide crop (centroid ± padding) for Vision API sign-code reading."""
    dcx, dcy = cluster_display_centroid(cluster, mediabox_w)
    return _render_display_rect(page, dcx - padding, dcy - padding, dcx + padding, dcy + padding)


# ── Legend matching ────────────────────────────────────────────────────────────

def match_cluster_to_legend(
    cluster_bgr: np.ndarray,
    cluster: dict,
    templates: List[Dict],
) -> List[Dict]:
    """
    Match a cluster crop against all legend templates.
    Returns ranked matches: [{row_index, icon_path, score, tier}, …].
    """
    bucket = cluster.get("dominant_color", "other")
    cluster_edges = preprocess_to_canny(cluster_bgr, bucket=bucket, prefer_center=True)
    if cluster_edges is None:
        return []

    scores = []
    for tmpl in templates:
        val = cv2.matchTemplate(cluster_edges, tmpl["edges"], cv2.TM_CCOEFF_NORMED)[0][0]
        if val >= LEGEND_MATCH_THRESHOLD:
            if val >= LEGEND_MATCH_TIER_HIGH:
                tier = "high"
            elif val >= LEGEND_MATCH_TIER_MEDIUM:
                tier = "medium"
            else:
                tier = "low"
            scores.append({
                "row_index":   tmpl["row_index"],
                "icon_path":   tmpl["icon_path"],
                "score":       round(float(val), 4),
                "tier":        tier,
                "sign_code":   tmpl["sign_code"],
                "hebrew_label": tmpl["hebrew_label"],
            })

    scores.sort(key=lambda s: -s["score"])
    return scores[:5]  # top-5


# ── Vision API ─────────────────────────────────────────────────────────────────

def _api_key_available() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY", "").strip())


def call_vision_api(crop_bgr: np.ndarray, occ_id: str) -> Optional[Dict]:
    """
    Send a crop to Claude Vision and extract sign-code candidates.
    Returns vision result dict, or None on failure.
    """
    _, buf = cv2.imencode(".png", crop_bgr)
    b64 = base64.standard_b64encode(buf.tobytes()).decode("utf-8")

    try:
        import anthropic
    except ImportError:
        return None

    try:
        client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        msg = client.messages.create(
            model=VISION_MODEL,
            max_tokens=300,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}},
                    {"type": "text", "text": VISION_PROMPT},
                ],
            }],
        )
        raw = msg.content[0].text.strip()
        # Strip markdown fences if present
        raw = re.sub(r"^```(?:json)?", "", raw).rstrip("`").strip()
        result = json.loads(raw)
        result["occ_id"] = occ_id
        result["vision_model"] = VISION_MODEL
        return result
    except Exception as e:
        return {"error": str(e), "occ_id": occ_id, "code_candidates": [], "overall_notes": f"vision_error: {e}"}


# ── Pole assembly grouping ─────────────────────────────────────────────────────

def _centroid_distance(a: dict, b: dict) -> float:
    """Euclidean distance between display centroids."""
    return math.hypot(a["_dcx"] - b["_dcx"], a["_dcy"] - b["_dcy"])


def _is_ambiguous_grouping(occ_a: dict, occ_b: dict) -> bool:
    """
    Check if grouping two occurrences into one pole is ambiguous.

    Ambiguity signals:
    - Both are far apart (distance 40-50pt = within threshold but borderline)
    - Offset is primarily horizontal (not vertical stacking pattern)
    - They have different non-null sign codes (would imply two different signs on one pole — possible but flag it)
    """
    dist = _centroid_distance(occ_a, occ_b)
    dx   = abs(occ_a["_dcx"] - occ_b["_dcx"])
    dy   = abs(occ_a["_dcy"] - occ_b["_dcy"])

    if POLE_GROUPING_VERTICAL_BIAS:
        # Primarily horizontal offset is suspicious for same-pole grouping
        if dx > dy * 1.5 and dist > POLE_GROUPING_RADIUS_PTS * 0.6:
            return True

    # If both have distinct confirmed codes they CAN be on one pole — not necessarily ambiguous
    return False


def group_into_pole_assemblies(occurrences: List[Dict], mediabox_w: float) -> List[Dict]:
    """
    Group sign occurrences into pole assemblies using configurable parameters.

    Returns updated occurrences with physical_location_id, pole_group_id,
    assembly_id, sign_plate_id fields populated.
    """
    # Attach display centroids for distance computation
    for occ in occurrences:
        cluster = occ.get("_cluster", {})
        dcx, dcy = cluster_display_centroid(cluster, mediabox_w)
        occ["_dcx"] = dcx
        occ["_dcy"] = dcy

    n = len(occurrences)
    # Union-Find for grouping
    parent = list(range(n))
    ambiguous_pairs = set()

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        parent[find(i)] = find(j)

    for i in range(n):
        for j in range(i + 1, n):
            dist = _centroid_distance(occurrences[i], occurrences[j])
            if dist <= POLE_GROUPING_RADIUS_PTS:
                if POLE_GROUPING_AMBIGUITY_FLAG and _is_ambiguous_grouping(occurrences[i], occurrences[j]):
                    ambiguous_pairs.add((i, j))
                union(i, j)

    # Build groups
    groups: Dict[int, List[int]] = defaultdict(list)
    for i in range(n):
        groups[find(i)].append(i)

    pole_counter = 0
    for root, members in sorted(groups.items()):
        pole_counter += 1
        pole_id = f"POLE-{pole_counter:03d}"
        loc_id  = f"LOC-{pole_counter:03d}"

        # Sub-group into assemblies (for now: all members of a pole = one assembly)
        assy_id = f"ASSY-{pole_counter:03d}-A"

        any_ambiguous = any(
            (i, j) in ambiguous_pairs or (j, i) in ambiguous_pairs
            for idx_i, i in enumerate(members)
            for j in members[idx_i+1:]
        )
        large_assembly = len(members) > POLE_GROUPING_MAX_SIGNS

        for plate_num, idx in enumerate(members, 1):
            occ = occurrences[idx]
            plate_id = f"PLATE-{pole_counter:03d}-{plate_num:02d}"
            occ["physical_location_id"] = loc_id
            occ["pole_group_id"]        = pole_id
            occ["assembly_id"]          = assy_id
            occ["sign_plate_id"]        = plate_id

            if any_ambiguous:
                occ["grouping_ambiguous"] = True
                occ["requires_review"]    = True
                if "grouping_ambiguous" not in occ["contradiction_flags"]:
                    occ["contradiction_flags"].append("grouping_ambiguous")
            if large_assembly:
                occ["grouping_large_assembly"] = True
                occ["requires_review"] = True
                if "large_assembly" not in occ["contradiction_flags"]:
                    occ["contradiction_flags"].append("large_assembly")

    print(f"  Grouped {n} occurrences into {pole_counter} pole locations")
    return occurrences, pole_counter


# ── Noise classification ───────────────────────────────────────────────────────

def classify_execution_relevance(cluster: dict) -> str:
    """
    Rough classification of whether a cluster is execution-relevant or background.

    Returns: 'execution_relevant' | 'contextual_background' | 'uncertain'
    """
    ctype = cluster.get("cluster_type", "")
    color = cluster.get("dominant_color", "other")
    bw    = cluster.get("bbox_w_pts", 0)
    bh    = cluster.get("bbox_h_pts", 0)
    members = cluster.get("member_count", 1)
    long_side = max(bw, bh)
    aspect    = long_side / max(min(bw, bh), 0.1)

    # Large horizontal stripes = road markings (execution-relevant)
    if ctype == "road_marking_stripe" and color in ("yellow", "black", "gray_dark"):
        return "execution_relevant"

    # Large structures could be buildings / road geometry (contextual)
    if ctype == "large_structure":
        return "contextual_background"

    # Micro noise = background
    if ctype == "micro_noise":
        return "contextual_background"

    # Colored sign-like shapes = likely execution-relevant
    if ctype in ("sign_symbol", "compact_symbol") and color in ("red", "blue", "orange", "yellow", "green"):
        return "execution_relevant"

    # Multi-symbol = uncertain (could be sign assembly or building detail)
    if ctype == "multi_symbol":
        return "uncertain"

    # Symbol fragments — probably sign components
    if ctype == "symbol_fragment" and color in ("red", "blue", "orange"):
        return "execution_relevant"

    # Gray/light symbol fragments = background geometry
    if color in ("gray_mid", "gray_light", "gray_dark"):
        return "contextual_background"

    return "uncertain"


def generate_noise_report(all_clusters: List[Dict]) -> Dict:
    """Classify all clusters and produce noise report."""
    execution, background, uncertain = [], [], []
    for cl in all_clusters:
        rel = classify_execution_relevance(cl)
        entry = {
            "cluster_id":   cl["id"],
            "cluster_type": cl["cluster_type"],
            "dominant_color": cl["dominant_color"],
            "bbox_w":       cl["bbox_w_pts"],
            "bbox_h":       cl["bbox_h_pts"],
            "member_count": cl["member_count"],
        }
        if rel == "execution_relevant":
            execution.append(entry)
        elif rel == "contextual_background":
            background.append(entry)
        else:
            uncertain.append(entry)

    color_counts = Counter(cl["dominant_color"] for cl in all_clusters)
    type_counts  = Counter(cl["cluster_type"] for cl in all_clusters)

    return {
        "label": "RESEARCH — Noise Classification Report",
        "note": "Automated classification — must be reviewed by human before operational use",
        "total_clusters": len(all_clusters),
        "execution_relevant_count": len(execution),
        "contextual_background_count": len(background),
        "uncertain_count": len(uncertain),
        "execution_relevant_categories": [
            "תמרורים (traffic signs)",
            "סימוני כביש (road markings — road_marking_stripe clusters)",
            "מספרי תמרורים (sign code numbers — vision extraction pending)",
        ],
        "background_categories": [
            "large_structure clusters (may be buildings, road geometry)",
            "micro_noise clusters",
            "gray-fill symbol_fragment clusters (road outlines, background geometry)",
        ],
        "teaching_loop_note": (
            "Uncertain objects below are candidates for the future 'תרגול ולמידה' feature: "
            "a human expert can attach a plan crop and classify it, creating a reusable "
            "interpretation rule for future scans. Rule types: interpretation_rule, "
            "ignore_rule, quantity_rule, association_rule, notation_rule."
        ),
        "color_breakdown": dict(color_counts.most_common()),
        "type_breakdown": dict(type_counts.most_common()),
        "execution_relevant": execution,
        "contextual_background": background,
        "uncertain": uncertain,
        "human_confirmation_needed": True,
    }


# ── Debug overlays ─────────────────────────────────────────────────────────────

_TIER_BGR = {
    "high":    (0, 220, 0),
    "medium":  (0, 165, 255),
    "low":     (0, 0, 255),
    "uncertain": (160, 160, 160),
    "no_match":  (80, 80, 80),
}

def build_inventory_overlay(page: fitz.Page, occurrences: List[Dict], mediabox_w: float) -> np.ndarray:
    """Render full page at 20% scale with sign inventory annotations."""
    SCALE = 0.20
    pix = page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), colorspace=fitz.csRGB)
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    img = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)

    for occ in occurrences:
        cl = occ.get("_cluster", {})
        dx0, dy0, dx1, dy1 = cluster_display_bbox(cl, mediabox_w)

        tier = occ.get("visual_match_tier", "uncertain")
        color = _TIER_BGR.get(tier, (160, 160, 160))

        sx0, sy0 = int(dx0*SCALE), int(dy0*SCALE)
        sx1, sy1 = int(dx1*SCALE), int(dy1*SCALE)
        cv2.rectangle(img, (sx0, sy0), (sx1, sy1), color, 1)

        code = occ.get("selected_sign_code") or ""
        row  = occ.get("matched_legend_row", "?")
        label = f"L{row}" + (f"/{code}" if code else "")
        font  = cv2.FONT_HERSHEY_SIMPLEX
        fscale = 0.22
        (tw, th), _ = cv2.getTextSize(label, font, fscale, 1)
        ly = max(sy0 - 1, th + 1)
        cv2.rectangle(img, (sx0, ly - th - 1), (sx0 + tw + 2, ly + 2), color, -1)
        cv2.putText(img, label, (sx0 + 1, ly), font, fscale, (255, 255, 255), 1, cv2.LINE_AA)

    # Legend
    legend_items = [("high", "High legend match"), ("medium", "Medium"), ("low", "Low"), ("uncertain", "Uncertain")]
    for li, (tier, label) in enumerate(legend_items):
        color = _TIER_BGR[tier]
        lx, ly = 5, 5 + li * 12
        cv2.rectangle(img, (lx, ly), (lx+8, ly+8), color, -1)
        cv2.putText(img, label, (lx+10, ly+7), cv2.FONT_HERSHEY_SIMPLEX, 0.22, (0,0,0), 1)

    return img


def build_pole_grouping_overlay(page: fitz.Page, occurrences: List[Dict], mediabox_w: float) -> np.ndarray:
    """Render full page at 20% scale showing pole grouping circles."""
    SCALE = 0.20
    RADIUS_SCALED = int(POLE_GROUPING_RADIUS_PTS * SCALE)

    pix = page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), colorspace=fitz.csRGB)
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    img = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)

    # Draw grouping radius for each occurrence
    drawn_poles = {}
    for occ in occurrences:
        dcx, dcy = occ.get("_dcx", 0), occ.get("_dcy", 0)
        sx, sy = int(dcx * SCALE), int(dcy * SCALE)
        pole_id = occ.get("pole_group_id", "?")

        # Assign color per pole
        if pole_id not in drawn_poles:
            hue = (len(drawn_poles) * 47) % 180
            color_hsv = np.array([[[hue, 200, 200]]], dtype=np.uint8)
            color = tuple(int(c) for c in cv2.cvtColor(color_hsv, cv2.COLOR_HSV2BGR)[0][0])
            drawn_poles[pole_id] = color
        else:
            color = drawn_poles[pole_id]

        # Draw centroid dot + grouping radius circle
        cv2.circle(img, (sx, sy), 3, color, -1)
        cv2.circle(img, (sx, sy), RADIUS_SCALED, color, 1)

        # Mark ambiguous grouping
        if occ.get("grouping_ambiguous"):
            cv2.circle(img, (sx, sy), RADIUS_SCALED + 2, (0, 0, 255), 1)

        # Label with pole id
        cv2.putText(img, pole_id[-3:], (sx+4, sy-4), cv2.FONT_HERSHEY_SIMPLEX, 0.22, color, 1)

    cv2.putText(img, f"RESEARCH — Pole grouping radius={POLE_GROUPING_RADIUS_PTS:.0f}pt — visual review required",
                (5, img.shape[0] - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.28, (0, 0, 200), 1)
    return img


# ── Markdown report ────────────────────────────────────────────────────────────

def write_inventory_report(
    occurrences: List[Dict],
    n_poles: int,
    n_templates: int,
    pdf_path: str,
    vision_available: bool,
    legend_quantities: Dict,
    map_counts: Dict,
) -> Path:
    tier_counts = Counter(occ.get("visual_match_tier", "no_match") for occ in occurrences)
    n_review    = sum(1 for occ in occurrences if occ.get("requires_review"))
    n_vision    = sum(1 for occ in occurrences if occ.get("sign_code_source") == "vision_api")
    n_pending   = sum(1 for occ in occurrences if occ.get("sign_code_source") == "pending_vision_configuration")

    lines = [
        "# Stage G v1 — Sign Inventory Report",
        "",
        "**STATUS: RESEARCH ONLY — DO NOT USE FOR ORDERS, BILLING, OR FIELD PREPARATION**",
        "",
        f"**PDF:** `{pdf_path}`  ",
        f"**Date:** 2026-05-19  ",
        f"**Vision API available:** {'Yes' if vision_available else 'No (ANTHROPIC_API_KEY not set)'}",
        "",
        "---",
        "",
        "## Summary",
        "",
        "| Metric | Count |",
        "|---|---|",
        f"| Legend templates loaded | {n_templates} |",
        f"| Cluster candidates evaluated | {len(occurrences)} |",
        f"| Legend match — high tier | {tier_counts.get('high', 0)} |",
        f"| Legend match — medium tier | {tier_counts.get('medium', 0)} |",
        f"| Legend match — low tier | {tier_counts.get('low', 0)} |",
        f"| No legend match | {tier_counts.get('no_match', 0) + tier_counts.get('uncertain', 0)} |",
        f"| Pole groups identified | {n_poles} |",
        f"| Sign plate occurrences | {len(occurrences)} |",
        f"| Vision codes extracted | {n_vision} |",
        f"| Pending vision (no API key) | {n_pending} |",
        f"| Requires human review | {n_review} |",
        "",
        "---",
        "",
        "## Quantity Model",
        "",
        "| Layer | Value | Source |",
        "|---|---|---|",
        f"| Physical poles / locations | {n_poles} | Spatial grouping (radius={POLE_GROUPING_RADIUS_PTS:.0f}pt) |",
        f"| Sign plate occurrences | {len(occurrences)} | Stage 4 clusters + legend matching |",
        f"| Unique sign codes identified | {len(set(occ['selected_sign_code'] for occ in occurrences if occ.get('selected_sign_code')))} | Vision API |",
        f"| Legend-declared quantities | {len(legend_quantities)} code types | Stage F (pending Vision) |",
        f"| Reconciled quantities | pending | Requires human review + Vision API |",
        "",
        "**Note:** Legend-declared כמות quantities require Vision API for extraction (ANTHROPIC_API_KEY not set).",
        "",
        "---",
        "",
        "## Top Legend Matches",
        "",
    ]

    high_matches = sorted(
        [occ for occ in occurrences if occ.get("visual_match_tier") == "high"],
        key=lambda o: -o.get("legend_match_score", 0)
    )
    medium_matches = sorted(
        [occ for occ in occurrences if occ.get("visual_match_tier") == "medium"],
        key=lambda o: -o.get("legend_match_score", 0)
    )

    for section_label, section_occs in [("High", high_matches[:10]), ("Medium", medium_matches[:10])]:
        lines.append(f"### {section_label} tier")
        lines.append("")
        if section_occs:
            lines.append("| ID | Cluster | Color | Legend row | Score | Code | Pole | Review |")
            lines.append("|---|---|---|---|---|---|---|---|")
            for occ in section_occs:
                lines.append(
                    f"| {occ['occurrence_id']} "
                    f"| {occ['cluster_id']} "
                    f"| {occ.get('dominant_color','')} "
                    f"| row_{occ.get('matched_legend_row','?'):03d} "
                    f"| {occ.get('legend_match_score',0):.3f} "
                    f"| {occ.get('selected_sign_code') or 'pending'} "
                    f"| {occ.get('pole_group_id','?')} "
                    f"| {'⚠' if occ.get('requires_review') else '✓'} |"
                )
        else:
            lines.append("_(none)_")
        lines.append("")

    lines += [
        "---",
        "",
        "## Key Findings and Limitations",
        "",
        "1. **Sign code reading:** ANTHROPIC_API_KEY not configured — all sign codes are"
        " `pending_vision_configuration`. Run with API key to read sign codes from map crops.",
        "",
        "2. **Legend matching quality:** Using plan-specific legend icon crops (same CAD style)"
        " should produce higher scores than Stage E catalog matching."
        f" Threshold: {LEGEND_MATCH_THRESHOLD}. Inspect debug overlay to confirm.",
        "",
        "3. **Pole grouping:** Configurable radius={POLE_GROUPING_RADIUS_PTS:.0f}pt."
        " Dense intersections may cause incorrect merging — **review pole_grouping_debug_overlay.png**.",
        "",
        "4. **Legend region exclusion:** Clusters within the plan legend region are excluded"
        " from sign inventory to avoid counting legend icons as map occurrences.",
        "",
        "5. **Symbol fragments:** `symbol_fragment` clusters are included in matching"
        " but represent partial sign shapes — match quality degrades significantly.",
        "",
        "---",
        "",
        "## Future תרגול ולמידה Teaching Opportunities",
        "",
        "Uncertain or unresolved detections below are candidates for the future human teaching loop.",
        "A human expert can attach a plan crop and provide an explanation that becomes a reusable rule.",
        "",
        "| Occurrence | Issue | Teaching rule type |",
        "|---|---|---|",
    ]

    for occ in occurrences:
        if occ.get("requires_review") and occ.get("contradiction_flags"):
            flags = ", ".join(occ["contradiction_flags"])
            rule_type = "interpretation_rule" if "no_legend_match" in flags else "association_rule"
            lines.append(f"| {occ['occurrence_id']} | {flags} | {rule_type} |")

    lines += [
        "",
        "---",
        "",
        "**RESEARCH — Not approved for operational use.**",
        "All quantities above are estimates and require human review before any downstream use.",
    ]

    path = output_path("sign_inventory_report.md")
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    pdf_path = args[0] if args else DEFAULT_PDF

    print(f"[09_stage_g_inventory] v1 — RESEARCH ONLY")
    print(f"  PDF: {pdf_path}")

    t0 = time.perf_counter()

    # ── Load inputs ────────────────────────────────────────────────────────────

    try:
        clusters_data = load_json("symbol_clusters.json")
        all_clusters  = clusters_data["clusters"]
    except Exception as e:
        print(f"  [!] Cannot load symbol_clusters.json: {e}. Run Stage 4 first."); sys.exit(1)

    try:
        vocab_data = load_json("legend_vocabulary.json")
        rows_data  = load_json("legend_rows.json")
        legend_rows = rows_data["rows"]
    except Exception as e:
        print(f"  [!] Cannot load legend outputs: {e}. Run Stage F first."); sys.exit(1)

    icons_dir = output_path("legend_icons")
    if not icons_dir.exists():
        print(f"  [!] legend_icons/ not found. Run Stage F first."); sys.exit(1)

    if not Path(pdf_path).exists():
        print(f"  [!] PDF not found: {pdf_path}"); sys.exit(1)

    doc  = fitz.open(pdf_path)
    page = doc[0]
    mediabox_w = page.mediabox.width   # portrait width (e.g. 2551 for rotation=270 page)
    print(f"  Page rect={page.rect}  mediabox_w={mediabox_w:.0f}  rotation={page.rotation}")

    # ── Load legend region bbox (to exclude legend clusters) ──────────────────

    try:
        region_data = load_json("legend_region_detection.json")
        leg_dx0, leg_dy0, leg_dx1, leg_dy1 = region_data.get("display_rect",
            [page.rect.width * 0.75, 0, page.rect.width, page.rect.height])
    except Exception:
        leg_dx0, leg_dy0, leg_dx1, leg_dy1 = page.rect.width * 0.75, 0, page.rect.width, page.rect.height

    def _in_legend(cluster):
        dcx, dcy = cluster_display_centroid(cluster, mediabox_w)
        return leg_dx0 <= dcx <= leg_dx1 and leg_dy0 <= dcy <= leg_dy1

    # ── Load legend templates ──────────────────────────────────────────────────

    templates = load_legend_templates(legend_rows, icons_dir)
    if not templates:
        print("  [!] No legend templates loaded. Check legend_icons/ directory."); sys.exit(1)

    # ── Filter candidate clusters ──────────────────────────────────────────────

    candidates = [c for c in all_clusters if c["cluster_type"] in TARGET_TYPES]
    legend_area_excluded = [c for c in candidates if _in_legend(c)]
    candidates = [c for c in candidates if not _in_legend(c)]
    print(f"  All clusters: {len(all_clusters)}  →  target types: {len(candidates) + len(legend_area_excluded)}  "
          f"→  legend area excluded: {len(legend_area_excluded)}  →  to process: {len(candidates)}")

    # ── Prepare code crops output dir ──────────────────────────────────────────

    crops_dir = output_path("stage_g_code_crops")
    crops_dir.mkdir(exist_ok=True)
    for old in crops_dir.glob("occ_*.png"):
        old.unlink()

    # ── Process candidates ─────────────────────────────────────────────────────

    vision_available = _api_key_available()
    print(f"  Vision API: {'available' if vision_available else 'NOT available (set ANTHROPIC_API_KEY)'}")
    print(f"\n  Processing {len(candidates)} candidates ...")

    occurrences = []
    map_code_counts: Dict[str, int] = defaultdict(int)

    for i, cl in enumerate(candidates):
        occ_id = f"OCC-{i+1:04d}"

        # Render tight crop for legend matching
        tight_bgr = render_cluster_crop(page, cl, mediabox_w)

        # Match against legend templates
        legend_matches = match_cluster_to_legend(tight_bgr, cl, templates) if tight_bgr is not None else []

        best_legend = legend_matches[0] if legend_matches else None
        legend_match_score = best_legend["score"] if best_legend else 0.0
        legend_match_tier  = best_legend["tier"]  if best_legend else "no_match"
        matched_legend_row = best_legend["row_index"] if best_legend else None
        matched_icon_path  = best_legend["icon_path"] if best_legend else None

        # Visual match confidence (legend-based)
        if legend_match_tier == "high":
            visual_confidence = "high"
        elif legend_match_tier == "medium":
            visual_confidence = "medium"
        elif legend_match_tier == "low":
            visual_confidence = "low"
        else:
            visual_confidence = "uncertain"

        # Render wide crop for Vision API
        code_bgr = render_code_crop(page, cl, mediabox_w)
        code_crop_path = None
        if code_bgr is not None:
            code_crop_path = str(crops_dir / f"{occ_id}.png")
            cv2.imwrite(code_crop_path, code_bgr)

        # Vision API call
        vision_result = None
        sign_code_source = "unavailable"
        sign_code_candidates = []
        selected_sign_code = None
        contradiction_flags = []
        requires_review = False

        if not legend_matches:
            requires_review = True
            contradiction_flags.append("no_legend_match")

        if vision_available and code_bgr is not None:
            vision_result = call_vision_api(code_bgr, occ_id)
            if vision_result and not vision_result.get("error"):
                sign_code_source = "vision_api"
                sign_code_candidates = vision_result.get("code_candidates", [])
                if sign_code_candidates:
                    best_code = max(sign_code_candidates, key=lambda c: c.get("confidence", 0))
                    selected_sign_code = best_code.get("code")
                    if selected_sign_code:
                        map_code_counts[selected_sign_code] += 1
                    # Check agreement with legend if legend has a code
                    legend_code = best_legend.get("sign_code") if best_legend else None
                    if legend_code and selected_sign_code and legend_code != selected_sign_code:
                        contradiction_flags.append("visual_vs_code_mismatch")
                else:
                    requires_review = True
                    contradiction_flags.append("vision_no_code_found")
            else:
                sign_code_source = "vision_error"
                requires_review = True
                contradiction_flags.append("vision_error")
        elif not vision_available:
            sign_code_source = "pending_vision_configuration"
            requires_review = True

        # Sign identity source
        if selected_sign_code:
            sign_identity_source = "vision_api + legend_match" if best_legend else "vision_api"
        elif best_legend:
            sign_identity_source = "legend_icon_match"
        else:
            sign_identity_source = "uncertain"

        # Final confidence
        if selected_sign_code and best_legend and legend_match_tier in ("high", "medium"):
            final_confidence = "medium"
        elif best_legend and legend_match_tier == "high":
            final_confidence = "low"
        else:
            final_confidence = "uncertain"

        dcx, dcy = cluster_display_centroid(cl, mediabox_w)

        occ = {
            "occurrence_id":          occ_id,
            "page_number":            0,
            "bbox":                   cl["bbox"],
            "centroid_display":       [round(dcx, 1), round(dcy, 1)],
            "cluster_id":             cl["id"],
            "cluster_type":           cl["cluster_type"],
            "dominant_color":         cl["dominant_color"],
            "cluster_confidence":     cl["confidence"],
            "cluster_member_count":   cl["member_count"],
            "matched_legend_row":     matched_legend_row,
            "matched_icon_path":      matched_icon_path,
            "legend_match_score":     round(legend_match_score, 4),
            "legend_match_all":       legend_matches[:3],
            "visual_match_tier":      legend_match_tier,
            "visual_match_confidence": visual_confidence,
            "detection_source":       "plan_specific_legend_template" if best_legend else "stage4_cluster_only",
            "local_code_crop_path":   code_crop_path,
            "sign_code_candidates":   sign_code_candidates,
            "selected_sign_code":     selected_sign_code,
            "sign_code_source":       sign_code_source,
            "sign_identity_source":   sign_identity_source,
            "physical_location_id":   None,   # filled by grouping
            "pole_group_id":          None,
            "assembly_id":            None,
            "sign_plate_id":          None,
            "association_confidence": "n/a" if not selected_sign_code else "medium",
            "final_confidence":       final_confidence,
            "contradiction_flags":    contradiction_flags,
            "requires_review":        requires_review,
            "notes":                  (
                "Vision API not configured — sign code unknown. Run with ANTHROPIC_API_KEY."
                if sign_code_source == "pending_vision_configuration" else
                f"Legend match: row_{matched_legend_row:03d} score={legend_match_score:.3f}" if best_legend else
                "No legend match found."
            ),
            "_cluster": cl,
        }
        occurrences.append(occ)

        if (i + 1) % 20 == 0 or i + 1 == len(candidates):
            matched = sum(1 for o in occurrences if o["matched_legend_row"] is not None)
            print(f"    {i+1}/{len(candidates)} processed  |  matched={matched}")

    # ── Pole grouping ──────────────────────────────────────────────────────────

    print(f"\n  Running pole assembly grouping ...")
    occurrences, n_poles = group_into_pole_assemblies(occurrences, mediabox_w)

    # ── Summarize quantities ───────────────────────────────────────────────────

    n_matched = sum(1 for occ in occurrences if occ["matched_legend_row"] is not None)
    n_vision_codes = sum(1 for occ in occurrences if occ["sign_code_source"] == "vision_api")
    n_pending = sum(1 for occ in occurrences if occ["sign_code_source"] == "pending_vision_configuration")
    n_review  = sum(1 for occ in occurrences if occ["requires_review"])
    tier_counts = Counter(occ["visual_match_tier"] for occ in occurrences)

    # Legend-declared quantities (from Stage F vocab — null if Vision not run)
    legend_quantities = {r.get("sign_code"): r.get("quantity") for r in legend_rows if r.get("sign_code")} or {}

    summary = {
        "n_legend_templates":     len(templates),
        "n_clusters_evaluated":   len(candidates),
        "n_legend_area_excluded": len(legend_area_excluded),
        "n_legend_matched":       n_matched,
        "n_code_crops_generated": sum(1 for occ in occurrences if occ["local_code_crop_path"]),
        "n_vision_codes_extracted": n_vision_codes,
        "n_pending_vision":       n_pending,
        "n_pole_groups":          n_poles,
        "n_sign_plates":          len(occurrences),
        "n_assemblies":           n_poles,  # 1 assembly per pole in v1
        "n_requires_review":      n_review,
        "tier_breakdown":         dict(tier_counts),
        "vision_api_available":   vision_available,
        "legend_declared_quantities": legend_quantities,
        "map_counted_quantities": dict(map_code_counts),
        "reconciled_quantities":  None,
        "reconciliation_status":  "pending_human_review",
        "pole_grouping_params": {
            "radius_pts":      POLE_GROUPING_RADIUS_PTS,
            "max_signs":       POLE_GROUPING_MAX_SIGNS,
            "vertical_bias":   POLE_GROUPING_VERTICAL_BIAS,
            "ambiguity_flag":  POLE_GROUPING_AMBIGUITY_FLAG,
        },
    }

    # ── Build inventory JSON (strip internal _cluster and _dcx/_dcy fields) ────

    clean_occs = []
    for occ in occurrences:
        clean = {k: v for k, v in occ.items() if not k.startswith("_")}
        clean_occs.append(clean)

    inventory = {
        "label":      "RESEARCH — Stage G v1 Sign Inventory",
        "source_pdf": pdf_path,
        "date":       "2026-05-19",
        "stage":      "G-v1",
        "parameters": {
            "render_dpi":             RENDER_DPI,
            "code_crop_padding_pts":  CODE_CROP_PADDING_PTS,
            "legend_match_threshold": LEGEND_MATCH_THRESHOLD,
            "cluster_padding_pts":    CLUSTER_PADDING_PTS,
            "pole_grouping_radius_pts": POLE_GROUPING_RADIUS_PTS,
            "pole_grouping_max_signs":  POLE_GROUPING_MAX_SIGNS,
        },
        "summary": summary,
        "occurrences": clean_occs,
    }

    jp = output_path("sign_inventory.json")
    with open(jp, "w", encoding="utf-8") as f:
        json.dump(inventory, f, indent=2, ensure_ascii=False)
    print(f"\n  JSON → {jp}  ({jp.stat().st_size // 1024} KB)")

    # ── Noise report ───────────────────────────────────────────────────────────

    noise = generate_noise_report(all_clusters)
    np_path = output_path("noise_report.json")
    with open(np_path, "w", encoding="utf-8") as f:
        json.dump(noise, f, indent=2, ensure_ascii=False)
    print(f"  Noise  → {np_path}")

    # ── Debug overlays ─────────────────────────────────────────────────────────

    print(f"  Rendering overlays ...")
    inv_overlay = build_inventory_overlay(page, occurrences, mediabox_w)
    inv_path = output_path("sign_inventory_debug_overlay.png")
    cv2.imwrite(str(inv_path), inv_overlay)
    print(f"  Overlay → {inv_path}")

    pole_overlay = build_pole_grouping_overlay(page, occurrences, mediabox_w)
    pole_path = output_path("pole_grouping_debug_overlay.png")
    cv2.imwrite(str(pole_path), pole_overlay)
    print(f"  Pole    → {pole_path}")

    # ── Markdown report ────────────────────────────────────────────────────────

    rp = write_inventory_report(
        occurrences, n_poles, len(templates),
        pdf_path, vision_available, legend_quantities, dict(map_code_counts),
    )
    print(f"  Report  → {rp}")

    doc.close()

    # ── Final summary ──────────────────────────────────────────────────────────

    elapsed = time.perf_counter() - t0
    print(f"\n  ── Stage G v1 complete ({elapsed:.1f}s) ──────────────────────────────")
    print(f"  Legend templates:      {len(templates)}")
    print(f"  Clusters evaluated:    {len(candidates)}")
    print(f"  Legend area excluded:  {len(legend_area_excluded)}")
    print(f"  Legend matched:")
    for tier in ("high", "medium", "low", "no_match"):
        print(f"    {tier:<12} {tier_counts.get(tier, 0)}")
    print(f"  Pole groups:           {n_poles}")
    print(f"  Code crops saved:      {sum(1 for occ in occurrences if occ.get('local_code_crop_path'))}")
    print(f"  Vision codes read:     {n_vision_codes}")
    print(f"  Pending vision:        {n_pending}")
    print(f"  Requires review:       {n_review}")
    print(f"\n  STATUS: RESEARCH — results require human review before operational use")
    if not vision_available:
        print(f"  NOTE: Set ANTHROPIC_API_KEY and re-run to extract sign codes from map crops")


if __name__ == "__main__":
    main()
