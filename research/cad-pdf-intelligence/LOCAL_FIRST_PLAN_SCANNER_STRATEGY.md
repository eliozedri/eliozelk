# Local-First Plan Scanner Strategy
## Free, Open-Source, and Semi-Automatic Approaches to Sign Code Reading and BOQ Quantity Extraction

**Version:** 2.0  
**Date:** 2026-05-20  
**Status:** Architecture document — pre-implementation  
**Scope:** Research pipeline under `research/cad-pdf-intelligence/`. No production code, no DB changes.

> **Policy statement (binding):** This project does not depend on any paid API, cloud OCR service, or external AI provider. Every component must run locally, use open-source libraries only, and support human review workflows. Paid Vision API is not an approved solution — it appears in this document only as a theoretical last-resort research note.

---

## 1. Why Tesseract Failed

### 1.1 Diagnostic Summary

The Stage 10 local OCR diagnostic ran Tesseract 5.5.2 (LSTM engine) on all 177 Stage G code crops using 7 preprocessing variants per crop:

| Category | Count | % |
|----------|-------|---|
| Confident accepted reads | 0 | 0% |
| Medium confidence (single variant only) | 41 | 23.2% |
| Zero output — OCR fallback needed | 67 | 37.9% |
| Human review only | 110 | 62.1% |
| **Still requiring resolution** | **177** | **100%** |

Total diagnostic elapsed: 86 minutes (5,171 seconds). No Vision API was used. No Vision API is planned.

### 1.2 Root Cause — Not a Tuning Problem

AutoCAD PDF exports render **ALL text** — sign codes, speed values, annotation numbers, dimension labels — as **vector-path Bezier outlines rasterised into the page**. There are no PDF text objects. This was independently confirmed by:

- **Stage 8 text diagnostic**: `page.get_text("rawdict")` returns zero readable sign codes from PDF text objects.
- **Stage 10 OCR diagnostic**: Tesseract LSTM returns zero confident reads from rasterised crops.

The two failure modes at 150 DPI:

| Text type | Stroke width | Failure mode |
|-----------|-------------|--------------|
| Annotation codes (3-digit, adjacent to sign) | 1–3px thin | Below Tesseract recognition threshold |
| Speed values inside red circles (e.g. "30") | Bold but condensed | CAD block font — not in LSTM training distribution |

**This is a training distribution mismatch, not a configuration problem.** No combination of `--psm`, `--oem`, whitelist, or preprocessing will fix this for Tesseract.

### 1.3 What Tesseract CAN Still Provide

- 41 medium candidates usable as **weak cross-check signals** against other methods (not accepted codes).
- CC analysis showed 15–86 digit-sized components near crop centers per crop — pixel information IS present.
- OCC-0031 CC debug image shows `901` and `632` isolated as tight CC groups — tight-crop approach has potential.

---

## 2. No Paid API Dependency Policy

### 2.1 Policy Statement

**Paid Vision API (Anthropic Claude Vision, Google Vision, Azure Computer Vision, AWS Textract, or any equivalent) is not an approved solution for this project.**

This policy is binding for all POC work, all pipeline development, and all production design decisions.

**What is approved:**
- Local computation on developer or server hardware
- Open-source libraries (any permissive/copyleft license)
- Human review workflows
- Self-hosted models (no cloud inference fees)
- Fine-tuning on company data (using local compute or one-time training jobs)

**What is not approved:**
- API calls to Anthropic, OpenAI, Google, Microsoft, AWS, or any other paid AI service
- Per-crop or per-request billing of any kind
- Cloud OCR APIs
- SaaS annotation services with per-image pricing

### 2.2 Why This Policy Exists

The business model requires that the Plan Scanner's marginal cost per plan is effectively zero. A tool that costs $0.01–$0.05 per sign crop × 177 crops × hundreds of plans per year is not financially sustainable as a core pipeline dependency. Beyond cost, any dependency on an external API introduces:

- Service availability risk (API downtime = pipeline failure)
- Data privacy risk (plan drawings may contain sensitive project geometry)
- Vendor lock-in risk (API pricing or terms may change)
- Internet connectivity requirement (field work may be offline)

### 2.3 Where Paid API Appears in This Document

One place only: **Level 5 of the Semi-Automatic Fallback** (Section 19). It is listed as a theoretical last resort for individual edge-case crops that no local method can resolve, and only after explicit human authorisation per crop. It is never a batch operation and never a planned solution.

Any future discussion about "using Vision API" refers to this edge-case theoretical note only.

---

## 3. Written Code First: Why Visual Recognition Is Secondary

### 3.1 The Core Principle

In Israeli traffic arrangement plans (תוכניות סדר תנועה), **most signs are identified by a printed code number**, not inferred from visual icon recognition alone. The typical plan contains:

- A map legend (מקרא מפה) listing each sign code with its icon and Hebrew description
- Each sign occurrence on the map labeled with the matching code (e.g., "402", "214", "308")
- Speed limits and distances labeled inside or adjacent to the sign symbol

**Reading the written code is faster, more reliable, and lower cost than recognizing the visual icon.** Icon recognition is useful as a cross-check, for disambiguation, and for finding signs whose codes are unreadable.

### 3.2 Implication for Pipeline Design

| Approach | Cost | Reliability |
|----------|------|-------------|
| Read the adjacent written code (tight crop OCR) | Free — local | High if digit-type matches |
| Match visual icon to template (OpenCV) | Free — local | Moderate (scale/rotation sensitivity) |
| Digit-template matching (plan-specific templates) | Free — local | High for this plan's font |
| Vector glyph recognition (native PDF paths) | Free — local | Potentially highest |
| Open-source OCR (PaddleOCR) | Free — local | High for diverse fonts |
| Paid Vision API | Paid — blocked | Blocked by policy (Section 2) |

**Decision rule:** Always attempt written code extraction first. Fall back to visual icon matching for cross-check. Paid API is not in the decision path.

### 3.3 When Visual Recognition Leads

Icon recognition should take priority over code reading in these cases:
- Sign code is not legible (thin strokes, overprint, partial occlusion)
- Multiple codes present and spatial association is ambiguous
- Plan uses non-standard or abbreviated codes
- New/temporary signs without catalog entries
- Verification pass: comparing read code against recognized icon to catch OCR errors

---

## 4. Smarter Crop Strategy (Primary POC)

### 4.1 Why the Current Crops Are Too Noisy

Stage G crops are 160pt × 160pt context windows at 150 DPI, producing ~667×668px images. They capture entire road sections — lane lines, hatching, neighboring clusters, dimension annotations. For naive OCR this is catastrophic noise.

**The sign code is printed at a predictable location:** adjacent to the sign symbol (typically within 30–60px of the centroid in display coordinates). The relevant numeric region is a small fraction of the crop.

### 4.2 CC-Based Tight Crop Approach

**Goal:** Extract the tightest possible bounding box around digit-sized connected components near the crop center, then OCR only that region.

**Algorithm:**
1. Load Stage G crop (667×668px).
2. Convert to grayscale, apply Otsu threshold.
3. Find all connected components (`cv2.connectedComponentsWithStats`).
4. Filter CCs by digit-size heuristic: `4px ≤ height ≤ 80px`, `3px ≤ width ≤ 60px`, `aspect_ratio ≤ 4.0`.
5. Filter by proximity to crop center: `normalized_distance_from_center ≤ 0.45`.
6. Group surviving CCs by horizontal alignment (y-centroid within 8px → same text line).
7. For each candidate text-line group: expand bounding box by 4px margin, extract sub-image.
8. Run Tesseract on sub-image (psm 7 = single line, oem 3, whitelist 0-9).
9. Score: valid 3-digit code (100–999) × multi-variant consensus × proximity score.

**Why this is the primary POC:** OCC-0031 debug confirmed that CC grouping visually isolates `901` and `632` as distinct tight rectangles. The current crop processes 667×668px; the tight sub-image for `901` is approximately 45×22px — a factor of ~450× smaller.

**Implementation target:** `11_tight_crop_ocr.py`  
**Estimated development:** 1–2 hours  
**Dependencies:** OpenCV (installed), Tesseract (installed), pytesseract (installed)

### 4.3 Resolution Escalation

For each tight crop sub-image, generate three resolution variants:
- 2× upscale (bilinear)
- 3× upscale (Lanczos)
- 4× upscale with adaptive sharpening

Multi-variant consensus: if ≥ 2 of 3 upscales agree on the same 3-digit code → confident read.

---

## 5. Digit-Template Recognition (Second POC)

### 5.1 Approach

Instead of general-purpose OCR (trained on document fonts), construct a **digit template matcher specific to the CAD block font** found in this PDF.

**Method A — Manual template construction:**
1. Identify 5–10 clearly visible digit instances (0–9) from Stage G debug crops (speed limit circles where "30", "50", "80" are legible to human eye).
2. Extract each digit as a 20×30px binary patch.
3. For each crop CC candidate, compute normalized cross-correlation against each digit template.
4. Best-match digit + score. Threshold: correlation ≥ 0.80 → confident digit read.
5. Compose digit sequence by reading left-to-right across the text-line group.

**Method B — One-shot metric learning:**
- Use a small labeled set (10–20 confirmed code crops) to learn an embedding.
- Match query digit CCs against embedding database.
- More complex but higher accuracy with labeled examples.

**Feasibility assessment:** Method A is straightforward and fully local. Expected to work well for bold speed-limit values (consistent style); annotation codes (thinner) are harder. Zero new dependencies.

**Implementation target:** `12_digit_template_ocr.py`  
**Dependencies:** OpenCV (installed), NumPy (installed)

---

## 6. Vector Glyph Recognition (Third Candidate)

### 6.1 The Opportunity

AutoCAD PDF exports render text as vector Bezier paths. These paths are lossless — no rasterisation degradation. If we can extract the raw path data for a digit glyph, we can match it geometrically.

**What we know:**
- `fitz.page.get_drawings()` returns all vector paths with Bezier control points.
- The Stage 01 pipeline already extracts all drawings from the page.
- Sign symbols are multi-path clusters (DBSCAN clustering basis).
- Digit glyphs are small, isolated path clusters near sign centroids.

### 6.2 Approach

1. Filter `get_drawings()` results by bounding-box size matching digit dimensions (roughly 5–15pt width, 7–15pt height in PDF units).
2. Cluster small path groups by proximity (same text-line spatial arrangement).
3. Normalize each glyph path to a canonical bounding box.
4. Compute a geometric signature (number of Bezier segments, curvature histogram, stroke direction histogram).
5. Match against a reference database of known digit glyphs extracted from the same PDF.

**Advantage:** Works at native vector resolution — no rasterisation, no font-training issue. The paths are exact.  
**Challenge:** Requires building the reference digit library from the PDF itself.

**Feasibility test (30 min before full implementation):** Filter `get_drawings()` by bounding box ≤ 20×20pt, display resulting path clusters as SVG. If digit-shaped clusters appear near sign centroids → viable.

**Implementation target:** `13_vector_glyph_recognition.py`  
**Dependencies:** PyMuPDF (installed)

---

## 7. Modern Open-Source OCR Engines

### 7.1 Comparison Table

| Engine | License | Dep size (ARM64 CPU) | GPU required | CAD digit potential | Recommendation |
|--------|---------|---------------------|--------------|---------------------|----------------|
| Tesseract 5.5 LSTM | Apache 2.0 | 15MB binary | No | **Failed — confirmed** | Skip (done) |
| **PaddleOCR v3.4.0** | Apache 2.0 | ~101MB | No | **High** | **Primary test** |
| EasyOCR | Apache 2.0 | ~86MB (torch) | No (slow) | Moderate | Secondary only |
| **eDOCr** | MIT | ~30MB (keras-ocr) | No | **Niche — engineering drawings** | Worth testing |
| docTR (Mindee) | Apache 2.0 | ~300MB (TF/PT) | No (slow) | High for documents | Heavy — defer |
| Kraken | Apache 2.0 | ~200MB (torch) | No | Low — historical fonts | Not relevant |

### 7.2 PaddleOCR v3.4.0 — Primary Candidate

**GitHub:** [PaddlePaddle/PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)  
**Stars:** ~42k (2026-05)  
**License:** Apache 2.0  
**Latest model:** PP-OCRv5 (Jan 2026) — 94.5% accuracy on OmniDocBench  
**ARM64/Mac:** Supported via paddlepaddle ARM64 wheels  
**Dependencies:** paddlepaddle (~99MB) + paddleocr (~2MB) = ~101MB total  
**GPU required:** No — CPU inference works, ~5–10s per image  

PaddleOCR is trained on a vast corpus including diverse print, handwritten, industrial, and document fonts — far broader than Tesseract's training set. Its digit recogniser has been exposed to CAD-adjacent styles. PP-DocLayoutV3 handles skew, warping, and irregular shapes. Strong candidate for tight-crop digit regions.

**Smoke test plan:** `14_paddleocr_smoke_test.py` — install, run on 5–10 best tight-crop sub-images from POC 1, compare against Tesseract and digit templates.

### 7.3 eDOCr — Engineering Drawing Specialist

**GitHub:** [javvi51/eDOCr](https://github.com/javvi51/eDOCr)  
**Stars:** 68  
**License:** MIT  
**Status:** Small, maintained, published on PyPI  
**Dependencies:** keras-ocr (~30MB) + TF  
**What it does:** Packaged OCR system specifically for mechanical engineering drawings. Segments drawing into zones (dimensions, info blocks, GDT symbols), then applies targeted OCR per zone.

**Assessment:** The zone-segmentation approach is conceptually aligned with our tight-crop strategy. The keras-ocr model may have better exposure to engineering font styles than Tesseract. **Worth a 1-hour smoke test.** Risk: 68 stars, small community, Windows-first development — but Python so likely works on Mac.

### 7.4 EasyOCR — Secondary Check

**GitHub:** [JaidedAI/EasyOCR](https://github.com/JaidedAI/EasyOCR)  
**Stars:** ~22k  
**License:** Apache 2.0  
**Dependencies:** torch (~83MB) + easyocr (~2.9MB) = ~86MB  
**Assessment:** High general accuracy but CPU inference is notably slower than PaddleOCR. Test only if PaddleOCR disappoints and eDOCr doesn't show improvement.

### 7.5 Custom Fine-Tuned Model (Long-Term)

For production: fine-tune PaddleOCR's digit recogniser on extracted CAD glyph examples (500+ labeled instances from multiple plans). This is a future-stage investment requiring ground-truth data, not a POC task.

---

## 8. Symbol-First / Code-Second Workflow

### 8.1 Detecting the Sign Symbol

The Stage G pipeline already clusters vector paths into sign-symbol candidates using DBSCAN (eps=25). For each cluster, a legend vocabulary match assigns a candidate sign type and match score.

**Symbol-first** means: the sign symbol cluster is the anchor. We know *where* the sign is (centroid), and we have a candidate *type* from legend matching. The written code provides the *catalog number* to confirm the type.

### 8.2 Code-Second: Reading the Adjacent Label

Given a confirmed or candidate symbol centroid at display coordinate `(cx, cy)`:

1. Define a search window: `[cx-80, cy-80, cx+80, cy+80]` in display px.
2. Within the search window, find digit-sized CCs (from the high-res page render).
3. Apply proximity scoring: nearest CC group to centroid gets highest priority.
4. Read the CC group as a text line (tight-crop OCR or digit template).
5. Validate: is the result a known catalog sign code (100–999)?

### 8.3 Disambiguation Logic

When multiple code candidates are within the search window:
- Choose the one with highest proximity score first.
- If two codes are equidistant, flag for human review.
- If the symbol type from legend match contradicts the read code, flag as contradiction.

---

## 9. Pole / Sign Plate / Assembly Logic

### 9.1 Why This Matters for BOQ

In road-sign installation, the unit of work is the **assembly**: pole(s) + sign plate(s) + hardware + foundation. A BOQ entry must reflect the full assembly, not just the sign code.

### 9.2 Notation Variants on Israeli Plans

| Variant | Description |
|---------|-------------|
| **A** | Single pole dot, one or more sign symbols hanging below |
| **B** | Filled circle with radiating lines — overhead or dual-pole |
| **C** | Bracket notation — sign mounted on existing structure |
| **D** | Stacked signs — multiple codes adjacent to single pole dot |
| **E** | Ground-mounted — no pole; delineator post or barrier |

### 9.3 Assembly Quantity Model

```json
{
  "assembly_id": "ASM-0001",
  "pole_type": "A",
  "pole_count": 1,
  "sign_codes": ["402", "620"],
  "sign_count": 2,
  "location": {"display_x": 1234, "display_y": 567},
  "quantity_type": "counted",
  "action_type": "new",
  "review_status": "pending"
}
```

### 9.4 Pole / Plate / Code / Assembly Separation — Mandatory

**Never collapse these five levels:**
- Physical pole/location
- Individual sign plate
- Sign code
- Grouped assembly
- Counted / measured / approved BOQ quantity

Each level has its own identity, review status, and audit trail.

---

## 10. Human-Assisted Filtering

### 10.1 Execution-Relevant vs. Noise

Not all detected sign-symbol clusters need installation. Plans contain:
- **Signs to install** (new, plan color)
- **Signs to remove** (struck-through or "לפירוק")
- **Existing signs to retain** ("קיים")
- **Legend icons** (the legend itself)
- **Noise clusters** (hatching, arrowheads, path fragments)

### 10.2 Automated Classification Signals

| Signal | Execution-relevant hint | Noise hint |
|--------|------------------------|------------|
| Inside legend bounding box | — | Strong |
| Near title block region | — | Strong |
| Legend match score > 0.25 | Moderate | — |
| Adjacent 3-digit code read | Strong | — |
| Isolated symbol_fragment, 1 member | — | Moderate |
| Cluster within road-area boundary | Moderate | — |

### 10.3 Human Review Queue

Ambiguous occurrences are presented in a prioritised review queue. The queue UI (Gradio or VIA-based — see Section 15) shows the crop image, candidate sign type, read code (if any), and spatial context. Three actions: **INSTALL**, **IGNORE**, **FLAG**. Human decisions are stored and feed the teaching loop (Section 11).

---

## 11. תרגול ולמידה — Human Teaching Loop

### 11.1 The Vision

The human teaching loop transforms the Plan Scanner from a static rule-based system into a **continuously improving, plan-aware expert system**. Each human review decision becomes a rule:
- **Project-specific rules**: "On this plan, single-member clusters with score < 0.15 are always noise."
- **Company-wide rules**: "Type B notation always means dual-pole overhead — 2 poles per assembly."
- **Correction feedback**: "The system said code 402 but the icon shows 214 — code takes priority."

### 11.2 Rule Taxonomy

| Rule type | Scope | Example |
|-----------|-------|---------|
| Item classification | Per-plan | "Bottom-right clusters = legend region — always ignore" |
| Assembly notation | Company-wide | "Type B always = dual-pole overhead" |
| Code override | Per-plan | "All speed circles in residential zone = code 310" |
| Contradiction resolution | Company-wide | "If icon ≠ code, code takes priority" |
| Noise pattern | Company-wide | "symbol_fragment, 1 member, score < 0.12 = noise" |

### 11.3 Question Mode

Instead of waiting for corrections, the system actively **asks clarifying questions**:
- "I found 12 occurrences matching sign 402, but 3 read code 401. Which takes priority?"
- "Are signs in the top-right area installation items or legend-only?"

Answers are stored as plan-specific rules and promoted to company-wide rules after confirmation across 3+ plans.

---

## 12. Scale-Based Measurement and BOQ Quantities

### 12.1 Purpose

A full BOQ requires **linear and area measurements**: guardrail metres, road marking lengths, exclusion zone areas, delineator post spacings. These require a calibrated coordinate transform from PDF units to real-world metres.

### 12.2 Eight-Type Quantity Taxonomy

| Type | Example |
|------|---------|
| Counted | Signs: 23 × code 402 |
| Grouped | 15 pole assemblies (Type A, 2 signs each) |
| Linear-measured | Guardrail: 247m |
| Area-measured | Road markings: 84m² |
| Declared | "50m exclusion zone" |
| Calculated | Total clamps = sign count × 2 |
| Reconciled | Plan: 23 signs; delivery note: 25 |
| Human-approved | Approved: 247m guardrail |

### 12.3 Scale Detection — Four Sources

| Source | Method | Reliability |
|--------|--------|-------------|
| Title block annotation | OCR for "קנה מידה 1:500" | High — explicit |
| Graphic scale bar | Horizontal line + tick marks + distance labels | Medium |
| Known dimension annotation | Measure PDF distance between annotation anchors | Medium |
| Human calibration | User clicks two points, enters real distance | Highest |

### 12.4 Measurement Output Schema

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
  "pdf_length_pt": 495.0,
  "review_status": "pending"
}
```

### 12.5 Geometry Measurement Stack

For measuring polyline lengths and polygon areas from PDF vector paths:
- `fitz.page.get_drawings()` → raw Bezier paths with coordinates
- **Shapely** (BSD) → `LineString.length`, `Polygon.area` on path geometry
- Scale factor: `length_m = shapely_length_in_pt × (real_unit / pdf_unit)`

Shapely is pure Python + C (GEOS), ~6MB, already on PyPI. No GPU, no cloud.

---

## 13. Interactive Plan Decomposition and Element Filtering

### 13.1 The Problem

A complex plan may contain 200+ detected symbol clusters. Not all are relevant to a given work order. Forcing the user to review all 200+ one by one is impractical.

### 13.2 Auto-Detect Logical Groups

| Group type | Detection method |
|-----------|-----------------|
| By road section | Spatial clustering of sign centroids along road geometry |
| By sign category | Legend match → catalog category |
| By assembly type | Pole type notation (A/B/C/D/E) |
| By action type | Color/annotation detection (new/existing/remove) |
| By plan zone | Geographic bounding box |

### 13.3 Include / Ignore Selection

After auto-detection, a group selection screen:

```
Plan: 50-448-02-400.pdf
Detected element groups:
  [✓] Regulatory signs (402, 308, 214)   — 47 occurrences
  [✓] Warning signs (625, 620)           — 23 occurrences
  [–] Legend region                      — 12 occurrences (auto-excluded)
  [?] Unclassified fragments             — 34 occurrences (review required)
```

User selects groups relevant to their task. Filtered set becomes the BOQ input.

### 13.4 Output

The filtered, user-confirmed occurrence set is the only input to BOQ generation. No unconfirmed or ignored occurrence contributes to any quantity.

---

## 14. Additional Smart Features for Semi-Automatic Plan Understanding

### 14.1 Scan Setup Wizard
Before processing, collect: project name, plan type, expected sign categories, new/removal/both, reviewer role. Store in `plan_context.json`.

### 14.2 Confidence Review Queue
Prioritised by: contradiction severity → BOQ impact → detection confidence ascending.

### 14.3 Evidence Panel
Per occurrence: crop image, tight-crop OCR result, digit template match score, legend match + thumbnail, nearby text annotations, 3-zoom-level context, applied company rules.

### 14.4 Contradiction Detector

| Contradiction | Example | Action |
|--------------|---------|--------|
| Code vs. icon | OCR reads 402, icon matches 214 | Flag; ask which is authoritative |
| Duplicate codes in proximity | Two 402s within 30m | Flag; verify if intentional |
| Unknown code | OCR reads 999 | Flag; check for misread |
| Missing code | Icon detected, no adjacent code | Flag for manual entry |
| Scale conflict | Source 1 says 1:500, Source 2 implies 1:250 | Flag; require human calibration |

### 14.5 Plan-Specific Rule Memory
Plan-specific rules stored in `plan_rules.json`. Not promoted to company-wide automatically.

### 14.6 Existing / New / Remove / Cover Classification
- New sign: standard plan color
- Existing to retain: grey or "קיים"
- Sign to remove: struck-through or "לפירוק"
- Each occurrence gets `action_type`: new / existing / remove / unknown

### 14.7 Color / Line-Style Heuristics
- Red fills → speed limit/restriction
- Blue fills → information
- Yellow fills → temporary/construction
- Dashed outlines → proposed

### 14.8 Revision Comparison
Load two plan versions; detect added, removed, modified occurrences by centroid comparison (±5px tolerance). Generate revision diff report.

### 14.9 Manual Measurement and Calibration Tool
Ruler tool in local web interface: click two points, enter distance, store calibration. Click polyline → get measured length. Click polygon → get area. Output to `manual_measurements.json`.

### 14.10 Object Count Reconciliation
Compare sign count from plan vs. supplier delivery note (if OCR pipeline has scanned it) vs. previous BOQ. Flag discrepancies.

### 14.11 Work Package Generator
After approved BOQ: assembly list by location, map PDF with highlights, installation instructions, materials list, sequence order.

### 14.12 Red Flag Detector

| Flag | Description |
|------|-------------|
| No scale found | Measurements unreliable |
| > 20% unclassified occurrences | Review burden too high |
| Contradiction rate > 10% | Plan quality issues |
| Zero codes read locally | All codes require expensive manual review |
| Sign count > 2× previous similar plan | Possible detection error |
| Missing legend entry for detected symbol | Manual identification needed |

### 14.13 Review Mode by Role

| Role | Primary view |
|------|-------------|
| Site supervisor | Assembly list with map markers |
| Estimator | BOQ table with unit prices |
| Engineer | Full evidence panel + contradiction log |
| Procurement | Materials list by supplier |

### 14.14 Local Cost-Saving Estimator
Per scan: number resolved fully locally (zero API cost), breakdown by resolution path, cumulative savings vs. "manual review of everything" baseline.

---

## 15. Open-Source / GitHub Research and Tooling Candidates

Research conducted 2026-05-20. Sources: GitHub search, PyPI, academic papers, tool documentation.

### 15.1 PDF / Vector / CAD Extraction

#### PyMuPDF (fitz)
- **GitHub:** [pymupdf/PyMuPDF](https://github.com/pymupdf/PyMuPDF)
- **License:** AGPL 3.0 / commercial (research use: AGPL fine)
- **Stars:** ~4.5k
- **Status:** Actively maintained, frequent releases
- **ARM64/Mac:** Yes — binary wheels on PyPI
- **Dep weight:** ~15MB
- **What we use:** Already installed; `get_drawings()` for vector paths, `get_text("rawdict")` for text, `page.get_pixmap()` for rendering, PDF metadata
- **Fit:** Core dependency — excellent
- **Risk:** AGPL — for internal research tools this is fine; production needs license review
- **Action:** Already in use ✅

#### pdfplumber
- **GitHub:** [jsvine/pdfplumber](https://github.com/jsvine/pdfplumber)
- **License:** MIT
- **Stars:** ~6k
- **Status:** Active
- **ARM64/Mac:** Yes
- **What we use:** Already installed; char-level text extraction supplemental
- **Action:** Already in use ✅

#### ezdxf
- **GitHub:** [mozman/ezdxf](https://github.com/mozman/ezdxf)
- **License:** MIT
- **Stars:** ~1.2k
- **Status:** Actively maintained (v1.4.x series, 2026)
- **ARM64/Mac:** Yes — ARM64 wheels on PyPI for CP310–CP313
- **Dep weight:** ~8MB pure Python + C extension
- **What it does:** Read and write DXF files (AutoCAD native format). If clients can provide DXF source files instead of PDF, this bypasses the rasterisation problem entirely — vector paths and text blocks are directly accessible.
- **Risk:** DXF availability depends on client. DWG requires ODA File Converter add-on (third-party, separate install).
- **Action:** Add to requirements.txt as optional; test DXF path when a DXF file is available ✅ HIGH VALUE

#### pdf.js (Mozilla)
- **GitHub:** [mozilla/pdf.js](https://github.com/mozilla/pdf.js)
- **License:** Apache 2.0
- **Stars:** ~49k
- **Status:** Very active, maintained by Mozilla
- **What it does:** Pure JavaScript PDF renderer in the browser. Supports measurement annotations (line, polyline, polygon) with scale calibration natively. Built into Firefox.
- **Fit:** Excellent for building the **Manual Calibration UI** and **Plan Viewer** — user can pan/zoom the plan, click to measure, set scale. No Python required.
- **Risk:** JavaScript-only — needs a small web server (Flask/FastAPI) to serve the file and receive calibration data.
- **Action:** Recommended for Manual Calibration POC and Review Queue UI ✅

### 15.2 OCR / Digit Recognition

#### PaddleOCR v3.4.0
- **GitHub:** [PaddlePaddle/PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)
- **License:** Apache 2.0
- **Stars:** ~42k
- **Status:** Very active — PP-OCRv5 released Jan 2026, 94.5% accuracy on OmniDocBench
- **ARM64/Mac:** Yes — paddlepaddle ARM64 CPU-only wheels
- **Dep weight:** ~101MB (paddlepaddle 99MB + paddleocr 2MB)
- **GPU required:** No — CPU inference, ~5–10s per image
- **Fit:** Trained on very diverse corpus including industrial/technical fonts. Best general-purpose OCR candidate for CAD digits.
- **Risk:** paddlepaddle dependency is large (~99MB). Newer v3.x has changed install paths — verify pip install instructions from official docs.
- **Action:** POC 4 smoke test — install, run on 5–10 tight crops ✅ HIGH PRIORITY

#### eDOCr (javvi51)
- **GitHub:** [javvi51/eDOCr](https://github.com/javvi51/eDOCr)
- **License:** MIT
- **Stars:** 68
- **Status:** Small, maintained, published to PyPI
- **ARM64/Mac:** Python + keras-ocr — likely works; not officially tested on ARM
- **Dep weight:** ~30MB (keras-ocr + TF Lite)
- **What it does:** Packaged OCR specifically for **mechanical engineering drawings**. Zone-segmentation approach: segments drawing into dimension blocks, info blocks, GDT symbols, then applies targeted OCR per zone. Directly analogous to our tight-crop approach.
- **Research basis:** Based on MDPI 2025 paper "Optimizing Text Recognition in Mechanical Drawings"
- **Risk:** 68 stars, small community. Windows-primary development. keras-ocr may have dependency conflicts with other tools.
- **Action:** 1-hour smoke test: install in isolated environment, run on a few Stage G tight crops ⚠️ WORTH TESTING

#### docTR (Mindee)
- **GitHub:** [mindee/doctr](https://github.com/mindee/doctr)
- **License:** Apache 2.0
- **Stars:** ~3.5k
- **Status:** Active, maintained by Mindee
- **ARM64/Mac:** Yes — TensorFlow and PyTorch backends
- **Dep weight:** ~300MB (torch or TF)
- **What it does:** Two-stage OCR — text detection (localizing words), then text recognition. High accuracy on documents.
- **Risk:** Very heavy (~300MB). Requires TF or PyTorch. Slower to set up than PaddleOCR.
- **Action:** Defer until PaddleOCR results are known. Only test if PaddleOCR disappoints. ⚠️ DEFERRED

#### EasyOCR
- **GitHub:** [JaidedAI/EasyOCR](https://github.com/JaidedAI/EasyOCR)
- **License:** Apache 2.0
- **Stars:** ~22k
- **Status:** Active
- **Dep weight:** ~86MB (torch 83MB + easyocr 2.9MB)
- **Action:** Secondary only — test after PaddleOCR. CPU inference is slower. ⚠️ SECONDARY

#### Kraken
- **GitHub:** [mittagessen/kraken](https://github.com/mittagessen/kraken)
- **License:** Apache 2.0 (ATR engine)
- **Stars:** ~1.5k
- **Status:** Active — Version 5 paper at ICDAR 2025
- **ARM64/Mac:** Yes — installs on Mac ARM
- **What it does:** Optimized for historical and non-Latin script material.
- **Fit:** Poor for CAD digits. Optimized for handwritten/historical documents.
- **Action:** Not recommended for this use case ❌

### 15.3 Engineering Drawing Specific

#### OpenCV (cv2)
- **GitHub:** [opencv/opencv](https://github.com/opencv/opencv)
- **License:** Apache 2.0
- **Stars:** ~79k
- **Status:** Very active
- **ARM64/Mac:** Yes — opencv-python-headless wheels for ARM64
- **Dep weight:** ~25MB (headless)
- **What we use:** Already installed; connected components, template matching (`matchTemplate`), contour analysis (`findContours`), ORB/SIFT feature matching, morphological operations, Canny edge detection
- **Fit:** Core dependency for CC-based tight crop (POC 1) and digit template matching (POC 2)
- **Action:** Already in use ✅ — no new work needed

#### scikit-image
- **GitHub:** [scikit-image/scikit-image](https://github.com/scikit-image/scikit-image)
- **License:** BSD 3-Clause
- **Stars:** ~5.8k
- **Dep weight:** ~25MB
- **What it does:** Image processing, RANSAC feature matching, Hough transform (line detection), region properties
- **Fit:** Useful for line detection (road markings, guardrails) and region analysis
- **Action:** Add for measurement and line detection POCs ✅

#### LayoutParser
- **GitHub:** [Layout-Parser/layout-parser](https://github.com/Layout-Parser/layout-parser)
- **License:** Apache 2.0
- **Stars:** ~4.4k
- **Status:** Less active recently (2023–2024 peak)
- **Dep weight:** 400MB+ (Detectron2 + torch)
- **What it does:** Deep learning document layout analysis — detects titles, bodies, figures, tables in scanned documents.
- **Risk:** Extremely heavy dependencies. Detectron2 is complex to install on ARM64 Mac. Not designed for CAD drawings.
- **Action:** Not recommended for this project ❌

### 15.4 Human Annotation / Review Tools

#### VIA (VGG Image Annotator)
- **GitHub:** [ox-vgg/via](https://github.com/ox-vgg/via)
- **License:** BSD-2-Clause
- **Stars:** ~4k
- **Status:** Maintained by Visual Geometry Group, Oxford
- **Dependencies:** **Zero** — single self-contained HTML file < 400KB
- **What it does:** Browser-based annotation tool. Draw bounding boxes, polygons, point annotations on images. No installation required. Runs offline.
- **Fit:** **Excellent for lightweight human review queue.** A Python script generates the VIA JSON config pointing to Stage G crop files; user opens `via.html` in browser and reviews one crop at a time.
- **Workflow:** Script generates → user annotates in browser → exports JSON → pipeline reads decisions
- **Action:** **Recommended for the human review queue POC** ✅✅ HIGH VALUE

#### Label Studio
- **GitHub:** [HumanSignal/label-studio](https://github.com/HumanSignal/label-studio)
- **License:** Apache 2.0
- **Stars:** ~18k
- **Status:** Very active, well-maintained
- **ARM64/Mac:** Yes — Python package
- **Dep weight:** ~50MB (Python stack, no GPU)
- **What it does:** Multi-type data labeling — images, text, audio, video. Custom labeling interfaces. Export to JSON/CSV/YOLO.
- **Fit:** Powerful for building the full **Teaching Loop review interface** — configure custom UI with image crop + code field + accept/ignore/flag buttons. Better for sustained annotation workflows than VIA.
- **Action:** Recommended for the Teaching Loop POC (POC 7) and for building the full review interface ✅

#### CVAT
- **GitHub:** [cvat-ai/cvat](https://github.com/cvat-ai/cvat)
- **License:** MIT (core)
- **Stars:** ~12k
- **Status:** Very active, AI-assisted labeling
- **Dep weight:** Requires Docker — heavier to set up
- **Fit:** Better for building training datasets for future custom models than for our review queue
- **Action:** Defer — use for building fine-tuning datasets if/when we decide to train a custom digit model ⚠️

#### Gradio + gradio-image-annotation
- **GitHub:** [gradio-app/gradio](https://github.com/gradio-app/gradio)
- **License:** Apache 2.0
- **Stars:** ~35k
- **Annotation component:** [edgarGracia/gradio_image_annotator](https://github.com/edgarGracia/gradio_image_annotator) — Apache 2.0, 52 stars
- **What it does:** Instantly creates local web UIs for any Python function. The image annotation component adds bounding-box and region annotation.
- **Fit:** **Excellent for POC review interfaces** — build a crop review UI in 50 lines of Python. User sees crop, sees OCR candidates, clicks to confirm/reject/correct code. Runs on localhost:7860.
- **Action:** **Recommended for POC review UIs (POC 1–4 result review, POC 7 Teaching Loop)** ✅✅

### 15.5 Geometry / Measurement Libraries

#### Shapely
- **GitHub:** [shapely/shapely](https://github.com/shapely/shapely)
- **License:** BSD 3-Clause
- **Stars:** ~3.8k
- **Dep weight:** ~6MB (Python + GEOS C library)
- **ARM64/Mac:** Yes — binary wheels
- **What it does:** `LineString.length`, `Polygon.area`, spatial intersection, buffer, centroid — all on PDF coordinate geometry
- **Fit:** **Excellent for measurement module** — extract `get_drawings()` paths → convert to Shapely geometries → apply scale factor → output metres
- **Action:** Add for Measurement POC (POC 6) ✅✅

#### NumPy + SciPy (already installed)
Already used for DBSCAN clustering. Also useful for: polyline parameterisation, geometric transformation, path length integration.

### 15.6 Local Web UI Frameworks

#### Flask / FastAPI
- **License:** BSD / MIT
- For serving the plan viewer and calibration tool locally. Flask is simpler; FastAPI is better for async/JSON APIs.
- **Action:** Use Flask for the Manual Calibration Tool UI (pdf.js + Flask) ✅

#### Gradio
- Already covered in 15.4. Also suitable for the Scan Setup Wizard and per-crop review screens.

### 15.7 Multi-Agent Frameworks (Future)

#### LangGraph
- **GitHub:** [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph)
- **License:** MIT
- **Stars:** ~9k
- **Status:** v1.0 (late 2025), very active
- **Fit:** Graph-based stateful agent workflows — excellent for orchestrating the sub-agent pipeline (Section 16)
- **Risk:** Requires LLM backend for tool-calling. For local-only use, can be used with a local model (Ollama + llama.cpp). Does NOT require paid API.
- **Action:** Evaluate for multi-agent orchestration when sub-agents are ready (future phase) ⚠️

#### CrewAI
- **GitHub:** [crewAIInc/crewAI](https://github.com/crewAIInc/crewAI)
- **License:** MIT
- **Stars:** ~25k
- **Fit:** Role-based agent teams — easier setup than LangGraph
- **Action:** Alternative to LangGraph; evaluate together ⚠️

### 15.8 Tools to Avoid

| Tool | Reason to avoid |
|------|----------------|
| Any paid OCR API | Blocked by Section 2 policy |
| LayoutParser + Detectron2 | 400MB+, complex ARM64 install, not designed for CAD |
| TrOCR (Microsoft) | ~300MB transformers dependency, overkill |
| Kraken | Optimized for historical/handwritten fonts, not CAD |
| Prodigy | Paid annotation tool |
| AWS Textract, Google Vision, Azure CV | Cloud APIs — blocked by Section 2 policy |

---

## 16. Engineering Department / Plan Scanner Multi-Agent Architecture

### 16.1 Vision

We are not building one script. We are building a **toolbox / suite of tools** that together support a future Engineering Department module — a professional software product for the road-sign installation industry.

Two possible architectures are presented. Both are valid targets; the difference is when and how deeply to invest.

### 16.2 Option A — Single Plan Scanner Super-Agent

A single unified agent: **Plan Scanner / Engineering Plan Analyzer**

The agent receives a PDF, orchestrates all pipeline stages internally as tool calls, and produces a structured BOQ draft + audit trail.

```
Plan Scanner Agent
├── Tool: extract_vectors(pdf_path) → vector_objects.json
├── Tool: extract_legend(page) → legend_vocabulary.json
├── Tool: cluster_symbols(vectors) → clusters.json
├── Tool: read_sign_codes(clusters) → code_reads.json
├── Tool: group_assemblies(clusters, codes) → assemblies.json
├── Tool: measure_linear(paths, scale) → measurements.json
├── Tool: decompose_elements(clusters) → element_groups.json
├── Tool: generate_review_queue(uncertain_items) → review_queue.json
├── Tool: apply_rules(occurrences, rules_db) → classified.json
└── Tool: generate_boq(approved) → boq_draft.json
```

**Pros:** Simpler to start, lower initial investment, single context for decisions.  
**Cons:** Becomes monolithic; hard to swap individual components; orchestration logic tangled with analysis logic.

**When to use:** For the first production version, when we want to ship something useful quickly.

### 16.3 Option B — מחלקת הנדסה ותוכניות (Engineering Department Module)

A full department structure with specialised sub-agents/tools:

#### Sub-agent 1: Plan Intake Agent
- Receives PDF/CAD plan
- Identifies plan type (intersection / road section / maintenance)
- Detects pages, scale, title block, revision number, legend region
- Output: `plan_context.json`

#### Sub-agent 2: Legend / Vocabulary Agent
- Extracts plan-specific legend (מקרא מפה)
- Extracts icons/symbols from legend region
- Associates Hebrew labels + quantities (כמות) with each sign code
- Output: `legend_vocabulary.json`

#### Sub-agent 3: Written Code Reader Agent
- Focuses on small traffic sign numbers/codes
- Tight CC crop extraction
- Digit-template recognition
- Vector glyph recognition
- Open-source OCR fallback (PaddleOCR)
- Output: `code_reads.json` with confidence levels

#### Sub-agent 4: Symbol / Element Detector Agent
- Finds sign symbols, poles, guardrails, barriers, road markings, work zones
- DBSCAN clustering
- Action type detection (new/existing/remove/cover)
- Color and line-style analysis
- Output: `detected_elements.json`

#### Sub-agent 5: Plan Decomposition Agent
- Separates execution-relevant elements from background/noise
- Auto-detects element groups (by road section, category, type, zone)
- Prepares include/ignore candidate groups
- Awaits human confirmation before proceeding
- Output: `element_groups.json` with status per group

#### Sub-agent 6: Human Teaching / תרגול ולמידה Agent
- Asks targeted questions about ambiguous items
- Receives human answers
- Stores project-specific rules
- Promotes confirmed rules to company-wide rules
- Manages rule database (`rules.json`)
- Output: `plan_rules.json`, updated `company_rules.json`

#### Sub-agent 7: Measurement Agent
- Detects scale (4 sources: title block, graphic bar, dimension annotation, human)
- Measures guardrail/marking/barrier/fence lengths using Shapely
- Supports manual calibration via browser UI
- Outputs metres / m² with audit trail
- Output: `measurements.json`

#### Sub-agent 8: Quantity Reconciliation Agent
- Compares legend quantities vs. map counts vs. measured quantities vs. human approvals
- Detects contradictions (code vs. icon, measured vs. declared, scale conflicts)
- Produces recommended quantities with confidence levels
- Output: `quantity_reconciliation.json`

#### Sub-agent 9: Engineering QA Agent
- Checks uncertainty, contradictions, missing scale, missing legend, poor confidence
- Triggers Red Flag Detector (Section 14.12)
- Routes items to review queue
- Output: `qa_report.json`, `review_queue.json`

#### Sub-agent 10: BOQ / כתב כמויות Agent
- Converts approved findings into structured BOQ draft
- Separates: signs, poles, assemblies, measured metres, m², work packages
- No item enters BOQ without human approval
- Output: `boq_draft.json`, `boq_draft.pdf`

#### Sub-agent 11: Work Package Generator
- Creates execution packages for crews, materials, ordering, pricing, billing
- Map PDF with highlighted work zones
- Materials list by supplier category
- Output: `work_package_crew.pdf`, `materials_list.json`

### 16.4 Recommendation

**Start with Option A** for the near-term POC phase. Tools are implemented as Python functions, not as separate agent processes. As each tool reaches production quality, Option B's boundaries naturally emerge.

**Long-term target is Option B** — each sub-agent becomes an independent, testable module with a defined input/output contract. The orchestration layer (LangGraph or CrewAI) can be added when the tools are mature enough to justify it.

**The sub-agent boundaries in Option B should guide code organisation now**, even if they are not yet deployed as separate agent processes. Name files and modules after their sub-agent role. Keep each tool's logic isolated so it can be wrapped by an agent later.

### 16.5 Product Name

The product is referred to as **"סורק תוכניות"** (Plan Scanner) in the near term. The department module is **"מחלקת הנדסה ותוכניות"** (Engineering and Plans Department) as a future state.

---

## 17. Core Principles — Mandatory Requirements

These principles are binding. Every design decision, POC implementation, and production feature must respect all of them.

| # | Principle | Description |
|---|-----------|-------------|
| A | **Written Code First** | In most plans, the small printed code number is the decisive identity source. Visual recognition is secondary. |
| B | **Correct Spatial Association** | A written number is authoritative only if correctly associated with the relevant symbol/pole/assembly. |
| C | **Pole / Plate / Code / Assembly Separation** | Never collapse: physical pole, individual sign plate, sign code, grouped assembly, counted quantity, measured quantity, approved BOQ quantity. |
| D | **Local-First / API-Last** | Paid APIs are not part of the approved direction. See Section 2. |
| E | **Tight Numeric-Region Crops** | Before any OCR, isolate the actual number area. |
| F | **Digit-Template Recognition** | CAD digits often repeat in one consistent style. Plan-specific digit templates may outperform generic OCR. |
| G | **Vector Glyph Recognition** | If numbers are vector outlines, recognise them at vector level when possible. |
| H | **Open-Source OCR as a Tool** | PaddleOCR or similar — test carefully, not blindly adopted. |
| I | **Interactive Plan Decomposition** | Break the plan into element groups and ask what to include/ignore. |
| J | **Human-Assisted Filtering** | Background, gardens, title blocks, and unrelated labels must be filterable. |
| K | **תרגול ולמידה / Teaching Loop** | User can teach the system what a symbol/notation means, what to ignore, and what to count. |
| L | **Confidence Review Queue** | Uncertain items go to review instead of being forced through. |
| M | **Evidence Panel** | Every quantity must show source evidence. |
| N | **Contradiction Detector** | Flag: legend vs. map, code vs. icon, measured vs. declared, scale conflicts, pole/sign count conflicts. |
| O | **Manual Calibration** | If scale is unclear, user can define a known distance. |
| P | **Scale-Based Measurement** | Measure guardrails, fences, barriers, markings, work zones and areas using scale/vector geometry. |
| Q | **Existing / New / Remove / Cover** | Classify action type, not just object type. |
| R | **Color and Line-Style Meaning** | Detect if colors/line types indicate new/existing/remove/temporary/permanent. |
| S | **Revision Comparison** | Future ability to compare plan versions and identify quantity changes. |
| T | **Red Flag / Missing Data Detector** | Detect missing legend, no scale, unreadable codes, low-quality PDF, contradictions, missing approval. |
| U | **Work Package Generator** | Approved BOQ should later feed crews, materials, orders, pricing, and billing. |
| V | **Audit Trail and Human Approval** | No final operational quantity without traceability and explicit human approval. |

---

## 18. Decision Matrix — Free-First / Open-Source Route

All approaches must be free and local. Paid Vision API is listed only for comparison and marked NOT APPROVED.

| Approach | Cost | Local | Maturity | Dep size | Impl effort | Expected value | Fit: Written Code | Fit: BOQ/Meas | Reduce manual work | Test next? |
|----------|------|-------|---------|---------|-------------|---------------|------------------|--------------|-------------------|-----------|
| **Tight CC crop + Tesseract** | Free | Yes | High (done) | 0 (installed) | 1–2h | Medium | ✅ Direct | ❌ Code only | Medium | **YES — POC 1** |
| **Digit-template matching** | Free | Yes | Medium | 0 (OpenCV) | 3–4h | Medium-High | ✅ Direct | ❌ Code only | High | **YES — POC 2** |
| **Vector glyph recognition** | Free | Yes | Low | 0 (fitz) | 2–3h + 30min test | Potentially High | ✅ Native res | ❌ Code only | High | **YES — POC 3** |
| **PaddleOCR smoke test** | Free | Yes | High | 101MB | 1h | High | ✅ | ❌ Code only | High | **YES — POC 4** |
| **eDOCr engineering OCR** | Free | Yes | Low-Medium | ~30MB | 1h | Unknown | ✅ Eng-drawing | ❌ Code only | Medium | Yes — 1h smoke |
| **EasyOCR** | Free | Yes | High | 86MB | 1h | Medium | ⚠️ General | ❌ Code only | Medium | After PaddleOCR |
| **Legend symbol matching** | Free | Yes | Medium | 0 (OpenCV) | Done (Stage E/F) | Medium | ⚠️ Icon match | ❌ | Medium | Improve in POC |
| **Interactive Plan Decomp** | Free | Yes | Low | 0 | 3–4h | High | ❌ Orthogonal | ✅ Qty scoping | Very high | **YES — POC 5** |
| **Human Teaching Loop** | Free | Yes | Low | 0 | 4–8h | Very high | ✅ Rule-based | ✅ Rules help | Very high | **YES — POC 7** |
| **Manual Calibration** | Free | Yes | Low | Shapely 6MB | 2–3h | High | ❌ | ✅✅ Scale | High | **YES — POC 6** |
| **Shapely measurement** | Free | Yes | High | 6MB | 1h | High | ❌ | ✅✅ Linear/area | High | Yes — with POC 6 |
| **VIA / Gradio review UI** | Free | Yes | High | ~2MB | 2–3h | Very high | ✅ Review | ✅ Review | Very high | **YES — POC 1–4** |
| **LangGraph orchestration** | Free | Yes | High (v1.0) | ~50MB | Days | Very high (future) | ✅ | ✅ | Very high | Future — after POCs |
| *~~Paid Vision API~~* | *~~Paid~~* | *~~No~~* | *~~High~~* | *~~Cloud~~* | *~~N/A~~* | *~~High~~* | *~~✅~~* | *~~❌~~* | *~~High~~* | **NOT APPROVED** |

---

## 19. Semi-Automatic Fallback Levels

For each sign occurrence, the system attempts resolution in this order. It stops at the first level that produces a confident result.

### Level 1 — Fully Local Automatic

**Trigger:** CC-based tight crop + multi-engine agreement (Tesseract + PaddleOCR + digit template — ≥ 2 agree).  
**Action:** Accept code automatically. No human review. No API.  
**Target:** 60%+ of occurrences after POCs are implemented.

### Level 2 — Local with Company Rule

**Trigger:** Occurrence matches a stored company-wide rule.  
**Action:** Apply rule automatically. Log rule application. No human review.  
**Example:** "Single-member symbol_fragment, score < 0.12 → noise."

### Level 3 — Human-Assisted Local

**Trigger:** Partial evidence — one method returned a code but others are inconclusive.  
**Action:** Present evidence panel to human (Gradio or VIA interface). Human confirms, corrects, or overrides. Result stored and feeds teaching loop.  
**Cost:** Human time only. No API.

### Level 4 — Manual Entry

**Trigger:** All local methods exhausted. Code not readable by any local engine.  
**Action:** Human opens plan PDF, identifies sign manually, enters code directly. Audit-logged with creator and timestamp.  
**Cost:** Human time. Acceptable for rare cases.

### Level 5 — [RESEARCH NOTE ONLY] Theoretical Paid Vision Fallback

**Status:** **NOT APPROVED. NOT PLANNED. NOT A DEFAULT.**  
**What it is:** A theoretical edge-case note — for an individual crop that has exhausted all local methods AND manual entry is also uncertain (e.g., severely degraded plan quality), a paid Vision API call could theoretically provide a second opinion.  
**Constraints if ever considered:** Explicit per-crop authorisation required. Not a batch operation. Not used for cost or speed optimisation.  
**Cost:** ~$0.01–$0.03 per crop at current pricing.  
**Decision:** Revisit only after POCs 1–4 are complete and the percentage of Level-4 manual entries is measured.

---

## 20. Recommended Free-First POC Roadmap

Execute in order. Each POC feeds the next. Do not skip ahead to manual review or API calls while a promising local method remains untested.

### POC 1 — Tight CC Crop + Tesseract

**Script:** `11_tight_crop_ocr.py`  
**Time:** 1–2 hours  
**Goal:** CC-based tight numeric region extraction on all 177 crops. Multi-resolution upscale. Compare against Stage 10 baseline.  
**Success criterion:** ≥ 10 new confident reads that Stage 10 missed.  
**Dependencies:** Already installed (OpenCV, Tesseract, pytesseract).  
**Review UI:** Gradio — build a simple accept/reject/correct interface for reviewing POC 1 outputs.

### POC 2 — Digit Template OCR

**Script:** `12_digit_template_ocr.py`  
**Time:** 3–4 hours (includes template extraction)  
**Goal:** Extract 10 digit templates from confirmed glyph examples (speed limit circles); match against CC candidates using normalized cross-correlation.  
**Success criterion:** Correlation ≥ 0.80 on ≥ 3 confirmed digit examples.  
**Dependencies:** OpenCV (installed).

### POC 3 — Vector Glyph Recognition

**Script:** `13_vector_glyph_feasibility.py` (30-min test) → `13_vector_glyph_recognition.py` (if feasible)  
**Time:** 30 min feasibility; 2–3 hours full implementation  
**Goal:** Filter `get_drawings()` by digit-sized bounding boxes; check if digit-shaped path clusters appear adjacent to ≥ 5 known sign occurrences.  
**Success criterion:** Feasibility test shows separable digit-path clusters at ≥ 5 known sign locations.  
**Dependencies:** PyMuPDF (installed).

### POC 4 — PaddleOCR Smoke Test

**Script:** `14_paddleocr_smoke_test.py`  
**Time:** 1 hour (including install)  
**Goal:** Install paddlepaddle + paddleocr (~101MB); run on the 10 best tight-crop sub-images from POC 1. Compare against Tesseract, digit templates, and vector glyph results.  
**Success criterion:** PaddleOCR reads ≥ 5 codes that no previous method produced.  
**Dependencies:** paddlepaddle, paddleocr (101MB — install only when running this POC).  
**Note:** If POC 1–3 already achieve satisfactory coverage (≥ 60% confident reads), this POC may be deferred.

### POC 5 — Interactive Plan Decomposition Prototype

**Script:** `15_plan_decomposition.py` + Gradio UI  
**Time:** 3–4 hours  
**Goal:** Auto-detect element groups on the 177 occurrences (by spatial cluster, by category from legend match, by cluster type). Generate a suggested include/ignore list. Present to user as a simple Gradio screen with checkboxes.  
**Success criterion:** User can select/deselect groups and the filtered occurrence set is saved to `element_groups_confirmed.json`.  
**Dependencies:** Gradio (lightweight, Apache 2.0), already have clusters and legend data.

### POC 6 — Manual Scale Calibration and Measurement

**Script:** `16_measurement_poc.py` + pdf.js viewer (Flask-served)  
**Time:** 2–3 hours  
**Goal:** Build a minimal browser-based calibration tool: user opens plan in pdf.js viewer served by Flask, clicks two points, enters real-world distance, tool computes calibration factor. Then measure 2–3 guardrail segments and output metres with audit trail.  
**Success criterion:** Measure one known segment from the plan and verify against a manually checked reference length.  
**Dependencies:** Flask (MIT, 2MB), pdf.js (Apache 2.0, 49kB HTML+JS), Shapely (6MB).

### POC 7 — Human Teaching Loop Design and Prototype

**Script:** `17_teaching_loop_poc.py` + Label Studio or Gradio  
**Time:** 4–8 hours  
**Goal:** Build a minimal teaching loop: user is presented with one ambiguous occurrence, answers a targeted question ("Is this an installation or legend item?"), answer is stored as a project-specific rule in `plan_rules.json`, and the pipeline re-evaluates all similar occurrences using the new rule.  
**Success criterion:** One rule created by user reduces the review queue for similar occurrences.  
**Dependencies:** Label Studio or Gradio (both already researched).  
**Note:** This POC requires POC 5 (element groups) to be working first — POC 5 defines "similar occurrences."

---

## Appendix: File and Stage Map

```
research/cad-pdf-intelligence/
├── 01_extract_vectors.py          Stage 01: raw vector extraction
├── 02_filter_candidates.py        Stage 02: symbol filtering
├── 04_cluster_symbols.py          Stage 04: DBSCAN clustering
├── 05_debug_overlay.py            Stage 05: SVG debug
├── 06_match_signs.py              Stage E:  template matching vs. catalog
├── 07_extract_legend.py           Stage F:  legend vocabulary [SHIPPED]
├── 08_sign_inventory.py           Stage G:  sign inventory + crops
├── 09_stage_g_inventory.py        Stage G:  inventory build (alt entry)
├── 10_local_ocr_sign_codes.py     Stage 10: Tesseract diagnostic [DONE — 0% reduction]
├── 10_vision_smoke_test.py        [READY — no API key; NOT a planned path]
├── 11_tight_crop_ocr.py           POC 1:   CC tight crop + Tesseract [TODO]
├── 12_digit_template_ocr.py       POC 2:   digit template matching [TODO]
├── 13_vector_glyph_recognition.py POC 3:   vector glyph feasibility + recognition [TODO]
├── 14_paddleocr_smoke_test.py     POC 4:   PaddleOCR smoke test [TODO]
├── 15_plan_decomposition.py       POC 5:   interactive element groups [TODO]
├── 16_measurement_poc.py          POC 6:   scale calibration + measurement [TODO]
├── 17_teaching_loop_poc.py        POC 7:   human teaching loop prototype [TODO]
├── LOCAL_FIRST_PLAN_SCANNER_STRATEGY.md   (this document — v2.0)
├── PLAN_SCANNER_ARCHITECTURE.md          (system architecture + Section 16: scale/BOQ)
├── STAGE_G_REPORT.md                     (research status — includes Stage 10 OCR results)
└── outputs/
    ├── sign_inventory.json                177 occurrences
    ├── stage_g_code_crops/                177 × 667×668px PNG crops
    ├── local_ocr_sign_codes.json          177 Tesseract diagnostic records
    └── local_ocr_debug/                   20 CC debug images
```

**"סורק תוכניות" product vision** = All 11 sub-agents (Section 16) packaged for production use with full audit trail and approval workflow, running 100% locally, with optional human review at every decision point.

**"תרגול ולמידה"** = Teaching loop (sub-agent 6) integrated throughout, allowing plan-specific and company-level rules to accumulate over time, reducing review burden and improving accuracy with each plan processed.

**Local-first policy (Section 2)** = The north star: every component runs on developer hardware, every dependency is open-source, every result is explainable, and every final quantity has a human approval stamp.

---

*This document is a research architecture specification. Version 2.0 reflects the strategic reorientation to 100% local-first, open-source-first, and human-assisted-when-needed. No production code, DB changes, or API costs are incurred by reading or implementing this document. All experiments remain isolated under `research/cad-pdf-intelligence/`.*
