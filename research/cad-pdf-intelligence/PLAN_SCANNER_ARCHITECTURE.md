# Plan Scanner Architecture
## CAD PDF Intelligence — Professional Plan-Reading Logic

**Date:** 2026-05-19 (updated 2026-05-19)  
**Pipeline location:** `research/cad-pdf-intelligence/`  
**Status:** Research architecture notes — not production-integrated  
**Predecessor:** Stage F (`07_extract_legend.py`) shipped and validated  
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

## 2. Professional Plan-Reading Logic

### How an experienced engineer reads a traffic plan

1. **Find the legend (מקרא מפה)** — understand which symbols are used in THIS plan and their codes
2. **Identify pole locations** — look for the dot, pole symbol, or sign icon cluster on the map
3. **Count sign plates per pole** — each icon, small line, or callout represents one plate
4. **Read sign codes** — the number printed next to each sign plate (e.g., 402, 605)
5. **Cross-check with legend** — confirm the sign code appears in the legend
6. **Note any written overrides** — dimensions, custom text, mounting height notes
7. **Count and verify** — total count per type must match legend quantities (כמות)
8. **Flag anomalies** — sign code on map not in legend, legend entry with zero map matches, etc.

### How this translates to the pipeline

| Human action | Pipeline equivalent |
|---|---|
| Read legend | Stage F: extract legend vocabulary |
| Find pole/icon location | Stage G: detect sign icon clusters or pole dots |
| Count plate lines | Stage G: count icons per spatial cluster |
| Read sign code | Stage G: spatial association of nearby text with sign icon |
| Cross-check legend | Stage G: match code to Stage F vocabulary |
| Count and verify | Stage G: compare per-code count to legend כמות |
| Flag anomalies | Stage G: emit contradiction records |

---

## 3. Observed Pattern in Sample Plan

### What was observed in `outputs/pole_cluster_zoom.png`

**Pattern type observed: Type A (Icon-anchored)**

- Full-colored sign icons appear on the map: stop signs, speed limits, mandatory direction arrows, no-entry signs, pedestrian indicators
- Multiple signs cluster near intersection approach points — 2–5 signs within 200pt of each other, implying shared pole locations
- Sign code numbers appear as small text adjacent to sign icons — the written labels are the most reliable identity signal
- No standalone pole-dot symbol is distinctly visible at this zoom — this plan variant uses the sign icon itself as the position anchor
- The small-line (fan) sub-pattern (Type B) was not observed in the sample plan

### Type B pattern — not observed but expected in other plans

In plans using the pole-dot + fan-line notation:
- A filled black dot marks the pole location
- Short radiating lines (fan) extend from the dot, one per sign plate
- A small sign icon or written code appears at the end of each line

Stage G must be designed to handle both Type A and Type B. See Section 7 for full variant catalog.

---

## 4. Written Code Association Rules

Written sign codes are the strongest identity signal — but only when correctly spatially associated with the right sign icon or pole.

**A written code must never be assumed "nearest = correct."** In dense intersection areas, multiple sign codes appear in close proximity to multiple icons. A code that is 10pt closer to the wrong icon must not be assigned to it if the layout context points elsewhere.

### Association algorithm requirements

Stage G must compute an **association score** for each (text_block, sign_cluster) candidate pair:

| Factor | Weight | Notes |
|---|---|---|
| Centroid distance | High | Primary signal; threshold: 80pt for isolated signs, 30pt for dense areas |
| Direction / orientation | Medium | In Type A plans, codes typically appear below or to the left of the icon (RTL Hebrew) |
| Bounding box proximity | Medium | Text bbox must not overlap another sign cluster bbox |
| Cluster membership | High | Text that is geometrically inside a DBSCAN cluster bbox is likely associated with that cluster |
| Local density | Medium | If 3+ codes and 3+ icons are within 100pt, flag as dense zone and require human review |
| Pattern match | High | Code must match sign code pattern: `\d{3,4}[a-z]?` (e.g., 402, 625b) |

### Ambiguity rules

- **One code, multiple candidate icons within threshold:** Flag as `ambiguous_association`, requires_review = true. Do not force assignment.
- **One icon, multiple candidate codes within threshold:** Flag as `multi_code_overlap`, requires_review = true. Report all candidates.
- **Code clearly associated (single dominant candidate, unambiguous direction):** Use as `written_code`, association_confidence = high.
- **Code present but association uncertain (two plausible icons, similar distance):** Use as `written_code_uncertain`, association_confidence = medium, requires_review = true.
- **No code found within threshold:** Fall through to legend icon match, then catalog match.

### Interaction with visual matching

| Written code | Visual match | Result |
|---|---|---|
| Clearly associated | Agrees with code | Confidence INCREASES; both sources agree |
| Clearly associated | Disagrees with code | Flag `code_visual_mismatch` contradiction; written code wins |
| Uncertain association | Any visual match | Do not force written code; use visual as primary, mark requires_review |
| No code | Good visual match | Use visual identity, mark source as `legend_match` or `catalog_match` |
| No code | Poor visual match | Mark source as `unresolved`, requires_review = true |

**Critical rule:** A clearly associated written code overrides any visual match. A written code with uncertain association does not override visual match — it becomes a contradiction flag.

---

## 5. Quantity Model: Poles, Plates, Codes, Assemblies

This is the most critical conceptual distinction for correctness. The pipeline must never collapse these four quantities into a single count. They serve different downstream purposes.

### The seven quantity layers

| Layer | Description | Downstream use |
|---|---|---|
| **Physical installation points / poles** | Number of distinct pole locations on the plan | Team preparation, pole installation work orders |
| **Individual sign plates** | Each plate to be fabricated and installed | Fabrication orders, material costs |
| **Sign codes / sign types** | Unique sign code occurrences across the plan | Catalog lookup, per-type ordering |
| **Grouped sign assemblies** | Multi-plate groups on a single pole | Installation sequence, height specs |
| **Legend-declared quantities** | כמות from Stage F legend extraction | Authoritative expected total per code type |
| **Map-counted quantities** | Stage G's actual count from scanning the map | Cross-check source |
| **Reconciled execution quantities** | After human review and contradiction resolution | Final approved quantities for orders and billing |

### Updated `sign_inventory.json` schema

Each record in `sign_inventory.json` represents a **single sign plate occurrence** on the plan:

```json
{
  "occurrence_id": "OCC-0042",
  "page_number": 0,
  "physical_location_id": "LOC-007",
  "pole_group_id": "POLE-007",
  "assembly_id": "ASSY-007-A",
  "sign_plate_id": "PLATE-007-02",
  "sign_code": "402",
  "sign_identity_source": "nearby_written_code",
  "code_text_bbox": [1843.2, 1412.5, 1867.0, 1424.1],
  "sign_icon_bbox": [1851.0, 1297.0, 1905.0, 1352.0],
  "pole_centroid": [1878.0, 1394.0],
  "association_confidence": "high",
  "association_notes": "Code 30pt below icon, single candidate, no density conflict",
  "visual_match_top": "sign_402",
  "visual_match_score": 0.34,
  "visual_match_agrees": true,
  "final_confidence": "medium",
  "contradiction_flags": [],
  "requires_review": false,
  "quantity_category": "sign_plate"
}
```

Valid `sign_identity_source` values:
- `nearby_written_code` — code text spatially associated with high confidence
- `nearby_written_code_uncertain` — code text present but association uncertain
- `legend_icon_match` — matched to Stage F legend crop
- `catalog_template_match` — matched to catalog template (Stage E)
- `human_confirmed` — reviewed and confirmed by a human
- `uncertain` — no reliable source; requires_review = true

### Top-level summary block in `sign_inventory.json`

```json
{
  "summary": {
    "total_poles": 18,
    "total_sign_plates": 47,
    "unique_sign_codes": 12,
    "total_assemblies": 23,
    "legend_declared_quantities": { "402": 6, "605": 4, "625b": 2 },
    "map_counted_quantities":    { "402": 6, "605": 5, "625b": 2 },
    "reconciled_quantities":     null,
    "reconciliation_status": "pending_human_review",
    "items_requiring_review": 9,
    "contradiction_count": 3
  }
}
```

`reconciled_quantities` is null until a human approves. It must never be auto-populated without review.

---

## 6. Source-of-Truth Hierarchy

From highest to lowest reliability:

| Priority | Source | Why reliable | When to use |
|---|---|---|---|
| 1 | Written sign code — clearly associated | Placed by the engineer; survives plan revisions | Use when association_confidence = high |
| 2 | Legend entry (Stage F) — code + כמות | Engineer-defined vocabulary for this plan | Cross-check identity; use כמות as expected total |
| 3 | Legend icon crop match (Stage G) | Same AutoCAD drawing style as map icons | Use when no written code and legend match is clear |
| 4 | Catalog template match (Stage E) | Known sign, but photo vs. schematic style gap | Fallback only; treat as uncertain |
| 5 | Color + shape heuristic (Stage 4) | Fast but imprecise | Use only for rough classification, never for identity |
| 6 | Written sign code — uncertain association | May point to the right sign, may not | Flag; do not assign without review |
| 7 | Human review | Definitive | Escalate all unresolved contradictions |

**Critical rule:** A clearly associated written code at priority 1 is absolute — it overrides even a confident visual match at priority 3 or 4. Never silently substitute a visual guess when a written code is present and clearly associated.

---

## 7. Plan Notation Variants and Detection Strategy

Different AutoCAD templates and different engineers produce plans with different notation conventions. Stage G must not be overfit to the single sample plan.

### Type A — Icon-anchored (confirmed in sample plan)

**Description:** Full sign icons appear directly on the map at their installation location. Sign code text appears adjacent to the icon (typically below or to the left in RTL Hebrew plans).

**Detection:**
- Use Stage 4 DBSCAN clusters (sign_symbol, compact_symbol) as primary anchors
- Search within 80pt radius for text blocks matching sign code pattern
- Association scoring as per Section 4

**Primary evidence source:** Written sign code + icon cluster  
**Pole grouping:** Clusters within 50pt centroid distance → one pole  
**Human review triggers:** Dense zones (3+ icons + 3+ codes within 100pt), missing codes, ambiguous associations

---

### Type B — Pole-dot + fan-line

**Description:** A small filled circle (dot) marks the physical pole location. Short radiating line segments (the "fan") extend from the dot, one per sign plate. A small sign icon or written code appears at or near the end of each line.

**Detection:**
- Detect small filled circles: radius < 8pt, filled black or dark gray, not part of a sign icon
- For each dot, detect short line segments with one endpoint within 15pt of the dot centroid
- Each line endpoint = one sign plate candidate
- Search for text or icon within 30pt of each line endpoint

**Primary evidence source:** Written code at line endpoint; legend icon match if no text  
**Pole grouping:** All lines radiating from the same dot = one pole  
**Human review triggers:** Fan with no associated codes, dot without any lines, line endpoints that don't resolve to a code

---

### Type C — Code-only annotation

**Description:** No reliable sign icons on the map. Only written sign codes appear, sometimes with leader lines pointing to the installation location.

**Detection:**
- Scan all text blocks for sign code pattern (`\d{3,4}[a-z]?`)
- Use leader line geometry (if present) to locate the installation point
- Without leader lines, treat code location as the installation point estimate

**Primary evidence source:** Written sign code only; legend provides the visual reference  
**Pole grouping:** Codes within 40pt of each other = one pole candidate  
**Human review triggers:** All records from Type C plans require review — no visual confirmation available

---

### Type D — Balloon / callout annotation

**Description:** A callout bubble or leader line with a number or code points to a map location. The number references a sign schedule table elsewhere on the plan (or in a separate sheet).

**Detection:**
- Detect closed circle/oval shapes with text inside that match a sign schedule reference pattern
- Follow the leader line to the installation point
- Cross-reference the number to the sign schedule table (may require a separate schedule-table extraction stage)

**Primary evidence source:** Sign schedule table entry (if extracted); written code in balloon  
**Pole grouping:** Each balloon = one pole or assembly  
**Human review triggers:** Balloon number not found in schedule, missing schedule table, multi-balloon overlap

---

### Type E — Legend-driven symbolic style

**Description:** The plan uses simplified placeholder symbols (e.g., small squares, triangles, or generic circles) that have no inherent shape resemblance to the actual sign. The legend explicitly defines what each symbol means in this plan.

**Detection:**
- Stage F legend extraction becomes the primary anchor
- Match plan symbols to legend symbol crops
- Written codes may or may not be present

**Primary evidence source:** Stage F legend vocabulary; written code if present  
**Pole grouping:** Spatial clustering of matched symbols  
**Human review triggers:** Symbol not found in legend, legend extraction incomplete (Vision API not configured)

---

### Variant detection heuristic

Stage G should auto-detect the variant by scanning a sample of the plan:

```
1. If sign_symbol clusters have text within 80pt → likely Type A
2. If many small filled circles (<8pt) with radiating lines → likely Type B
3. If no sign clusters but many text codes → likely Type C
4. If oval/circle callout shapes with leader lines → likely Type D
5. If Stage F legend has non-standard symbols → likely Type E
6. If multiple indicators present → mixed plan; apply per-region detection; flag for review
```

---

## 8. Contradiction Detection

Stage G should emit explicit contradiction records. All contradictions are information, not errors — none should halt the pipeline.

| Contradiction type | Trigger | Severity |
|---|---|---|
| Code not in legend | Map has sign code X but Stage F legend has no entry for X | HIGH — new sign type or legend gap |
| Legend quantity mismatch | Legend says code X: כמות=6 but Stage G finds 8 occurrences | HIGH — counting error or missed detection |
| Visual vs. code mismatch | Stage E best match disagrees with clearly associated written code | MEDIUM — OCR error or mislabeled annotation |
| Orphan legend entry | Legend lists code X but Stage G finds zero map occurrences | MEDIUM — possible detection failure or design change |
| Multi-code cluster | Multiple different codes within 10pt of each other | MEDIUM — annotation overlap, needs human disambiguation |
| Code association ambiguous | Code within threshold of two or more icons | MEDIUM — spatial ambiguity |
| Unreadable code | Code text detected but OCR confidence < 0.70 | LOW — flag for human reading |
| Assembly count mismatch | Assembly has different plate count than a reference assembly (same pole type) | LOW — possible design variant |

---

## 9. Human-Assisted Filtering and Noise Suppression

Traffic plan PDFs contain a large volume of elements that are **not execution-relevant** for Elkayam's scope. The scanner must distinguish execution objects from background noise — but should never silently discard anything. Instead it produces a classified output and asks the human to confirm the ignore list.

### Execution-relevant objects (extract and count)

| Category | Examples |
|---|---|
| Traffic signs (תמרורים) | All sign types in the catalog: prohibitory, mandatory, warning, information |
| Sign poles / עמודים | Physical steel poles carrying sign plates |
| Guardrails / מעקות | Guardrail type, length, location |
| Road markings / סימוני כביש | Lane lines, stop lines, yield lines, arrows |
| Arrow trailers / עגלות חץ | Mobile arrow boards |
| Cones / קונוסים | Traffic cone placement zones |
| Barriers / חסימות | Water-filled barriers, concrete barriers, jersey barriers |
| Work areas / שטחי עבודה | Demarcated work zone boundaries |
| Pedestrian crossings / מעברי הולכי רגל | Zebra crossings, refuge islands |
| Large construction signs / שילוט גדול | Matrix signs, large warning boards |
| Inspector / פקח positions | Manual traffic control points |
| Temporary traffic arrangement elements | Any temporary element not part of permanent infrastructure |

### Background / contextual objects (suppress from quantity extraction)

| Category | Examples | Typical characteristics |
|---|---|---|
| Buildings | Outlines of adjacent buildings | Large closed polygon, gray or hatched fill |
| Landscaping / gardens | Trees, hedges, grass areas | Green fill, organic shapes |
| House numbers | Address numbers | Small text, not matching sign code pattern |
| Road background geometry | Road outlines, kerb lines, lane geometry | Large continuous lines, not colored |
| Unrelated labels | Street names, district names, project info | Long text strings, not sign code pattern |
| Title block / admin data | Plan number, engineer name, revision box | Fixed location (corners/edges), tabular |
| Topographic lines | Contour lines | Thin, sinuous, continuous |
| Utility infrastructure | Water mains, power lines shown for reference | Specific layer colors, often dashed |

### Classification output

Stage G should classify each detected object as:

1. **execution_relevant** — include in sign inventory and quantity extraction
2. **contextual_background** — exclude from quantity extraction; list in noise report
3. **uncertain** — cannot classify; ask human for confirmation

### Suggested questions for human review

The pipeline should be capable of asking (in the future review UI):

- "I detected N buildings adjacent to the road. Should I exclude them from the quantity report?"
- "I found M elements that may be landscaping or trees. Should I ignore these?"
- "Found K house number labels. Treat as background?"
- "The following object classes appear on this plan: [list]. Which should I include in the execution quantity count?"
- "This plan includes a general-layout background layer. Should I ignore that layer entirely?"

### Noise report output

Stage G should produce a `noise_report.json` alongside `sign_inventory.json`:

```json
{
  "suppressed_objects": [
    { "category": "building", "count": 12, "sample_bbox": [...] },
    { "category": "house_number", "count": 47, "sample_text": "14" },
    { "category": "landscaping", "count": 8, "sample_bbox": [...] }
  ],
  "uncertain_objects": [
    { "description": "Large gray polygon at display (200,400)", "reason": "ambiguous: building or work area?" }
  ],
  "human_confirmation_needed": true
}
```

---

## 10. Future Feature: תרגול ולמידה / Human Teaching Loop

### Purpose

When the Plan Scanner is uncertain, or when a plan uses non-standard notation, a human expert can teach the system how to interpret specific elements. This teaching becomes a reusable rule for future scans — dramatically reducing algorithmic complexity.

A small number of human clarifications can resolve project-specific notation that would otherwise require months of engineering to hardcode.

### How it works

The user attaches a crop from the plan and provides a natural-language explanation:

> "This small diamond shape means 'existing sign to be removed'. Don't count it in the new installation quantities."

> "In this project, the engineer marks poles with a blue dot instead of black. The blue dot + radiating lines = one pole."

> "These orange rectangles are work zones. Count their perimeter for barrier quantity."

### Rule types

| Rule type | Description | Example |
|---|---|---|
| **interpretation_rule** | What a symbol means in this plan/project | "Small diamond = sign removal" |
| **ignore_rule** | What to exclude from counts | "Gray hatching = existing road, ignore" |
| **quantity_rule** | How to measure/count a specific element | "Count cones per 5m linear meter of work zone" |
| **association_rule** | How to link codes to signs in this plan style | "Code appears above icon, not below" |
| **notation_rule** | How this plan's notation differs from standard | "Balloons use A1/A2/A3 not numeric codes" |

### Rule scope and promotion

```
Plan-level rule       → applies only to this specific plan PDF
Project-level rule    → applies to all plans in this project
Company-level rule    → applies globally after review and approval
```

Rules are **never silently promoted.** A plan-level rule can be proposed for promotion to project or company level, but requires explicit human approval. Audit trail records who created the rule, when, and what plan it came from.

### Guardrails

- Rules are not applied retroactively without re-running the scan
- A rule that contradicts an existing rule triggers a conflict alert
- A rule with `scope = company_level` requires a second approver (not the same person who created it)
- All learned rules are editable and deletable; deletion is logged
- Self-training without human review is explicitly prohibited — the system learns from humans, not from its own uncertain outputs

### Future data model (conceptual)

```
teaching_rule:
  id, created_by, created_at, plan_id, project_id
  rule_type: interpretation | ignore | quantity | association | notation
  scope: plan | project | company
  trigger: { description, sample_crop_path, geometric_signature? }
  action: { interpretation, ignore_flag, quantity_method }
  status: draft | active | promoted | archived
  promoted_by, promoted_at
  audit_log: [{ action, by, at, notes }]
```

---

## 11. Future Product Module: סורק תוכניות and BOQ Generation

### Module identity

**Sidebar module name:** סורק תוכניות  
**Agent:** Plan / Engineering Analyzer Agent  
**Output:** Professional scan report + כתב כמויות (BOQ) draft

This is not an upload screen. It is a **critical operational workflow** that determines execution quantities, procurement, fabrication orders, team preparation, and billing basis.

### Full 15-step workflow

```
1.  Upload engineering / CAD / PDF plan
2.  Detect plan type, revision status, and relevant discipline
3.  Detect legend (מקרא מפה) if present → Stage F
4.  Extract plan-specific vocabulary from legend (icons, codes, quantities)
5.  Detect map sign symbols / icons → Stages 4, E
6.  Detect physical poles / installation points → Stage G
7.  Detect grouped sign assemblies → Stage G
8.  Detect guardrails, barriers, road markings, arrow trailers, cones,
        work zones, inspectors, and other execution-relevant objects
9.  Separate execution-relevant objects from background noise → Section 9
10. Reconcile legend quantities vs. map-counted quantities
11. Flag contradictions and uncertain detections → Section 8
12. Prompt human for clarification on noise, ambiguities, and uncertain items
13. Produce professional scan report
14. Produce draft כתב כמויות / BOQ pending human approval
15. Require explicit human approval of final quantities before operational use
```

### BOQ / כתב כמויות output format

```
DRAFT — PENDING HUMAN APPROVAL
Plan: 50-448-02-400 | Date: 2026-05-19

Sign inventory:
  402 (עצור)                 6 units   [legend: 6 ✓]
  605 (כניסה אסורה)          5 units   [legend: 4 ⚠ MISMATCH]
  625b (הכנסה אסורה לרכב כבד) 2 units   [legend: 2 ✓]
  ...

Poles / installation points:  18
Sign plates total:            47
Assemblies:                   23

Guardrails:                   145 m
Road markings:                [pending human confirmation]
Work zone barriers:           [uncertain — requires review]

Contradictions:               3  (see attached report)
Items requiring review:       9

STATUS: DRAFT — DO NOT USE FOR ORDERS OR BILLING WITHOUT APPROVAL
```

### Handoff targets (future)

- Orders / procurement module (sign plate fabrication)
- Pricing / estimate module (billing basis)
- Field team preparation module (crew requirements)
- Quality assurance / inspection checklist

---

## 12. Risk, Confidence, Audit Trail, and Human Approval

### Why this module is high-stakes

Mistakes in Plan Scanner output can cause:

- Wrong quantities ordered → overage cost or missing materials
- Wrong sign codes → wrong signs fabricated → double cost (fabricate again + delay)
- Missing signs → field crew arrives without materials → delay, emergency order
- Wrong pole count → incorrect team size, incorrect equipment
- Incorrect estimate → pricing/billing disputes with customers
- Professional liability → if wrong signs are installed due to scanner error

**These are not theoretical risks. Each of these failure modes has direct financial and legal consequences for Elkayam.**

### Confidence tier definitions

| Tier | Label | Meaning | Downstream restriction |
|---|---|---|---|
| 1 | `confirmed` | Written code clearly associated + human approved | Safe for fabrication order |
| 2 | `high` | Written code clearly associated OR legend match, no contradictions | Safe for preliminary estimate |
| 3 | `medium` | Legend match or good visual match, minor ambiguity | Safe for internal analysis only |
| 4 | `low` | Weak visual match, no code, or uncertain association | Research use only; must not leave the pipeline |
| 5 | `unresolved` | No reliable source | Must be resolved before any downstream use |

### Audit trail requirements (future production)

Every item in the final output must carry:

```json
{
  "occurrence_id": "OCC-0042",
  "sign_code": "402",
  "confidence_tier": "high",
  "evidence_chain": [
    { "source": "nearby_written_code", "value": "402", "association_confidence": "high" },
    { "source": "legend_icon_match", "match_score": 0.82, "agrees": true }
  ],
  "reviewed_by": null,
  "reviewed_at": null,
  "approval_status": "pending",
  "contradiction_flags": []
}
```

`reviewed_by` and `reviewed_at` must be populated before `approval_status` can become `approved`.

### Human approval gate

The pipeline **must never auto-approve** its own output for operational use.

```
Scanner output (DRAFT) 
  → human reviews contradictions and uncertain items
  → human confirms or corrects each flagged item
  → human explicitly approves final quantities
  → output status changes from DRAFT to APPROVED
  → APPROVED output is handed off to orders/billing/field modules
```

Any change to an APPROVED output creates a new revision with its own audit trail.

### Minimum confidence before downstream use

| Use case | Required tier |
|---|---|
| Fabrication order | `confirmed` only |
| Field installation brief | `confirmed` or `high` only; all unresolved listed explicitly |
| Pricing / estimate | `high` or better; DRAFT label mandatory |
| Preliminary internal analysis | `medium` or better; must be labelled as DRAFT |
| Research / pipeline development | Any tier; must be labelled RESEARCH |

---

## 13. Stage G — First Implementation Scope

**Do not implement Stage G yet.** This section defines what the first implementation should do when the time comes.

### Prerequisite resolved: sign-code extraction strategy (2026-05-19)

A diagnostic (`08_text_code_diagnostic.py`) was run against `50-448-02-400.pdf` to determine whether sign codes are extractable as PDF text objects.

**Findings (definitive):**

| Finding | Result |
|---|---|
| Sign codes extractable as PDF text? | **No — text_codes_not_available** |
| Hebrew labels extractable as PDF text? | **No — hebrew_vector_paths_only** |
| Real (usable) PDF text tokens on the page | **0 sign codes; 12 admin tokens only** (revision dates, sheet number, R=22.0) |
| Zero-size artifact tokens | **3** (tokens '499', '798', '504' — bboxes < 1pt, invisible stubs) |
| Embedded raster images | **6** JPEG blocks in title block area (y > 3500 display coords) — not map content |

All sign codes and Hebrew annotations on this plan are rendered as **vector/Bezier paths** — the same encoding as the rest of the drawing. `page.get_text()` returns only administrative metadata. This is confirmed by rawdict showing 0 usable text spans.

**Stage G sign-code reading strategy: Vision API required (primary). No PDF text fallback exists.**

A Vision API call (Claude vision model) should be sent a rendered crop of each sign candidate's local area and asked to identify nearby sign codes. This is the same mechanism already planned for Stage F Hebrew label extraction.

Note: The zero-size artifact stubs (`499`, `798`, `504`) at positions (785,2519), (773,2595), (727,2854) are AutoCAD PDF accessibility remnants. They must be filtered with a minimum bbox dimension threshold (≥ 2pt) before any sign-code candidate evaluation.

---

### Pole assembly grouping — configurable research parameter (not hardcoded)

**Important caution:** The proximity radius used to group sign clusters into pole assemblies must **not** be a hardcoded constant. It is a **configurable research parameter** that must be tuned per plan and validated visually.

**Why fixed-radius grouping is dangerous:**

| Plan context | Risk of fixed 50pt radius |
|---|---|
| Dense intersection (3–5 signs within 60pt) | Adjacent signs on separate poles may be incorrectly merged into one "assembly" |
| Sparse highway plan (signs 200pt apart) | Signs on the same pole may be missed because the radius is too small |
| Unusual pole geometry (angled fan layout) | Euclidean distance alone may miss signs that are geometrically close but logically separate |

**Assembly grouping must use multiple signals, not distance alone:**

1. **Distance** — centroid-to-centroid distance (configurable radius: default 50pt, tunable)
2. **Direction / orientation** — signs on the same pole are typically stacked vertically; a purely horizontal grouping suggests separate poles
3. **Nearby code association** — two clusters with the same written code cannot be on the same pole (duplicate code = two separate poles with the same sign type)
4. **Visual alignment** — clusters whose bboxes share a vertical axis are more likely same-pole than clusters offset horizontally
5. **Member count sanity** — an assembly of 6+ signs on one pole is unusual for Israeli standard arrangements; flag for review

**Configurable parameters (document these as named constants in Stage G):**

```python
# Stage G pole grouping parameters — tune per project, do NOT hardcode
POLE_GROUPING_RADIUS_PTS    = 50.0   # max centroid distance to consider same pole
POLE_GROUPING_MAX_SIGNS     = 5      # assemblies larger than this → flag for review
POLE_GROUPING_VERTICAL_BIAS = True   # prefer vertical stacking; penalize purely horizontal
POLE_GROUPING_AMBIGUITY_FLAG = True  # if grouping decision is close, mark requires_review
```

**If grouping is ambiguous — never force:** When two signs are at distance 45pt (within the 50pt threshold) but the context is ambiguous (horizontal offset, different code orientation, conflicting direction), mark the assembly as `grouping_ambiguous = true, requires_review = true`. Do not silently force them into one pole.

**Debug confirmation required:** Every run of Stage G must produce a `pole_grouping_debug_overlay.png` — a rendered crop showing detected assemblies with grouping radius circles drawn around each anchor. A human must review this overlay before trusting the grouping results.

---

### First scope (narrow — research only)

Stage G v1 should focus on **one well-defined sub-problem**: using Stage F legend icon crops as plan-specific templates to find where each sign type appears on the map, with Vision API for nearby sign-code reading.

**Inputs:**
- `symbol_clusters.json` (Stage 4 — DBSCAN clusters)
- `legend_vocabulary.json` (Stage F — legend row crops)
- Rendered page image (for visual matching + Vision API crops)

**Algorithm (first implementation):**

```
1. Load legend row crops from Stage F
   For each legend row (icon crop):
     a. Run template match against rendered page at multiple scales
     b. Record match locations above LEGEND_MATCH_THRESHOLD
     c. These become "legend-matched sign candidates"

2. For each sign candidate (from Stage 4 clusters + Step 1):
   a. Render a local crop: centroid ± 80pt at 150 DPI
   b. Send crop to Vision API (Claude): "What sign code number appears near this sign?"
   c. Vision returns code (or null if none visible)
   d. Apply association rules (Section 4): single code in crop → assign; multiple → flag
   e. If Vision returns null → source = unresolved, requires_review = true

3. Group candidates into pole assemblies:
   a. Use POLE_GROUPING_RADIUS_PTS (default 50pt) + direction + code consistency checks
   b. Any ambiguous grouping → grouping_ambiguous = true, requires_review = true
   c. Generate pole_grouping_debug_overlay.png for visual review

4. For each unique sign code found:
   a. Count total occurrences
   b. Compare to legend כמות if available (Vision API required for Stage F כמות extraction)
   c. If mismatch or legend entry not found: emit contradiction record

5. Output:
   - sign_inventory.json (schema per Section 5)
   - sign_inventory_debug_overlay.png (colored annotations on rendered page)
   - pole_grouping_debug_overlay.png (grouping radius circles, assembly members)
   - sign_inventory_report.md (human-readable summary)
   - noise_report.json (suppressed/uncertain objects)
```

**Stage G v1 explicitly does NOT:**
- Use PDF text extraction for sign codes (confirmed non-available; see diagnostic above)
- Implement GPS coordinate projection
- Implement guardrail / barrier / road marking detection
- Implement Type B, C, D, or E variant detection
- Connect to any production system, DB, or UI
- Auto-approve any output

**Research outputs only.** All outputs are labelled RESEARCH and are not used operationally.

### What makes Stage G ready for v2

- Stage G v1 validated on 3+ different plan PDFs (different engineers, different projects)
- Precision/recall measured against a known-good plan where final quantities are already established
- Pole grouping parameters tuned and confirmed with visual debug overlays
- Vision API call format confirmed and tested for sign-code extraction accuracy
- At least one professional engineer has reviewed Stage G v1 output and assessed its usefulness

---

## 14. Architecture Q&A — All 8 Questions

**Q1: Did you observe the pole/dot + small-line + nearby sign-code pattern in the sample plan?**
Yes, partially. In `pole_cluster_zoom.png`, sign icons appear in clusters of 2–5 near intersection approaches with sign code text labels adjacent to icons (Type A). The standalone pole-dot + fan-line pattern (Type B) was not visible in the sample plan at the rendered zoom level.

**Q2: Where does the pattern appear and how should Stage G use it?**
At every intersection approach. Stage G should treat each well-isolated DBSCAN cluster as one sign plate candidate, apply the association rules in Section 4 to find the written code, and group clusters within 50pt into pole assemblies.

**Q3: Detection strategy for this pattern in other plans?**
Five variants documented in Section 7. Auto-detect by scanning a sample: text within 80pt of clusters → Type A; small filled circles + radiating lines → Type B; text codes without icons → Type C; callout bubbles → Type D; legend-referenced symbols → Type E. Mixed plans flag for human review.

**Q4: How to distinguish pole count / sign plate count / sign code count / grouped assembly count?**
Seven distinct quantity layers defined in Section 5. Never conflate them. Poles = distinct spatial locations; plates = individual icon/line occurrences; code count = total per sign type; assemblies = multi-plate groups on one pole; legend quantities = declared expected totals; map-counted = Stage G's observations; reconciled = human-approved final values.

**Q5: Evidence priority hierarchy?**
Section 6. Clearly associated written code (1) > legend entry כמות (2) > legend icon crop match (3) > catalog template match (4) > shape heuristic (5) > uncertain written code (6) > human review (7 = definitive). Clearly associated written code overrides all visual evidence. Uncertain written code does not.

**Q6: What contradictions should be flagged?**
Section 8. Eight types: code not in legend, legend quantity mismatch, visual vs. code mismatch, orphan legend entry, multi-code cluster, ambiguous code association, unreadable code (OCR confidence < 0.70), assembly count mismatch.

**Q7: What should Stage G produce as structured output?**
`sign_inventory.json` (per-occurrence records per Section 5 schema), `sign_inventory_debug_overlay.png`, `sign_inventory_report.md`, `noise_report.json`. Top-level summary includes all seven quantity layers and reconciliation status. Reconciled quantities are always null until human-approved.

**Q8: What should remain research-only before production integration?**
Stage G code itself; Hebrew OCR strategy (must test whether codes are extractable as text or require Vision); legend Vision extraction (semantic labels + quantities); multi-plan generalization (validated on one PDF only); GPS projection; accuracy measurement against a known-good plan; Type B/C/D/E variant handling; human review UI; BOQ generation. None of these are production-ready without validated accuracy on multiple real plans and explicit sign-off from a professional engineer.

---

## 15. Is it Safe to Proceed to Stage G?

**Yes — after this architecture update is reviewed and accepted.**

Stage G v1 is a research-only script producing `sign_inventory.json` and a debug overlay. It does not modify production systems, DB schema, or production flows. The risk from implementing Stage G v1 is low: it is a self-contained research experiment.

**The following conditions must be met before implementing Stage G:**

1. This architecture document is reviewed and accepted (current step)
2. A decision is made on whether sign codes in this PDF are extractable as text objects or require Vision API (quick test: run `page.get_text("rawdict")` and check if numeric sign codes appear as text blocks)
3. Stage G v1 scope is agreed: legend-crop matching + written code association + pole grouping + contradiction detection, research output only

**Stage G is NOT safe for production use until:**
- Validated on 3+ plans
- Accuracy measured against a known-good plan
- Professional engineer review completed
- Human approval workflow implemented

---

## Appendix: Pipeline Stage Map

```
Stage 01  Extract raw vector objects              → vector_objects.json
Stage 02  Filter candidate symbols                → vector_objects.json (candidate_symbols)
Stage 03  [reserved]
Stage 04  DBSCAN cluster symbols (eps=25)         → symbol_clusters.json
Stage 05  [reserved]
Stage E   Template match vs. catalog              → sign_recognition_report.md
Stage F   Legend extraction                       → legend_vocabulary.json  [SHIPPED]
Stage G   Sign inventory + pole grouping          → sign_inventory.json     [NEXT — not yet implemented]
Stage H   [future] GPS coordinate projection      → sign_inventory_gps.json
Stage I   [future] Cross-plan aggregation         → company_sign_database
Stage J   [future] Guardrail / barrier detection  → execution_objects.json
Stage K   [future] BOQ generation                 → draft_boq.json
```

**"סורק תוכניות" product** = Stages F + G + Stage J + BOQ generation + human review UI, packaged for production use with full audit trail and approval workflow.

**"תרגול ולמידה"** = Teaching loop integrated into the human review UI, allowing plan-specific and company-level rules to accumulate over time.
