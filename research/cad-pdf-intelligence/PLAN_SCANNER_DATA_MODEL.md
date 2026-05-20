# Plan Scanner — Data Model & Persistence Design

**Module:** סורק תוכניות (Plan Scanner)  
**Research directory:** `research/cad-pdf-intelligence/`  
**Document date:** 2026-05-20  
**Status:** Design only — no migrations applied, no production DB modified  
**Target DB:** Supabase (PostgreSQL 15+)  
**Schema strategy:** Normalized relational columns for stable, searchable fields; `JSONB` for complex or evolving payloads

---

## Design Principles

- **Scanner, not archive.** The Plan Scanner is a scan-and-export tool. The source PDF is a temporary working input, not a permanent archive asset. The valuable outputs are the scan results (BOQ draft, measurements, review questions, report). Source files carry a retention policy and may be deleted after scan completion. The DB record and all scan results persist even after the source file is deleted.
- **Ephemeral source, durable results.** Default retention policy is `keep_outputs_only`: scan outputs are kept indefinitely; the source PDF is held only until export/download. Long-term source archival must be explicitly opted into.
- **Run directory is temporary.** Each scan run gets a plan-scoped directory (`runs/<plan_slug>/`). This directory has a lifecycle: `created → scanning → outputs_generated → exported → cleanup_pending → source_deleted → archived_if_requested`. It is not a permanent document archive by default.
- **Never auto-approve for BOQ.** `approved_for_boq` is always `false` by default and can only be set by a human gate, not by any pipeline stage or API route.
- **Human review ≠ BOQ approval.** These are separate states with separate actors and timestamps.
- **Preserve originals.** Every human correction preserves the original auto-detected value alongside it.
- **JSONB where payloads evolve.** Use relational columns for fields that are filtered, indexed, or joined. Use `JSONB` for nested auto-results, evidence, geometry, audit trails.
- **Audit everything.** Every state change writes an immutable `plan_audit_events` row.

---

## 1. Core Entities

### 1.1 `plans`

Top-level record for one engineering plan document.

```sql
CREATE TABLE plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID REFERENCES projects(id),          -- future: link to project
  name            TEXT NOT NULL,
  description     TEXT,
  plan_type       TEXT DEFAULT 'traffic_signs',          -- traffic_signs / road_marking / infrastructure
  status          TEXT NOT NULL DEFAULT 'draft'          -- draft / scanning / ready_for_review / approved / archived
                  CHECK (status IN ('draft','scanning','ready_for_review','approved','archived')),
  approved_for_boq BOOLEAN NOT NULL DEFAULT FALSE,       -- NEVER auto-set to true
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 1.2 `plan_files`

Uploaded PDF source files attached to a plan.

```sql
CREATE TABLE plan_files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  file_name       TEXT NOT NULL,
  storage_bucket  TEXT NOT NULL DEFAULT 'plan-files',
  storage_path    TEXT NOT NULL,                         -- Supabase Storage object key
  file_size_bytes BIGINT,
  mime_type       TEXT DEFAULT 'application/pdf',
  page_count      INTEGER,
  checksum_sha256 TEXT,                                  -- for deduplication
  revision_label  TEXT,                                  -- e.g. "Rev-3", "2026-05-20"
  uploaded_by     UUID REFERENCES auth.users(id),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- ── Scanner-not-archive: source file retention lifecycle ──────────────────
  retention_policy TEXT NOT NULL DEFAULT 'keep_outputs_only'
                   CHECK (retention_policy IN (
                     'ephemeral_scan_only',              -- auto-delete after scan completes
                     'keep_outputs_only',                -- DEFAULT: keep results, delete source after export
                     'keep_source_until_export',         -- keep source until user downloads results
                     'keep_source_for_project_archive',  -- explicit long-term retention (user opt-in)
                     'manual_delete_after_scan'          -- user decides when to delete
                   )),
  storage_status   TEXT NOT NULL DEFAULT 'temporary'
                   CHECK (storage_status IN (
                     'temporary',    -- file is in temporary storage, may be deleted
                     'retained',     -- user explicitly chose to keep this file
                     'deleted',      -- source file deleted; DB record and scan results remain
                     'export_only'   -- file exists only in export package, not in primary storage
                   )),
  expires_at       TIMESTAMPTZ,                          -- NULL = no auto-expiry; set per retention_policy
  deleted_at       TIMESTAMPTZ                           -- set when source file deleted; record stays
  -- NOTE: deleting a plan_file row is NOT the same as deleting the scan results.
  -- scan results (plan_boq_items, plan_sign_occurrences, etc.) are never cascade-deleted
  -- when a plan_file is deleted. Only the source file reference is removed.
);
```

---

### 1.3 `plan_scan_runs`

One end-to-end pipeline execution for a plan file.

```sql
CREATE TABLE plan_scan_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id          UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  plan_file_id     UUID REFERENCES plan_files(id),
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','running','completed','failed','aborted')),
  pipeline_version TEXT,                                 -- git SHA or semver
  stages_ok        INTEGER DEFAULT 0,
  stages_total     INTEGER DEFAULT 16,
  run_metadata     JSONB DEFAULT '{}',                   -- stage timings, warnings, red flags, summary
  triggered_by     UUID REFERENCES auth.users(id),
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**`run_metadata` JSONB shape (example):**
```json
{
  "stages": [{"stage_id": "S1", "status": "ok", "elapsed_s": 0.12}],
  "red_flags": [{"severity": "CRITICAL", "code": "SCALE-UNCALIBRATED"}],
  "warnings": ["Scale fallback 1:500 used"]
}
```

---

### 1.4 `plan_pages`

Individual pages extracted from a plan PDF.

```sql
CREATE TABLE plan_pages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  plan_file_id  UUID REFERENCES plan_files(id),
  scan_run_id   UUID REFERENCES plan_scan_runs(id),
  page_number   INTEGER NOT NULL,
  page_label    TEXT,
  width_pt      NUMERIC,
  height_pt     NUMERIC,
  page_type     TEXT DEFAULT 'unknown'
                CHECK (page_type IN ('drawing','title_block','legend','detail','overview','unknown')),
  geometry      JSONB DEFAULT '{}',     -- viewport bbox, drawing_area bbox, title_block bbox
  scan_metadata JSONB DEFAULT '{}'      -- raw page extraction metadata
);
```

---

### 1.5 `plan_legend_items`

Legend rows extracted from the plan's legend (מקרא) section.

```sql
CREATE TABLE plan_legend_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  scan_run_id     UUID REFERENCES plan_scan_runs(id),
  page_number     INTEGER,
  row_index       INTEGER NOT NULL,
  -- Human-readable labels (may be null if not yet extracted or confirmed)
  hebrew_label    TEXT,
  english_label   TEXT,
  sign_code       INTEGER,
  quantity        NUMERIC,
  confidence      TEXT DEFAULT 'unknown',
  label_source    TEXT DEFAULT 'pending'
                  CHECK (label_source IN ('auto_detected','human_review','pending','vision_api')),
  requires_review BOOLEAN NOT NULL DEFAULT TRUE,
  approved_for_boq BOOLEAN NOT NULL DEFAULT FALSE,       -- NEVER auto-set
  human_answer_id UUID REFERENCES plan_human_answers(id),
  -- JSONB payloads
  geometry        JSONB DEFAULT '{}',    -- row_bbox_px, row_bbox, icon_bbox, text_bbox
  auto_result     JSONB DEFAULT '{}',    -- raw extraction output (uncertainty, source, etc.)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 1.6 `plan_sign_occurrences`

Each detected sign location in the drawing.

```sql
CREATE TABLE plan_sign_occurrences (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id    TEXT,                                 -- OCC-0001 from pipeline
  plan_id          UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  scan_run_id      UUID REFERENCES plan_scan_runs(id),
  page_number      INTEGER,
  -- Code detection
  sign_code        INTEGER,                              -- best auto-detected (may be null)
  confirmed_code   INTEGER,                              -- human-confirmed
  confidence       TEXT DEFAULT 'unknown',
  validation_status TEXT DEFAULT 'unknown',
  -- Review state
  requires_review  BOOLEAN NOT NULL DEFAULT TRUE,
  approved_for_boq BOOLEAN NOT NULL DEFAULT FALSE,
  human_confirmed  BOOLEAN NOT NULL DEFAULT FALSE,
  human_label_source TEXT,
  -- JSONB payloads
  geometry         JSONB DEFAULT '{}',                   -- bbox, pole location, page coords
  auto_result      JSONB DEFAULT '{}',                   -- poc3_candidates, t1/t2/t3 matches, scores
  evidence         JSONB DEFAULT '{}',                   -- crop paths, overlay paths, review images
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 1.7 `plan_partial_codes`

Ambiguous suffix groups requiring human resolution (e.g. suffix "33" → 133/433/633).

```sql
CREATE TABLE plan_partial_codes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id           UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  scan_run_id       UUID REFERENCES plan_scan_runs(id),
  suffix            TEXT NOT NULL,                       -- "33", "86"
  frequency         INTEGER DEFAULT 0,                   -- occurrences affected
  resolution_status TEXT NOT NULL DEFAULT 'ambiguous'
                    CHECK (resolution_status IN ('ambiguous','human_confirmed','invalid_partial','superseded')),
  resolved_code     INTEGER,                             -- set by human answer
  human_confirmed   BOOLEAN NOT NULL DEFAULT FALSE,
  human_answer_id   UUID REFERENCES plan_human_answers(id),
  requires_review   BOOLEAN NOT NULL DEFAULT TRUE,
  approved_for_boq  BOOLEAN NOT NULL DEFAULT FALSE,
  -- JSONB
  expansion_candidates JSONB DEFAULT '[]',              -- [{code, series, name, in_catalog, t3_prior}]
  stage_metadata       JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 1.8 `plan_element_groups`

Vector path groups from element decomposition (Branch C — color/type classification).

```sql
CREATE TABLE plan_element_groups (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id              TEXT NOT NULL,                   -- G-001
  plan_id               UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  scan_run_id           UUID REFERENCES plan_scan_runs(id),
  -- Color identity
  color_key             TEXT,                            -- "0.00,0.00,0.00"
  color_rgb8            INTEGER[],                       -- [0,0,0]
  -- Path stats
  n_paths               INTEGER DEFAULT 0,
  n_fill                INTEGER DEFAULT 0,
  n_stroke              INTEGER DEFAULT 0,
  total_length_pt       NUMERIC DEFAULT 0,
  drawing_area_paths    INTEGER DEFAULT 0,
  drawing_area_length_pt NUMERIC DEFAULT 0,
  -- Classification
  classification        TEXT DEFAULT 'review',
  classification_source TEXT DEFAULT 'auto',
  element_type          TEXT,
  confidence            TEXT DEFAULT 'unknown',
  -- Review state
  requires_review       BOOLEAN NOT NULL DEFAULT TRUE,
  approved_for_boq      BOOLEAN NOT NULL DEFAULT FALSE,
  human_confirmed       BOOLEAN NOT NULL DEFAULT FALSE,
  human_include_in_boq  BOOLEAN,
  human_answer_id       UUID REFERENCES plan_human_answers(id),
  -- JSONB
  geometry              JSONB DEFAULT '{}',              -- sample_bboxes, zone_breakdown
  auto_result           JSONB DEFAULT '{}',              -- notes, boq_category, raw classification
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 1.9 `plan_measurements`

Scale calibration and linear/area measurement results.

```sql
CREATE TABLE plan_measurements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id               UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  scan_run_id           UUID REFERENCES plan_scan_runs(id),
  measurement_type      TEXT NOT NULL
                        CHECK (measurement_type IN ('scale','linear','area','calibration_reference')),
  -- Scale
  assumed_scale         TEXT,                            -- "1:500"
  scale_ratio           NUMERIC,                         -- e.g. 500
  scale_source          TEXT DEFAULT 'assumed'
                        CHECK (scale_source IN ('title_block','human_calibration','assumed','computed')),
  scale_status          TEXT DEFAULT 'unverified',
  -- Calibration points (for human_calibration source)
  calibration_point_a   JSONB,                           -- {x_pt, y_pt, label}
  calibration_point_b   JSONB,                           -- {x_pt, y_pt, label}
  real_world_distance_m NUMERIC,
  px_per_m              NUMERIC,
  -- Measurement results
  total_linear_m        NUMERIC,
  measurement_method    TEXT
                        CHECK (measurement_method IN ('vector_geometry','raster','human_calibration')),
  unit                  TEXT DEFAULT 'm',
  confidence            TEXT DEFAULT 'unknown',
  requires_review       BOOLEAN NOT NULL DEFAULT TRUE,
  human_answer_id       UUID REFERENCES plan_human_answers(id),
  -- Full payload
  measurement_payload   JSONB DEFAULT '{}',              -- type_totals_m, runs, color_taxonomy
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 1.10 `plan_boq_items`

Unified BOQ line items — the central output requiring human approval before any operational use.

```sql
CREATE TABLE plan_boq_items (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boq_item_id                  TEXT NOT NULL,             -- BOQ-CNT-001
  plan_id                      UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  scan_run_id                  UUID REFERENCES plan_scan_runs(id),
  -- Classification
  item_category                TEXT NOT NULL,             -- counted / measured_linear / measured_area / review_item / ...
  item_type                    TEXT,
  description_he               TEXT,
  description_en               TEXT,
  source_branch                TEXT,                      -- sign_review / element_decomp / ...
  -- Quantity
  quantity                     NUMERIC,
  unit                         TEXT,
  confidence                   TEXT DEFAULT 'unknown',
  -- Review state
  requires_review              BOOLEAN NOT NULL DEFAULT TRUE,
  boq_status                   TEXT NOT NULL DEFAULT 'draft_research'
                               CHECK (boq_status IN (
                                 'draft_research','pending_review','human_reviewed',
                                 'accepted_for_draft','rejected','needs_more_info',
                                 'pending_final_approval','approved_for_boq',
                                 'exported_to_operations','superseded'
                               )),
  -- Human review (separate from BOQ approval)
  human_reviewed               BOOLEAN NOT NULL DEFAULT FALSE,
  human_review_status          TEXT,
  human_reviewer_id            UUID REFERENCES auth.users(id),
  human_review_timestamp       TIMESTAMPTZ,
  human_review_notes           TEXT,
  -- BOQ approval (separate gate — must be performed by authorized person)
  approved_for_boq             BOOLEAN NOT NULL DEFAULT FALSE,   -- NEVER auto-set
  operational_approver_id      UUID REFERENCES auth.users(id),
  operational_approval_timestamp TIMESTAMPTZ,
  operationally_approved       BOOLEAN NOT NULL DEFAULT FALSE,
  -- Correction tracking
  corrected_quantity           NUMERIC,
  corrected_unit               TEXT,
  corrected_description_he     TEXT,
  corrected_description_en     TEXT,
  -- JSONB payloads (preserve originals)
  original_auto_quantity       NUMERIC,                   -- preserved from first detection
  auto_result                  JSONB DEFAULT '{}',        -- original auto detection
  evidence                     JSONB DEFAULT '{}',        -- source_ids, evidence_paths, detail
  audit_trail                  JSONB DEFAULT '[]',        -- append-only change log
  review_reason                TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT boq_no_auto_approval CHECK (
    -- Enforce: only set approved_for_boq if operational_approver_id is also set
    (approved_for_boq = FALSE) OR (operational_approver_id IS NOT NULL)
  )
);
```

---

### 1.11 `plan_review_questions`

Structured review questions generated by the teaching loop (S12 Answer Pack).

```sql
CREATE TABLE plan_review_questions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id      TEXT NOT NULL,                         -- Q-33-1, Q-SCALE-001
  plan_id          UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  scan_run_id      UUID REFERENCES plan_scan_runs(id),
  question_type    TEXT NOT NULL,                         -- 8 types (see §6)
  priority         TEXT NOT NULL DEFAULT 'medium'
                   CHECK (priority IN ('critical','high','medium','low')),
  status           TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','answered','superseded','ignored','blocked')),
  blocked_by       TEXT,                                  -- question_id that must be answered first
  answer_id        UUID REFERENCES plan_human_answers(id),
  -- Full question payload
  question_payload JSONB NOT NULL DEFAULT '{}',           -- context, evidence, allowed schema, example
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at      TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 1.12 `plan_human_answers`

Human answers submitted via the review form or teaching loop.

```sql
CREATE TABLE plan_human_answers (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id              TEXT NOT NULL,                   -- A-001, D-001 (demo)
  plan_id                UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  scan_run_id            UUID REFERENCES plan_scan_runs(id),
  question_id            TEXT,
  answer_type            TEXT NOT NULL
                         CHECK (answer_type IN (
                           'partial_code_resolution','element_group_classification',
                           'scale_calibration','color_taxonomy_rule','sign_code_confirmation',
                           'ignore_rule','legend_label','boq_review'
                         )),
  scope                  TEXT NOT NULL DEFAULT 'current_plan_only'
                         CHECK (scope IN (
                           'current_plan_only','project_rule',
                           'company_rule_candidate','company_rule_approved'
                         )),
  answered_by            UUID REFERENCES auth.users(id),
  answered_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Demo / safety flags
  demo                   BOOLEAN NOT NULL DEFAULT FALSE,
  not_for_operational_use BOOLEAN NOT NULL DEFAULT FALSE,
  approved_for_boq       BOOLEAN NOT NULL DEFAULT FALSE,  -- NEVER auto-set to true
  -- Contradiction detection
  contradiction_detected  BOOLEAN NOT NULL DEFAULT FALSE,
  requires_review         BOOLEAN NOT NULL DEFAULT TRUE,
  -- Full payload
  answer_payload          JSONB NOT NULL DEFAULT '{}',    -- all answer fields, typed per answer_type
  audit_trail             JSONB DEFAULT '[]',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**`answer_payload` shapes by `answer_type`:**

| Type | Key fields in payload |
|---|---|
| `partial_code_resolution` | `partial_code`, `resolved_full_code`, `notes` |
| `element_group_classification` | `group_id`, `classification`, `include_in_boq`, `notes` |
| `scale_calibration` | `calibration_id`, `point_a`, `point_b`, `real_world_distance_m` |
| `color_taxonomy_rule` | `color`, `element_type`, `action_type` |
| `sign_code_confirmation` | `occurrence_id`, `confirmed_code`, `source` |
| `ignore_rule` | `target_type`, `target_id`, `reason` |
| `legend_label` | `row_index`, `hebrew_label`, `english_label`, `sign_code`, `quantity` |
| `boq_review` | `boq_item_id`, `review_status` or `review_decision`, `override_quantity` |

---

### 1.13 `plan_teaching_rules`

Persistent rules that apply across plans (project-level or company-level).

```sql
CREATE TABLE plan_teaching_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type           TEXT NOT NULL,                      -- same 8 answer_types
  scope               TEXT NOT NULL
                      CHECK (scope IN (
                        'project_rule','company_rule_candidate','company_rule_approved'
                      )),
  -- current_plan_only answers do NOT become teaching rules
  rule_payload        JSONB NOT NULL DEFAULT '{}',         -- rule content
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  applies_to_project_id UUID REFERENCES projects(id),     -- null for company-wide rules
  source_answer_id    UUID REFERENCES plan_human_answers(id),
  created_by          UUID REFERENCES auth.users(id),
  approved_by         UUID REFERENCES auth.users(id),     -- required for company_rule_approved
  approved_at         TIMESTAMPTZ,
  superseded_by       UUID REFERENCES plan_teaching_rules(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 1.14 `plan_review_sessions`

A tracked session in which a human reviews questions.

```sql
CREATE TABLE plan_review_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id             UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  scan_run_id         UUID REFERENCES plan_scan_runs(id),
  reviewer_id         UUID REFERENCES auth.users(id),
  session_type        TEXT NOT NULL
                      CHECK (session_type IN ('teaching_loop','boq_review','boq_approval','calibration')),
  status              TEXT NOT NULL DEFAULT 'in_progress'
                      CHECK (status IN ('in_progress','completed','abandoned','paused')),
  questions_answered  INTEGER DEFAULT 0,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  session_metadata    JSONB DEFAULT '{}'                  -- form version, answers file path, etc.
);
```

---

### 1.15 `plan_audit_events`

Immutable audit log — append-only, never updated or deleted.

```sql
CREATE TABLE plan_audit_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        UUID REFERENCES plans(id),
  event_type     TEXT NOT NULL,                           -- file_uploaded / scan_started / answer_applied / boq_approved / status_changed / ...
  entity_type    TEXT,                                    -- plan / boq_item / sign_occurrence / legend_item / ...
  entity_id      UUID,
  actor_id       UUID REFERENCES auth.users(id),
  previous_value JSONB,
  new_value      JSONB,
  notes          TEXT,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NO updated_at — this table is append-only
);
```

---

### 1.16 `plan_artifacts`

Registry of all generated files linked to a scan run.

```sql
CREATE TABLE plan_artifacts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id           UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  scan_run_id       UUID REFERENCES plan_scan_runs(id),
  -- ── Artifact classification (scanner-not-archive principle) ───────────────
  artifact_type     TEXT NOT NULL
                    CHECK (artifact_type IN (
                      -- Source files (may be temporary)
                      'source_upload',                   -- original uploaded plan PDF
                      'temporary_working_file',          -- intermediate processing file (auto-delete after scan)
                      -- Generated outputs (durable — the valuable product of the scan)
                      'generated_output',                -- scan result JSON / data file
                      'printable_report',                -- user-facing HTML or PDF report
                      'boq_report',                      -- BOQ draft report (HTML/PDF)
                      'boq_csv',                         -- BOQ export CSV
                      -- Evidence / debug (retain with scan result; deletable if storage constrained)
                      'evidence_artifact',               -- crop image, overlay, debug visual
                      'pipeline_summary',                -- pipeline run summary JSON
                      'calibration'                      -- calibration reference data
                    )),
  stage_id          TEXT,                                 -- S1..S18
  file_name         TEXT NOT NULL,
  storage_bucket    TEXT,
  storage_path      TEXT,
  file_size_bytes   BIGINT,
  mime_type         TEXT,
  checksum_sha256   TEXT,
  -- ── Storage lifecycle ─────────────────────────────────────────────────────
  storage_status    TEXT NOT NULL DEFAULT 'temporary'
                    CHECK (storage_status IN (
                      'temporary',    -- working file; auto-delete eligible
                      'retained',     -- durable output; keep indefinitely
                      'deleted',      -- file deleted; record remains for audit
                      'export_only'   -- lives in export package only
                    )),
  expires_at        TIMESTAMPTZ,                          -- NULL = no auto-expiry
  deleted_at        TIMESTAMPTZ,                          -- set when file is deleted; record stays
  artifact_metadata JSONB DEFAULT '{}',                   -- stage-specific metadata
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NOTE: source_upload and temporary_working_file artifacts default to storage_status='temporary'.
  -- generated_output, printable_report, boq_report, boq_csv default to storage_status='retained'.
);
```

---

## 2. Relationships

```
plans (1)
  ├── plan_files (N)
  ├── plan_scan_runs (N)
  │     ├── plan_pages (N)
  │     ├── plan_legend_items (N)
  │     ├── plan_sign_occurrences (N)
  │     ├── plan_partial_codes (N)
  │     ├── plan_element_groups (N)
  │     ├── plan_measurements (N)
  │     ├── plan_boq_items (N)
  │     ├── plan_review_questions (N)
  │     └── plan_artifacts (N)
  ├── plan_human_answers (N)
  │     └── applied_to → plan_boq_items / plan_sign_occurrences / plan_legend_items / plan_element_groups / plan_partial_codes / plan_measurements
  ├── plan_teaching_rules (N)  [scope = project_rule+]
  ├── plan_review_sessions (N)
  └── plan_audit_events (N)    [immutable]

plan_boq_items (1) ──→ evidence: source_ids (FK plan_sign_occurrences.occurrence_id, plan_element_groups.group_id)
plan_human_answers (1) ──→ updates: plan_boq_items / plan_sign_occurrences / plan_legend_items / plan_element_groups / plan_partial_codes / plan_measurements
plan_teaching_rules ──→ source_answer_id: plan_human_answers (where scope != current_plan_only)
plan_teaching_rules ──→ superseded_by: plan_teaching_rules (self-referential for rule versioning)
```

---

## 3. Status Model

### Scan run status
`pending` → `running` → `completed` | `failed` | `aborted`

### BOQ item status (`boq_status`)
See §4.

### Review question status
`open` → `answered` | `superseded` | `ignored` | `blocked`

### Confidence levels
`unknown` / `low` / `medium` / `high` / `confirmed` / `certain`

### Key boolean flags

| Flag | Default | Set by | Meaning |
|---|---|---|---|
| `requires_review` | `true` | Pipeline | Item needs human decision before use |
| `human_confirmed` | `false` | Human answer | A human has reviewed this item |
| `human_reviewed` | `false` | Human answer | Human has reviewed (BOQ context) |
| `approved_for_boq` | `false` | Human approver only | Item is approved for BOQ inclusion |
| `operationally_approved` | `false` | Authorized approver | Final operational sign-off |
| `contradiction_detected` | `false` | Writeback | New answer conflicts with existing |
| `still_requires_boq_approval` | `true` | System | Even after human review, BOQ gate remains |
| `not_for_operational_use` | `false` | Demo system | Marks demo/seeded data |

---

## 4. BOQ Approval State Machine

```
draft_research
   │ (pipeline generates item)
   ▼
pending_review
   │ (review session opened)
   ▼
human_reviewed ─────────────────────────────────────► rejected
   │ (human submits boq_review answer)                   │
   │                                                      │ (no further action)
   ├──── review_decision = accept_quantity ──►  accepted_for_draft
   │                                               │
   ├──── review_decision = flag_for_site_survey ── needs_more_info ──► (back to pending_review)
   │
   ▼ (accepted_for_draft)
pending_final_approval
   │ (authorized approver reviews)
   ▼
approved_for_boq ────────────────────────────────────► exported_to_operations (future)
   │
   └── (any revision) ──────────────────────────────► superseded
```

**Critical invariants:**
1. `approved_for_boq = true` requires `operational_approver_id IS NOT NULL` (enforced by DB constraint)
2. `accepted_for_draft` ≠ `approved_for_boq` — these are different states
3. `rejected` items may be reinstated by creating a new `plan_human_answers` record
4. No API route or pipeline script may set `approved_for_boq = true` — it requires a dedicated approval endpoint with role check
5. Approval must be logged in `plan_audit_events`

---

## 5. Evidence and Audit Trail

### Per-item evidence fields (in JSONB)

Every detectable item (`plan_sign_occurrences`, `plan_boq_items`, `plan_element_groups`, `plan_legend_items`) carries:

```json
{
  "source_stage": "S3",
  "source_file": "outputs/sign_inventory.json",
  "source_ids": ["POLE-001", "OCC-0001"],
  "page_number": 0,
  "geometry": {
    "bbox": [x1, y1, x2, y2],
    "bbox_normalized": [nx1, ny1, nx2, ny2]
  },
  "crop_path": "outputs/legend_icons/legend_row_0_icon.png",
  "overlay_path": null,
  "confidence_detail": {"t1_match": 0.82, "t3_prior": 4},
  "auto_detection_timestamp": "2026-05-20T...",
  "auto_pipeline_version": "git:abc123"
}
```

### Audit trail append pattern (in `audit_trail` JSONB array)

Every human correction appends to the item's `audit_trail`:

```json
[
  {
    "event": "human_answer_applied",
    "answer_id": "A-001",
    "answer_type": "boq_review",
    "actor_id": "uuid",
    "timestamp": "2026-05-20T...",
    "previous_value": {"boq_status": "pending_review"},
    "new_value": {"boq_status": "accepted_for_draft"},
    "scope": "current_plan_only",
    "notes": "Pole count confirmed in site walk"
  }
]
```

### `plan_audit_events` for all state changes

Every `boq_status` transition, every `approved_for_boq` change, every human answer application writes an immutable row to `plan_audit_events`.

---

## 6. Human Teaching Loop Data Model

### Answer types and their effect

| `answer_type` | Scope options | Updates table | Key effect |
|---|---|---|---|
| `partial_code_resolution` | current / project | `plan_partial_codes`, `plan_sign_occurrences` | Sets `resolved_code`, marks `human_confirmed` |
| `element_group_classification` | current / project / company | `plan_element_groups` | Sets `classification`, `human_include_in_boq` |
| `scale_calibration` | current only | `plan_measurements` | Records calibration points, flags for recalculation |
| `color_taxonomy_rule` | current / project / company | `plan_element_groups` (all matching color) | Sets `element_type` for all groups sharing the color |
| `sign_code_confirmation` | current / project | `plan_sign_occurrences` | Sets `confirmed_code`, `human_confirmed` |
| `ignore_rule` | current / project / company | `plan_element_groups` | Sets `classification = ignore` |
| `legend_label` | current only | `plan_legend_items` | Sets `hebrew_label`, `english_label`, `sign_code` |
| `boq_review` | current only | `plan_boq_items` | Advances `boq_status`, sets `human_reviewed` |

### Scope escalation logic

```
current_plan_only → stored in plan_human_answers, applies to this scan run only
project_rule      → also creates plan_teaching_rules row with project scope
company_rule_candidate → creates plan_teaching_rules with is_active=false; requires approval
company_rule_approved  → plan_teaching_rules with is_active=true; requires authorized approver
```

### Conflict handling

If a new answer contradicts an existing one for the same target:
1. `contradiction_detected = true` on the affected item
2. `requires_review = true` on the affected item
3. New answer is stored but status = `contradiction` in `audit_trail`
4. Alert surfaced in dashboard — never silently overwritten

---

## 7. Measurement / Calibration Model

`plan_measurements` stores calibration and derived measurements:

```json
{
  "measurement_type": "scale",
  "scale_source": "human_calibration",
  "assumed_scale": "1:500",
  "scale_ratio": 500,
  "calibration_point_a": {"x_pt": 120.5, "y_pt": 340.2, "label": "north edge of barrier"},
  "calibration_point_b": {"x_pt": 982.1, "y_pt": 340.2, "label": "south edge of barrier"},
  "real_world_distance_m": 87.5,
  "px_per_m": 9.84,
  "measurement_method": "human_calibration",
  "total_linear_m": 9407.6,
  "confidence": "medium",
  "requires_review": true,
  "measurement_payload": {
    "type_totals_m": {"guardrail": 2400.0, "barrier": 1800.0},
    "runs": []
  }
}
```

**Calibration flow:**
1. Human provides calibration points → `plan_human_answers` (type=`scale_calibration`)
2. Writeback annotates `plan_measurements` with calibration reference
3. `15_scale_measurement.py` is re-run → updates `total_linear_m` and `measurement_payload`
4. New `plan_measurements` row created (old row kept, not overwritten)
5. `plan_audit_events` row written

---

## 8. Artifact Storage Strategy

### Decision matrix

| Artifact type | Storage location | Rationale |
|---|---|---|
| Uploaded plan PDFs | **Supabase Storage** `plan-files` bucket | Large binary, needs access control, version tracking |
| Legend crops / icon images | **Supabase Storage** `plan-artifacts` bucket | Generated per scan run, referenced by evidence JSONB |
| Sign crop images | **Supabase Storage** `plan-artifacts` bucket | Per-occurrence evidence |
| Overlay / annotation images | **Supabase Storage** `plan-artifacts` bucket | Generated, referenced by evidence |
| HTML reports (pipeline) | **Local research only** → Phase 4: object storage | Currently research artifact; not needed in production DB |
| JSON pipeline outputs | **Local research only** → Phase 4: migrated to DB | Fields normalized into DB tables in Phase 3-4 |
| BOQ reports (PDF/CSV) | **Supabase Storage** `plan-artifacts` bucket | Generated on demand, linked from plan_artifacts |
| Calibration template | **Supabase Storage** or **DB JSONB** | Simple JSON; can be stored as JSONB in plan_measurements |
| audit_trail / evidence JSON | **DB JSONB columns** | Structured, queryable, needs to stay with the record |

### `plan_artifacts` table serves as the central registry

Every file stored in Supabase Storage gets a row in `plan_artifacts` with:
- `storage_bucket`, `storage_path` (for Supabase Storage URL construction)
- `artifact_type`, `stage_id` (for filtering by pipeline stage)
- `checksum_sha256` (for deduplication and integrity check)

### Supabase Storage RLS

Storage buckets should use Row Level Security policies:
- `plan-files`: only `uploaded_by` and users with `plan_scanner` permission can read
- `plan-artifacts`: any authenticated user with access to the plan can read

---

## 9. Migration Strategy

**Do not apply any migrations now. This is design-only.**

| Phase | Action | Status |
|---|---|---|
| **Phase 1** | Design only — this document | ✅ Complete |
| **Phase 2** | Draft SQL migrations in `feature/plan-scanner-schema` branch | Not started |
| **Phase 3** | Seed test data from current research JSON outputs | Not started |
| **Phase 4** | Connect local prototype to DB (read/write JSON → DB) | Not started |
| **Phase 5** | Production sidebar integration with full RLS | Not started |

**Phase 2 migration order (when ready):**

```
1. plans
2. plan_files
3. plan_scan_runs
4. plan_pages
5. plan_human_answers           (referenced by legend_items, elements, etc.)
6. plan_legend_items
7. plan_sign_occurrences
8. plan_partial_codes
9. plan_element_groups
10. plan_measurements
11. plan_boq_items
12. plan_review_questions
13. plan_teaching_rules
14. plan_review_sessions
15. plan_audit_events
16. plan_artifacts
```

`plan_audit_events` must have **no FK delete cascades** — it is the permanent record.

---

## 10. Security / Permissions

### Role mapping

| Role | Permissions |
|---|---|
| `plan_uploader` | Upload PDF, trigger scan run, view results |
| `plan_reviewer` | Submit `plan_human_answers`, answer review questions |
| `plan_boq_approver` | Advance `boq_status → approved_for_boq` (the only role that can do this) |
| `plan_rule_admin` | Approve `company_rule_candidate → company_rule_approved` |
| `admin` / `master` | All of the above |

### Key access control rules

1. **BOQ approval gate** — `boq_status = 'approved_for_boq'` may only be set by a route that checks `plan_boq_approver` role. The DB constraint further enforces `operational_approver_id IS NOT NULL`.

2. **Audit trail is append-only** — `plan_audit_events` has no `UPDATE` or `DELETE` policy. All roles can `INSERT`; none can modify existing rows.

3. **Teaching rule approval** — `company_rule_approved` scope requires `plan_rule_admin`. Pipeline scripts may not set this scope.

4. **Demo data isolation** — `plan_human_answers.demo = true` and `not_for_operational_use = true` filter these rows from any operational query. A DB view `plan_human_answers_operational` can exclude demo rows.

5. **Supabase RLS** — Every table gets Row Level Security enabled. Plans are visible only to users in the same organisation (when multi-tenancy is added).

### Preventing accidental approval

- DB constraint on `plan_boq_items`: `approved_for_boq = true` requires `operational_approver_id IS NOT NULL`
- No pipeline script, API route, or writeback ever sets `approved_for_boq = true`
- Every approval writes a `plan_audit_events` row (actor + timestamp mandatory)
- A confirmation UI step is required before any approval action is sent to the API

---

## 11. Data Contract Mapping: Prototype JSON → DB Tables

Source: `outputs/plan_scanner_prototype.json`

### `plan_intake`

| Prototype field | DB table | DB column |
|---|---|---|
| `pdf_name` | `plan_files` | `file_name` |
| `stages_ok` | `plan_scan_runs` | `stages_ok` |
| `total_stages` | `plan_scan_runs` | `stages_total` |
| `pipeline_ok` | computed | `stages_ok = stages_total` |
| `boq_approved` | `plan_boq_items` | `COUNT(*) WHERE approved_for_boq = true` |
| `boq_total` | `plan_boq_items` | `COUNT(*)` |

### `scan_overview`

| Prototype field | DB table | DB column |
|---|---|---|
| `sign_occurrences` | `plan_sign_occurrences` | `COUNT(*)` |
| `sign_codes_confirmed` | `plan_sign_occurrences` | `COUNT(*) WHERE human_confirmed = true` |
| `boq_total` | `plan_boq_items` | `COUNT(*)` |
| `boq_requires_review` | `plan_boq_items` | `COUNT(*) WHERE requires_review = true` |
| `element_groups` | `plan_element_groups` | `COUNT(*)` |
| `red_flags` | `plan_scan_runs.run_metadata` | `run_metadata->'red_flags'` |

### `boq_draft`

| Prototype field | DB table | DB column |
|---|---|---|
| `by_category` | `plan_boq_items` | `GROUP BY item_category` |
| `approved` | `plan_boq_items` | `COUNT(*) WHERE approved_for_boq = true` |
| `requires_review` | `plan_boq_items` | `COUNT(*) WHERE requires_review = true` |

### `measurement`

| Prototype field | DB table | DB column |
|---|---|---|
| `scale_status` | `plan_measurements` | `scale_status` |
| `assumed_scale` | `plan_measurements` | `assumed_scale` |
| `total_linear_m` | `plan_measurements` | `total_linear_m` |
| `calibration_done` | `plan_measurements` | `scale_source = 'human_calibration'` |

### Fields currently available (in JSON, normalizable)

- `boq_item_id`, `item_category`, `item_type`, `quantity`, `unit`, `confidence`, `requires_review`, `approved_for_boq`
- `occurrence_id`, `page_number`, `validation_status`
- `group_id`, `color_key`, `color_rgb8`, `classification`, `n_paths`
- `row_index`, `hebrew_label`, `sign_code`

### Fields to keep as JSONB (not normalize)

- `auto_result` (per-item detection payload — evolves between pipeline versions)
- `evidence` / `crops` (file paths, bbox arrays)
- `expansion_candidates` (ranked candidate list)
- `audit_trail` (append-only per-item history)
- `geometry` / `bbox` data (spatial data, not yet needed in relational form)
- `stage_metadata` (pipeline-internal, varies per stage)
- `measurement_payload.type_totals_m`, `measurement_payload.runs`

### Fields missing from prototype (need to add to DB)

- `reviewed_by` / `reviewer_id` (user identity — not in research JSON)
- `review_timestamp` (exists as string in research JSON, needs proper `TIMESTAMPTZ`)
- `storage_path` / `storage_bucket` (research uses local paths, DB needs Supabase Storage refs)
- `scan_run_id` (not tracked in research JSON per item — all items belong to one run)
- `project_id` (not applicable in research; required for production)

### Fields that should remain artifact files (not DB columns)

- Full HTML reports (`master_dashboard.html`, `pipeline_run_report.html`, etc.)
- Large JSON pipeline outputs (`review_queue.json` — 177 items, better as DB rows)
- PNG crops / overlays (Supabase Storage, referenced by `plan_artifacts`)

---

## 12. Final Recommendation

### Should we implement the DB schema next?

**Not immediately.** The recommended sequence is:

1. **Now:** Keep research pipeline running locally. Continue Phase 1 (manual review, calibration, teaching loop completion) using local JSON files. The data model is designed — no urgency to migrate yet.

2. **Next local/free step:** Build a **read/write JSON flow** in the local prototype (`29_plan_scanner_prototype_shell.py` upgrade) — allow the prototype to read from and write answers back to the pipeline JSONs directly, without a DB. This validates the UX pattern before committing to a schema.

3. **After at least 2 additional plan PDFs are tested:** Draft actual SQL migrations in a `feature/plan-scanner-schema` branch. Run against a development Supabase project only.

4. **Production sidebar** should still wait until:
   - Phase 2 migrations reviewed and approved
   - Phase 3 seeded test data validates the schema
   - At least one full end-to-end cycle with real answers completed in research

### Why not start migrations immediately?

- The pipeline is still single-plan. Multi-plan behavior (revision comparison, project-level rules) is untested.
- Color taxonomy and element group classifications are unconfirmed. Normalizing these now would require schema changes when the classification model matures.
- The BOQ approval workflow (who approves, what UI) is undesigned. Adding the `approved_for_boq` flow to production before the workflow is defined creates a risk of incomplete implementation.

### Confirmed for this step

- No migrations applied ✓
- No production DB modified ✓
- No production UI modified ✓
- No production flows modified ✓
- No paid API used ✓

---

*This document is a design artifact. All entity names, column definitions, and constraints are proposals — subject to revision before any migration is written.*  
*Do not use any research output for production, procurement, billing, or construction.*
