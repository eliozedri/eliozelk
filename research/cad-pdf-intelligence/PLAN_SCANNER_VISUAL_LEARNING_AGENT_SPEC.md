# Plan Scanner — Visual Learning Agent Spec (Engine C)

**Date:** 2026-05-22 (updated 2026-05-23 — strategic pivot to Manual Onboarding)
**Status:** Research-only. No production UI/DB/flows changed.
**Predecessors:** Engine A (vector/CAD-PDF, scripts 01–34), Engine B (image-based, script 35)
**This document is the canonical reference for Engine C.**

> ## ⚠ Strategic Pivot — 2026-05-23
>
> The fully-automatic detection POC (`36_visual_learning_agent_poc.py` v0.1.1, commit `fc99f5a`) was **validated and found not reliable enough** to serve as the primary detection path. On the test plan, the top 20 pole candidates produced too many uncertain or wrong items even at confidence ≥ 0.85. Template matching on a single training point is not sufficient to bootstrap detection on a new plan style.
>
> **New primary direction: Manual Onboarding / Human-Trained Visual Agent (Engine C v0.2).** Instead of expecting the agent to read the plan on its own, the user is walked through a guided **7-step wizard** to manually mark examples. The agent extracts rules from those markings, finds similar items, and asks the user to confirm/correct. CAPTCHA-style.
>
> See new **Section 4.5 — Manual Onboarding / Human-Trained Visual Agent** for the canonical workflow. The fully-automatic POC (v0.1.1) remains in the repo but is **not the primary path** and its accuracy claims are explicitly downgraded.
>
> POC for the manual workflow: `37_manual_visual_training_poc.py`

> **Core principle:** Engine C is a *human-trained visual agent*, not an automated detector. The user teaches the agent by marking examples on the plan image. The agent learns rules from those markings and applies them to find similar elements. When uncertain, it asks the user a focused question. This is the foundational direction documented in [PLAN_SCANNER_IMAGE_BASED_ENGINE_SPEC.md §9](PLAN_SCANNER_IMAGE_BASED_ENGINE_SPEC.md) — Engine C is the production-track implementation of that principle.

---

## 1. Product Concept

A human-trained visual agent for reading traffic plans. The agent does not solve everything automatically on day one. It progressively learns from human markings — similar in concept to CAPTCHA-style learning — and improves over time as more examples accumulate.

**The cycle:**

```
visual plan → user marks examples → agent learns pattern
            → agent finds more candidates → user confirms/corrects
            → agent improves on next plan
```

**Why this approach:**

1. Real traffic plans vary in style across municipalities, contractors, and CAD authors. No single fixed detector handles them all.
2. Pure ML training would require thousands of labeled plans we do not yet have.
3. A human-in-the-loop rule-learning system starts useful with **one example per category** and gets sharper with each correction.
4. The output is **inspectable and explainable** — every candidate traces back to specific user markings, not opaque model weights.

---

## 2. Engine Architecture (Three Engines)

| Engine | Approach | Role | Status |
|---|---|---|---|
| **Engine A** | Vector/CAD-PDF parsing (scripts 01–34) | Production scanner; extracts geometry from PDF objects | Shipped |
| **Engine B** | Image-based detection (script 35) | Parallel research engine; renders PDF as raster and runs CV/OCR | POC v0.3 (zone mode shipped 2026-05-22) |
| **Engine C** | Human-trained visual learning agent (script 36) | This document; rule-based learning from user markings | POC v0.1 (this spec) |

**Eventual roles:**
- Engine A: Fast pass when CAD structure is clean
- Engine B: Validation layer and fallback when CAD structure is missing
- **Engine C: Visual teaching mode** — used to bootstrap detection on new plan styles, then its learned rules feed both Engine B and Engine A's confidence layer
- Combined mode: cross-validation between all three; agreement boosts confidence, disagreement flags for review

---

## 3. Supported Inputs

**PDF input:**
- Render selected page to flat 2D image at user-chosen DPI (default 150)
- Treat the rendered image as the input — do NOT rely on PDF vector internals
- This ensures Engine C works on flattened/scanned/raster-overlay PDFs

**Direct image input:**
- Accept PNG/JPG/TIFF directly
- Process as plan image without rendering step

**Multi-page:**
- Each page is treated as a separate image
- Training examples are page-scoped within a plan
- Project-level rules can apply across pages

---

## 4. Annotation Types

Every user marking is one of these types. Each becomes a structured training example.

| Type | Geometry | What it means | Example user prompt |
|---|---|---|---|
| `pole_dot` | point | "This dot is a sign pole" | "סמן לי איפה אתה רואה עמוד תמרור" |
| `tick_mark` | line/short segment | "This short line is a tick mark on a pole" | "סמן לי את הסימון שמייצג קו/טיק ליד עמוד" |
| `sign_symbol` | rectangle or polygon | "This shape is a sign symbol" | "סמן לי את צורת התמרור הזה" |
| `sign_code_text` | rectangle | "This text region is a sign code" | "סמן לי את מספר התמרור שצמוד לעמוד הזה" |
| `sign_assembly` | rectangle/polygon (multi-element) | "This cluster is one pole+sign(s) assembly" | "סמן לי קבוצת עמוד+תמרורים" |
| `ignore_region` | rectangle | "Ignore everything in this region (legend, notes, frame)" | "סמן לי אזור שהוא רעש/רקע" |
| `wrong_detection` | rectangle around an existing candidate | "This candidate the agent found is wrong" | "סמן את הזיהוי השגוי" |
| `related_code_to_pole` | two points (pole + code) | "This code belongs to this pole" | "האם המספר הזה שייך לתמרור הזה?" |
| `number_of_signs_on_pole` | one point (pole) + integer | "This pole has N signs on it" | "כמה תמרורים מותקנים על העמוד הזה?" |

**Marking primitives the UI must support:**
- Point (x, y)
- Rectangle (x0, y0, x1, y1)
- Polygon (list of (x, y) vertices)
- Line/segment (x0, y0, x1, y1)
- Association (linking two existing markings together)

---

## 4.5 Manual Onboarding / Human-Trained Visual Agent (PRIMARY PATH — added 2026-05-23)

> This section supersedes Section 5 as the primary workflow. Section 5 is retained for the conceptual loop but the operational entry point is now the wizard defined here.

### 4.5.1 Why this is the primary path now

The v0.1.1 automatic POC produced 240 pole candidates, 45 sign code candidates, and 17 associations from 9 hand-authored training examples. Human spot-check found too many of those candidates were wrong — even at high confidence (≥ 0.85). The agent cannot reliably bootstrap from sparse user markings via pure pixel-similarity template matching.

The correct framing: **do not ask the system to detect on its own.** Ask the user to teach it, step by step, what each object looks like on **this specific plan**. Detection runs only AFTER teaching is complete. The user always sees and approves what the agent found.

This is similar to CAPTCHA training: the user labels concrete visual examples, and the system learns patterns from them — not from training data, not from general models.

### 4.5.2 The 7-Step Wizard

Each step has a Hebrew + English prompt, a `label_type`, an expected `geometry_type`, and a min/max number of examples the user should provide before advancing. The wizard tracks completion in `wizard_state.json`.

| # | Step ID | label_type | Geometry | Min | Prompt (HE) | Prompt (EN) |
|---|---|---|---|---|---|---|
| 1 | `step_1_pole_marker` | `pole_dot` | point | 3 | "סמן 3–5 דוגמאות של עמודי תמרור בתוכנית." | "Mark 3–5 examples of sign poles in the plan." |
| 2 | `step_2_tick_marks` | `tick_mark` | line | 2 | "סמן דוגמאות של קווים קטנים ליד עמוד שמייצגים תמרורים על אותו עמוד." | "Mark examples of short lines near a pole that represent signs on that pole." |
| 3 | `step_3_sign_codes` | `sign_code_text` | rectangle | 2 | "סמן מספרי תמרורים שמופיעים ליד עמודים." | "Mark sign code numbers that appear near poles." |
| 4 | `step_4_associations` | `code_to_pole_association` | association | 1 | "חבר בין עמוד למספר התמרור ששייך אליו." | "Link a pole to the sign code number that belongs to it." |
| 5 | `step_5_ignore_regions` | `ignore_region` | rectangle | 1 | "סמן אזורים שלא צריך לנתח: כותרת, מקרא, טבלאות, מסגרות, רעש." | "Mark regions to ignore: title block, legend, tables, frame, noise." |
| 6 | `step_6_apply_pattern` | — | (system) | — | "החל את הדפוס הנלמד וחפש מועמדים דומים." | "Apply the learned pattern and search for similar candidates." |
| 7 | `step_7_review` | — | (system) | — | "סקור את המועמדים שנמצאו ואשר/דחה כל אחד." | "Review the found candidates and approve/reject each one." |

Steps 1–5 are **user-driven** (manual marking). Steps 6–7 are **system-driven** (detection + review queue). The wizard advances only when the previous step's `min_examples` is met.

### 4.5.3 What the system learns from steps 1–5

After steps 1–5 complete, the rule extractor derives:

- **From pole_dot examples**: average dot size, contrast against background, circularity, pixel patch template
- **From tick_mark examples**: average tick length, orientation distribution, typical tick→pole distance (paired with associated pole), padded line patch
- **From sign_code_text examples**: bounding box size range, pixel patch of the digit string, typical code→pole distance and direction (paired via Step 4)
- **From code_to_pole_associations**: average distance, preferred direction, direction tolerance
- **From ignore_region**: exclusion polygons applied during detection

The rules are written to `visual_learning_rules.json` so they can be inspected, edited, or carried forward to future scans of the same project.

### 4.5.4 What the system does in step 6

Only after the user finishes steps 1–5, step 6 runs:

1. Render the plan page as image (if not already)
2. Apply ignore regions as exclusion mask
3. For each learned rule (pole, tick, code): run pixel-similarity search across the page
4. Drop tick candidates whose nearest pole is outside the learned tick→pole distance range
5. Form associations using the learned code→pole distance and direction
6. Score each candidate (template match × association presence)
7. Emit:
   - High-confidence candidates → accepted (still pending human review for BOQ)
   - Low-confidence candidates → review questions with evidence crops

### 4.5.5 What the user does in step 7

Step 7 presents the candidates one at a time as evidence crops with HE/EN questions:

- "האם זו נקודת עמוד תמרור?" / "Is this a sign pole point?"
- "האם המספר הזה שייך לעמוד/לתמרור?" / "Does this number belong to the pole/sign?"
- "האם השיוך הזה בין עמוד/מספר/תמרור נכון?" / "Is this pole/code/sign assembly correct?"

For each, the user answers from the predefined `allowed_answers` list, OR adds a new training example (e.g. marks a new pole the system missed, or marks a wrong detection). Each answer is appended to the training examples file so the next run of step 6 starts with more information.

### 4.5.6 Wizard state file

`wizard_state.json` tracks where the user is in the process:

```json
{
  "schema_version": "1.0",
  "wizard_version": "1.0",
  "plan_id": "...",
  "page_number": 0,
  "current_step": "step_3_sign_codes",
  "steps_completed": ["step_1_pole_marker", "step_2_tick_marks"],
  "steps_per_count": {
    "step_1_pole_marker": 4,
    "step_2_tick_marks": 3,
    "step_3_sign_codes": 0
  },
  "ready_for_apply": false,
  "last_updated": "2026-05-23T..."
}
```

The wizard is **resumable** — the user can leave and come back, and step 6 only runs when all of 1–5 are complete (or partial mode with a warning).

### 4.5.7 Hard rules (unchanged from §13)

- Human teaching improves detection only — **NOT** BOQ approval
- Agent never guesses silently — uncertainty → evidence crop + review question
- All rules scoped `current_plan_only` by default; promotion is explicit
- All candidates traceable to specific training examples

### 4.5.8 What this section supersedes

Section 5 ("User Teaching Workflow") remains as the high-level conceptual loop. The operational entry point is now this section's wizard. Section 14 ("POC Implementation, script 36") is retained but its POC is marked v0.1.1 — superseded by `37_manual_visual_training_poc.py` (Engine C v0.2).

---

## 5. User Teaching Workflow

```
1. User uploads PDF or image
2. System renders/loads as 2D image
3. System shows the image in the marking UI
4. Agent asks first training prompts:
     - "סמן לי איפה אתה רואה עמוד תמרור"
     - "סמן לי עמוד שיש עליו תמרור אחד"
     - "סמן לי עמוד שיש עליו שני תמרורים"
     - "סמן לי את מספר התמרור שצמוד לעמוד הזה"
     - "סמן לי את הסימון שמייצג קו/טיק ליד עמוד"
     - "סמן לי אזור שהוא רעש/רקע ולא צריך להתייחס אליו"
5. User marks on the plan (point/rect/polygon/line/association)
6. System saves each marking as a structured training example
7. Agent extracts a template/rule per label_type from the marking
8. Agent searches the rest of the page for similar candidates
9. For each candidate:
     - high confidence → present as draft detection
     - low confidence → generate evidence crop + visual question
10. User confirms / corrects / marks more examples
11. Agent re-runs detection with the updated rule set
12. Loop until user is satisfied
13. (Optional) User promotes a rule to project_rule scope
14. (Optional) Admin later promotes to company_rule_approved
```

**Critical:** The agent must NEVER guess silently. Uncertainty → evidence crop → review question. This is the same non-negotiable rule from Engine B spec §9.

---

## 6. Evidence Crop Workflow

For every candidate the agent finds with confidence below threshold (default 0.7):

1. Compute bounding box including the candidate + 20px padding
2. Crop the image at this box
3. Draw the candidate's geometry on the crop (colored bbox/point)
4. Save crop to `outputs/visual_learning_agent/evidence_crops/{candidate_id}.png`
5. Emit a structured review question referencing this crop
6. Include the crop in `visual_review_questions.json`
7. UI displays crop next to the question; user answers in one click

---

## 7. Learning Scopes

Every training example and every learned rule has an explicit scope. Scopes are **never** auto-promoted.

| Scope | Meaning | Promoted by |
|---|---|---|
| `current_plan_only` | Default. Rule applies only to this plan. Lost when plan archived. | Auto (default) |
| `project_rule` | Rule applies to all plans in the same project (multi-PDF projects). | User explicit action |
| `company_rule_candidate` | User flags rule as a candidate for company-wide application. Pending review. | User explicit action |
| `company_rule_approved` | Reviewed and approved by admin as a global detection rule. | Admin-only gate |

Promotion path: `current_plan_only` → `project_rule` → `company_rule_candidate` → `company_rule_approved`

Each step requires an explicit user/admin action. This prevents one anomalous plan from polluting global detection.

---

## 8. Data Schemas

### 8.1 `visual_training_examples.json`

Hand-authored or UI-produced. The POC consumes this directly.

```json
{
  "schema_version": "1.0",
  "plan_id": "poc_plan_50_448_02_400_20260520_223259",
  "page_number": 0,
  "image_dpi": 150,
  "image_path": "outputs/visual_learning_agent/page_0_150dpi.png",
  "examples": [
    {
      "training_example_id": "te_001",
      "label_type": "pole_dot",
      "label_value": "pole",
      "marking_geometry": {
        "type": "point",
        "x": 1234,
        "y": 567,
        "radius": 8
      },
      "associated_objects": [],
      "user_answer": "yes, this is a pole",
      "confidence_source": "human_labeled",
      "scope": "current_plan_only",
      "created_at": "2026-05-22T23:30:00",
      "audit_notes": ""
    },
    {
      "training_example_id": "te_002",
      "label_type": "tick_mark",
      "label_value": "tick",
      "marking_geometry": {
        "type": "line",
        "x0": 1240, "y0": 560,
        "x1": 1252, "y1": 560
      },
      "associated_objects": ["te_001"],
      "user_answer": "tick mark for the pole at te_001",
      "confidence_source": "human_labeled",
      "scope": "current_plan_only",
      "created_at": "2026-05-22T23:30:15",
      "audit_notes": ""
    },
    {
      "training_example_id": "te_003",
      "label_type": "ignore_region",
      "label_value": "title_block",
      "marking_geometry": {
        "type": "rectangle",
        "x0": 8500, "y0": 4800,
        "x1": 9400, "y1": 5300
      },
      "associated_objects": [],
      "user_answer": "this is the title block; do not detect signs here",
      "confidence_source": "human_labeled",
      "scope": "current_plan_only",
      "created_at": "2026-05-22T23:30:30",
      "audit_notes": ""
    }
  ]
}
```

### 8.2 `visual_learning_rules.json`

Derived from training examples. Each rule is what the agent extracted from one or more examples.

```json
{
  "schema_version": "1.0",
  "plan_id": "...",
  "page_number": 0,
  "rules": [
    {
      "rule_id": "r_pole_001",
      "label_type": "pole_dot",
      "derived_from_examples": ["te_001", "te_004", "te_007"],
      "scope": "current_plan_only",
      "template": {
        "kind": "image_patch",
        "patch_path": "outputs/visual_learning_agent/templates/r_pole_001.png",
        "patch_size_px": [16, 16],
        "expected_pixel_intensity_range": [0, 80],
        "expected_circularity": 0.7,
        "expected_size_range_px": [3, 12]
      },
      "association_rule": null,
      "min_match_score": 0.65,
      "created_at": "2026-05-22T23:31:00"
    },
    {
      "rule_id": "r_assoc_001",
      "label_type": "related_code_to_pole",
      "derived_from_examples": ["te_005"],
      "scope": "current_plan_only",
      "template": null,
      "association_rule": {
        "from_label": "pole_dot",
        "to_label": "sign_code_text",
        "max_distance_px": 120,
        "preferred_direction": "right",
        "direction_tolerance_deg": 45
      },
      "min_match_score": null,
      "created_at": "2026-05-22T23:31:10"
    }
  ]
}
```

### 8.3 `visual_review_questions.json`

Emitted by the agent for low-confidence candidates.

```json
{
  "schema_version": "1.0",
  "plan_id": "...",
  "page_number": 0,
  "questions": [
    {
      "review_question_id": "q_001",
      "candidate_id": "vac_p0_c042",
      "question_type": "is_pole",
      "question_text_he": "האם הנקודה הזו היא עמוד תמרור?",
      "question_text_en": "Is this dot a sign pole?",
      "evidence_crop_path": "outputs/visual_learning_agent/evidence_crops/vac_p0_c042.png",
      "crop_bbox": [1230, 560, 1290, 600],
      "system_guess": "pole",
      "confidence": 0.42,
      "matched_rule_ids": ["r_pole_001"],
      "allowed_answers": ["yes_pole", "no_noise", "no_dimension_mark", "other"],
      "created_at": "2026-05-22T23:32:00",
      "user_answer": null,
      "correction_status": "pending"
    }
  ]
}
```

### 8.4 `visual_agent_candidates.json`

The agent's detection output after applying learned rules.

```json
{
  "schema_version": "1.0",
  "plan_id": "...",
  "page_number": 0,
  "image_path": "...",
  "candidates": [
    {
      "candidate_id": "vac_p0_c001",
      "candidate_type": "pole_candidate",
      "bbox": [1234, 567, 1250, 583],
      "centroid": [1242, 575],
      "geometry": {"type": "point", "x": 1242, "y": 575, "radius": 8},
      "evidence_crop_path": "outputs/visual_learning_agent/evidence_crops/vac_p0_c001.png",
      "system_guess": "pole",
      "confidence": 0.91,
      "learned_from_examples": ["te_001", "te_004"],
      "matched_rule_ids": ["r_pole_001"],
      "associated_candidates": ["vac_p0_c042"],
      "requires_review": false,
      "review_question": null,
      "audit_notes": []
    }
  ]
}
```

---

## 9. Candidate Schema (Unified)

Every candidate Engine C produces has these fields:

| Field | Type | Meaning |
|---|---|---|
| `candidate_id` | string | Unique within page (e.g. `vac_p0_c042`) |
| `candidate_type` | enum | `pole_candidate` \| `tick_candidate` \| `sign_symbol_candidate` \| `sign_code_candidate` \| `assembly_candidate` |
| `page_number` | int | 0-based page index |
| `bbox` | `[x0, y0, x1, y1]` | Bounding box in page-pixel coords |
| `centroid` | `[cx, cy]` | Center of mass |
| `geometry` | object | Type-specific shape (`point`, `rectangle`, `polygon`, `line`) |
| `evidence_crop_path` | string | Relative path to the candidate's evidence crop PNG |
| `system_guess` | string | The agent's best label for this candidate |
| `confidence` | float 0–1 | Match score from rule application |
| `learned_from_examples` | string[] | Training example IDs that contributed |
| `matched_rule_ids` | string[] | Rule IDs that produced this candidate |
| `associated_candidates` | string[] | Other candidate_ids linked by association rules |
| `requires_review` | bool | `confidence < 0.7` or unresolved association |
| `review_question` | string\|null | If `requires_review`, the question_id |
| `audit_notes` | string[] | Any anomalies or notes worth preserving |

---

## 10. Association Logic

The agent must learn and infer relations between candidates. The minimum association set:

| Relation | Learned from | Inferred output |
|---|---|---|
| pole → tick marks | `tick_mark` examples with `associated_objects: [pole_id]` | For each detected pole, search radius for short line segments; estimate tick count |
| pole → sign code | `related_code_to_pole` example | For each pole, search nearby OCR text matching code pattern; pick nearest |
| pole → sign count | `number_of_signs_on_pole` examples | Average tick count → sign count mapping |
| pole → sign symbol | proximity rules from `sign_symbol` examples | For each pole, search radius for shape candidates |
| ignore region | `ignore_region` examples | Drop any candidate whose bbox intersects |
| wrong detection | `wrong_detection` examples | Lower min_match_score for that template; or carve out negative example |

The agent should track each candidate's confidence as the **product** of template match score and association strength.

---

## 11. UI Concept (future-only — not built in POC)

The marking UI must support:

- **Image viewer** with zoom/pan (50%–800%)
- **Marking tools**: point, rectangle, polygon, line, association linker
- **Question panel**: shows agent's current question + evidence crop, with one-click answer buttons
- **Teach Agent mode**: agent prompts user to mark examples sequentially
- **Apply Learned Pattern button**: re-run detection with current rule set
- **Review candidate list**: paginated list of `requires_review` candidates with thumbnails
- **Scope selector**: per-rule promotion (current_plan / project / company_candidate)
- **Audit panel**: shows training example provenance for each detected candidate

UI is explicitly out of scope for the POC. The POC consumes a JSON file as a stand-in.

---

## 12. Comparison with Engines A and B

When Engine C runs alongside Engine A and Engine B:

| Scenario | Action |
|---|---|
| All three engines agree on a candidate | Confidence boosted to 0.95+; auto-flag as "high confidence", still does NOT auto-approve BOQ |
| Engine A + Engine C agree, Engine B missed | Confidence 0.85; mark `engine_b_missed: true` |
| Engine B + Engine C agree, Engine A missed | Confidence 0.85; mark `engine_a_missed: true` |
| Only Engine C found it (no agreement) | `requires_review: true`; high priority for user check |
| Engine A or B found it, Engine C missed | `requires_review: true`; possible gap in user's training |
| All three disagree | `requires_review: true`; highest priority |

The comparison layer is documented but **not implemented in this POC**.

---

## 13. Safety Rules (Non-Negotiable)

1. **Human teaching improves detection only** — it does NOT auto-approve BOQ.
2. **BOQ approval remains a separate workflow** with its own gate.
3. **No DB migrations** in this research phase.
4. **No production UI changes** in this research phase.
5. **No paid API** anywhere in Engine C.
6. **No permanent source archive** of uploaded plans by default.
7. **No silent promotion** of rules to wider scopes.
8. **No silent guessing** by the agent — uncertainty → review question.
9. **No automatic BOQ generation** from Engine C output alone.
10. **All candidates traceable** to specific training examples (`learned_from_examples`).

---

## 14. POC Implementation

> ### Status as of 2026-05-23
>
> | POC | File | Status |
> |---|---|---|
> | **v0.2 — Manual Onboarding Wizard (PRIMARY)** | `37_manual_visual_training_poc.py` | New primary path. Reads wizard-organized examples, validates per-step completeness, applies rules only after teaching, emits review queue. **Use this.** |
> | v0.1.1 — Automatic detection (DOWNGRADED) | `36_visual_learning_agent_poc.py` | Retained for reference. **Not reliable enough** to use as primary detector — validation found too many false positives even at high confidence. Useful as a comparison baseline only. |
>
> The remainder of this section describes the v0.1.1 POC (kept for historical completeness). For the current direction see Section 4.5 and the script 37 documentation in its file header.

### 14.1 Script 36 (v0.1.1) — automatic detection, superseded

**File:** `research/cad-pdf-intelligence/36_visual_learning_agent_poc.py`

**Scope of POC v0.1:**
- Load a plan image (rendered from PDF or direct image)
- Load `visual_training_examples.example.json`
- For each training example, extract a rule:
  - `pole_dot`: small image patch around marked point → template
  - `tick_mark`: short line patch → template
  - `sign_code_text`: rectangle crop → OCR target + template
  - `ignore_region`: rectangle → exclusion polygon
  - `related_code_to_pole`: distance + direction rule between two markings
- Apply rules to the rest of the page:
  - Template matching via `cv2.matchTemplate(TM_CCOEFF_NORMED)` for image-patch rules
  - Spatial filtering for ignore regions
  - Association inference for code-to-pole
- For each detected candidate:
  - Compute confidence (template match score × association score)
  - Generate evidence crop
  - If `confidence < 0.7`: emit review question
- Write outputs:
  - `visual_agent_candidates.json`
  - `visual_review_questions.json`
  - `visual_learning_rules.json`
  - `evidence_crops/` directory
  - `visual_learning_agent_report.md` and `.html`

**Out of POC v0.1:**
- ML training of any kind (no PyTorch, no model fitting)
- Real UI marking tools (POC reads sample JSON instead)
- Multi-page handling (single page only)
- Cross-plan rule promotion (`project_rule` and above are documented, not implemented)
- Engine A/B/C cross-validation layer

**Honest framing:**
This is a **rule-based human-taught learning POC**, not a trained AI. The agent learns one template per category from one or more user examples. It does not generalize beyond pixel-similarity and proximity rules at this stage. ML-based generalization is a Phase 2 goal once enough labeled examples accumulate.

---

## 15. Files Created / Modified by this Track

| File | Status | Role |
|---|---|---|
| `PLAN_SCANNER_VISUAL_LEARNING_AGENT_SPEC.md` | NEW (this document) | Canonical Engine C spec |
| `36_visual_learning_agent_poc.py` | NEW | POC script |
| `visual_training_examples.example.json` | NEW | Sample annotations for POC |
| `PLAN_SCANNER_IMAGE_BASED_ENGINE_SPEC.md` | UPDATED | Cross-reference to Engine C |
| `memory/project_image_scanner_learning_loop.md` | UPDATED | Engine C linked as production track |
| `memory/MEMORY.md` | UPDATED | Index entry for Engine C spec |

---

## 16. Next Steps (Beyond POC v0.1)

1. **Real marking UI** — image viewer + point/rect/polygon/line + association linker. Probably a Next.js component using a canvas library (Konva, Fabric, or custom).
2. **Persist training examples per plan** — initially as JSON files alongside the run dir; later as a DB table once UI exists.
3. **Multi-page support** — extend `visual_training_examples.json` schema to handle page index per example.
4. **Project-level rule promotion** — UI affordance for "apply this rule to all plans in project X".
5. **Cross-validation layer** — combine Engine A, B, C outputs into a unified candidate list with agreement scores.
6. **ML upgrade path** — once N≥500 labeled examples accumulate per category, train a small classifier and use it as an additional rule.
7. **Active learning loop** — agent prioritizes which candidates to ask about next based on which would reduce overall uncertainty most (instead of just confidence < 0.7).

---

*This document describes a research direction. No production behavior is changed. All POC outputs require human review before any operational use.*
