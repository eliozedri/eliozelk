# Elkayam / JARVIS — Agent System State (source of truth)

> Canonical current description of the agent system. Older agent docs under
> `docs/agents/*` (e.g. `agent-organization-master-spec.md`, `agent-operating-model.md`)
> are large historical specs — useful for intent, but when they disagree with this
> file, **this file wins.** Last updated: 2026-05-29.

## ⚠️ Active parallel work — DO NOT MODIFY without coordination
A separate session is actively building the **CEO-agent command layer**. These files
are mid-edit (uncommitted/committed by that session) and must not be touched here:
`src/app/api/jarvis/ceo-agent/route.ts` (+ `.test.ts`), `src/lib/jarvis/priceExecution.ts`,
`src/lib/jarvis/actionCatalog.ts`, `src/lib/jarvis/actionHandlers.ts`,
`src/app/jarvis-requests/*`, `src/components/JarvisRequests.tsx`, and
`supabase/migrations/20260611000000_jarvis_ceo_agent_commands.sql`. (Their
`ceo-agent` test is currently red — that's their in-progress refactor, not a regression here.)

## Top-level hierarchy
Two separate top-level agents + a layer of department agents:

1. **JARVIS** — personal / user-facing assistant. Raises requests, reads back
   business data, handles documents and dev tasks.
   - Routes: `/api/jarvis/intake` (queues a request), `/api/jarvis/catalog|orders|customers`
     (read-only readback), `/api/jarvis/ocr-worker` (cron OCR), `/api/jarvis/ceo-agent` (parallel).
   - Tables (all **service-role-write-only**): `jarvis_intake_records`, `jarvis_documents`,
     `jarvis_capability_requests`, `jarvis_dev_tasks`, `jarvis_brain_audit`,
     `jarvis_ceo_agent_commands`, `jarvis_master_menu`.
   - Reasoning/router context: see memory `project_jarvis_*` + `docs/JARVIS_*.md`.
2. **CEO agent** — executive / system-management. Evaluates and routes system tasks,
   handles Tier-A commands (e.g. price updates) into an **approval-gated command
   queue** (`jarvis_ceo_agent_commands`). Sensitive actions require owner approval;
   nothing auto-executes. (Being actively expanded — see warning above.)
3. **Department agents (9, "Neural Core")** — read-only anomaly **scanners**, one
   `POST /api/agents/<id>/scan` each, all gated by `verifyMasterAuth`:
   `ceo`, `cfo-agent`, `billing-collections-agent`, `orders-agent`, `inventory-agent`,
   `fabrication-agent`, `field-ops-agent`, `graphics-production-agent`,
   `catalog-pricing-agent`, `coordination-qa-agent`, `equipment-fleet-agent`.
   They detect issues and write to `agent_exceptions` / `agent_tasks` /
   `agent_activity_feed`, and raise `agent_approvals` for actions that need sign-off.
   Helpers live in `src/lib/agents/scan-utils.ts` (`upsertException`, `upsertTask`,
   `writeAgentActivity`, `logAgentAction` = audit, `verifyMasterAuth`).

## Communication & task lifecycle
- Jarvis raises tasks/requests → land as **pending** rows in service-role-only queues.
- CEO evaluates/routes; sensitive actions enter `jarvis_ceo_agent_commands` with an
  approval gate. Department scanners surface exceptions/tasks/approvals.
- **Approval rule:** external/bot/Jarvis/CEO sensitive actions never become final
  automatically — they appear as pending requests for owner approve/reject.
- **Audit:** `logAgentAction` records agent actions; scans set run status.

## UI integration
`AgentCommandCenter` + `DigitalHQ` (Neural Operations Core) render real agent data
(tasks/exceptions/approvals/speaking) — no mock/demo data. `/jarvis-requests` (parallel)
is the CEO-command review surface. `agents/stats-summary` (now auth-gated) feeds counts.

## Security boundaries (current)
- ✅ Jarvis/CEO command + capability + dev-task + document queues are
  **service-role-write-only** — clients cannot tamper.
- ✅ Scans master-gated; agent actions audited.
- ⚠️ **Gap:** `agent_tasks/exceptions/approvals/activity_feed` allow `ALL` for any
  authenticated user at the DB layer (RLS `auth.role()='authenticated'`), so an
  approval status could be flipped via direct PostgREST. Fold into
  `docs/SECURITY_RLS_PROPOSAL.md` (make agent_approvals/exceptions service-role-write-only).
- ⚠️ **Prompt-injection:** OCR/document/customer free-text may reach LLM-backed
  reasoning. Treat all extracted/user text as untrusted; never let it trigger
  unapproved actions. Tool/command execution must stay approval-gated, not derived
  from document text. (Render of such text is already escaped — no XSS.)

## Sub-agents — STAGED PLAN (not yet implemented; build only when needed)
Keep the 3-tier model; add sub-agents only with clear value. Each must define:
purpose · input · output · allowed actions · approval requirement · tables/routes · risk.
- **CEO:** Security Auditor, System-Health Auditor, Data-Integrity Auditor,
  Exception/Risk Monitor, Department Coordinator. (The "Security Auditor" is partly
  realized by the Supabase advisor checks done in this audit.)
- **Jarvis:** Task Intake, Document Intake (exists via ocr-worker), Order-Draft
  Assistant, Follow-up Reminder, Approval Assistant.
- **Operations:** Order-Intake Reviewer (exists as the drafts queue), Scheduling
  Assistant, Work-Readiness QA, Field Tracker.
- **Fleet:** Vehicle-Document Reviewer (exists via fleet scan). License/Test-Expiry
  detection **already exists** in `equipment-fleet-agent` (missing-license-number,
  inspection/test expiry, insurance expiry) and was **extended 2026-05-29 to also flag
  vehicle `license_expiry_date`** (expired / due-soon). Remaining: per-document
  `expiry_date` (operational docs JSONB) checks; Maintenance Reminder; Issue Triage.
- **Finance:** Invoice Classifier (exists in upload classification), Expense Linker,
  Supplier-Doc Reviewer, Collections Follow-up.
- **Warehouse:** Stock-Movement Validator, Low-Stock Alert, Catalog-Consistency,
  Adjustment Reviewer.
- **Graphics:** Design-Request Intake, Production QA, Visual-Asset Assistant.

Recommended first sub-agents to actually build (highest value, lowest risk, all
read-only/notify-only): **License/Test-Expiry Agent** (fleet), **Low-Stock Alert**
(warehouse), **Collections Follow-up** (finance). Each = a scheduled scan that raises
an exception/notification; no new mutation surface.

## What's implemented vs planned
- **Implemented:** 9 department scanners, Jarvis intake/readback/OCR-worker, CEO
  command queue (in progress), AgentCommandCenter/DigitalHQ UI, audit + approvals tables.
- **Planned only:** the sub-agents above; tightening agent-table RLS.

## Do not touch without explicit approval
The active CEO-agent parallel files (top of this doc); the approval-gate logic;
service-role-only queue model; agent-table RLS (until the proposal is approved).
