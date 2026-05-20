# Plan Scanner Production Readiness Audit
## סורק תוכניות — Production Readiness Assessment

**Date:** 2026-05-20  
**Pipeline version:** 17-stage research POC (S1–S17)  
**Auditor:** automated + design review  
**Scope:** research/cad-pdf-intelligence/ only — production UI/DB/flows NOT modified

---

## 1. Current Research Status

### Pipeline

| Stage | Name | Status |
|---|---|---|
| S1  | PDF Source / Legend Extraction | ok |
| S2  | Legend Vocabulary | ok |
| S3  | Sign Detection (Branch A) | ok |
| S4  | Sign Code Recognition | ok |
| S5  | Measurement Branch B | ok |
| S6  | Element Decomposition Branch C | ok |
| S7  | Unified BOQ | ok |
| S8  | Sign Plausibility Validation | ok |
| S9  | Partial Code Resolution | ok |
| S10 | Human Review Write-Back | ok |
| S11 | Master Dashboard | ok |
| S12 | Teaching Loop Answer Pack | ok |
| S13 | Plan Scanner Workspace | ok |
| S14 | Static Guided Review Form | ok |
| S15 | Teaching Loop Demo | ok |
| S16 | Prototype Shell | ok |
| S17 | Local JSON Persistence Flow | ok |

**17/17 stages OK.** No stage is missing or errored.

### Outputs

- Dashboard: `outputs/master_dashboard.html` — 6 sections, 10 red flags active
- Workspace: `outputs/plan_scanner_workspace.html` — 18 nav cards
- Prototype Shell: `outputs/plan_scanner_prototype.html` — 9 sections, data contract established
- Local State: `outputs/local_state/` — 7 files, 711 audit events, 1,728 artifacts indexed
- Pipeline run: `outputs/pipeline_run_summary.json` — 17 stages, overall: ok

### BOQ Status

| Metric | Value |
|---|---|
| Total BOQ items | 47 |
| Approved for BOQ | **0** (hardcoded false — no auto-approval) |
| Requires review | **45 / 47** (95.7%) |
| Human reviewed | 0 |
| BOQ state | `draft_research` — all items |
| Total linear measurement | 9,407.7 m **(PROVISIONAL — uncalibrated scale)** |

### Review / Teaching Status

| Metric | Value |
|---|---|
| Review queue (sign occurrences) | 177 |
| Teaching loop questions | 40 |
| High-priority questions | 8 |
| Real human answers applied | **0** |
| Demo answers applied (S15) | 17 (in-memory only — not operational) |
| Answer types supported | 8 (all implemented in S10) |

### Local Persistence Status

| Metric | Value |
|---|---|
| Entity families modelled | 14 (maps to 16 planned PostgreSQL tables) |
| Audit events | 711 |
| Artifacts indexed | 1,728 |
| human_review_answers.json present | **No** |
| DB migrations applied | **0** |

### Active Red Flags (from master_dashboard)

| Severity | Code | Summary |
|---|---|---|
| CRITICAL | BOQ-UNAPPROVED | 0 / 47 items approved — no quantity confirmed for production use |
| CRITICAL | SCALE-UNCALIBRATED | 1:500 is a fallback assumption — 9,407.7 m is unverified |
| CRITICAL | PARTIAL-CODE-UNRESOLVED | 6 occurrences with suffix "33" (4 candidates each); 1 with "86" (0 candidates) |
| CRITICAL | LEGEND-UNLABELED | 13 legend rows detected, 0 labels extracted (Vision API not configured) |
| WARNING | CODES-UNCONFIRMED | 0 / 177 sign occurrences have a confirmed 3-digit code |
| WARNING | HIGH-IMPACT-UNKNOWN-GROUPS | G-001 (122,781 paths), G-005, G-006, G-011 unclassified |
| WARNING | SUSPICIOUS-CODES | 1 occurrence produced code "86" — no valid expansion in any Israeli sign series |
| WARNING | TEACHING-LOOP-NOT-STARTED | 0 real answers submitted; loop proven in demo only |
| INFO | ITEMS-REQUIRE-REVIEW | 45 / 47 BOQ items flagged requires_review |
| INFO | LEGEND-VISION-NOT-RUN | Legend labels not extracted — paid Vision API not configured (by design) |

---

## 2. Production Readiness Scorecard

Status labels used:  
`ready_for_design` · `prototype_ready` · `research_only` · `blocked_by_manual_validation` · `blocked_by_data_model` · `blocked_by_missing_ui` · `not_ready`

| Area | Status | Notes |
|---|---|---|
| **Plan upload / intake** | `not_ready` | No file upload UI, no intake endpoint, no plan_id routing. Only hardcoded PLAN-001 on local filesystem. |
| **File storage / artifacts** | `research_only` | Local filesystem only. 1,728 artifacts tracked in index. No cloud storage, no presigned URLs, no path management across plans. |
| **Scan run orchestration** | `prototype_ready` | 17-stage pipeline runs end-to-end on one PDF. Not parameterized by plan_id or run_id. Cannot queue multiple plans. Scripts are not callable as API handlers. |
| **DB persistence** | `ready_for_design` | 16-table PostgreSQL DDL designed in `PLAN_SCANNER_DATA_MODEL.md`. 14-entity JSON shadow model built in S17. No migrations applied. No Supabase schema touched. |
| **Review workflow** | `prototype_ready` | Static HTML review form (S14) generates downloadable JSON. Writeback (S10) applies answers. Full loop proven in S15 demo. No server-side answer processing or live form submission. |
| **Human teaching loop** | `prototype_ready` | Full loop: question → answer JSON → writeback → annotated output → report. 8 answer types supported. Demo validates mechanism. No real answers submitted. |
| **BOQ approval flow** | `not_ready` | 0 items approved. No approval UI. No operational_approver_id concept enforced at runtime. DB constraint designed but not applied. No approver role model. |
| **Measurement / calibration** | `blocked_by_manual_validation` | Scale calibration_done=None. Fallback 1:500 not confirmed. All 9,407.7 m provisional. Calibration requires two known-distance points from the PDF — a human decision. |
| **Element taxonomy** | `blocked_by_manual_validation` | G-001 (122,781 paths, largest group) classified as `review`. G-005, G-006, G-011 also unresolved. These groups dominate the BOQ element branch. Cannot close BOQ until classified. |
| **Sign-code intelligence** | `blocked_by_manual_validation` | 0 / 177 sign codes confirmed. 7 partial codes unresolved (6× suffix "33" with 4 candidates, 1× suffix "86" with 0 candidates). Legend labels missing — codes cannot be definitively identified without them. |
| **Audit trail** | `prototype_ready` | 711 append-only events in local JSON. Event structure matches planned `plan_audit_events` table (no UPDATE/DELETE by design). Ready to migrate directly to DB. |
| **Permissions / security** | `not_ready` | No roles model. No auth checks on any scan, BOQ, or approval operation. No RLS policies designed. No separation between operator/reviewer/approver. |
| **Performance** | `research_only` | Tested on one PDF (heavy script: 30–200 s for S3/S5/S6). No benchmarking. No timeouts or resource limits. Not suitable for concurrent use or queue-based execution. |
| **Multi-plan support** | `not_ready` | PLAN-001 / RUN-001 hardcoded throughout. Output paths are absolute, not plan-scoped. Adding a second plan would overwrite existing outputs. |
| **Error handling** | `research_only` | Basic Python exception propagation. No retry logic, no partial-run recovery, no stage-level rollback. A failed stage leaves outputs in unknown state. |
| **Rollback / reproducibility** | `prototype_ready` | Pipeline is deterministic on the same input PDF. Re-running regenerates all outputs. Source PDF is the ground truth. Audit log preserves prior state values where applicable. |

**Summary:**

| Status | Count | Areas |
|---|---|---|
| `ready_for_design` | 1 | DB persistence |
| `prototype_ready` | 6 | Scan orchestration, Review workflow, Teaching loop, Audit trail, Rollback |
| `research_only` | 3 | File storage, Performance, Error handling |
| `blocked_by_manual_validation` | 3 | Measurement, Element taxonomy, Sign-code intelligence |
| `not_ready` | 4 | Upload/intake, BOQ approval, Permissions/security, Multi-plan |
| `blocked_by_data_model` | 0 | — (data model is ready for design) |
| `blocked_by_missing_ui` | 0 | — (review UI exists at prototype level) |

**Overall readiness: research-only / pre-production.** The system is solid for a research POC. No area currently meets the bar for production use.

---

## 3. Critical Blockers Before Production

These must be resolved before any production deployment. They are listed in dependency order — later items cannot be addressed until earlier ones are resolved.

### Blocker 1 — Scale calibration not validated *(CRITICAL)*
All 9,407.7 m of linear measurements derive from an assumed 1:500 scale that was not detected in the PDF. Every length-based BOQ quantity (guard rails, road markings, cable runs) is provisional. A human must identify two known-distance reference points in the PDF and enter them into `calibration_template.json`. Until this is done, no linear measurement can be trusted operationally.

### Blocker 2 — Legend labels missing *(CRITICAL)*
13 legend rows were detected but 0 labels were extracted. Sign identity in the map depends on matching visual icons to legend entries. Without labels, sign codes cannot be confirmed from the legend source of truth. The Vision API path is intentionally disabled (no paid API); manual label entry is the only current option.

### Blocker 3 — Sign codes unresolved *(CRITICAL)*
0 / 177 sign occurrences have a confirmed 3-digit code. 6 occurrences carry suffix "33" with 4 expansion candidates (133, 233, 433, 633) — none can be auto-selected. 1 occurrence carries "86" with no valid expansion at all. Until human review assigns codes, the sign count is unreliable and the BOQ sign-type breakdown is meaningless.

### Blocker 4 — High-impact element groups unclassified *(HIGH)*
G-001 (122,781 paths) is the largest element group and is classified as `review`. G-005, G-006, G-011 are also unresolved. These groups could represent road markings, construction lines, or irrelevant geometry. Without classification, the element-branch BOQ quantities cannot be validated.

### Blocker 5 — Color taxonomy unconfirmed *(HIGH)*
4 color taxonomy candidates require human confirmation (e.g. what does the orange geometry represent on this specific plan type). Taxonomy rules cascade: a wrong taxonomy rule misclassifies hundreds of elements.

### Blocker 6 — No real human answers applied *(HIGH)*
The teaching loop has been proven in demo (S15) but 0 real answers have been submitted. The writeback mechanism, contradiction detection, and scope escalation have never processed a real human decision. This is a prerequisite for trusting any annotated output.

### Blocker 7 — BOQ has 0 approved items *(CRITICAL — by design)*
The `approved_for_boq: false` constraint is intentional and correct. No item should be approved until Blockers 1–6 are resolved. The approval gate requires a named operational_approver_id and a separate UI — neither exists yet.

### Blocker 8 — No DB schema applied *(DESIGN — not a bug)*
The 16-table PostgreSQL DDL exists in `PLAN_SCANNER_DATA_MODEL.md` and the 14-entity JSON shadow exists in S17. No migrations have been applied to Supabase. This is correct for the current phase. The DB schema must be reviewed and approved before any migration.

### Blocker 9 — No upload / storage workflow *(ARCHITECTURE)*
There is no way to ingest a new plan PDF into the system programmatically. All inputs are local hardcoded paths. A production system needs an upload endpoint, file storage (Supabase Storage or equivalent), and a plan_id–based output path structure.

### Blocker 10 — No permissions / roles model implemented *(SECURITY)*
No role separation between operator (submits plan), reviewer (answers questions), and approver (approves BOQ). No RLS policies. No auth checks at any stage boundary. This must be designed before any production data is processed.

### Blocker 11 — No production review / approval UI *(UX)*
The review form (S14) is a static HTML file that generates a downloadable JSON. There is no live form submission, no answer persistence, no reviewer dashboard, no approval workflow UI. Building this requires DB persistence (Blocker 8) and permissions (Blocker 10) to be resolved first.

### Blocker 12 — Single-plan limitation *(ARCHITECTURE)*
The entire pipeline is hardcoded to one plan. Output directories are not plan-scoped. Running a second plan would overwrite all existing outputs. Multi-plan support requires plan_id routing at every stage.

---

## 4. What Is Safe To Do Next

These actions are safe, reversible, and keep all changes in the research domain.

### Safe
- **Draft Supabase schema SQL file** — create a `.sql` migration file in `research/cad-pdf-intelligence/` only. Do not apply it to Supabase. Review it against `PLAN_SCANNER_DATA_MODEL.md` for completeness. This costs nothing and produces an artifact that can be reviewed before any DB change.
- **Build a local prototype upload/intake wrapper** — write a small Python script under `research/` that accepts a new PDF path, copies it to a plan-scoped run directory (`runs/<plan_slug>/`), and runs the pipeline against it. Plan-scoped directories have explicit retention lifecycles; source PDFs are not assumed to be permanent. This stays entirely local and does not touch production.
- **Submit one real/safe answer** — identify one low-risk question (e.g. confirm a sign code that has only one plausible candidate), submit a real answer JSON, run the writeback (S10), and re-run the local persistence flow (S30) to validate the full round-trip. This is research-only and reversible.
- **Artifact storage design** — design the storage path convention, file naming, and presigned URL approach for Supabase Storage. Document only; do not configure.
- **Production UI design mockup (Figma / wireframe only)** — design the sidebar feature, review workflow, and BOQ approval screen. Design artifacts only; do not add any route, component, or DB call to the production codebase.
- **Harden the local prototype** — add a "reload state" button in the prototype shell HTML, improve error display, add a link to the review form directly from each pending question. All changes in `research/` only.

### Requires Caution (proceed with explicit approval only)
- Applying any Supabase migration — requires full review of the migration file and explicit confirmation before `supabase db push`.
- Adding a new sidebar route or component — requires production UI design to be approved first.
- Committing any `human_review_answers.json` with real field data — must be verified not to contain incorrect or unchecked values before applying.

---

## 5. What Is Not Safe Yet

These actions must not be taken until the blockers in Section 3 are resolved.

| Action | Reason |
|---|---|
| Integrate into production sidebar | DB schema not applied; permissions not designed; BOQ approval not implemented; multi-plan not supported; feature flag not implemented |
| Apply DB migrations | Schema not reviewed in context of full Supabase project; RLS policies not designed; retention lifecycle fields not yet in SQL draft; migration must be done on a branch, not main |
| Approve BOQ automatically | 45/47 items require review; scale unvalidated; sign codes unresolved; Blocker 7 is intentional |
| Use research quantities operationally | All linear measurements are provisional (Blocker 1); sign counts unconfirmed (Blocker 3) |
| Treat current sign-code outputs as final | 0/177 confirmed codes; partial codes unresolved; legend labels missing |
| Rely on one sample plan as universal | The pipeline is tuned to one PDF. Color taxonomy, scale, legend format, and element geometry will differ on other plans. Results may degrade significantly on a different plan. |
| Use demo answers as real answers | `human_review_answers.demo.json` carries `demo: true, not_for_operational_use: true`. It must never be renamed or copied to `human_review_answers.json`. |
| Skip the approval gate for any BOQ item | `approved_for_boq: false` is the invariant. It must not be set to `true` without a named approver, a review session, and a DB constraint enforcing it. |
| Design Supabase Storage as a permanent PDF archive | The scanner is a scan-and-export tool; source files carry a retention policy. The storage design must honour `keep_outputs_only` as the default — not permanent storage. |

---

## 6. Recommended Next Build Sequence

The user's proposed A→E sequence is correct and is adopted here in full. The reasoning for each step and dependency is provided below.

### Step A — Supabase Schema Draft (migration file only, not applied)

**Why first:** The data model (PLAN_SCANNER_DATA_MODEL.md) and the JSON shadow (S17) are design artifacts. The first concrete step toward production is translating them into an actual `.sql` migration file. This is low-risk (nothing is applied), produces a reviewable artifact, and forces any gaps in the schema design to surface before code is written against it.

**Deliverable:** `research/cad-pdf-intelligence/migrations/001_plan_scanner_schema.sql` — full DDL for all 16 tables, indexes, check constraints (including `boq_no_auto_approval`), and RLS policy stubs. Not applied. Not committed to a DB-touching branch.

**Dependency:** None. Can be done immediately.

### Step B — Research Upload / Intake Wrapper

**Why second:** The pipeline is hardcoded to one PDF on one hardcoded path. Before multi-plan support or production integration, prove that the pipeline can accept a different PDF and produce plan-scoped outputs under a new `plan_id`. This wrapper stays entirely under `research/` and does not touch production.

**Deliverable:** `research/cad-pdf-intelligence/31_upload_intake_wrapper.py` — accepts a PDF path argument, creates a plan-scoped output directory (`outputs/<plan_id>/`), runs the pipeline against the new PDF, and generates a plan-scoped `plan_scan_state.json`. Tests that a second plan does not overwrite the first.

**Dependency:** Step A can inform the intake wrapper's plan_id structure.

### Step C — Local Review Answer Test (one real/safe answer)

**Why third:** The teaching loop has been proven in demo (S15) with seeded fake answers. It has never been exercised with a real human decision on a real question. Before building any review UI, validate the full loop once: pick one low-risk, unambiguous question, write a real answer JSON, run writeback (S10), re-run S17, and confirm that the state updates correctly.

**Target question:** Choose a sign occurrence where the auto-detected code has only one valid expansion candidate (not suffix "33" which has 4 candidates). Alternatively, submit a `legend_label` answer for one row with a clearly readable label.

**Deliverable:** One real `human_review_answers.json` (single answer), updated `human_review_application.json`, updated `local_state/` files, confirmed round-trip in the prototype shell.

**Dependency:** Step A (schema awareness is useful context). Step B (plan-scoped paths are not required for this step — can run on PLAN-001 still).

### Step D — Production UI Design Spec (Figma / design doc only)

**Why fourth:** Before writing a single production component, lock the UX design. The sidebar feature, review workflow, and BOQ approval screen need to be designed with the actual DB schema (Step A) and real workflow (Step C) in mind. Design decisions made now will be hard to reverse once code touches the production sidebar.

**Deliverable:** `docs/superpowers/specs/YYYY-MM-DD-plan-scanner-sidebar-design.md` — UI spec covering: sidebar entry point, plan upload flow, scan progress view, review question UI, BOQ approval screen, and permissions/role display. Companion Figma mockups if desired.

**Dependency:** Steps A–C should be complete so the design reflects a validated workflow, not a hypothetical one.

### Step E — Controlled DB Migration Branch

**Why last:** Only after Steps A–D are complete: the schema has been reviewed, the intake wrapper proves multi-plan isolation, the real answer test validates the writeback loop, and the UI spec is approved. Then — and only then — create a `feature/plan-scanner-db` branch, apply the migration to a Supabase preview environment (not main/production), seed with the research data from one real plan, and test the full loop against the live DB.

**Deliverable:** Migration applied on preview branch. Pipeline adapted to write to Supabase tables instead of local JSON. S17 local persistence flow becomes the test oracle (compare DB state to JSON state).

**Dependency:** All of Steps A–D.

---

**One recommended addition between C and D:** After the real answer test in Step C succeeds, run the local prototype shell against the updated state and confirm that every section in the prototype shell reflects the answer. This closes the "local JSON → human answer → updated state → prototype" round-trip and de-risks the DB migration in Step E.

---

## 7. Sidebar Integration Criteria

The following conditions must ALL be true before building the production sidebar feature (`/admin/plan-scanner` or equivalent).

### Data Model
- [ ] DB schema (Step A migration) reviewed and approved by technical lead
- [ ] RLS policies designed for all 16 tables (operator / reviewer / approver roles)
- [ ] `boq_no_auto_approval` CHECK constraint included and verified in migration
- [ ] `plan_audit_events` table enforced as append-only (no UPDATE/DELETE triggers or RLS that allow modification)

### Storage & Artifacts (Scanner, Not Archive)
- [ ] Artifact storage path convention agreed (Supabase Storage bucket, folder structure)
- [ ] Presigned URL strategy defined for PDF source files and scan outputs
- [ ] Evidence crops and overlay images linked to `plan_artifacts` table rows
- [ ] **Retention policy designed and enforced:** default `keep_outputs_only`; source PDF is temporary by default — not permanently stored
- [ ] **`plan_files.storage_status`** column tracks `temporary → retained / deleted / export_only`; `expires_at` and `deleted_at` are populated per policy
- [ ] **`plan_artifacts.artifact_type`** distinguishes `source_upload` / `temporary_working_file` (ephemeral) from `generated_output` / `boq_report` / `printable_report` (durable)
- [ ] Supabase Storage bucket lifecycle rules honour the retention policy (auto-expiry for `ephemeral_scan_only`)
- [ ] DB records, BOQ items, audit trail, and generated outputs persist permanently even when the source PDF is deleted

### Scan Run Lifecycle
- [ ] Scan run can be triggered by plan_id (not hardcoded PDF path)
- [ ] Each stage writes status to `plan_scan_runs` table on completion
- [ ] A failed stage produces a recoverable error state (not silent corruption of outputs)
- [ ] Re-running a stage for the same run_id is safe (idempotent or creates a new run)

### Review & Approval Workflow
- [ ] Review questions are persisted in `plan_review_questions` table, not only in local JSON
- [ ] Human answers are persisted in `plan_human_answers` table with reviewer identity
- [ ] BOQ approval requires `operational_approver_id IS NOT NULL` (enforced by DB constraint)
- [ ] No UI surface allows setting `approved_for_boq: true` without an explicit approval action by a named approver
- [ ] Contradiction detection works against DB records (not only local JSON)

### Performance
- [ ] Scan of a typical plan PDF completes in an acceptable time (target: < 5 minutes for the scan run, excluding manual review)
- [ ] Dashboard and prototype shell load in < 3 seconds with 10+ plans in the DB
- [ ] No synchronous long-running operations block the main request thread

### Error Handling
- [ ] Every stage has a defined error state and a clear recovery path visible to the operator
- [ ] A plan with a corrupted or unreadable PDF produces a graceful error, not a crash
- [ ] Partial runs (e.g. scale calibration pending) display clearly as incomplete, not as complete

### Permissions / Roles (Scanner, not archive — access control)
- [ ] At minimum three roles are defined: `plan_uploader` (submit plan), `plan_reviewer` (answer questions), `plan_boq_approver` (approve BOQ)
- [ ] `plan_rule_admin` role exists for company-wide teaching rule management
- [ ] No user with only `plan_uploader` or `plan_reviewer` role can trigger BOQ approval
- [ ] Audit events record the user identity for every state change
- [ ] **Feature flag / permission gate:** plan scanner is NOT visible to all authenticated users — gated behind `plan_scanner` permission or admin role
- [ ] Field workers have NO access to the plan scanner sidebar entry — engineering/planning role only

### Validation
- [ ] At least one full real plan (not the research POC PDF) has been run through the pipeline and reviewed end-to-end
- [ ] Scale calibration has been completed for at least one plan
- [ ] At least 5 real human answers have been applied and confirmed correct by a domain expert

---

## 8. Final Recommendation

**What should we do next?**

**Recommendation: Step A — Draft the Supabase schema migration file.**

The data model is designed (`PLAN_SCANNER_DATA_MODEL.md`), the JSON shadow exists (S17), and 17 pipeline stages are stable. The highest-value, lowest-risk next action is to translate the designed schema into an actual SQL migration file that can be reviewed.

This produces a concrete, reviewable artifact that:
- forces any schema gaps to surface before code is written
- gives a fixed target for Steps B–E to align against
- costs nothing (no DB changes, no production risk)
- can be done in a single session

**Do not start with:**
- DB migration application (Step E) — premature without review and without a validated workflow
- Production sidebar code — design spec (Step D) must come first
- Automated BOQ approval — no items are ready; blockers 1–6 must be resolved by human review
- Manual validation batch (scale, legend labels, sign codes) — these are important but can proceed in parallel with Steps A–B, not as a prerequisite to them

**Manual validation** (scale calibration, real answer submission, legend labels, sign-code confirmation) should proceed as a **parallel track** — not as a blocker to the build sequence. Each validated answer improves the system; the build sequence prepares the infrastructure to receive those answers at production scale.

---

## Confirmation

| Item | Status |
|---|---|
| DB migrations applied | **None** |
| Production UI modified | **None** |
| Production DB modified | **None** |
| Production flows modified | **None** |
| Paid API used | **No** |
| Supabase schema modified | **No** |
| `approved_for_boq` set to true anywhere | **No** |
| requires_review preserved | **Yes — 45/47 BOQ items, all pending sign occurrences** |
| Audit trail preserved | **Yes — 711 events, append-only** |

---

*Research-only. All quantities provisional. No BOQ item is approved for operational use.*
