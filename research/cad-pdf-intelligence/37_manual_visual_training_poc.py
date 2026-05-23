#!/usr/bin/env python3
"""
37_manual_visual_training_poc.py
================================
Engine C v0.3 — Manual-First Human-Trained Visual Agent (POC)

Strategic pivot (2026-05-23):
Automatic detection (Engine B / Engine C v0.1–v0.2) is not reliable enough
as a primary detector. The new direction: manual teaching first, detection
second. The user walks through a 9-step wizard to mark concrete examples
on the plan; only then does the agent search for similar items. Narrow
scope: 3 target outputs only — pole / sign count / sign code or symbol.

Wizard (see PLAN_SCANNER_MANUAL_TRAINING_AGENT_SPEC.md §3):

  step_1_upload_plan              (system) render or load page
  step_2_teach_pole_appearance    (user)   5–10 pole points
  step_3_teach_sign_count         (user)   5–10 tick/sign-count examples
  step_4_teach_sign_code          (user)   5–10 sign code rectangles
  step_5_teach_sign_symbol        (user)   OPTIONAL — 0+ sign-symbol rects
  step_6_teach_associations       (user)   at least 1 association
  step_7_apply_learning           (system) ← this POC runs detection
  step_8_review_results           (system) ← this POC emits review queue
  step_9_save_learning            (system) scope choice (UI step, not run here)

Inputs:
  --plan-run-dir       runs/<plan_id>/
  --wizard-examples    visual_training_examples.wizard.example.json (default)
  --page               page index (default 0)
  --dpi                render DPI (default 150)
  --match-threshold    template match threshold (default 0.65)
  --review-threshold   confidence below = review question (default 0.7)
  --min-tick-pole-px   tick must be >= this from a pole (default 3)
  --max-tick-pole-px   tick must be <= this from a pole (default 80)

Outputs — all under run_dir/outputs/manual_training/:
  - wizard_state.json
  - visual_learning_rules.json
  - visual_agent_candidates.json   (and ...from_training.json alias for v0.2)
  - visual_review_questions.json
  - visual_training_examples.example.json   (copy of input for traceability)
  - manual_training_report.md
  - manual_training_report.html
  - evidence_crops/
  - templates/

Safety:
  - Research-only. No production UI/DB changes.
  - No paid API.
  - Detection corrections improve future scans but do NOT auto-approve BOQ.
  - All learned rules scoped current_plan_only by default.

This script does NOT modify scripts 01–36 or any production code.
"""

import argparse
import base64
import json
import math
import sys
import time
import traceback
import warnings
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

warnings.filterwarnings("ignore")


# ====================================================================
# CLI
# ====================================================================

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Engine C v0.2 — Manual Onboarding Wizard POC",
    )
    p.add_argument("--plan-run-dir", required=True,
                   help="Path to the plan run directory")
    p.add_argument("--wizard-examples", default=None,
                   help="Path to wizard-organized examples JSON. "
                        "Default: visual_training_examples.wizard.example.json next to this script.")
    p.add_argument("--page", type=int, default=0)
    p.add_argument("--dpi", type=int, default=150)
    p.add_argument("--match-threshold", type=float, default=0.65)
    p.add_argument("--review-threshold", type=float, default=0.7)
    p.add_argument("--min-tick-pole-px", type=int, default=3)
    p.add_argument("--max-tick-pole-px", type=int, default=80)
    p.add_argument("--max-candidates-per-rule", type=int, default=500)
    return p.parse_args()


def log(msg: str, indent: int = 0) -> None:
    print(("  " * indent) + msg, flush=True)


# ====================================================================
# Wizard state validation
# ====================================================================

WIZARD_STEP_ORDER = [
    "step_1_upload_plan",                # system: render/load
    "step_2_teach_pole_appearance",       # user: 5–10 pole points
    "step_3_teach_sign_count",            # user: 5–10 tick/sign-count examples
    "step_4_teach_sign_code",             # user: 5–10 sign code examples
    "step_5_teach_sign_symbol",           # user: OPTIONAL, 0+ sign symbol examples
    "step_6_teach_associations",          # user: at least 1 association
    "step_7_apply_learning",              # system: run detection
    "step_8_review_results",              # system: present review queue
    "step_9_save_learning",               # system: scope choice (not run here)
]

# Steps that the user must complete before detection can run (step 5 optional).
WIZARD_USER_REQUIRED_STEPS = [
    "step_2_teach_pole_appearance",
    "step_3_teach_sign_count",
    "step_4_teach_sign_code",
    "step_6_teach_associations",
]

# Steps that are system actions (not user marking).
WIZARD_SYSTEM_STEPS = {
    "step_1_upload_plan",
    "step_7_apply_learning",
    "step_8_review_results",
    "step_9_save_learning",
}


def validate_wizard_state(wizard_data: Dict) -> Tuple[Dict, List[str]]:
    """
    Inspect a wizard-organized examples file and compute the current wizard
    state from the examples actually provided per step.

    Returns: (state_dict, warnings_list)
    """
    warnings_list: List[str] = []
    steps = wizard_data.get("steps", {})
    counts: Dict[str, int] = {}
    completed: List[str] = []
    last_completed: Optional[str] = None

    for step_id in WIZARD_STEP_ORDER:
        step = steps.get(step_id, {})
        # System steps don't have user examples
        if step.get("system_step") or step_id in WIZARD_SYSTEM_STEPS:
            counts[step_id] = 0
            continue
        n = len(step.get("examples", []))
        counts[step_id] = n
        min_n = step.get("min_examples", 1)
        if n >= min_n:
            completed.append(step_id)
            last_completed = step_id
        elif n > 0 and not step.get("optional"):
            warnings_list.append(
                f"{step_id}: only {n} examples, below min={min_n} (cannot complete this step yet)"
            )
        # Optional step (e.g. sign_symbol with min_examples=0) is always "complete"
        if step.get("optional") and step_id not in completed:
            completed.append(step_id)

    # Determine current step: first REQUIRED user step not yet completed; if all
    # required user steps complete, current_step = "step_7_apply_learning"
    current_step = "step_7_apply_learning"
    for step_id in WIZARD_USER_REQUIRED_STEPS:
        if step_id not in completed:
            current_step = step_id
            break

    ready_for_apply = all(
        step_id in completed for step_id in WIZARD_USER_REQUIRED_STEPS
    )

    state = {
        "schema_version": "1.0",
        "wizard_version": wizard_data.get("wizard_version", "1.0"),
        "plan_id": wizard_data.get("plan_id"),
        "page_number": wizard_data.get("page_number", 0),
        "current_step": current_step,
        "steps_completed": completed,
        "steps_per_count": counts,
        "ready_for_apply": ready_for_apply,
        "last_updated": datetime.utcnow().isoformat() + "Z",
    }
    return state, warnings_list


# ====================================================================
# I/O helpers
# ====================================================================

def find_source_pdf(run_dir: Path) -> Optional[Path]:
    for sub in ("source", "uploads", ""):
        d = run_dir / sub if sub else run_dir
        if not d.exists():
            continue
        for p in d.glob("*.pdf"):
            return p
    return None


def find_source_image(run_dir: Path) -> Optional[Path]:
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
    """(img_bgr, page_image_path, source_kind, render_ms)"""
    import cv2
    import numpy as np
    debug_dir.mkdir(parents=True, exist_ok=True)

    img_path = find_source_image(run_dir)
    pdf_path = find_source_pdf(run_dir)

    if img_path is not None and pdf_path is None:
        t = time.perf_counter()
        img_bgr = cv2.imread(str(img_path))
        elapsed = (time.perf_counter() - t) * 1000
        return img_bgr, str(img_path), "image", elapsed

    if pdf_path is None:
        raise FileNotFoundError(f"No PDF or image found in {run_dir}/source/, /uploads/, or /")

    import fitz
    t = time.perf_counter()
    doc = fitz.open(str(pdf_path))
    if page_idx >= len(doc):
        doc.close()
        raise IndexError(f"PDF has {len(doc)} pages; index {page_idx} out of range.")
    page = doc[page_idx]
    pix = page.get_pixmap(matrix=fitz.Matrix(dpi / 72, dpi / 72), alpha=False)
    doc.close()
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    img_bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR) if arr.shape[2] >= 3 else cv2.cvtColor(arr[:, :, 0], cv2.COLOR_GRAY2BGR)
    elapsed = (time.perf_counter() - t) * 1000
    out_path = debug_dir / f"page_{page_idx}_{dpi}dpi.png"
    cv2.imwrite(str(out_path), img_bgr)
    return img_bgr, str(out_path), "pdf", elapsed


def safe_crop(img, x0, y0, x1, y1):
    h, w = img.shape[:2]
    x0 = max(0, min(int(x0), w - 1))
    x1 = max(x0 + 1, min(int(x1), w))
    y0 = max(0, min(int(y0), h - 1))
    y1 = max(y0 + 1, min(int(y1), h))
    if x1 <= x0 or y1 <= y0:
        return None
    return img[y0:y1, x0:x1]


# ====================================================================
# Rule extraction per wizard step (from completed steps only)
# ====================================================================

def extract_rules_from_wizard(
    wizard_data: Dict, completed_steps: List[str], img_bgr, templates_dir: Path
) -> List[Dict]:
    """
    v0.3: extract rules from the new wizard step IDs.
      step_2_teach_pole_appearance → pole_marker_rule
      step_3_teach_sign_count      → tick_count_rule
      step_4_teach_sign_code       → sign_code_text_rule
      step_5_teach_sign_symbol     → sign_symbol_rule (optional)
      step_6_teach_associations    → pole_to_code_association_rule
                                    + pole_to_symbol_association_rule
      supporting_examples.ignore_regions → ignore_region_rule
      supporting_examples.noise_background → noise_background_rule (drop zone)
      supporting_examples.wrong_detection → tracked as negative examples
    """
    import cv2
    templates_dir.mkdir(parents=True, exist_ok=True)
    rules: List[Dict] = []
    steps = wizard_data.get("steps", {})
    supporting = wizard_data.get("supporting_examples", {})

    def _crop_patch(cx: int, cy: int, half: int, ex_id: str, rule_id: str) -> Optional[Dict]:
        patch = safe_crop(img_bgr, cx - half, cy - half, cx + half, cy + half)
        if patch is None or patch.size == 0:
            return None
        patch_path = templates_dir / f"{rule_id}_{ex_id}.png"
        cv2.imwrite(str(patch_path), patch)
        return {
            "training_example_id": ex_id,
            "patch_path": str(patch_path),
            "patch_size_px": [patch.shape[1], patch.shape[0]],
            "center_xy": [cx, cy],
        }

    def _crop_rect(bb, ex_id: str, rule_id: str) -> Optional[Dict]:
        x0, y0, x1, y1 = bb
        patch = safe_crop(img_bgr, x0, y0, x1, y1)
        if patch is None or patch.size == 0:
            return None
        patch_path = templates_dir / f"{rule_id}_{ex_id}.png"
        cv2.imwrite(str(patch_path), patch)
        return {
            "training_example_id": ex_id,
            "patch_path": str(patch_path),
            "bbox": [int(x0), int(y0), int(x1), int(y1)],
            "size_px": [int(x1 - x0), int(y1 - y0)],
        }

    # Build pole_lookup (used by tick / symbol distance learning)
    pole_lookup: Dict[str, Tuple[float, float]] = {}
    pole_step = steps.get("step_2_teach_pole_appearance", {})
    for pe in pole_step.get("examples", []):
        g = pe.get("geometry", {})
        if g.get("type") == "point":
            pole_lookup[pe["training_example_id"]] = (float(g["x"]), float(g["y"]))

    # --- pole_marker_rule ---
    if "step_2_teach_pole_appearance" in completed_steps:
        rule_id = "r_pole_marker"
        patches: List[Dict] = []
        sizes: List[int] = []
        for e in pole_step.get("examples", []):
            g = e.get("geometry", {})
            if g.get("type") != "point":
                continue
            cx, cy = int(g["x"]), int(g["y"])
            half = int(g.get("radius", 8)) * 2
            sizes.append(half * 2)
            pm = _crop_patch(cx, cy, half, e["training_example_id"], rule_id)
            if pm:
                patches.append(pm)
        if patches:
            rules.append({
                "rule_id": rule_id,
                "step_id": "step_2_teach_pole_appearance",
                "rule_type": "pole_marker_rule",
                "label_type": "pole_dot",
                "source_examples": [p["training_example_id"] for p in patches],
                "derived_from_examples": [p["training_example_id"] for p in patches],
                "scope": "current_plan_only",
                "template_kind": "image_patches",
                "patches": patches,
                "visual_features": {
                    "template_patch_paths": [p["patch_path"] for p in patches],
                    "avg_size_px": int(sum(sizes) / max(1, len(sizes))) if sizes else 16,
                },
                "min_match_score": 0.65,
                "created_from_user_training": True,
                "requires_review": True,
            })

    # --- tick_count_rule ---
    if "step_3_teach_sign_count" in completed_steps:
        rule_id = "r_sign_count_tick"
        patches: List[Dict] = []
        lengths: List[int] = []
        tick_pole_distances: List[float] = []
        for e in steps["step_3_teach_sign_count"].get("examples", []):
            g = e.get("geometry", {})
            if g.get("type") != "line":
                continue
            x0, y0, x1, y1 = int(g["x0"]), int(g["y0"]), int(g["x1"]), int(g["y1"])
            length = max(1, int(((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5))
            lengths.append(length)
            assoc_pole = e.get("associated_pole_id")
            if assoc_pole and assoc_pole in pole_lookup:
                px, py = pole_lookup[assoc_pole]
                tcx, tcy = (x0 + x1) / 2, (y0 + y1) / 2
                tick_pole_distances.append(((tcx - px) ** 2 + (tcy - py) ** 2) ** 0.5)
            xmin, xmax = min(x0, x1) - 4, max(x0, x1) + 4
            ymin, ymax = min(y0, y1) - 4, max(y0, y1) + 4
            pm = _crop_rect((xmin, ymin, xmax, ymax), e["training_example_id"], rule_id)
            if pm:
                pm["length_px"] = length
                patches.append(pm)
        if patches:
            rules.append({
                "rule_id": rule_id,
                "step_id": "step_3_teach_sign_count",
                "rule_type": "tick_count_rule",
                "label_type": "sign_count_tick",
                "source_examples": [p["training_example_id"] for p in patches],
                "derived_from_examples": [p["training_example_id"] for p in patches],
                "scope": "current_plan_only",
                "template_kind": "image_patches",
                "patches": patches,
                "expected_length_px": int(sum(lengths) / max(1, len(lengths))) if lengths else 10,
                "learned_tick_to_pole_distance_px": (
                    int(sum(tick_pole_distances) / len(tick_pole_distances))
                    if tick_pole_distances else None
                ),
                "min_match_score": 0.55,
                "created_from_user_training": True,
                "requires_review": True,
            })

    # --- sign_code_text_rule ---
    if "step_4_teach_sign_code" in completed_steps:
        rule_id = "r_sign_code_text"
        regions: List[Dict] = []
        known_codes: List[str] = []
        for e in steps["step_4_teach_sign_code"].get("examples", []):
            g = e.get("geometry", {})
            if g.get("type") != "rectangle":
                continue
            pm = _crop_rect((g["x0"], g["y0"], g["x1"], g["y1"]),
                            e["training_example_id"], rule_id)
            if pm:
                pm["label_value"] = e.get("label_value", "")
                regions.append(pm)
                if e.get("label_value"):
                    known_codes.append(e["label_value"])
        if regions:
            rules.append({
                "rule_id": rule_id,
                "step_id": "step_4_teach_sign_code",
                "rule_type": "sign_code_text_rule",
                "label_type": "sign_code_text",
                "source_examples": [r["training_example_id"] for r in regions],
                "derived_from_examples": [r["training_example_id"] for r in regions],
                "scope": "current_plan_only",
                "template_kind": "text_regions",
                "regions": regions,
                "known_codes": known_codes,
                "min_match_score": 0.50,
                "created_from_user_training": True,
                "requires_review": True,
            })

    # --- sign_symbol_rule (optional) ---
    if "step_5_teach_sign_symbol" in completed_steps:
        symbol_examples = steps.get("step_5_teach_sign_symbol", {}).get("examples", [])
        if symbol_examples:
            rule_id = "r_sign_symbol"
            regions: List[Dict] = []
            symbol_pole_distances: List[float] = []
            for e in symbol_examples:
                g = e.get("geometry", {})
                if g.get("type") != "rectangle":
                    continue
                pm = _crop_rect((g["x0"], g["y0"], g["x1"], g["y1"]),
                                e["training_example_id"], rule_id)
                if pm:
                    pm["label_value"] = e.get("label_value", "")
                    regions.append(pm)
                    assoc_pole = e.get("associated_pole_id")
                    if assoc_pole and assoc_pole in pole_lookup:
                        px, py = pole_lookup[assoc_pole]
                        scx = (g["x0"] + g["x1"]) / 2
                        scy = (g["y0"] + g["y1"]) / 2
                        symbol_pole_distances.append(((scx - px) ** 2 + (scy - py) ** 2) ** 0.5)
            if regions:
                rules.append({
                    "rule_id": rule_id,
                    "step_id": "step_5_teach_sign_symbol",
                    "rule_type": "sign_symbol_rule",
                    "label_type": "sign_symbol",
                    "source_examples": [r["training_example_id"] for r in regions],
                    "derived_from_examples": [r["training_example_id"] for r in regions],
                    "scope": "current_plan_only",
                    "template_kind": "image_patches",
                    "regions": regions,
                    "learned_symbol_to_pole_distance_px": (
                        int(sum(symbol_pole_distances) / len(symbol_pole_distances))
                        if symbol_pole_distances else None
                    ),
                    "min_match_score": 0.55,
                    "created_from_user_training": True,
                    "requires_review": True,
                })

    # --- pole_to_code_association_rule + pole_to_symbol_association_rule ---
    if "step_6_teach_associations" in completed_steps:
        assoc_examples = steps["step_6_teach_associations"].get("examples", [])
        # Group by label_type per association
        for assoc_kind, output_rule_type, from_label, to_label in [
            ("pole_to_code_association", "pole_to_code_association_rule",
             "sign_code_text", "pole_dot"),
            ("pole_to_symbol_association", "pole_to_symbol_association_rule",
             "sign_symbol", "pole_dot"),
        ]:
            distances: List[float] = []
            angles: List[float] = []
            source_ids: List[str] = []
            for e in assoc_examples:
                if e.get("label_type") != assoc_kind:
                    continue
                g = e.get("geometry", {})
                if g.get("type") != "association":
                    continue
                f = g["from"]; t = g["to"]
                fx, fy = float(f["x"]), float(f["y"])
                tx, ty = float(t["x"]), float(t["y"])
                d = ((fx - tx) ** 2 + (fy - ty) ** 2) ** 0.5
                distances.append(d)
                angles.append(math.degrees(math.atan2(ty - fy, tx - fx)))
                source_ids.append(e["training_example_id"])
            if distances:
                avg_d = sum(distances) / len(distances)
                avg_a = sum(angles) / len(angles)
                rules.append({
                    "rule_id": f"r_{assoc_kind}",
                    "step_id": "step_6_teach_associations",
                    "rule_type": output_rule_type,
                    "label_type": assoc_kind,
                    "source_examples": source_ids,
                    "derived_from_examples": source_ids,
                    "scope": "current_plan_only",
                    "template_kind": "association",
                    "association_rule": {
                        "from_label": from_label,
                        "to_label": to_label,
                        "max_distance_px": max(20, int(avg_d * 1.8)),
                        "preferred_direction_deg": round(avg_a, 1),
                        "direction_tolerance_deg": 60,
                    },
                    "created_from_user_training": True,
                    "requires_review": True,
                })

    # --- ignore_region_rule (from supporting_examples.ignore_regions) ---
    ignore_examples = supporting.get("ignore_regions", [])
    if ignore_examples:
        rule_id = "r_ignore_region"
        rects: List[Dict] = []
        for e in ignore_examples:
            g = e.get("geometry", {})
            if g.get("type") != "rectangle":
                continue
            rects.append({
                "training_example_id": e["training_example_id"],
                "bbox": [int(g["x0"]), int(g["y0"]), int(g["x1"]), int(g["y1"])],
                "label_value": e.get("label_value", ""),
            })
        if rects:
            rules.append({
                "rule_id": rule_id,
                "step_id": "supporting",
                "rule_type": "ignore_region_rule",
                "label_type": "ignore_region",
                "source_examples": [r["training_example_id"] for r in rects],
                "derived_from_examples": [r["training_example_id"] for r in rects],
                "scope": "current_plan_only",
                "template_kind": "polygons",
                "rectangles": rects,
                "created_from_user_training": True,
                "requires_review": False,
            })

    # --- noise_background_rule (from supporting_examples.noise_background) ---
    noise_examples = supporting.get("noise_background", [])
    if noise_examples:
        rule_id = "r_noise_background"
        rects: List[Dict] = []
        for e in noise_examples:
            g = e.get("geometry", {})
            if g.get("type") != "rectangle":
                continue
            rects.append({
                "training_example_id": e["training_example_id"],
                "bbox": [int(g["x0"]), int(g["y0"]), int(g["x1"]), int(g["y1"])],
            })
        if rects:
            rules.append({
                "rule_id": rule_id,
                "step_id": "supporting",
                "rule_type": "noise_background_rule",
                "label_type": "noise_background",
                "source_examples": [r["training_example_id"] for r in rects],
                "derived_from_examples": [r["training_example_id"] for r in rects],
                "scope": "current_plan_only",
                "template_kind": "polygons",
                "rectangles": rects,
                "created_from_user_training": True,
                "requires_review": False,
            })

    return rules


# ====================================================================
# Detection (Step 6)
# ====================================================================

def in_ignore(x: int, y: int, ignore_rects: List[Dict]) -> bool:
    for r in ignore_rects:
        bb = r["bbox"]
        if bb[0] <= x <= bb[2] and bb[1] <= y <= bb[3]:
            return True
    return False


def template_matches(
    img_bgr, rule: Dict, ignore_rects: List[Dict],
    threshold: float, max_candidates: int,
) -> Tuple[List[Dict], float]:
    """
    Template matching with bounded work:
      1. cv2.matchTemplate per template patch.
      2. Hard cap raw matches per patch (top K by score) BEFORE building dicts,
         so a low-specificity tick template cannot produce millions of matches
         that then explode the dedup loop.
      3. Sort + spatial dedup using a coarse grid (O(N) instead of O(N²)).
    """
    import cv2
    import numpy as np
    t = time.perf_counter()
    img_gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    threshold = max(threshold, rule.get("min_match_score", threshold))

    # Hard ceiling on per-patch raw matches to avoid O(N²) blowup downstream.
    # A non-specific template (short tick line) on a large page can produce
    # millions of matches above 0.5 — we keep only the top K by score per patch.
    RAW_CAP_PER_PATCH = max(2000, max_candidates * 4)

    raw: List[Dict] = []
    for patch_meta in rule.get("patches", []) or rule.get("regions", []):
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
        ys, xs = np.where(res >= threshold)
        if len(ys) == 0:
            continue
        scores = res[ys, xs]
        if len(ys) > RAW_CAP_PER_PATCH:
            top_idx = np.argpartition(-scores, RAW_CAP_PER_PATCH)[:RAW_CAP_PER_PATCH]
            ys = ys[top_idx]
            xs = xs[top_idx]
            scores = scores[top_idx]
        for y, x, s in zip(ys.tolist(), xs.tolist(), scores.tolist()):
            cx = int(x + tw / 2)
            cy = int(y + th / 2)
            if in_ignore(cx, cy, ignore_rects):
                continue
            raw.append({
                "centroid": [cx, cy],
                "bbox": [int(x), int(y), int(x + tw), int(y + th)],
                "match_score": float(s),
                "source_patch": patch_meta["training_example_id"],
            })

    # Spatial dedup via coarse 8px grid: O(N) instead of O(N²)
    raw.sort(key=lambda c: -c["match_score"])
    GRID = 8
    occupied = set()
    dedup: List[Dict] = []
    for c in raw:
        gx = c["centroid"][0] // GRID
        gy = c["centroid"][1] // GRID
        # Check this cell + 8 neighbors (3x3 around)
        nearby = any((gx + dx, gy + dy) in occupied
                     for dx in (-1, 0, 1) for dy in (-1, 0, 1))
        if nearby:
            continue
        occupied.add((gx, gy))
        dedup.append(c)
        if len(dedup) >= max_candidates:
            break
    return dedup, (time.perf_counter() - t) * 1000


def filter_ticks_by_pole_distance(
    poles: List[Dict], ticks: List[Dict], min_d: int, max_d: int
) -> Tuple[List[Dict], int]:
    if not poles:
        return [], len(ticks)
    pts = [(p["centroid"][0], p["centroid"][1]) for p in poles]
    kept: List[Dict] = []
    dropped = 0
    for t in ticks:
        tx, ty = t["centroid"]
        best = min(((tx - px) ** 2 + (ty - py) ** 2) ** 0.5 for (px, py) in pts)
        if min_d <= best <= max_d:
            t["nearest_pole_distance_px"] = round(best, 1)
            kept.append(t)
        else:
            dropped += 1
    return kept, dropped


def associate_codes_to_poles(
    poles: List[Dict], codes: List[Dict], assoc_rule: Optional[Dict]
) -> int:
    if not assoc_rule:
        return 0
    ar = assoc_rule.get("association_rule", {})
    max_d = ar.get("max_distance_px", 150)
    n_links = 0
    for code in codes:
        ccx, ccy = code["centroid"]
        best = None
        best_d = float("inf")
        for pole in poles:
            px, py = pole["centroid"]
            d = ((ccx - px) ** 2 + (ccy - py) ** 2) ** 0.5
            if d <= max_d and d < best_d:
                best_d = d
                best = pole
        if best is not None:
            code.setdefault("associated_candidates", []).append(best["candidate_id"])
            best.setdefault("associated_candidates", []).append(code["candidate_id"])
            n_links += 1
    return n_links


# ====================================================================
# Evidence + Review Questions (Step 7)
# ====================================================================

QUESTION_TEXTS = {
    "pole_candidate": {
        "he": "האם זו נקודת עמוד תמרור?",
        "en": "Is this a sign pole point?",
        "question_type": "is_pole",
        "allowed_answers": ["yes_pole", "no_noise", "no_dimension_mark", "other"],
    },
    "tick_candidate": {  # legacy alias for sign_count_tick
        "he": "האם הקו הקטן הזה מסמן תמרור נוסף על אותו עמוד?",
        "en": "Does this short line mark an additional sign on the same pole?",
        "question_type": "is_tick_mark",
        "allowed_answers": ["yes_tick", "no_unrelated_line", "other"],
    },
    "sign_count_tick_candidate": {
        "he": "האם הקו הקטן הזה מסמן תמרור נוסף על אותו עמוד?",
        "en": "Does this short line mark an additional sign on the same pole?",
        "question_type": "is_sign_count_tick",
        "allowed_answers": ["yes_tick", "no_unrelated_line", "other"],
    },
    "sign_code_candidate": {
        "he": "האם המספר הזה שייך לעמוד/לתמרור?",
        "en": "Does this number belong to the pole/sign?",
        "question_type": "is_sign_code",
        "allowed_answers": ["yes_sign_code", "no_unrelated_number", "no_dimension", "other"],
    },
    "sign_symbol_candidate": {
        "he": "האם זה סימון גרפי של תמרור?",
        "en": "Is this the graphic symbol of a sign?",
        "question_type": "is_sign_symbol",
        "allowed_answers": ["yes_sign_symbol", "no_unrelated_shape", "no_callout", "other"],
    },
    "assembly_candidate": {
        "he": "האם השיוך הזה בין עמוד/מספר/תמרור נכון?",
        "en": "Is this pole/code/sign assembly correct?",
        "question_type": "is_assembly",
        "allowed_answers": ["yes_correct", "no_wrong_pole", "no_wrong_code", "no_wrong_symbol", "other"],
    },
    "noise_candidate": {
        "he": "האם זה רעש/רקע שיש להתעלם ממנו?",
        "en": "Is this background noise that should be ignored?",
        "question_type": "is_noise",
        "allowed_answers": ["yes_noise", "no_real_detection", "other"],
    },
}


def save_evidence_crop(img_bgr, cand: Dict, evidence_dir: Path, padding: int = 20) -> Optional[str]:
    import cv2
    bb = cand["bbox"]
    cx, cy = cand["centroid"]
    x0 = max(0, bb[0] - padding); y0 = max(0, bb[1] - padding)
    x1 = min(img_bgr.shape[1], bb[2] + padding); y1 = min(img_bgr.shape[0], bb[3] + padding)
    crop = img_bgr[y0:y1, x0:x1].copy()
    if crop.size == 0:
        return None
    cv2.rectangle(crop, (bb[0] - x0, bb[1] - y0), (bb[2] - x0, bb[3] - y0), (0, 200, 0), 2)
    cv2.drawMarker(crop, (cx - x0, cy - y0), (0, 0, 255),
                   markerType=cv2.MARKER_CROSS, markerSize=12, thickness=2)
    out = evidence_dir / f"{cand['candidate_id']}.png"
    cv2.imwrite(str(out), crop)
    return str(out)


def make_review_question(cand: Dict, threshold: float) -> Optional[Dict]:
    if cand.get("confidence", 0) >= threshold:
        return None
    qmeta = QUESTION_TEXTS.get(cand.get("candidate_type", ""), {
        "he": "האם הזיהוי הזה תקין?",
        "en": "Is this detection valid?",
        "question_type": "is_valid_generic",
        "allowed_answers": ["yes_valid", "no_invalid", "other"],
    })
    return {
        "review_question_id": f"q_{cand['candidate_id']}",
        "candidate_id": cand["candidate_id"],
        "question_type": qmeta["question_type"],
        "question_text_he": qmeta["he"],
        "question_text_en": qmeta["en"],
        "evidence_crop_path": cand.get("evidence_crop_path"),
        "crop_bbox": cand["bbox"],
        "system_guess": cand.get("system_guess"),
        "confidence": cand.get("confidence"),
        "matched_rule_ids": cand.get("matched_rule_ids", []),
        "allowed_answers": qmeta["allowed_answers"],
        "user_answer": None,
        "correction_status": "pending",
    }


# ====================================================================
# Reports
# ====================================================================

def write_md_report(out_path: Path, wizard_state: Dict, rules: List[Dict],
                    candidates: List[Dict], review_questions: List[Dict],
                    n_links: int, total_elapsed_s: float, args, by_type: Dict[str, int],
                    page_img_path: str) -> None:
    md = [
        "# Engine C v0.2 — Manual Training Report",
        "",
        "> ⚠ **STATUS: Algorithmic POC output — NOT human validated.**",
        "> Manual teaching wizard (Engine C v0.2). Detection runs only AFTER the",
        "> user marks examples in steps 1–5. The candidates listed below are pixel-",
        "> similarity matches to the user's training examples. Confirm/correct via",
        "> the review queue before drawing any conclusions.",
        "",
        f"**Plan:** `{wizard_state.get('plan_id', '?')}`  ",
        f"**Page:** {wizard_state.get('page_number', 0)}  ",
        f"**Current wizard step:** `{wizard_state.get('current_step')}`  ",
        f"**Ready to apply (steps 1–5 complete)?** {wizard_state.get('ready_for_apply')}",
        "",
        "## Wizard Progress",
        "",
        "| Step | Examples provided | Status |",
        "|---|---|---|",
    ]
    for sid in WIZARD_STEP_ORDER:
        n = wizard_state.get("steps_per_count", {}).get(sid, 0)
        done = "✓ complete" if sid in wizard_state.get("steps_completed", []) else "pending"
        if sid in ("step_1_upload_plan", "step_7_apply_learning", "step_8_review_results", "step_9_save_learning"):
            done = "system step"
        md.append(f"| {sid} | {n} | {done} |")

    md.extend([
        "",
        "## Rules Extracted (from completed wizard steps)",
        "",
        "| Rule | Step | Label type | From examples |",
        "|---|---|---|---|",
    ])
    for r in rules:
        md.append(
            f"| {r['rule_id']} | {r.get('step_id', '-')} | {r['label_type']} | "
            f"{len(r['derived_from_examples'])} |"
        )

    md.extend([
        "",
        "## Candidates Produced (Step 6)",
        "",
        "| Type | Count |",
        "|---|---|",
    ])
    for k, v in sorted(by_type.items()):
        md.append(f"| {k} | {v} |")
    md.append(f"| **Total** | **{len(candidates)}** |")
    md.append("")
    md.append(f"- Code↔pole associations: **{n_links}**")
    md.append(f"- Review questions emitted (Step 7): **{len(review_questions)}**")
    md.append(f"- Total elapsed: **{total_elapsed_s:.1f}s**")
    md.append("")

    md.extend([
        "## Honest Notes",
        "",
        "- Manual teaching mode. The agent does NOT detect on its own — it requires the user to mark examples first.",
        "- Each candidate traces back to specific training examples (`learned_from_examples`).",
        "- Confidence ≥ 0.7 is accepted; < 0.7 → review question + evidence crop.",
        "- Detection corrections improve future scans but do NOT auto-approve BOQ.",
        "- All rules scoped `current_plan_only` by default; project/company promotion is explicit.",
        "- Engine C v0.1.1 (script 36) is the automatic detection POC — found insufficient, kept as comparison baseline only.",
        "",
    ])
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(md) + "\n")


def write_html_report(out_path: Path, wizard_state: Dict, rules: List[Dict],
                      candidates: List[Dict], review_questions: List[Dict],
                      n_links: int, total_elapsed_s: float, args, by_type: Dict[str, int]) -> None:
    def img_b64(p: Optional[str]) -> str:
        if not p:
            return ""
        try:
            with open(p, "rb") as fh:
                return f"<img src='data:image/png;base64,{base64.b64encode(fh.read()).decode('ascii')}' style='max-width:220px;border:1px solid #aaa;display:block;margin:4px 0'/>"
        except Exception:
            return ""

    html = [
        "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Engine C v0.2 — Manual Training Report</title>",
        "<style>body{font-family:system-ui,sans-serif;max-width:1300px;margin:1em auto;padding:0 1em;color:#222}",
        "table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #ccc;padding:5px 8px;vertical-align:top}",
        "h2{margin-top:1.5em;border-bottom:1px solid #ddd;padding-bottom:0.3em}",
        ".banner{border:2px solid #c80;background:#fff7e0;padding:0.6em 1em;border-radius:6px;margin:0.6em 0}",
        ".q{border:1px solid #ddd;border-radius:6px;padding:0.6em;margin:0.4em 0;background:#fafafa}",
        ".done{color:#080;font-weight:bold}.pending{color:#a80}.sys{color:#555;font-style:italic}",
        "</style></head><body>",
        "<h1>Engine C v0.2 — Manual Training Report</h1>",
        "<div class='banner'><b>⚠ Algorithmic POC output — NOT human validated.</b><br>",
        "Manual teaching wizard. Detection runs only after the user marks examples in steps 1–5. ",
        "Candidates below are pixel-similarity matches to the user's training examples — confirm/correct in review.</div>",
        f"<p><b>Plan:</b> <code>{wizard_state.get('plan_id', '?')}</code> | ",
        f"<b>Current step:</b> <code>{wizard_state.get('current_step')}</code> | ",
        f"<b>Ready to apply?</b> {wizard_state.get('ready_for_apply')}</p>",
        "<h2>Wizard Progress</h2><table><tr><th>Step</th><th>Examples</th><th>Status</th></tr>",
    ]
    for sid in WIZARD_STEP_ORDER:
        n = wizard_state.get("steps_per_count", {}).get(sid, 0)
        cls = "done" if sid in wizard_state.get("steps_completed", []) else "pending"
        status = "✓ complete" if cls == "done" else "pending"
        if sid in ("step_1_upload_plan", "step_7_apply_learning", "step_8_review_results", "step_9_save_learning"):
            cls = "sys"; status = "system step"
        html.append(f"<tr><td>{sid}</td><td>{n}</td><td class='{cls}'>{status}</td></tr>")
    html.append("</table>")

    html.append("<h2>Rules Extracted</h2><table><tr><th>Rule</th><th>Step</th><th>Label</th><th>Examples</th></tr>")
    for r in rules:
        html.append(
            f"<tr><td>{r['rule_id']}</td><td>{r.get('step_id', '-')}</td>"
            f"<td>{r['label_type']}</td><td>{len(r['derived_from_examples'])}</td></tr>"
        )
    html.append("</table>")

    html.append("<h2>Candidates Summary</h2><ul>")
    for k, v in sorted(by_type.items()):
        html.append(f"<li>{k}: <b>{v}</b></li>")
    html.append(f"<li>code↔pole associations: <b>{n_links}</b></li>")
    html.append(f"<li>review questions: <b>{len(review_questions)}</b></li>")
    html.append(f"<li>total elapsed: <b>{total_elapsed_s:.1f}s</b></li>")
    html.append("</ul>")

    html.append("<h2>Review Queue (Step 7, first 12 questions)</h2>")
    for q in review_questions[:12]:
        html.append("<div class='q'>")
        html.append(f"<b>{q['review_question_id']}</b> — candidate <code>{q['candidate_id']}</code> (conf {q['confidence']})<br>")
        html.append(f"<b>HE:</b> {q['question_text_he']}<br>")
        html.append(f"<b>EN:</b> {q['question_text_en']}<br>")
        html.append(f"answers: {q['allowed_answers']}<br>")
        html.append(img_b64(q.get("evidence_crop_path")))
        html.append("</div>")
    html.append("</body></html>")
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(html))


# ====================================================================
# Main
# ====================================================================

def main() -> int:
    args = parse_args()
    run_dir = Path(args.plan_run_dir).resolve()
    if not run_dir.exists():
        log(f"ERROR: Run directory not found: {run_dir}")
        return 1

    script_dir = Path(__file__).parent
    examples_path = Path(args.wizard_examples).resolve() if args.wizard_examples else (
        script_dir / "visual_training_examples.wizard.example.json"
    )
    if not examples_path.exists():
        log(f"ERROR: Wizard examples file not found: {examples_path}")
        return 1

    out_root = run_dir / "outputs" / "manual_training"
    templates_dir = out_root / "templates"
    evidence_dir = out_root / "evidence_crops"
    debug_dir = run_dir / "outputs" / "image_scan_debug"
    out_root.mkdir(parents=True, exist_ok=True)
    templates_dir.mkdir(parents=True, exist_ok=True)
    evidence_dir.mkdir(parents=True, exist_ok=True)

    log("============================================================")
    log("Engine C v0.2 — Manual Onboarding Wizard POC")
    log("============================================================")
    log(f"Run dir          : {run_dir}")
    log(f"Wizard examples  : {examples_path}")
    log(f"Page             : {args.page}")
    log(f"DPI              : {args.dpi}")
    log("")
    log("STATUS: Algorithmic POC output — NOT human validated.")
    log("PRIMARY PATH: this manual wizard. Script 36 (v0.1.1) is the deprecated")
    log("              automatic-detection baseline, kept for comparison only.")
    log("")

    # 1. Load wizard examples + validate state
    log("Step A: Loading wizard examples and validating state ...")
    with open(examples_path, "r", encoding="utf-8") as fh:
        wizard_data = json.load(fh)
    wizard_state, warns = validate_wizard_state(wizard_data)
    for w in warns:
        log(f"  WARN: {w}", indent=1)
    log(f"  Current step: {wizard_state['current_step']}")
    log(f"  Steps completed: {wizard_state['steps_completed']}")
    log(f"  Ready for apply: {wizard_state['ready_for_apply']}")

    state_path = out_root / "wizard_state.json"
    with open(state_path, "w", encoding="utf-8") as fh:
        json.dump(wizard_state, fh, indent=2)
    log(f"  Saved {state_path.name}")

    # 2. Render or load page
    log(f"\nStep B: Rendering/loading page at {args.dpi} DPI ...")
    t_total = time.perf_counter()
    try:
        img_bgr, page_img_path, source_kind, render_ms = render_or_load_page(
            run_dir, args.page, args.dpi, debug_dir
        )
    except Exception as e:
        log(f"  ERROR: {e}")
        traceback.print_exc()
        return 1
    h, w = img_bgr.shape[:2]
    log(f"  Source: {source_kind}; image: {w}x{h}px ({render_ms:.0f}ms)")

    # 3. Extract rules from completed steps
    log(f"\nStep C: Extracting rules from completed wizard steps ...")
    rules = extract_rules_from_wizard(
        wizard_data, wizard_state["steps_completed"], img_bgr, templates_dir
    )
    log(f"  Extracted {len(rules)} rules")
    for r in rules:
        log(f"    {r['rule_id']} [{r['label_type']}] from {len(r['derived_from_examples'])} examples", indent=1)

    rules_path = out_root / "visual_learning_rules.json"
    with open(rules_path, "w", encoding="utf-8") as fh:
        json.dump({
            "schema_version": "1.0",
            "plan_id": wizard_state.get("plan_id"),
            "page_number": args.page,
            "rules": rules,
        }, fh, indent=2)
    log(f"  Saved {rules_path.name}")

    # 4. Gate on ready_for_apply for Step 6 (detection)
    if not wizard_state["ready_for_apply"]:
        log(f"\nWizard not ready to apply pattern (some user steps incomplete).")
        log("Skipping Step 6 (detection) and Step 7 (review queue).")
        log("Complete the missing user steps in the wizard examples file, then re-run.")
        elapsed_s = time.perf_counter() - t_total
        write_md_report(out_root / "manual_training_report.md", wizard_state, rules,
                        [], [], 0, elapsed_s, args, {}, page_img_path)
        write_html_report(out_root / "manual_training_report.html", wizard_state, rules,
                          [], [], 0, elapsed_s, args, {})
        return 0

    # 5. STEP 6 — Apply learned pattern
    log(f"\nStep 6 (system): Applying learned pattern ...")
    ignore_rule = next((r for r in rules if r["label_type"] == "ignore_region"), None)
    ignore_rects = ignore_rule.get("rectangles", []) if ignore_rule else []
    log(f"  ignore regions: {len(ignore_rects)}")

    candidates: List[Dict] = []
    cand_counter = 0

    def new_id() -> str:
        nonlocal cand_counter
        cand_counter += 1
        return f"mvt_p{args.page}_c{cand_counter:04d}"

    # Apply pole rule
    pole_cands: List[Dict] = []
    pole_rule = next((r for r in rules if r["label_type"] == "pole_dot"), None)
    if pole_rule:
        matches, ms = template_matches(img_bgr, pole_rule, ignore_rects,
                                       args.match_threshold, args.max_candidates_per_rule)
        log(f"  Pole rule: {len(matches)} matches ({ms:.0f}ms)", indent=1)
        for m in matches:
            cand = {
                "candidate_id": new_id(),
                "candidate_type": "pole_candidate",
                "page_number": args.page,
                "bbox": m["bbox"],
                "centroid": m["centroid"],
                "geometry": {"type": "point", "x": m["centroid"][0], "y": m["centroid"][1], "radius": 8},
                "system_guess": "pole",
                "confidence": round(m["match_score"], 3),
                "learned_from_examples": pole_rule["derived_from_examples"],
                "matched_rule_ids": [pole_rule["rule_id"]],
                "step_origin": "step_2_teach_pole_appearance",
                "associated_candidates": [],
                "audit_notes": [],
            }
            candidates.append(cand)
            pole_cands.append(cand)

    # Apply sign-count tick rule with pole-distance filter
    # (v0.3: label_type renamed from tick_mark → sign_count_tick; we still
    #  accept the legacy name for backward compat.)
    tick_rule = next(
        (r for r in rules if r["label_type"] in ("sign_count_tick", "tick_mark")),
        None,
    )
    if tick_rule:
        matches, ms = template_matches(img_bgr, tick_rule, ignore_rects,
                                       args.match_threshold * 0.85, args.max_candidates_per_rule)
        # Wrap as candidates for filter
        tick_cands_pre = [{
            "candidate_id": new_id(),
            "candidate_type": "sign_count_tick_candidate",
            "page_number": args.page,
            "bbox": m["bbox"],
            "centroid": m["centroid"],
            "geometry": {"type": "line_region", "bbox": m["bbox"]},
            "system_guess": "sign_count_tick",
            "confidence": round(m["match_score"], 3),
            "learned_from_examples": tick_rule["derived_from_examples"],
            "matched_rule_ids": [tick_rule["rule_id"]],
            "step_origin": "step_3_teach_sign_count",
            "associated_candidates": [],
            "audit_notes": [],
        } for m in matches]
        kept, dropped = filter_ticks_by_pole_distance(
            pole_cands, tick_cands_pre, args.min_tick_pole_px, args.max_tick_pole_px
        )
        log(f"  Tick rule: {len(matches)} raw → {len(kept)} kept after pole-distance filter "
            f"(dropped {dropped}) ({ms:.0f}ms)", indent=1)
        for t in kept:
            t.setdefault("audit_notes", []).append(
                f"pole_distance_validated ({t.get('nearest_pole_distance_px')}px)"
            )
        candidates.extend(kept)

    # Apply code rule
    code_cands: List[Dict] = []
    code_rule = next((r for r in rules if r["label_type"] == "sign_code_text"), None)
    if code_rule:
        synth = dict(code_rule)
        synth["patches"] = [
            {
                "training_example_id": r["training_example_id"],
                "patch_path": r["patch_path"],
                "patch_size_px": r["size_px"],
            }
            for r in code_rule.get("regions", [])
        ]
        matches, ms = template_matches(img_bgr, synth, ignore_rects,
                                       args.match_threshold * 0.85, args.max_candidates_per_rule)
        log(f"  Code rule: {len(matches)} matches ({ms:.0f}ms)", indent=1)
        for m in matches:
            cand = {
                "candidate_id": new_id(),
                "candidate_type": "sign_code_candidate",
                "page_number": args.page,
                "bbox": m["bbox"],
                "centroid": m["centroid"],
                "geometry": {"type": "rectangle", "bbox": m["bbox"]},
                "system_guess": "sign_code_text",
                "confidence": round(m["match_score"], 3),
                "learned_from_examples": code_rule["derived_from_examples"],
                "matched_rule_ids": [code_rule["rule_id"]],
                "step_origin": "step_4_teach_sign_code",
                "associated_candidates": [],
                "audit_notes": [],
            }
            candidates.append(cand)
            code_cands.append(cand)

    # Apply sign_symbol rule (optional — only if step 5 had examples)
    symbol_cands: List[Dict] = []
    symbol_rule = next((r for r in rules if r["label_type"] == "sign_symbol"), None)
    if symbol_rule:
        synth = dict(symbol_rule)
        synth["patches"] = [
            {
                "training_example_id": r["training_example_id"],
                "patch_path": r["patch_path"],
                "patch_size_px": r["size_px"],
            }
            for r in symbol_rule.get("regions", [])
        ]
        matches, ms = template_matches(img_bgr, synth, ignore_rects,
                                       args.match_threshold * 0.85, args.max_candidates_per_rule)
        log(f"  Symbol rule: {len(matches)} matches ({ms:.0f}ms)", indent=1)
        for m in matches:
            cand = {
                "candidate_id": new_id(),
                "candidate_type": "sign_symbol_candidate",
                "page_number": args.page,
                "bbox": m["bbox"],
                "centroid": m["centroid"],
                "geometry": {"type": "rectangle", "bbox": m["bbox"]},
                "system_guess": "sign_symbol",
                "confidence": round(m["match_score"], 3),
                "learned_from_examples": symbol_rule["derived_from_examples"],
                "matched_rule_ids": [symbol_rule["rule_id"]],
                "step_origin": "step_5_teach_sign_symbol",
                "associated_candidates": [],
                "audit_notes": [],
            }
            candidates.append(cand)
            symbol_cands.append(cand)

    # Apply associations — both code→pole and symbol→pole
    assoc_code_rule = next(
        (r for r in rules if r["label_type"] == "pole_to_code_association"), None
    )
    n_links_code = associate_codes_to_poles(pole_cands, code_cands, assoc_code_rule)
    log(f"  Associations (code↔pole): {n_links_code}", indent=1)

    assoc_symbol_rule = next(
        (r for r in rules if r["label_type"] == "pole_to_symbol_association"), None
    )
    n_links_symbol = associate_codes_to_poles(pole_cands, symbol_cands, assoc_symbol_rule)
    log(f"  Associations (symbol↔pole): {n_links_symbol}", indent=1)
    n_links = n_links_code + n_links_symbol

    # Evidence + review questions
    log(f"\nStep 7 (system): Generating evidence crops and review queue ...")
    review_questions: List[Dict] = []
    for cand in candidates:
        crop = save_evidence_crop(img_bgr, cand, evidence_dir)
        if crop:
            cand["evidence_crop_path"] = crop
        # Boost for association presence
        if cand.get("associated_candidates"):
            cand["confidence"] = min(1.0, round(cand["confidence"] * 1.15, 3))
        cand["requires_review"] = cand["confidence"] < args.review_threshold
        q = make_review_question(cand, args.review_threshold)
        if q:
            cand["review_question"] = q["review_question_id"]
            review_questions.append(q)
        else:
            cand["review_question"] = None
    log(f"  Evidence crops: {len(candidates)}")
    log(f"  Review questions: {len(review_questions)}")

    # Write outputs
    # Canonical name (per Manual Training Agent spec); a legacy v0.2 alias is
    # also written so older consumers don't break.
    cand_payload = {
        "schema_version": "1.0",
        "validation_status": "Algorithmic POC output — NOT human validated.",
        "engine": "engine_c_v0.3_manual_first",
        "plan_id": wizard_state.get("plan_id"),
        "page_number": args.page,
        "image_path": page_img_path,
        "image_size_px": [w, h],
        "image_dpi": args.dpi,
        "wizard_origin": True,
        "candidates": candidates,
    }
    cand_out = out_root / "visual_agent_candidates.json"
    with open(cand_out, "w", encoding="utf-8") as fh:
        json.dump(cand_payload, fh, indent=2)
    log(f"  Saved {cand_out.name}")
    # Legacy v0.2 alias
    legacy_cand_out = out_root / "visual_agent_candidates_from_training.json"
    with open(legacy_cand_out, "w", encoding="utf-8") as fh:
        json.dump(cand_payload, fh, indent=2)

    # Copy the input training examples into the run for traceability
    example_copy_path = out_root / "visual_training_examples.example.json"
    with open(example_copy_path, "w", encoding="utf-8") as fh:
        json.dump(wizard_data, fh, indent=2, ensure_ascii=False)
    log(f"  Saved {example_copy_path.name} (input copy for traceability)")

    q_out = out_root / "visual_review_questions.json"
    with open(q_out, "w", encoding="utf-8") as fh:
        json.dump({
            "schema_version": "1.0",
            "plan_id": wizard_state.get("plan_id"),
            "page_number": args.page,
            "questions": review_questions,
        }, fh, indent=2)
    log(f"  Saved {q_out.name}")

    by_type: Dict[str, int] = {}
    for c in candidates:
        by_type[c["candidate_type"]] = by_type.get(c["candidate_type"], 0) + 1

    elapsed_s = time.perf_counter() - t_total
    write_md_report(out_root / "manual_training_report.md", wizard_state, rules,
                    candidates, review_questions, n_links, elapsed_s, args, by_type, page_img_path)
    write_html_report(out_root / "manual_training_report.html", wizard_state, rules,
                      candidates, review_questions, n_links, elapsed_s, args, by_type)
    log(f"  Saved manual_training_report.md / .html")

    log("")
    log("============================================================")
    log("DONE — Engine C v0.2 (Manual Training POC)")
    log("============================================================")
    log(f"  Wizard ready_for_apply : {wizard_state['ready_for_apply']}")
    log(f"  Rules extracted        : {len(rules)}")
    log(f"  Candidates produced    : {len(candidates)}")
    for k, v in sorted(by_type.items()):
        log(f"    {k}: {v}", indent=2)
    log(f"  Associations (code↔pole): {n_links}")
    log(f"  Review questions       : {len(review_questions)}")
    log(f"  Total elapsed          : {elapsed_s:.1f}s")
    log("")
    log("  STATUS: Algorithmic POC output — NOT human validated.")
    log("  This is manual-teaching mode. Detection runs ONLY after user marks examples.")
    log("  Detection corrections improve future scans but do NOT auto-approve BOQ.")
    log("")
    log("  Output files:")
    log(f"    outputs/manual_training/wizard_state.json")
    log(f"    outputs/manual_training/visual_learning_rules.json")
    log(f"    outputs/manual_training/visual_agent_candidates.json (+ legacy alias visual_agent_candidates_from_training.json)")
    log(f"    outputs/manual_training/visual_training_examples.example.json (copy of input for traceability)")
    log(f"    outputs/manual_training/visual_review_questions.json")
    log(f"    outputs/manual_training/manual_training_report.md")
    log(f"    outputs/manual_training/manual_training_report.html")
    log(f"    outputs/manual_training/evidence_crops/  ({len(candidates)} crops)")
    log(f"    outputs/manual_training/templates/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
