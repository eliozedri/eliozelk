#!/usr/bin/env python3
"""
14_build_review_queue.py — Research Review Queue Generator
research/cad-pdf-intelligence/

Aggregates outputs from all CAD/PDF pipeline stages into a structured
human review package:
  outputs/review_queue.json
  outputs/review_queue.html
  outputs/review_queue_report.md
  outputs/review_items/OCC-XXXX.png   (per-OCC 3-panel visual)

RESEARCH ONLY. No output is approved BOQ data.
All items require human validation before operational use.
"""

import argparse
import json
import sys
import time
import datetime as dt
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from plan_run_context import PlanRunContext

# ─────────────────────────────────────────────────────────────────────────────
# PATHS
# ─────────────────────────────────────────────────────────────────────────────
BASE    = Path(__file__).parent
OUT     = BASE / "outputs"
ITEMS   = OUT / "review_items"
# Note: ITEMS.mkdir() moved into main() so plan-scoped mode creates the right dir

OUT_JSON   = OUT / "review_queue.json"
OUT_HTML   = OUT / "review_queue.html"
OUT_REPORT = OUT / "review_queue_report.md"

# Input files
POC3_JSON  = OUT / "vector_glyph_results.json"
POC1_JSON  = OUT / "tight_numeric_crop_results.json"
POC2_JSON  = OUT / "digit_template_results.json"
LEG_JSON   = OUT / "legend_vocabulary.json"
INV_JSON   = OUT / "sign_inventory.json"

# Image directories (relative to OUT for HTML href)
DIR_SG     = "stage_g_code_crops"         # Stage G OCC crops
DIR_TIGHT  = "tight_numeric_crops"        # POC 1 tight crops
DIR_DBG    = "vector_glyph_debug"         # POC 3 debug images
DIR_ITEMS  = "review_items"              # per-OCC review panels

# Panel layout
PANEL_H    = 320
THUMB_H    = 280
LABEL_H    = 40

# Issue priority colours (BGR for cv2)
PRIORITY_COLOR = {
    "HIGH":   (50,  50,  220),   # red
    "MEDIUM": (30, 150, 220),    # amber
    "LOW":    (180, 120,  40),   # blue-ish
}
PRIORITY_BG = {
    "HIGH":   (235, 235, 255),
    "MEDIUM": (235, 245, 255),
    "LOW":    (255, 245, 235),
}

DISCLAIMER = (
    "RESEARCH ONLY — No output from this review queue is approved BOQ data. "
    "All items require human validation before operational use."
)


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _rel(abs_path: Optional[str]) -> Optional[str]:
    """Convert an absolute path inside OUT to a relative path from OUT."""
    if not abs_path:
        return None
    try:
        return str(Path(abs_path).relative_to(OUT))
    except ValueError:
        return None


def _exists(rel: Optional[str]) -> bool:
    if not rel:
        return False
    return (OUT / rel).exists()


def _load_json(path: Path) -> list:
    if not path.exists():
        print(f"  [warn] Not found: {path.name}")
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _index_by_occ(records: list, key: str = "occurrence_id") -> Dict[str, dict]:
    return {r[key]: r for r in records if key in r}


def _resize_h(img: np.ndarray, target_h: int) -> np.ndarray:
    h, w = img.shape[:2]
    if h == 0 or w == 0:
        return np.full((target_h, target_h, 3), 220, dtype=np.uint8)
    nw = max(1, int(w * target_h / h))
    return cv2.resize(img, (nw, target_h), interpolation=cv2.INTER_AREA)


def _load_img(rel: Optional[str]) -> Optional[np.ndarray]:
    if not rel or not (OUT / rel).exists():
        return None
    img = cv2.imread(str(OUT / rel))
    return img if img is not None else None


def _blank_placeholder(h: int, w: int, text: str = "no image") -> np.ndarray:
    img = np.full((h, w, 3), 230, dtype=np.uint8)
    cv2.putText(img, text, (6, h // 2 + 6),
                cv2.FONT_HERSHEY_SIMPLEX, 0.38, (130, 130, 130), 1)
    return img


def _label_strip(text: str, width: int, height: int = LABEL_H,
                 bg: tuple = (245, 245, 245), fc: tuple = (30, 30, 30)) -> np.ndarray:
    strip = np.full((height, width, 3), list(bg)[::-1], dtype=np.uint8)
    lines = text.split("\n")
    y = 14
    for line in lines[:3]:
        cv2.putText(strip, line, (6, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.33, list(fc)[::-1], 1)
        y += 13
    return strip


# ─────────────────────────────────────────────────────────────────────────────
# ISSUE CLASSIFICATION
# ─────────────────────────────────────────────────────────────────────────────

def classify_issue(poc3: dict, poc1: Optional[dict]) -> Tuple[str, str, str]:
    """
    Returns (suspected_issue, issue_detail, review_priority).
    Priority order is important — first match wins.
    """
    tier      = poc3.get("confidence_tier", "FAILED")
    flags     = poc3.get("artifact_flags", {}) or {}
    amb       = poc3.get("ambiguity_flags", {}) or {}
    display   = poc3.get("display_sequence", "") or ""
    cands     = poc3.get("reconstructed_code_candidates", []) or []
    artifacts = poc3.get("rejected_or_suspicious_numeric_artifacts", []) or []
    fail      = poc3.get("_fail_reason", "") or ""
    q1        = float((poc1 or {}).get("best_quality_score", 0.5) or 0.5)

    # 1. False adjacency artifact
    if flags.get("false_adjacency_artifact_removed"):
        return (
            "false_adjacency_removed",
            "Adjacent group removed — was a geometric artifact (negative x-gap bug). "
            "No real digit group exists near this sign in vector data.",
            "MEDIUM",
        )

    # 2. Possible noise (negative-labeled path)
    if amb.get("has_negative_labeled"):
        return (
            "possible_noise",
            "Group contains a path classified as non-digit (structural element or noise). "
            "Likely not a sign code region.",
            "MEDIUM",
        )

    # 3. Suspicious code (leading zero or artifact pattern)
    if flags.get("suspicious_code_flag") or flags.get("artifact_flag") or artifacts:
        return (
            "suspicious_code",
            f"Suspicious pattern detected — artifacts: {artifacts or 'leading zero or invalid format'}. "
            "Sequence format inconsistent with sign code convention.",
            "HIGH",
        )

    # 4. Incomplete code (some known digits + unknown clusters)
    if tier in ("MEDIUM", "LOW") and display and "CL-" in display:
        parts   = display.split("/")
        known   = [p for p in parts if "CL-" not in p and p not in ("[N]", "")]
        unknown = [p for p in parts if p.startswith("CL-")]
        if known:
            return (
                "incomplete_code",
                f"Sequence {display!r}: {len(known)} resolved digit(s) + "
                f"{len(unknown)} unresolved cluster(s). Cannot reconstruct full code.",
                "HIGH",
            )
        else:
            return (
                "ambiguous_cluster",
                f"Sequence {display!r}: all {len(unknown)} position(s) are unresolved clusters. "
                "No digit label assigned to any position.",
                "MEDIUM",
            )

    # 5. Weak digit sequence (complete digits but too short)
    if tier in ("MEDIUM", "LOW") and cands:
        code = cands[0]
        if len(code) < 3:
            return (
                "weak_digit_sequence",
                f'Reconstructed "{code}" — {len(code)}-digit sequence, '
                "below the catalog minimum of 101 (3 digits required).",
                "HIGH",
            )
        return (
            "weak_digit_sequence",
            f'Reconstructed "{code}" — 3-digit but classified weak: '
            "insufficient trusted labels to confirm.",
            "MEDIUM",
        )

    # 6. Spatial association unclear
    if q1 < 0.40:
        return (
            "spatial_association_unclear",
            f"POC 1 crop quality score {q1:.2f} — below 0.40. "
            "Tight crop region may be misaligned with the sign.",
            "MEDIUM",
        )

    # 7. No recoverable vector code
    if tier == "FAILED":
        if "false_group" in fail:
            return (
                "false_adjacency_removed",
                "False adjacency group removed. No real digit group found near this sign.",
                "MEDIUM",
            )
        return (
            "no_recoverable_vector_code",
            "No adjacent digit group found. Vector glyph recognition could not locate "
            "a readable code region for this sign.",
            "LOW",
        )

    # 8. Default
    return (
        "unreadable_code",
        "Automatic recognition could not produce a reliable code. Manual inspection required.",
        "LOW",
    )


def determine_actions(issue: str, poc3: dict) -> List[str]:
    tier = poc3.get("confidence_tier", "FAILED")
    display = poc3.get("display_sequence", "") or ""
    actions = []

    if issue in ("weak_digit_sequence", "incomplete_code", "suspicious_code",
                 "false_adjacency_removed", "spatial_association_unclear",
                 "unreadable_code", "ambiguous_cluster"):
        actions.append("enter_sign_code_manually")

    if issue in ("possible_noise",):
        actions += ["mark_not_a_sign", "mark_noise"]

    if issue in ("no_recoverable_vector_code", "false_adjacency_removed",
                 "spatial_association_unclear", "unreadable_code"):
        actions.append("mark_needs_field_review")

    if tier in ("MEDIUM", "LOW") and display:
        actions.append("add_teaching_rule")

    if "CL-" in display:
        actions.append("add_teaching_rule")

    actions.append("link_to_pole_assembly")

    # Deduplicate preserving order
    seen = set()
    result = []
    for a in actions:
        if a not in seen:
            seen.add(a)
            result.append(a)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# FIND CROP PATHS
# ─────────────────────────────────────────────────────────────────────────────

def find_poc3_debug(occ_id: str, tier: str) -> Optional[str]:
    """Locate the POC 3 debug image for an OCC."""
    tier_dir = tier.lower()
    rel = f"{DIR_DBG}/{tier_dir}/{occ_id}_debug.png"
    if (OUT / rel).exists():
        return rel
    # fallback: scan all tier dirs
    for t in ("medium", "low", "failed", "ambiguous"):
        rel2 = f"{DIR_DBG}/{t}/{occ_id}_debug.png"
        if (OUT / rel2).exists():
            return rel2
    return None


def build_crops_dict(occ_id: str, poc1: Optional[dict], poc3: dict) -> dict:
    tier = poc3.get("confidence_tier", "FAILED")

    # Stage G crop
    sg_rel = _rel(poc3.get("original_crop_path")) or f"{DIR_SG}/{occ_id}.png"
    if not _exists(sg_rel):
        sg_rel = None

    # Tight numeric crops from POC 1
    tight_rels = []
    if poc1:
        for p in (poc1.get("tight_numeric_crop_paths") or []):
            r = _rel(p)
            if r and _exists(r):
                tight_rels.append(r)

    # POC 3 debug image
    dbg_rel = find_poc3_debug(occ_id, tier)

    return {
        "stage_g":       sg_rel,
        "tight_candidates": tight_rels,
        "poc3_debug":    dbg_rel,
        "review_panel":  f"{DIR_ITEMS}/{occ_id}.png",
    }


# ─────────────────────────────────────────────────────────────────────────────
# BUILD REVIEW ITEM
# ─────────────────────────────────────────────────────────────────────────────

def build_review_item(occ_id: str, poc3: dict, poc1: Optional[dict],
                      poc2: Optional[dict]) -> dict:
    tier     = poc3.get("confidence_tier", "FAILED")
    display  = poc3.get("display_sequence", "") or ""
    cands    = poc3.get("reconstructed_code_candidates", []) or []
    conf     = poc3.get("final_research_confidence", 0.0)
    flags    = poc3.get("artifact_flags", {}) or {}

    issue, detail, priority = classify_issue(poc3, poc1)
    actions = determine_actions(issue, poc3)
    crops   = build_crops_dict(occ_id, poc1, poc3)

    poc1_quality = float((poc1 or {}).get("best_quality_score", 0.0) or 0.0)
    poc1_ndist   = float((poc1 or {}).get("best_ndist", 1.0) or 1.0)
    poc2_matched = bool((poc2 or {}).get("best_match_code"))

    return {
        "occurrence_id": occ_id,
        "page_number":   poc3.get("page_number", 0),
        "crops":         crops,
        "auto_result": {
            "poc3_tier":        tier,
            "poc3_sequence":    display,
            "poc3_candidates":  cands,
            "poc3_confidence":  round(conf, 4),
            "poc3_fail_reason": poc3.get("_fail_reason"),
            "poc1_quality":     round(poc1_quality, 3),
            "poc1_ndist":       round(poc1_ndist, 3),
            "poc2_matched":     poc2_matched,
        },
        "suspected_issue":                issue,
        "issue_detail":                   detail,
        "suggested_actions":              actions,
        "review_priority":                priority,
        "false_adjacency_artifact_removed": bool(flags.get("false_adjacency_artifact_removed")),
        "teaching_loop_candidate":        tier in ("MEDIUM", "LOW"),
        "requires_review":                True,
        "validation_status":              "unresolved",
        # Future fields — not populated yet
        "human_confirmed_code":           None,
        "human_label_source":             None,   # "human_review_written_code" when filled
        "approved_for_boq":               False,
    }


# ─────────────────────────────────────────────────────────────────────────────
# PER-OCC VISUAL PANEL
# ─────────────────────────────────────────────────────────────────────────────

def build_per_occ_panel(item: dict) -> np.ndarray:
    """
    3-column panel: [Stage G crop | Best tight crop | POC 3 debug]
    + bottom metadata strip.
    """
    crops    = item["crops"]
    occ_id   = item["occurrence_id"]
    tier     = item["auto_result"]["poc3_tier"]
    display  = item["auto_result"]["poc3_sequence"] or "—"
    cands    = item["auto_result"]["poc3_candidates"]
    issue    = item["suspected_issue"]
    priority = item["review_priority"]
    priority_bgr = PRIORITY_COLOR.get(priority, (100, 100, 100))
    bg_bgr       = PRIORITY_BG.get(priority, (240, 240, 240))

    TH = THUMB_H  # thumbnail height

    # Column 1: Stage G crop
    img1 = _load_img(crops.get("stage_g"))
    if img1 is None:
        col1 = _blank_placeholder(TH, 200, "no Stage G crop")
    else:
        col1 = _resize_h(img1, TH)

    # Column 2: Best tight crop (or blank)
    tight = crops.get("tight_candidates", [])
    img2 = _load_img(tight[0]) if tight else None
    if img2 is None:
        col2 = _blank_placeholder(TH, 200, "no tight crop")
    else:
        col2 = _resize_h(img2, TH)

    # Column 3: POC 3 debug image
    img3 = _load_img(crops.get("poc3_debug"))
    if img3 is None:
        col3 = _blank_placeholder(TH, 200, "no vector debug")
    else:
        col3 = _resize_h(img3, TH)

    # Thin separator columns
    sep = np.full((TH, 4, 3), 180, dtype=np.uint8)
    top_row = np.hstack([col1, sep, col2, sep, col3])
    W = top_row.shape[1]

    # Metadata strip
    code_str = cands[0] if cands else "—"
    meta_line1 = (f"{occ_id}  |  tier: {tier}  |  sequence: {display}  |  "
                  f"candidates: {code_str}")
    meta_line2 = f"issue: {issue}  |  priority: {priority}  |  "
    meta_line2 += f"actions: {', '.join(item['suggested_actions'][:3])}"

    strip_h = LABEL_H
    strip = np.full((strip_h, W, 3), list(bg_bgr)[::-1], dtype=np.uint8)
    cv2.putText(strip, meta_line1, (6, 16),
                cv2.FONT_HERSHEY_SIMPLEX, 0.36, list(priority_bgr)[::-1], 1)
    cv2.putText(strip, meta_line2, (6, 32),
                cv2.FONT_HERSHEY_SIMPLEX, 0.33, (60, 60, 60), 1)

    # Column header labels
    header_h = 20
    header = np.full((header_h, W, 3), (200, 210, 220), dtype=np.uint8)
    w1 = col1.shape[1]
    w2 = col2.shape[1]
    cv2.putText(header, "Stage G crop", (4, 14),
                cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 0, 80), 1)
    cv2.putText(header, "Tight crop (POC 1)", (w1 + 8, 14),
                cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 80, 0), 1)
    cv2.putText(header, "Vector glyph debug (POC 3)", (w1 + w2 + 12, 14),
                cv2.FONT_HERSHEY_SIMPLEX, 0.35, (80, 0, 80), 1)

    return np.vstack([header, top_row, strip])


# ─────────────────────────────────────────────────────────────────────────────
# HTML GENERATION
# ─────────────────────────────────────────────────────────────────────────────

_HTML_CSS = """
  body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#f8fafc;color:#1e293b}
  h1{font-size:1.5rem;margin-bottom:4px}
  .meta{font-size:.8rem;color:#64748b;margin-bottom:16px}
  .disclaimer{background:#fef9c3;border:1px solid #fde68a;border-radius:8px;
    padding:12px 16px;font-size:.82rem;margin-bottom:24px;color:#92400e}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:28px}
  .stat{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:14px;text-align:center}
  .stat .n{font-size:1.8rem;font-weight:700;line-height:1}
  .stat .lbl{font-size:.72rem;color:#64748b;margin-top:4px}
  .section{margin-bottom:36px}
  .sec-hdr{font-size:1rem;font-weight:700;padding:8px 14px;border-radius:6px;
    margin-bottom:12px;display:inline-block}
  .high .sec-hdr{background:#fee2e2;color:#b91c1c}
  .medium .sec-hdr{background:#fef3c7;color:#b45309}
  .low .sec-hdr{background:#eff6ff;color:#1d4ed8}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:8px;
    padding:14px;margin-bottom:10px;display:grid;
    grid-template-columns:260px 1fr;gap:14px}
  .card:hover{border-color:#94a3b8}
  .card-info{display:flex;flex-direction:column;gap:6px}
  .occ-id{font-weight:700;font-size:.92rem;font-family:monospace}
  .badge{display:inline-block;padding:2px 8px;border-radius:10px;
    font-size:.7rem;font-weight:600;margin-right:4px}
  .tier-MEDIUM{background:#d1fae5;color:#065f46}
  .tier-LOW{background:#dbeafe;color:#1e40af}
  .tier-FAILED{background:#fee2e2;color:#991b1b}
  .tier-HIGH{background:#fef3c7;color:#92400e}
  .issue-tag{background:#f1f5f9;color:#475569;padding:3px 8px;
    border-radius:4px;font-size:.74rem;font-family:monospace}
  .detail{font-size:.78rem;color:#475569;line-height:1.45;margin:2px 0}
  .actions{margin:4px 0;padding-left:14px;font-size:.76rem;color:#334155}
  .actions li{margin:2px 0}
  .seq{font-family:monospace;font-size:.82rem;color:#0f172a;
    background:#f1f5f9;padding:2px 6px;border-radius:4px}
  .card-imgs{display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap}
  .card-imgs a{display:block;text-align:center;text-decoration:none;color:#64748b;font-size:.65rem}
  .card-imgs img{display:block;height:110px;border:1px solid #cbd5e1;
    border-radius:4px;margin-bottom:2px;background:#f8fafc}
  .panel-link{display:block;margin-top:6px;font-size:.72rem;color:#6366f1}
  .no-img{height:110px;width:90px;background:#f1f5f9;border:1px solid #e2e8f0;
    border-radius:4px;display:flex;align-items:center;justify-content:center;
    font-size:.65rem;color:#94a3b8;text-align:center;padding:4px}
  .false-adj{background:#fdf2f8;border-color:#e879f9}
  footer{font-size:.72rem;color:#94a3b8;margin-top:36px;padding-top:12px;
    border-top:1px solid #e2e8f0}
  @media print{.card-imgs img{height:80px}.card{grid-template-columns:220px 1fr}}
"""


def _img_tag(rel: Optional[str], label: str, h: int = 110) -> str:
    if not rel or not _exists(rel):
        return f'<div class="no-img">{label}<br>(missing)</div>'
    return (f'<a href="{rel}" target="_blank" title="{label}">'
            f'<img src="{rel}" alt="{label}" style="height:{h}px">'
            f'<span>{label}</span></a>')


def build_html(items: List[dict], elapsed: float) -> str:
    now = dt.datetime.now().isoformat(timespec="seconds")
    total = len(items)
    by_issue   = Counter(i["suspected_issue"] for i in items)
    by_tier    = Counter(i["auto_result"]["poc3_tier"] for i in items)
    by_pri     = Counter(i["review_priority"] for i in items)
    n_false    = sum(1 for i in items if i["false_adjacency_artifact_removed"])
    n_teaching = sum(1 for i in items if i["teaching_loop_candidate"])

    # Stats block
    stats_html = "".join([
        f'<div class="stat"><div class="n">{total}</div><div class="lbl">Total OCCs</div></div>',
        f'<div class="stat"><div class="n" style="color:#b91c1c">{by_pri["HIGH"]}</div>'
        f'<div class="lbl">HIGH priority</div></div>',
        f'<div class="stat"><div class="n" style="color:#b45309">{by_pri["MEDIUM"]}</div>'
        f'<div class="lbl">MEDIUM priority</div></div>',
        f'<div class="stat"><div class="n" style="color:#1d4ed8">{by_pri["LOW"]}</div>'
        f'<div class="lbl">LOW priority</div></div>',
        f'<div class="stat"><div class="n">{by_tier.get("MEDIUM",0)+by_tier.get("LOW",0)}</div>'
        f'<div class="lbl">With sequence</div></div>',
        f'<div class="stat"><div class="n">{n_false}</div>'
        f'<div class="lbl">False adj. removed</div></div>',
        f'<div class="stat"><div class="n">{n_teaching}</div>'
        f'<div class="lbl">Teaching candidates</div></div>',
    ])

    action_label = {
        "enter_sign_code_manually": "Enter sign code manually",
        "mark_not_a_sign":          "Mark as not a sign",
        "mark_noise":               "Mark as noise",
        "mark_needs_field_review":  "Needs field/manual review",
        "link_to_pole_assembly":    "Link to pole/assembly",
        "add_teaching_rule":        "Add teaching rule",
    }

    # Sections by priority
    sections_html = ""
    for pri in ("HIGH", "MEDIUM", "LOW"):
        pri_items = [i for i in items if i["review_priority"] == pri]
        if not pri_items:
            continue
        sec_cls = pri.lower()
        section = (f'<div class="section {sec_cls}">'
                   f'<div class="sec-hdr">{pri} Priority — {len(pri_items)} items</div>')

        # Sort: false_adjacency first, then by confidence descending
        pri_items_sorted = sorted(
            pri_items,
            key=lambda x: (
                not x["false_adjacency_artifact_removed"],
                -(x["auto_result"].get("poc3_confidence") or 0),
            )
        )

        for item in pri_items_sorted:
            occ    = item["occurrence_id"]
            tier   = item["auto_result"]["poc3_tier"]
            seq    = item["auto_result"]["poc3_sequence"]
            cands  = item["auto_result"]["poc3_candidates"]
            issue  = item["suspected_issue"]
            detail = item["issue_detail"]
            crops  = item["crops"]
            conff  = item["auto_result"]["poc3_confidence"]
            q1     = item["auto_result"]["poc1_quality"]
            acts   = item["suggested_actions"]
            false_adj = item["false_adjacency_artifact_removed"]

            extra_cls = " false-adj" if false_adj else ""

            # Confidence display
            conf_str  = f"{conff:.3f}" if conff else "n/a"
            q1_str    = f"{q1:.2f}" if q1 else "n/a"

            # Sequence display
            seq_disp = f'<span class="seq">{seq}</span>' if seq else '<em>none</em>'
            cands_disp = (f'<span class="seq">{", ".join(cands)}</span>'
                          if cands else '<em>—</em>')

            # Action list
            acts_html = "".join(
                f'<li>{action_label.get(a, a)}</li>' for a in acts
            )

            # Thumbnails
            thumbs = _img_tag(crops.get("stage_g"), "Stage G")
            tight_list = crops.get("tight_candidates") or []
            thumbs += _img_tag(tight_list[0] if tight_list else None, "Tight crop")
            thumbs += _img_tag(crops.get("poc3_debug"), "Vector debug")
            panel_rel = crops.get("review_panel")
            panel_link = (f'<a class="panel-link" href="{panel_rel}" target="_blank">'
                          f'→ Full review panel</a>'
                          if panel_rel and _exists(panel_rel) else "")

            card_html = f"""
<div class="card{extra_cls}">
  <div class="card-info">
    <div class="occ-id">{occ}
      <span class="badge tier-{tier}">{tier}</span>
      {('<span class="badge" style="background:#f5d0fe;color:#7e22ce">false_adj_removed</span>'
        if false_adj else '')}
    </div>
    <div>
      <span class="issue-tag">{issue}</span>
    </div>
    <div class="detail">{detail}</div>
    <div style="font-size:.74rem;color:#64748b">
      seq: {seq_disp} &nbsp;|&nbsp; candidates: {cands_disp}<br>
      POC3 conf: {conf_str} &nbsp;|&nbsp; POC1 quality: {q1_str}
    </div>
    <div style="font-size:.74rem;color:#475569;font-weight:600;margin-top:4px">
      Suggested actions:
    </div>
    <ul class="actions">{acts_html}</ul>
    {panel_link}
  </div>
  <div class="card-imgs">
    {thumbs}
  </div>
</div>"""
            section += card_html

        section += "</div>"
        sections_html += section

    issue_summary = "".join(
        f"<tr><td style='font-family:monospace;font-size:.8rem'>{k}</td>"
        f"<td style='text-align:right'>{v}</td></tr>"
        for k, v in sorted(by_issue.items(), key=lambda x: -x[1])
    )

    html = f"""<!DOCTYPE html>
<html lang="he" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>CAD/PDF Plan Scanner — Research Review Queue</title>
  <style>{_HTML_CSS}</style>
</head>
<body>
<h1>CAD/PDF Plan Scanner — Research Review Queue</h1>
<div class="meta">
  Generated: {now} &nbsp;|&nbsp;
  Pipeline: Stage G + POC 1 + POC 2 + POC 3 vector glyph &nbsp;|&nbsp;
  Elapsed: {elapsed:.1f}s
</div>
<div class="disclaimer">
  ⚠️ {DISCLAIMER}
</div>

<div class="stats">{stats_html}</div>

<details style="margin-bottom:20px">
  <summary style="cursor:pointer;font-weight:600;font-size:.85rem;color:#475569">
    Issue breakdown (click to expand)
  </summary>
  <table style="margin-top:8px;border-collapse:collapse;font-size:.82rem">
    <thead><tr><th style="text-align:left;padding:4px 12px 4px 0">Suspected Issue</th>
    <th style="padding:4px 0">Count</th></tr></thead>
    <tbody>{issue_summary}</tbody>
  </table>
</details>

{sections_html}

<footer>
  Research-only pipeline &nbsp;|&nbsp;
  No output is approved BOQ data &nbsp;|&nbsp;
  Written Code First principle applies: human-confirmed codes must be entered manually &nbsp;|&nbsp;
  Future: feeds תרגול ולמידה / Teaching Loop / BOQ audit trail
</footer>
</body>
</html>"""
    return html


# ─────────────────────────────────────────────────────────────────────────────
# MARKDOWN REPORT
# ─────────────────────────────────────────────────────────────────────────────

def build_report(items: List[dict], elapsed: float) -> str:
    now   = dt.datetime.now().isoformat(timespec="seconds")
    total = len(items)
    by_issue   = Counter(i["suspected_issue"] for i in items)
    by_tier    = Counter(i["auto_result"]["poc3_tier"] for i in items)
    by_pri     = Counter(i["review_priority"] for i in items)
    n_false    = sum(1 for i in items if i["false_adjacency_artifact_removed"])
    n_teaching = sum(1 for i in items if i["teaching_loop_candidate"])

    high_items = [i for i in items if i["review_priority"] == "HIGH"]
    med_items  = [i for i in items if i["review_priority"] == "MEDIUM"]

    lines = [
        "# CAD/PDF Plan Scanner — Research Review Queue Report",
        "",
        f"**Date:** {now}  ",
        f"**Total OCC regions:** {total}  ",
        f"**Elapsed:** {elapsed:.1f}s  ",
        "",
        "> " + DISCLAIMER,
        "",
        "---",
        "",
        "## Summary",
        "",
        "| Metric | Count |",
        "|--------|-------|",
        f"| Total OCCs in review queue | {total} |",
        f"| HIGH priority (active decision needed) | {by_pri['HIGH']} |",
        f"| MEDIUM priority | {by_pri['MEDIUM']} |",
        f"| LOW priority (background) | {by_pri['LOW']} |",
        f"| With reconstructed sequence (MEDIUM+LOW tier) | "
        f"{by_tier.get('MEDIUM',0)+by_tier.get('LOW',0)} |",
        f"| False adjacency artifact removed | {n_false} |",
        f"| Teaching loop candidates | {n_teaching} |",
        "",
        "## Issue Breakdown",
        "",
        "| Suspected Issue | Count | Priority |",
        "|-----------------|-------|----------|",
    ]
    issue_priority = {
        "suspicious_code":              "HIGH",
        "incomplete_code":              "HIGH",
        "weak_digit_sequence":          "HIGH/MEDIUM",
        "false_adjacency_removed":      "MEDIUM",
        "possible_noise":               "MEDIUM",
        "ambiguous_cluster":            "MEDIUM/HIGH",
        "spatial_association_unclear":  "MEDIUM",
        "no_recoverable_vector_code":   "LOW",
        "unreadable_code":              "LOW",
    }
    for issue, cnt in sorted(by_issue.items(), key=lambda x: -x[1]):
        pri = issue_priority.get(issue, "—")
        lines.append(f"| `{issue}` | {cnt} | {pri} |")

    lines += [
        "",
        "## HIGH Priority — Active Decision Needed",
        "",
        f"**{len(high_items)} OCCs** require the most attention. "
        "These have partial information that a human reviewer can resolve.",
        "",
    ]
    for item in high_items[:20]:   # limit to 20 in report
        occ  = item["occurrence_id"]
        tier = item["auto_result"]["poc3_tier"]
        seq  = item["auto_result"]["poc3_sequence"] or "—"
        iss  = item["suspected_issue"]
        det  = item["issue_detail"]
        acts = ", ".join(item["suggested_actions"][:3])
        lines.append(f"- **{occ}** ({tier}) — `{iss}`  ")
        lines.append(f"  {det}  ")
        lines.append(f"  → Actions: {acts}")
        lines.append("")

    if len(high_items) > 20:
        lines.append(f"_...and {len(high_items)-20} more HIGH priority items. See review_queue.json._")
        lines.append("")

    lines += [
        "## MEDIUM Priority — False Adjacency + Ambiguous",
        "",
        f"**{len(med_items)} OCCs** including {n_false} with false adjacency removed.",
        "",
        f"| OCC | Issue | Detail |",
        f"|-----|-------|--------|",
    ]
    for item in med_items[:30]:
        occ = item["occurrence_id"]
        iss = item["suspected_issue"]
        det = item["issue_detail"][:80] + "..." if len(item["issue_detail"]) > 80 else item["issue_detail"]
        lines.append(f"| {occ} | `{iss}` | {det} |")
    if len(med_items) > 30:
        lines.append(f"| ... | | {len(med_items)-30} more items |")

    lines += [
        "",
        "## Human Teaching Loop Readiness",
        "",
        f"- **{n_teaching} OCCs** are teaching loop candidates (MEDIUM or LOW tier with sequence).",
        "- Each review item in `review_queue.json` includes `teaching_loop_candidate: true/false`.",
        "- When a human enters a code (`human_confirmed_code`) with source "
        "`human_review_written_code`, it can be injected into the teaching loop.",
        "- Teaching rules can target: individual OCC, cluster label, spatial association rule, "
        "or company-level rule (after approval).",
        "",
        "## BOQ Connection",
        "",
        "- Review items include `requires_review: true` and `approved_for_boq: false`.",
        "- No item is approved for BOQ until a human sets `human_confirmed_code` AND "
        "a separate approval step is completed.",
        "- Future: `review_queue.json` feeds the sign code quantity aggregation, "
        "pole/assembly separation, and final BOQ audit trail.",
        "",
        "## Next Steps",
        "",
        "1. **Open `review_queue.html`** in a browser to inspect all items visually.",
        "2. **Review `review_items/` directory** for per-OCC 3-panel image packages.",
        "3. **For HIGH priority items**: manually read the sign code from the crop image "
        "and update `vector_glyph_human_labels.json` with the teaching rule, OR note "
        "the confirmed code for future BOQ entry.",
        "4. **For false_adjacency_removed OCCs** (n=" + str(n_false) + "): "
        "these have no recoverable vector code. Mark for field review.",
        "5. **Future**: upgrade to Streamlit interactive review UI to enable "
        "in-app label entry → `review_labels.json` → teaching loop injection.",
    ]

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    t0 = time.time()
    print("=" * 60)
    print("Research Review Queue Generator")
    print("research/cad-pdf-intelligence/14_build_review_queue.py")
    print("=" * 60)
    print()

    # Create output directories (after any plan-scoped overrides in __main__)
    ITEMS.mkdir(parents=True, exist_ok=True)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)

    # ── Load inputs ──────────────────────────────────────────────
    print("[Load] Reading pipeline outputs ...")
    poc3_list = _load_json(POC3_JSON)
    poc1_list = _load_json(POC1_JSON)
    poc2_list = _load_json(POC2_JSON)
    # Legend + inventory loaded but not yet structured (sign codes = null)
    # Future: when legend_vocabulary.json has sign_code, join here

    poc3_map = _index_by_occ(poc3_list)
    poc1_map = _index_by_occ(poc1_list)
    poc2_map = _index_by_occ(poc2_list)
    all_occ_ids = sorted(poc3_map.keys())
    print(f"  POC 3: {len(poc3_map)} records")
    print(f"  POC 1: {len(poc1_map)} records")
    print(f"  POC 2: {len(poc2_map)} records")
    print(f"  Total OCCs: {len(all_occ_ids)}")

    # ── Build review items ────────────────────────────────────────
    print("[Build] Building review items ...")
    items: List[dict] = []
    for occ_id in all_occ_ids:
        poc3 = poc3_map[occ_id]
        poc1 = poc1_map.get(occ_id)
        poc2 = poc2_map.get(occ_id)
        items.append(build_review_item(occ_id, poc3, poc1, poc2))

    by_pri = Counter(i["review_priority"] for i in items)
    by_iss = Counter(i["suspected_issue"] for i in items)
    print(f"  HIGH={by_pri['HIGH']}  MEDIUM={by_pri['MEDIUM']}  LOW={by_pri['LOW']}")
    print(f"  Top issues: {by_iss.most_common(4)}")

    # ── Generate per-OCC panels ───────────────────────────────────
    print("[Panels] Generating per-OCC visual panels ...")
    n_ok = 0
    for item in items:
        try:
            panel = build_per_occ_panel(item)
            out_path = OUT / item["crops"]["review_panel"]
            cv2.imwrite(str(out_path), panel)
            n_ok += 1
        except Exception as e:
            print(f"  [warn] {item['occurrence_id']}: {e}")
    print(f"  Generated {n_ok}/{len(items)} panels → {ITEMS}")

    # ── Save review_queue.json ────────────────────────────────────
    print("[JSON] Writing review_queue.json ...")
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(items, f, indent=2, ensure_ascii=False)
    print(f"  → {OUT_JSON}  ({len(items)} items)")

    # ── Generate HTML ─────────────────────────────────────────────
    elapsed_so_far = time.time() - t0
    print("[HTML] Generating review_queue.html ...")
    html = build_html(items, elapsed_so_far)
    with open(OUT_HTML, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"  → {OUT_HTML}  ({len(html)//1024}KB)")

    # ── Generate Markdown report ──────────────────────────────────
    print("[Report] Writing review_queue_report.md ...")
    report = build_report(items, elapsed_so_far)
    with open(OUT_REPORT, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"  → {OUT_REPORT}")

    elapsed = time.time() - t0
    print()
    print("=" * 60)
    print("REVIEW QUEUE COMPLETE")
    print("=" * 60)
    print(f"  Total items        : {len(items)}")
    print(f"  HIGH priority      : {by_pri['HIGH']}")
    print(f"  MEDIUM priority    : {by_pri['MEDIUM']}")
    print(f"  LOW priority       : {by_pri['LOW']}")
    print(f"  Per-OCC panels     : {n_ok}  → {ITEMS}")
    print(f"  review_queue.json  : {OUT_JSON}")
    print(f"  review_queue.html  : {OUT_HTML}")
    print(f"  review_queue_report: {OUT_REPORT}")
    print(f"  Elapsed            : {elapsed:.1f}s")
    print()
    print("  Open in browser:")
    print(f"  open {OUT_HTML}")
    print()
    print("  REMINDER: No output is approved BOQ data.")
    print("  All items require human validation before operational use.")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Research Review Queue Generator')
    parser.add_argument(
        '--plan-run-dir', default=None,
        help='Path to a plan-scoped run directory (created by 31_upload_intake_wrapper.py). '
             'If omitted, runs in legacy mode against outputs/',
    )
    _args = parser.parse_args()
    _ctx  = PlanRunContext.from_args(_args, script_dir=BASE)
    if _ctx.is_plan_scoped:
        OUT        = _ctx.outputs_dir                               # type: ignore[assignment]
        ITEMS      = OUT / 'review_items'                           # type: ignore[assignment]
        OUT_JSON   = OUT / 'review_queue.json'
        OUT_HTML   = OUT / 'review_queue.html'
        OUT_REPORT = OUT / 'review_queue_report.md'
        POC3_JSON  = OUT / 'vector_glyph_results.json'
        POC1_JSON  = OUT / 'tight_numeric_crop_results.json'
        POC2_JSON  = OUT / 'digit_template_results.json'
        LEG_JSON   = OUT / 'legend_vocabulary.json'
        INV_JSON   = OUT / 'sign_inventory.json'
        _required = [INV_JSON]
        _optional = [POC3_JSON, POC1_JSON, POC2_JSON, LEG_JSON]
        _missing_r = [p for p in _required if not p.exists()]
        _missing_o = [p for p in _optional if not p.exists()]
        if _missing_r:
            print('[WARN] Plan-scoped mode: missing REQUIRED inputs in run outputs dir:')
            for _p in _missing_r:
                print(f'  MISSING (required): {_p}')
        if _missing_o:
            print('[WARN] Plan-scoped mode: missing optional inputs (queue will be partial):')
            for _p in _missing_o:
                print(f'  MISSING (optional): {_p}')
        if _missing_r or _missing_o:
            print('  Run sign detection stages (06, 09, 13) with --plan-run-dir first.')
        _ctx.ensure_dirs()
        print(_ctx.describe())
    main()
