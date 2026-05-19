#!/usr/bin/env python3
"""
Stage 4 — Symbol Clustering  (Option C: Hybrid filter-first → DBSCAN)

Algorithm:
  1. Load candidate_symbols from stage 2 output (pre-filtered filled shapes, 5–350px).
  2. Build centroid matrix (N × 2).
  3. Run DBSCAN(eps=35, min_samples=1) — groups nearby sub-paths of the same symbol.
  4. Compute per-cluster: union bbox, dominant color, size classification, semantic hint.
  5. Optionally split "road marking" clusters (very elongated bbox) from "sign" clusters.
  6. Output ranked cluster list.

Output: outputs/symbol_clusters.json
"""

import sys
import json
from pathlib import Path
from collections import Counter, defaultdict
from typing import List, Dict, Any

import numpy as np
from scipy.cluster.hierarchy import fclusterdata
try:
    from scipy.spatial.distance import cdist
except ImportError:
    cdist = None

from cad_utils import bucket_color, SEMANTIC_HINT, save_json, load_json


DEFAULT_PDF = "/Users/eliozedri/Downloads/50-448-02-400.pdf"

# ── DBSCAN / clustering parameters ────────────────────────────────────────────
DBSCAN_EPS     = 35.0   # pts — sub-paths of the same symbol are within ~35pts
DBSCAN_MIN_PTS = 1      # every isolated candidate is its own cluster (no noise)

# Cluster classification thresholds
MAX_SIGN_ASPECT = 5.0   # bbox aspect ratio above this → road marking stripe
MAX_SIGN_LONG   = 600   # longest bbox side above this → large structure (not a sign)
MIN_SIGN_AREA   = 25    # bbox area below this → micro noise


def classify_cluster(bbox_w: float, bbox_h: float, color_bucket: str, member_count: int) -> dict:
    """Classify a cluster into a semantic type."""
    long_side  = max(bbox_w, bbox_h)
    short_side = min(bbox_w, bbox_h)
    aspect     = long_side / max(short_side, 0.1)
    area       = bbox_w * bbox_h

    if area < MIN_SIGN_AREA:
        return {"type": "micro_noise",    "confidence": 0.3}
    if long_side > MAX_SIGN_LONG:
        return {"type": "large_structure", "confidence": 0.5}
    if aspect > MAX_SIGN_ASPECT:
        return {"type": "road_marking_stripe", "confidence": 0.7}

    # Shape-based guess
    if 0.7 < aspect < 1.4 and color_bucket in ("red", "blue", "orange", "yellow"):
        shape = "compact_symbol"   # circles, squares, triangles all look roughly 1:1
    elif aspect < 2.0 and color_bucket in ("red", "blue"):
        shape = "sign_symbol"
    else:
        shape = "symbol_fragment"

    # Confidence heuristic: more members from the same sign = higher conf
    conf = min(0.95, 0.5 + member_count * 0.05)

    semantic = SEMANTIC_HINT.get(color_bucket, "unclassified")
    return {"type": shape, "semantic": semantic, "confidence": round(conf, 2)}


def cluster_symbols(candidates: List[Dict]) -> List[Dict]:
    if not candidates:
        return []

    points = np.array([[c["cx"], c["cy"]] for c in candidates], dtype=np.float64)

    # DBSCAN via scipy (fast for N < 20K)
    try:
        from sklearn.cluster import DBSCAN as SKLearnDBSCAN
        db = SKLearnDBSCAN(eps=DBSCAN_EPS, min_samples=DBSCAN_MIN_PTS, algorithm="ball_tree")
        labels = db.fit_predict(points)
    except ImportError:
        # Fallback: hierarchical clustering with single linkage at eps threshold
        if len(points) == 1:
            labels = np.array([0])
        else:
            from scipy.cluster.hierarchy import fclusterdata
            labels = fclusterdata(points, t=DBSCAN_EPS, criterion="distance",
                                  method="single").astype(int) - 1  # 0-indexed

    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    print(f"  DBSCAN → {len(candidates)} candidates → {n_clusters} clusters")

    # ── Build cluster objects ──────────────────────────────────────────────────
    groups: Dict[int, List[int]] = defaultdict(list)
    for i, label in enumerate(labels):
        groups[int(label)].append(i)

    clusters = []
    for label, indices in groups.items():
        members = [candidates[i] for i in indices]

        x0 = min(m["bbox"][0] for m in members)
        y0 = min(m["bbox"][1] for m in members)
        x1 = max(m["bbox"][2] for m in members)
        y1 = max(m["bbox"][3] for m in members)

        bbox_w = x1 - x0
        bbox_h = y1 - y0
        cx = (x0 + x1) / 2
        cy = (y0 + y1) / 2

        # Dominant fill color (by count)
        fill_buckets = [m["fill_bucket"] for m in members]
        dominant_color = Counter(fill_buckets).most_common(1)[0][0]

        # Color variety
        unique_colors = list(set(fill_buckets))

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

    # Sort by: signs first (by confidence), then road markings, then noise
    type_order = {
        "sign_symbol": 0, "compact_symbol": 1, "symbol_fragment": 2,
        "road_marking_stripe": 3, "large_structure": 4, "micro_noise": 5,
    }
    clusters.sort(key=lambda c: (
        type_order.get(c["cluster_type"], 9),
        -c["confidence"],
        -c["member_count"],
    ))

    return clusters


def main():
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PDF
    print(f"[04_cluster_symbols] Loading candidates from vector_objects.json ...")

    try:
        v2 = load_json("vector_objects.json")
        candidates = v2["candidate_symbols"]
    except Exception as e:
        print(f"  [!] Could not load vector_objects.json: {e}")
        print(f"  Run 02_extract_vectors.py first.")
        sys.exit(1)

    print(f"  Loaded {len(candidates):,} candidates")

    clusters = cluster_symbols(candidates)

    # ── Summary counts ─────────────────────────────────────────────────────────
    type_counts = Counter(c["cluster_type"] for c in clusters)
    color_counts = Counter(c["dominant_color"] for c in clusters)

    high_conf = [c for c in clusters if c["confidence"] >= 0.7 and
                 c["cluster_type"] in ("sign_symbol", "compact_symbol", "symbol_fragment")]

    output = {
        "source_pdf": str(Path(pdf_path).name),
        "dbscan_params": {"eps_pts": DBSCAN_EPS, "min_samples": DBSCAN_MIN_PTS},
        "summary": {
            "input_candidates":     len(candidates),
            "total_clusters":       len(clusters),
            "type_breakdown":       dict(type_counts.most_common()),
            "color_breakdown":      dict(color_counts.most_common()),
            "high_confidence_signs": len(high_conf),
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
    if high_conf:
        print(f"\n  Top sign clusters:")
        for cl in high_conf[:10]:
            print(f"    {cl['id']}  {cl['dominant_color']:<14} "
                  f"bbox={cl['bbox_w_pts']:.0f}×{cl['bbox_h_pts']:.0f}pt  "
                  f"members={cl['member_count']}  "
                  f"conf={cl['confidence']}  "
                  f"type={cl['cluster_type']}")


if __name__ == "__main__":
    main()
