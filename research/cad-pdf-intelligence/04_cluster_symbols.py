#!/usr/bin/env python3
"""
Stage 4 — Symbol Clustering  (Option C: Hybrid filter-first → DBSCAN)

Algorithm:
  1. Load candidate_symbols from stage 2 output (pre-filtered filled shapes, 5–350px).
  2. Build centroid matrix (N × 2).
  3. Run DBSCAN(eps=DBSCAN_EPS, min_samples=1) — groups nearby sub-paths of the same symbol.
  4. Compute per-cluster: union bbox, dominant color, size classification, semantic hint.
  5. Classify multi-sign clusters (large member count) separately from single signs.
  6. Output ranked cluster list.

Usage:
  python 04_cluster_symbols.py [pdf_path]            # normal run with DBSCAN_EPS default
  python 04_cluster_symbols.py [pdf_path] --compare  # compare eps=20/25/35, save report

Output: outputs/symbol_clusters.json
        outputs/eps_comparison.md  (with --compare)
"""

import argparse
import sys
import json
from pathlib import Path
from collections import Counter, defaultdict
from typing import List, Dict, Any, Optional

import numpy as np
from scipy.cluster.hierarchy import fclusterdata

import cad_utils
from cad_utils import bucket_color, SEMANTIC_HINT, save_json, load_json
from plan_run_context import PlanRunContext

SCRIPT_DIR = Path(__file__).parent

DEFAULT_PDF = "/Users/eliozedri/Downloads/50-448-02-400.pdf"

# ── Configurable clustering parameters ────────────────────────────────────────
# eps = max centroid distance (pts) to group sub-paths into the same cluster.
# 25 pt ≈ 12mm at 300 dpi, well inside a single sign, but separates adjacent signs.
# Raise to 35 if you need to group multi-sign assemblies; lower to 15 for tight isolation.
DBSCAN_EPS     = 25.0
DBSCAN_MIN_PTS = 1      # every isolated candidate is its own cluster (no noise points)

# ── Cluster classification thresholds ─────────────────────────────────────────
MAX_SIGN_ASPECT         = 5.0    # aspect ratio above this → road_marking_stripe
MAX_SIGN_LONG           = 600    # longest side above this → large_structure
MIN_SIGN_AREA           = 25     # bbox area below this → micro_noise
SIGN_SYMBOL_MAX_MEMBERS = 10     # member count above this → multi_symbol (likely merged adjacent signs)
MULTI_SYMBOL_THRESHOLD  = 15     # above this → definitely multi_symbol, not a single sign candidate

# EPS values used for comparison mode
COMPARE_EPS_VALUES = [20.0, 25.0, 35.0]


def _member_confidence(member_count: int) -> float:
    """
    Confidence heuristic based on member count.

    Single-sign clusters are typically composed of 1–8 sub-paths.
    Clusters with 10+ members are likely merged adjacent signs → lower confidence.

    Previous formula (0.5 + count*0.05) was wrong: it rewarded high member counts,
    causing multi-sign clusters to score 0.95 while single-sign clusters scored 0.55.
    """
    if member_count <= 1:
        return 0.55
    if member_count <= 3:
        return 0.65 + (member_count - 1) * 0.05   # 0.65 → 0.75
    if member_count <= 8:
        return 0.75 + (member_count - 3) * 0.02   # 0.75 → 0.85
    if member_count <= 15:
        return 0.85 - (member_count - 8) * 0.04   # 0.85 → 0.57
    return max(0.30, 0.57 - (member_count - 15) * 0.02)


def classify_cluster(bbox_w: float, bbox_h: float, color_bucket: str, member_count: int) -> dict:
    """
    Classify a cluster into a semantic type.

    New type 'multi_symbol': cluster with too many members to be a single sign —
    either merged adjacent signs (DBSCAN eps too large) or a large sign assembly.
    These are valid detections but poor template-matching candidates.
    """
    long_side  = max(bbox_w, bbox_h)
    short_side = min(bbox_w, bbox_h)
    aspect     = long_side / max(short_side, 0.1)
    area       = bbox_w * bbox_h

    if area < MIN_SIGN_AREA:
        return {"type": "micro_noise",         "confidence": 0.3}
    if long_side > MAX_SIGN_LONG:
        return {"type": "large_structure",     "confidence": 0.5}
    if aspect > MAX_SIGN_ASPECT:
        return {"type": "road_marking_stripe", "confidence": 0.7}

    conf = _member_confidence(member_count)

    # Multi-sign: too many sub-paths for a single sign
    if member_count > MULTI_SYMBOL_THRESHOLD:
        return {"type": "multi_symbol", "confidence": round(conf, 2)}

    # Shape-based guess for single signs
    if 0.7 < aspect < 1.4 and color_bucket in ("red", "blue", "orange", "yellow"):
        shape = "compact_symbol"
    elif aspect < 2.0 and color_bucket in ("red", "blue") and member_count <= SIGN_SYMBOL_MAX_MEMBERS:
        shape = "sign_symbol"
    else:
        shape = "symbol_fragment"

    semantic = SEMANTIC_HINT.get(color_bucket, "unclassified")
    return {"type": shape, "semantic": semantic, "confidence": round(conf, 2)}


def cluster_symbols(candidates: List[Dict], eps: float = DBSCAN_EPS) -> List[Dict]:
    """Run DBSCAN at the given eps and return the cluster list."""
    if not candidates:
        return []

    points = np.array([[c["cx"], c["cy"]] for c in candidates], dtype=np.float64)

    try:
        from sklearn.cluster import DBSCAN as SKLearnDBSCAN
        db = SKLearnDBSCAN(eps=eps, min_samples=DBSCAN_MIN_PTS, algorithm="ball_tree")
        labels = db.fit_predict(points)
    except ImportError:
        if len(points) == 1:
            labels = np.array([0])
        else:
            labels = fclusterdata(points, t=eps, criterion="distance",
                                  method="single").astype(int) - 1

    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    print(f"  DBSCAN eps={eps:.0f} → {len(candidates)} candidates → {n_clusters} clusters")

    groups: Dict[int, List[int]] = defaultdict(list)
    for i, label in enumerate(labels):
        groups[int(label)].append(i)

    clusters = []
    for label, indices in groups.items():
        members  = [candidates[i] for i in indices]

        x0 = min(m["bbox"][0] for m in members)
        y0 = min(m["bbox"][1] for m in members)
        x1 = max(m["bbox"][2] for m in members)
        y1 = max(m["bbox"][3] for m in members)

        bbox_w = x1 - x0
        bbox_h = y1 - y0
        cx = (x0 + x1) / 2
        cy = (y0 + y1) / 2

        fill_buckets   = [m["fill_bucket"] for m in members]
        dominant_color = Counter(fill_buckets).most_common(1)[0][0]
        unique_colors  = list(set(fill_buckets))

        classification = classify_cluster(bbox_w, bbox_h, dominant_color, len(members))

        clusters.append({
            "id":             f"C{label:04d}",
            "member_count":   len(members),
            "bbox":           [round(x0,1), round(y0,1), round(x1,1), round(y1,1)],
            "centroid":       [round(cx,1), round(cy,1)],
            "bbox_w_pts":     round(bbox_w, 1),
            "bbox_h_pts":     round(bbox_h, 1),
            "aspect_ratio":   round(max(bbox_w, bbox_h) / max(min(bbox_w, bbox_h), 0.1), 2),
            "dominant_color": dominant_color,
            "color_mix":      unique_colors,
            "cluster_type":   classification["type"],
            "semantic_hint":  classification.get("semantic", SEMANTIC_HINT.get(dominant_color, "")),
            "confidence":     classification["confidence"],
            "sample_fills":   [m["fill_rgb"] for m in members[:3]],
        })

    type_order = {
        "sign_symbol": 0, "compact_symbol": 1, "symbol_fragment": 2,
        "multi_symbol": 3, "road_marking_stripe": 4, "large_structure": 5, "micro_noise": 6,
    }
    clusters.sort(key=lambda c: (
        type_order.get(c["cluster_type"], 9),
        -c["confidence"],
        -c["member_count"],
    ))

    return clusters


# ── Comparison mode helpers ────────────────────────────────────────────────────

def _cluster_stats(clusters: List[Dict]) -> Dict:
    """Summarise cluster list for comparison table."""
    tc = Counter(c["cluster_type"] for c in clusters)
    sign_members = [c["member_count"] for c in clusters
                    if c["cluster_type"] in ("sign_symbol", "compact_symbol")]
    return {
        "total":          len(clusters),
        "sign_symbol":    tc.get("sign_symbol", 0),
        "compact_symbol": tc.get("compact_symbol", 0),
        "symbol_fragment":tc.get("symbol_fragment", 0),
        "multi_symbol":   tc.get("multi_symbol", 0),
        "road_marking":   tc.get("road_marking_stripe", 0),
        "avg_sign_members": round(sum(sign_members) / max(len(sign_members), 1), 1),
        "max_sign_members": max(sign_members) if sign_members else 0,
    }


def run_comparison(candidates: List[Dict]) -> str:
    """
    Run clustering at each eps in COMPARE_EPS_VALUES, print a comparison table,
    return the markdown report content.
    """
    results = {}
    for eps in COMPARE_EPS_VALUES:
        cls = cluster_symbols(candidates, eps=eps)
        results[eps] = (cls, _cluster_stats(cls))

    # ── Print table ────────────────────────────────────────────────────────────
    header = f"{'eps':>6}  {'total':>6}  {'sign_sym':>8}  {'compact':>7}  {'frag':>6}  {'multi':>6}  {'road':>5}  {'avgMem':>7}  {'maxMem':>7}"
    sep    = "-" * len(header)
    print(f"\n  EPS Comparison:")
    print(f"  {header}")
    print(f"  {sep}")
    for eps, (_, s) in sorted(results.items()):
        marker = " ◀ default" if eps == DBSCAN_EPS else ""
        print(f"  {eps:>6.0f}  {s['total']:>6}  {s['sign_symbol']:>8}  "
              f"{s['compact_symbol']:>7}  {s['symbol_fragment']:>6}  "
              f"{s['multi_symbol']:>6}  {s['road_marking']:>5}  "
              f"{s['avg_sign_members']:>7}  {s['max_sign_members']:>7}{marker}")

    # ── Build markdown report ──────────────────────────────────────────────────
    lines = [
        "# Stage 4 — DBSCAN EPS Comparison",
        "",
        f"**Source:** vector_objects.json  |  **Candidates:** {len(candidates):,}",
        f"**SIGN_SYMBOL_MAX_MEMBERS:** {SIGN_SYMBOL_MAX_MEMBERS}  |  "
        f"**MULTI_SYMBOL_THRESHOLD:** {MULTI_SYMBOL_THRESHOLD}",
        "",
        "| eps | total clusters | sign_symbol | compact_symbol | symbol_fragment | multi_symbol | road_marking | avg sign members | max sign members |",
        "|-----|---------------|-------------|---------------|-----------------|-------------|-------------|-----------------|-----------------|",
    ]
    for eps, (_, s) in sorted(results.items()):
        tag = " **← default**" if eps == DBSCAN_EPS else ""
        lines.append(
            f"| {eps:.0f}{tag} | {s['total']} | {s['sign_symbol']} | {s['compact_symbol']} | "
            f"{s['symbol_fragment']} | {s['multi_symbol']} | {s['road_marking']} | "
            f"{s['avg_sign_members']} | {s['max_sign_members']} |"
        )

    lines += [
        "",
        "## Interpretation",
        "",
        "- **Smaller eps** → more clusters, smaller member counts, better single-sign isolation",
        "  but risks splitting a single sign's sub-paths into separate clusters",
        "- **Larger eps** → fewer clusters, larger member counts, adjacent signs merge",
        f"- **multi_symbol** counts show how many clusters were flagged as merged/oversized",
        "  (member_count > {MULTI_SYMBOL_THRESHOLD}) — these are excluded from Stage E matching",
        "",
        "## Stage E impact estimate",
        "",
        "- Stage E candidates = sign_symbol + compact_symbol + symbol_fragment",
        "- Fewer multi_symbol + more sign_symbol = more individual signs available for matching",
    ]
    for eps, (cls, s) in sorted(results.items()):
        stage_e_cands = s["sign_symbol"] + s["compact_symbol"] + s["symbol_fragment"]
        lines.append(f"- **eps={eps:.0f}**: Stage E candidates = {stage_e_cands}")

    return "\n".join(lines)


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    compare_mode = "--compare" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    pdf_path = args[0] if args else DEFAULT_PDF

    print(f"[04_cluster_symbols] Loading candidates from vector_objects.json ...")

    try:
        v2 = load_json("vector_objects.json")
        candidates = v2["candidate_symbols"]
    except Exception as e:
        print(f"  [!] Could not load vector_objects.json: {e}")
        print(f"  Run 02_extract_vectors.py first.")
        sys.exit(1)

    print(f"  Loaded {len(candidates):,} candidates")
    print(f"  Config: eps={DBSCAN_EPS}  min_pts={DBSCAN_MIN_PTS}  "
          f"max_sign_members={SIGN_SYMBOL_MAX_MEMBERS}  multi_threshold={MULTI_SYMBOL_THRESHOLD}")

    if compare_mode:
        print(f"\n  Running comparison mode (eps = {COMPARE_EPS_VALUES}) ...")
        report_md = run_comparison(candidates)
        rp = load_json.__module__  # just for path access
        from cad_utils import output_path
        cmp_path = output_path("eps_comparison.md")
        cmp_path.write_text(report_md, encoding="utf-8")
        print(f"\n  Comparison report → {cmp_path}")
        print(f"\n  NOTE: normal run still uses eps={DBSCAN_EPS} (see DBSCAN_EPS constant above)")

    # Normal run: cluster at DBSCAN_EPS and save symbol_clusters.json
    clusters = cluster_symbols(candidates, eps=DBSCAN_EPS)

    type_counts  = Counter(c["cluster_type"] for c in clusters)
    color_counts = Counter(c["dominant_color"] for c in clusters)

    # Stage E candidates = types that 06_match_signs.py targets
    stage_e_types = {"sign_symbol", "compact_symbol", "symbol_fragment"}
    high_conf = [c for c in clusters if c["confidence"] >= 0.7 and
                 c["cluster_type"] in stage_e_types]

    output = {
        "source_pdf":    str(Path(pdf_path).name),
        "dbscan_params": {
            "eps_pts":               DBSCAN_EPS,
            "min_samples":           DBSCAN_MIN_PTS,
            "sign_symbol_max_members": SIGN_SYMBOL_MAX_MEMBERS,
            "multi_symbol_threshold":  MULTI_SYMBOL_THRESHOLD,
        },
        "summary": {
            "input_candidates":      len(candidates),
            "total_clusters":        len(clusters),
            "type_breakdown":        dict(type_counts.most_common()),
            "color_breakdown":       dict(color_counts.most_common()),
            "high_confidence_signs": len(high_conf),
            "stage_e_candidates":    sum(type_counts.get(t, 0) for t in stage_e_types),
        },
        "clusters": clusters,
    }

    out = save_json(output, "symbol_clusters.json")
    print(f"  Saved → {out}")

    print(f"\n  Total clusters:          {len(clusters)}")
    print(f"\n  Type breakdown:")
    for t, c in type_counts.most_common():
        print(f"    {t:<28} {c:>5}")
    print(f"\n  Color breakdown:")
    for t, c in color_counts.most_common():
        print(f"    {t:<16} {c:>5}  ({SEMANTIC_HINT.get(t,'')})")
    print(f"\n  High-confidence sign candidates: {len(high_conf)}")
    print(f"  Stage E candidates:              {output['summary']['stage_e_candidates']}")
    if high_conf:
        print(f"\n  Top sign clusters:")
        for cl in high_conf[:10]:
            print(f"    {cl['id']}  {cl['dominant_color']:<14} "
                  f"bbox={cl['bbox_w_pts']:.0f}×{cl['bbox_h_pts']:.0f}pt  "
                  f"members={cl['member_count']:>3}  "
                  f"conf={cl['confidence']}  "
                  f"type={cl['cluster_type']}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Stage 4 — Symbol Clustering (DBSCAN)')
    parser.add_argument(
        '--plan-run-dir', default=None, metavar='DIR',
        help='Path to a plan-scoped run directory. '
             'If omitted, runs in legacy mode against outputs/')
    parser.add_argument(
        '--compare', action='store_true',
        help='Compare eps=20/25/35 and save report (legacy mode only)')
    _args = parser.parse_args()
    _ctx  = PlanRunContext.from_args(_args, script_dir=SCRIPT_DIR)

    if _ctx.is_plan_scoped:
        cad_utils.OUTPUTS = _ctx.outputs_dir
        sys.argv          = [sys.argv[0]]  # strip --plan-run-dir; main() reads sys.argv[1] for pdf

        _vec_json = _ctx.outputs_dir / 'vector_objects.json'
        if not _vec_json.exists():
            print('[WARN] Plan-scoped mode: required input missing in run outputs dir:')
            print(f'  MISSING (required): vector_objects.json')
            print('  Cause: 02_extract_vectors.py does not yet support --plan-run-dir.')
            print('  To seed manually (operator action — not a silent fallback):')
            print(f'    cp outputs/vector_objects.json {_ctx.outputs_dir}/')
            print('  Then re-run this script with --plan-run-dir.')
        _ctx.ensure_dirs()
        print(_ctx.describe())

    main()
