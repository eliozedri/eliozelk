# צי רכב ומכונות — Fleet & Machines Module (Design Spec)

**Date:** 2026-05-25
**Status:** Approved for Phase 1 implementation (migrations pending owner approval before applying to production)
**Author:** Claude + owner brainstorming session

---

## 1. Background & Goal

Elkayam (אלקיים סימון כבישים בע"מ) operates a large pool of physical assets: vehicles, trucks, trailers, road-marking machines, production/cutting machines, a laser machine, forklifts, generators, carts, heavy equipment (צמ"ה), and unidentified equipment.

The goal is a real operational management module for a **fleet & machines manager** — not a pretty catalog. At any moment the manager must know: which assets exist, each asset's status, what maintenance was done, which faults are open, which documents are attached, when the next test/service/inspection is due, and whether any asset is missing critical data.

This is delivered in **three phases with an approval gate between each**. This spec covers **Phase 1** in implementable detail and records Phases 2–3 as roadmap context so Phase 1 is built to receive them cleanly.

### Phase roadmap (owner-decided)
- **Phase 1 (this spec):** Full operational fleet module — sidebar tab, equipment catalog, detailed asset card, photo upload/edit, maintenance history, incidents/events, reminders/tasks, technical details, statuses + out-of-service reason, and an **operational-only documents tab**. No financial recording.
- **Phase 2:** Internal document scan/upload from fleet, `equipment` ↔ financial-document linking, the centralized **"הנהלת כספים"** screen. All financial documents continue into the *single* central tables (`supplier_documents` / `expense_records`) and only receive classification + links.
- **Phase 3:** Cross-system duplicate detection, finance KPIs, finance-manager alerts, documents-to-review queue, smart expense classification, UX polish, comprehensive tests.

---

## 2. What already exists (reuse — do NOT rebuild)

Discovered during the brainstorming exploration:

| Asset | Location | Reuse in Phase 1 |
|---|---|---|
| `equipment` table (full schema) | `supabase/migrations/20260526000000_equipment_table.sql` | **Core data model.** Already has 4 statuses, identification_confidence, technical_specs/photos/documents JSONB, maintenance/inspection/insurance dates. |
| Real seeded company assets | `supabase/migrations/20260518100000_seed_equipment_fleet.sql` | Live data the module renders. |
| `src/types/equipment.ts` | types + labels + colors | Extend with new categories/fields/sub-types. |
| `equipment-fleet-agent` scan | `src/app/api/agents/equipment-fleet-agent/scan/route.ts` | Source of truth for alert thresholds (test/insurance/maintenance warn days, stuck-in-repair). KPIs reuse the same thresholds. |
| Storage upload pattern (public bucket) | `src/app/api/catalog/upload-image/route.ts` | Template for `equipment-photos` bucket + photo CRUD. |
| Storage upload pattern (private/signed) | `src/app/api/supplier-documents/upload/route.ts` | Template for `equipment-documents` private bucket (signed URLs). |
| Auth model | `src/types/auth.ts` | `fleet_manager` role ("ציוד ורכב") already exists; add a `fleet` tab + `manage_equipment` action. |
| Sidebar | `src/components/Sidebar.tsx` | Add the new nav item. |
| Supabase hooks pattern (useRef + optimistic + rollback) | `src/hooks/*` | Template for `useEquipment`. |

**Financial backbone (Phase 2/3, do not touch in Phase 1):** `supplier_documents`, `supplier_document_lines`, `expense_records`, `expense_lines`, `document_duplicate_checks`, `document_review_events` (all in `20260529000000_supplier_document_intake.sql`), plus the working duplicate engine `src/lib/supplierDocuments/duplicateCheck.ts` (3-tier: file hash 1.0 → supplier+doc# 0.95 → supplier+date+total 0.8) and `posting.ts`.

---

## 3. Architectural principle: Centralized financial documents (Phase 2/3 context)

Recorded here so Phase 1 schema choices stay compatible.

Every financial document, regardless of entry point (general scan, fleet module, asset card, maintenance, parts, fault, supplier, manual upload, future email/Telegram/WhatsApp), lands in the **single** central financial tables (`supplier_documents` / `expense_records`). It is then **classified** rather than copied into department-specific tables. Classification fields (Phase 2):
- document type (tax invoice / receipt / delivery note / quote / other)
- supplier, date, amount, VAT
- **upload source** (fleet / general scan / finance / maintenance / parts / other)
- **business area** (fleet & machines / production / road marking / management / warehouse / project / other)
- **expense type** (maintenance, spare parts, fuel, insurance, test, equipment, raw materials, services, upkeep, rent, electricity, communications, external labor, other)
- linked asset (`equipment_id`), linked maintenance/incident/task

**Uncertainty rule:** if the system/agent cannot classify confidently, it must NOT silently guess — it marks the document "requires classification", asks the user, offers sensible options, and saves the decision so similar documents are classified automatically next time.

**Phase 1 consequence:** the new `equipment_maintenance_records` table carries a `linked_document_id text` (nullable, **no FK**) placeholder so Phase 2 can wire the asset↔document link without a schema change. Phase 1 writes no financial records.

---

## 4. Phase 1 scope boundary

**In scope (Phase 1):**
- New sidebar tab "צי רכב ומכונות" (`/fleet`).
- Main catalog screen: KPI row, search + filters, card Grid with a table-view toggle, "add equipment" button.
- Detailed asset card (drawer) with tabs: סקירה כללית / פרטים טכניים / טיפולים / תקלות ואירועים / מסמכים / כספים (placeholder) / תזכורות.
- Photo upload / replace / delete (primary image).
- Maintenance history (CRUD).
- Incidents/events (CRUD).
- Reminders/tasks (basic CRUD).
- Technical details (structured + `technical_specs` JSONB).
- Statuses (existing 4) + out-of-service reason.
- **Operational-only documents tab**: attach/view license, test, insurance, machine manual, technical doc, warranty cert, other (non-financial), stored on `equipment.documents` JSONB + `equipment-documents` storage bucket.

**Out of scope (Phase 2/3):**
- Any financial recording: invoices, delivery notes (financial), suppliers, expense records.
- `equipment_id` on financial documents, asset↔invoice bidirectional links.
- The "הנהלת כספים" screen.
- Financial document scanning / OCR-to-expense.
- Cross-system duplicate detection, finance KPIs/alerts, expense classification.

The asset card's "כספים" tab renders a Phase-2 placeholder ("יחובר בשלב 2"). Documents in Phase 1 are purely operational; the manager can view/attach a vehicle's license or test certificate, getting immediate value, without entering the financial domain.

---

## 5. Data model — Phase 1 migration (additive, non-destructive)

One migration file: `supabase/migrations/<ts>_fleet_phase1.sql`. All changes are additive; no existing data is altered or dropped.

### 5.1 New columns on `equipment` (all nullable)
- `out_of_service_reason text` — סיבת אי-שימוש; shown only when `status = 'unserviceable'`.
- `current_location text` — מיקום נוכחי.
- `business_use text` — תיאור שימוש עסקי.
- `license_expiry_date date` — תוקף רישיון רכב (distinct from test = existing `next_inspection_date`).
- `mileage integer` — קילומטראז'.

Other technical attributes (total weight, carrying capacity, power, voltage, fuel, dimensions, certifications) stay in the existing `technical_specs` JSONB — exactly as the original schema comment intended ("Flexible spec storage: weight, dimensions, power, certifications").

### 5.2 New table `equipment_maintenance_records`
FK `equipment_id → equipment(id) ON DELETE CASCADE`. RLS authenticated. `handle_updated_at` trigger. Realtime optional.
- `id text PK default gen_random_uuid()::text`
- `equipment_id text NOT NULL`
- `service_date date` — date performed (null while scheduled/open)
- `scheduled_date date` — future/planned date
- `maintenance_type text` — e.g. routine / repair / inspection / oil / tires / other
- `description text`
- `provider text` — מוסך / ספק / טכנאי
- `cost numeric`
- `parts_replaced text`
- `notes text`
- `status text NOT NULL default 'open' CHECK (status IN ('open','in_progress','completed','needs_check'))`
- `linked_document_id text` — **nullable, NO FK** (Phase 2 financial link placeholder)
- `attachments jsonb NOT NULL default '[]'` — operational file refs only (Phase 1)
- `created_by text`, `created_at timestamptz`, `updated_at timestamptz`

Indexes: `(equipment_id)`, `(status)`, `(scheduled_date) WHERE scheduled_date IS NOT NULL`.

### 5.3 New table `equipment_incidents`
FK `equipment_id → equipment(id) ON DELETE CASCADE`. RLS authenticated. `handle_updated_at` trigger.
- `id text PK`
- `equipment_id text NOT NULL`
- `opened_at date NOT NULL default CURRENT_DATE`
- `incident_type text NOT NULL CHECK (incident_type IN ('fault','accident','issue','damage','inspection','other'))`
- `severity text NOT NULL default 'medium' CHECK (severity IN ('low','medium','high','urgent'))`
- `description text`
- `status text NOT NULL default 'open' CHECK (status IN ('open','in_progress','resolved','closed'))`
- `reported_by text`
- `required_action text`
- `due_date date`
- `resolution text`
- `cost numeric`
- `photos jsonb NOT NULL default '[]'`
- `attachments jsonb NOT NULL default '[]'`
- `created_at`, `updated_at`

Indexes: `(equipment_id)`, `(status)`, `(severity) WHERE status IN ('open','in_progress')`.

### 5.4 New table `equipment_tasks` (reminders)
FK `equipment_id → equipment(id) ON DELETE CASCADE`. RLS authenticated. `handle_updated_at` trigger.
- `id text PK`
- `equipment_id text NOT NULL`
- `title text NOT NULL default ''`
- `task_type text` — e.g. reminder / scheduled_service / document_renewal / other
- `due_date date`
- `status text NOT NULL default 'pending' CHECK (status IN ('pending','done','cancelled'))`
- `reminder_at date`
- `notes text`
- `linked_maintenance_id text` — nullable, no FK
- `created_by text`, `created_at`, `updated_at`

Indexes: `(equipment_id)`, `(due_date) WHERE status = 'pending'`.

(Tasks are standalone reminders in Phase 1; integration with the existing notification system is Phase 3.)

### 5.5 Migration safety summary (for owner approval)
- New tables: 3 (`equipment_maintenance_records`, `equipment_incidents`, `equipment_tasks`).
- Altered table: `equipment` — 5 new nullable columns only.
- Indexes/constraints/FKs: per-table indexes above; FKs to `equipment(id)` with `ON DELETE CASCADE`; CHECK constraints on enum-like text columns.
- Data impact: none. Existing rows keep working; new columns default to NULL; category list change is TypeScript-only (no DB CHECK on `category_key`).
- Irreversible/risky: none. Forward-only additive migration.
- Seed/backfill: none required. Existing `fleet` category rows remain valid (kept as "צי רכב (כללי)"); the manager re-categorizes to משאיות/טנדרים via the UI.

---

## 6. Categories (TypeScript only — no DB constraint)

`category_key` is a free-text column with no CHECK, so expanding the list is a TS label change only.

Expanded list (12), English key → Hebrew label:
- `trucks` → משאיות
- `pickups` → טנדרים
- `fleet` → צי רכב (כללי)  *(kept so existing seed rows stay valid)*
- `trailers` → נגררים
- `carts` → עגלות
- `arrow_carts` → עגלות חץ
- `road_marking` → מכונות סימון כבישים
- `production` → ייצור וחיתוך
- `heavy_equipment` → צמ"ה
- `forklifts` → מלגזות
- `generators` → גנרטורים
- `unidentified` → ציוד לא מזוהה

**No** "לא בשימוש" category. Distinction model:
- **Category** = what kind of asset it is.
- **Status** = its operational state (`active` / `pending_approval` / `in_repair` / `unserviceable`).
- **out_of_service_reason** = why it's not in use (only meaningful when `unserviceable`).

---

## 7. Auth & navigation

- `TabId`: add `"fleet"`.
- `ALL_TABS`: add `{ id: "fleet", label: "צי רכב ומכונות", path: "/fleet", section: "מחלקות" }`.
- `ActionPermission`: add `manage_equipment` ("ניהול צי רכב ומכונות").
- `ROLE_DEFAULTS`: `fleet_manager` gains tab `"fleet"` + action `manage_equipment`; `master` unaffected (sees all). Optionally `office_manager` read access (decide at implementation; default: not added).
- `Sidebar.tsx`: add nav item in section "מחלקות" with `Truck` icon, route `/fleet`.

---

## 8. Application code

### 8.1 API routes (service-role, `requireAction` guarded)
- `GET /api/equipment` — list (filters server-side optional; client-side filtering acceptable for the asset volume).
- `POST /api/equipment` — create (`manage_equipment`).
- `GET/PATCH /api/equipment/[id]` — read / update (`manage_equipment`).
- `DELETE /api/equipment/[id]` — soft delete (`is_active = false`).
- `POST/DELETE /api/equipment/[id]/photo` — primary photo upload/replace/delete → `equipment-photos` public bucket (pattern from `catalog/upload-image`); updates `equipment.photos`.
- `POST/DELETE /api/equipment/[id]/document` — operational document attach/remove → `equipment-documents` private bucket (signed URLs); appends `{type,label,url,expiry_date}` to `equipment.documents`. **Operational only** — no financial side effects.
- `GET/POST /api/equipment/[id]/maintenance`, `PATCH/DELETE /api/equipment/[id]/maintenance/[recId]`.
- `GET/POST /api/equipment/[id]/incidents`, `PATCH/DELETE .../incidents/[incId]`.
- `GET/POST /api/equipment/[id]/tasks`, `PATCH/DELETE .../tasks/[taskId]`.

### 8.2 Hook
`src/hooks/useEquipment.ts` — reads via `getSupabase()` (RLS authenticated read), writes via the API routes above, following the established useRef + optimistic-update + rollback pattern. Provides the list, derived KPI counts, and filter helpers.

### 8.3 Components (`src/components/Fleet/`)
- `index.tsx` — main screen wrapper (`/fleet/page.tsx` is a thin wrapper).
- `FleetKpiRow.tsx` — KPI cards.
- `FleetFilters.tsx` — search + filter chips.
- `EquipmentCard.tsx` — grid card.
- `EquipmentTable.tsx` — table view (toggle).
- `EquipmentDetailDrawer.tsx` — detail drawer with 7 tabs.
- `EquipmentFormModal.tsx` — create/edit form (category-aware: vehicle vs machine field sets).
- `PhotoUploader.tsx` — image upload/replace/delete.
- `DocumentsPanel.tsx` — operational documents list + attach.
- `MaintenancePanel.tsx`, `IncidentsPanel.tsx`, `TasksPanel.tsx`.

### 8.4 Storage buckets
- `equipment-photos` — public (asset images).
- `equipment-documents` — private, signed URLs (operational docs may contain license/insurance details).

Both created lazily via `ensureBucket` on first upload, matching existing routes.

---

## 9. Main screen — KPI & filters

**KPI cards (Phase 1):** סה"כ כלים · פעילים · בשיפוץ · תקלות פתוחות · טיפולים קרובים · טסטים קרובים. *(מסמכים ממתינים — Phase 2.)*

**Filters (Phase 1):** free-text search (name / license number / serial number / manufacturer-model); category; status; open faults; upcoming maintenance; upcoming test; unidentified equipment. *(missing-documents / financial-documents filters — Phase 2.)*

Alert thresholds (upcoming test/insurance/maintenance) reuse the constants already defined in `equipment-fleet-agent` (e.g. inspection warn 30d / error 14d, maintenance warn 14d, repair-stuck 30/60d) to keep the manager's view and the agent consistent.

---

## 10. Detailed asset card — tabs

1. **סקירה כללית** — primary photo, key identity fields, status badge, out-of-service reason (if unserviceable), location, business use, next test/service/insurance, open-fault and upcoming-service indicators.
2. **פרטים טכניים** — category-aware: vehicle fields (license #, chassis #, engine #, year, mileage, license expiry, test/insurance validity) vs machine fields (serial #, power, weight, voltage/fuel, technical specs); plus the `technical_specs` JSONB editor.
3. **טיפולים** — maintenance history list + add/edit; each record per §5.2.
4. **תקלות ואירועים** — incidents list + add/edit; severity colors.
5. **מסמכים** — operational documents (license/test/insurance/manual/technical/warranty/other); attach/view/remove; expiry date per doc. **No financial documents.**
6. **כספים** — Phase-2 placeholder ("מודול הכספים יחובר בשלב 2").
7. **תזכורות** — tasks/reminders list + add/edit.

---

## 11. UX / RTL

- Full Hebrew RTL, right-aligned, Hebrew field/button labels.
- Tailwind v4 tokens already in `globals.css`: `bg-surface`, `text-navy-900`, `bg-ek-blue`, `bg-ek-gold`.
- Status colors from existing `EQUIPMENT_STATUS_COLORS`; identification colors from `IDENTIFICATION_CONFIDENCE_COLORS`.
- Responsive: mobile / tablet / desktop. Card grid collapses to single column on mobile; detail drawer is full-width on mobile.
- Color indicators present but restrained (status pill, red dot for open fault, amber for upcoming/needs-review).

---

## 12. Testing (end of Phase 1)

1. `tsc --noEmit` clean.
2. `npm run build` passes. *(Note: local builds on `~/Desktop/eliozelk` can fail due to an iCloud-sync hazard corrupting `.next`; if the local build fails with manifest ENOENT, that is the environment, not the code — Vercel build is authoritative.)*
3. Runtime verification per AGENTS.md protocol: correct branch + commit, dev server running from correct dir and started after the changes, `/fleet` returns 200, tab visible in sidebar for master/fleet_manager, permission check passes at runtime.
4. Functional: create asset, edit asset, upload/replace photo, open detail card, add maintenance record, add incident, attach operational document, add reminder. Filters and KPI counts reflect the data. No console errors. Existing screens unbroken.

**Migrations are NOT applied to production until the owner explicitly approves the migration file** (per §5.5).

---

## 13. Success criteria (Phase 1)

1. "צי רכב ומכונות" tab exists in the sidebar and opens `/fleet`.
2. The screen shows a clear, usable equipment catalog (cards + table toggle) reading real `equipment` data.
3. Every asset has a full detail card with the 7 tabs above.
4. Photo upload / replace / delete works against `equipment-photos`.
5. Maintenance history works (CRUD).
6. Incidents/events work (CRUD).
7. Operational documents tab works (attach/view/remove) — non-financial only.
8. Reminders/tasks work (CRUD).
9. Statuses (4) + out-of-service reason work; categories expanded; no duplicate category/status concepts.
10. `tsc` + build pass; no regressions to existing modules.
11. Full Hebrew RTL, responsive.
12. Migration file written, reviewed, and ready — applied to production only after explicit owner approval.
