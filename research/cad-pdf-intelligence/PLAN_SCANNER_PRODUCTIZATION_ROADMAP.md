# Plan Scanner — Research-to-Product Implementation Roadmap

**Module:** סורק תוכניות (Plan Scanner)  
**Research directory:** `research/cad-pdf-intelligence/`  
**Snapshot date:** 2026-05-20  
**Status:** Research-only — not integrated into production  
**Contact:** Elio Zedri

---

## 0. Core Product Principle: Scanner, Not Archive

**The Plan Scanner is a scan-and-export tool — not a document archive.**

This distinction drives every storage, retention, and UX decision for the product:

### What the scanner does
1. **Accepts a PDF upload** (temporary working input)
2. **Runs the analysis pipeline** (vector extraction, sign detection, measurement, BOQ draft)
3. **Generates structured scan outputs** (BOQ draft, measurements, review questions, report)
4. **Presents outputs for human review and approval**
5. **Exports the approved BOQ** to operations (order management)

After step 5, the original uploaded PDF is **not necessarily retained**. The valuable product of the scanner is the scan result — not the source file.

### Source file retention policy

The product must always carry an explicit retention policy per uploaded file. Five policies are supported:

| Policy | Meaning |
|---|---|
| `ephemeral_scan_only` | PDF is deleted immediately after pipeline completes |
| `keep_outputs_only` *(default)* | Scan outputs kept indefinitely; source PDF held only until export/download |
| `keep_source_until_export` | Source PDF held until the BOQ has been exported to operations, then deleted |
| `keep_source_for_project_archive` | Source PDF kept as part of a long-term project archive (explicit opt-in) |
| `manual_delete_after_scan` | Human must explicitly trigger deletion after reviewing the scan |

**Default behavior is `keep_outputs_only`.** Storing source PDFs permanently is an explicit opt-in, not the default.

### Why this matters for architecture

- **Supabase Storage** must not be designed as a permanent document archive for PDF files. Buckets should have lifecycle rules that honour the retention policy.
- **`plan_files` table** tracks storage status (`temporary`, `retained`, `deleted`, `export_only`) and expiry timestamps. The DB record and all scan results persist even after the source file is deleted.
- **`plan_artifacts` table** distinguishes between `source_upload` / `temporary_working_file` (ephemeral) and `generated_output` / `boq_report` / `printable_report` (durable).
- **The run directory** (`runs/<plan_slug>/`) has a defined lifecycle: `created → scanning → outputs_generated → exported → cleanup_pending → source_deleted → archived_if_requested`. It is not a permanent document folder by default.

### What persists permanently (even after source file deletion)

- The `plans` DB record (plan_id, metadata, status)
- All `plan_scan_runs` records
- All `plan_boq_items` (with full audit trail)
- All `plan_review_questions` and `plan_human_answers`
- All `plan_audit_events` (immutable, append-only)
- Generated outputs: BOQ report, printable report, measurements, review questions

### Access control / rollout

The Plan Scanner must be **admin-only or engineering/planning role** when first introduced to production. It must never be visible to all authenticated users:

- Gate behind a `plan_scanner` feature flag or permission
- Roles: `plan_uploader` (submit plan), `plan_reviewer` (answer questions), `plan_boq_approver` (approve BOQ)
- `plan_rule_admin` for company-wide teaching rule management
- No self-service plan upload by field workers without approval

---

## 1. Current Research System Status

### Pipeline

| Item | Value |
|---|---|
| Pipeline stages | 14 / 14 OK |
| Scripts built | 35 Python scripts |
| Output artifacts | 30 JSON files + HTML/MD reports |
| Sample plan | 1 AutoCAD-exported PDF (single file) |
| Paid API used | None |
| Production modified | None |

### Stage summary (as of snapshot)

| Stage | ID | Script | Status |
|---|---|---|---|
| PDF Source | S1 | `01_inspect_pdf.py` | ✓ OK |
| Legend / Vocabulary | S2 | `07_extract_legend.py` | ✓ OK |
| Sign Detection | S3 | `06_match_signs.py` | ✓ OK |
| Sign Code Recognition | S4 | `13_vector_glyph_recognition.py` | ✓ OK |
| Measurement | S5 | `15_scale_measurement.py` | ✓ OK |
| Element Decomposition | S6 | `10_decompose_elements.py` | ✓ OK |
| Unified BOQ | S7 | `17_boq_aggregator.py` | ✓ OK |
| Sign Plausibility | S8 | `18_sign_plausibility_validator.py` | ✓ OK |
| Partial Code Resolver | S9 | `22_partial_code_resolver.py` | ✓ OK |
| Human Review Write-Back | S10 | `23_human_review_writeback.py` | ✓ OK (8 types) |
| Master Dashboard | S11 | `24_master_research_dashboard.py` | ✓ OK |
| Teaching Loop Answer Pack | S12 | `25_teaching_loop_answer_pack.py` | ✓ OK |
| Plan Scanner Workspace | S13 | `26_plan_scanner_workspace.py` | ✓ OK |
| Static Review Form | S14 | `27_static_review_form_generator.py` | ✓ OK |

### Data state (snapshot 2026-05-20)

| Artifact | Count | Confirmed | Notes |
|---|---|---|---|
| Sign occurrences | 177 | 0 | No 3-digit code confirmed |
| BOQ draft items | 47 | 0 approved | All `approved_for_boq: false` |
| Legend rows | 13 | 0 labeled | Labels require vision or manual input |
| Review queue items | 177 | 0 resolved | All require human decision |
| Human answers applied | 0 | — | No real answers file yet |
| Open questions (answer pack) | 40 | — | 3 CRITICAL / 5 HIGH / 18 MEDIUM / 14 LOW |
| Scale calibration | — | NOT done | Fallback 1:500 assumption in use |
| Red flags | 10 | — | 4 CRITICAL, 6 WARNING |

### Teaching loop status

The Human Review Write-Back mechanism (S10) is fully wired and supports 8 answer types:

- `partial_code_resolution` — resolve ambiguous sign codes
- `element_group_classification` — classify element groups (signage, barrier, etc.)
- `scale_calibration` — provide two known-distance points
- `color_taxonomy_rule` — confirm or override color-to-type mapping
- `sign_code_confirmation` — confirm a sign code for a specific occurrence
- `ignore_rule` — mark elements as noise / exclude from BOQ
- `legend_label` — annotate legend rows with human-verified labels
- `boq_review` — review and accept/reject/defer BOQ line items

No real answers have been submitted yet. The static review form (`outputs/static_review_form.html`) is ready to capture answers.

---

## 2. Current Capabilities

All capabilities listed below are **research-only**. None are connected to production data, the Supabase DB, or the Next.js app.

| Capability | What it does | Output |
|---|---|---|
| **Plan inspection** | Reads AutoCAD-exported PDF, extracts pages, vector paths, text, bounding boxes | `pdf_analysis.json` |
| **Legend extraction** | Crops legend region, identifies rows, attempts label matching | `legend_rows.json`, `legend_vocabulary.json` |
| **Sign / code attempts** | Matches sign symbols against library, attempts 2–3 digit code extraction from vector glyphs | `sign_inventory.json`, `review_queue.json` |
| **Review queue** | Prioritized list of 177 sign occurrences needing human confirmation | `review_queue.json` |
| **Partial code resolver** | Detects ambiguous suffix-only codes (e.g. "33"), flags for human resolution | `partial_code_resolution.json` |
| **Human teaching / writeback** | Applies human answers from JSON file back into pipeline artifacts, with contradiction detection and audit trail | `human_review_application.json` |
| **Scale measurement** | Reads title block scale (or manual calibration), converts px → mm → m | `scale_measurement/results.json` |
| **Element decomposition** | Groups vector paths into semantic elements (signage, barrier, guardrail, marking…) | `element_groups.json` |
| **Unified BOQ draft** | Aggregates all element groups + signs into a single BOQ with provisional quantities | `boq_unified_draft.json` |
| **Master dashboard** | Single HTML research home — all metrics, red flags, confidence summary | `master_dashboard.html` |
| **Static review form** | Self-contained HTML form for the human expert to answer all 40 review questions and download a writeback-compatible JSON | `static_review_form.html` |
| **Workspace package** | Navigation hub linking all 14 stages, artifacts, critical blockers, and pipeline flow | `plan_scanner_workspace.html` |

---

## 3. What Is Still Research-Only

The following outputs must **never be used operationally** without passing through a full human approval gate:

| Output | Why it is research-only |
|---|---|
| **All BOQ quantities** | Scale unverified; element classification unconfirmed; `approved_for_boq: false` on every item |
| **All scale measurements** | 1:500 is a fallback assumption, not a verified calibration |
| **Sign-code assignments** | 0 / 177 occurrences have a confirmed 3-digit code |
| **Color taxonomy** | Auto-inferred from RGB clusters; no human has confirmed a single rule |
| **Legend labels** | 13 legend rows extracted; 0 have human-verified labels |
| **Element classifications** | Groups were auto-assigned; none confirmed by an engineer |
| **Human answers (when added)** | Even after writeback, `requires_review: true` is preserved; a separate BOQ approval gate is required |
| **Approval workflow** | No approval workflow exists yet — not in research, not in production |

The system is designed to preserve this distinction. `approved_for_boq: false` is hardcoded in the writeback engine and cannot be set to `true` by any automated step.

---

## 4. Critical Blockers Before Production

These must be resolved before any part of this system can go into a sidebar feature:

### Technical blockers

| Blocker | Description | Effort |
|---|---|---|
| **Scale calibration** | Must provide two real-world measured points per plan to verify scale. Without this, all linear quantities are wrong. | Low effort, HIGH impact |
| **Reliable sign-code workflow** | Current recognition has 0 confirmed codes. Needs either: (a) vector glyph matching tuned per sign library, or (b) vision API with controlled prompt. | High effort |
| **Legend label extraction** | 13 legend rows have no labels. Needs either manual input via review form, or vision API. Without labels, sign identity is unknown. | Medium effort |
| **Taxonomy confirmation** | Color → element type rules are auto-inferred. Each rule needs human sign-off before it drives BOQ line items. | Medium effort |
| **Human answer ingestion cycle** | The review form exists and the writeback exists, but no full end-to-end test with real answers has been done. Needs at least one complete cycle. | Low effort |

### Process and model blockers

| Blocker | Description |
|---|---|
| **BOQ approval model** | Who approves? What is the approval workflow? What triggers the `approved_for_boq: true` transition? This must be designed before any production BOQ feature. |
| **Storage model** | Research outputs are local JSON files. Production needs a DB schema or document store for plan data, sign occurrences, BOQ items, and audit trail. |
| **File upload flow** | No mechanism to upload a new PDF plan, run the pipeline, and retrieve results. Needs an API or queue. |
| **Security and access control** | Plan data is sensitive (project scope, quantities, locations). Who can upload plans? Who can view BOQ? Who can approve? |
| **Audit trail persistence** | The writeback engine maintains an in-file audit trail. Production needs this stored in a DB with timestamps and user identity. |
| **Performance and multi-plan handling** | Current pipeline runs on a single plan in ~0.1s (mostly file I/O). Running on many plans, with concurrent users, requires a job queue and result caching strategy. |

---

## 5. Recommended Production Architecture

### Module identity

**Feature name:** סורק תוכניות  
**Location in app:** Sidebar under a future section — suggested: מחלקת הנדסה ותוכניות  
**Trigger:** Upload a plan PDF → pipeline runs → human review → BOQ output  
**Integration point:** After approval, BOQ lines flow into order management (separate gate)

### Agent alignment

This module maps naturally to a dedicated **Plan / Engineering Analyzer Agent** within the existing agent framework:

| Agent role | Responsibility |
|---|---|
| **Plan Intake Agent** | Accepts PDF upload, validates format, triggers pipeline |
| **Plan Analyzer Agent** | Runs extraction pipeline, flags anomalies, generates review queue |
| **Human Review Coordinator** | Presents questions to the right user, collects answers, runs writeback |
| **BOQ Approver** | Human-gated step — no agent approves automatically |
| **QA / Red Flags Agent** | Monitors pipeline outputs, raises blockers before approval |

### Submodule breakdown

| Submodule | Maps to stage(s) | Key output |
|---|---|---|
| **Plan Intake** | S1 | Parsed PDF, page map |
| **Legend / Vocabulary** | S2 | Legend rows, sign vocabulary |
| **Sign / Code Reader** | S3, S4, S9 | Sign inventory, code assignments |
| **Element Decomposition** | S6 | Classified element groups |
| **Measurement** | S5 | Calibrated scale, linear totals |
| **Human Teaching Loop** | S10, S12, S14 | Writeback, contradiction detection, audit |
| **Review Queue** | S8, S14 | Prioritized items awaiting human decision |
| **BOQ Aggregator** | S7 | Unified draft, never auto-approved |
| **QA / Red Flags** | S8, S11 | Critical blockers, confidence scores |
| **Work Package Generator** | (future — Phase 6) | Scoped installation packages per zone |

### Data flow (future)

```
Upload PDF
   ↓
Plan Intake (validate, store, assign plan_id)
   ↓
Pipeline run (S1–S9) — server-side, async job
   ↓
Review queue generated — persisted to DB
   ↓
Human review session (review form or UI)
   ↓
Writeback applied — audit trail stored per user
   ↓
QA gate — red flags must be cleared
   ↓
BOQ approval — separate human sign-off
   ↓
Approved BOQ → order / work package
```

---

## 6. Phased Implementation Plan

### Phase 1 — Research Hardening (current)

**Goal:** Make the research pipeline trustworthy enough for a real plan.  
**Status:** In progress. 14/14 stages OK. 40 unanswered questions.

Key tasks:
- [ ] Complete scale calibration for the sample plan
- [ ] Submit real answers for the 40 review questions via the static form
- [ ] Run at least one full end-to-end teaching loop cycle
- [ ] Confirm taxonomy rules (color → element type)
- [ ] Manually label all 13 legend rows
- [ ] Resolve Q-33-1 (suffix "33" partial code)
- [ ] Clear all 4 CRITICAL red flags
- [ ] Run the pipeline on 2–3 additional plan PDFs to test generalization

**Exit criteria:** All CRITICAL red flags cleared for at least 2 plans.

### Phase 2 — Local Prototype UI

**Goal:** Replace the static HTML workspace/form with a simple local web UI that runs the pipeline interactively.

Key tasks:
- [ ] Flask or FastAPI local server wrapping the pipeline
- [ ] Upload form → pipeline trigger → results display
- [ ] Review queue UI (replace static HTML form)
- [ ] Writeback via UI (not manual JSON editing)
- [ ] No authentication needed (local research use only)

**Exit criteria:** A developer can upload a PDF, answer review questions, and view the BOQ draft — all in a browser — without touching the command line.

### Phase 3 — Data Model / Persistence Design

**Goal:** Design the DB schema that will back the production module.

Key tasks:
- [ ] Define `plans` table (plan_id, file_ref, uploaded_by, status, created_at)
- [ ] Define `plan_sign_occurrences` table
- [ ] Define `plan_boq_items` table (with audit trail columns)
- [ ] Define `plan_human_answers` table (answer_id, answer_type, user_id, timestamp, payload)
- [ ] Define `plan_review_sessions` table
- [ ] Define BOQ approval state machine (draft → in_review → approved → locked)
- [ ] Design file storage strategy (Supabase Storage or equivalent)
- [ ] Design audit trail format (who changed what, when, from what, to what)

**Exit criteria:** Schema reviewed by stakeholder and signed off before any migration is written.

### Phase 4 — Production Sidebar Integration

**Goal:** Add "סורק תוכניות" as a sidebar feature behind a permission gate.

Key tasks:
- [ ] Add sidebar entry under מחלקת הנדסה ותוכניות (or equivalent)
- [ ] Implement plan upload page (`/plans/upload`)
- [ ] Implement pipeline trigger API route
- [ ] Implement plan list / status page (`/plans`)
- [ ] Implement review queue page (`/plans/[id]/review`)
- [ ] Connect to Supabase persistence from Phase 3
- [ ] Permission gate: only users with `plan_scanner` permission can access
- [ ] Follow Runtime UI Verification Protocol before reporting complete

**Exit criteria:** Feature visible in running app for authorized user; upload, pipeline, review, and BOQ draft all functional end-to-end.

### Phase 5 — BOQ Approval / Operations Handoff

**Goal:** Build the human approval gate that bridges the plan scanner to order management.

Key tasks:
- [ ] Design and implement BOQ approval workflow (who approves, what changes state)
- [ ] Approved BOQ line items can be linked to an Order
- [ ] Implement `approved_for_boq: true` transition (human only, with signature)
- [ ] Lock mechanism — approved BOQ cannot be silently modified
- [ ] Notification to relevant agent (Coordination Agent or QA Agent) on approval

**Exit criteria:** An authorized user can approve individual BOQ items; approved items are immutable without a new review cycle; no automatic approval path exists.

### Phase 6 — Multi-Plan / Revision Comparison / Work Packages

**Goal:** Scale to project-level analysis across multiple plans and revisions.

Key tasks:
- [ ] Multi-plan project grouping
- [ ] Plan revision comparison (delta BOQ between v1 and v2)
- [ ] Zone-scoped work package generation (segment a plan into installation packages)
- [ ] Aggregated project BOQ (sum across plans with conflict detection)
- [ ] Integration with field diary / work order generation

**Exit criteria:** A project with 3+ plan PDFs can produce a consolidated BOQ with per-zone work packages.

---

## 7. What Not To Do Yet

These actions must not be taken before the blockers in Section 4 are cleared:

| Do not | Reason |
|---|---|
| **Integrate into the production sidebar immediately** | No data model, no auth, no approval workflow, no test with real plans |
| **Auto-approve any BOQ item** | Quantities are unverified; scale is unverified; this is a legal and financial risk |
| **Rely on a paid/vision API** | Not in budget for this phase; pipeline must work free-first |
| **Hide uncertainty from the user** | Every unverified quantity must carry its confidence flag and `requires_review: true` |
| **Treat the one sample plan as universal** | Sign patterns, legend layout, color usage, and scale all vary per plan |
| **Convert research outputs directly into operational quantities** | Skips the approval gate; any quantities used without sign-off are unverified |
| **Delete or overwrite the existing pipeline outputs** | They are the audit record of what was found; deletions destroy the research baseline |
| **Ship a human review UI without the full audit trail** | Who answered what and when must be recorded before any answer affects BOQ |
| **Design storage as a permanent PDF archive** | The scanner is a scan-and-export tool; source files carry a retention policy and must not be assumed to be permanent |
| **Allow self-service plan upload by all users** | The plan scanner must be admin/engineering-role only; gate behind a permission flag before any sidebar integration |

---

## 8. Next Recommended Build Step

### Recommended: Complete the Phase 1 teaching loop cycle

Before designing any UI or data model, the research system needs at least one real human-answer pass to validate the full end-to-end path:

1. **Scale calibration first** — open `outputs/calibration_template.json`, provide two real points, re-run `15_scale_measurement.py`. This clears the highest-impact CRITICAL red flag and validates all 9,407 m of linear quantities.

2. **Fill the static review form** — open `outputs/static_review_form.html`, answer the 3 CRITICAL and 5 HIGH questions, download the JSON, save as `outputs/human_review_answers.json`, run `23_human_review_writeback.py`. This validates the full teaching loop cycle that all 8 writeback types are correct under real input.

3. **Label the 13 legend rows** — use the `legend_label` answer type in the review form to assign a Hebrew label, English label, and sign code to each of the 13 legend rows. This unlocks sign identity for all 177 occurrences.

4. **Re-run the full pipeline** — verify all CRITICAL red flags are cleared, BOQ draft is more complete, review queue has reduced open items.

**Only after completing this cycle:** proceed to Phase 2 (local prototype UI) or Phase 3 (data model design), depending on what the teaching loop reveals about the pipeline's reliability.

### Alternative: Data model design (Phase 3 first)

If the priority is to design the production architecture before investing more in research hardening, Phase 3 (data model design) can be started in parallel. The schema decisions are independent of pipeline accuracy.

---

## Appendix: Key File Reference

| File | Purpose |
|---|---|
| `outputs/static_review_form.html` | Answer all 40 review questions → download JSON |
| `outputs/human_review_answers.example.json` | Template and example for the answers file |
| `outputs/human_review_answers.json` | (create this) real answers → run writeback |
| `outputs/calibration_template.json` | Fill with two known-distance points |
| `outputs/boq_unified_draft.json` | Current BOQ draft — 47 items, 0 approved |
| `outputs/review_queue.json` | 177 sign occurrences awaiting review |
| `outputs/master_dashboard.html` | Pipeline overview, red flags, confidence |
| `outputs/plan_scanner_workspace.html` | Navigation hub for all pipeline artifacts |
| `outputs/teaching_loop_answer_pack.html` | 40 structured questions with context and evidence |
| `19_run_plan_scanner_pipeline.py` | Run the full pipeline (all 14 stages) |
| `23_human_review_writeback.py` | Apply answers → annotate pipeline outputs |

---

*This roadmap is a living planning document. Update it as blockers are cleared and phases begin.*  
*Do not use any output in this research directory for production, procurement, billing, or construction.*
