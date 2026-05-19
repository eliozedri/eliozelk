# Plan Scanner Architecture
## CAD PDF Intelligence — Professional Plan-Reading Logic

**Date:** 2026-05-19  
**Pipeline location:** `research/cad-pdf-intelligence/`  
**Status:** Research architecture notes — not production-integrated  
**Predecessor:** Stage F (07_extract_legend.py) shipped and validated  
**Next pipeline stage:** Stage G (sign inventory extraction) — designed here, not yet implemented

---

## 1. Stage F Results Summary

Stage F (`07_extract_legend.py`) successfully extracts the legend region from Israeli traffic arrangement plan PDFs. Validated on `50-448-02-400.pdf`:

- **Legend region detected** at display (3565,545)→(4419,2092) via line_density in right edge strip  
- **Sign legend sub-box** at display (3573,1206)→(3972,2085) — 9 distinct sign/symbol types  
- **13 row crops** generated (some rows oversegmented: icon + code number = two rows)  
- **Geometric outputs complete:** bboxes, icon crops, debug overlays  
- **Semantic labels pending:** Hebrew text is bezier paths — Vision API required for label/code/quantity  

**Key insight confirmed by Stage F:** Legend icons are drawn in the **same AutoCAD schematic style** as the signs on the map. This is the critical input for Stage G: use legend crops as reference images, not catalog photos. This eliminates the style gap that currently caps Stage E at 0.30–0.36 confidence.

---

## 2. Future Product Direction — "סורק תוכניות" (Plan Scanner)

The goal is a production tool that accepts a traffic arrangement plan PDF and produces a **structured sign inventory**:

```
For each sign pole location in the plan:
  - Physical location (GPS or map coordinate)
  - Number of sign plates on this pole
  - Sign plate list: [{ sign_code, description_he, side_of_road, height_from_ground? }]
  - Source quality: written_code | legend_match | visual_match | human_review
  - Confidence: high | medium | low | flagged
```

This inventory feeds directly into:
- **Order generation** — quantity of each sign code needed
- **Fabrication planning** — sign plate specifications
- **Field installation** — pole locations, heights, plate stacking order
- **QA** — contradiction detection between plan, legend, and field report

The scanner must work on new plans it has never seen before. Per-plan legend extraction (Stage F) makes this possible: each plan teaches the system its own sign vocabulary.

---

## 3. Professional Plan-Reading Logic

### How an experienced engineer reads a traffic plan

1. **Find the legend (מקרא מפה)** — understand which symbols are used in THIS plan and their codes
2. **Identify pole locations** — look for the dot or pole symbol on the map
3. **Count sign plates per pole** — small diagonal lines attached to the pole dot, one per plate
4. **Read sign codes** — the number printed next to each sign plate line (e.g., 402, 605)
5. **Cross-check with legend** — confirm the sign code appears in the legend
6. **Note any written overrides** — dimensions, custom text, mounting height notes next to the sign
7. **Count and verify** — total count per type must match legend quantities (כמות)
8. **Flag anomalies** — sign code on map not in legend, legend entry with zero matches on map, etc.

### How this translates to computer vision

| Human action | Pipeline equivalent |
|---|---|
| Read legend | Stage F: extract legend vocabulary |
| Find dot/pole | Stage G: detect small filled circles at sign locations |
| Count plate lines | Stage G: detect small line segments radiating from dot |
| Read sign code | Stage G: find text block within 30–80pt of the dot |
| Cross-check legend | Stage G: match code to Stage F vocabulary |
| Count and verify | Stage G: compare per-code count to legend quantity |
| Flag anomalies | Stage G: emit contradiction records |

---

## 4. Observed Pattern in Sample Plan

### Q1: Did I observe the pole/dot + small-line + nearby sign-code pattern?

**Yes, partially.** The rendered `outputs/pole_cluster_zoom.png` (center of plan, the large intersection area) shows:

- **Sign icons** appear as full-colored circles and shapes on the map — stop signs, speed limits, mandatory direction arrows, no-entry signs, pedestrian indicators
- **Multiple signs cluster near intersection approach points** — 2–5 signs within 200pt of each other, suggesting shared pole locations
- **Sign code numbers appear as small text** adjacent to sign icons — these are the written labels that are the most reliable source of ground truth
- **No standalone dot/pole symbol** is clearly distinguishable at this zoom level — in this plan variant, the sign icon itself may serve as the pole indicator, OR the pole dot is very small and lost in the dense drawing layer

### Q2: Where does the pattern appear and how should Stage G use it?

The pattern appears at **every intersection approach** in the plan:
- Right side of road before the intersection
- Left side after the intersection (for applicable sign types)
- Median separators where relevant

Stage G should use it as follows:
1. **Primary anchor = sign icon cluster centroid** — the geometric center of 2–5 co-located sign icons is the pole location estimate
2. **Secondary anchor = written sign code text** — the text block printed nearest to each sign icon IS the sign code; it is more reliable than visual recognition
3. **Tertiary anchor = legend match** — use Stage F crops to confirm sign type; do not override a written code with a visual guess

### Q3: Detection strategy for this pattern in other plans

Different plan variants (different AutoCAD templates, different engineers) may draw poles differently:

| Variant | Pole representation | Detection strategy |
|---|---|---|
| Type A (this plan) | Sign icon at pole location; code as adjacent text | Cluster sign icons → find nearby text → read code |
| Type B | Filled black dot + short radiating lines + code at end of each line | Detect small filled circles (<8pt radius) + line segment fan |
| Type C | No pole symbol; signs drawn at road edge with code below | Detect sign icon + read text directly below |
| Type D | Numbered balloon (circle with number) pointing to sign | Detect balloon annotation + read balloon number + cross-ref to sign schedule table |

Stage G should attempt Type A first (the confirmed pattern), then flag ambiguity for human review if it cannot locate sign codes near icons.

---

## 5. Counting Distinctions — The Four Counts

This is the most critical conceptual distinction for correctness. A professional plan contains four different quantities that are frequently confused:

### 5.1 Physical pole count
Number of physical steel poles to be installed on-site. One pole can hold 1–8 sign plates. The plan shows pole locations as dots or implied by sign groupings.

**How to count:** Identify distinct pole locations on the map. Each pole cluster = 1 physical pole. **Do NOT count sign plates.**

### 5.2 Sign plate count
Number of individual sign plates (the physical aluminum sheets with retroreflective film) to be ordered and installed. One sign code = one sign plate (in most cases; exceptions: oversized signs, back-to-back mounting).

**How to count:** Each sign icon on the map = 1 plate. Multiple icons at the same pole = multiple plates on that pole.

### 5.3 Sign code count (per type)
Number of times a specific sign code appears across the entire plan. This is what the legend כמות (quantity) column records.

**How to count:** Total occurrences of each unique sign code across all poles. Legend quantities = ground truth for this count.

### 5.4 Grouped assembly count
Some signs are always installed together as a unit (e.g., a directional arrow + a speed limit + a distance plate). The plan may draw these as a visual group and assign them a single pole number, even though they are 3 separate plates.

**How to count:** Treat assemblies as a pole cluster; enumerate the individual plates within the assembly separately.

### Correct quantity hierarchy

```
Written sign code on plan     → definitive identity of each plate
Legend כמות per code          → ground truth total count per type
Sum of icon occurrences       → cross-check (must equal legend כמות)
Visual recognition (Stage E)  → fallback when code text is missing/illegible
```

If `sum of icon occurrences ≠ legend כמות` → contradiction → flag for human review.

---

## 6. Source-of-Truth Hierarchy

From highest to lowest reliability:

| Priority | Source | Why reliable | When to use |
|---|---|---|---|
| 1 | Written sign code next to icon on map | Placed by the engineer; unambiguous; persists across plan revisions | Always use when present |
| 2 | Legend entry (Stage F) — code + quantity | Engineer-defined vocabulary for this plan | Cross-check identity; use quantity as expected total |
| 3 | Legend icon crop match (Stage G) | Same drawing style as map icon — eliminates style gap | Use when written code absent or ambiguous |
| 4 | Catalog template match (Stage E) | Known sign appearance, but photo vs. schematic style gap | Use only as fallback; treat as uncertain |
| 5 | Color + shape heuristic (Stage 4) | Fast but imprecise | Use only for classification, not identification |
| 6 | Human review | Infallible | Escalate all unresolved contradictions here |

**Critical rule:** Never override a written sign code with a visual guess. If the map says "402" next to an icon, the sign is 402 even if Stage E matches it to "402b" with higher score.

---

## 7. Contradiction Detection

Stage G should emit explicit contradiction records when:

| Contradiction type | Trigger | Severity |
|---|---|---|
| Code not in legend | Map has sign code "612" but legend has no 612 entry | HIGH — new sign type or legend gap |
| Legend quantity mismatch | Legend says 402: כמות=6, but Stage G finds 8 occurrences | HIGH — counting error or omitted icon |
| Visual vs. code mismatch | Stage E says sign_402 but written code says "605" | MEDIUM — possible OCR error or annotation error |
| Orphan legend entry | Legend lists sign type X but zero occurrences found on map | MEDIUM — possible detection failure or deleted sign |
| Multi-code cluster | Multiple different sign codes within 10pt of each other | MEDIUM — annotation overlap, needs human disambiguation |
| Unreadable code | Code text present but <0.7 OCR confidence | LOW — flag for human reading |

All contradictions are included in Stage G structured output. None should cause the pipeline to fail — they are information, not errors.

---

## 8. Human-Assisted Filtering

The pipeline does not attempt to be fully automatic. Instead, it produces a **review-ready output** that a human can correct efficiently:

### What the pipeline resolves automatically
- Clear written sign codes near well-isolated icons
- Sign types that appear in the legend with matching icon crops
- Quantity totals that match legend כמות exactly

### What requires human confirmation
- Poles with 3+ signs where DBSCAN merged them into a single cluster
- Icons with no adjacent text (code missing from plan)
- Contradictions (legend mismatch, unexpected code, orphan entry)
- Signs in the "uncertain" tier from Stage E with no written code

### Human review interface (future production concept)
The review tool shows the engineer:
1. Rendered crop of the map area around the disputed sign
2. Proposed sign code and source (written/legend/visual)
3. Nearby alternatives (top 3 visual matches)
4. Contradiction type and severity
5. Single-click accept / correct / skip

This turns a "fully automatic" problem into a "mostly automatic with efficient human cleanup" problem — which is the right risk posture for a document that drives physical fabrication orders.

---

## 9. Risk and Reliability Principles

### Errors in this pipeline are not symmetric

A **missed sign** (false negative) → field crew shows up without a sign → delay, emergency order, cost overrun.  
A **phantom sign** (false positive) → fabricated sign not installed → wasted material, investigation.  
A **wrong sign code** → wrong sign fabricated → both outcomes simultaneously.

**Design principle:** Prefer escalation to human review over silent wrong classification. It is always better to produce `{confidence: "low", requires_review: true}` than a confident wrong answer.

### Minimum viable confidence before downstream use

| Use case | Minimum acceptable confidence |
|---|---|
| Generating a fabrication order | HIGH (written code confirmed) or MEDIUM (legend match) + human review |
| Creating a preliminary estimate | MEDIUM (legend match) without human review |
| Research / internal analysis | LOW or uncertain — labelled as such |
| Field installation brief | HIGH only; all unresolved items listed explicitly |

### One-plan-at-a-time validation

Before any production use, validate Stage G output on a plan where the final installation record is already known. Count: how many signs did the pipeline correctly identify vs. how many were missed, wrong, or spurious? Publish this number as the system's stated accuracy before use.

---

## 10. Stage G — Proposed Direction

**Goal of Stage G:** Produce a structured per-plan sign inventory: for each sign occurrence on the map, emit its location, sign code (with source), pole grouping, and confidence tier.

**Input:** 
- `symbol_clusters.json` (Stage 4)
- `legend_vocabulary.json` (Stage F)
- Raw vector objects from page (for nearby text scan)
- Rendered page image (for visual fallback)

**Algorithm sketch:**

```
1. For each sign_symbol / compact_symbol cluster in symbol_clusters.json:
   a. Define search radius: 80pt from cluster centroid
   b. Find all text blocks within search radius in vector_objects.json
   c. Score each text block: distance (closer = better) + content (matches known sign code pattern \d{3,4}[a-z]?)
   d. Best text block above threshold → written_code = text, source = "written"
   e. No text block → try legend icon match (Stage F crops vs. cluster crop, same-style match)
   f. Legend match above threshold → code from legend, source = "legend"
   g. No legend match → try catalog template match (Stage E), source = "visual"
   h. Nothing above tier → code = null, source = "unresolved", requires_review = true

2. Group clusters into pole assemblies:
   a. Any 2+ clusters with centroids within POLE_RADIUS (50pt) = one pole
   b. Record all sign codes for this pole as the plate list

3. For each unique sign code across all poles:
   a. Count total occurrences
   b. Compare to legend כמות if available
   c. If mismatch → emit contradiction record

4. Output: sign_inventory.json, sign_inventory_debug_overlay.png, sign_inventory_report.md
```

**Stage G does NOT implement yet.** This document is architecture notes only.

**What remains research-only before production integration:**
- Stage G itself (this document describes its design, not its code)
- Any end-to-end accuracy measurement
- Hebrew OCR for reading sign codes from the plan (depends on whether codes are text objects or rendered as vector paths — must test)
- Legend Vision extraction (ANTHROPIC_API_KEY required for Hebrew labels + quantities)
- Multi-plan generalization testing (pipeline validated on one PDF only)
- GPS coordinate projection (converting plan coordinates to real-world lat/lng)

---

## 11. Answering the 8 Architecture Questions

**Q1: Did you observe the pole/dot + small-line + nearby sign-code pattern in the sample plan?**  
Yes. In `pole_cluster_zoom.png` (the large intersection area), sign icons appear clustered in groups of 2–5 near intersection approaches. Sign code text labels appear adjacent to icons. No standalone pole-dot symbol is visible at this zoom — the icon itself serves as the position anchor. The small-line (plate count) sub-pattern was not distinctly visible, suggesting this plan uses direct icon placement rather than the pole+fan-of-lines variant.

**Q2: Where does it appear and how should Stage G use it?**  
It appears at every intersection approach — the dense multi-sign regions that Stage 4 DBSCAN at eps=25 partially separates. Stage G should treat each well-isolated cluster (sign_symbol, compact_symbol) as one sign plate, use the nearest text block as the sign code, and group clusters within 50pt into pole assemblies.

**Q3: Detection strategy for this pattern in other plans?**  
See Section 4.3. Four variant types exist. Default to the "icon + nearby text" strategy (Type A); fall back to "small dot + line fan" (Type B) if the first strategy finds no text codes. Flag ambiguous cases.

**Q4: How to distinguish pole count / sign plate count / sign code count / grouped assembly count?**  
See Section 5. Short answer: poles = distinct spatial locations; plates = individual icon occurrences; code count = total per sign type; assemblies = groups of plates on one pole. Never conflate these in output JSON — emit all four distinct numbers.

**Q5: Evidence priority hierarchy?**  
See Section 6. Written code > legend entry > legend icon crop > catalog template > color/shape. Never override a written code with a visual guess.

**Q6: What contradictions should be flagged?**  
See Section 7. Six types: code not in legend, legend quantity mismatch, visual vs. code mismatch, orphan legend entry, multi-code cluster, unreadable code.

**Q7: What should Stage G produce as structured output?**  
`sign_inventory.json` — one record per sign occurrence, each containing: cluster_id, centroid, pole_group_id, sign_code, code_source, code_confidence, alternatives, contradiction_flags, requires_review boolean. Plus per-pole summary and per-code total vs. legend quantity comparison.

**Q8: What should remain research-only before production integration?**  
Stage G code itself. Hebrew OCR testing. Legend Vision extraction. Multi-plan generalization. GPS projection. End-to-end accuracy measurement against a known-good plan. None of these are production-ready without validation on multiple real plans.

---

## Appendix: Pipeline Stage Map

```
Stage 01  Extract raw vector objects         → vector_objects.json
Stage 02  Filter candidate symbols           → vector_objects.json (candidate_symbols)
Stage 03  [reserved]
Stage 04  DBSCAN cluster symbols             → symbol_clusters.json
Stage 05  [reserved]
Stage E   Template match vs. catalog         → sign_recognition_report.md (gated by Stage 4 quality)
Stage F   Legend extraction                  → legend_vocabulary.json (THIS STAGE)
Stage G   Sign inventory + pole grouping     → sign_inventory.json (NEXT STAGE — not yet implemented)
Stage H   [future] GPS coordinate projection
Stage I   [future] Cross-plan aggregation
```

**"סורק תוכניות" product** = Stages F + G + human review UI, packaged for production use.
