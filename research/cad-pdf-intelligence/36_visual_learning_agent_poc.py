#!/usr/bin/env python3
"""
36_visual_learning_agent_poc.py
================================
Engine C: Human-Trained Visual Learning Agent — POC v0.1

Rule-based learning POC. NOT ML training.

Workflow:
1. Load a plan image (rendered from PDF or direct image input).
2. Load visual_training_examples.example.json — user markings.
3. For each training example, extract a rule:
     - pole_dot     → image patch template (cv2.matchTemplate)
     - tick_mark    → line patch template
     - sign_code_text → text crop + OCR target
     - ignore_region → exclusion polygon
     - related_code_to_pole → distance+direction association rule
4. Apply rules to the page; find similar candidates.
5. For each candidate:
     - confidence ≥ 0.7 → accepted detection
     - confidence < 0.7 → emit review question + evidence crop
6. Write outputs:
     - visual_agent_candidates.json
     - visual_review_questions.json
     - visual_learning_rules.json
     - evidence_crops/*.png
     - visual_learning_agent_report.md / .html
     - templates/*.png (extracted templates per rule)

This script does NOT touch scripts 01–35 or any production code.
This script does NOT use any paid API.
This script reads but does NOT modify the source PDF.

Usage:
    .venv/bin/python 36_visual_learning_agent_poc.py \\
        --plan-run-dir runs/poc_plan_50_448_02_400_20260520_223259 \\
        --examples visual_training_examples.example.json \\
        [--page 0] [--dpi 150] [--match-threshold 0.65]

See PLAN_SCANNER_VISUAL_LEARNING_AGENT_SPEC.md for the full spec.
"""

import argparse
import base64
import json
import sys
import time
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import warnings
warnings.filterwarnings("ignore")


# --------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Engine C — Visual Learning Agent POC (rule-based, human-taught)",
    )
    p.add_argument("--plan-run-dir", required=True,
                   help="Path to the plan run directory")
    p.add_argument("--examples", required=False, default=None,
                   help="Path to visual_training_examples JSON. "
                        "Default: research/cad-pdf-intelligence/visual_training_examples.example.json")
    p.add_argument("--page", type=int, default=0,
                   help="Page index to scan (default 0)")
    p.add_argument("--dpi", type=int, default=150,
                   help="Render DPI for PDF input (default 150)")
    p.add_argument("--match-threshold", type=float, default=0.65,
                   help="Template match score threshold for pole/tick/shape (default 0.65)")
    p.add_argument("--review-threshold", type=float, default=0.7,
                   help="Confidence below this triggers a review question (default 0.7)")
    p.add_argument("--max-candidates-per-rule", type=int, default=500,
                   help="Cap candidates per rule to avoid runaway (default 500)")
    p.add_argument("--min-tick-pole-px", type=int, default=3,
                   help="Minimum tick→nearest-pole distance to be kept (default 3px). "
                        "Below this is overlap/noise.")
    p.add_argument("--max-tick-pole-px", type=int, default=80,
                   help="Maximum tick→nearest-pole distance to be kept (default 80px). "
                        "Beyond this, the line is not associable with any pole and is dropped.")
    return p.parse_args()


def log(msg: str, indent: int = 0) -> None:
    prefix = "  " * indent
    print(f"{prefix}{msg}", flush=True)


# --------------------------------------------------------------------
# Inputs: find PDF or image, load training examples
# --------------------------------------------------------------------

def find_source_pdf(run_dir: Path) -> Optional[Path]:
    """Find a PDF in run_dir/source/, /uploads/, or /."""
    for sub in ("source", "uploads", ""):
        d = run_dir / sub if sub else run_dir
        if not d.exists():
            continue
        for p in d.glob("*.pdf"):
            return p
    return None


def find_source_image(run_dir: Path) -> Optional[Path]:
    """Find a direct image input if no PDF."""
    for sub in ("source", "uploads", ""):
        d = run_dir / sub if sub else run_dir
        if not d.exists():
            continue
        for ext in ("*.png", "*.jpg", "*.jpeg", "*.tif", "*.tiff"):
            for p in d.glob(ext):
                return p
    return None


def render_or_load_page(
    run_dir: Path, page_idx: int, dpi: int, debug_dir: Path
) -> Tuple[Any, str, str, float]:
    """
    Returns: (img_bgr, page_image_path, source_kind, render_ms)
    source_kind ∈ {'pdf', 'image'}
    """
    import cv2
    import numpy as np
    debug_dir.mkdir(parents=True, exist_ok=True)

    img_path = find_source_image(run_dir)
    pdf_path = find_source_pdf(run_dir)

    if img_path is not None and pdf_path is None:
        t = time.perf_counter()
        img_bgr = cv2.imread(str(img_path))
        elapsed_ms = (time.perf_counter() - t) * 1000
        out_path = debug_dir / f"page_{page_idx}_input_image.png"
        cv2.imwrite(str(out_path), img_bgr)
        return img_bgr, str(out_path), "image", elapsed_ms

    if pdf_path is None:
        raise FileNotFoundError(
            f"No PDF or image found in {run_dir}/source/, /uploads/, or /"
        )

    import fitz
    t = time.perf_counter()
    doc = fitz.open(str(pdf_path))
    if page_idx >= len(doc):
        doc.close()
        raise IndexError(
            f"PDF has {len(doc)} pages; index {page_idx} out of range."
        )
    page = doc[page_idx]
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    doc.close()
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    if arr.shape[2] >= 3:
        img_bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    else:
        img_bgr = cv2.cvtColor(arr[:, :, 0], cv2.COLOR_GRAY2BGR)
    elapsed_ms = (time.perf_counter() - t) * 1000
    out_path = debug_dir / f"page_{page_idx}_{dpi}dpi.png"
    cv2.imwrite(str(out_path), img_bgr)
    return img_bgr, str(out_path), "pdf", elapsed_ms


def load_training_examples(examples_path: Path) -> Dict[str, Any]:
    if not examples_path.exists():
        raise FileNotFoundError(f"Training examples file not found: {examples_path}")
    with open(examples_path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    if "examples" not in data:
        raise ValueError(f"{examples_path} missing 'examples' key")
    return data


# --------------------------------------------------------------------
# Rule extraction from training examples
# --------------------------------------------------------------------

def _safe_crop(img, x0: int, y0: int, x1: int, y1: int):
    """Crop with bounds-checking; returns None if out of bounds."""
    h, w = img.shape[:2]
    x0 = max(0, min(int(x0), w - 1))
    x1 = max(x0 + 1, min(int(x1), w))
    y0 = max(0, min(int(y0), h - 1))
    y1 = max(y0 + 1, min(int(y1), h))
    if x1 <= x0 or y1 <= y0:
        return None
    return img[y0:y1, x0:x1]


def extract_rules(
    examples: List[Dict],
    img_bgr,
    templates_dir: Path,
) -> List[Dict]:
    """
    Build a list of rules from training examples.
    Each rule type extracts a different kind of template/heuristic.
    """
    import cv2
    templates_dir.mkdir(parents=True, exist_ok=True)

    rules: List[Dict] = []
    rule_counter = 0

    # ----- Pole rules -----
    # Strategy: extract a small image patch (16x16 default) around each pole_dot example,
    # then merge all pole patches into one rule (the rule "owns" all patches).
    pole_examples = [e for e in examples if e["label_type"] == "pole_dot"]
    if pole_examples:
        rule_counter += 1
        rule_id = f"r_pole_{rule_counter:03d}"
        patch_paths = []
        patch_size = 16  # half-size = 8px around the point
        for e in pole_examples:
            g = e["marking_geometry"]
            if g["type"] != "point":
                continue
            cx, cy = int(g["x"]), int(g["y"])
            patch = _safe_crop(img_bgr, cx - patch_size, cy - patch_size,
                               cx + patch_size, cy + patch_size)
            if patch is None or patch.size == 0:
                continue
            patch_path = templates_dir / f"{rule_id}_{e['training_example_id']}.png"
            cv2.imwrite(str(patch_path), patch)
            patch_paths.append({
                "training_example_id": e["training_example_id"],
                "patch_path": str(patch_path),
                "patch_size_px": [patch.shape[1], patch.shape[0]],
                "center_xy": [cx, cy],
            })
        if patch_paths:
            rules.append({
                "rule_id": rule_id,
                "label_type": "pole_dot",
                "derived_from_examples": [e["training_example_id"] for e in pole_examples],
                "scope": pole_examples[0].get("scope", "current_plan_only"),
                "template_kind": "image_patches",
                "patches": patch_paths,
                "min_match_score": 0.65,
                "search_radius_px": None,
                "association_rule": None,
            })

    # ----- Tick mark rules -----
    tick_examples = [e for e in examples if e["label_type"] == "tick_mark"]
    if tick_examples:
        rule_counter += 1
        rule_id = f"r_tick_{rule_counter:03d}"
        patches = []
        # Derive tick length and orientation from examples
        lengths = []
        for e in tick_examples:
            g = e["marking_geometry"]
            if g["type"] != "line":
                continue
            x0, y0, x1, y1 = int(g["x0"]), int(g["y0"]), int(g["x1"]), int(g["y1"])
            length = max(1, int(((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5))
            lengths.append(length)
            # Crop the tick area + padding
            xmin, xmax = min(x0, x1) - 4, max(x0, x1) + 4
            ymin, ymax = min(y0, y1) - 4, max(y0, y1) + 4
            patch = _safe_crop(img_bgr, xmin, ymin, xmax, ymax)
            if patch is None or patch.size == 0:
                continue
            patch_path = templates_dir / f"{rule_id}_{e['training_example_id']}.png"
            cv2.imwrite(str(patch_path), patch)
            patches.append({
                "training_example_id": e["training_example_id"],
                "patch_path": str(patch_path),
                "length_px": length,
                "bbox": [xmin, ymin, xmax, ymax],
            })
        if patches:
            rules.append({
                "rule_id": rule_id,
                "label_type": "tick_mark",
                "derived_from_examples": [e["training_example_id"] for e in tick_examples],
                "scope": tick_examples[0].get("scope", "current_plan_only"),
                "template_kind": "image_patches",
                "patches": patches,
                "expected_length_px": int(sum(lengths) / max(1, len(lengths))),
                "min_match_score": 0.55,
                "association_rule": None,
            })

    # ----- Sign code text rules -----
    code_examples = [e for e in examples if e["label_type"] == "sign_code_text"]
    if code_examples:
        rule_counter += 1
        rule_id = f"r_code_{rule_counter:03d}"
        regions = []
        codes_seen = []
        for e in code_examples:
            g = e["marking_geometry"]
            if g["type"] != "rectangle":
                continue
            x0, y0, x1, y1 = int(g["x0"]), int(g["y0"]), int(g["x1"]), int(g["y1"])
            patch = _safe_crop(img_bgr, x0, y0, x1, y1)
            if patch is None or patch.size == 0:
                continue
            patch_path = templates_dir / f"{rule_id}_{e['training_example_id']}.png"
            cv2.imwrite(str(patch_path), patch)
            regions.append({
                "training_example_id": e["training_example_id"],
                "patch_path": str(patch_path),
                "bbox": [x0, y0, x1, y1],
                "size_px": [x1 - x0, y1 - y0],
                "label_value": e.get("label_value", ""),
            })
            codes_seen.append(e.get("label_value", ""))
        if regions:
            rules.append({
                "rule_id": rule_id,
                "label_type": "sign_code_text",
                "derived_from_examples": [e["training_example_id"] for e in code_examples],
                "scope": code_examples[0].get("scope", "current_plan_only"),
                "template_kind": "text_regions",
                "regions": regions,
                "known_codes": [c for c in codes_seen if c],
                "min_match_score": 0.50,
                "association_rule": None,
            })

    # ----- Ignore regions -----
    ignore_examples = [e for e in examples if e["label_type"] == "ignore_region"]
    if ignore_examples:
        rule_counter += 1
        rule_id = f"r_ignore_{rule_counter:03d}"
        rects = []
        for e in ignore_examples:
            g = e["marking_geometry"]
            if g["type"] != "rectangle":
                continue
            rects.append({
                "training_example_id": e["training_example_id"],
                "bbox": [int(g["x0"]), int(g["y0"]), int(g["x1"]), int(g["y1"])],
                "label_value": e.get("label_value", ""),
            })
        if rects:
            rules.append({
                "rule_id": rule_id,
                "label_type": "ignore_region",
                "derived_from_examples": [e["training_example_id"] for e in ignore_examples],
                "scope": ignore_examples[0].get("scope", "current_plan_only"),
                "template_kind": "polygons",
                "rectangles": rects,
                "min_match_score": None,
                "association_rule": None,
            })

    # ----- Code-to-pole association rules -----
    assoc_examples = [e for e in examples if e["label_type"] == "related_code_to_pole"]
    if assoc_examples:
        rule_counter += 1
        rule_id = f"r_assoc_{rule_counter:03d}"
        distances = []
        directions = []
        for e in assoc_examples:
            g = e["marking_geometry"]
            if g["type"] != "association":
                continue
            f = g.get("from", {})
            t = g.get("to", {})
            fx, fy = float(f.get("x", 0)), float(f.get("y", 0))
            tx, ty = float(t.get("x", 0)), float(t.get("y", 0))
            d = ((fx - tx) ** 2 + (fy - ty) ** 2) ** 0.5
            distances.append(d)
            import math
            ang = math.degrees(math.atan2(ty - fy, tx - fx))
            directions.append(ang)
        if distances:
            avg_d = sum(distances) / len(distances)
            avg_dir = sum(directions) / len(directions)
            rules.append({
                "rule_id": rule_id,
                "label_type": "related_code_to_pole",
                "derived_from_examples": [e["training_example_id"] for e in assoc_examples],
                "scope": assoc_examples[0].get("scope", "current_plan_only"),
                "template_kind": "association",
                "association_rule": {
                    "from_label": "sign_code_text",
                    "to_label": "pole_dot",
                    "max_distance_px": int(avg_d * 1.8),
                    "preferred_direction_deg": round(avg_dir, 1),
                    "direction_tolerance_deg": 60,
                },
                "min_match_score": None,
            })

    # ----- Number-of-signs-on-pole rules -----
    count_examples = [e for e in examples if e["label_type"] == "number_of_signs_on_pole"]
    if count_examples:
        rule_counter += 1
        rule_id = f"r_count_{rule_counter:03d}"
        ratios = []
        for e in count_examples:
            try:
                n = int(e.get("label_value", "0"))
                ratios.append((e.get("associated_objects", []), n))
            except (TypeError, ValueError):
                pass
        if ratios:
            rules.append({
                "rule_id": rule_id,
                "label_type": "number_of_signs_on_pole",
                "derived_from_examples": [e["training_example_id"] for e in count_examples],
                "scope": count_examples[0].get("scope", "current_plan_only"),
                "template_kind": "count_mapping",
                "mappings": [{"associated_ids": ids, "sign_count": n} for ids, n in ratios],
                "rule_hint": "1 tick = 1 sign; refine via more examples",
                "min_match_score": None,
                "association_rule": None,
            })

    return rules


# --------------------------------------------------------------------
# Rule application: find candidates in the page
# --------------------------------------------------------------------

def _in_any_rect(x: int, y: int, rects: List[Dict]) -> bool:
    for r in rects:
        bb = r["bbox"]
        if bb[0] <= x <= bb[2] and bb[1] <= y <= bb[3]:
            return True
    return False


def apply_template_patches(
    img_bgr, rule: Dict, ignore_rects: List[Dict],
    match_threshold: float, max_candidates: int,
) -> Tuple[List[Dict], float]:
    """
    Run cv2.matchTemplate for each patch in the rule. Aggregate matches.
    Returns: (candidates, elapsed_ms)
    """
    import cv2
    import numpy as np

    t = time.perf_counter()
    candidates: List[Dict] = []
    patches = rule.get("patches", [])
    if not patches:
        return [], 0.0

    img_gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    threshold = max(match_threshold, rule.get("min_match_score", match_threshold))

    for patch_meta in patches:
        patch_path = patch_meta["patch_path"]
        tmpl = cv2.imread(patch_path, cv2.IMREAD_GRAYSCALE)
        if tmpl is None or tmpl.size == 0:
            continue
        th, tw = tmpl.shape[:2]
        if th < 4 or tw < 4 or th > img_gray.shape[0] or tw > img_gray.shape[1]:
            continue
        try:
            res = cv2.matchTemplate(img_gray, tmpl, cv2.TM_CCOEFF_NORMED)
        except cv2.error:
            continue
        loc_y, loc_x = np.where(res >= threshold)
        for (y, x) in zip(loc_y, loc_x):
            cx = int(x + tw / 2)
            cy = int(y + th / 2)
            if _in_any_rect(cx, cy, ignore_rects):
                continue
            score = float(res[y, x])
            candidates.append({
                "centroid": [cx, cy],
                "bbox": [int(x), int(y), int(x + tw), int(y + th)],
                "match_score": score,
                "source_patch": patch_meta["training_example_id"],
                "source_patch_path": patch_path,
            })
            if len(candidates) >= max_candidates * len(patches):
                break

    # Sort by score; dedup nearby matches (within 8px)
    candidates.sort(key=lambda c: -c["match_score"])
    deduped: List[Dict] = []
    for c in candidates:
        cx, cy = c["centroid"]
        too_close = False
        for d in deduped:
            dx, dy = d["centroid"]
            if (cx - dx) ** 2 + (cy - dy) ** 2 < 8 * 8:
                too_close = True
                break
        if not too_close:
            deduped.append(c)
        if len(deduped) >= max_candidates:
            break

    elapsed_ms = (time.perf_counter() - t) * 1000
    return deduped, elapsed_ms


def filter_ticks_by_pole_distance(
    candidates: List[Dict],
    min_dist_px: int,
    max_dist_px: int,
) -> Tuple[List[Dict], int, int]:
    """
    Tick candidates must be near a detected pole. A 'tick' that is nowhere near
    any pole is by definition not a tick (it's an unrelated short line). Drops
    tick_candidates whose nearest pole is outside [min_dist_px, max_dist_px].

    Returns:
      (filtered_candidates, n_dropped, n_kept_ticks)
    """
    poles = [c for c in candidates if c.get("candidate_type") == "pole_candidate"]
    ticks = [c for c in candidates if c.get("candidate_type") == "tick_candidate"]
    others = [c for c in candidates if c.get("candidate_type") not in ("pole_candidate", "tick_candidate")]
    if not poles:
        # No poles → no tick can be validated; drop all ticks.
        return poles + others, len(ticks), 0
    pole_pts = [(p["centroid"][0], p["centroid"][1]) for p in poles]
    kept_ticks: List[Dict] = []
    n_dropped = 0
    for t in ticks:
        tx, ty = t["centroid"]
        best = min(((tx - px) ** 2 + (ty - py) ** 2) ** 0.5 for (px, py) in pole_pts)
        if min_dist_px <= best <= max_dist_px:
            t["nearest_pole_distance_px"] = round(best, 1)
            t.setdefault("audit_notes", []).append(
                f"pole_distance_validated ({best:.0f}px in [{min_dist_px},{max_dist_px}])"
            )
            kept_ticks.append(t)
        else:
            n_dropped += 1
    return poles + kept_ticks + others, n_dropped, len(kept_ticks)


def apply_associations(
    pole_candidates: List[Dict],
    code_candidates: List[Dict],
    assoc_rules: List[Dict],
) -> int:
    """
    For each assoc rule (e.g. code → pole), link nearest candidates within
    max_distance_px and preferred direction. Adds 'associated_candidates' field.
    Returns number of associations made.
    """
    import math
    n_links = 0
    for rule in assoc_rules:
        ar = rule.get("association_rule", {})
        if not ar:
            continue
        max_d = ar.get("max_distance_px", 150)
        for code in code_candidates:
            ccx, ccy = code["centroid"]
            best = None
            best_d = float("inf")
            for pole in pole_candidates:
                px, py = pole["centroid"]
                d = ((ccx - px) ** 2 + (ccy - py) ** 2) ** 0.5
                if d > max_d:
                    continue
                if d < best_d:
                    best_d = d
                    best = pole
            if best is not None:
                code.setdefault("associated_candidates", []).append(best["candidate_id"])
                best.setdefault("associated_candidates", []).append(code["candidate_id"])
                n_links += 1
    return n_links


# --------------------------------------------------------------------
# Evidence crops + review questions
# --------------------------------------------------------------------

# Question texts keyed by candidate_type (must match values produced by the
# detection loop: pole_candidate / tick_candidate / sign_code_candidate /
# assembly_candidate / noise_candidate). Hebrew text per spec §9.
QUESTION_TEXTS = {
    "pole_candidate": {
        "he": "האם זו נקודת עמוד תמרור?",
        "en": "Is this a sign pole point?",
        "question_type": "is_pole",
        "allowed_answers": ["yes_pole", "no_noise", "no_dimension_mark", "other"],
    },
    "tick_candidate": {
        "he": "האם הקו הקטן הזה מסמן תמרור נוסף על אותו עמוד?",
        "en": "Does this short line mark an additional sign on the same pole?",
        "question_type": "is_tick_mark",
        "allowed_answers": ["yes_tick", "no_unrelated_line", "other"],
    },
    "sign_code_candidate": {
        "he": "האם המספר הזה שייך לעמוד/לתמרור?",
        "en": "Does this number belong to the pole/sign?",
        "question_type": "is_sign_code",
        "allowed_answers": ["yes_sign_code", "no_unrelated_number", "no_dimension", "other"],
    },
    "assembly_candidate": {
        "he": "האם השיוך הזה בין עמוד/מספר/תמרור נכון?",
        "en": "Is this pole/code/sign assembly correct?",
        "question_type": "is_assembly",
        "allowed_answers": ["yes_correct", "no_wrong_pole", "no_wrong_code", "no_wrong_sign", "other"],
    },
    "noise_candidate": {
        "he": "האם זה רעש/רקע שיש להתעלם ממנו?",
        "en": "Is this background noise that should be ignored?",
        "question_type": "is_noise",
        "allowed_answers": ["yes_noise", "no_real_detection", "other"],
    },
}


def save_evidence_crop(
    img_bgr, candidate: Dict, evidence_dir: Path, padding: int = 20
) -> Optional[str]:
    """Save annotated crop centered on candidate bbox. Returns relative path."""
    import cv2
    bb = candidate["bbox"]
    cx, cy = candidate["centroid"]
    x0 = max(0, bb[0] - padding)
    y0 = max(0, bb[1] - padding)
    x1 = min(img_bgr.shape[1], bb[2] + padding)
    y1 = min(img_bgr.shape[0], bb[3] + padding)
    crop = img_bgr[y0:y1, x0:x1].copy()
    if crop.size == 0:
        return None
    # Annotate: green bbox for candidate
    lcx = bb[0] - x0
    lcy = bb[1] - y0
    rcx = bb[2] - x0
    rcy = bb[3] - y0
    cv2.rectangle(crop, (lcx, lcy), (rcx, rcy), (0, 200, 0), 2)
    cv2.drawMarker(crop, (cx - x0, cy - y0), (0, 0, 255),
                   markerType=cv2.MARKER_CROSS, markerSize=12, thickness=2)
    out_path = evidence_dir / f"{candidate['candidate_id']}.png"
    cv2.imwrite(str(out_path), crop)
    return str(out_path)


def maybe_generate_review_question(
    candidate: Dict, review_threshold: float
) -> Optional[Dict]:
    if candidate.get("confidence", 0) >= review_threshold:
        return None
    cand_type = candidate.get("candidate_type", "")
    qmeta = QUESTION_TEXTS.get(cand_type)
    if not qmeta:
        # Unknown candidate type: emit a generic question but flag the source so
        # we can extend QUESTION_TEXTS rather than swallowing it silently.
        qmeta = {
            "he": "האם הזיהוי הזה תקין?",
            "en": "Is this detection valid?",
            "question_type": "is_valid_generic",
            "allowed_answers": ["yes_valid", "no_invalid", "other"],
        }
    return {
        "review_question_id": f"q_{candidate['candidate_id']}",
        "candidate_id": candidate["candidate_id"],
        "question_type": qmeta["question_type"],
        "question_text_he": qmeta["he"],
        "question_text_en": qmeta["en"],
        "evidence_crop_path": candidate.get("evidence_crop_path"),
        "crop_bbox": candidate["bbox"],
        "system_guess": candidate.get("system_guess"),
        "confidence": candidate.get("confidence"),
        "matched_rule_ids": candidate.get("matched_rule_ids", []),
        "allowed_answers": qmeta["allowed_answers"],
        "user_answer": None,
        "correction_status": "pending",
    }


# --------------------------------------------------------------------
# Main pipeline
# --------------------------------------------------------------------

def main() -> int:
    args = parse_args()

    run_dir = Path(args.plan_run_dir).resolve()
    if not run_dir.exists():
        log(f"ERROR: Run directory not found: {run_dir}")
        return 1

    # Default examples path: alongside the script
    script_dir = Path(__file__).parent
    examples_path = Path(args.examples).resolve() if args.examples else (
        script_dir / "visual_training_examples.example.json"
    )

    out_root = run_dir / "outputs" / "visual_learning_agent"
    templates_dir = out_root / "templates"
    evidence_dir = out_root / "evidence_crops"
    debug_dir = run_dir / "outputs" / "image_scan_debug"
    out_root.mkdir(parents=True, exist_ok=True)
    templates_dir.mkdir(parents=True, exist_ok=True)
    evidence_dir.mkdir(parents=True, exist_ok=True)

    log("============================================================")
    log("Engine C — Visual Learning Agent POC v0.1")
    log("============================================================")
    log(f"Run dir       : {run_dir}")
    log(f"Examples file : {examples_path}")
    log(f"Page          : {args.page}")
    log(f"DPI           : {args.dpi}")
    log(f"Match thresh  : {args.match_threshold}")
    log(f"Review thresh : {args.review_threshold}")
    log("")

    timing: Dict[str, float] = {}
    t_total = time.perf_counter()

    # 1. Load training examples
    log("Step 1: Loading training examples ...")
    try:
        training = load_training_examples(examples_path)
    except Exception as e:
        log(f"  ERROR: {e}")
        return 1
    examples = training["examples"]
    by_type: Dict[str, int] = {}
    for e in examples:
        by_type[e["label_type"]] = by_type.get(e["label_type"], 0) + 1
    log(f"  Loaded {len(examples)} examples from {examples_path.name}")
    for t, n in sorted(by_type.items()):
        log(f"    {t}: {n}", indent=1)

    # 2. Render or load page
    log(f"\nStep 2: Rendering/loading page ...")
    try:
        img_bgr, page_img_path, source_kind, render_ms = render_or_load_page(
            run_dir, args.page, args.dpi, debug_dir
        )
    except Exception as e:
        log(f"  ERROR: {e}")
        traceback.print_exc()
        return 1
    timing["render_or_load"] = render_ms
    h, w = img_bgr.shape[:2]
    log(f"  Source: {source_kind}; image size: {w}x{h}px ({render_ms:.0f}ms)")

    # Verify training examples reference compatible coordinates
    expected_dpi = training.get("image_dpi", args.dpi)
    if expected_dpi != args.dpi:
        log(f"  NOTE: training examples were authored at {expected_dpi} DPI, "
            f"running at {args.dpi} DPI — coordinates may be off-scale.")

    # 3. Extract rules
    log(f"\nStep 3: Extracting rules from training examples ...")
    t = time.perf_counter()
    try:
        rules = extract_rules(examples, img_bgr, templates_dir)
    except Exception as e:
        log(f"  ERROR extracting rules: {e}")
        traceback.print_exc()
        rules = []
    timing["rule_extraction"] = (time.perf_counter() - t) * 1000
    log(f"  Extracted {len(rules)} rules ({timing['rule_extraction']:.0f}ms)")
    for r in rules:
        log(f"    {r['rule_id']} [{r['label_type']}] from {len(r['derived_from_examples'])} examples", indent=1)

    rules_path = out_root / "visual_learning_rules.json"
    with open(rules_path, "w", encoding="utf-8") as fh:
        json.dump({
            "schema_version": "1.0",
            "plan_id": training.get("plan_id"),
            "page_number": args.page,
            "rules": rules,
        }, fh, indent=2)
    log(f"  Saved {rules_path.name}")

    # 4. Apply rules
    log(f"\nStep 4: Applying learned rules to page ...")

    # Collect ignore rectangles first
    ignore_rects: List[Dict] = []
    for r in rules:
        if r["label_type"] == "ignore_region":
            ignore_rects.extend(r.get("rectangles", []))
    log(f"  Ignore regions: {len(ignore_rects)}")

    candidates: List[Dict] = []
    candidate_counter = 0

    def new_id() -> str:
        nonlocal candidate_counter
        candidate_counter += 1
        return f"vac_p{args.page}_c{candidate_counter:04d}"

    pole_cands_for_assoc: List[Dict] = []
    code_cands_for_assoc: List[Dict] = []
    assoc_rules = [r for r in rules if r["label_type"] == "related_code_to_pole"]

    # Apply each detection rule
    for rule in rules:
        lt = rule["label_type"]
        if lt == "pole_dot":
            log(f"  Applying pole rule {rule['rule_id']} ...", indent=1)
            cands, ms = apply_template_patches(
                img_bgr, rule, ignore_rects,
                args.match_threshold, args.max_candidates_per_rule
            )
            log(f"    {len(cands)} candidates ({ms:.0f}ms)", indent=2)
            for c in cands:
                cid = new_id()
                cand = {
                    "candidate_id": cid,
                    "candidate_type": "pole_candidate",
                    "page_number": args.page,
                    "bbox": c["bbox"],
                    "centroid": c["centroid"],
                    "geometry": {
                        "type": "point",
                        "x": c["centroid"][0],
                        "y": c["centroid"][1],
                        "radius": 8,
                    },
                    "system_guess": "pole",
                    "confidence": round(c["match_score"], 3),
                    "learned_from_examples": rule["derived_from_examples"],
                    "matched_rule_ids": [rule["rule_id"]],
                    "associated_candidates": [],
                    "source_patch": c["source_patch"],
                    "audit_notes": [],
                }
                candidates.append(cand)
                pole_cands_for_assoc.append(cand)
            timing.setdefault("apply_pole", 0)
            timing["apply_pole"] += ms

        elif lt == "tick_mark":
            log(f"  Applying tick rule {rule['rule_id']} ...", indent=1)
            cands, ms = apply_template_patches(
                img_bgr, rule, ignore_rects,
                args.match_threshold * 0.85, args.max_candidates_per_rule
            )
            log(f"    {len(cands)} candidates ({ms:.0f}ms)", indent=2)
            for c in cands:
                cid = new_id()
                candidates.append({
                    "candidate_id": cid,
                    "candidate_type": "tick_candidate",
                    "page_number": args.page,
                    "bbox": c["bbox"],
                    "centroid": c["centroid"],
                    "geometry": {"type": "line_region", "bbox": c["bbox"]},
                    "system_guess": "tick",
                    "confidence": round(c["match_score"], 3),
                    "learned_from_examples": rule["derived_from_examples"],
                    "matched_rule_ids": [rule["rule_id"]],
                    "associated_candidates": [],
                    "source_patch": c["source_patch"],
                    "audit_notes": [],
                })
            timing.setdefault("apply_tick", 0)
            timing["apply_tick"] += ms

        elif lt == "sign_code_text":
            log(f"  Applying code-text rule {rule['rule_id']} ...", indent=1)
            # For sign code, do template matching on small text regions.
            # Build a synthetic rule with patches key.
            synth = dict(rule)
            synth["patches"] = [
                {
                    "training_example_id": r["training_example_id"],
                    "patch_path": r["patch_path"],
                    "patch_size_px": r["size_px"],
                }
                for r in rule.get("regions", [])
            ]
            cands, ms = apply_template_patches(
                img_bgr, synth, ignore_rects,
                args.match_threshold * 0.85, args.max_candidates_per_rule
            )
            log(f"    {len(cands)} candidates ({ms:.0f}ms)", indent=2)
            for c in cands:
                cid = new_id()
                cand = {
                    "candidate_id": cid,
                    "candidate_type": "sign_code_candidate",
                    "page_number": args.page,
                    "bbox": c["bbox"],
                    "centroid": c["centroid"],
                    "geometry": {"type": "rectangle", "bbox": c["bbox"]},
                    "system_guess": "sign_code_text",
                    "confidence": round(c["match_score"], 3),
                    "learned_from_examples": rule["derived_from_examples"],
                    "matched_rule_ids": [rule["rule_id"]],
                    "associated_candidates": [],
                    "source_patch": c["source_patch"],
                    "audit_notes": [],
                }
                candidates.append(cand)
                code_cands_for_assoc.append(cand)
            timing.setdefault("apply_code", 0)
            timing["apply_code"] += ms

    # 4b. Validate ticks by distance to nearest pole.
    # A 'tick' that is nowhere near a detected pole is not a tick.
    log(f"\nStep 4b: Validating tick candidates by pole distance "
        f"[{args.min_tick_pole_px}..{args.max_tick_pole_px}px] ...")
    t_tick_filter = time.perf_counter()
    n_ticks_before = sum(1 for c in candidates if c.get("candidate_type") == "tick_candidate")
    candidates, n_dropped_ticks, n_kept_ticks = filter_ticks_by_pole_distance(
        candidates, args.min_tick_pole_px, args.max_tick_pole_px,
    )
    timing["tick_distance_filter"] = (time.perf_counter() - t_tick_filter) * 1000
    log(f"  Before: {n_ticks_before} ticks; after: {n_kept_ticks}; dropped: {n_dropped_ticks}")

    # Apply associations
    log(f"\nStep 5: Applying associations ...")
    t_assoc = time.perf_counter()
    n_links = apply_associations(pole_cands_for_assoc, code_cands_for_assoc, assoc_rules)
    timing["associations"] = (time.perf_counter() - t_assoc) * 1000
    log(f"  Linked {n_links} code↔pole pairs ({timing['associations']:.0f}ms)")

    # 6. Evidence crops + review questions
    log(f"\nStep 6: Generating evidence crops & review questions ...")
    t_evid = time.perf_counter()
    review_questions: List[Dict] = []
    crops_saved = 0
    for cand in candidates:
        crop_path = save_evidence_crop(img_bgr, cand, evidence_dir)
        if crop_path:
            cand["evidence_crop_path"] = crop_path
            crops_saved += 1
        # Boost confidence if associated with another candidate
        if cand.get("associated_candidates"):
            cand["confidence"] = min(1.0, round(cand["confidence"] * 1.15, 3))
        cand["requires_review"] = cand["confidence"] < args.review_threshold
        q = maybe_generate_review_question(cand, args.review_threshold)
        if q:
            cand["review_question"] = q["review_question_id"]
            review_questions.append(q)
        else:
            cand["review_question"] = None
    timing["evidence"] = (time.perf_counter() - t_evid) * 1000
    log(f"  Evidence crops saved: {crops_saved}")
    log(f"  Review questions generated: {len(review_questions)}")

    # 7. Write outputs
    log(f"\nStep 7: Writing outputs ...")

    cand_path = out_root / "visual_agent_candidates.json"
    with open(cand_path, "w", encoding="utf-8") as fh:
        json.dump({
            "schema_version": "1.0",
            "plan_id": training.get("plan_id"),
            "page_number": args.page,
            "image_path": page_img_path,
            "image_size_px": [w, h],
            "image_dpi": args.dpi,
            "candidates": candidates,
        }, fh, indent=2)
    log(f"  Saved {cand_path.name} ({len(candidates)} candidates)")

    q_path = out_root / "visual_review_questions.json"
    with open(q_path, "w", encoding="utf-8") as fh:
        json.dump({
            "schema_version": "1.0",
            "plan_id": training.get("plan_id"),
            "page_number": args.page,
            "questions": review_questions,
        }, fh, indent=2)
    log(f"  Saved {q_path.name} ({len(review_questions)} questions)")

    # 8. Reports
    total_elapsed_s = time.perf_counter() - t_total
    high_conf = sum(1 for c in candidates if c["confidence"] >= args.review_threshold)
    low_conf = sum(1 for c in candidates if c["confidence"] < args.review_threshold)
    cands_by_type: Dict[str, int] = {}
    for c in candidates:
        ct = c["candidate_type"]
        cands_by_type[ct] = cands_by_type.get(ct, 0) + 1

    write_reports(
        out_root=out_root,
        run_dir=run_dir,
        training=training,
        rules=rules,
        candidates=candidates,
        review_questions=review_questions,
        timing=timing,
        total_elapsed_s=total_elapsed_s,
        crops_saved=crops_saved,
        cands_by_type=cands_by_type,
        high_conf=high_conf,
        low_conf=low_conf,
        n_links=n_links,
        page_img_path=page_img_path,
        args=args,
    )

    # 8b. Compact evidence inspection package — top 20 per type + all associations,
    # designed for human-eye review before any full UI is built.
    log(f"\nStep 8: Writing evidence inspection package ...")
    write_evidence_inspection_package(
        out_root=out_root,
        candidates=candidates,
        review_questions=review_questions,
        training=training,
        rules=rules,
        page_img_path=page_img_path,
        args=args,
    )

    log("")
    log("============================================================")
    log("DONE — Engine C POC v0.1.1 (bug fixes + inspection package)")
    log("============================================================")
    log(f"  Training examples loaded : {len(examples)} ({len(by_type)} types)")
    log(f"  Rules extracted          : {len(rules)}")
    log(f"  Candidates produced      : {len(candidates)}")
    for ct, n in sorted(cands_by_type.items()):
        log(f"    {ct}: {n}", indent=2)
    log(f"  High-confidence (≥{args.review_threshold}) : {high_conf}")
    log(f"  Requires review (<{args.review_threshold}) : {low_conf}")
    log(f"  Code↔pole associations   : {n_links}")
    log(f"  Evidence crops           : {crops_saved}")
    log(f"  Review questions         : {len(review_questions)}")
    log(f"  Total elapsed            : {total_elapsed_s:.1f}s")
    log("")
    log("  Output files:")
    log(f"    outputs/visual_learning_agent/visual_agent_candidates.json")
    log(f"    outputs/visual_learning_agent/visual_review_questions.json")
    log(f"    outputs/visual_learning_agent/visual_learning_rules.json")
    log(f"    outputs/visual_learning_agent/evidence_crops/  ({crops_saved} crops)")
    log(f"    outputs/visual_learning_agent/templates/")
    log(f"    outputs/visual_learning_agent/visual_learning_agent_report.md")
    log(f"    outputs/visual_learning_agent/visual_learning_agent_report.html")
    log(f"    outputs/visual_learning_agent/top_evidence_review.json")
    log(f"    outputs/visual_learning_agent/top_evidence_review.html")
    log("")
    log("  STATUS: Algorithmic POC output — NOT human validated.")
    log("")
    log("  Honest framing:")
    log("    This POC is rule-based template matching from human markings.")
    log("    It is NOT a trained ML model. Generalization across plans is")
    log("    limited to pixel-similarity + proximity rules. ML upgrade is")
    log("    a Phase 2 goal once enough labeled examples accumulate.")
    log("    Human corrections improve detection only — NOT BOQ approval.")
    return 0


# --------------------------------------------------------------------
# Reports
# --------------------------------------------------------------------

def write_reports(
    out_root: Path,
    run_dir: Path,
    training: Dict,
    rules: List[Dict],
    candidates: List[Dict],
    review_questions: List[Dict],
    timing: Dict[str, float],
    total_elapsed_s: float,
    crops_saved: int,
    cands_by_type: Dict[str, int],
    high_conf: int,
    low_conf: int,
    n_links: int,
    page_img_path: str,
    args,
) -> None:
    """Write MD + HTML reports for Engine C run."""

    md = [
        f"# Engine C — Visual Learning Agent Report (POC v0.1)",
        "",
        f"**Run dir:** `{run_dir}`",
        f"**Plan ID:** `{training.get('plan_id', 'unknown')}`",
        f"**Page:** {args.page}",
        f"**DPI:** {args.dpi}",
        f"**Source kind:** {'image' if 'image' in page_img_path else 'pdf'}",
        f"**Match threshold:** {args.match_threshold}",
        f"**Review threshold:** {args.review_threshold}",
        "",
        "> ⚠ **STATUS: Algorithmic POC output — NOT human validated.**",
        "> The counts and confidences below are pixel-similarity scores from template",
        "> matching. They have not been confirmed against the real plan by a human reviewer.",
        "> Do NOT use these numbers as accuracy claims. Use `top_evidence_review.html` to",
        "> visually inspect the strongest candidates before drawing conclusions.",
        "",
        "## What This Is",
        "",
        "This is **rule-based human-taught learning**, not a trained ML model. The agent",
        "extracts a template/heuristic from each user marking and searches the page for",
        "similar elements. When unsure, it asks a focused question.",
        "",
        "See `PLAN_SCANNER_VISUAL_LEARNING_AGENT_SPEC.md` for the full spec.",
        "",
        "## Training Examples Loaded",
        "",
        "| Type | Count |",
        "|---|---|",
    ]
    by_type: Dict[str, int] = {}
    for e in training["examples"]:
        by_type[e["label_type"]] = by_type.get(e["label_type"], 0) + 1
    for t, n in sorted(by_type.items()):
        md.append(f"| {t} | {n} |")

    md.extend([
        "",
        "## Rules Extracted",
        "",
        "| Rule ID | Label Type | From Examples | Template Kind |",
        "|---|---|---|---|",
    ])
    for r in rules:
        md.append(
            f"| {r['rule_id']} | {r['label_type']} | "
            f"{len(r['derived_from_examples'])} | {r.get('template_kind', '-')} |"
        )

    md.extend([
        "",
        "## Candidates Produced",
        "",
        "| Type | Count |",
        "|---|---|",
    ])
    for ct, n in sorted(cands_by_type.items()):
        md.append(f"| {ct} | {n} |")
    md.append(f"| **Total** | **{len(candidates)}** |")

    md.extend([
        "",
        f"- High confidence (≥{args.review_threshold}): {high_conf}",
        f"- Requires review (<{args.review_threshold}): {low_conf}",
        f"- code↔pole associations: {n_links}",
        f"- Evidence crops saved: {crops_saved}",
        f"- Review questions generated: {len(review_questions)}",
        "",
        "## Timing",
        "",
        "| Stage | Elapsed (ms) |",
        "|---|---|",
    ])
    for k, v in timing.items():
        md.append(f"| {k} | {v:.0f} |")
    md.append(f"| **Total** | **{total_elapsed_s*1000:.0f} ({total_elapsed_s:.1f}s)** |")

    md.extend([
        "",
        "## Sample Review Questions",
        "",
    ])
    for q in review_questions[:5]:
        md.append(f"### {q['review_question_id']}")
        md.append(f"- Candidate: `{q['candidate_id']}`")
        md.append(f"- Question (HE): {q['question_text_he']}")
        md.append(f"- Question (EN): {q['question_text_en']}")
        md.append(f"- System guess: `{q['system_guess']}` (confidence {q['confidence']})")
        md.append(f"- Crop: `{q.get('evidence_crop_path', 'n/a')}`")
        md.append(f"- Allowed answers: {q['allowed_answers']}")
        md.append("")
    if len(review_questions) > 5:
        md.append(f"_+ {len(review_questions) - 5} more questions in `visual_review_questions.json`_")
        md.append("")

    md.extend([
        "## Honest Notes",
        "",
        "- Each candidate traces back to specific training examples (`learned_from_examples`).",
        "- Confidence ≥ 0.7 candidates are accepted. < 0.7 → review question + evidence crop.",
        "- Detection corrections improve future scans but DO NOT auto-approve BOQ.",
        "- All learned rules are scoped `current_plan_only` by default. Promotion to project",
        "  or company scope requires explicit user action (UI not yet built).",
        "- Generalization across plans is currently limited to pixel-similarity + proximity.",
        "  Phase 2: once N≥500 labeled examples per category accumulate, train a real model.",
        "",
        "## Outputs Generated",
        "",
        "- `outputs/visual_learning_agent/visual_agent_candidates.json`",
        "- `outputs/visual_learning_agent/visual_review_questions.json`",
        "- `outputs/visual_learning_agent/visual_learning_rules.json`",
        "- `outputs/visual_learning_agent/evidence_crops/` (per-candidate annotated PNGs)",
        "- `outputs/visual_learning_agent/templates/` (extracted templates per rule)",
        "- `outputs/visual_learning_agent/visual_learning_agent_report.md`",
        "- `outputs/visual_learning_agent/visual_learning_agent_report.html`",
        "",
    ])

    md_path = out_root / "visual_learning_agent_report.md"
    with open(md_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(md) + "\n")

    # HTML
    html = [
        "<!DOCTYPE html><html><head><meta charset='utf-8'>",
        "<title>Engine C — Visual Learning Agent Report</title>",
        "<style>body{font-family:system-ui,sans-serif;max-width:1200px;margin:1em auto;padding:0 1em}",
        "table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}",
        "h2{margin-top:1.5em;border-bottom:1px solid #ddd;padding-bottom:0.3em}",
        ".q{border:1px solid #ddd;border-radius:6px;padding:0.8em;margin:0.6em 0;background:#fafafa}",
        ".q img{max-width:280px;border:1px solid #aaa;display:block;margin:0.4em 0}",
        ".hi{color:#080;font-weight:bold}.lo{color:#a00;font-weight:bold}",
        ".banner{border:2px solid #c80;background:#fff7e0;padding:0.6em 1em;border-radius:6px;margin:0.6em 0}</style>",
        "</head><body>",
        f"<h1>Engine C — Visual Learning Agent (POC v0.1.1)</h1>",
        "<div class='banner'><b>⚠ Algorithmic POC output — NOT human validated.</b><br>"
        "Counts and confidences below are pixel-similarity scores from template matching. "
        "They have not been confirmed against the real plan by a human reviewer. "
        "See <code>top_evidence_review.html</code> to visually inspect the strongest candidates.</div>",
        f"<p><b>Plan:</b> {training.get('plan_id', '?')} | <b>Page:</b> {args.page} | "
        f"<b>DPI:</b> {args.dpi}</p>",
        "<h2>Summary</h2><ul>",
        f"<li>Training examples: {len(training['examples'])}</li>",
        f"<li>Rules extracted: {len(rules)}</li>",
        f"<li>Candidates: <b>{len(candidates)}</b> "
        f"(<span class='hi'>{high_conf} accepted</span>, <span class='lo'>{low_conf} need review</span>)</li>",
        f"<li>code↔pole associations: {n_links}</li>",
        f"<li>Total elapsed: <b>{total_elapsed_s:.1f}s</b></li>",
        "</ul>",
        "<h2>Rules Extracted</h2><table><tr><th>Rule</th><th>Type</th><th>Examples</th><th>Kind</th></tr>",
    ]
    for r in rules:
        html.append(
            f"<tr><td>{r['rule_id']}</td><td>{r['label_type']}</td>"
            f"<td>{len(r['derived_from_examples'])}</td><td>{r.get('template_kind', '-')}</td></tr>"
        )
    html.append("</table>")

    html.append("<h2>Sample Review Questions (max 8)</h2>")
    for q in review_questions[:8]:
        crop_html = ""
        crop_p = q.get("evidence_crop_path")
        if crop_p and Path(crop_p).exists():
            try:
                with open(crop_p, "rb") as fh:
                    b64 = base64.b64encode(fh.read()).decode("ascii")
                crop_html = f"<img src='data:image/png;base64,{b64}'/>"
            except Exception:
                pass
        html.append(
            "<div class='q'>"
            f"<b>{q['review_question_id']}</b> — candidate <code>{q['candidate_id']}</code><br>"
            f"<b>HE:</b> {q['question_text_he']}<br>"
            f"<b>EN:</b> {q['question_text_en']}<br>"
            f"system_guess: <code>{q['system_guess']}</code> (conf {q['confidence']})<br>"
            f"Answers: {q['allowed_answers']}<br>"
            f"{crop_html}"
            "</div>"
        )

    html.extend([
        "<h2>Honest Notes</h2><ul>",
        "<li>Rule-based template matching from human markings — not a trained ML model.</li>",
        "<li>Each candidate traces back to user training examples.</li>",
        "<li>Detection corrections improve future scans but do <b>NOT</b> auto-approve BOQ.</li>",
        "<li>All rules scoped <code>current_plan_only</code> by default; promotion is explicit.</li>",
        "</ul>",
        "</body></html>",
    ])

    html_path = out_root / "visual_learning_agent_report.html"
    with open(html_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(html))


# --------------------------------------------------------------------
# Evidence Inspection Package (top_evidence_review.json + .html)
# --------------------------------------------------------------------

def _question_for_candidate(cand: Dict, review_questions: List[Dict]) -> Optional[Dict]:
    cid = cand["candidate_id"]
    for q in review_questions:
        if q.get("candidate_id") == cid:
            return q
    return None


def _candidate_for_id(cid: str, candidates: List[Dict]) -> Optional[Dict]:
    for c in candidates:
        if c.get("candidate_id") == cid:
            return c
    return None


def write_evidence_inspection_package(
    out_root: Path,
    candidates: List[Dict],
    review_questions: List[Dict],
    training: Dict,
    rules: List[Dict],
    page_img_path: str,
    args,
    top_n: int = 20,
) -> None:
    """
    Compact human-review package: top N per candidate type + all associations,
    each with crop, bbox, confidence, type, system guess, review question.
    Outputs:
      outputs/visual_learning_agent/top_evidence_review.json
      outputs/visual_learning_agent/top_evidence_review.html
    """
    by_type: Dict[str, List[Dict]] = {}
    for c in candidates:
        by_type.setdefault(c["candidate_type"], []).append(c)
    for ct in by_type:
        by_type[ct].sort(key=lambda x: -x.get("confidence", 0))

    top_poles = by_type.get("pole_candidate", [])[:top_n]
    top_ticks = by_type.get("tick_candidate", [])[:top_n]
    top_codes = by_type.get("sign_code_candidate", [])[:top_n]

    associated_codes = [
        c for c in candidates
        if c.get("candidate_type") == "sign_code_candidate" and c.get("associated_candidates")
    ]
    associations: List[Dict] = []
    for code in associated_codes:
        for pole_id in code.get("associated_candidates", []):
            pole = _candidate_for_id(pole_id, candidates)
            if pole is None:
                continue
            cx, cy = code["centroid"]
            px, py = pole["centroid"]
            dist = ((cx - px) ** 2 + (cy - py) ** 2) ** 0.5
            associations.append({
                "code_id": code["candidate_id"],
                "code_centroid": code["centroid"],
                "code_confidence": code["confidence"],
                "code_evidence_crop_path": code.get("evidence_crop_path"),
                "pole_id": pole["candidate_id"],
                "pole_centroid": pole["centroid"],
                "pole_confidence": pole["confidence"],
                "pole_evidence_crop_path": pole.get("evidence_crop_path"),
                "distance_px": round(dist, 1),
            })

    def serialize(cand: Dict) -> Dict:
        q = _question_for_candidate(cand, review_questions)
        return {
            "candidate_id": cand["candidate_id"],
            "candidate_type": cand["candidate_type"],
            "centroid": cand["centroid"],
            "bbox": cand["bbox"],
            "confidence": cand["confidence"],
            "system_guess": cand["system_guess"],
            "requires_review": cand.get("requires_review", False),
            "learned_from_examples": cand.get("learned_from_examples", []),
            "associated_candidates": cand.get("associated_candidates", []),
            "nearest_pole_distance_px": cand.get("nearest_pole_distance_px"),
            "evidence_crop_path": cand.get("evidence_crop_path"),
            "review_question": {
                "question_id": q["review_question_id"],
                "question_text_he": q["question_text_he"],
                "question_text_en": q["question_text_en"],
                "allowed_answers": q["allowed_answers"],
            } if q else None,
            "audit_notes": cand.get("audit_notes", []),
        }

    package = {
        "schema_version": "1.0",
        "validation_status": "Algorithmic POC output — NOT human validated.",
        "plan_id": training.get("plan_id"),
        "page_number": args.page,
        "image_path": page_img_path,
        "top_n_per_type": top_n,
        "summary_counts": {
            "pole_candidates_total": len(by_type.get("pole_candidate", [])),
            "tick_candidates_total": len(by_type.get("tick_candidate", [])),
            "sign_code_candidates_total": len(by_type.get("sign_code_candidate", [])),
            "associations_total": len(associations),
        },
        "rules_in_effect": [{"rule_id": r["rule_id"], "label_type": r["label_type"]} for r in rules],
        "top_poles": [serialize(c) for c in top_poles],
        "top_ticks": [serialize(c) for c in top_ticks],
        "top_codes": [serialize(c) for c in top_codes],
        "associations": associations,
    }
    json_path = out_root / "top_evidence_review.json"
    with open(json_path, "w", encoding="utf-8") as fh:
        json.dump(package, fh, indent=2)
    log(f"  Saved {json_path.name}")

    # HTML — visual inspection page with embedded crop images
    def _img_b64(path: Optional[str]) -> str:
        if not path:
            return ""
        try:
            with open(path, "rb") as fh:
                b64 = base64.b64encode(fh.read()).decode("ascii")
            return f"<img src='data:image/png;base64,{b64}' style='max-width:240px;border:1px solid #aaa;display:block'/>"
        except Exception:
            return ""

    def _row(cand: Dict) -> str:
        q = _question_for_candidate(cand, review_questions)
        q_he = q["question_text_he"] if q else "—"
        q_en = q["question_text_en"] if q else "—"
        learned = ", ".join(cand.get("learned_from_examples", []))
        notes = "; ".join(cand.get("audit_notes", []))
        conf = cand.get("confidence", 0)
        conf_cls = "ok" if conf >= 0.85 else ("mid" if conf >= 0.7 else "lo")
        return (
            f"<tr>"
            f"<td>{cand['candidate_id']}</td>"
            f"<td>{cand['candidate_type']}</td>"
            f"<td>({cand['centroid'][0]}, {cand['centroid'][1]})</td>"
            f"<td class='{conf_cls}'>{conf:.3f}</td>"
            f"<td>{cand['system_guess']}</td>"
            f"<td>{learned}</td>"
            f"<td>{_img_b64(cand.get('evidence_crop_path'))}</td>"
            f"<td><b>HE:</b> {q_he}<br><b>EN:</b> {q_en}</td>"
            f"<td>{notes}</td>"
            f"</tr>"
        )

    def _assoc_row(a: Dict) -> str:
        return (
            f"<tr>"
            f"<td>{a['code_id']} → {a['pole_id']}</td>"
            f"<td>{a['distance_px']}px</td>"
            f"<td>code conf {a['code_confidence']:.3f}, pole conf {a['pole_confidence']:.3f}</td>"
            f"<td>{_img_b64(a.get('code_evidence_crop_path'))}</td>"
            f"<td>{_img_b64(a.get('pole_evidence_crop_path'))}</td>"
            f"</tr>"
        )

    html_lines = [
        "<!DOCTYPE html><html><head><meta charset='utf-8'>",
        "<title>Engine C — Top Evidence Review</title>",
        "<style>body{font-family:system-ui,sans-serif;max-width:1400px;margin:1em auto;padding:0 1em;color:#222}",
        "table{border-collapse:collapse;width:100%;font-size:13px;margin:0.5em 0}",
        "td,th{border:1px solid #ccc;padding:6px 8px;vertical-align:top}",
        "h2{margin-top:1.5em;border-bottom:1px solid #ddd;padding-bottom:0.3em}",
        ".ok{color:#080;font-weight:bold}.mid{color:#a80;font-weight:bold}.lo{color:#a00;font-weight:bold}",
        ".banner{border:2px solid #c80;background:#fff7e0;padding:0.6em 1em;border-radius:6px;margin:0.6em 0}",
        ".sub{color:#555;font-size:13px}</style>",
        "</head><body>",
        "<h1>Engine C — Top Evidence Review</h1>",
        "<div class='banner'><b>⚠ Algorithmic POC output — NOT human validated.</b><br>",
        "Each row below is one candidate produced by template matching from the user's training examples. ",
        "Confidence is a pixel-similarity score, NOT a verified detection. ",
        "Open each crop image and answer the review question (HE/EN) to confirm or reject the candidate.</div>",
        f"<p class='sub'>Plan: <code>{training.get('plan_id', '?')}</code> | "
        f"Page: {args.page} | "
        f"Totals — poles: {len(by_type.get('pole_candidate', []))}, "
        f"ticks: {len(by_type.get('tick_candidate', []))}, "
        f"codes: {len(by_type.get('sign_code_candidate', []))}, "
        f"associations: {len(associations)}</p>",
    ]

    for title, rows in (
        (f"Top {len(top_poles)} pole candidates", top_poles),
        (f"Top {len(top_ticks)} tick candidates (after pole-distance filter)", top_ticks),
        (f"Top {len(top_codes)} sign-code candidates", top_codes),
    ):
        html_lines.append(f"<h2>{title}</h2>")
        if not rows:
            html_lines.append("<p class='sub'>(none)</p>")
            continue
        html_lines.append(
            "<table><tr>"
            "<th>candidate_id</th><th>type</th><th>centroid</th><th>conf</th><th>system_guess</th>"
            "<th>learned_from</th><th>evidence crop</th><th>review question (HE / EN)</th><th>audit</th>"
            "</tr>"
        )
        for c in rows:
            html_lines.append(_row(c))
        html_lines.append("</table>")

    html_lines.append(f"<h2>All {len(associations)} code ↔ pole associations</h2>")
    if associations:
        html_lines.append(
            "<table><tr>"
            "<th>code → pole</th><th>distance</th><th>confidences</th>"
            "<th>code crop</th><th>pole crop</th></tr>"
        )
        for a in associations:
            html_lines.append(_assoc_row(a))
        html_lines.append("</table>")
    else:
        html_lines.append("<p class='sub'>(no associations were formed)</p>")

    html_lines.extend([
        "<h2>How to use this page</h2><ul>",
        "<li>Open each crop image, judge whether the candidate matches its label type.</li>",
        "<li>For each row, answer the HE/EN review question — yes/no/correction.</li>",
        "<li>Reject obviously wrong candidates; promising candidates need full UI to write corrections back.</li>",
        "<li>Detection corrections improve future scans but do <b>NOT</b> auto-approve BOQ.</li>",
        "</ul>",
        "</body></html>",
    ])

    html_path = out_root / "top_evidence_review.html"
    with open(html_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(html_lines))
    log(f"  Saved {html_path.name}")


if __name__ == "__main__":
    sys.exit(main())
