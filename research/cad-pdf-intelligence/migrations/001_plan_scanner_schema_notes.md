# 001_plan_scanner_schema — Review Notes

**File:** `migrations/001_plan_scanner_schema.sql`  
**Status:** REVIEW DRAFT — not applied, not ready to apply  
**Date:** 2026-05-20  
**Based on:** `PLAN_SCANNER_DATA_MODEL.md`, `PLAN_SCANNER_PRODUCTION_READINESS_AUDIT.md`

---

## What the schema covers

16 PostgreSQL tables for the `סורק תוכניות` (Plan Scanner) module:

| # | Table | Purpose |
|---|---|---|
| 1 | `plans` | Top-level plan document record |
| 2 | `plan_files` | Uploaded PDF source files (Supabase Storage refs) |
| 3 | `plan_scan_runs` | Pipeline execution records (one per run) |
| 4 | `plan_pages` | Pages extracted from a PDF |
| 5 | `plan_human_answers` | Human answers from review form / teaching loop |
| 6 | `plan_legend_items` | Legend rows (מקרא) — 13 in research POC, 0 labeled |
| 7 | `plan_sign_occurrences` | Detected road sign locations — 177 in research POC |
| 8 | `plan_partial_codes` | Ambiguous code suffixes — 7 in research POC |
| 9 | `plan_element_groups` | Vector element groups — 31 in research POC |
| 10 | `plan_measurements` | Scale calibration and linear measurements |
| 11 | `plan_boq_items` | Unified BOQ line items — 47 in research POC, 0 approved |
| 12 | `plan_review_questions` | Structured review questions — 40 in research POC |
| 13 | `plan_teaching_rules` | Cross-plan persistent rules — 0 in research POC |
| 14 | `plan_review_sessions` | Tracked reviewer sessions |
| 15 | `plan_audit_events` | Immutable audit log (append-only) |
| 16 | `plan_artifacts` | Registry of generated files |

---

## Assumptions made in this draft

### 1. `projects` table does not exist
The original data model referenced `REFERENCES projects(id)` in `plans` and `plan_teaching_rules`. The production schema has **no** `projects` table as of 2026-05-20. Both references have been made **nullable UUIDs without a foreign key constraint** in this draft:
```sql
project_id UUID,  -- nullable: projects table not yet in production
applies_to_project_id UUID,  -- nullable
```
**Before applying:** decide whether to add a `projects` table, or keep plan_scanner plans as standalone records. If a `projects` table is added later, `ALTER TABLE ... ADD CONSTRAINT` can add the FK.

### 2. `auth.users(id)` is used for all user references
Supabase provides `auth.users` as the canonical user identity table. All user FK columns reference this. They use `ON DELETE SET NULL` to prevent orphaning records when a user is deleted.

**Before applying:** confirm that `auth.users(id)` is the correct reference for this project's user model, and that `ON DELETE SET NULL` is acceptable (vs. `RESTRICT`).

### 3. `public.profiles` is not referenced
The production schema has a `public.profiles` table. This draft does not reference it, to avoid tight coupling. If user display names or roles are needed, a join to `public.profiles` via `auth.users.id` can be added at the application layer.

### 4. `color_rgb8` stored as JSONB
The original design specified `INTEGER[]`. Supabase/PostgreSQL supports `INTEGER[]`, but JSONB is more portable for the Supabase client SDK and avoids type-casting issues. Changed to `JSONB` (stores `[0, 0, 0]` as a JSON array).

**Before applying:** verify whether `INTEGER[]` is preferred or JSONB is acceptable for this column.

### 5. `plan_human_answers` created before tables that reference it
The creation order places `plan_human_answers` at position 5 (before `plan_legend_items`, `plan_partial_codes`, `plan_element_groups`, `plan_measurements`, `plan_review_questions`) to satisfy foreign key dependencies. This is intentional and correct.

### 6. `plan_audit_events` has NO delete cascades
`plan_id` references `plans(id)` without `ON DELETE CASCADE`. This means deleting a plan does NOT delete its audit events. This is intentional: the audit trail must outlive the entities it describes.

### 7. Confidence field uses TEXT enum, not a PostgreSQL ENUM type
Confidence levels (`unknown`, `low`, `medium`, `high`, `confirmed`, `certain`) are implemented as `TEXT NOT NULL CHECK(...)` rather than `CREATE TYPE ... AS ENUM`. TEXT with a CHECK constraint is easier to extend and migrate than a PostgreSQL ENUM type.

### 8. `boq_item_id` and `question_id` are TEXT (not UUID)
The pipeline assigns human-readable IDs (`BOQ-CNT-001`, `Q-33-1`). These are kept as TEXT for traceability with the research JSON outputs. The database `id` (UUID) is the true primary key.

---

## Where JSONB is used and why

| Column | Table | Reason for JSONB |
|---|---|---|
| `run_metadata` | `plan_scan_runs` | Stage timings, red flags, warnings — evolves with pipeline version |
| `geometry` | `plan_pages`, `plan_sign_occurrences`, `plan_element_groups`, `plan_legend_items` | Bounding boxes, coordinates — structured but not queried relationally |
| `auto_result` | `plan_sign_occurrences`, `plan_element_groups`, `plan_legend_items`, `plan_boq_items`, `plan_partial_codes` | Original auto-detection payload — varies per pipeline version, never overwritten |
| `evidence` | `plan_sign_occurrences`, `plan_boq_items` | Crop paths, overlay paths — file references that change with pipeline runs |
| `audit_trail` | `plan_boq_items`, `plan_human_answers` | Per-item append-only history — array of change events |
| `answer_payload` | `plan_human_answers` | 8 different shapes (one per answer_type) — see data model §1.12 |
| `question_payload` | `plan_review_questions` | Full question context, evidence, answer schema, example |
| `measurement_payload` | `plan_measurements` | type_totals_m by element type, calibration runs — evolves with pipeline |
| `expansion_candidates` | `plan_partial_codes` | Ranked expansion list — structured array, not filtered individually |
| `rule_payload` | `plan_teaching_rules` | Rule content varies by rule_type |
| `calibration_point_a/b` | `plan_measurements` | Calibration geometry — 2D points, not queried relationally |
| `artifact_metadata` | `plan_artifacts` | Stage-specific metadata, related entity refs |
| `session_metadata` | `plan_review_sessions` | Form version, answer file path, session notes |
| `color_rgb8` | `plan_element_groups` | RGB tuple — stored as JSON array |

**Not** stored as JSONB (use relational columns for these):
- All `_id` / `_status` / `_type` fields — filtered and joined
- `quantity`, `unit`, `confidence` — sorted and aggregated
- `requires_review`, `approved_for_boq`, `human_confirmed` — filtered in WHERE clauses
- `created_at`, `updated_at`, `occurred_at` — time-series queries
- `page_number`, `row_index` — ordered and joined

---

## What existing production tables need verification before real migration

| Question | Current Status |
|---|---|
| Does `projects` table exist? | **No** — `project_id` is nullable UUID without FK in this draft |
| Is `auth.users(id)` the correct user identity reference? | **Assumed yes** — verify against `public.profiles` join pattern |
| Does any existing table use the name `plans`? | **No** — verified against `supabase/schema.sql` and all migrations |
| Is there a naming conflict with any of the 16 new tables? | **No** — all 16 table names are net-new |
| Are there existing RLS policies that would conflict? | **Unknown** — existing `public.profiles`, `work_orders` etc. have RLS; new tables are isolated |
| Does the Supabase Storage bucket `plan-files` exist? | **No** — must be created before migration is applied |
| Does the Supabase Storage bucket `plan-artifacts` exist? | **No** — must be created before migration is applied |

---

## Open questions before applying to Supabase

### Schema design questions

1. **Multi-tenancy / organisation isolation**: The current schema has no `organisation_id` column. If the production system serves multiple companies, every table needs an `organisation_id` with an RLS policy. Decision needed: single-tenant or multi-tenant?

2. **`plans.project_id`**: Should plans be grouped under a projects hierarchy? If yes, design and migrate `projects` table first. If no, drop the column from the final migration.

3. **BOQ approval workflow**: Who are the `plan_boq_approver` and `plan_rule_admin` roles? Are they Supabase `user_metadata` roles, a `public.profiles.role` field, or a separate `permissions` table? The `operational_approver_id` FK must reference the correct source of truth.

4. **`boq_status` state machine enforcement**: Should invalid state transitions be enforced by a PostgreSQL function/trigger, or only by the application layer? A trigger on `plan_boq_items` that rejects e.g. `draft_research → approved_for_boq` would be safer than relying on the API.

5. **Soft delete pattern**: Some tables use `ON DELETE CASCADE` from `plans`. Should plan deletion be soft (set `plans.status = 'archived'`) rather than hard? If yes, add `deleted_at TIMESTAMPTZ` columns and adjust cascade behavior.

6. **`plan_audit_events` partitioning**: At high volume, this table will grow fast. Does it need range partitioning by `occurred_at`? Not needed now, but worth noting for multi-plan production use.

7. **`plan_sign_occurrences.occurrence_id` as TEXT**: Currently pipeline IDs like `OCC-0001` are TEXT. Should this become a UUID in production, with a `pipeline_ref` TEXT column for the human-readable ID? Or keep TEXT for direct traceability?

### Supabase-specific questions

8. **RLS**: No `ENABLE ROW LEVEL SECURITY` or `CREATE POLICY` statements are in this draft. These are mandatory before any production deployment. See the RLS section below.

9. **Storage bucket policies**: `plan-files` and `plan-artifacts` buckets need explicit access policies. Who can upload? Who can read? Does the reviewer role need signed URLs?

10. **Function: updated_at trigger**: Several tables have `updated_at`. In Supabase, this typically requires a trigger function. Example:
    ```sql
    CREATE OR REPLACE FUNCTION public.update_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
    $$ LANGUAGE plpgsql;
    -- Then CREATE TRIGGER ... BEFORE UPDATE ON each table
    ```
    This is NOT included in the current draft.

11. **`plan_boq_items` constraint name**: The constraint `boq_no_auto_approval` must be visible in Supabase Studio for debugging. Verify that `CONSTRAINT ... CHECK(...)` syntax is correctly reflected in the Supabase UI.

---

## RLS / Permissions considerations

**No RLS policies are included in this draft.** They must be added before applying to any non-private Supabase project.

### Minimum required policies

Before applying the migration, design RLS policies for at minimum:

| Table | Read policy | Write policy |
|---|---|---|
| `plans` | Authenticated users in same org | `plan_uploader` role only |
| `plan_files` | Plan readers | `plan_uploader` only |
| `plan_scan_runs` | Plan readers | System/service role only |
| `plan_boq_items` | Plan readers | `plan_reviewer` for review fields; `plan_boq_approver` for approval fields |
| `plan_human_answers` | Plan readers (excluding demo) | `plan_reviewer` only |
| `plan_audit_events` | Plan readers | INSERT only for any authenticated — no UPDATE, no DELETE |
| `plan_teaching_rules` | Authenticated | `plan_reviewer` for project rules; `plan_rule_admin` for company rules |

### Demo data isolation

Demo answers (`plan_human_answers.demo = TRUE`) should be excluded from all operational queries. Consider a view:
```sql
CREATE VIEW public.plan_human_answers_operational AS
  SELECT * FROM public.plan_human_answers
  WHERE demo = FALSE AND not_for_operational_use = FALSE;
```

### BOQ approval gate (application layer)

Even with the DB constraint `boq_no_auto_approval`, the application layer must:
1. Check that the acting user has `plan_boq_approver` role before accepting a BOQ approval request
2. Set `operational_approver_id` to the acting user's UUID in the same transaction
3. Write a `plan_audit_events` row with `event_type = 'boq_approved'`

The DB constraint prevents the worst case (approval without an approver ID), but role-based access control must be enforced at the API level.

---

## Scanner-not-archive: retention lifecycle fields NOT YET in this SQL draft

**Post-draft addition (2026-05-20):** After the SQL draft was written, the product design was updated to enforce the "scanner, not archive" principle. The following fields were added to `PLAN_SCANNER_DATA_MODEL.md` but are **not yet present in `001_plan_scanner_schema.sql`**:

### `plan_files` — missing retention lifecycle columns

```sql
  retention_policy TEXT NOT NULL DEFAULT 'keep_outputs_only'
                   CHECK (retention_policy IN (
                     'ephemeral_scan_only',
                     'keep_outputs_only',
                     'keep_source_until_export',
                     'keep_source_for_project_archive',
                     'manual_delete_after_scan'
                   )),
  storage_status   TEXT NOT NULL DEFAULT 'temporary'
                   CHECK (storage_status IN (
                     'temporary', 'retained', 'deleted', 'export_only'
                   )),
  expires_at       TIMESTAMPTZ,
  deleted_at       TIMESTAMPTZ
```

### `plan_artifacts` — missing storage lifecycle columns and updated artifact_type values

The current SQL draft uses a narrower `artifact_type` CHECK. The updated set is:

```sql
  artifact_type TEXT NOT NULL CHECK (artifact_type IN (
    'source_upload', 'temporary_working_file',
    'generated_output', 'printable_report',
    'boq_report', 'boq_csv',
    'evidence_artifact', 'pipeline_summary', 'calibration'
  )),
  storage_status TEXT NOT NULL DEFAULT 'temporary'
                 CHECK (storage_status IN ('temporary','retained','deleted','export_only')),
  expires_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
```

**Before applying this migration:** update the SQL draft to include these columns. The `plans` table name does NOT imply that plans are permanently archived — the `plan_files` record persists but the source PDF may be deleted according to the retention policy.

**Design rule:** the DB record, all BOQ items, all audit events, and all generated outputs must persist permanently even when the source PDF file is deleted. Only `plan_files.storage_status` changes to `deleted` and `deleted_at` is populated — no cascade delete affects the scan results.

---

## Why this should not be applied yet

1. **Open questions 1–11 above are unresolved.** Applying an incomplete schema creates migration debt that is expensive to unwind.

2. **No RLS policies are included.** Applying without RLS would expose plan data to all authenticated users.

3. **No `updated_at` trigger is included.** `updated_at` columns would remain static after `INSERT` unless manually updated by the application.

4. **The workflow has not been validated with real data.** The research pipeline has processed one PDF with zero confirmed codes, zero calibrated measurements, and zero real human answers. Normalizing this unvalidated state into a DB prematurely creates schema migrations that may need to be reversed.

5. **The `projects` table does not exist.** If multi-plan scoping requires a project hierarchy, that table must be designed and applied before this migration.

6. **Storage buckets do not exist.** `plan_files` and `plan_artifacts` Supabase Storage buckets must be created before any file-linked rows can be inserted.

7. **Retention lifecycle fields are missing from the current SQL draft.** See the "Scanner-not-archive" section above — `plan_files` and `plan_artifacts` must be updated before the migration is applied.

8. **The productization roadmap prescribes a strict sequence.** Per `PLAN_SCANNER_PRODUCTION_READINESS_AUDIT.md`, Steps A→E: this migration (Step A) must be reviewed and approved before Step B (upload/intake wrapper). Steps B and C must complete before Step D (production UI spec). Only after all four steps should this migration be applied in a preview environment (Step E).

---

## Recommended review process before applying

1. [ ] Resolve open questions 1–11 above
2. [ ] **Add retention lifecycle fields** to `plan_files` and `plan_artifacts` in the SQL draft (see Scanner-not-archive section above)
3. [ ] Add `ENABLE ROW LEVEL SECURITY` for all 16 tables
4. [ ] Write `CREATE POLICY` statements (at minimum: plans, plan_boq_items, plan_human_answers, plan_audit_events)
5. [ ] Add `updated_at` trigger function and triggers for all tables with `updated_at`
6. [ ] Add BOQ state machine enforcement function (optional but recommended)
7. [ ] Create Supabase Storage buckets `plan-files` and `plan-artifacts` with lifecycle rules honouring retention policy
8. [ ] Apply migration to a Supabase **preview** project first
9. [ ] Seed with research POC data (S17 local state → DB rows)
10. [ ] Verify `boq_no_auto_approval` constraint rejects the right inputs
11. [ ] Verify `plan_audit_events` rejects UPDATE and DELETE at the policy level
12. [ ] Verify `plan_files.storage_status` transitions correctly (temporary → deleted) without cascading to BOQ or audit rows
13. [ ] Get sign-off from team lead
14. [ ] Apply to production (main Supabase project) only after preview is confirmed

---

*This notes file is part of the Plan Scanner Step A deliverable.*  
*No migrations have been applied. No production DB or UI has been modified.*  
*See also: `PLAN_SCANNER_DATA_MODEL.md`, `PLAN_SCANNER_PRODUCTION_READINESS_AUDIT.md`*
