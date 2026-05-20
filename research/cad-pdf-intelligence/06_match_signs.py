#!/usr/bin/env python3
"""
Stage E — Sign Template Matching
Matches detected symbol clusters against the sign catalog templates using
edge-based template matching: HSV color mask → contour crop → 128×128 → Canny → matchTemplate.

Inputs:
  outputs/symbol_clusters.json  — cluster list from Stage 4
  sign_catalog/*.png            — sign/symbol templates (649 images)
  <pdf_path>                    — PDF to render crop regions from

Outputs:
  outputs/sign_recognition_candidates.json   — ranked match results per cluster
  outputs/sign_recognition_report.md         — human-readable tiered summary
  outputs/sign_recognition_debug_overlay.png — page with recognition annotations
"""

import argparse
import sys
import json
import time
from pathlib import Path
from collections import Counter
from typing import Optional, List, Dict

import numpy as np
import cv2
import fitz  # PyMuPDF

import cad_utils
from cad_utils import output_path, load_json
from plan_run_context import PlanRunContext

# ── Configuration ──────────────────────────────────────────────────────────────

DEFAULT_PDF  = "/Users/eliozedri/Downloads/50-448-02-400.pdf"
CATALOG_DIR  = Path(__file__).parent / "sign_catalog"

RENDER_DPI   = 150    # DPI for PDF crop renders
PADDING_PTS  = 35     # extra padding around cluster bbox (PDF points)
NORM_SIZE    = 128    # normalize extracted contour to this square before Canny
CANNY_LOW    = 40
CANNY_HIGH   = 120

# Confidence tier thresholds (TM_CCOEFF_NORMED scores)
TIER_HIGH    = 0.45
TIER_MEDIUM  = 0.30
TIER_LOW     = 0.15

# Cluster types to attempt matching on
TARGET_TYPES = {"sign_symbol", "compact_symbol", "symbol_fragment"}


# ── Catalog series helpers ─────────────────────────────────────────────────────

def _series(stem: str) -> int:
    """Return hundreds-series (100, 200, …) for sign_NNN stems, else 0."""
    if stem.startswith("sign_"):
        try:
            return (int(stem.split("_")[1]) // 100) * 100
        except (ValueError, IndexError):
            return 0
    return 0


def _series_filter(bucket: str):
    """Return a function(stem)->bool that pre-filters catalog by color bucket."""
    bucket_series = {
        "red":        {100, 300, 400, 900},
        "orange":     {100, 900},
        "yellow":     set(),          # mostly symbols
        "blue":       {200, 500, 600},
        "blue_light": {200, 500, 600},
        "green":      {600},
        "black":      {700, 800, 900},
        "gray_dark":  {700, 800, 900},
    }
    allowed = bucket_series.get(bucket)

    def _check(stem: str) -> bool:
        if allowed is None:
            return True   # no restriction for this bucket
        s = _series(stem)
        if s == 0:
            return True   # symbols / non-standard codes: always include
        return s in allowed

    return _check


# ── HSV color masking ──────────────────────────────────────────────────────────

def _color_mask(hsv: np.ndarray, bucket: str) -> np.ndarray:
    """Binary mask of pixels matching the semantic color bucket."""
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
    if bucket in ("gray_mid", "gray_light"):
        return m([0, 0, 70], [180, 45, 200])
    # fallback: anything that is not near-white
    return cv2.bitwise_not(m([0, 0, 200], [180, 30, 255]))


# ── Preprocessing ──────────────────────────────────────────────────────────────

def _preprocess(bgr: np.ndarray, bucket: Optional[str], prefer_center: bool = False) -> Optional[np.ndarray]:
    """
    Extract the primary sign contour, normalize to NORM_SIZE×NORM_SIZE, apply Canny.

    prefer_center=True: pick the contour whose centroid is closest to the image center
    (used for PDF crops where the target sign is near center but distractors may be larger).
    prefer_center=False: pick the largest contour (used for catalog templates on white bg).

    Returns uint8 edge image or None if extraction fails.
    """
    if bgr is None or bgr.size == 0:
        return None

    h, w = bgr.shape[:2]
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)

    if bucket:
        mask = _color_mask(hsv, bucket)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    else:
        # Non-white mask: used for templates without a clear single-bucket color
        mask = cv2.bitwise_not(
            cv2.inRange(bgr, np.array([200, 200, 200], np.uint8), np.array([255, 255, 255], np.uint8))
        )

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = [c for c in contours if cv2.contourArea(c) >= 60]

    chosen = None
    if contours:
        if prefer_center:
            # PDF crop: the target sign is near the image center (cluster bbox is centered).
            # Use contours above 1% of image area; among those pick closest centroid to center.
            cx_img, cy_img = w / 2.0, h / 2.0
            min_area = max(60, w * h * 0.01)
            large = [c for c in contours if cv2.contourArea(c) >= min_area]
            pool  = large if large else contours

            def _dist_sq(c):
                M = cv2.moments(c)
                if M["m00"] == 0:
                    return float("inf")
                return (M["m10"] / M["m00"] - cx_img) ** 2 + (M["m01"] / M["m00"] - cy_img) ** 2

            chosen = min(pool, key=_dist_sq)
        else:
            chosen = max(contours, key=cv2.contourArea)

    if chosen is not None:
        x, y, cw, ch = cv2.boundingRect(chosen)
        # Add a small margin so we don't clip the sign border
        margin = max(3, int(min(cw, ch) * 0.07))
        x  = max(0, x - margin)
        y  = max(0, y - margin)
        cw = min(w - x, cw + 2 * margin)
        ch = min(h - y, ch + 2 * margin)
        crop = bgr[y : y + ch, x : x + cw]
    else:
        # No contour — fall back to trimming near-white border via thresholding
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 238, 255, cv2.THRESH_BINARY_INV)
        nz = cv2.findNonZero(thresh)
        if nz is not None:
            rx, ry, rw, rh = cv2.boundingRect(nz)
            crop = bgr[ry : ry + rh, rx : rx + rw]
        else:
            crop = bgr

    if crop is None or crop.size == 0 or crop.shape[0] < 5 or crop.shape[1] < 5:
        return None

    norm = cv2.resize(crop, (NORM_SIZE, NORM_SIZE), interpolation=cv2.INTER_AREA)
    gray_n = cv2.cvtColor(norm, cv2.COLOR_BGR2GRAY)
    return cv2.Canny(gray_n, CANNY_LOW, CANNY_HIGH)


def _template_bucket(stem: str) -> Optional[str]:
    """Infer the dominant color bucket for a template from its catalog series."""
    s = _series(stem)
    if s in (100, 300, 400, 900):
        return "red"
    if s in (200, 500, 600):
        return "blue"
    if s in (700, 800):
        return "black"
    return None   # symbols and others: use non-white mask


def build_template_index() -> Dict[str, np.ndarray]:
    """
    Load and preprocess every template in CATALOG_DIR.
    Returns { stem: canny_edges_128x128 }.
    """
    print(f"  Building template index from {CATALOG_DIR} ...")
    index = {}
    failed = 0
    for png in sorted(CATALOG_DIR.glob("*.png")):
        stem = png.stem
        if stem in ("placeholder", "extraction_log"):
            continue
        bgr = cv2.imread(str(png))
        if bgr is None:
            failed += 1
            continue
        edges = _preprocess(bgr, _template_bucket(stem))
        if edges is None:
            failed += 1
            continue
        index[stem] = edges

    print(f"  Loaded {len(index)} templates  ({failed} failed preprocessing)")
    return index


# ── PDF crop rendering ─────────────────────────────────────────────────────────

def render_crop(page: fitz.Page, cluster: dict, orig_w: float) -> Optional[np.ndarray]:
    """
    Render the PDF region for a cluster at RENDER_DPI.
    Transforms from PyMuPDF portrait/mediabox space to display/landscape space
    (rotation 270° CW: display_x = y_pm, display_y = orig_w - x_pm).
    Returns BGR array or None.
    """
    x0, y0, x1, y1 = cluster["bbox"]   # portrait/mediabox coords

    # Portrait → display:  left=y0, top=orig_w-x1, right=y1, bottom=orig_w-x0
    clip = fitz.Rect(
        y0  - PADDING_PTS,
        orig_w - x1 - PADDING_PTS,
        y1  + PADDING_PTS,
        orig_w - x0 + PADDING_PTS,
    )
    clip = clip & page.rect
    if clip.is_empty or clip.width < 5 or clip.height < 5:
        return None

    scale = RENDER_DPI / 72.0
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=clip, colorspace=fitz.csRGB)
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


# ── Matching ───────────────────────────────────────────────────────────────────

def match_cluster(
    crop_bgr: np.ndarray,
    cluster: dict,
    template_index: Dict[str, np.ndarray],
) -> List[dict]:
    """
    Match a rendered cluster crop against filtered templates.
    Returns top-3 matches: [{code, score, tier}, …].
    """
    bucket = cluster.get("dominant_color", "other")
    filter_fn = _series_filter(bucket)

    crop_edges = _preprocess(crop_bgr, bucket, prefer_center=True)
    if crop_edges is None:
        return []

    scores = []
    for stem, tmpl_edges in template_index.items():
        if not filter_fn(stem):
            continue
        # Both images are NORM_SIZE×NORM_SIZE → matchTemplate result is (1,1)
        val = cv2.matchTemplate(crop_edges, tmpl_edges, cv2.TM_CCOEFF_NORMED)[0][0]
        scores.append((float(val), stem))

    scores.sort(reverse=True)

    top3 = []
    for score, code in scores[:3]:
        if score >= TIER_HIGH:
            tier = "high"
        elif score >= TIER_MEDIUM:
            tier = "medium"
        elif score >= TIER_LOW:
            tier = "low"
        else:
            tier = "uncertain"
        top3.append({"code": code, "score": round(score, 4), "tier": tier})

    return top3


# ── Debug overlay ──────────────────────────────────────────────────────────────

_TIER_BGR = {
    "high":      (0,  220,   0),   # green
    "medium":    (0,  165, 255),   # orange
    "low":       (0,    0, 255),   # red
    "uncertain": (160, 160, 160),  # gray
}


def build_debug_overlay(page: fitz.Page, orig_w: float, results: list) -> np.ndarray:
    SCALE = 0.3
    pix = page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), colorspace=fitz.csRGB)
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    img = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)

    for res in results:
        cl  = res["cluster"]
        mts = res["matches"]
        if not mts:
            continue
        best = mts[0]
        x0, y0, x1, y1 = cl["bbox"]

        # Same transform as Stage 5 debug overlay
        sx0 = int(y0  * SCALE)
        sy0 = int((orig_w - x1) * SCALE)
        sx1 = int(y1  * SCALE)
        sy1 = int((orig_w - x0) * SCALE)

        color = _TIER_BGR.get(best["tier"], (200, 200, 200))
        cv2.rectangle(img, (sx0, sy0), (sx1, sy1), color, 2)

        label     = f"{best['code']} {best['score']:.2f}"
        font      = cv2.FONT_HERSHEY_SIMPLEX
        fscale    = 0.28
        (tw, th), _ = cv2.getTextSize(label, font, fscale, 1)
        ly = max(sy0 - 2, th + 2)
        cv2.rectangle(img, (sx0, ly - th - 2), (sx0 + tw + 2, ly + 2), color, -1)
        cv2.putText(img, label, (sx0 + 1, ly), font, fscale, (0, 0, 0), 1, cv2.LINE_AA)

    return img


# ── Markdown report ────────────────────────────────────────────────────────────

def write_report(results: list, pdf_path: str, n_templates: int) -> Path:
    def _group(tier):
        return [r for r in results if r["matches"] and r["matches"][0]["tier"] == tier]

    high      = sorted(_group("high"),     key=lambda r: -r["matches"][0]["score"])
    medium    = sorted(_group("medium"),   key=lambda r: -r["matches"][0]["score"])
    low       = sorted(_group("low"),      key=lambda r: -r["matches"][0]["score"])
    uncertain = _group("uncertain")
    no_match  = [r for r in results if not r["matches"]]

    tier_counts = Counter(
        r["matches"][0]["tier"] if r["matches"] else "no_match"
        for r in results
    )

    def _row(r):
        cl  = r["cluster"]
        m   = r["matches"][0]
        alt = ", ".join(f"{x['code']} ({x['score']:.2f})" for x in r["matches"][1:])
        suffix = f"  alts: {alt}" if alt else ""
        return (f"- **{cl['id']}** `{m['code']}` score={m['score']:.3f} "
                f"| {cl['cluster_type']} {cl['dominant_color']}{suffix}")

    lines = [
        "# Stage E — Sign Recognition Report",
        "",
        f"**PDF:** `{pdf_path}`  ",
        f"**Candidates processed:** {len(results)}  ",
        "**Tier summary:** " + "  ".join(f"{k}={v}" for k, v in sorted(tier_counts.items())),
        "",
        "---",
        "## High Confidence (≥ 0.45)",
        "",
        *([_row(r) for r in high] or ["_(none)_"]),
        "",
        "## Medium Confidence (0.30 – 0.44)",
        "",
        *([_row(r) for r in medium] or ["_(none)_"]),
        "",
        "## Low Confidence (0.15 – 0.29)",
        "",
        *([_row(r) for r in low] or ["_(none)_"]),
        "",
        "## Uncertain (< 0.15)",
        "",
    ]
    for r in uncertain[:12]:
        cl = r["cluster"]
        lines.append(f"- **{cl['id']}** best={r['matches'][0]['score']:.3f} | {cl['cluster_type']} {cl['dominant_color']}")
    if len(uncertain) > 12:
        lines.append(f"  …and {len(uncertain) - 12} more")
    if not uncertain:
        lines.append("_(none)_")

    lines += [
        "",
        "---",
        "## Methodology",
        "",
        "- **Preprocessing (crops):** HSV color mask → contour closest to crop center (≥1% area) → 128×128 → Canny edges",
        "- **Preprocessing (templates):** non-white mask → largest contour → 128×128 → Canny edges",
        "- **Matching:** `cv2.matchTemplate(TM_CCOEFF_NORMED)` — single-score full-image Canny correlation",
        f"- **Template filtering:** dominant color bucket → catalog series subset (reduces comparison set from {n_templates} full to ~100–200)",
        "",
        "## Key Finding",
        "",
        "Stage E accuracy is **gated by Stage 4 cluster quality**, not the matching algorithm:",
        "",
        "- Clusters representing a **single isolated sign** score 0.30–0.36 (medium confidence) even against AutoCAD schematics",
        "- Clusters where DBSCAN merged **multiple adjacent signs** (large member counts, 20–80) score < 0.10 — template matching cannot work against a multi-sign region",
        "- Route-marking arcs (`sign_symbol` clusters with red/orange large curved fills) are misclassified as sign candidates by Stage 4",
        "",
        "**Recommended Stage 4 improvement:** reduce DBSCAN `eps` from 35 → 20–25 to prevent adjacent sign merging; add member-count cap (≤ 10) for `sign_symbol` classification.",
        "",
        "## Known Limitations",
        "",
        "- AutoCAD schematic sign geometry differs from catalog reference images → scores typically 0.15–0.40 even for correct matches",
        "- Edge matching is scale-invariant (post-normalize) but cannot distinguish mirrored variants",
        "- `symbol_fragment` clusters contain partial signs; match quality degrades significantly",
        "- Color bucket misclassification propagates to wrong template series filter",
    ]

    path = output_path("sign_recognition_report.md")
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PDF
    print(f"[06_match_signs] {pdf_path}")

    try:
        cldata = load_json("symbol_clusters.json")
    except Exception as e:
        print(f"  [!] Cannot load symbol_clusters.json: {e}")
        print(f"  Run 04_cluster_symbols.py first.")
        sys.exit(1)

    all_clusters = cldata["clusters"]
    candidates   = [c for c in all_clusters if c["cluster_type"] in TARGET_TYPES]
    print(f"  Clusters total: {len(all_clusters)}  →  candidates ({', '.join(sorted(TARGET_TYPES))}): {len(candidates)}")

    t_build = time.perf_counter()
    template_index = build_template_index()
    print(f"  Index built in {time.perf_counter() - t_build:.1f}s  |  {len(template_index)} usable templates")

    if not Path(pdf_path).exists():
        print(f"  [!] PDF not found: {pdf_path}")
        sys.exit(1)
    doc    = fitz.open(pdf_path)
    page   = doc[0]
    orig_w = page.mediabox.width   # portrait width (e.g. 2551) — needed for rotation transform
    print(f"  Page rect={page.rect}  mediabox_w={orig_w:.0f}pt")

    print(f"\n  Matching {len(candidates)} clusters × ~{len(template_index)} templates ...")
    results = []
    t_match = time.perf_counter()

    for i, cl in enumerate(candidates):
        crop_bgr = render_crop(page, cl, orig_w)
        matches  = match_cluster(crop_bgr, cl, template_index) if crop_bgr is not None else []
        results.append({
            "cluster_id":    cl["id"],
            "cluster_type":  cl["cluster_type"],
            "dominant_color": cl["dominant_color"],
            "confidence":    cl["confidence"],
            "bbox":          cl["bbox"],
            "matches":       matches,
            "cluster":       cl,   # retained for report/overlay; stripped from JSON
        })
        if (i + 1) % 15 == 0 or i + 1 == len(candidates):
            print(f"    {i+1}/{len(candidates)} done  ({time.perf_counter()-t_match:.1f}s)")

    print(f"  Matching complete in {time.perf_counter()-t_match:.1f}s")

    # ── Save JSON ──────────────────────────────────────────────────────────────
    json_out = {
        "pdf":        pdf_path,
        "n_clusters": len(all_clusters),
        "candidates": [
            {k: v for k, v in r.items() if k != "cluster"}
            for r in results
        ],
    }
    jp = output_path("sign_recognition_candidates.json")
    with open(jp, "w", encoding="utf-8") as f:
        json.dump(json_out, f, indent=2, ensure_ascii=False)
    print(f"\n  JSON      → {jp}  ({jp.stat().st_size // 1024} KB)")

    # ── Write report ───────────────────────────────────────────────────────────
    rp = write_report(results, pdf_path, len(template_index))
    print(f"  Report    → {rp}")

    # ── Debug overlay ──────────────────────────────────────────────────────────
    overlay = build_debug_overlay(page, orig_w, results)
    op = output_path("sign_recognition_debug_overlay.png")
    cv2.imwrite(str(op), overlay)
    print(f"  Overlay   → {op}")

    doc.close()

    # ── Summary ────────────────────────────────────────────────────────────────
    tc = Counter(
        r["matches"][0]["tier"] if r["matches"] else "no_match"
        for r in results
    )
    print(f"\n  Tier counts:  " + "  ".join(f"{k}={tc[k]}" for k in ("high","medium","low","uncertain","no_match") if tc[k]))

    top = sorted(results, key=lambda r: -(r["matches"][0]["score"] if r["matches"] else -1))
    print(f"  Top matches:")
    for r in top[:8]:
        if not r["matches"]:
            continue
        m = r["matches"][0]
        print(f"    {r['cluster_id']}  {m['tier']:9s}  {m['score']:.3f}  {m['code']}")


if __name__ == "__main__":
    _script_dir = Path(__file__).parent
    parser = argparse.ArgumentParser(
        description='Sign Template Matching — Stage E')
    parser.add_argument(
        '--plan-run-dir', default=None, metavar='DIR',
        help='Path to an isolated plan run directory (runs/<plan_slug>/). '
             'When supplied, all I/O is scoped to that run. '
             'Omit to use the legacy global outputs/ directory.')
    _args, _ = parser.parse_known_args()  # ignore extra args (e.g. positional PDF path in legacy mode)
    _ctx = PlanRunContext.from_args(_args, script_dir=_script_dir)

    if _ctx.is_plan_scoped:
        cad_utils.OUTPUTS = _ctx.outputs_dir
        DEFAULT_PDF       = str(_ctx.source_pdf_path)
        sys.argv          = [sys.argv[0]]  # strip --plan-run-dir; main() reads sys.argv[1]

        if not _ctx.source_pdf_path.exists():
            print(f'[WARN] Plan-scoped mode: source PDF not found: {_ctx.source_pdf_path}')
            print('  Run 31_upload_intake_wrapper.py first to register the source PDF.')
        _cluster_json = _ctx.outputs_dir / 'symbol_clusters.json'
        if not _cluster_json.exists():
            print('[WARN] Plan-scoped mode: missing required input in run outputs dir:')
            print(f'  MISSING (required): symbol_clusters.json')
            print('  Run 04_cluster_symbols.py --plan-run-dir first.')
        _ctx.ensure_dirs()
        print(_ctx.describe())

    main()
