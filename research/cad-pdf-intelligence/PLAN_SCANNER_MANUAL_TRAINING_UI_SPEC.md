# Plan Scanner — Manual Training UI Spec

**Date:** 2026-05-23
**Status:** Research-only. No production UI/DB/flows changed.
**Scope:** UI surface for the **Manual-First Human-Trained Visual Agent** (Engine C v0.3).
**Canonical companion spec:** [`PLAN_SCANNER_MANUAL_TRAINING_AGENT_SPEC.md`](PLAN_SCANNER_MANUAL_TRAINING_AGENT_SPEC.md)
**POC backend:** [`37_manual_visual_training_poc.py`](37_manual_visual_training_poc.py)

> This document defines **how the user will teach the Plan Scanner directly on the plan image**. It is the missing UI layer that turns the rule-based POC into a usable teaching workflow. It does NOT define a production component yet — implementation strategy is discussed in §7.

---

## 0. Why This Spec Exists

The Engine C backend (script 37) consumes a `visual_training_examples.wizard.example.json` file. In the POC that file is hand-authored. For real users, that file must be produced by a UI where the user marks examples directly on the plan image.

Until this UI exists, manual-first training is theoretical. The agent's quality depends entirely on the quality and quantity of user markings. Markings must be cheap and natural for the user to produce. That is what this UI delivers.

**The UI's three jobs:**
1. **Show** the plan image with smooth zoom/pan
2. **Capture** user markings (point, line, rectangle, polygon, association)
3. **Save** every marking in the exact schema script 37 consumes, with full provenance

Everything else (running detection, showing candidates, asking review questions) is downstream of these three.

---

## 1. Plan Image Viewer

### 1.1 Inputs
- PDF page rendered at user-chosen DPI (default 150), OR
- Direct image (PNG/JPG/TIFF) loaded as the canvas backing image

### 1.2 Required interactions
- **Zoom**: 25% → 800% in 12 discrete steps (25, 33, 50, 67, 75, 100, 125, 150, 200, 300, 500, 800)
- **Pan**: drag with primary button when no tool is selected; arrow keys nudge by 50 px
- **Fit-to-screen** / **100%** / **Center on cursor** keyboard shortcuts
- **Page selector** if the source is a multi-page PDF (Previous / Next / page input)
- **Minimap** in a corner showing current viewport position relative to the full plan (helpful for very large A0 plans)

### 1.3 Coordinate system
- The image's native pixel space is the **single source of truth** for all markings.
- All saved geometry uses **image-pixel coordinates** (not screen pixels, not normalized 0-1).
- Conversion: `image_xy = screen_xy / zoom_level - viewport_origin`. The UI maintains the inverse for rendering existing markings.
- DPI must be saved alongside coordinates so the backend can validate scale consistency.

### 1.4 Performance constraints
- Large plans (e.g. 9450×5315 px) must remain responsive. Tile-render the image into ~512×512 patches and only paint visible tiles.
- Use HTML5 `<canvas>` for both the image layer and the marking overlay. Two stacked canvases keep the marking layer fast on redraw.

### 1.5 Visual conventions
- Grid overlay (toggle): light 100-pixel grid for spatial reference
- Crosshair cursor when a marking tool is active
- Existing markings drawn as semi-transparent overlays colored per `label_type` (see §2 table)

---

## 2. Marking Tools

One tool active at a time. Tool selection persists across pan/zoom.

| Tool | Geometry produced | label_type | Color (overlay) | Keyboard |
|---|---|---|---|---|
| **Point** | `{type: "point", x, y, radius}` | `pole_dot` | green (#00aa00) | `P` |
| **Line** | `{type: "line", x0, y0, x1, y1}` | `sign_count_tick` | yellow (#dd9900) | `T` |
| **Small rect** | `{type: "rectangle", x0, y0, x1, y1}` | `sign_code_text` | blue (#0066dd) | `C` |
| **Med rect / polygon** | rect or polygon (3+ vertices) | `sign_symbol` | purple (#9900cc) | `S` |
| **Large rect / polygon** | rect or polygon | `ignore_region` | red (#cc0000) | `I` |
| **Association** | `{type: "association", from: {ref}, to: {ref}}` | `pole_to_code_association` or `pole_to_symbol_association` | dashed gray line | `A` |
| **Eraser / undo** | — | — | — | `U` undo, `R` redo, `Del` delete selected |

### 2.1 Tool-specific UX

- **Point**: single click; default radius 8 px (adjustable in tool panel)
- **Line**: click-drag-release; live preview during drag; min length 4 px or marking is discarded
- **Rectangle**: click-drag-release; live preview; min size 4×4 px
- **Polygon**: sequential clicks for vertices; double-click or `Enter` to close; `Esc` to cancel; min 3 vertices
- **Association**: requires two existing markings. First click selects source (highlighted), second click selects target. Self-association rejected. The UI auto-infers the association sub-type from the two markings' `label_type`s (pole_dot + sign_code_text → pole_to_code_association; pole_dot + sign_symbol → pole_to_symbol_association).

### 2.2 Editing existing markings
- Click an existing marking to select it (selection ring drawn around it)
- Drag a selected point/rect handle to resize/move
- Right-click selected marking → context menu: edit `user_notes`, delete, change `label_type` (with warning if it breaks an existing association)

### 2.3 Marking validation (client-side, before save)
- Reject coordinates outside the image bounds
- Reject zero-area rectangles
- Warn if a `sign_count_tick` is more than 200 px from any `pole_dot` (likely mis-mark)
- Warn if `sign_code_text` is more than 300 px from any `pole_dot` (likely unrelated number)
- These are **warnings, not blocks** — the user can override (the warning is itself a useful training signal)

---

## 3. Guided Wizard

A persistent right-side panel walks the user through 9 ordered steps (matches Engine C v0.3 spec §3 exactly).

### 3.1 Steps shown in the wizard

| # | Step | Tool auto-activated | Min examples | UI shows when complete |
|---|---|---|---|---|
| 1 | Upload plan | (file picker) | n/a | Image loaded, dimensions shown |
| 2 | Teach poles | Point | **5** | "5/5 ✓" |
| 3 | Teach sign count / ticks | Line | **5** | "5/5 ✓" |
| 4 | Teach sign codes | Small rect | **5** | "5/5 ✓" |
| 5 | Teach sign symbols (optional) | Med rect/polygon | **0** | "Optional — skip allowed" |
| 6 | Teach associations | Association | **1 per relation used** | "1+ ✓" |
| 7 | Apply learned rules | (system) | n/a | "Run detection" button enabled |
| 8 | Review candidates | (review panel — §3.4) | n/a | "X candidates, Y need review" |
| 9 | Save learning | (scope selector) | n/a | "Saved at scope=current_plan_only" |

### 3.2 Wizard panel layout

```
┌─ Wizard ─────────────────────────────┐
│ Step 2 / 9 — Teach poles             │
│                                      │
│ סמן 5–10 דוגמאות של עמודי תמרור      │
│ בתוכנית.                              │
│                                      │
│ Examples collected:    [████░] 4/5   │
│                                      │
│ [ Skip optional step ] [ Continue ]  │
│                                      │
│ ─── Marking log ───                  │
│ te_pole_001  point (2952, 1330)   ×  │
│ te_pole_002  point (3674, 1266)   ×  │
│ te_pole_003  point (2684, 1265)   ×  │
│ te_pole_004  point (2986, 1128)   ×  │
└──────────────────────────────────────┘
```

- The HE prompt is the primary text (large, RTL aligned). EN is secondary (smaller, below).
- The progress bar shows actual count vs `min_examples` from the spec.
- "Continue" enables when min met. "Skip optional step" appears only for step 5.
- Marking log lists each example added in this step; `×` deletes.

### 3.3 First-screen UX (non-negotiable)

The very first screen the user sees, BEFORE uploading anything:

> **כדי להתחיל, למד את הסורק איך נראים עמודים ותמרורים בתוכנית הזו.**
>
> (To start, teach the scanner what poles and signs look like in this plan.)
>
> [ העלה תוכנית — PDF או תמונה ]

The screen MUST NOT say "the system will detect everything automatically." The expectation set here governs everything that follows.

### 3.4 Review panel (Steps 7–8)

After Step 7 runs detection, Step 8 presents the candidates as a paginated review queue:

```
┌─ Review queue — 58 questions ────────────────────┐
│  Question 1 / 58                                  │
│                                                   │
│  [evidence crop image — annotated]               │
│                                                   │
│  האם המספר הזה שייך לעמוד/לתמרור?                │
│  Does this number belong to the pole/sign?       │
│                                                   │
│  [yes_sign_code] [no_unrelated] [no_dimension]   │
│  [other...]      [skip for now]                  │
│                                                   │
│  ─── Corrections ───                              │
│  [+] Add a new pole I see nearby                  │
│  [+] Mark this region as ignore                   │
│  [-] Reject this candidate                        │
└───────────────────────────────────────────────────┘
```

Each answer writes back to `visual_review_questions.json` (`user_answer`, `correction_status: answered`). Corrections that add new markings prepend new `training_example_id`s to the JSON and immediately re-trigger Step 7 in the background.

### 3.5 Save panel (Step 9)

Per-rule scope selector:

```
┌─ Save Learning ───────────────────────┐
│ Rule              Scope                │
│ r_pole_marker     [current_plan_only ▾]│
│ r_sign_count_tick [current_plan_only ▾]│
│ r_sign_code_text  [project_rule      ▾]│
│ r_sign_symbol     [current_plan_only ▾]│
│ r_pole_to_code    [current_plan_only ▾]│
│                                        │
│ Note: company_rule_candidate requires  │
│ admin approval to become _approved.    │
│                                        │
│ [ Cancel ]                [ Save All ] │
└────────────────────────────────────────┘
```

`company_rule_candidate` is a separate flow (admin notification, never auto-applied to other projects).

---

## 4. Training State Model

A single JSON object kept in client-side state (and persisted to the server with every change):

```json
{
  "schema_version": "1.0",
  "session_id": "ms_2026_05_23_xxxx",
  "plan_id": "...",
  "page_number": 0,
  "image_dpi": 150,
  "image_size_px": [9450, 5315],
  "current_step": "step_3_teach_sign_count",
  "required_examples_per_step": {
    "step_2_teach_pole_appearance": 5,
    "step_3_teach_sign_count": 5,
    "step_4_teach_sign_code": 5,
    "step_5_teach_sign_symbol": 0,
    "step_6_teach_associations": 1
  },
  "examples_collected_per_step": {
    "step_2_teach_pole_appearance": 5,
    "step_3_teach_sign_count": 3,
    "step_4_teach_sign_code": 0,
    "step_5_teach_sign_symbol": 0,
    "step_6_teach_associations": 0
  },
  "validation_warnings": [
    {
      "type": "tick_far_from_pole",
      "example_id": "te_tick_002",
      "message": "This tick is 240px from the nearest pole — likely mis-marked",
      "ignored_by_user": false
    }
  ],
  "can_continue_to_next_step": false,
  "ready_for_apply": false,
  "last_saved_at": "2026-05-23T..."
}
```

**Transitions:**
- `can_continue_to_next_step` = `examples_collected[current_step] >= required_examples[current_step]` (or step is optional)
- `ready_for_apply` = all required steps (2,3,4,6) have met their min; step 5 may be skipped
- `last_saved_at` updates on every persistence write

---

## 5. Save Format — UI Marking → `visual_training_examples.json`

Every UI marking maps directly into one entry under `steps.<step_id>.examples[]` (or under `supporting_examples.<kind>[]` for ignore regions). The schema is exactly what script 37 v0.3 consumes (schema v3.0).

### 5.1 Mapping per marking type

| UI tool | Step | Becomes |
|---|---|---|
| Point in step 2 | `step_2_teach_pole_appearance` | `{training_example_id, geometry: {type:"point", x, y, radius}, user_notes, confidence_source: "human_labeled", scope, created_at}` under `steps.step_2_teach_pole_appearance.examples[]` |
| Line in step 3 | `step_3_teach_sign_count` | `{..., geometry: {type:"line", x0, y0, x1, y1}, associated_pole_id, ...}` |
| Rect in step 4 | `step_4_teach_sign_code` | `{..., geometry: {type:"rectangle", x0, y0, x1, y1}, label_value, associated_pole_id, ...}` |
| Rect/polygon in step 5 | `step_5_teach_sign_symbol` | `{..., geometry: {...}, label_value, associated_pole_id, ...}` |
| Association in step 6 | `step_6_teach_associations` | `{..., label_type: "pole_to_code_association" \| "pole_to_symbol_association", geometry: {type:"association", from:{...,ref:source_id}, to:{...,ref:target_id}}, ...}` |
| Rect with "ignore" tool | (supporting) | `{..., label_type:"ignore_region", geometry:{type:"rectangle",...}, label_value:"title_block" \| "right_legend_strip" \| free-text, ...}` under `supporting_examples.ignore_regions[]` |

### 5.2 Auto-populated fields

The UI MUST auto-populate:

- `training_example_id`: prefix per type (`te_pole_NNN`, `te_tick_NNN`, `te_code_NNN`, `te_symbol_NNN`, `te_assoc_code_NNN`, `te_assoc_symbol_NNN`, `te_ignore_NNN`); sequential per session
- `confidence_source`: always `"human_labeled"`
- `scope`: always `"current_plan_only"` until Step 9
- `created_at`: ISO-8601 UTC timestamp at marking time
- `audit_notes`: empty string by default

### 5.3 Crop generation

After each marking is saved, the UI requests a server-side crop generation (or generates it client-side via canvas) and stores it at `outputs/manual_training/example_crops/<training_example_id>.png`. The crop path is added to the saved example as `crop_path`. This crop becomes the visual reference in later review panels.

### 5.4 Persistence frequency

- **On every marking add/edit/delete**: PUT the entire `visual_training_examples.json` to the server (or local FS in the research annotator). Files are small, atomic writes are simple.
- **On wizard step transition**: PUT `wizard_state.json` separately.
- **No client-side draft state held in memory only** — everything that exists in the UI must exist on disk within ~1 second.

---

## 6. UX Language

### 6.1 First screen (mandatory)

```
כדי להתחיל, למד את הסורק איך נראים עמודים ותמרורים בתוכנית הזו.

[ העלה תוכנית — PDF או תמונה ]
```

### 6.2 Honesty rules throughout

The UI MUST display, somewhere visible at all times:

> **STATUS:** Algorithmic POC output — NOT human validated.
> Detection corrections improve future scans, but do **NOT** auto-approve BOQ.

### 6.3 Per-step prompts (HE primary, EN secondary)

| Step | Hebrew | English |
|---|---|---|
| 2 | סמן 5–10 דוגמאות של עמודי תמרור בתוכנית. | Mark 5–10 examples of sign poles in the plan. |
| 3 | סמן 5–10 דוגמאות שמראות איך התוכנית מציינת כמה תמרורים נמצאים על עמוד. | Mark 5–10 examples of how the plan indicates how many signs are on a pole. |
| 4 | סמן 5–10 דוגמאות של מספרי תמרורים ליד עמודים. | Mark 5–10 examples of sign code numbers near poles. |
| 5 | סמן 5–10 דוגמאות של הסימון הגרפי של התמרור עצמו, אם הוא מופיע בתוכנית. | Mark 5–10 examples of the sign's visual symbol, if it appears on the plan. |
| 6 | חבר בין עמוד למספר התמרור / סימון תמרור / כמות תמרורים שלו. | Link a pole to its sign code / sign symbol / sign count. |
| 7 | מפעיל את הדפוס הנלמד וסורק את התוכנית… | Applying the learned pattern and scanning the plan… |
| 8 | סקור את המועמדים שנמצאו, אשר/דחה/תקן. | Review the found candidates, approve/reject/correct. |
| 9 | שמור את הכללים שנלמדו ב-scope הרצוי. | Save learned rules at the chosen scope. |

### 6.4 Review queue HE/EN questions

Already specified in script 37 `QUESTION_TEXTS`. The UI must render `question_text_he` as primary and `question_text_en` as secondary.

### 6.5 Tone

- Always say "אני צריך שתלמד אותי" / "I need you to teach me" — never "the system understands"
- Acknowledge uncertainty: "ייתכן שזה לא מדויק — אשמח לתיקון" / "This may not be accurate — corrections welcome"
- Never display a confidence number as a percentage (e.g. "91% accurate") — the underlying score is pixel similarity, not validated accuracy. Use color (green/yellow/red) without numbers, or show the raw `match_score` with the word "similarity," not "accuracy."

---

## 7. Implementation Recommendation

Three viable slices. **Recommendation: start with A.**

### Option A — Local research HTML annotator (RECOMMENDED)

A single-file or small-folder browser app that runs from `file://` or a tiny local Flask/FastAPI server.

**What it would be:**
- `research/cad-pdf-intelligence/research_annotator/index.html` + `app.js` + `style.css`
- Uses HTML5 `<canvas>`, no framework required
- Reads/writes `visual_training_examples.wizard.example.json` directly (via File System Access API or a small Python helper that listens on `localhost:7799`)
- Calls `python 37_manual_visual_training_poc.py` via subprocess to run Step 7
- Renders the resulting `visual_review_questions.json` in the review panel

**Pros:**
- Zero risk to production
- No new dependencies in the main app
- Can be built incrementally (viewer first, then each tool, then wizard, then review)
- Easy to iterate on the UX with real plans without deployment
- Stays in `research/cad-pdf-intelligence/` — discoverable next to the POC it serves
- Easier to throw away if the UX assumptions turn out wrong

**Cons:**
- Requires the user to run a local script
- File System Access API not supported in all browsers (need fallback to the Flask helper)

**Effort estimate:** ~600–900 lines of vanilla JS + ~100 lines of Python helper. Achievable in one focused session per the three sub-slices: viewer (1) → marking tools + wizard (2) → review panel (3).

### Option B — Production `/plan-scanner` annotator

Build the annotator as a React component inside `src/app/plan-scanner/` and persist via Supabase.

**Pros:**
- Same auth, same theme, same deployment story as the rest of the app
- Production users can find it without local setup
- Can persist training rules to a real DB (`visual_training_rules` table)

**Cons:**
- Forces decisions about DB schema, auth scoping, RLS, admin gates, and rule promotion BEFORE the UX is validated
- Modifying production UI for a still-unproven workflow violates the manual-first principle ("slow and reliable over fast and unreliable")
- Adds dependencies on React canvas libraries (Konva.js, react-konva, or Fabric.js)
- A bug in the annotator could affect users on existing routes

**When this becomes the right move:** after Option A has been used on 3–5 real plans and the marking workflow stabilizes.

### Option C — JSON-only annotation template

Provide a richer, better-documented example JSON + a small validation script. Users hand-edit the JSON.

**Pros:**
- Trivial to ship (just markdown + an updated example file)
- Zero UI code

**Cons:**
- Unusable by anyone except the developer who wrote the schema
- Defeats the purpose of "manual teaching by the engineer/worker"
- Hand-editing pixel coordinates is unreliable; the user needs to see what they're marking

**When this becomes the right move:** never as a final product. Useful only as the v0.0 stepping stone the team already has.

### Recommended path forward

1. **Now**: Option A — Local research HTML annotator, in `research/cad-pdf-intelligence/research_annotator/`. Three sub-slices:
   - Viewer + marking tools + wizard chrome (no detection wiring)
   - Wire to script 37 for Step 7 detection
   - Review panel writes back into `visual_review_questions.json`
2. **After validation on 3+ real plans**: re-evaluate. If the UX is stable, plan Option B as a Next.js component.
3. **Production UI should wait**: until A is validated. Modifying production UI now would commit DB schema and auth flows that may need rework once we see how engineers actually mark plans.

### Risks (all options)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Engineers find the marking too tedious | medium | high | Default tool to Point (the cheapest marking); reduce min_examples if a user repeatedly stops at the same point |
| Markings at wrong scale/coordinate frame | medium | medium | Always persist `image_dpi` + `image_size_px` with every example; validate at load time |
| Canvas performance on large A0 plans | low–medium | medium | Tile rendering; only repaint visible tiles on pan |
| User skips honesty banners | low | medium | Place "NOT human validated" banner in the wizard panel header — always visible |
| Browser FS API compatibility | medium (Safari) | low | Fall back to the tiny localhost Python helper |
| Race conditions on rapid marking | low | low | Server merges by `training_example_id`; client sends full JSON on each change (small file) |
| User confusing detection score with accuracy | high | medium | Never display % accuracy; use color bands only |

---

## 8. Out of Scope (Explicitly)

These are NOT part of this UI spec — they belong elsewhere or come later:

- Building any production UI (deferred until Option A is validated)
- DB schema design (deferred)
- Auth/RLS rules for company_rule_approved (admin flow — separate spec)
- Multi-user concurrent editing (single-user per plan for now)
- Mobile / touch UX (desktop-only for the annotator)
- BOQ generation (out of Engine C scope entirely)
- Cross-engine validation UI (Engine A vs Engine C agreement view — future)

---

## 9. Files Created / Modified by this Track

| File | Status |
|---|---|
| `PLAN_SCANNER_MANUAL_TRAINING_UI_SPEC.md` | **NEW (this document)** |

No code changes. No production UI changes. No DB. No paid API.

---

## 10. Next Implementation Step

Per the recommendation in §7, the next concrete deliverable is:

**Option A, Slice 1 — Local research HTML annotator viewer + marking tools.**

It would live at `research/cad-pdf-intelligence/research_annotator/` and would:
1. Load a PDF page rendered by Python (re-using `render_page` from script 37) or a direct image
2. Display it on a canvas with smooth zoom/pan
3. Provide the 6 marking tools from §2 with keyboard activation
4. Persist every marking to `visual_training_examples.wizard.json` via the File System Access API (or a tiny Python helper on localhost)
5. Show the wizard chrome from §3 (per-step prompts, progress bar, marking log)

Detection wiring (Slice 2) and the review panel (Slice 3) come after Slice 1 is usable.

That work is not started yet — this document only specifies the requirements.

---

*This UI spec is research-only. No production component is built. The recommended implementation slice is a local research HTML annotator that lives next to the POC backend it serves.*
