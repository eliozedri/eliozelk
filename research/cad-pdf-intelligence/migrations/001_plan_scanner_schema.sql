-- =============================================================================
-- !! REVIEW DRAFT ONLY — DO NOT APPLY TO PRODUCTION YET !!
--
-- File:    001_plan_scanner_schema.sql
-- Module:  סורק תוכניות (Plan Scanner)
-- Author:  research/cad-pdf-intelligence POC — 2026-05-20
-- Status:  DESIGN DRAFT — not applied to any Supabase project
--
-- This migration defines the storage model for the Plan Scanner module.
-- It must be reviewed against:
--   - PLAN_SCANNER_DATA_MODEL.md   (design spec)
--   - PLAN_SCANNER_PRODUCTION_READINESS_AUDIT.md (blockers list)
--   - migrations/001_plan_scanner_schema_notes.md (open questions)
--
-- BEFORE APPLYING THIS FILE:
--   1. Read 001_plan_scanner_schema_notes.md in full.
--   2. Resolve all open questions in that file.
--   3. Review on a Supabase preview project first (not main).
--   4. Add RLS policies (not included here — see notes file).
--   5. Get explicit sign-off from the team lead.
-- =============================================================================

-- Enable pgcrypto for gen_random_uuid() if not already enabled
-- (Supabase projects have this by default)
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- CREATION ORDER (dependency-ordered to satisfy foreign key constraints)
-- 1.  plans                    — top-level plan document
-- 2.  plan_files               — uploaded PDF source files
-- 3.  plan_scan_runs           — pipeline execution records
-- 4.  plan_pages               — extracted pages
-- 5.  plan_human_answers       — human answers (created before tables that ref it)
-- 6.  plan_legend_items        — legend rows (refs plan_human_answers)
-- 7.  plan_sign_occurrences    — detected sign locations
-- 8.  plan_partial_codes       — ambiguous suffix groups
-- 9.  plan_element_groups      — vector element group classifications
-- 10. plan_measurements        — scale calibration and measurements
-- 11. plan_boq_items           — unified BOQ line items
-- 12. plan_review_questions    — structured review questions
-- 13. plan_teaching_rules      — persistent cross-plan rules
-- 14. plan_review_sessions     — tracked review sessions
-- 15. plan_audit_events        — immutable audit log
-- 16. plan_artifacts           — artifact/file registry
-- + Indexes (at end)
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. plans
-- ─────────────────────────────────────────────────────────────────────────────
-- Top-level record for one engineering plan document.
-- Each plan can have multiple uploaded files and multiple scan runs.
-- approved_for_boq is NEVER auto-set — it requires an explicit human approval
-- gate enforced at the application layer and by the plan_boq_items constraint.
-- NOTE: project_id is nullable (projects table does not yet exist in production).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plans (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID,                                -- nullable: projects table not yet in production
    name             TEXT        NOT NULL,
    description      TEXT,
    plan_number      TEXT,                                -- engineering plan number e.g. "50-448-02-400"
    plan_type        TEXT        NOT NULL DEFAULT 'traffic_signs'
                     CHECK (plan_type IN ('traffic_signs','road_marking','infrastructure','mixed')),
    status           TEXT        NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','scanning','ready_for_review','approved','archived')),
    approved_for_boq BOOLEAN     NOT NULL DEFAULT FALSE, -- NEVER auto-set to true
    created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.plans IS 'Top-level record for one engineering plan document (תוכנית הנדסית).';
COMMENT ON COLUMN public.plans.project_id       IS 'Future FK to projects table when it exists. Nullable for now.';
COMMENT ON COLUMN public.plans.approved_for_boq IS 'NEVER auto-set. Requires an explicit human approval gate.';
COMMENT ON COLUMN public.plans.plan_number      IS 'Engineering drawing number as shown on the title block.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. plan_files
-- ─────────────────────────────────────────────────────────────────────────────
-- Uploaded PDF source files attached to a plan. One plan may have multiple
-- revisions. Each file is stored in Supabase Storage and referenced by storage_path.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_files (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id          UUID        NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    file_name        TEXT        NOT NULL,
    storage_bucket   TEXT        NOT NULL DEFAULT 'plan-files',
    storage_path     TEXT        NOT NULL,               -- Supabase Storage object key
    file_size_bytes  BIGINT,
    mime_type        TEXT        NOT NULL DEFAULT 'application/pdf',
    page_count       INTEGER,
    checksum_sha256  TEXT,                               -- for deduplication
    revision_label   TEXT,                               -- e.g. "Rev-3", "2026-05-20"
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,  -- latest active revision
    uploaded_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.plan_files IS 'Uploaded PDF source files for each plan. Multiple revisions are allowed.';
COMMENT ON COLUMN public.plan_files.storage_path    IS 'Supabase Storage object key. Construct URL via supabase.storage.from(bucket).getPublicUrl(path).';
COMMENT ON COLUMN public.plan_files.checksum_sha256 IS 'SHA-256 of the uploaded file. Used for deduplication before triggering a new scan run.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. plan_scan_runs
-- ─────────────────────────────────────────────────────────────────────────────
-- One end-to-end pipeline execution for a plan file.
-- stages_total is currently 17 (S1–S17). This will grow as the pipeline matures.
-- run_metadata JSONB carries stage-level timing, red flags, and warnings.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_scan_runs (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id          UUID        NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    plan_file_id     UUID        REFERENCES public.plan_files(id) ON DELETE SET NULL,
    status           TEXT        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','running','completed','failed','aborted')),
    pipeline_version TEXT,                               -- git SHA or semver of the pipeline
    stages_ok        INTEGER     NOT NULL DEFAULT 0,
    stages_total     INTEGER     NOT NULL DEFAULT 17,
    run_metadata     JSONB       NOT NULL DEFAULT '{}',  -- stage timings, red_flags, warnings, summary
    triggered_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    started_at       TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- No updated_at: scan runs are append-only per execution
);

COMMENT ON TABLE  public.plan_scan_runs IS 'One complete pipeline execution for a plan file. Append-only per run.';
COMMENT ON COLUMN public.plan_scan_runs.run_metadata IS
    'JSONB: { stages: [{stage_id, status, elapsed_s}], red_flags: [{severity, code, message}], warnings: [...] }';
COMMENT ON COLUMN public.plan_scan_runs.pipeline_version IS 'Git SHA or pipeline semver. Allows reproducibility tracking.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. plan_pages
-- ─────────────────────────────────────────────────────────────────────────────
-- Individual pages extracted from a plan PDF during the scan run.
-- geometry JSONB holds viewport/drawing-area bounding boxes.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_pages (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id       UUID        NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    plan_file_id  UUID        REFERENCES public.plan_files(id) ON DELETE SET NULL,
    scan_run_id   UUID        REFERENCES public.plan_scan_runs(id) ON DELETE SET NULL,
    page_number   INTEGER     NOT NULL,
    page_label    TEXT,
    width_pt      NUMERIC,
    height_pt     NUMERIC,
    page_type     TEXT        NOT NULL DEFAULT 'unknown'
                  CHECK (page_type IN ('drawing','title_block','legend','detail','overview','unknown')),
    sign_count    INTEGER     NOT NULL DEFAULT 0,        -- denormalized for fast display
    reviewed      BOOLEAN     NOT NULL DEFAULT FALSE,
    geometry      JSONB       NOT NULL DEFAULT '{}',     -- viewport_bbox, drawing_area_bbox, title_block_bbox
    scan_metadata JSONB       NOT NULL DEFAULT '{}',     -- raw page extraction metadata
    UNIQUE (scan_run_id, page_number)
);

COMMENT ON TABLE  public.plan_pages IS 'Pages extracted from a plan PDF. One row per page per scan run.';
COMMENT ON COLUMN public.plan_pages.geometry IS
    'JSONB: { viewport_bbox: [x1,y1,x2,y2], drawing_area_bbox: [...], title_block_bbox: [...] }';


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. plan_human_answers
-- ─────────────────────────────────────────────────────────────────────────────
-- Created BEFORE tables that reference it (plan_legend_items, plan_partial_codes,
-- plan_element_groups, plan_measurements, plan_review_questions).
-- Human answers submitted via the review form or teaching loop.
-- approved_for_boq is NEVER auto-set. demo answers carry demo=true.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_human_answers (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    answer_id               TEXT        NOT NULL,        -- A-001, D-001 (demo prefix)
    plan_id                 UUID        NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    scan_run_id             UUID        REFERENCES public.plan_scan_runs(id) ON DELETE SET NULL,
    question_id             TEXT,                        -- references plan_review_questions.question_id (soft ref)
    answer_type             TEXT        NOT NULL
                            CHECK (answer_type IN (
                                'partial_code_resolution',
                                'element_group_classification',
                                'scale_calibration',
                                'color_taxonomy_rule',
                                'sign_code_confirmation',
                                'ignore_rule',
                                'legend_label',
                                'boq_review'
                            )),
    scope                   TEXT        NOT NULL DEFAULT 'current_plan_only'
                            CHECK (scope IN (
                                'current_plan_only',
                                'project_rule',
                                'company_rule_candidate',
                                'company_rule_approved'
                            )),
    answered_by             UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    answered_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Safety flags
    demo                    BOOLEAN     NOT NULL DEFAULT FALSE,
    not_for_operational_use BOOLEAN     NOT NULL DEFAULT FALSE,
    approved_for_boq        BOOLEAN     NOT NULL DEFAULT FALSE, -- NEVER auto-set
    -- Review state
    contradiction_detected  BOOLEAN     NOT NULL DEFAULT FALSE,
    requires_review         BOOLEAN     NOT NULL DEFAULT FALSE,
    -- Payloads
    answer_payload          JSONB       NOT NULL DEFAULT '{}',  -- typed per answer_type (see notes)
    audit_trail             JSONB       NOT NULL DEFAULT '[]',  -- append-only change history
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Demo answers must never be for operational use
    CONSTRAINT demo_not_operational CHECK (
        NOT (demo = TRUE AND not_for_operational_use = FALSE)
    ),
    -- BOQ approval is always false on human answers (approval is on boq_items)
    CONSTRAINT answers_never_auto_approved CHECK (approved_for_boq = FALSE)
);

COMMENT ON TABLE  public.plan_human_answers IS
    'Human answers from the review form or teaching loop. 8 answer types. demo=true answers are research-only.';
COMMENT ON COLUMN public.plan_human_answers.answer_payload IS
    'JSONB payload varies by answer_type. See PLAN_SCANNER_DATA_MODEL.md §1.12 for per-type shapes.';
COMMENT ON COLUMN public.plan_human_answers.scope IS
    'current_plan_only: applies to this scan only. project_rule+: escalates to plan_teaching_rules.';
COMMENT ON COLUMN public.plan_human_answers.audit_trail IS
    'Append-only JSONB array. Each entry: {event, answer_id, actor_id, timestamp, previous_value, new_value}.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. plan_legend_items
-- ─────────────────────────────────────────────────────────────────────────────
-- Legend rows extracted from the plan's legend (מקרא) section.
-- Currently 13 rows detected, 0 labels extracted (LEGEND-UNLABELED red flag).
-- geometry JSONB holds row_bbox, icon_bbox, text_bbox in page points.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_legend_items (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id          UUID        NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    scan_run_id      UUID        REFERENCES public.plan_scan_runs(id) ON DELETE SET NULL,
    page_number      INTEGER,
    row_index        INTEGER     NOT NULL,               -- 0-based row position in legend
    -- Labels (may be NULL until human confirms)
    hebrew_label     TEXT,
    english_label    TEXT,
    sign_code        INTEGER,
    quantity         NUMERIC,
    -- Confidence and source
    confidence       TEXT        NOT NULL DEFAULT 'unknown'
                     CHECK (confidence IN ('unknown','low','medium','high','confirmed','certain')),
    label_source     TEXT        NOT NULL DEFAULT 'pending'
                     CHECK (label_source IN ('auto_detected','human_review','pending','vision_api')),
    requires_review  BOOLEAN     NOT NULL DEFAULT TRUE,
    approved_for_boq BOOLEAN     NOT NULL DEFAULT FALSE, -- NEVER auto-set
    human_answer_id  UUID        REFERENCES public.plan_human_answers(id) ON DELETE SET NULL,
    -- JSONB payloads
    geometry         JSONB       NOT NULL DEFAULT '{}',  -- row_bbox_px, icon_bbox, text_bbox
    auto_result      JSONB       NOT NULL DEFAULT '{}',  -- raw extraction output
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.plan_legend_items IS
    'Legend (מקרא) rows extracted from the plan. One row per legend entry per scan run.';
COMMENT ON COLUMN public.plan_legend_items.label_source IS
    'auto_detected: pipeline extracted. human_review: human confirmed via S10 writeback. '
    'pending: not yet extracted. vision_api: extracted via Vision API (not available in research mode).';


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. plan_sign_occurrences
-- ─────────────────────────────────────────────────────────────────────────────
-- Each detected sign location in the drawing area.
-- 177 occurrences currently. 0 confirmed codes (CODES-UNCONFIRMED red flag).
-- Auto-detected code is stored in auto_result JSONB to preserve original.
-- confirmed_code is set only by a human_sign_code_confirmation answer.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_sign_occurrences (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    occurrence_id     TEXT,                              -- OCC-0001 from pipeline (soft identifier)
    plan_id           UUID        NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    scan_run_id       UUID        REFERENCES public.plan_scan_runs(id) ON DELETE SET NULL,
    page_number       INTEGER,
    -- Code detection (auto vs human)
    sign_code         INTEGER,                           -- best auto-detected code (may be null)
    confirmed_code    INTEGER,                           -- human-confirmed; NULL until reviewed
    confidence        TEXT        NOT NULL DEFAULT 'unknown'
                      CHECK (confidence IN ('unknown','low','medium','high','confirmed','certain')),
    validation_status TEXT        NOT NULL DEFAULT 'unknown',
    -- Review state flags
    requires_review   BOOLEAN     NOT NULL DEFAULT TRUE,
    approved_for_boq  BOOLEAN     NOT NULL DEFAULT FALSE, -- NEVER auto-set
    human_confirmed   BOOLEAN     NOT NULL DEFAULT FALSE,
    human_label_source TEXT,
    -- JSONB payloads
    geometry          JSONB       NOT NULL DEFAULT '{}', -- bbox, pole_location, page_coords
    auto_result       JSONB       NOT NULL DEFAULT '{}', -- poc3_candidates, t1/t2/t3 matches, scores
    evidence          JSONB       NOT NULL DEFAULT '{}', -- crop_paths, overlay_paths, review images
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.plan_sign_occurrences IS
    'Each detected road sign location in the plan drawing. 177 detected in research POC.';
COMMENT ON COLUMN public.plan_sign_occurrences.sign_code IS
    'Best auto-detected 3-digit Israeli road sign code. NULL if detection failed. Preserved from first detection.';
COMMENT ON COLUMN public.plan_sign_occurrences.confirmed_code IS
    'Human-confirmed code. Set by a sign_code_confirmation answer. NULL until confirmed.';
COMMENT ON COLUMN public.plan_sign_occurrences.auto_result IS
    'JSONB: { poc3_candidates: [{code, confidence}], t1_match, t2_match, t3_ranked, suspected_issue }';


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. plan_partial_codes
-- ─────────────────────────────────────────────────────────────────────────────
-- Ambiguous suffix groups requiring human resolution.
-- Research POC: suffix "33" has 4 expansion candidates (133/233/433/633).
--               suffix "86" has 0 candidates — suspicious.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_partial_codes (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id              UUID        NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    scan_run_id          UUID        REFERENCES public.plan_scan_runs(id) ON DELETE SET NULL,
    suffix               TEXT        NOT NULL,           -- "33", "86"
    frequency            INTEGER     NOT NULL DEFAULT 0, -- number of occurrences with this suffix
    resolution_status    TEXT        NOT NULL DEFAULT 'ambiguous'
                         CHECK (resolution_status IN (
                             'ambiguous', 'human_confirmed', 'invalid_partial', 'superseded'
                         )),
    resolved_code        INTEGER,                        -- set by partial_code_resolution answer
    human_confirmed      BOOLEAN     NOT NULL DEFAULT FALSE,
    human_answer_id      UUID        REFERENCES public.plan_human_answers(id) ON DELETE SET NULL,
    requires_review      BOOLEAN     NOT NULL DEFAULT TRUE,
    approved_for_boq     BOOLEAN     NOT NULL DEFAULT FALSE, -- NEVER auto-set
    expansion_candidates JSONB       NOT NULL DEFAULT '[]',  -- [{code, series, name, in_catalog, t3_prior}]
    stage_metadata       JSONB       NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.plan_partial_codes IS
    'Suffix groups that could not be resolved to a full 3-digit code without human input.';
COMMENT ON COLUMN public.plan_partial_codes.expansion_candidates IS
    'JSONB array: [{code: 433, series: 4, name: "...", in_catalog: true, t3_prior: 4}]';


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. plan_element_groups
-- ─────────────────────────────────────────────────────────────────────────────
-- Vector path groups from element decomposition (Branch C).
-- Research POC: 31 groups. G-001 has 122,781 paths — the largest, unclassified.
-- G-005, G-006, G-011 also high-impact and unclassified.
-- color_rgb8 uses INTEGER[] (requires pgcrypto extension or plain JSONB).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_element_groups (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id                TEXT        NOT NULL,        -- G-001 (from pipeline)
    plan_id                 UUID        NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    scan_run_id             UUID        REFERENCES public.plan_scan_runs(id) ON DELETE SET NULL,
    -- Color identity
    color_key               TEXT,                        -- "0.00,0.00,0.00" (normalized float string)
    color_rgb8              JSONB,                       -- [0, 0, 0] as JSONB array (avoids INTEGER[] complexity)
    -- Path statistics
    n_paths                 INTEGER     NOT NULL DEFAULT 0,
    n_fill                  INTEGER     NOT NULL DEFAULT 0,
    n_stroke                INTEGER     NOT NULL DEFAULT 0,
    total_length_pt         NUMERIC     NOT NULL DEFAULT 0,
    drawing_area_paths      INTEGER     NOT NULL DEFAULT 0,
    drawing_area_length_pt  NUMERIC     NOT NULL DEFAULT 0,
    -- Classification
    classification          TEXT        NOT NULL DEFAULT 'review',
    classification_source   TEXT        NOT NULL DEFAULT 'auto'
                            CHECK (classification_source IN ('auto','human_review','color_taxonomy_rule')),
    element_type            TEXT,
    confidence              TEXT        NOT NULL DEFAULT 'unknown'
                            CHECK (confidence IN ('unknown','low','medium','high','confirmed','certain')),
    -- Review state
    requires_review         BOOLEAN     NOT NULL DEFAULT TRUE,
    approved_for_boq        BOOLEAN     NOT NULL DEFAULT FALSE, -- NEVER auto-set
    human_confirmed         BOOLEAN     NOT NULL DEFAULT FALSE,
    human_include_in_boq    BOOLEAN,                    -- NULL = not yet decided by human
    human_answer_id         UUID        REFERENCES public.plan_human_answers(id) ON DELETE SET NULL,
    -- JSONB payloads
    geometry                JSONB       NOT NULL DEFAULT '{}', -- sample_bboxes, zone_breakdown
    auto_result             JSONB       NOT NULL DEFAULT '{}', -- notes, boq_category, raw classification
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (scan_run_id, group_id)
);

COMMENT ON TABLE  public.plan_element_groups IS
    'Vector path groups from Branch C element decomposition. 31 groups in research POC.';
COMMENT ON COLUMN public.plan_element_groups.color_rgb8 IS
    'Stored as JSONB [R,G,B] integers (0-255) to avoid INTEGER[] type complexity in Supabase.';
COMMENT ON COLUMN public.plan_element_groups.human_include_in_boq IS
    'NULL = not yet decided. TRUE = human says include. FALSE = human says exclude. '
    'Separate from approved_for_boq: inclusion decision ≠ BOQ approval.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. plan_measurements
-- ─────────────────────────────────────────────────────────────────────────────
-- Scale calibration and linear/area measurement results.
-- CRITICAL blocker: scale_source='assumed' means all quantities are provisional.
-- A human calibration answer creates a new row — old rows are kept, not overwritten.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_measurements (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id                 UUID        NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    scan_run_id             UUID        REFERENCES public.plan_scan_runs(id) ON DELETE SET NULL,
    measurement_type        TEXT        NOT NULL
                            CHECK (measurement_type IN (
                                'scale', 'linear', 'area', 'calibration_reference'
                            )),
    -- Scale information
    assumed_scale           TEXT,                        -- "1:500"
    scale_ratio             NUMERIC,                     -- 500
    scale_source            TEXT        NOT NULL DEFAULT 'assumed'
                            CHECK (scale_source IN (
                                'title_block', 'human_calibration', 'assumed', 'computed'
                            )),
    scale_status            TEXT        NOT NULL DEFAULT 'unverified'
                            CHECK (scale_status IN (
                                'unverified', 'verified', 'calibrated', 'disputed'
                            )),
    -- Human calibration reference points
    calibration_point_a     JSONB,                       -- {x_pt, y_pt, label}
    calibration_point_b     JSONB,                       -- {x_pt, y_pt, label}
    real_world_distance_m   NUMERIC,
    px_per_m                NUMERIC,
    -- Derived measurements
    total_linear_m          NUMERIC,
    measurement_method      TEXT
                            CHECK (measurement_method IN (
                                'vector_geometry', 'raster', 'human_calibration'
                            )),
    unit                    TEXT        NOT NULL DEFAULT 'm',
    confidence              TEXT        NOT NULL DEFAULT 'unknown'
                            CHECK (confidence IN ('unknown','low','medium','high','confirmed','certain')),
    requires_review         BOOLEAN     NOT NULL DEFAULT TRUE,
    approved_for_boq        BOOLEAN     NOT NULL DEFAULT FALSE, -- NEVER auto-set
    human_answer_id         UUID        REFERENCES public.plan_human_answers(id) ON DELETE SET NULL,
    -- Full payload
    measurement_payload     JSONB       NOT NULL DEFAULT '{}', -- type_totals_m, runs, color_taxonomy
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.plan_measurements IS
    'Scale calibration and measurement results. All quantities are PROVISIONAL until scale_source=human_calibration.';
COMMENT ON COLUMN public.plan_measurements.scale_source IS
    'assumed: fallback (e.g. 1:500 not from PDF). human_calibration: two reference points provided by human. '
    'title_block: detected from the PDF title block (not yet implemented in research pipeline).';
COMMENT ON COLUMN public.plan_measurements.measurement_payload IS
    'JSONB: { type_totals_m: {guardrail: 2400.0, barrier: 1800.0}, runs: [...] }';


-- ─────────────────────────────────────────────────────────────────────────────
-- 11. plan_boq_items
-- ─────────────────────────────────────────────────────────────────────────────
-- Unified BOQ line items — the central output requiring human approval.
-- CRITICAL: approved_for_boq=TRUE requires operational_approver_id IS NOT NULL.
-- Human review ≠ BOQ approval. These are two separate gates, two separate actors.
-- boq_status tracks the 10-state machine (see PLAN_SCANNER_DATA_MODEL.md §4).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_boq_items (
    id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    boq_item_id                     TEXT        NOT NULL,   -- BOQ-CNT-001 from pipeline
    plan_id                         UUID        NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    scan_run_id                     UUID        REFERENCES public.plan_scan_runs(id) ON DELETE SET NULL,
    -- Classification
    item_category                   TEXT        NOT NULL,   -- counted / measured_linear / measured_area / review_item
    item_type                       TEXT,
    description_he                  TEXT,
    description_en                  TEXT,
    source_branch                   TEXT,                   -- sign_review / element_decomp / combined
    -- Quantities (original auto-detected preserved separately)
    quantity                        NUMERIC,
    unit                            TEXT,
    original_auto_quantity          NUMERIC,                -- never overwritten after first detection
    corrected_quantity              NUMERIC,                -- human override
    corrected_unit                  TEXT,
    corrected_description_he        TEXT,
    corrected_description_en        TEXT,
    confidence                      TEXT        NOT NULL DEFAULT 'unknown'
                                    CHECK (confidence IN ('unknown','low','medium','high','confirmed','certain')),
    -- BOQ state machine
    requires_review                 BOOLEAN     NOT NULL DEFAULT TRUE,
    boq_status                      TEXT        NOT NULL DEFAULT 'draft_research'
                                    CHECK (boq_status IN (
                                        'draft_research',
                                        'pending_review',
                                        'human_reviewed',
                                        'accepted_for_draft',
                                        'rejected',
                                        'needs_more_info',
                                        'pending_final_approval',
                                        'approved_for_boq',
                                        'exported_to_operations',
                                        'superseded'
                                    )),
    -- Human review gate (Reviewer role — separate from approval)
    human_reviewed                  BOOLEAN     NOT NULL DEFAULT FALSE,
    human_review_status             TEXT,
    human_reviewer_id               UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    human_review_timestamp          TIMESTAMPTZ,
    human_review_notes              TEXT,
    -- BOQ approval gate (Approver role — separate from review)
    approved_for_boq                BOOLEAN     NOT NULL DEFAULT FALSE,   -- NEVER auto-set
    operationally_approved          BOOLEAN     NOT NULL DEFAULT FALSE,
    operational_approver_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    operational_approval_timestamp  TIMESTAMPTZ,
    -- JSONB payloads
    auto_result                     JSONB       NOT NULL DEFAULT '{}',    -- original auto detection payload
    evidence                        JSONB       NOT NULL DEFAULT '{}',    -- source_ids, evidence_paths, crops
    audit_trail                     JSONB       NOT NULL DEFAULT '[]',    -- append-only per-item change log
    review_reason                   TEXT,
    audit_notes                     TEXT,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- ── Critical constraint: BOQ approval requires a named human approver ─────
    CONSTRAINT boq_no_auto_approval CHECK (
        (approved_for_boq = FALSE)
        OR (operational_approver_id IS NOT NULL)
    ),
    -- ── Approval state must match the boolean flag ─────────────────────────────
    CONSTRAINT boq_status_approval_consistency CHECK (
        (approved_for_boq = FALSE)
        OR (boq_status IN ('approved_for_boq','exported_to_operations'))
    )
);

COMMENT ON TABLE  public.plan_boq_items IS
    'Unified BOQ line items. 47 items in research POC. 0 approved. '
    'approved_for_boq=TRUE requires operational_approver_id IS NOT NULL (enforced by constraint).';
COMMENT ON COLUMN public.plan_boq_items.original_auto_quantity IS
    'Preserved from first auto-detection. NEVER overwritten. Human corrections go into corrected_quantity.';
COMMENT ON COLUMN public.plan_boq_items.boq_status IS
    'State machine: draft_research → pending_review → human_reviewed → accepted_for_draft | rejected | '
    'needs_more_info → pending_final_approval → approved_for_boq → exported_to_operations. See §4.';
COMMENT ON CONSTRAINT boq_no_auto_approval ON public.plan_boq_items IS
    'Prevents any code path from setting approved_for_boq=TRUE without a named approver. '
    'No pipeline stage, API route, or writeback may bypass this.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 12. plan_review_questions
-- ─────────────────────────────────────────────────────────────────────────────
-- Structured review questions generated by S12 (Teaching Loop Answer Pack).
-- 40 questions in research POC, 0 answered.
-- question_payload JSONB holds the full context, evidence, and answer schema.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_review_questions (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id      TEXT        NOT NULL,               -- Q-33-1, Q-SCALE-001
    plan_id          UUID        NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    scan_run_id      UUID        REFERENCES public.plan_scan_runs(id) ON DELETE SET NULL,
    question_type    TEXT        NOT NULL
                     CHECK (question_type IN (
                         'partial_code_resolution',
                         'element_group_classification',
                         'scale_calibration',
                         'color_taxonomy_rule',
                         'sign_code_confirmation',
                         'ignore_rule',
                         'legend_label',
                         'boq_review'
                     )),
    priority         TEXT        NOT NULL DEFAULT 'medium'
                     CHECK (priority IN ('critical','high','medium','low')),
    status           TEXT        NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','answered','superseded','ignored','blocked')),
    blocked_by       TEXT,                               -- question_id of a prerequisite question
    answer_id        UUID        REFERENCES public.plan_human_answers(id) ON DELETE SET NULL,
    question_payload JSONB       NOT NULL DEFAULT '{}',  -- full context, evidence, allowed schema, example answer
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    answered_at      TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (scan_run_id, question_id)
);

COMMENT ON TABLE  public.plan_review_questions IS
    '40 structured review questions in research POC. Generated by S12 (Teaching Loop Answer Pack).';
COMMENT ON COLUMN public.plan_review_questions.question_payload IS
    'JSONB: { question_text, business_impact, affected_items_count, evidence_paths, '
    'allowed_answer_schema, example_answer }';


-- ─────────────────────────────────────────────────────────────────────────────
-- 13. plan_teaching_rules
-- ─────────────────────────────────────────────────────────────────────────────
-- Persistent rules that apply across plans (project-level or company-level).
-- Only created when scope != 'current_plan_only'.
-- superseded_by supports rule versioning without deletion.
-- applies_to_project_id is nullable (projects table not yet in production).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_teaching_rules (
    id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_type              TEXT        NOT NULL
                           CHECK (rule_type IN (
                               'partial_code_resolution',
                               'element_group_classification',
                               'scale_calibration',
                               'color_taxonomy_rule',
                               'sign_code_confirmation',
                               'ignore_rule',
                               'legend_label',
                               'boq_review'
                           )),
    scope                  TEXT        NOT NULL
                           CHECK (scope IN (
                               'project_rule',
                               'company_rule_candidate',
                               'company_rule_approved'
                           )),
    -- current_plan_only answers do NOT become teaching rules
    applies_to_project_id  UUID,                        -- nullable: projects table not in production yet
    rule_payload           JSONB       NOT NULL DEFAULT '{}',
    is_active              BOOLEAN     NOT NULL DEFAULT TRUE,
    source_answer_id       UUID        REFERENCES public.plan_human_answers(id) ON DELETE SET NULL,
    created_by             UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_by            UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at            TIMESTAMPTZ,                  -- required for company_rule_approved
    superseded_by          UUID        REFERENCES public.plan_teaching_rules(id) ON DELETE SET NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Company-approved rules must have an approver
    CONSTRAINT company_rule_needs_approver CHECK (
        (scope != 'company_rule_approved')
        OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    )
);

COMMENT ON TABLE  public.plan_teaching_rules IS
    'Persistent rules promoted from plan_human_answers when scope is project_rule or company_rule_*. '
    '0 rules in research POC (no real answers submitted yet).';
COMMENT ON COLUMN public.plan_teaching_rules.superseded_by IS
    'Points to the replacement rule when this rule is revised. Never deleted — only superseded.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 14. plan_review_sessions
-- ─────────────────────────────────────────────────────────────────────────────
-- A tracked session in which a human reviews questions or approves BOQ items.
-- One session = one reviewer, one session_type, one plan.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_review_sessions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id             UUID        NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    scan_run_id         UUID        REFERENCES public.plan_scan_runs(id) ON DELETE SET NULL,
    reviewer_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    session_type        TEXT        NOT NULL
                        CHECK (session_type IN (
                            'teaching_loop', 'boq_review', 'boq_approval', 'calibration'
                        )),
    status              TEXT        NOT NULL DEFAULT 'in_progress'
                        CHECK (status IN ('in_progress','completed','abandoned','paused')),
    questions_answered  INTEGER     NOT NULL DEFAULT 0,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    session_metadata    JSONB       NOT NULL DEFAULT '{}'  -- form version, answer file path, etc.
);

COMMENT ON TABLE  public.plan_review_sessions IS
    'Tracked review sessions. Each session = one reviewer, one type, one plan. '
    'Links reviewer identity to answers for audit purposes.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 15. plan_audit_events
-- ─────────────────────────────────────────────────────────────────────────────
-- IMMUTABLE AUDIT LOG — append-only, never updated or deleted.
-- No updated_at column (intentional). No ON DELETE CASCADE on plan_id.
-- Every state change (scan start, answer applied, BOQ status change, approval)
-- writes an immutable row here.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_audit_events (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id        UUID        REFERENCES public.plans(id),  -- intentionally NO cascade
    event_type     TEXT        NOT NULL,                    -- file_uploaded / scan_started / answer_applied / boq_approved / status_changed
    entity_type    TEXT,                                    -- plan / plan_boq_item / plan_sign_occurrence / ...
    entity_id      UUID,                                    -- UUID of the affected row
    entity_ref     TEXT,                                    -- human-readable reference (e.g. "BOQ-CNT-001")
    actor_id       UUID        REFERENCES auth.users(id),   -- intentionally NO cascade
    previous_value JSONB,
    new_value      JSONB,
    notes          TEXT,
    occurred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- NO updated_at — this table is append-only by design
    -- NO delete cascades — audit events outlive the entities they describe
);

COMMENT ON TABLE  public.plan_audit_events IS
    'IMMUTABLE audit log. Append-only — no UPDATE or DELETE ever. '
    'Every state change writes a row here. plan_id has no cascade so events survive plan deletion. '
    '711 events generated in research POC (local JSON shadow).';
COMMENT ON COLUMN public.plan_audit_events.entity_id IS
    'UUID of the affected row. May reference any of the plan_* tables.';
COMMENT ON COLUMN public.plan_audit_events.occurred_at IS
    'Event timestamp. No updated_at column on this table — intentional.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 16. plan_artifacts
-- ─────────────────────────────────────────────────────────────────────────────
-- Registry of all generated files linked to a scan run.
-- 1,728 artifacts exist in the research POC (local filesystem).
-- In production these reference Supabase Storage objects.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_artifacts (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id           UUID        NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    scan_run_id       UUID        REFERENCES public.plan_scan_runs(id) ON DELETE SET NULL,
    artifact_type     TEXT        NOT NULL
                      CHECK (artifact_type IN (
                          'pdf_source', 'legend_crop', 'sign_crop', 'overlay',
                          'html_report', 'json_output', 'boq_report', 'boq_csv',
                          'calibration', 'pipeline_summary', 'evidence_panel', 'other'
                      )),
    stage_id          TEXT,                              -- S1..S17
    file_name         TEXT        NOT NULL,
    storage_bucket    TEXT,                              -- Supabase Storage bucket name
    storage_path      TEXT,                              -- Supabase Storage object key
    local_path        TEXT,                              -- research-only: relative path under outputs/
    file_size_bytes   BIGINT,
    mime_type         TEXT,
    checksum_sha256   TEXT,
    artifact_metadata JSONB       NOT NULL DEFAULT '{}', -- stage-specific metadata, related entity refs
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.plan_artifacts IS
    'Registry of generated files: crops, overlays, reports, BOQ outputs. '
    '1,728 artifacts in research POC (local filesystem). storage_path used in production (Supabase Storage).';
COMMENT ON COLUMN public.plan_artifacts.local_path IS
    'Research-only: relative path under outputs/. Set to NULL in production.';
COMMENT ON COLUMN public.plan_artifacts.storage_path IS
    'Supabase Storage object key. Used in production to construct download URLs.';


-- =============================================================================
-- INDEXES
-- =============================================================================

-- plans
CREATE INDEX IF NOT EXISTS idx_plans_status       ON public.plans (status);
CREATE INDEX IF NOT EXISTS idx_plans_created_by   ON public.plans (created_by);
CREATE INDEX IF NOT EXISTS idx_plans_created_at   ON public.plans (created_at DESC);

-- plan_files
CREATE INDEX IF NOT EXISTS idx_plan_files_plan_id    ON public.plan_files (plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_files_is_active  ON public.plan_files (plan_id, is_active);

-- plan_scan_runs
CREATE INDEX IF NOT EXISTS idx_scan_runs_plan_id     ON public.plan_scan_runs (plan_id);
CREATE INDEX IF NOT EXISTS idx_scan_runs_status      ON public.plan_scan_runs (status);
CREATE INDEX IF NOT EXISTS idx_scan_runs_created_at  ON public.plan_scan_runs (created_at DESC);

-- plan_pages
CREATE INDEX IF NOT EXISTS idx_plan_pages_plan_id    ON public.plan_pages (plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_pages_run_id     ON public.plan_pages (scan_run_id);

-- plan_human_answers
CREATE INDEX IF NOT EXISTS idx_human_answers_plan_id     ON public.plan_human_answers (plan_id);
CREATE INDEX IF NOT EXISTS idx_human_answers_run_id      ON public.plan_human_answers (scan_run_id);
CREATE INDEX IF NOT EXISTS idx_human_answers_answer_type ON public.plan_human_answers (answer_type);
CREATE INDEX IF NOT EXISTS idx_human_answers_scope       ON public.plan_human_answers (scope);
CREATE INDEX IF NOT EXISTS idx_human_answers_demo        ON public.plan_human_answers (demo) WHERE demo = TRUE;

-- plan_legend_items
CREATE INDEX IF NOT EXISTS idx_legend_items_plan_id        ON public.plan_legend_items (plan_id);
CREATE INDEX IF NOT EXISTS idx_legend_items_run_id         ON public.plan_legend_items (scan_run_id);
CREATE INDEX IF NOT EXISTS idx_legend_items_requires_review ON public.plan_legend_items (plan_id, requires_review);

-- plan_sign_occurrences
CREATE INDEX IF NOT EXISTS idx_sign_occ_plan_id         ON public.plan_sign_occurrences (plan_id);
CREATE INDEX IF NOT EXISTS idx_sign_occ_run_id          ON public.plan_sign_occurrences (scan_run_id);
CREATE INDEX IF NOT EXISTS idx_sign_occ_requires_review ON public.plan_sign_occurrences (plan_id, requires_review);
CREATE INDEX IF NOT EXISTS idx_sign_occ_human_confirmed ON public.plan_sign_occurrences (plan_id, human_confirmed);
CREATE INDEX IF NOT EXISTS idx_sign_occ_sign_code       ON public.plan_sign_occurrences (sign_code);

-- plan_partial_codes
CREATE INDEX IF NOT EXISTS idx_partial_codes_plan_id    ON public.plan_partial_codes (plan_id);
CREATE INDEX IF NOT EXISTS idx_partial_codes_status     ON public.plan_partial_codes (resolution_status);

-- plan_element_groups
CREATE INDEX IF NOT EXISTS idx_element_groups_plan_id         ON public.plan_element_groups (plan_id);
CREATE INDEX IF NOT EXISTS idx_element_groups_run_id          ON public.plan_element_groups (scan_run_id);
CREATE INDEX IF NOT EXISTS idx_element_groups_classification  ON public.plan_element_groups (classification);
CREATE INDEX IF NOT EXISTS idx_element_groups_requires_review ON public.plan_element_groups (plan_id, requires_review);
CREATE INDEX IF NOT EXISTS idx_element_groups_human_confirmed ON public.plan_element_groups (plan_id, human_confirmed);

-- plan_measurements
CREATE INDEX IF NOT EXISTS idx_measurements_plan_id      ON public.plan_measurements (plan_id);
CREATE INDEX IF NOT EXISTS idx_measurements_scale_source ON public.plan_measurements (scale_source);

-- plan_boq_items
CREATE INDEX IF NOT EXISTS idx_boq_items_plan_id         ON public.plan_boq_items (plan_id);
CREATE INDEX IF NOT EXISTS idx_boq_items_run_id          ON public.plan_boq_items (scan_run_id);
CREATE INDEX IF NOT EXISTS idx_boq_items_status          ON public.plan_boq_items (boq_status);
CREATE INDEX IF NOT EXISTS idx_boq_items_item_type       ON public.plan_boq_items (item_type);
CREATE INDEX IF NOT EXISTS idx_boq_items_item_category   ON public.plan_boq_items (item_category);
CREATE INDEX IF NOT EXISTS idx_boq_items_requires_review ON public.plan_boq_items (plan_id, requires_review);
CREATE INDEX IF NOT EXISTS idx_boq_items_approved        ON public.plan_boq_items (plan_id, approved_for_boq);
CREATE INDEX IF NOT EXISTS idx_boq_items_created_at      ON public.plan_boq_items (created_at DESC);

-- plan_review_questions
CREATE INDEX IF NOT EXISTS idx_review_q_plan_id     ON public.plan_review_questions (plan_id);
CREATE INDEX IF NOT EXISTS idx_review_q_run_id      ON public.plan_review_questions (scan_run_id);
CREATE INDEX IF NOT EXISTS idx_review_q_status      ON public.plan_review_questions (status);
CREATE INDEX IF NOT EXISTS idx_review_q_priority    ON public.plan_review_questions (priority);
CREATE INDEX IF NOT EXISTS idx_review_q_type        ON public.plan_review_questions (question_type);

-- plan_teaching_rules
CREATE INDEX IF NOT EXISTS idx_teaching_rules_scope    ON public.plan_teaching_rules (scope);
CREATE INDEX IF NOT EXISTS idx_teaching_rules_type     ON public.plan_teaching_rules (rule_type);
CREATE INDEX IF NOT EXISTS idx_teaching_rules_active   ON public.plan_teaching_rules (is_active) WHERE is_active = TRUE;

-- plan_review_sessions
CREATE INDEX IF NOT EXISTS idx_review_sessions_plan_id    ON public.plan_review_sessions (plan_id);
CREATE INDEX IF NOT EXISTS idx_review_sessions_reviewer   ON public.plan_review_sessions (reviewer_id);
CREATE INDEX IF NOT EXISTS idx_review_sessions_status     ON public.plan_review_sessions (status);

-- plan_audit_events
CREATE INDEX IF NOT EXISTS idx_audit_events_plan_id     ON public.plan_audit_events (plan_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_event_type  ON public.plan_audit_events (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity_id   ON public.plan_audit_events (entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_id    ON public.plan_audit_events (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at ON public.plan_audit_events (occurred_at DESC);

-- plan_artifacts
CREATE INDEX IF NOT EXISTS idx_artifacts_plan_id     ON public.plan_artifacts (plan_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_run_id      ON public.plan_artifacts (scan_run_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_type        ON public.plan_artifacts (artifact_type);
CREATE INDEX IF NOT EXISTS idx_artifacts_stage_id    ON public.plan_artifacts (stage_id);


-- =============================================================================
-- HELPER VIEWS (optional — for application convenience, not required)
-- =============================================================================

-- Operational BOQ items only (excludes demo and research-only items)
-- Commented out until RLS is designed — view would expose all rows without RLS.
-- CREATE OR REPLACE VIEW public.plan_boq_items_operational AS
--   SELECT * FROM public.plan_boq_items
--   WHERE boq_status != 'draft_research'
--   AND approved_for_boq = FALSE; -- safety: view should never show approved items in draft context

-- Human answers excluding demo entries
-- CREATE OR REPLACE VIEW public.plan_human_answers_real AS
--   SELECT * FROM public.plan_human_answers
--   WHERE demo = FALSE AND not_for_operational_use = FALSE;


-- =============================================================================
-- END OF MIGRATION DRAFT
-- =============================================================================
-- Tables: 16
-- Indexes: 46
-- CHECK constraints: 7 (including boq_no_auto_approval, boq_status_approval_consistency,
--                       answers_never_auto_approved, demo_not_operational,
--                       company_rule_needs_approver)
-- UNIQUE constraints: 3
-- Comments: all tables and key columns documented
--
-- NOT INCLUDED IN THIS FILE (must be added separately before applying):
--   - RLS ENABLE / DISABLE per table
--   - CREATE POLICY statements (see notes file for design)
--   - Triggers (e.g. updated_at auto-update, audit event insertion)
--   - Storage bucket configuration
--   - Function for advancing BOQ state machine (prevents invalid transitions)
-- =============================================================================
