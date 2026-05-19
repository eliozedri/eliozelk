# Stage G v1 — Consolidated Research Status Report
## CAD PDF Intelligence Pipeline — Professional Plan-Reading / Sign Inventory

**Date:** 2026-05-19  
**Pipeline location:** `research/cad-pdf-intelligence/`  
**Status:** RESEARCH ONLY — not production-integrated, not approved for operational use  
**Stage G script:** `09_stage_g_inventory.py`  
**Architecture reference:** `PLAN_SCANNER_ARCHITECTURE.md`  
**Validated on:** `50-448-02-400.pdf` (single PDF — multi-plan validation pending)

---

## Executive Summary

Stage G v1 is a **research-only candidate detection and crop-generation pipeline**. It has successfully located candidate sign positions on the map, rendered 177 local crops ready for Vision API sign-code reading, and grouped detections into 119 pole/location candidates. It has **not** identified any sign, confirmed any code, validated any quantity, or produced anything usable for fabrication orders, field preparation, or billing.

The only reliable output right now is the set of **177 local code crops** — which are correctly positioned and correctly padded, and which a Vision API call can read to extract nearby sign code numbers. Everything else (legend matching, pole grouping, quantities) is provisional and must not be treated as ground truth.

---

## A. What Is Actually Achieved Now

| Capability | Status | Evidence |
|---|---|---|
| Legend region extraction (Stage F) | ✅ Complete | Subbox (3573,1206)→(3972,2085) confirmed |
| Legend icon crops extracted (Stage F) | ✅ Complete | 13 crops in `outputs/legend_icons/` |
| Sign-code PDF text extraction diagnostic | ✅ Complete | Confirmed: codes are vector paths, not text |
| Stage 4 DBSCAN clustering | ✅ Complete | 223 clusters, 191 candidates |
| Legend-area cluster exclusion | ✅ Working | 14 clusters correctly excluded |
| Local crop rendering (177 crops at 160pt) | ✅ Complete | `outputs/stage_g_code_crops/` |
| Legend icon template matching | ⚠️ Weak | Max score 0.25 — below useful threshold |
| Pole assembly grouping (119 groups) | ⚠️ Provisional | Unvalidated, configurable, research-only |
| Sign code reading | ❌ Pending | Vision API not configured |
| Hebrew label extraction | ❌ Pending | Vision API required |
| Legend quantity (כמות) extraction | ❌ Pending | Vision API required |
| Quantity reconciliation | ❌ Not started | Requires Vision codes first |
| Human review workflow | ❌ Not built | Future production feature |

---

## B. What Is Prepared for Vision API

The following outputs are ready for Vision API processing immediately once `ANTHROPIC_API_KEY` is configured:

1. **177 local code crops** (`outputs/stage_g_code_crops/occ_NNNN.png`) — each is a 160pt × 160pt area (at 150 DPI ≈ 333px × 333px) centered on a sign cluster candidate. Visually verified: sign code numbers like "60" (speed limit circles), Hebrew text labels, and sign icons are clearly visible in these crops.

2. **Legend subbox crop** (`outputs/legend_subbox_crop.png`) — the full legend box for one Vision call to extract: Hebrew label per row, sign code per row, quantity (כמות) per row.

**Vision call structure for sign-code reading:**
```json
{
  "prompt": "What traffic sign code number appears near this sign? Israeli codes are 3-4 digits (402, 605, 625b). Return JSON only: {code_candidates: [{code, confidence, location}], notes}",
  "image": "base64-encoded crop",
  "model": "claude-opus-4-5",
  "max_tokens": 300
}
```

**What Vision is expected to return:**
- The 3-4 digit sign code number visible near the sign (if any)
- Confidence level
- Notes on whether the code is clear or ambiguous

**What Vision cannot decide on its own:**
- Which code belongs to which specific sign if multiple signs appear in the crop
- Whether the returned code is spatially associated with the target sign vs. a neighboring sign
- Whether the code contradicts the visual legend match

Spatial association validation must happen AFTER Vision reads the crops — see Section: Spatial Association Rules.

---

## C. What Is Still Unverified

1. **Legend template matching quality** — max score 0.25 is below useful confidence. Cause analysis required (see Section: Visual Matching Analysis).

2. **Pole grouping accuracy** — the 50pt radius is a research parameter, not a validated quantity. Actual pole count on this plan is unknown without ground truth comparison.

3. **Sign identity of any detection** — without Vision reading the code crops, no sign has been identified. Template matching alone at 0.08-0.25 confidence is insufficient for identity claims.

4. **Multi-plan generalization** — Stage G v1 has been run on one PDF. Whether it generalizes to other plans, engineers, or CAD template styles is unknown.

5. **Type B, C, D, E plan notation** — only Type A (icon-anchored with nearby label) has been tested. Other notation types are documented but not implemented.

6. **Legend semantic content** — Hebrew labels and sign codes in the legend are not yet extracted (Vision API pending). The plan's own ground truth vocabulary is therefore unavailable.

---

## D. What Requires Human Review

Every single output of Stage G v1 is marked `requires_review = true`. This is correct and expected without Vision. Specific categories:

| Category | Count | Why review required |
|---|---|---|
| All sign occurrences | 177 | Sign codes unread (Vision pending) |
| All legend matches | 32 | Low scores (0.08–0.25) — uncertain identity |
| All pole groups | 119 | Grouping radius unvalidated, may over/under merge |
| Legend-area exclusions | 14 | Verify exclusion was correct for each |
| No-match clusters | 145 | May be valid signs that Stage 4 or Stage G misclassified |
| Dense intersection groups | Unknown | High risk of cross-pole merging at 50pt radius |

No output from Stage G v1 should be used for orders, fabrication, field preparation, or billing without human review and Vision API sign-code confirmation.

---

## E. What Is Required Before Production Integration

In strict priority order:

1. **Vision API integration + test run** — run 09_stage_g_inventory.py with `ANTHROPIC_API_KEY` set on the same PDF. Measure: how many of 177 crops return readable sign codes? This is the single most important next test.

2. **Spatial association validation** — after Vision reads codes, verify that each returned code is correctly associated with the right sign cluster (not a neighboring sign). See Spatial Association Rules section.

3. **Legend semantic extraction** — run Stage F Vision call to extract Hebrew labels, sign codes, and כמות quantities from the legend. This provides the expected totals for quantity reconciliation.

4. **Quantity reconciliation** — compare Vision-read map counts to legend-declared quantities. Flag any mismatch.

5. **Multi-plan validation** — run on 3+ additional plans from different engineers. Measure consistency.

6. **Ground truth comparison** — run on a plan where the final executed sign count is already known (from a completed project). Measure precision and recall.

7. **Pole grouping parameter tuning** — visual review of `pole_grouping_debug_overlay.png` by a professional engineer. Adjust radius if needed.

8. **Visual matching improvement** — apply Stage G v2 improvements to raise legend match scores (see improvement plan).

9. **Human approval workflow** — build the review UI before any production use.

10. **Professional engineer sign-off** — the output of the pipeline must be reviewed by someone who can read Israeli traffic engineering plans before any operational use.

---

## Written Sign Code as Decisive Evidence

**The written sign code/number near a sign is the most authoritative identity signal in a professional traffic plan.** This is because:

- The engineer who drew the plan assigned the code explicitly
- The code is tied to a specific legal/regulatory sign type (Israeli sign ordinance)
- The code is stable across plan revisions
- The code uniquely identifies the sign type without visual interpretation

Visual template matching is a **backup** for when the written code is missing, unclear, or spatially ambiguous. It must never override a clearly associated written code.

### Evidence hierarchy (from strongest to weakest)

| Rank | Source | Condition for use |
|---|---|---|
| 1 | Written sign code — clearly spatially associated | Use whenever present and association is unambiguous |
| 2 | Written sign code — uncertain spatial association | Use with requires_review = true; do not force |
| 3 | Plan-specific legend entry (Stage F) — code + כמות | Cross-check and validate against map detections |
| 4 | Plan-specific legend icon crop match (Stage G) | Same CAD style — strongest visual evidence |
| 5 | General catalog template match (Stage E) | Photo vs. schematic style gap — fallback only |
| 6 | Color + shape heuristic | Classification only; never use for identity |
| 7 | Human confirmation | Definitive; required before operational use |

**Critical rule:** A clearly associated written code overrides any visual match result. If Vision API reads "402" from a crop and the visual match says "sign_605" at score 0.25, the answer is 402 — and the visual mismatch becomes a note, not a contradiction unless the association itself is suspicious.

**If visual and written code agree:** confidence increases.  
**If visual and written code disagree:** flag `code_visual_mismatch` — investigate before accepting either.  
**If written code uncertain:** mark `association_uncertain`, requires_review = true.  
**If no written code found:** use visual match only as provisional, clearly labelled as such.

---

## Spatial Association Rules

Written codes from Vision API crops must be spatially validated — Vision reads what's in the crop, not which sign owns the code. In a dense intersection crop, multiple codes from multiple signs may appear.

### Association scoring factors

| Factor | Weight | Notes |
|---|---|---|
| Distance from code text to cluster centroid | High | Closer = stronger, but not automatic |
| Direction — is code below/left of icon? | Medium | RTL Hebrew plans: code typically below or left |
| Bbox overlap / proximity | Medium | Code bbox must not overlap another cluster bbox |
| Cluster membership | High | Code inside cluster bbox = strong association |
| Local density | High | If 3+ codes + 3+ icons in crop → flag dense zone |
| Pattern match | High | Must match sign code pattern: `\d{3,4}[a-z]?` |

### Ambiguity rules

- **One code, multiple candidate icons in crop:** `ambiguous_association = true`, requires_review
- **One icon, multiple candidate codes in crop:** `multi_code_overlap = true`, requires_review
- **Code clearly closest to target icon, no other candidates:** `association_confidence = high`
- **Code present but two plausible icons at similar distance:** `association_confidence = uncertain`, requires_review
- **No code found in crop:** fall through to legend match, then catalog, then `unresolved`

**Never assume nearest = correct in dense crop areas.** Association logic must consider the full local context.

---

## Quantity Model: Poles, Plates, Codes, Assemblies

The pipeline must maintain strict separation of seven quantity layers:

| Layer | Description | Stage G v1 status |
|---|---|---|
| Physical poles / installation points | Distinct pole locations on the plan | 119 groups (provisional, unvalidated) |
| Sign plates per pole | Each individual plate mounted on a pole | 177 occurrences (unvalidated identity) |
| Sign codes / types | Unique sign code per occurrence | 0 — Vision pending |
| Grouped sign assemblies | Multi-plate groups on one pole | 119 assemblies (1 per pole in v1) |
| Legend-declared quantities (כמות) | Expected total per code type | Pending Stage F Vision |
| Map-counted quantities | Stage G actual count per code | 0 — Vision pending |
| Reconciled execution quantities | Human-approved final values | Pending all above |

**One physical pole ≠ one sign plate ≠ one sign code.** These must never be conflated. A pole with 4 sign plates contributes 1 to pole count, 4 to plate count, and potentially 4 distinct entries to code count.

---

## Plan Notation Variants and Detection Strategy

Stage G v1 implements Type A only. All five variants are documented for future implementation.

### Type A — Icon-anchored (confirmed in sample plan)

The sign icon appears at its installation location on the map. A 3-4 digit sign code appears as small text adjacent to the icon (typically below or left in RTL Hebrew plans).

- **Detection:** Stage 4 DBSCAN clusters → 160pt crop → Vision reads code
- **Primary evidence:** Written code from crop + icon cluster as spatial anchor
- **Pole grouping:** Clusters within POLE_GROUPING_RADIUS_PTS → one pole
- **Review triggers:** Dense zones, missing code, ambiguous association

### Type B — Pole-dot + fan-line

A small filled dot marks the physical pole. Short radiating line segments (fan) extend from the dot, one per sign plate. A sign icon or code appears near each line endpoint.

- **Detection:** Detect small filled circles (<8pt radius, dark fill) → detect short lines with endpoint near dot → render crop per endpoint → Vision reads code
- **Primary evidence:** Written code at line endpoint
- **Pole grouping:** All lines from same dot = one pole
- **Review triggers:** Fan with no resolved codes, dot without lines, endpoint ambiguity
- **Status:** Not observed in sample plan; not yet implemented

**Did Stage G observe Type B in the sample?** No. The sample plan (`50-448-02-400.pdf`) uses Type A: full colored sign icons at their installation locations with adjacent code text. No standalone pole-dot or fan-line pattern was observed at the zoom levels used.

**Design for Type B in other plans:** Stage G v2 should add a pre-pass that scans for small filled circles with radiating line geometry. If found, switch to Type B logic for those regions. If a plan contains both Type A and Type B regions, apply per-region detection.

### Type C — Code-only annotation

The plan shows written sign codes without reliable icons. Code location = installation point estimate.

- **Detection:** Scan for text matching sign code pattern (`\d{3,4}[a-z]?`) via Vision on area crops
- **Primary evidence:** Written code (all records from Type C require review)
- **Not yet implemented**

### Type D — Balloon / callout annotation

A callout bubble with a number or leader line points to the installation location. Cross-reference to a sign schedule table.

- **Not yet implemented**

### Type E — Legend-driven symbolic style

The plan uses simplified placeholder symbols that must be interpreted via Stage F legend.

- **Detection:** Stage F legend crops as sole reference; match simplified symbols to legend entries
- **Not yet implemented**

---

## Current Limitations — Full Statement

**These limitations must be understood before drawing any conclusions from Stage G v1 output.**

1. **177 code crops are not 177 identified signs.** They are candidate locations that need Vision to read the sign code. Until Vision reads and validates the codes, no sign is identified. "Identified" means: sign code confirmed, spatial association validated, legend cross-checked.

2. **119 pole groups are candidate locations, not an approved pole quantity.** The grouping radius (50pt) is a research parameter that has not been validated by a professional engineer reviewing an actual plan. Dense intersections may cause incorrect merging (two separate poles combined into one group). Sparse areas may split one assembly incorrectly. The pole count on this plan could be higher or lower than 119.

3. **All grouping must be verified by overlay and/or human review.** `pole_grouping_debug_overlay.png` exists for this purpose — but it must be reviewed by someone who can read the plan.

4. **Legend match confidence is weak.** Maximum observed score: 0.25. Useful match typically requires ≥ 0.30 for medium, ≥ 0.45 for high. No high-tier matches were found. The legend crop matching pipeline exists and runs, but its current output is not reliable enough to use as identity evidence. Root cause analysis is in the next section.

5. **One-plan validation is not enough.** Stage G v1 has been run on a single PDF from a single project. Whether the pipeline generalizes to different engineers, different AutoCAD template versions, different plan types (highway, urban intersection, roundabout, work zone) is completely unknown.

6. **Symbol fragment clusters (141 of 177 candidates) degrade match quality.** A symbol_fragment is a partial sub-path of a sign — it does not contain the full sign shape. Matching a fragment to a legend template that shows the complete sign cannot reliably succeed.

7. **Stage 4 DBSCAN clustering is still the bottleneck.** If eps=25 merges adjacent signs (as confirmed in the Stage 4 analysis), the merged cluster cannot be correctly matched or correctly counted. Stage G inherits all Stage 4 errors.

8. **No ground truth exists for comparison.** We cannot currently measure precision or recall because we do not have the final executed sign count for this plan.

---

## Visual Matching Analysis and Stage G v2 Improvement Plan

### Why are legend match scores low? (root cause analysis)

The current scores (max 0.25, typically 0.08–0.18) are caused by multiple factors:

| Root cause | Explanation | Fix |
|---|---|---|
| **Legend crop contains excess whitespace** | The icon crop is right 35% of a full legend row (291px wide). The actual sign icon may occupy only 60–100px of that. Canny preprocessing finds the largest contour, but the normalized 128×128 image is dominated by whitespace. | Tighten icon crop to the sign's bounding contour before preprocessing |
| **Scale mismatch** | Legend icons are drawn at a different scale than map signs. The map sign cluster bboxes average 27pt (56px at 150 DPI). The legend sign may be drawn at a slightly different size. | Multi-scale template matching (try 0.7×, 1.0×, 1.3× of template before normalizing to 128) |
| **Symbol fragments dominate** | 141/177 candidates are symbol_fragment clusters — partial sign paths. No fragment can fully match a complete legend template. | Pre-filter: only match sign_symbol and compact_symbol clusters against legend. Treat symbol_fragment as "partial detection" requiring grouping before matching. |
| **Canny edges are sparse** | CAD schematic signs have thin outlines and few interior details. Canny at thresholds 40/120 may not capture enough edge structure for reliable correlation. | Tune Canny thresholds per color bucket; try lower thresholds (20/80) for colored signs; try gradient magnitude instead of binary Canny |
| **Cluster crop is a local region, not the isolated sign** | The 35pt-padded cluster crop contains the sign plus surrounding road geometry, nearby labels, and other visual noise. The Canny preprocessing tries to isolate the center contour, but noise affects the result. | Render the cluster bbox tightly (1pt padding), apply color masking to isolate only the sign's dominant color, then normalize |

### Stage G v2 improvement options (do not implement yet — document for planning)

Priority order for implementation:

1. **Tight contour crop for legend templates** — after loading each legend icon crop, find the largest colored contour (the sign shape), crop to that contour's bounding rect + 5px margin, and store as `template_tight`. Use this for matching instead of the full row crop. Estimated impact: significant — removes most whitespace noise.

2. **Color-masking before Canny on cluster crops** — apply HSV color mask (using the cluster's dominant_color bucket) before Canny extraction. This suppresses surrounding road geometry and isolates the sign shape. Already used in Stage E — confirm it's also applied in Stage G cluster preprocessing.

3. **Filter to sign_symbol + compact_symbol only for legend matching** — exclude symbol_fragment clusters from legend template matching. Match only clusters that contain a complete sign shape. Report symbol_fragments as "partial detection — needs grouping" instead.

4. **Multi-scale template matching** — resize each legend template to 0.75×, 1.0×, 1.25× before normalizing to 128. Keep the best score across scales. Estimated impact: moderate — addresses scale mismatch.

5. **ORB/AKAZE feature matching as fallback** — if Canny score < 0.15, try ORB keypoint matching as a secondary method. ORB is more scale/rotation tolerant but requires sufficient keypoints (may fail on sparse CAD icons).

6. **Legend-then-Vision two-pass** — use legend match as a "shortlist" (top-3 legend candidates per cluster), then send the crop to Vision with the question: "Does this look like sign number X, Y, or Z?" This combines visual ranking with Vision's semantic understanding.

7. **Stage G v2 accuracy measurement** — after Vision reads codes, measure: for clusters where Vision returned a sign code, does the top legend template match agree? This gives a precision estimate for the legend matching component.

---

## Vision API Strategy

### Current state

`ANTHROPIC_API_KEY` was not set during Stage G v1 run. All 177 occurrences are marked `sign_code_source: "pending_vision_configuration"`. The crops are saved and ready.

### Vision call design (implemented in 09_stage_g_inventory.py)

```python
# For each occurrence where code_crop exists:
prompt = (
    "You are analyzing a crop from an Israeli traffic arrangement engineering plan. "
    "Look for any traffic sign code number near this sign. "
    "Israeli codes are 3-4 digits (402, 605, 625b). "
    "Return JSON only: {code_candidates: [{code, confidence, location}], overall_notes}"
)
# Send base64-encoded PNG of the 160pt-radius crop to claude-opus-4-5
```

### What Vision can and cannot do

| Vision can | Vision cannot |
|---|---|
| Read visible digit sequences from the crop | Know which sign "owns" a code when multiple signs appear in crop |
| Identify that a code is adjacent to a specific sign | Validate spatial association — that must be done in code |
| Return confidence and notes on ambiguity | Cross-check against the legend vocabulary |
| Handle Hebrew text if asked | Automatically resolve contradictions |

### Post-Vision pipeline (required after Vision run)

1. Parse Vision JSON response for each occurrence
2. For each returned code candidate: apply spatial association scoring (distance, direction, density)
3. Assign `selected_sign_code` only when association_confidence = "high" or "medium"
4. Flag `association_uncertain` when multiple plausible assignments exist
5. Cross-check selected code against Stage F legend vocabulary
6. If code not in legend: emit `code_not_in_legend` contradiction
7. Count occurrences per code; compare to legend כמות (when available)
8. Emit quantity reconciliation records

### Recommended Vision output schema per occurrence

```json
{
  "crop_id":                "OCC-0023.png",
  "occurrence_id":          "OCC-0023",
  "detected_codes":         [{"code": "402", "confidence": 0.9, "location": "below sign"}],
  "selected_code_if_unambiguous": "402",
  "association_confidence": "high",
  "spatial_notes":          "Only one code visible in crop, clearly adjacent to sign",
  "ambiguity_notes":        null,
  "requires_review":        false,
  "raw_model_notes":        "Clear red circle with '402' text below it"
}
```

---

## Human-Assisted Filtering and Noise Suppression

Traffic plans contain many objects irrelevant to Elkayam's execution quantities.

### Execution-relevant objects (include in quantity extraction)

| Object | Hebrew | Detection approach |
|---|---|---|
| Traffic signs | תמרורים | DBSCAN sign_symbol, compact_symbol clusters |
| Sign codes / numbers | מספרי תמרורים | Vision API on code crops |
| Poles / installation points | עמודים | Pole grouping of sign clusters |
| Guardrails | מעקות | Future Stage J (large linear structures) |
| Road markings | סימוני כביש | road_marking_stripe clusters from Stage 4 |
| Arrow trailers | עגלות חץ | Future — large orange rectangular elements |
| Cones | קונוסים | Future — small orange cone shapes |
| Inspectors / traffic control | פקחים | Future — annotation detection |
| Barriers | חסימות | Future — linear barrier shapes |
| Work areas | שטחי עבודה | Future — zone boundary polygons |
| Pedestrian crossings | מעברי הולכי רגל | Zebra stripe patterns |
| Large construction signs | שילוט | Oversized sign clusters |

### Background / noise objects (suppress from quantity extraction)

Buildings, house numbers, trees, landscaping, road background geometry (outlines, kerb lines), title block data, unrelated labels, topographic lines, utility infrastructure shown for reference.

### Current noise report status

`noise_report.json` produced by Stage G v1 provides a first-pass classification:
- **execution_relevant:** sign_symbol, compact_symbol, road_marking_stripe clusters with colored fill
- **contextual_background:** large_structure, micro_noise, gray-fill fragments
- **uncertain:** multi_symbol clusters, mixed-color fragments

This classification is heuristic-only and has not been validated. It should be reviewed by a professional engineer.

### Future noise suppression workflow

Stage G v2 should emit a `noise_review_prompt` containing:
- "I detected 12 large gray polygons near the road edges. Are these buildings or work areas?"
- "I found 47 small numeric labels matching house-number format. Ignore these?"
- "There are road outline polygons across the full plan. Treat as background?"

Human answers become `ignore_rule` entries in the תרגול ולמידה teaching system.

---

## Future Feature: תרגול ולמידה / Human Teaching Loop

### Purpose

When Stage G is uncertain — or when a plan uses non-standard notation — a human expert teaches the system the correct interpretation. The explanation becomes a reusable rule.

**This feature can resolve in 30 seconds what would take weeks of algorithmic engineering to hardcode.**

### How it works

1. Stage G flags an uncertain detection with `requires_review = true` and `teaching_candidate = true`
2. The review UI shows: the rendered crop + the system's best guess + confidence + alternatives
3. The human provides:
   - What this symbol/code means
   - Whether it should be counted
   - Whether it should be ignored
   - How this project specifically marks poles/assemblies
4. The explanation is stored as a structured rule

### Rule types

| Rule type | Example |
|---|---|
| `interpretation_rule` | "Small diamond = sign to be removed, not installed" |
| `ignore_rule` | "Gray hatching = existing road surface, not a sign element" |
| `quantity_rule` | "Count cone zones per 5m linear meter, not per icon" |
| `association_rule` | "Codes appear above icons in this engineer's style, not below" |
| `notation_rule` | "This engineer uses A1/A2/A3 balloons instead of numeric codes" |

### Scope and promotion model

```
plan-level rule  →  applies only to this PDF
project-level    →  applies to all plans in this project (requires manual promotion)
company-level    →  applies globally (requires second approver, not the creator)
```

Rules are never self-promoted. No rule is applied retroactively without re-running the scan. A rule that contradicts an existing rule triggers a conflict alert.

### Current connection to Stage G v1

Every occurrence with `requires_review = true` and `no_legend_match` or `vision_no_code_found` is a `teaching_candidate`. Stage G v1 emits these in the report. When the review UI is built, these records feed directly into the teaching queue.

---

## Future Product Module: סורק תוכניות and BOQ Generation

### Module definition

**Sidebar module name:** סורק תוכניות  
**Agent:** Plan / Engineering Analyzer Agent  
**Output:** Professional scan report + draft כתב כמויות / BOQ requiring human approval

This is a **critical operational workflow**, not an upload screen.

### 15-step production workflow

```
1.  Upload engineering / CAD / PDF plan
2.  Detect plan type, revision, discipline
3.  Detect legend (מקרא מפה) if present → Stage F
4.  Extract plan-specific vocabulary from legend (icons, codes, quantities) → Stage F Vision
5.  Detect map sign symbols / icons → Stages 4, E
6.  Detect physical poles / installation points → Stage G
7.  Detect grouped sign assemblies → Stage G
8.  Detect guardrails, barriers, road markings, arrow trailers, cones,
        work zones, inspectors, and other execution objects → Stage J (future)
9.  Separate execution-relevant from background noise → noise report
10. Reconcile legend quantities vs. map-counted quantities
11. Flag contradictions and uncertain detections
12. Ask human clarification via review UI (or תרגול ולמידה)
13. Produce professional scan report
14. Produce draft כתב כמויות / BOQ  ← DRAFT, must be clearly labelled
15. Require explicit human approval before operational use
```

### Sub-agents (future, not yet designed)

- Plan Analyzer Agent — runs the pipeline stages
- Engineering QA Agent — validates outputs, flags contradictions
- Quantity Reconciliation Agent — compares map-counted vs. legend-declared
- Human Review / Approval Agent — routes uncertain items to the right reviewer
- BOQ / Pricing / Billing Handoff Agent — prepares approved output for operations
- Teaching Agent — handles תרגול ולמידה rule capture and promotion

---

## Risk, Confidence, Audit Trail, and Approval

### What goes wrong when this module produces wrong output

| Error type | Business consequence |
|---|---|
| Missed sign | Field crew arrives without a sign → delay, emergency order, cost overrun |
| Phantom sign | Fabricated sign not installed → wasted material, investigation |
| Wrong sign code | Wrong sign fabricated → double cost (re-fabricate) + delay |
| Wrong pole count | Incorrect crew size, wrong equipment → execution failure |
| Wrong assembly interpretation | Incorrect installation → field rework |
| Over/under quantity | Incorrect estimate → customer dispute, financial loss |

**Errors in this pipeline are not symmetric.** A missed sign costs money AND time. A wrong code costs more money AND professional liability. There is no "acceptable error rate" before human approval for fabrication-driving quantities.

### Confidence tiers

| Tier | Label | Condition | Downstream permission |
|---|---|---|---|
| 1 | `confirmed` | Written code + Vision confirmed + human approved | Fabrication order |
| 2 | `high` | Written code clearly associated, no contradictions | Preliminary estimate |
| 3 | `medium` | Legend match or Vision code, minor ambiguity | Internal analysis only |
| 4 | `low` | Weak visual match, uncertain association | Research only |
| 5 | `unresolved` | No reliable source | Must resolve before any use |

**Stage G v1 current confidence:** All 177 occurrences are tier 4 or 5. None are tier 1, 2, or 3.

### Audit trail requirements (future production)

Every approved item must carry:
- `evidence_chain`: all sources that contributed to the final code assignment
- `reviewed_by` + `reviewed_at`: populated before approval_status can change
- `approval_status`: draft → reviewed → approved (never auto-promoted)
- `contradiction_flags`: all detected contradictions, even resolved ones

**The pipeline must never auto-approve its own output for operational use.**

---

## Next Steps

**Immediate (before any further pipeline development):**

1. **Run Stage G v1 with ANTHROPIC_API_KEY configured.** This is the single most valuable next action. It will convert 177 pending crops into actual sign code readings and reveal how many codes are readable.

2. **Run Stage F Vision call** (pass API key to `07_extract_legend.py`). Extract Hebrew labels, sign codes, and כמות quantities from the plan legend. This gives the ground truth vocabulary against which Stage G codes will be reconciled.

3. **Measure Vision coverage.** Of 177 crops, how many return a readable sign code? What fraction are clear vs. ambiguous? This determines whether the pipeline is useful at all.

**After Vision run:**

4. **Implement spatial association scoring** — for each Vision-returned code, score its association with the correct sign cluster vs. neighbors.

5. **Quantity reconciliation** — compare Vision-read map counts to Stage F legend כמות. Emit contradiction records.

6. **Overlay review** — a professional engineer should review `sign_inventory_debug_overlay.png` and `pole_grouping_debug_overlay.png` and provide corrections.

**Stage G v2 (after Vision measurement confirms utility):**

7. **Tight contour cropping for legend templates** — remove whitespace from legend icon crops before Canny preprocessing.

8. **Filter to sign_symbol + compact_symbol only for legend matching** — stop matching symbol_fragments against templates.

9. **Type B pole-dot detection** — add pre-pass to detect small filled circles with radiating lines.

10. **Multi-plan validation** — run on 3+ additional plans.

**Before production integration:**

11. **Ground truth comparison** — one completed project where the final sign count is known.
12. **Human approval workflow** — the review UI.
13. **Professional engineer sign-off** on methodology.

---

## Is it Safe to Proceed to the Next Step?

**Yes — the next step is running Stage G v1 with the Vision API key, not building new pipeline stages.**

Stage G v1 is complete as a research pipeline. The architecture is sound. The outputs are correctly structured. The code crops are correctly positioned. The correct next step is measurement: run with Vision and see how many codes are readable.

**Do not build Stage G v2 before measuring Stage G v1 Vision performance.**  
**Do not start production UI before Vision measurement.**  
**Do not start BOQ generation before at least one ground-truth comparison.**

---

*This document is a research status report. All quantities, pole counts, sign matches, and other pipeline outputs described herein are research estimates. None are approved for operational use.*
