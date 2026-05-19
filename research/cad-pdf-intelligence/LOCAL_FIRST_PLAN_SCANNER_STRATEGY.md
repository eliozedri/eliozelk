# Local-First Plan Scanner Strategy
## Free, Open-Source, and Semi-Automatic Approaches to Sign Code Reading and BOQ Quantity Extraction

**Version:** 1.0  
**Date:** 2026-05-20  
**Status:** Architecture document — pre-implementation  
**Scope:** Research pipeline under `research/cad-pdf-intelligence/`. No production code, no DB changes.

---

## 1. Why Tesseract Failed

### 1.1 Diagnostic Summary

The Stage 10 local OCR diagnostic ran Tesseract 5.5.2 (LSTM engine) on all 177 Stage G code crops using 7 preprocessing variants per crop:

| Category | Count | % |
|----------|-------|---|
| Confident accepted reads | 0 | 0% |
| Medium confidence (single variant only) | 41 | 23.2% |
| Zero output — vision fallback needed | 67 | 37.9% |
| Human review only | 110 | 62.1% |
| **Still requiring Vision or human review** | **177** | **100%** |

Total diagnostic elapsed: 86 minutes (5,171 seconds). Vision API reduction: 0%.

### 1.2 Root Cause — Not a Tuning Problem

AutoCAD PDF exports render **ALL text** — sign codes, speed values, annotation numbers, dimension labels — as **vector-path Bezier outlines rasterised into the page**. There are no PDF text objects. This was independently confirmed by:

- **Stage 8 text diagnostic**: `page.get_text("rawdict")` returns zero readable sign codes from PDF text objects.
- **Stage 10 OCR diagnostic**: Tesseract LSTM returns zero confident reads from rasterised crops.

The two failure modes at 150 DPI:

| Text type | Stroke width | Failure mode |
|-----------|-------------|--------------|
| Annotation codes (3-digit, adjacent to sign) | 1–3px thin | Below Tesseract recognition threshold |
| Speed values inside red circles (e.g. "30") | Bold but condensed | CAD block font — not in LSTM training distribution |

**This is a training distribution mismatch, not a configuration problem.** No combination of `--psm`, `--oem`, whitelist, or image preprocessing will reliably fix this. The 41 "medium" outputs are single-variant detections with no cross-variant consensus — they are noise candidates only, not accepted reads.

### 1.3 What Tesseract CAN Still Do

Despite zero confident reads, the diagnostic revealed useful signal:
- 41 medium candidates that may serve as **weak cross-check** signals against other methods.
- The connected-component (CC) analysis showed 15–86 digit-sized components near crop centers per crop, confirming that the pixel information **is present** — just not in a form Tesseract can decode.
- OCC-0031 CC debug image shows `901` and `632` isolated as tight green-rectangle groups — proving that tight numeric-region extraction has real potential.

---

## 2. Written Code First: Why Visual Recognition Is Secondary

### 2.1 The Core Principle

In Israeli traffic arrangement plans (תוכניות סדר תנועה), **most signs are identified by a printed code number**, not inferred from visual icon recognition alone. The typical plan contains:

- A map legend (מקרא מפה) listing each sign code with its icon and Hebrew description
- Each sign occurrence on the map labeled with the matching code (e.g., "402", "214", "308")
- Speed limits and distances labeled inside or adjacent to the sign symbol

**Reading the written code is faster, more reliable, and lower cost than recognizing the visual icon.** Icon recognition is useful as a cross-check, for disambiguation, and for finding signs whose codes are unreadable.

### 2.2 Implication for Pipeline Design

| Approach | Cost | Reliability |
|----------|------|-------------|
| Read the adjacent written code | Low (local OCR on tight crop) | High if font is recognizable |
| Match visual icon to template | Medium (CV template match) | Moderate (scale/rotation sensitivity) |
| Ask Vision API to identify sign | High (paid API call per crop) | High if image quality sufficient |

**Decision rule:** Always attempt written code extraction first. Fall back to visual icon matching for cross-check. Reserve Vision API for cases where code reading fails after all local methods are exhausted.

### 2.3 When Visual Recognition Leads

Icon recognition should take priority over code reading in these cases:
- Sign code is not legible (thin strokes, overprint, partial occlusion)
- Multiple codes are present and spatial association is ambiguous
- Plan uses non-standard or abbreviated codes
- New/temporary signs without catalog entries
- Verification pass: comparing read code against recognized icon to catch transcription or OCR errors

---

## 3. Smarter Crop Strategy (Primary POC)

### 3.1 Why the Current Crops Are Too Noisy

Stage G crops are 160pt × 160pt context windows at 150 DPI, producing ~667×668px images. They capture the entire road section around the sign occurrence — lane lines, hatching, neighboring sign clusters, dimension annotations, north arrows. For naive OCR this is catastrophic noise.

**The sign code is printed at a predictable location:** adjacent to the sign symbol (typically within 30–60px of the centroid in display coordinates). The relevant numeric region is a small fraction of the crop.

### 3.2 CC-Based Tight Crop Approach

**Goal:** Extract the tightest possible bounding box around digit-sized connected components near the crop center, then OCR only that region.

**Algorithm:**
1. Load Stage G crop (667×668px).
2. Convert to grayscale, apply Otsu threshold.
3. Find all connected components (`cv2.connectedComponentsWithStats`).
4. Filter CCs by digit-size heuristic: `4px ≤ height ≤ 80px`, `3px ≤ width ≤ 60px`, `aspect_ratio ≤ 4.0`.
5. Filter by proximity to crop center: `normalized_distance_from_center ≤ 0.45`.
6. Group surviving CCs by horizontal alignment (y-centroid within 8px of each other → same text line).
7. For each candidate text-line group: expand bounding box by 4px margin, extract sub-image.
8. Run Tesseract on sub-image (psm 7 = single line, oem 3, whitelist 0-9).
9. Score: valid 3-digit code (100–999) × multi-variant consensus × proximity score.

**Why this is the primary POC:** OCC-0031 debug confirmed that CC grouping visually isolates `901` and `632` as distinct tight rectangles. The current crop processes a 667×668px image; the tight sub-image for `901` is approximately 45×22px — a factor of ~450× smaller. This concentrates Tesseract attention on the actual digit area.

**Expected improvement:** Not guaranteed — the font-distribution mismatch remains. But tight crops at higher effective resolution (sub-image upscaled 3× before Tesseract) may push some reads above the confidence threshold.

**Implementation target:** `11_tight_crop_ocr.py`  
**Estimated development:** 1–2 hours  
**Dependencies:** OpenCV (already installed), Tesseract (installed), pytesseract (installed)

### 3.3 Resolution Escalation

For each tight crop sub-image, generate three resolution variants before OCR:
- 2× upscale (bilinear)
- 3× upscale (Lanczos)
- 4× upscale with adaptive sharpening

Multi-variant consensus: if ≥ 2 of 3 upscales agree on the same 3-digit code → confident read.

---

## 4. Digit-Template Recognition (Second POC)

### 4.1 Approach

Instead of general-purpose OCR (Tesseract trained on document fonts), train or construct a **digit template matcher specific to the CAD block font** found in this PDF.

**Method A — Manual template construction:**
1. Identify 5–10 clearly visible digit instances (0–9) from Stage G debug crops (e.g., speed limit circles where "30", "50", "80" are legible to human eye).
2. Extract each digit as a 20×30px binary patch.
3. For each crop CC candidate (digit-sized component near center), compute normalized cross-correlation against each digit template.
4. Best-match digit + score. Threshold: correlation ≥ 0.80 → confident digit read.
5. Compose digit sequence by reading left-to-right across the text-line group.

**Method B — One-shot metric learning:**
- Use a small labeled set (10–20 confirmed code crops) to learn an embedding.
- Match query digit CCs against embedding database.
- More complex to implement but higher accuracy if examples are available.

**Feasibility assessment:** Method A is straightforward and fully local. It requires 3–4 hours of setup (template extraction + matcher code). Expected to work well for the speed-limit values (bold, consistent style); annotation codes (thinner) are harder. Zero new dependencies.

**Implementation target:** `12_digit_template_ocr.py`  
**Dependencies:** OpenCV (installed), NumPy (installed)

---

## 5. Vector Glyph Recognition (Third Candidate)

### 5.1 The Opportunity

AutoCAD PDF exports render text as vector Bezier paths. These paths are lossless — no rasterisation degradation. If we can extract the raw path data for a digit glyph, we can match it geometrically (not pixel-by-pixel).

**What we know:**
- `fitz.page.get_drawings()` returns all vector paths with Bezier control points.
- The Stage 01 pipeline already extracts all drawings from the page.
- Sign symbols are multi-path clusters (the DBSCAN clustering basis).
- Digit glyphs are small, isolated path clusters near sign centroids.

### 5.2 Approach

1. Filter `get_drawings()` results by bounding-box size matching digit dimensions (roughly 5–15pt width, 7–15pt height in PDF units).
2. Cluster small path groups by proximity (same text-line spatial arrangement).
3. Normalize each glyph path to a canonical bounding box.
4. Compute a geometric signature (e.g., number of Bezier segments, curvature histogram, stroke direction histogram).
5. Match against a small reference database of known digit glyphs extracted from the same PDF.

**Advantage:** Works at native vector resolution — no rasterisation, no font-training issue. The paths are exact.  
**Challenge:** Requires building the reference digit library from the PDF itself (semi-supervised: identify 1–2 confirmed digits from debug crops, extract their vector paths).

**Feasibility:** High if digit glyphs are separable from sign symbol paths in the vector drawing list. This needs a quick feasibility test before full implementation.

**Implementation target:** `13_vector_glyph_recognition.py`  
**Dependencies:** PyMuPDF (installed)

### 5.3 Feasibility Test (Before Full Implementation)

Run a 30-minute test: load the PDF, filter `get_drawings()` by bounding box ≤ 20×20pt, display the resulting path clusters as SVG overlaid on the map. If digit-shaped clusters appear near sign centroids, vector glyph recognition is viable. If not (glyphs not separable from symbols), skip.

---

## 6. Modern Open-Source OCR Engines

### 6.1 Comparison Table

| Engine | Core dep | ARM64 size | GPU required | Typical accuracy | CAD font potential |
|--------|----------|-----------|--------------|-----------------|-------------------|
| Tesseract 5.5 + LSTM | system binary | 15MB binary | No | High for print | **Failed — confirmed** |
| **PaddleOCR 2.x** | paddlepaddle | ~101MB total | No (CPU) | Very high — trained on diverse fonts | **Promising** |
| **EasyOCR** | torch + easyocr | ~86MB total | No (CPU, slow) | High | Moderate |
| MMOCR | torch + mmengine | 400MB+ | Recommended | High | Not recommended |
| TrOCR (Microsoft) | transformers | 300MB+ | Recommended | High | Not investigated |

**Actual measured dependency sizes (macOS ARM64, CPU-only):**
- `paddlepaddle` wheel: 99MB; `paddleocr`: 2MB; total: ~101MB
- `torch` wheel: 83MB; `easyocr`: 2.9MB; total: ~86MB
- MMOCR: requires `mmengine` + torch — complex, not investigated further

### 6.2 PaddleOCR Assessment

PaddleOCR is trained on a vast corpus of Chinese + Latin text including diverse print, handwritten, and structured document fonts. Its digit recogniser has been exposed to a much wider range of stroke styles than Tesseract's LSTM.

**Smoke test plan:**
1. `pip install paddlepaddle paddleocr` in the research venv (101MB, no GPU needed).
2. Run on the 10 most promising tight-crop sub-images from POC 1.
3. Compare output against Tesseract results and manual inspection.
4. If PaddleOCR reads ≥ 2 codes that Tesseract missed → proceed with full 177-crop batch.

**Implementation target:** `14_paddleocr_smoke_test.py`

### 6.3 EasyOCR Assessment

EasyOCR requires PyTorch. CPU inference is noticeably slower than PaddleOCR. Its accuracy on printed digits is good but not significantly better than PaddleOCR for our use case. Recommended only as a secondary check if PaddleOCR output is inconclusive.

**Decision:** Test PaddleOCR first. Only investigate EasyOCR if PaddleOCR fails AND tight-crop approach shows promise.

### 6.4 Fine-Tuned Custom Model (Long-Term)

For production use, a fine-tuned digit recogniser trained on extracted CAD glyph examples would achieve near-perfect accuracy. This is a future-stage investment:
- Extract ~500 labeled digit examples from confirmed codes in this and other project PDFs.
- Fine-tune PaddleOCR's digit recogniser (or train a small CNN from scratch — 10-class problem, fast to converge).
- Integrate as the primary local OCR engine.

**Not a POC task.** Requires ground-truth labeled data from multiple plans.

---

## 7. Symbol-First / Code-Second Workflow

### 7.1 Detecting the Sign Symbol

The Stage G pipeline already clusters vector paths into sign-symbol candidates using DBSCAN (eps=25). For each cluster, a legend vocabulary match assigns a candidate sign type and match score.

**Symbol-first** means: the sign symbol cluster is the anchor. We know *where* the sign is (centroid), and we have a candidate *type* from legend matching. The written code provides the *catalog number* to confirm the type.

### 7.2 Code-Second: Reading the Adjacent Label

Given a confirmed or candidate symbol centroid at display coordinate `(cx, cy)`:

1. Define a search window: `[cx-80, cy-80, cx+80, cy+80]` in display px.
2. Within the search window, find digit-sized CCs (from the high-res page render).
3. Apply proximity scoring: nearest CC group to centroid gets highest priority.
4. Read the CC group as a text line (tight-crop OCR or digit template).
5. Validate: is the result a known catalog sign code (100–999)?

**This workflow is tighter than the current Stage G "code_crop" approach** because it anchors the search on the symbol centroid rather than the bounding box of the cluster.

### 7.3 Disambiguation Logic

When multiple code candidates are within the search window:
- Choose the one with highest proximity score first.
- If two codes are equidistant, flag for human review.
- If the symbol type from legend match contradicts the read code (different category), flag as contradiction.

---

## 8. Pole / Sign Plate / Assembly Logic

### 8.1 Why This Matters for BOQ

In road-sign installation, the unit of work is not the sign itself but the **assembly**:
- Pole(s) of a specific size/material
- Sign plate(s) mounted on the pole
- Hardware (clamps, brackets, anchor bolts)
- Foundation (concrete, post-hole dimensions)

A BOQ entry must reflect the full assembly, not just the sign code.

### 8.2 Notation Variants on Israeli Plans

Plans use multiple conventions for representing pole assemblies:

| Variant | Description |
|---------|-------------|
| **A** | Single pole dot (Type A), one or more sign symbols hanging below |
| **B** | Filled circle with radiating lines — overhead assembly or dual-pole |
| **C** | Bracket notation — sign mounted on existing structure (bridge, wall) |
| **D** | Stacked signs — multiple codes adjacent to single pole dot |
| **E** | Ground-mounted — no pole; sign on delineator post or barrier |

### 8.3 Pole Grouping Algorithm (Stage G Current)

The existing Stage G pipeline groups sign symbols by pole proximity (distance threshold ≤ 50px in display coordinates). This captures the "multiple signs on one pole" case for Variant A.

**Missing:** Variants B, C, D require additional detection logic. These are Stage G v2 items.

### 8.4 Assembly Quantity Model

For BOQ generation, each assembly (pole group) produces:

```json
{
  "assembly_id": "ASM-0001",
  "pole_type": "A",
  "pole_count": 1,
  "sign_codes": ["402", "620"],
  "sign_count": 2,
  "mounting_height_m": null,
  "location": {"display_x": 1234, "display_y": 567},
  "quantity_type": "counted",
  "review_status": "pending"
}
```

---

## 9. Human-Assisted Filtering

### 9.1 Execution-Relevant vs. Noise

Not all detected sign-symbol clusters correspond to signs that need installation. Plans contain:
- **Signs to install** (new, shown in plan color)
- **Signs to remove** (shown struck-through or in a different color)
- **Existing signs to retain** (shown in grey or with "קיים" label)
- **Legend icons** (the legend itself, not on the map)
- **Reference icons** in title block, revision table, notes
- **Noise clusters** (hatching, dimension arrow heads, random path fragments)

### 9.2 Automated Classification Signals

| Signal | Execution-relevant hint | Noise hint |
|--------|------------------------|------------|
| Inside legend bounding box | — | Strong |
| Near title block region | — | Strong |
| Legend match score > 0.25 | Moderate | — |
| Adjacent 3-digit code read | Strong | — |
| Isolated symbol_fragment, 1 member | — | Moderate |
| Cluster within road-area boundary | Moderate | — |
| Cluster in margin/whitespace | — | Strong |

### 9.3 Human Review Queue

Occurrences that cannot be confidently classified automatically are presented in a human review queue. The queue UI shows:
- The crop image
- The candidate sign type from legend match
- The read code (if any)
- The spatial context (zoomed-out view showing surrounding road geometry)
- Three buttons: **INSTALL**, **IGNORE**, **FLAG**

Human decisions are stored and used to train the automated classifier over time (see Section 10: Teaching Loop).

---

## 10. תרגול ולמידה — Human Teaching Loop

### 10.1 The Vision

The human teaching loop transforms the Plan Scanner from a static rule-based system into a **continuously improving, plan-aware expert system**. Each time a human reviews an ambiguous item and makes a decision, the system learns:
- **Project-specific rules**: "On this plan, a cluster with one member and score < 0.15 is always noise."
- **Company-wide rules**: "Signs mounted on overhead structures never appear as Type A pole dots. They always have Type B notation."
- **Correction feedback**: "The system said code 402 but the icon shows 214 — this is a contradiction pattern."

### 10.2 Rule Taxonomy

| Rule type | Scope | Example |
|-----------|-------|---------|
| Item classification | Per-plan | "Clusters in bottom-right corner = legend region — always ignore" |
| Assembly notation | Company-wide | "Type B always means dual-pole overhead — 2 poles per assembly" |
| Code override | Per-plan | "All speed circles inside residential zone = code 310, not 308" |
| Contradiction resolution | Company-wide | "If icon matches sign 402 but code reads 401, code takes priority" |
| Noise pattern | Company-wide | "symbol_fragment with member_count=1 and score < 0.12 = always noise" |

### 10.3 Storage Schema (Future)

```json
{
  "rule_id": "RULE-042",
  "scope": "company",
  "trigger": {"cluster_type": "symbol_fragment", "member_count": 1, "match_score_lt": 0.12},
  "action": "classify_as_noise",
  "confidence": "high",
  "created_by": "human_review",
  "confirmed_on_plans": ["plan_50-448-02-400", "plan_50-448-03-100"],
  "created_at": "2026-05-20"
}
```

### 10.4 Application at Pipeline Runtime

Before sending any occurrence to Vision or human review, the rule engine checks all applicable rules. If a high-confidence company-wide rule matches:
- Classify automatically (no human needed, no Vision needed)
- Record the rule application in the audit log

Over time, this reduces the human review queue and Vision API spend.

### 10.5 Question Mode

Instead of passively waiting for corrections, the system actively **asks clarifying questions** when encountering ambiguous patterns:
- "I found 12 occurrences matching the legend icon for sign 402, but 3 of them read code 401. Should code take priority over icon match for this plan?"
- "Are the signs in the top-right area (legend region) installation items or legend-only?"
- "I see what might be Type B overhead assemblies at 4 locations. Can you confirm the pole type?"

Human answers are stored as plan-specific rules and promoted to company-wide rules after confirmation across 3+ plans.

---

## 11. Scale-Based Measurement and BOQ Quantities

### 11.1 Purpose

Beyond counting sign occurrences, a full BOQ requires **linear and area measurements**: guardrail meters, road marking lengths, exclusion zone areas, delineator post spacings. These cannot be derived from object detection alone — they require a calibrated coordinate transform from PDF units to real-world meters.

### 11.2 Eight-Type Quantity Taxonomy

| Type | Description | Example |
|------|-------------|---------|
| **Counted** | Integer occurrences | Signs: 23 × code 402 |
| **Grouped** | Assemblies with sub-items | 15 pole assemblies (Type A, 2 signs each) |
| **Linear-measured** | Distance in metres | Guardrail: 247m |
| **Area-measured** | Surface in m² | Road markings: 84m² |
| **Declared** | Annotation label, not measured | "50m exclusion zone" |
| **Calculated** | Derived from other quantities | Total assembly hardware = signs × 2 clamps |
| **Reconciled** | Cross-plan or vs. BoM | Plan says 23 signs, supplier quote says 25 |
| **Human-approved** | Final after engineer review | Approved: 247m guardrail |

### 11.3 Scale Detection — Four Sources

**Source 1: Title block scale annotation**
- Most plans include "Scale 1:500" or "קנה מידה 1:500" in the title block.
- Detection: locate title block region (bottom-right or left strip), OCR for "קנה מידה" label followed by ratio.

**Source 2: Graphic scale bar**
- A drawn bar labeled with "0 — 10m — 20m" or similar.
- Detection: find horizontal line segment with equally-spaced tick marks + adjacent text digits.
- Calibration: pixel-length of bar ÷ labeled real-world distance = px/m conversion factor.

**Source 3: Known dimension annotation**
- Plans often annotate specific distances (e.g., "15.5m" between two defined points).
- Calibration: measure PDF-coordinate distance between two annotation anchor points, divide by labeled value.
- Accuracy: depends on annotation precision.

**Source 4: Human calibration**
- User clicks two points in a plan viewer, enters the real-world distance.
- Generates a plan-specific px/m calibration factor stored in `plan_calibration.json`.
- Most reliable; required when Sources 1–3 fail or conflict.

### 11.4 Output Schema (Per Measurement)

```json
{
  "measurement_id": "MEAS-0001",
  "type": "linear",
  "element": "guardrail",
  "value_m": 247.3,
  "confidence": "medium",
  "scale_source": "title_block",
  "scale_ratio": "1:500",
  "calibration_id": "CAL-2026-05-20-001",
  "pdf_start_pt": [1230, 450],
  "pdf_end_pt": [1725, 450],
  "pdf_length_pt": 495.0,
  "review_status": "pending"
}
```

### 11.5 Human Calibration Path

When automated scale detection fails or produces conflicting results:
1. System presents a plan thumbnail and asks user to click two reference points.
2. User enters the known real-world distance between those points.
3. System computes calibration factor and stores it.
4. All measurements for this plan use the human calibration factor.
5. Calibration is audit-logged with creator and timestamp.

### 11.6 Risk Model

| Risk | Mitigation |
|------|-----------|
| Scale annotation OCR error | Cross-validate Source 1 vs. Source 2 |
| Plan has multiple scales (detail insets) | Detect and flag scale-region boundaries |
| Measurement includes off-road extension | Human review of all linear measurements |
| Unit ambiguity (cm vs. m) | Normalise to metres at input; flag implausible values |

---

## 12. Interactive Plan Decomposition and Element Filtering

### 12.1 The Problem

A complex plan may contain 200+ detected symbol clusters. Not all are relevant to a given work order:
- A repair job touches only sections A and C of the plan.
- A maintenance check covers only overhead signs, not ground-level.
- A tender covers only new sign installations, not removals.

Forcing the user to review all 200+ occurrences one by one is impractical.

### 12.2 Auto-Detect Logical Groups

Before presenting occurrences to the user, the pipeline auto-detects logical groupings:

| Group type | Detection method |
|-----------|-----------------|
| **By road section** | Spatial clustering of sign centroids along road geometry |
| **By sign category** | Legend match → catalog category (warning, regulatory, informational) |
| **By assembly type** | Pole type notation (A/B/C/D/E) |
| **By action type** | Color/annotation detection (new/existing/remove — see Section 13.6) |
| **By plan zone** | Geographic bounding box (upper half = intersection A, lower = intersection B) |

### 12.3 Include / Ignore Selection UI

After auto-detection, the system presents a **group selection screen**:

```
Plan: 50-448-02-400.pdf

Detected element groups:
  [✓] Regulatory signs (402, 308, 214)   — 47 occurrences
  [✓] Warning signs (625, 620)           — 23 occurrences
  [✓] Speed limits (30, 50)              — 18 occurrences
  [–] Legend region                      — 12 occurrences (excluded automatically)
  [–] Title block region                  — 3 occurrences (excluded automatically)
  [?] Unclassified fragments             — 34 occurrences (review required)

Include all? [Y] / Select individually
```

User selects the groups relevant to their task. The pipeline processes only the included groups, ignoring the rest.

### 12.4 Element-Type Filtering

Within an included group, further filters:
- **New only** — exclude existing/retention items
- **Install only** — exclude removal items
- **Specific sign codes** — process only codes in a user-specified list
- **Minimum match score** — skip low-confidence detections

### 12.5 Progressive Refinement

As the user reviews occurrences, they can:
- Promote an occurrence from "unclassified" to a named group.
- Demote a false positive from a group to "ignore".
- Rename a group (e.g., "Intersection A — regulatory").

Refinements are saved per-plan and reused when the plan is re-scanned with updated data.

### 12.6 Output

The filtered, user-confirmed occurrence set becomes the input to BOQ generation. No unconfirmed or ignored occurrence contributes to any quantity in the final BOQ.

---

## 13. Additional Smart Features for Semi-Automatic Plan Understanding

### 13.1 Scan Setup Wizard

Before processing a new plan, a short wizard collects:
- Project name and contract number
- Plan type (intersection arrangement / road section / maintenance)
- Expected sign categories (pre-filters the legend extraction)
- Whether the plan includes new, removal, or both types of work
- Who is reviewing (engineer / estimator / site supervisor)

Wizard output is stored in `plan_context.json` and used throughout the pipeline to set defaults and reduce review burden.

### 13.2 Confidence Review Queue

All occurrences with `confidence < high` are placed in a prioritised review queue. The queue is sorted by:
1. Contradiction severity (code vs. icon mismatch = highest priority)
2. BOQ impact (high-value items reviewed first)
3. Detection confidence (ascending — lowest confidence reviewed last)

The queue UI shows one item at a time with full context. Each reviewed item is immediately removed from the queue. Progress is saved after each item.

### 13.3 Evidence Panel

For each occurrence in the review queue, an Evidence Panel shows all the evidence the system has gathered:

- Crop image (Stage G crop)
- Tight-crop OCR result + confidence
- Digit template match result + score
- Legend icon match + score + matched icon thumbnail
- PaddleOCR result (if run)
- Nearby text annotations extracted from the vector drawing
- Surrounding context (zoomed-out at 3 zoom levels)
- Previously applied company-wide rules (if any)

The human reviewer sees everything the system saw, making an informed decision rather than guessing.

### 13.4 Contradiction Detector

The system flags contradictions between evidence sources:

| Contradiction type | Example | Action |
|-------------------|---------|--------|
| Code vs. icon mismatch | OCR reads 402, icon matches 214 | Flag; ask human which is authoritative |
| Duplicate codes in proximity | Two signs with code 402 within 30m | Flag; verify if intentional |
| Unknown code | OCR reads 999 (not in catalog) | Flag; check if custom or misread |
| Missing code | Icon detected but no adjacent code found | Flag for manual code entry |
| Scale inconsistency | Source 1 says 1:500, Source 2 implies 1:250 | Flag; require human calibration |

Contradictions block automatic BOQ inclusion. All contradictions must be resolved by a human before the item appears in the final BOQ.

### 13.5 Plan-Specific Rule Memory

In addition to the company-wide teaching loop (Section 10), each plan accumulates its own **rule memory**:
- "In this plan, all sign symbols in the lower-left quadrant are legend entries — skip."
- "In this plan, code 308 consistently appears to the right of the symbol; search right-biased."
- "In this plan, speed-limit circles use a non-standard font — use template OCR only."

Plan-specific rules are stored in `plan_rules.json` alongside the plan's output files. They are not promoted to company-wide rules automatically — only through explicit confirmation.

### 13.6 Existing / New / Remove Classification

Plans use visual conventions to distinguish sign status:
- **New sign**: standard plan color (typically black or blue lines)
- **Existing sign to retain**: grey-rendered or labeled "קיים"
- **Sign to remove**: struck-through (X overlay) or dashed outline, or labeled "לפירוק"

Detection approach:
- Stroke color analysis from `get_drawings()` — new vs. grey strokes
- Bounding-box content scan for X-pattern overlays
- Text proximity scan for "קיים" / "לפירוק" labels (vector text blocks if available, or OCR)

Each occurrence gets an `action_type` field: `new`, `existing`, `remove`, `unknown`.  
BOQ only counts `new` items by default. `remove` items feed a separate removal BOQ.

### 13.7 Color / Line-Style Heuristics

Beyond action classification, color and line style carry other semantic information:
- Red fills → speed limit / restriction signs
- Blue fills → information signs
- Yellow fills → temporary / construction signs
- Dashed outlines → proposed (not confirmed) items
- Dotted lines → sight-line / visibility check

The pipeline extracts fill colors and line styles from `get_drawings()` metadata and appends them to each occurrence record. These signals augment legend matching and action classification.

### 13.8 Revision Comparison

For plans that go through revision rounds (תיקון 1, תיקון 2, etc.):
- Load two plan versions.
- Detect added, removed, and modified occurrences by comparing occurrence centroids with a tolerance of ±5px.
- Generate a revision diff report: what changed between versions.
- Flag differences for engineer confirmation before updating the BOQ.

This is particularly important for tender preparation, where the final revision is the binding document.

### 13.9 Manual Measurement and Calibration Tool

A simple ruler tool allowing users to:
- Click two points on the plan image.
- Enter the real-world distance.
- Store as a calibration anchor.
- Click a path (polyline) and get its measured length.
- Click a polygon and get its area.

The tool runs in a local web interface (e.g., a simple Flask/FastAPI page with a pan-zoomable canvas). No paid API required. Output is stored in `manual_measurements.json` and imported into the BOQ.

### 13.10 Object Count Reconciliation

After extracting a sign count from the plan, the system reconciles against:
- **Supplier delivery note** (if already scanned via the OCR pipeline) — "plan says 23 × code 402, note says 25 × code 402"
- **Previous BOQ** (if this is a maintenance or repair plan) — delta count
- **Legend declared quantities** (if the legend has a quantity column)

Discrepancies are flagged. Human reviews and resolves before finalising.

### 13.11 Work Package Generator

After the reviewed BOQ is approved, generate a **work package** suitable for sending to the installation crew:
- List of assemblies by location
- Map PDF with assemblies highlighted by work zone
- Installation instructions per assembly type
- Required materials list
- Sequence order (e.g., install overhead signs before ground signs in same zone)

Output formats: PDF (for field), JSON (for integration with future ops system), CSV (for import into supplier ordering).

### 13.12 Red Flag Detector

Before any BOQ is finalised, a rule-based red flag scan:

| Flag | Description |
|------|-------------|
| No scale found | Measurements may be unreliable |
| > 20% unclassified occurrences | Review burden too high for accurate BOQ |
| Contradiction rate > 10% | Plan quality issues; engineer review required |
| Zero sign codes read locally | All codes depend on Vision API — cost risk |
| Sign count > 2× previous similar plan | Sanity check; possible detection error |
| Missing legend entry for detected symbol | Symbol not in vocabulary; manual identification needed |

Red flags are shown prominently in the scan summary report. They do not block output but require explicit acknowledgement before the BOQ is downloaded.

### 13.13 Review Mode by Role

Different reviewers need different views of the same scan:

| Role | Primary concern | Simplified view |
|------|----------------|----------------|
| Site supervisor | What to install, where | Assembly list with map markers |
| Estimator | Quantities and costs | BOQ table with unit prices |
| Engineer | Accuracy and contradictions | Full evidence panel + contradiction log |
| Procurement | Materials and lead times | Materials list by supplier |

The scan output can be rendered in any of these modes without reprocessing the plan.

### 13.14 Local Cost-Saving Estimator

At the end of each scan run, report:
- Number of occurrences resolved fully locally (zero Vision API cost)
- Number requiring Vision API (estimated cost at current API pricing)
- Breakdown by resolution path (tight-crop OCR / digit template / vector glyph / PaddleOCR / Vision)
- Cumulative cost saved vs. "send everything to Vision" baseline

This report motivates investment in the local-first pipeline and tracks improvement over time.

---

## 14. Decision Matrix

| Approach | Cost | Speed | Accuracy (CAD) | Dependencies | Local | Needs GPU | POC effort | Notes |
|----------|------|-------|---------------|-------------|-------|-----------|-----------|-------|
| Tesseract (current) | Free | Fast | **Failed** | Installed | Yes | No | Done | Confirmed dead-end for this font |
| Tight CC crop + Tesseract | Free | Fast | Unknown | Installed | Yes | No | 1–2h | Primary POC; tightest images |
| Digit template matching | Free | Fast | Moderate-high | OpenCV (installed) | Yes | No | 3–4h | Good for bold speed-limit digits |
| Vector glyph matching | Free | Fast | Potentially high | PyMuPDF (installed) | Yes | No | 2h + 30min feasibility | Native resolution; no rasterisation |
| PaddleOCR | Free | Medium | High | +101MB | Yes | No | 1h | Best general OCR candidate |
| EasyOCR | Free | Slow | High | +86MB | Yes | No | 1h | Secondary; test only if PaddleOCR fails |
| Fine-tuned custom model | Free (inference) | Fast | Very high | Training set needed | Yes | No | Weeks | Long-term; requires labeled data |
| Vision API (Claude) | Paid | Fast | High | ANTHROPIC_API_KEY | No | No | Smoke test done | Last resort; high accuracy but cost |
| Interactive Plan Decomp | N/A | N/A | N/A | No extra deps | Yes | No | 2–3 days (UI) | Reduces review burden; not OCR |

**Recommendation:** Run POCs 1–4 (tight-crop, digit template, vector glyph feasibility, PaddleOCR) before investing any Vision API credits. Based on POC results, Vision API may only be needed for a small fraction of crops.

---

## 15. Semi-Automatic Fallback Levels

For each sign occurrence, the system attempts resolution in this order. It stops at the first level that produces a confident result.

### Level 1 — Fully Local Automatic

**Trigger:** CC-based tight crop + multi-engine agreement (Tesseract + PaddleOCR both agree, or digit template matches with correlation ≥ 0.80).  
**Action:** Accept code automatically. No human review. No Vision API.  
**Target:** 60%+ of occurrences after POCs are implemented.

### Level 2 — Local with Company Rule

**Trigger:** Occurrence matches a stored company-wide rule.  
**Action:** Apply rule automatically. Log rule application. No human review.  
**Example:** "All single-member symbol_fragment clusters with score < 0.12 → noise."

### Level 3 — Human-Assisted Local

**Trigger:** Partial evidence — one method returned a code but others are inconclusive or absent.  
**Action:** Present evidence panel to human. Human confirms, corrects, or overrides. Result stored.  
**Cost:** Human time only. No Vision API.

### Level 4 — Vision API Spot Check

**Trigger:** Level 1–3 exhausted. Code not readable locally. Occurrence is high-priority (BOQ impact, contradiction, no legend match).  
**Action:** Send crop to Claude Vision with blind prompt. Human reviews Vision output before accepting.  
**Cost:** ~$0.01–$0.03 per crop (Sonnet pricing, 667×668px image). Target: < 30% of crops.

### Level 5 — Manual Measurement / Entry

**Trigger:** Vision API also inconclusive, or crop is too degraded.  
**Action:** Human opens plan PDF, identifies sign manually, enters code directly. Audit-logged.  
**Cost:** Human time. Last resort. Acceptable for rare cases.

---

## 16. Recommended Next POC Sequence

Execute in order. Do not skip to Vision API until POCs 1–4 are evaluated.

### POC 1 — Tight CC Crop + Tesseract (Primary)
**Script:** `11_tight_crop_ocr.py`  
**Time:** 1–2 hours  
**Goal:** Run CC-based tight numeric region extraction on all 177 crops. Compare results against Stage 10 baseline.  
**Success criterion:** ≥ 10 new confident reads that Stage 10 missed.  
**Dependencies:** Already installed.

### POC 2 — Digit Template OCR
**Script:** `12_digit_template_ocr.py`  
**Time:** 3–4 hours (includes template extraction)  
**Goal:** Build 10 digit templates from confirmed glyph examples; match against CC candidates.  
**Success criterion:** Correlation ≥ 0.80 on ≥ 3 confirmed digit examples from the speed-limit circles.  
**Dependencies:** OpenCV (installed).

### POC 3 — Vector Glyph Feasibility Test
**Script:** `13_vector_glyph_feasibility.py` (30-min feasibility) → `13_vector_glyph_recognition.py` (if feasible)  
**Time:** 30 min feasibility; 2–3 hours full implementation  
**Goal:** Check whether PDF vector path clusters at digit dimensions are separable from sign-symbol paths near sign centroids.  
**Success criterion:** Feasibility test shows digit-sized path clusters adjacent to ≥ 5 known sign occurrences.  
**Dependencies:** PyMuPDF (installed).

### POC 4 — PaddleOCR Smoke Test
**Script:** `14_paddleocr_smoke_test.py`  
**Time:** 1 hour (including install)  
**Goal:** Install paddlepaddle + paddleocr (~101MB); run on the 20 most promising tight-crop sub-images from POC 1.  
**Success criterion:** PaddleOCR reads ≥ 5 codes that Tesseract missed.  
**Dependencies:** paddlepaddle, paddleocr (not yet installed — 101MB).

### POC 5 — Vision API Fallback (If Local POCs Insufficient)
**Script:** `10_vision_smoke_test.py` (already built)  
**Prerequisite:** `ANTHROPIC_API_KEY` set and explicitly approved.  
**Time:** 15 minutes (5 crops × ~3s each)  
**Goal:** Confirm Vision can read sign codes from Stage G crops.  
**Cost:** ~$0.10–$0.20 for smoke test.

### POC 6 — Human Teaching Flow (Design Sprint)
**Script:** None — UI design sprint  
**Time:** 1–2 days  
**Goal:** Design the minimal review queue UI for Level 3 fallback (human-assisted local).  
**Output:** `docs/superpowers/specs/YYYY-MM-DD-teaching-loop-design.md`  
**Prerequisite:** POC 1–4 results to know realistic review queue size.

---

## Appendix: File and Stage Map

```
research/cad-pdf-intelligence/
├── 01_extract_vectors.py        Stage 01: raw vector extraction
├── 02_filter_candidates.py      Stage 02: symbol filtering
├── 04_cluster_symbols.py        Stage 04: DBSCAN clustering
├── 05_debug_overlay.py          Stage 05: SVG debug
├── 06_match_signs.py            Stage E:  template matching
├── 07_extract_legend.py         Stage F:  legend vocabulary
├── 08_sign_inventory.py         Stage G:  sign inventory + crops
├── 09_stage_g_inventory.py      Stage G:  inventory build (alt entry)
├── 10_local_ocr_sign_codes.py   Stage 10: Tesseract diagnostic (DONE)
├── 10_vision_smoke_test.py      Stage G:  Vision smoke test (ready, no key)
├── 11_tight_crop_ocr.py         POC 1:    CC tight crop + Tesseract (TODO)
├── 12_digit_template_ocr.py     POC 2:    digit template matching (TODO)
├── 13_vector_glyph_recognition.py POC 3:  vector glyph (feasibility first)
├── 14_paddleocr_smoke_test.py   POC 4:    PaddleOCR smoke test (TODO)
├── outputs/
│   ├── sign_inventory.json      177 occurrences
│   ├── stage_g_code_crops/      177 × 667×668px PNG crops
│   ├── local_ocr_sign_codes.json 177 Tesseract diagnostic records
│   └── local_ocr_debug/         20 CC debug images
└── LOCAL_FIRST_PLAN_SCANNER_STRATEGY.md   (this document)
```

---

*This document is a research architecture specification. No production code, DB changes, or API costs are incurred by reading or implementing this document. All experiments remain isolated under `research/cad-pdf-intelligence/`.*
