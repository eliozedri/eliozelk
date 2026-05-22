# Plan Scanner — Image-Based Engine Spec

**Version:** 1.0  
**Date:** 2026-05-21  
**Status:** POC / Research  
**Author:** Engine B design session  

---

## 1. Concept and Motivation

The existing vector/CAD engine (Engine A, scripts 01–34) extracts sign candidates by parsing the PDF's internal vector structure — paths, text objects, layer names, and coordinate data. This approach is powerful for well-structured AutoCAD PDFs but has known failure modes:

- Plans exported with flattened layers lose per-element semantic structure
- Font substitution and CID encoding break text extraction for numeric sign codes
- Raster elements (scanned annotations, stamp overlays) are invisible to vector parsing
- Heavily crowded regions cause spatial ambiguity in pole/tick association

Engine B takes a completely different approach: **render the PDF page as a pixel image and apply computer vision**. It does not parse any internal PDF structure. Instead it:

1. Rasterizes the PDF page at controlled DPI (300 default, 150 fast, 600 deep)
2. Detects pole dots as small filled circles using blob detection
3. Detects short line segments near each pole as tick marks (= signs hanging on the pole)
4. Reads numeric sign codes via multi-engine OCR (Tesseract + EasyOCR + PaddleOCR)
5. Detects sign shapes (circle, triangle, rectangle, octagon, arrow) via contour analysis
6. Associates poles, codes, and shapes within configurable radii

**When both engines agree on a candidate, confidence increases. When they disagree, the candidate is flagged for human review.**

This approach is particularly valuable for:
- Raster-overlay PDFs where Engine A finds few signs
- Cross-validation of Engine A results
- Plans where sign code text is embedded as image glyphs rather than vector text

---

## 2. How This Differs from the Vector/CAD Engine

| Dimension | Engine A (Vector/CAD) | Engine B (Image-Based) |
|---|---|---|
| Input format | PDF internal vectors | PDF rasterized to image |
| Text extraction | pdfplumber / PyMuPDF text objects | OCR (Tesseract / EasyOCR / PaddleOCR) |
| Sign detection | Layer names, path geometry, color matching | Blob detection + contour classification |
| Coordinate system | PDF points (exact) | Pixel coordinates → mm via DPI formula |
| Dependency on layers | High — lost layers = lost signs | None — pixels always present |
| Speed | Fast (vector parsing is cheap) | Moderate — render + CV + OCR adds cost |
| OCR quality | N/A — text is already parsed | Variable; depends on DPI and image quality |
| Hebrew annotations | Requires font data in PDF | EasyOCR handles Hebrew directly |
| Raster overlays | Cannot see | Native input |
| Confidence model | Rule-based + cluster matching | Score-based (0–100) with per-field weights |
| Typical run time | 5–30s for full pipeline | 30–120s fast scan; 3–10 min deep scan |

---

## 3. Tools Evaluated

| Name | Status | License | Role | Recommendation |
|---|---|---|---|---|
| easyocr 1.7.2 | Installed | Apache 2.0 | Multi-language OCR: digits + Hebrew labels | Use — highest priority OCR engine |
| paddleocr 3.5.0 + paddlepaddle 3.3.1 | Installed | Apache 2.0 | Alternative OCR for comparison | Use — provides independent comparison signal |
| tesseract-lang (heb.traineddata) | Installed via brew | Apache 2.0 | Hebrew annotation reading via Tesseract | Use — free upgrade to existing Tesseract setup |
| scikit-image 0.24.0 | Installed | BSD-3 | Connected components, morphological ops, peak detection | Use — complements OpenCV for blob analysis |
| shapely 2.0.7 | Installed (was pre-existing) | BSD-3 | Geometric containment/proximity queries | Use — already in environment |
| ezdxf 1.4.2 | Installed | MIT | DXF reading for plans delivered as DXF | Install now, use later (Phase 2) |
| rtree 1.4.1 | Installed (needs spatialindex) | LGPL | Spatial indexing for fast proximity search | Use — critical for scale-up |
| PyMuPDF (fitz) | Pre-existing | AGPL | PDF rendering at controlled DPI | Already in requirements |
| OpenCV (headless) | Pre-existing | Apache 2.0 | Blob, contour, morphological operations | Already in requirements |
| pytesseract | Pre-existing | Apache 2.0 | Digit-mode OCR, now with Hebrew support | Already in requirements |
| python-doctr[torch] | Not installed | Apache 2.0 | Fallback OCR if easyocr fails | Defer — not needed, easyocr installed OK |
| FreeCAD / ODA / LibreDWG | Evaluated, rejected | Various | DXF/DWG vector reading | Too heavy for POC; system-level deps; defer |
| Any cloud OCR (Google, Azure, AWS) | Rejected | N/A | Would require API keys | Policy: no API keys in this pipeline |

---

## 4. Detection Algorithm

### 4.1 PDF Rendering (DPI Choices)

PDF pages are rendered using `fitz.Matrix(dpi/72, dpi/72)` on the target page.

| Mode | DPI | Typical image size (A1 plan) | Render time | Notes |
|---|---|---|---|---|
| Fast | 150 | ~2480×1754 px | ~300ms | Sufficient for pole detection; OCR may miss small codes |
| Default | 300 | ~4961×3508 px | ~800ms | Good balance; 300dpi is standard for OCR work |
| Deep | 600 | ~9921×7016 px | ~3–5s | Best OCR accuracy; memory-intensive (~200MB/image) |

**Coordinate conversion:**  
`mm = px * 25.4 / DPI`  
At 300 DPI: 1mm ≈ 11.81 px; 1px ≈ 0.0847mm.

Rendered images are saved as PNG to `run_dir/outputs/image_scan_debug/page_{N}_{DPI}dpi.png`.

### 4.2 Pole/Tick Detection (Anchor Pass 1)

**Rationale:** In Israeli traffic plans, poles are drawn as small filled circles (typically 2–5mm diameter). Each tick mark on the pole represents one sign mounted at that position.

**Algorithm:**

1. Convert rendered image to grayscale
2. Apply Gaussian blur (kernel 3×3) to reduce noise
3. Apply adaptive threshold or Otsu to separate dark elements from background
4. Use `cv2.connectedComponentsWithStats` to find all connected dark regions
5. Filter by area: min 4px², max 2500px² (at 300 DPI: ~0.03mm² to ~18mm²)
6. Circularity filter: `4π·area / perimeter² > 0.65` (poles are roughly circular)
7. For each pole candidate, search within `pole_search_radius` (default 80px at 300 DPI) for:
   - Short line segments detected via Hough line transform (HoughLinesP)
   - Each short segment within radius = one tick mark
   - Tick count → estimated number of signs on pole
   - Tick orientation → sign mounting direction (North/South/East/West)
8. Record: `{center_x, center_y, radius_px, tick_count, tick_bboxes, orientation_deg}`

**Expected result:** 5–50 pole candidates per typical plan page.

### 4.3 Text/OCR Detection (Anchor Pass 2)

**Rationale:** Sign codes in Israeli plans are 2–4 digit numbers (e.g. "135", "627", "412"). OCR targets these numeric labels adjacent to poles.

**Strategy:** Crop patches around each pole candidate for focused OCR, plus full-page grid OCR fallback for codes not near any detected pole.

**Three OCR engines run independently:**

**Tesseract (digit mode):**
```python
pytesseract.image_to_data(
    crop, lang='eng',
    config='--psm 7 -c tessedit_char_whitelist=0123456789'
)
```
Filter: strings 2–4 chars, confidence > 40. Fast (< 50ms/crop).

**EasyOCR:**
```python
reader = easyocr.Reader(['en', 'he'])  # Hebrew if needed
reader.readtext(crop)
```
Filter: strings matching `^\d{2,4}$` or Hebrew annotation patterns. First run downloads models (~800MB). Subsequent runs use cached models. Typical: 200–500ms/crop.

**PaddleOCR:**
```python
from paddleocr import PaddleOCR
ocr = PaddleOCR(use_angle_cls=True, lang='en')
ocr.ocr(crop)
```
Filter: same as above. Models download on first use. Typical: 300–800ms/crop.

**OCR fusion:** For each text candidate, record which engines agree. Agreement among 2+ engines raises confidence. Conflicts are noted in `image_scan_ocr_comparison.json`.

### 4.4 Sign Shape Detection (Anchor Pass 3)

**Rationale:** Sign shapes encode sign type. Circles = regulatory (stop, yield), triangles = warning, rectangles = informational, octagons = stop signs.

**Algorithm:**

1. Apply Canny edge detection on grayscale image
2. Find contours (`cv2.findContours`, RETR_EXTERNAL, CHAIN_APPROX_SIMPLE)
3. Filter contours by area: min 200px², max 50000px²
4. Approximate polygon: `cv2.approxPolyDP(contour, epsilon=0.02*perimeter, True)`
5. Classify by vertex count and circularity:
   - `n=3` → triangle (warning sign)
   - `n=4, aspect_ratio ≈ 1` → square/rhombus (regulatory)
   - `n=4, aspect_ratio > 1.5` → rectangle (informational)
   - `n>=8 or circularity > 0.8` → circle (regulatory)
   - `n=8` → octagon (stop sign)
   - Convex hull ratio check → arrow
6. Record: `{bbox, centroid, shape_type, area_px, circularity, vertex_count}`

**Expected result:** Many false positives from decorative elements; filtered by proximity to poles/text and minimum size.

### 4.5 Spatial Association

Association builds the final candidate records by linking poles, text, and shapes.

**Primary flow (pole-first):**

```
for each pole_candidate:
    nearest_text = find_text_within_radius(pole, radius=150px)
    nearest_shape = find_shape_within_radius(pole, radius=200px)
    if nearest_text or nearest_shape:
        emit_candidate(anchor_type='pole', ...)
```

**Text-first fallback (runs after pole-first):**

```
for each ocr_result not yet associated:
    if text matches sign_code_pattern (2-4 digits, value 1–999):
        nearest_pole = find_pole_within_radius(text, radius=200px)
        if nearest_pole:
            emit_candidate(anchor_type='text', ...)
        else:
            emit_candidate(anchor_type='text_standalone', ...)
```

**Shape-first fallback (runs after text-first):**

```
for each shape not yet associated:
    nearest_text = find_text_within_radius(shape, radius=120px)
    if nearest_text:
        emit_candidate(anchor_type='shape', ...)
```

All distance calculations use Euclidean pixel distance, converted to mm in the output.

Spatial queries use `rtree` index for performance when candidate counts are high (>500 shapes).

### 4.6 Scoring and Confidence

Each candidate receives an `overall_confidence` score (0–100):

| Evidence present | Points |
|---|---|
| Pole detected | +40 |
| Tick count > 0 | +20 |
| Sign code found (any OCR engine) | +30 |
| Sign code confirmed by 2+ engines | +10 bonus |
| Sign shape detected | +10 |
| Shape matches expected type for code range | +5 bonus |
| **Maximum** | **100** (with bonuses capped at 100) |

`requires_review = True` when:
- `overall_confidence < 60`, OR
- `sign_code_text` is None/empty, OR
- OCR engines disagree on the code value

`review_reason` contains a human-readable explanation.

---

## 5. Output Schema

Every candidate record contains the following fields:

```json
{
  "candidate_id": "run_XXXX_p0_c012",
  "page_number": 0,
  "anchor_type": "pole | text | shape | text_standalone",

  "pole_bbox": [x1, y1, x2, y2],
  "pole_center": [cx, cy],
  "tick_count": 2,
  "tick_bboxes": [[x1,y1,x2,y2], ...],

  "sign_code_text": "135",
  "sign_code_confidence": 87.5,
  "sign_code_bbox": [x1, y1, x2, y2],
  "sign_code_ocr_engine": "easyocr | tesseract | paddleocr | consensus",

  "sign_shape_bbox": [x1, y1, x2, y2],
  "sign_shape_type": "circle | triangle | rectangle | octagon | arrow | unknown",
  "sign_shape_confidence": 0.82,

  "association_distance_px": 45.2,
  "association_distance_mm": 3.83,

  "overall_confidence": 90,
  "requires_review": false,
  "review_reason": null,

  "evidence_crop_path": "outputs/image_scan_debug/evidence_crop_012.png"
}
```

**OCR comparison record** (written to `image_scan_ocr_comparison.json`):

```json
{
  "region_id": "region_012",
  "crop_bbox": [x1, y1, x2, y2],
  "tesseract": {"text": "135", "confidence": 82.1, "elapsed_ms": 45},
  "easyocr":   {"text": "135", "confidence": 0.91, "elapsed_ms": 320},
  "paddleocr": {"text": "135", "confidence": 0.88, "elapsed_ms": 410},
  "consensus": "135",
  "engines_agree": true
}
```

---

## 6. Comparison Strategy with Engine A (Vector Engine) and Engine C (Visual Learning Agent)

> **Three engines now exist:** Engine A (vector/CAD, scripts 01–34), Engine B (image detection, this script 35), Engine C (visual learning agent, script 36). See `PLAN_SCANNER_VISUAL_LEARNING_AGENT_SPEC.md` for Engine C's full role. The cross-validation layer below covers Engine A vs B; Engine C's comparison logic is documented in its own spec §12.


Engine A produces a candidate list from vector/text parsing. Engine B produces one from image analysis. The comparison layer:

1. Converts both sets to a common spatial frame (PDF points or mm)
2. For each Engine B candidate, searches Engine A candidates within tolerance (default 5mm)
3. Match found → `engine_a_agrees: true`, combined confidence boosted
4. No match → `engine_a_agrees: false`, `requires_review: true`
5. Engine A candidates with no Engine B match → flagged as `engine_b_missed` (useful for engine B improvement)

The comparison output will go in `run_dir/outputs/engine_comparison.json` (Phase 2 — not yet implemented in POC).

**When engines agree:** The candidate is highly reliable; suitable for automated BOQ generation.  
**When engines disagree:** The candidate requires human review before inclusion in any order.

---

## 7. Performance Model (Fast Scan vs Deep Scan)

**Why 10s total is not achievable for raw PDF:**

OCR is the bottleneck. EasyOCR loads a PyTorch model (~300MB) on first use. Even with model pre-loaded, processing a 300 DPI A1 plan image takes 2–8s per page for full-image OCR. Pole detection + shape detection add another 0.5–2s. Saving evidence crops (up to 50 files) adds I/O cost.

| Stage | Fast Scan (150 DPI) | Default (300 DPI) | Deep Scan (600 DPI) |
|---|---|---|---|
| PDF render | ~150ms | ~400ms | ~2s |
| Pole detection | ~200ms | ~400ms | ~1.5s |
| OCR (Tesseract, patches) | ~500ms | ~800ms | ~2s |
| OCR (EasyOCR, patches) | ~1–3s | ~2–5s | ~8–15s |
| OCR (PaddleOCR, patches) | ~1–3s | ~2–6s | ~10–20s |
| Shape detection | ~200ms | ~500ms | ~2s |
| Spatial association | <100ms | <100ms | <200ms |
| Evidence crops | ~500ms | ~800ms | ~2s |
| **Estimated total** | **~30–60s** | **~60–120s** | **3–10 min** |

Note: EasyOCR and PaddleOCR model downloads happen only on first run. Subsequent runs skip this step.

**Fast Scan trade-offs:**
- Lower DPI means smaller codes may not be legible by OCR
- Pole blobs are smaller in pixel space; some very small dots may be missed
- Acceptable for first-pass pipeline qualification; Deep Scan for final verification

---

## 8. POC Implementation Plan

The POC script (`35_image_based_plan_scanner_poc.py`) implements all stages in a single file with no imports from scripts 01–34.

**Stage sequence:**
```
CLI parse → find PDF → render page → pole detection → OCR → shape detection →
spatial association → evidence crops → output generation → timing summary
```

**Output files per run:**
- `outputs/image_scan_debug/page_{N}_{DPI}dpi.png` — rendered page
- `outputs/image_scan_debug/evidence_crop_{id}.png` — per-candidate crops
- `outputs/image_scan_candidates.json` — full candidate list
- `outputs/image_scan_report.md` — human summary
- `outputs/image_scan_report.html` — browser-viewable with inline crops
- `outputs/image_scan_ocr_comparison.json` — per-region OCR engine comparison
- `outputs/image_scan_ocr_comparison.md` — human-readable comparison table

---

## 9. Image-Based Visual Teaching Loop / Agent Learning Principle

**This section is a core principle of the Image-Based Plan Scanner, not an optional enhancement.**

> **Production track:** This principle is now implemented as **Engine C — Visual Learning Agent**, documented in [`PLAN_SCANNER_VISUAL_LEARNING_AGENT_SPEC.md`](PLAN_SCANNER_VISUAL_LEARNING_AGENT_SPEC.md). Engine C is the operational realization of everything in this section: rule extraction from user markings, evidence crops, review questions, learning scopes, hard BOQ boundary. Engine B (this script) provides the *image rendering and detection primitives* that Engine C builds upon. The POC is `36_visual_learning_agent_poc.py`.

### 9.1 Why this principle exists

The Image-Based engine analyzes the plan as a flat 2D image. Even at 150 DPI tile resolution with multiple OCR engines, the engine will routinely encounter ambiguous visual elements:

- A small dark dot — is it a pole, a dimension endpoint, or noise?
- A short line near a pole — is it a tick mark (signaling another sign on the pole) or unrelated geometry?
- A nearby 3-digit number — does it belong to this pole, or is it a length dimension?
- A nearby triangle — is it a sign symbol or a callout arrow?
- A cluster of marks — is it one assembly or several?

**The engine must not guess silently.** Silent guessing produces confident-looking output that downstream consumers (BOQ aggregation, ordering, billing) cannot tell apart from verified data. Once it enters a BOQ, an unverified guess is indistinguishable from ground truth.

The correct behavior is to **flag uncertainty as a review question with an evidence crop**, and let a human answer once — then learn from that answer.

### 9.2 The teaching loop

```
visual scan → uncertain candidate
            → evidence crop generated
            → user question created
            → user answers OR marks the plan manually
            → answer saved as teaching example
            → applied to current scan
            → optionally promoted to project/company rule
            → improved scanner on next run
```

### 9.3 Question types the engine must support

The engine produces one of these question types per uncertain candidate:

| Question type | Hebrew example | What it resolves |
|---|---|---|
| `is_pole` | "האם הנקודה הזו היא עמוד תמרור?" | dot vs noise vs dimension mark |
| `tick_count` | "כמה תמרורים מותקנים על העמוד הזה לפי הסימון?" | number of signs on a pole |
| `is_tick_mark` | "האם הקו הקטן ליד הנקודה מסמן תמרור נוסף על אותו עמוד?" | tick vs unrelated line |
| `code_belongs_to` | "האם המספר 433 שייך לעמוד/תמרור הזה?" | code-to-pole association |
| `is_real_sign` | "האם זה סימון תמרור או רעש/רקע?" | sign vs background artifact |
| `include_in_boq` | "האם הסימון הזה צריך להיכלל בכתב הכמויות?" | inclusion in final order |

### 9.4 User-initiated training

Beyond answering questions the engine asks, the user can **actively train** by marking the plan directly. Future UI must support:

- **Mark pole** — assert that this point IS a sign pole
- **Mark sign code text** — assert that this text region IS a sign code (and which sign it belongs to)
- **Mark tick marks** — assert which short lines are tick marks for which pole
- **Mark sign symbol** — assert that this shape IS a sign of given type
- **Mark wrong detection** — reject a false-positive candidate the engine produced
- **Mark ignore/noise region** — exclude an area from future scanning of this plan
- **Mark association** — explicitly link a sign code to a specific pole
- **Mark sign count on pole** — set the number of signs on a specific pole

Each manual marking becomes a teaching example with the same data structure as an engine-asked question.

### 9.5 Future-compatible output fields

The candidate record (Section 5) must be extended to support teaching loop integration. These fields are **planned for the next POC iteration** — they are NOT in the current candidate JSON, but the schema should evolve to include them:

```json
{
  "review_question_id": "q_p0_c012_is_pole",
  "evidence_crop_path": "outputs/image_scan_debug/evidence_crop_012.png",
  "crop_bbox": [x1, y1, x2, y2],
  "page_number": 0,

  "candidate_type": "pole_candidate | tick_candidate | sign_symbol_candidate | sign_code_candidate | assembly_candidate",
  "system_guess": "pole",
  "confidence": 0.62,

  "allowed_answers": ["pole", "noise", "dimension_mark", "other"],

  "user_answer": null,
  "user_marking_geometry": null,
  "corrected_label": null,
  "corrected_association": null,

  "correction_scope": "current_plan_only | project_rule | company_rule_candidate | company_rule_approved",
  "correction_status": "pending | answered | applied | promoted",

  "learned_rule_candidate": null,
  "requires_review": true,
  "audit_notes": []
}
```

### 9.6 Learning scopes

Every correction has a scope that controls how far it propagates:

| Scope | Meaning | Promoted by |
|---|---|---|
| `current_plan_only` | Default. Correction applies to this plan only. Lost when plan archived. | Auto |
| `project_rule` | Correction applies to all plans in this project (multi-PDF projects). | User explicitly |
| `company_rule_candidate` | Correction suggests a general convention worth applying globally; pending review. | User flags |
| `company_rule_approved` | Reviewed and approved by admin as a company-wide detection rule. | Admin only |

Promotion is **never automatic** — it requires explicit user action. This protects against one anomalous plan polluting global detection rules.

### 9.7 Hard boundary: human correction does NOT auto-approve BOQ

This is critical and must remain enforced:

- A user answering "yes, this is a pole" improves **detection confidence** for that candidate.
- It does **NOT** mark the candidate as approved for BOQ inclusion.
- BOQ approval remains a **separate workflow** with its own approval gate.
- The teaching loop is a detection-quality mechanism, not an order-approval mechanism.

Conflating these would let a high-frequency user accidentally approve thousands of BOQ line items by answering detection questions. Keep them separate.

### 9.8 Where this principle is enforced

This principle must be reflected in:

1. **PLAN_SCANNER_IMAGE_BASED_ENGINE_SPEC.md** — this document (Section 9)
2. **PLAN_SCANNER_TOOLING_AND_PERFORMANCE_AUDIT.md** — must reference the learning-loop assumption when evaluating OCR engine choices (a tool's value increases if its errors are catchable via review questions)
3. **Future Teaching Loop / Review Queue docs** — extend `25_teaching_loop_answer_pack.py` and `14_build_review_queue.py` patterns to image-engine candidates
4. **POC reports** — every image scan report must document how many candidates were marked `requires_review` and the breakdown of `candidate_type`
5. **Future UI design** — the manual-marking surface must exist before the image engine is exposed to production users

### 9.9 Practical impact on current POC

The current POC (`35_image_based_plan_scanner_poc.py`) already emits:
- `evidence_crop_path` per candidate
- `requires_review: bool`
- `review_reason` text
- `overall_confidence` numeric score

These are the **foundation** of the teaching loop. The next POC iteration must add:
- `candidate_type` field with the values above
- `review_question_id` per uncertain candidate
- `allowed_answers` per question type
- Output of a `image_scan_review_questions.json` file ready for UI consumption

No DB schema, no production UI, no migrations required yet — this is research-only schema preparation.

---

## 10. Next Steps

1. **Run POC on both available test plans** and validate candidate count vs Engine A
2. **Tune pole detection thresholds** based on actual plan scale and line weight
3. **Implement Engine A/B comparison layer** (engine_comparison.json)
4. **Add calibration step:** measure known scale bar in image to derive px/mm ratio
5. **Expand OCR to full-page mode** for plans with scattered annotations not near poles
6. **Hebrew annotation extraction:** test EasyOCR `['he']` mode on any Hebrew labels present
7. **Multi-page support:** loop over all pages, aggregate candidates across pages
8. **Performance optimization:** cache OCR models between runs; batch patch OCR
9. **Integration with Engine A pipeline:** wire Engine B as optional step in `34_ui_plan_scan_orchestrator.py`
10. **Production deployment consideration:** EasyOCR + PaddleOCR are too heavy for edge deployment; consider server-side only with model caching

---

*This document describes research/POC work. Results are not suitable for operational use without human review.*
