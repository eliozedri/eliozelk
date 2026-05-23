# Plan Scanner — Manual Training Agent Spec (Engine C v0.3)

**Date:** 2026-05-23
**Status:** Research-only. No production UI/DB/flows changed.
**Canonical reference for the Manual-First Human-Trained Visual Agent strategy.**
**Supersedes (as primary path):** automatic detection in scripts 35, 36, 37 v0.1–v0.2.

> ## Manual-First Human-Trained Visual Agent Strategy
>
> **Current automatic detection is not reliable enough for practical use.** The image-based automatic candidate detection (Engine B and Engine C v0.1–v0.2) produced too many uncertain candidates, and the confidence numbers were not human-validated. Continuing to optimize automatic detection without a teaching signal from the user is wasted work.
>
> **The new direction is manual-first training.** The system is built as a learning agent that the user/engineer trains gradually, similar in principle to CAPTCHA-style training: the user marks examples, the system learns the pattern, then finds more similar items, then the user confirms/corrects, and the agent improves over time.
>
> **Target outputs are narrowed to three only:**
>
> 1. **Pole / עמוד** — where a traffic sign pole exists on the plan
> 2. **Number of signs on the pole / כמות תמרורים על עמוד** — how many signs are mounted on each pole
> 3. **Which sign / איזה תמרור** — the traffic sign code/number, or its visual symbol, associated with each pole
>
> No full BOQ, no road markings, no guardrails, no broad element decomposition in this new approach yet. Three outputs only. The user teaches the agent with 5–10 examples per object type. The agent learns rules from examples. The agent detects similar candidates. The user confirms/corrects. Rules improve over time.
>
> Slow and manual at first. **That is okay.** We prefer a slower reliable training process over a fast unreliable automatic detector.

---

## 1. Engine Architecture (three engines, this spec covers Engine C)

| Engine | Approach | Status (2026-05-23) |
|---|---|---|
| **Engine A** | Vector/CAD-PDF parsing (scripts 01–34) | Production |
| **Engine B** | Image-based automatic detection (script 35) | Research-only. Validated; useful for tile/zone runtime measurements; not reliable enough as a primary detector. |
| **Engine C v0.1–v0.2** | Earlier visual-learning POCs (scripts 36, 37) | Retained for comparison; superseded as primary by this spec. |
| **Engine C v0.3 (THIS SPEC)** | **Manual-First Human-Trained Visual Agent** | **Primary research direction.** Manual teaching wizard, narrow scope (3 outputs), rule-based learning from user markings. |

The other engines stay. They are useful for cross-validation and as fallbacks. They are NOT the primary path.

---

## 2. Inputs (PDF or image)

**PDF input:**
- Render selected page as a flat 2D image (default 150 DPI)
- Treat the rendered image visually, like a printed plan
- Do NOT rely primarily on CAD layers or vector internals

**Direct image input:**
- Accept PNG/JPG/TIFF directly
- Process as the plan image without rendering step

For both: the rendered/loaded image is the only thing the agent sees. Everything else is what the user teaches it.

---

## 3. The Manual Teaching Wizard (9 steps)

| # | Step ID | What user does | Min examples |
|---|---|---|---|
| 1 | `step_1_upload_plan` | Upload PDF/image; system renders page | — |
| 2 | `step_2_teach_pole_appearance` | Click 5–10 pole examples | **5** |
| 3 | `step_3_teach_sign_count` | Mark 5–10 examples of how the plan shows sign count (ticks/short lines near pole) | **5** |
| 4 | `step_4_teach_sign_code` | Box around 5–10 sign code number examples near poles | **5** |
| 5 | `step_5_teach_sign_symbol` | (Optional) Box around 5–10 visual sign symbols | **0** (skip allowed) |
| 6 | `step_6_teach_associations` | Link pole → code, pole → symbol, pole → sign count | **1** per relation used |
| 7 | `step_7_apply_learning` | (system) Scan rest of page for similar patterns | — |
| 8 | `step_8_review_results` | Approve / reject / correct each candidate; mark missed items | — |
| 9 | `step_9_save_learning` | Save rules at chosen scope | — |

**Honesty prompts the wizard must show:**

- "אני צריך שתלמד אותי איך נראה עמוד בתוכנית הזו."
- "אני צריך שתסמן לי דוגמאות."
- "אחרי הדוגמאות אחפש דפוסים דומים."
- "התוצאות דורשות אישור."

The wizard tracks completion in `wizard_state.json`. It is **resumable**: the user can leave and come back; step 7 only runs when steps 2–4 have enough examples (step 5 is optional).

### 3.1 Per-step prompts (HE/EN)

| Step | Hebrew prompt | English prompt |
|---|---|---|
| 2 — pole | "סמן 5–10 דוגמאות של עמודי תמרור בתוכנית." | "Mark 5–10 examples of sign poles in the plan." |
| 3 — sign count / ticks | "סמן 5–10 דוגמאות שמראות איך התוכנית מציינת כמה תמרורים נמצאים על עמוד." | "Mark 5–10 examples of how the plan indicates how many signs are on a pole." |
| 4 — sign code | "סמן 5–10 דוגמאות של מספרי תמרורים ליד עמודים." | "Mark 5–10 examples of sign code numbers near poles." |
| 5 — sign symbol | "סמן 5–10 דוגמאות של הסימון הגרפי של התמרור עצמו, אם הוא מופיע בתוכנית." | "Mark 5–10 examples of the sign's visual symbol, if it appears on the plan." |
| 6 — associations | "חבר בין עמוד למספר התמרור / סימון תמרור / כמות תמרורים שלו." | "Link a pole to its sign code / sign symbol / sign count." |

---

## 4. Annotation Types (label_type catalog)

| label_type | Geometry | Meaning |
|---|---|---|
| `pole_dot` | point | This dot is a sign pole |
| `sign_count_tick` | line/box | A short line near a pole indicating one sign on that pole |
| `sign_code_text` | rectangle | A sign code number near a pole |
| `sign_symbol` | rectangle/polygon | A graphic sign symbol on the plan |
| `pole_to_code_association` | association (pole↔code) | This code belongs to this pole |
| `pole_to_symbol_association` | association (pole↔symbol) | This symbol belongs to this pole |
| `number_of_signs_on_pole` | point + integer | Assertion that this pole has N signs |
| `ignore_region` | rectangle | Exclude this area from detection (legend, title block, notes, frame) |
| `wrong_detection` | rectangle around an existing candidate | Reject this candidate; treat as negative example |
| `noise_background` | rectangle | Mark a region as background noise; never propose detections here |

**Marking primitives required:** point, rectangle, line, polygon, association linker (click-pole-then-click-target).

---

## 5. Data Schemas

### 5.1 `visual_training_examples.json` (schema v3.0)

```json
{
  "schema_version": "3.0",
  "engine": "engine_c_v0.3_manual_first",
  "plan_id": "...",
  "page_number": 0,
  "image_dpi": 150,
  "image_path": "...",
  "wizard_state": {
    "current_step": "step_7_apply_learning",
    "steps_completed": ["step_2_...", "step_3_...", "step_4_...", "step_6_..."],
    "ready_for_apply": true
  },
  "examples": [
    {
      "training_example_id": "te_pole_001",
      "run_id": "...",
      "page_number": 0,
      "image_path": "outputs/manual_training/page_0_150dpi.png",
      "crop_path": "outputs/manual_training/example_crops/te_pole_001.png",
      "label_type": "pole_dot",
      "label_value": "pole",
      "geometry_type": "point",
      "geometry": {"type": "point", "x": 2952, "y": 1330, "radius": 8},
      "associated_objects": [],
      "user_notes": "first pole shown to the agent",
      "confidence_source": "human_labeled",
      "scope": "current_plan_only",
      "created_at": "2026-05-23T...",
      "audit_notes": ""
    }
  ]
}
```

### 5.2 `visual_learning_rules.json`

```json
{
  "schema_version": "1.0",
  "plan_id": "...",
  "rules": [
    {
      "rule_id": "r_pole_001",
      "source_examples": ["te_pole_001", "te_pole_002", "te_pole_003", "te_pole_004", "te_pole_005"],
      "rule_type": "pole_marker_rule",
      "visual_features": {
        "template_patch_paths": ["..."],
        "avg_size_px": 16,
        "min_match_score": 0.65
      },
      "geometric_features": {
        "expected_circularity": null,
        "expected_intensity_range": null
      },
      "association_radius_px": null,
      "confidence": 0.0,
      "scope": "current_plan_only",
      "created_from_user_training": true,
      "requires_review": true,
      "audit_notes": []
    }
  ]
}
```

**Rule types:** `pole_marker_rule`, `tick_count_rule`, `sign_code_text_rule`, `sign_symbol_rule`, `pole_to_code_association_rule`, `pole_to_symbol_association_rule`, `ignore_region_rule`, `noise_background_rule`.

### 5.3 `visual_agent_candidates.json`

```json
{
  "schema_version": "1.0",
  "validation_status": "Algorithmic POC output — NOT human validated.",
  "plan_id": "...",
  "candidates": [
    {
      "candidate_id": "vac_p0_c0001",
      "candidate_type": "pole_candidate",
      "page_number": 0,
      "bbox": [x0, y0, x1, y1],
      "geometry": {"type": "point", "x": ..., "y": ..., "radius": 8},
      "matched_rule_ids": ["r_pole_001"],
      "matched_training_examples": ["te_pole_001", "te_pole_002"],
      "system_guess": "pole",
      "confidence": 0.91,
      "evidence_crop_path": "outputs/manual_training/evidence_crops/vac_p0_c0001.png",
      "requires_review": false,
      "review_question": null,
      "user_answer": null,
      "status": "pending_review",
      "audit_notes": []
    }
  ]
}
```

**Status values:** `pending_review` (default), `accepted`, `rejected`, `corrected`.

### 5.4 `visual_review_questions.json`

```json
{
  "schema_version": "1.0",
  "questions": [
    {
      "review_question_id": "q_vac_p0_c0042",
      "candidate_id": "vac_p0_c0042",
      "question_he": "האם זו נקודת עמוד תמרור?",
      "question_en": "Is this a sign pole point?",
      "evidence_crop_path": "outputs/manual_training/evidence_crops/vac_p0_c0042.png",
      "allowed_answers": ["yes_pole", "no_noise", "no_dimension_mark", "other"],
      "correction_options": ["mark_new_pole_nearby", "mark_as_noise_region"],
      "scope_options": ["current_plan_only", "project_rule", "company_rule_candidate"],
      "answered": false,
      "user_answer": null,
      "audit_notes": []
    }
  ]
}
```

---

## 6. Learning Logic (rule-based, NOT ML training)

After the user marks examples in steps 2–6, extract simple patterns:

| From these examples | Extract |
|---|---|
| pole_dot examples | avg dot size, image patch templates, contrast bracket |
| sign_count_tick examples | tick length, orientation, **typical tick→pole distance** (paired via associations) |
| sign_code_text examples | code crop size range, image patch templates, **typical code→pole distance + direction** |
| sign_symbol examples | symbol bbox size range, image patch templates, **typical symbol→pole distance** |
| pole_to_code_association | avg distance + preferred direction angle + tolerance |
| pole_to_symbol_association | avg distance + preferred direction angle + tolerance |
| number_of_signs_on_pole | mapping from tick count → sign count |
| ignore_region | exclusion polygons (drop any candidate inside) |
| wrong_detection | negative examples (lower confidence for similar patches; or carve out) |
| noise_background | exclusion zones for any detection |

Then apply rules to find candidates that answer only the three target outputs:

1. **Where is each pole?** (pole_candidate list)
2. **How many signs are on each pole?** (tick count near each pole)
3. **What sign code or symbol is associated with each pole?** (associated code/symbol candidates)

No automatic BOQ. No operational approval. Everything stays `pending_review` until human approval.

---

## 7. Detection → Review → Correction Loop

```
For each candidate the agent finds:
  if confidence >= review_threshold:
      status = "pending_review"  (still requires human)
      no review question
  else:
      generate evidence crop
      generate review question (HE/EN with allowed_answers)

User opens the review queue:
  for each question:
      answer yes / no / correction
      OR add new training example (mark missed pole, mark new ignore region, etc.)

If user adds new examples:
  re-extract rules (now richer)
  re-run detection
  candidates with new evidence are added; old wrong ones can be removed

This loop continues until the user is satisfied.

Then user chooses scope for saving the rules:
  current_plan_only (default — lost on archive)
  project_rule (this project's plans)
  company_rule_candidate (pending admin review)
  company_rule_approved (admin-only gate)
```

---

## 8. Honesty Rules (non-negotiable)

1. **Reports MUST be labeled** "Algorithmic POC output — NOT human validated."
2. **Confidence numbers are pixel-similarity scores**, not validated accuracy.
3. **Detection corrections improve future scans, but DO NOT auto-approve BOQ.**
4. **BOQ approval remains a separate workflow** with its own gate.
5. **The agent never guesses silently.** Uncertainty → evidence crop + review question.
6. **All candidates traceable** to specific training examples (`matched_training_examples`).
7. **All learned rules scoped `current_plan_only` by default.** Promotion to wider scopes requires explicit user/admin action.
8. **No silent rule promotion.** Each scope transition is explicit.
9. **User examples are example data unless real UI markings exist** — the wizard example JSON in the repo is synthetic.

---

## 9. POC Implementation (script 37 v0.3)

**File:** `research/cad-pdf-intelligence/37_manual_visual_training_poc.py` (updated, not duplicated)

**Inputs:**
- `--plan-run-dir` — the run directory
- `--wizard-examples` — path to `visual_training_examples.wizard.example.json` (default: next to script)
- `--page` (default 0)
- `--dpi` (default 150)
- `--match-threshold` (default 0.65)
- `--review-threshold` (default 0.7)
- `--min-tick-pole-px` / `--max-tick-pole-px` (defaults 3 / 80)

**Outputs** — all under `run_dir/outputs/manual_training/`:
- `visual_training_examples.example.json` — copy of input examples for traceability
- `wizard_state.json` — current wizard progress
- `visual_learning_rules.json` — extracted rules per type
- `visual_agent_candidates.json` — candidates with `status: pending_review` etc.
- `visual_review_questions.json` — uncertainty queue
- `evidence_crops/` — per-candidate annotated PNGs
- `templates/` — per-rule extracted templates
- `manual_training_report.md` and `.html`

**Constraints:**
- No DB, no production UI, no paid API, no permanent source archive
- All reports carry the "NOT human validated" banner
- Output dir is `manual_training/` (not `manual_visual_training/`)
- Does NOT modify scripts 01–36 or any production code

---

## 10. Future UI (documented; not built)

The marking UI must support:

- Image viewer with zoom/pan (50–800%)
- Marker tools: point, rectangle, line, polygon, association linker
- Training wizard chrome: current step name, HE/EN prompt, example counter (e.g. "3/5"), Next/Back
- Apply Learned Rules button (triggers script 37 v0.3 or its successor library)
- Candidate review panel: paginated, one question at a time, evidence crop + HE/EN question + one-click answers
- Correction tools: add new pole, mark wrong detection, add ignore region
- Scope selector per rule: `current_plan_only` / `project_rule` / `company_rule_candidate` (admin-only for `_approved`)

**UX principle (non-negotiable):**

The first screen MUST NOT say "the system will detect everything automatically." It MUST say something like:

> "כדי להתחיל, למד את הסורק איך נראים עמודים ותמרורים בתוכנית הזו."
> (To start, teach the scanner what poles and signs look like in this plan.)

Expected future user flow:
1. Upload plan
2. Teach 5–10 pole examples
3. Teach 5–10 tick/sign-count examples
4. Teach 5–10 sign code examples
5. (Optional) Teach 5–10 sign symbol examples
6. Teach associations
7. Run learned detection
8. Review / correct
9. Export draft

---

## 11. Safety

- No production UI changes
- No DB migrations
- No paid API
- No permanent source archive of uploads (research-only)
- No BOQ approval pathway from this engine
- Existing vector pipeline (Engine A) untouched
- Reports honest about uncertainty

---

## 12. Files Created / Modified by this Track

| File | Status | Role |
|---|---|---|
| `PLAN_SCANNER_MANUAL_TRAINING_AGENT_SPEC.md` | **NEW (this document)** | Canonical Manual-First spec |
| `37_manual_visual_training_poc.py` | **UPDATED (v0.3)** | POC realizing this spec |
| `visual_training_examples.wizard.example.json` | **UPDATED (schema v3)** | Sample wizard-organized annotations |
| `PLAN_SCANNER_VISUAL_LEARNING_AGENT_SPEC.md` | UPDATED | Cross-reference to this spec |
| `PLAN_SCANNER_IMAGE_BASED_ENGINE_SPEC.md` | UPDATED | Note on the manual-first pivot |
| `memory/project_image_scanner_learning_loop.md` | UPDATED | Reflects this spec |
| `memory/project_visual_learning_agent.md` | UPDATED | Reflects this spec |
| `memory/MEMORY.md` | UPDATED | Index entry updated |

---

*This document describes the current primary research direction (manual-first). The automatic detection POCs (Engine B + Engine C v0.1–v0.2) remain in the repo as comparison baselines. They are not the primary path.*
