# Elkayam / JARVIS — Current System State (source of truth)

> **Read this first.** It is the canonical, current description of how the system
> actually works. The dated files under `docs/superpowers/specs/` and
> `docs/superpowers/plans/` are **historical records of individual features** —
> useful for "why", but they describe the system *at the time they were written*
> and may not reflect current behavior. When this file and an older spec disagree,
> **this file wins.** Last updated: 2026-05-29.

## Companion docs
- **`docs/AGENTS_STATE.md`** — current agent hierarchy (JARVIS vs CEO vs department
  agents), lifecycle, approval rules, agent security, sub-agent staged plan.
- **`docs/SECURITY_RLS_PROPOSAL.md`** — role-aware RLS proposal for operational tables
  (NOT applied; needs approval).
- **`ocr-service/README.md`** — the OCR sidecar (prepared, not deployed).

## What this system is
Internal operational platform for **Elkayam Road Marking Ltd** (road signs, marking,
traffic arrangements, fleet). Next.js 16 (App Router, React 19) on **Vercel**,
Supabase (Postgres 17 + Auth + Storage). Hebrew-first, RTL.

There are **two Supabase projects**: `Elkayam System` (the main app, project ref
`gtevmcnasvrahzfdqrqk`) and a separate `JARVIS` project. The main app is the one
this repo deploys.

## Architecture at a glance
- **Auth:** Supabase Auth. `middleware.ts` redirects unauthenticated page requests
  to `/login` (public paths: `/login`, `/setup`). A present-but-unvalidatable
  session is allowed through on purpose (anti-false-logout); the data layer is the
  real guard. See [[feedback_auth_no_false_logout]].
- **Server authz:** API routes use `requireAuth` / `requireAction(req, "...")`
  (`src/lib/auth/apiAuth.ts`) and `verifyMasterAuth` (agents). Server writes use the
  **service-role** Supabase client (`getServiceSupabase`), which bypasses RLS.
- **Client data:** the browser uses the anon/publishable key + the user session and
  reads/writes many tables **directly** via PostgREST (see hooks `useOrders`,
  `useWorkDiaries`, `useCrews`, `useCatalog`). This is gated by RLS — see the
  security section for the important caveat.

## OCR / document intelligence (current)
- **Provider architecture** (`src/lib/supplierDocuments/ocrAdapter.ts`): a fallback
  chain, **not** a single engine: `httpOcrProvider` → `tesseractWasmProvider` →
  `rawTextProvider`. Parser/classification/UI consume one neutral `ExtractionResult`.
- **In-process engine:** `tesseract.js` (WASM, `tessdata_best` Hebrew). It is
  **crash-safe** (`ocrConfig.ts` `runWithCrashGuard` + 90 s timeout): a WASM abort
  becomes a catchable error instead of killing the function. Both OCR routes set
  `maxDuration=300`.
- **External engine (PREPARED, NOT DEPLOYED):** `ocr-service/` is a containerized
  FastAPI sidecar — native **Tesseract `heb+eng`** (the proven Hebrew baseline) +
  **optional, isolated PaddleOCR** (build arg `INSTALL_PADDLE`; Paddle has *no*
  Hebrew model, falls back to Tesseract, can never break the flow). It activates
  only when `OCR_SERVICE_URL` is set. **Recommended host: Google Cloud Run.** See
  `ocr-service/README.md`. Vercel **cannot** host it (no system packages, bundle
  cap). Until hosted, the app runs on the WASM fallback.
- **Failure handling:** OCR failure is never silent. Documents always become a
  recoverable `draft_ready` with `userError` (Hebrew) + `manualReviewReason`; the
  cron `recoverStuck` sweep rescues any row stranded in `extracting`. The review UI
  shows provider, fallback, raw text, confidence, low-confidence terms, vehicle
  fields. **OCR failure ≠ success.**
- Historical: `docs/superpowers/specs/2026-05-19-internal-mobile-ocr-design.md`
  (original tesseract.js-only design) is **superseded** by the above.

## Public vs internal route logic
- **Internal** = everything behind `middleware.ts` (requires a session) + per-route
  `requireAction`. **External/public intake is isolated and bearer-gated**, never
  the internal UI:
  - `POST /api/orders-intake/web` — external order form (JARVIS forwards) →
    lands a **pending** `team_bot_order_drafts` row for staff review. Bearer
    `EXTERNAL_INTAKE_TOKEN` + soft rate-limit + input clamping + idempotency.
    **Never creates a `work_order` directly.**
  - `POST /api/jarvis/intake` + `/api/jarvis/catalog|orders|customers` — bearer
    `JARVIS_INTAKE_TOKEN`, constant-time compare, `?v=1` gate. Intake inserts a
    **queued request** (`live-intake.ts`), not a work_order/customer/billing row.
  - `POST /api/team-bot/webhook` — Telegram secret-token header.
  - `POST /api/whatsapp/webhook` — Meta HMAC (`WHATSAPP_APP_SECRET`).
  - Dormant when their env secret is unset (503) — never publicly usable by default.
- **Approval model:** bot / external / Jarvis submissions enter review/approval
  queues; they become real orders only when staff promote them. Finance documents
  are never posted without explicit review (`supplier_documents` write = service-role
  only).

## Fleet / equipment document logic
- "סרוק מסמך" (`FleetScanModal` → `/api/fleet/scan-document`) analyzes only (no
  write), classifies, suggests the matching asset, then the client routes the file
  to finance (`/api/supplier-documents/upload`) or operational
  (`/api/equipment/[id]/document`). Documents tie to the asset by plate/chassis/serial
  match. Finance docs land as drafts for review; no auto-post.

## Security model (current) — READ THE CAVEAT
- **Good:** finance (`expense_records`, `supplier_documents`) + intake
  (`team_bot_order_drafts`) are **service-role-write-only**; the browser can only
  read them. Webhooks/intake are secret-gated. No secrets in the client bundle. OCR
  text and user fields render as escaped JSX (no XSS sink).
- **⚠️ Open risk — granular roles are NOT enforced at the DB:** operational tables
  (`work_orders`, `work_diaries`, `crews`, `catalog_items`, `equipment`,
  `agent_tasks`) have RLS `auth.role() = 'authenticated'` — i.e. **any** logged-in
  user has full ALL access via PostgREST. The `allowed_tabs` / `action_permissions`
  role model is enforced only in the UI/API, so a determined staffer could exceed
  their granted permissions with direct API calls. Tightening this (role-aware RLS,
  or moving those mutations server-side) is a **large, production-affecting change —
  do NOT do it without explicit approval and testing.**
- **Proposed but NOT applied:** `supabase/migrations/20260611000000_security_hardening_advisors.sql`
  — revokes `anon` EXECUTE on `SECURITY DEFINER` RPCs, pins `search_path`, tightens
  `suppliers` to read-only. Review then `supabase db push`.
- **Dashboard toggle pending:** enable Auth "leaked password protection".
- `inventory_movements` INSERT is permissive because the browser inserts it directly
  (`useCatalog`); left as-is by design.

## Deployment status (2026-05-29)
- JARVIS **is live** on `eliozelk.vercel.app` (commit `65920b7`).
- **Not deployed / not applied yet (intentional, owner will handle):** the OCR
  sidecar container; the security hardening migration; the leaked-password toggle.
- `ocr-service/` is excluded from the Vercel bundle (`.vercelignore`).

## Things a future session should NOT touch without explicit instruction
- Operational-table RLS (above) — big blast radius.
- The auth false-logout handling in `middleware.ts` / `AuthContext` — deliberately
  permissive; see [[project_auth_modal_hardening]].
- Finance posting flow — never auto-post; review-gated by design.
- `research/cad-pdf-intelligence/` and `plan-scanner` — experimental, separate from
  core ops.

## Known large files (refactor candidates, not urgent)
`Accounting/index.tsx` (2188), `OrdersTable/index.tsx` (1767), `Catalog/index.tsx`
(1717), `lib/agents/chat-engine.ts` (1688), `Profitability/index.tsx` (1406),
`AgentCommandCenter/index.tsx` (1356), `Warehouse/index.tsx` (1306). Split when
touched, not speculatively.

## Recommended next steps (priority order)
1. Decide on the operational-table RLS gap (role-aware RLS or server-side mutations).
2. Host the OCR sidecar (Cloud Run) + set `OCR_SERVICE_URL`/`OCR_SERVICE_TOKEN`;
   scan one doc to confirm whether prod WASM also aborts.
3. Apply the security hardening migration after review.
4. Enable leaked-password protection.
