# Stage 4 Clustering Refinement — Design

**Date:** 2026-05-19  
**Scope:** `research/cad-pdf-intelligence/04_cluster_symbols.py` only. No production changes.  
**Goal:** Fix the clustering bottleneck identified in Stage E — DBSCAN eps=35 was merging adjacent signs into single multi-sign clusters, making template matching fail.

---

## Problem Statement

Stage E sign recognition (06_match_signs.py) found that:
- Isolated single-sign clusters (2 members, tight bbox) → scores 0.30–0.36 (medium confidence)
- Multi-sign merged clusters (20–80 members) → scores <0.10 (fundamentally broken)

At eps=35, the old C0108 (80 members, red, conf=0.95) was classified as `sign_symbol` with the highest confidence, but was actually 3 prohibition signs and a route marking arc merged into one cluster.

Two bugs compounded the problem:
1. **eps too large**: 35pt radius allows adjacent signs (typically 20–30pt apart) to merge
2. **Confidence formula backwards**: `0.5 + members*0.05` rewarded high member counts, giving multi-sign clusters the highest confidence scores

---

## Design

### 1. Configurable DBSCAN eps (default 25.0)

Reduce `DBSCAN_EPS` from 35 → 25. Rationale from comparison run:

| eps | total | sign+compact | multi_symbol | avg sign members |
|-----|-------|-------------|-------------|-----------------|
| 20  | 308   | 60          | 19          | 2.6             |
| **25** | **223** | **50** | **15** | **3.1** |
| 35  | 140   | 28          | 11          | 3.0             |

eps=25 gives 79% more individual sign candidates vs eps=35, with only 4 more multi_symbol clusters.  
eps=20 risks over-fragmentation (308 clusters, many symbol_fragments may be single-sign sub-paths split apart).

All parameters are documented constants at the top of the file — easy to tune per-project.

### 2. Fixed confidence formula

Old (wrong): `0.5 + member_count * 0.05` — high members = high confidence  
New (correct): bell-curve peaking at 3–8 members, penalty above 10:

```
1–1 members  → 0.55
2–3 members  → 0.65–0.75
4–8 members  → 0.75–0.85  (peak)
9–15 members → 0.85 → 0.57 (decay)
>15 members  → ≥0.30 (floor)
```

### 3. New `multi_symbol` cluster type

Clusters with `member_count > MULTI_SYMBOL_THRESHOLD (15)` are reclassified as `multi_symbol` instead of `sign_symbol`/`compact_symbol`. These are excluded from Stage E template matching via the TARGET_TYPES set.

`SIGN_SYMBOL_MAX_MEMBERS = 10` additionally prevents sign_symbol classification for clusters with 11–15 members that don't exceed the multi_symbol threshold.

### 4. `--compare` flag for eps tuning

`python 04_cluster_symbols.py --compare` runs eps=20, 25, 35 in parallel and produces:
- stdout comparison table
- `outputs/eps_comparison.md` with full stats and Stage E candidate count estimates

---

## Stage E Impact

| Metric | Before (eps=35) | After (eps=25) | Δ |
|--------|----------------|----------------|---|
| Total candidates | 123 | 191 | +55% |
| Medium confidence matches | 4 | 6 | +50% |
| Low confidence matches | 13 | 18 | +38% |
| Good matches (med+low) | 17 | 24 | +41% |
| sign_symbol scoring ≥ 0.15 | 0 | 3 | new |
| Multi-sign clusters sent to Stage E | ~15 | 0 | eliminated |

Best new match: C0065 (blue, sign_symbol, 5 members) → `symbol_s061` score=0.361

---

## Remaining Limitations

- Some sign_symbol clusters (C0000, C0159, etc.) remain uncertain — these are route-marking assemblies (red route arrows, not catalog signs) that are correctly colored-red but have no catalog match
- No "high confidence" tier matches yet — AutoCAD schematic vs catalog reference image gap persists
- Further eps tuning (e.g., 22) or a minimum bbox-size filter could improve isolation further
