# צי רכב ומכונות — Phase 1 Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax. Spec: `docs/superpowers/specs/2026-05-25-fleet-machines-module-design.md`.

**Goal:** Ship an operational Fleet & Machines management module (`/fleet`) built on the existing `equipment` table — catalog, detailed asset card, photo upload, maintenance/incidents/tasks, and operational-only documents. No financial recording.

**Architecture:** Additive Supabase migration (5 nullable columns on `equipment` + 3 new child tables). Service-role API routes guarded by `requireAction("manage_equipment")`. Client `useEquipment` hook (read via getSupabase, write via API). Components under `src/components/Fleet/`. Two storage buckets: `equipment-photos` (public), `equipment-documents` (private/signed).

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Supabase (Postgres + Storage), lucide-react, Hebrew RTL.

---

## File structure

**Create:**
- `supabase/migrations/20260525120000_fleet_phase1.sql`
- `src/app/fleet/page.tsx`
- `src/app/api/equipment/route.ts`
- `src/app/api/equipment/[id]/route.ts`
- `src/app/api/equipment/[id]/photo/route.ts`
- `src/app/api/equipment/[id]/document/route.ts`
- `src/app/api/equipment/[id]/maintenance/route.ts`
- `src/app/api/equipment/[id]/maintenance/[recId]/route.ts`
- `src/app/api/equipment/[id]/incidents/route.ts`
- `src/app/api/equipment/[id]/incidents/[incId]/route.ts`
- `src/app/api/equipment/[id]/tasks/route.ts`
- `src/app/api/equipment/[id]/tasks/[taskId]/route.ts`
- `src/hooks/useEquipment.ts`
- `src/components/Fleet/index.tsx`
- `src/components/Fleet/FleetKpiRow.tsx`
- `src/components/Fleet/FleetFilters.tsx`
- `src/components/Fleet/EquipmentCard.tsx`
- `src/components/Fleet/EquipmentTable.tsx`
- `src/components/Fleet/EquipmentDetailDrawer.tsx`
- `src/components/Fleet/EquipmentFormModal.tsx`
- `src/components/Fleet/PhotoUploader.tsx`
- `src/components/Fleet/panels/MaintenancePanel.tsx`
- `src/components/Fleet/panels/IncidentsPanel.tsx`
- `src/components/Fleet/panels/TasksPanel.tsx`
- `src/components/Fleet/panels/DocumentsPanel.tsx`
- `src/components/Fleet/fleetUtils.ts` (derived alerts/thresholds, shared helpers)

**Modify:**
- `src/types/equipment.ts` (categories, new fields, child types)
- `src/types/auth.ts` (TabId, ActionPermission, ALL_TABS, ROLE_DEFAULTS)
- `src/components/Sidebar.tsx` (nav item + Truck icon import)

**Not touched (Phase 2/3):** `supplier_documents*`, `expense_records*`, `document_duplicate_checks`, `duplicateCheck.ts`, `posting.ts`, accounting module, any financial route.

---

## Task 1: Phase 1 migration (additive, NOT applied to prod)

**Files:** Create `supabase/migrations/20260525120000_fleet_phase1.sql`

- [ ] **Step 1:** Write the migration:
  - `ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS` for: `out_of_service_reason text`, `current_location text`, `business_use text`, `license_expiry_date date`, `mileage integer`.
  - `CREATE TABLE IF NOT EXISTS public.equipment_maintenance_records` per spec §5.2 (FK `equipment_id → equipment(id) ON DELETE CASCADE`, CHECK on `status`, `linked_document_id text` no-FK, `attachments jsonb default '[]'`).
  - `CREATE TABLE IF NOT EXISTS public.equipment_incidents` per spec §5.3.
  - `CREATE TABLE IF NOT EXISTS public.equipment_tasks` per spec §5.4.
  - Indexes per spec.
  - Enable RLS on the 3 tables with `FOR ALL USING (auth.role()='authenticated') WITH CHECK (auth.role()='authenticated')` (mirroring `auth_all_equipment`).
  - `handle_updated_at` BEFORE UPDATE trigger on each.
  - Add the 3 tables to `supabase_realtime` publication guarded by the `pg_publication_tables` existence check pattern (from supplier intake migration) to stay idempotent.
- [ ] **Step 2:** Lint the SQL visually for the existence-guard idempotency (re-runnable). Do NOT apply to production.
- [ ] **Step 3:** Commit.

---

## Task 2: Extend equipment types

**Files:** Modify `src/types/equipment.ts`

- [ ] **Step 1:** Expand `EquipmentCategory` union + `EQUIPMENT_CATEGORY_LABELS` to the 12 keys (add `trucks`, `pickups`, `carts`; relabel `fleet` → "צי רכב (כללי)"). Keep all existing keys valid.
- [ ] **Step 2:** Add new fields to `Equipment` interface: `out_of_service_reason: string | null`, `current_location: string | null`, `business_use: string | null`, `license_expiry_date: string | null`, `mileage: number | null`.
- [ ] **Step 3:** Add child types + label/color maps:
  - `MaintenanceStatus` (`open`/`in_progress`/`completed`/`needs_check`) + labels + colors; `EquipmentMaintenanceRecord` interface.
  - `IncidentType`, `IncidentSeverity`, `IncidentStatus` + labels + colors; `EquipmentIncident` interface.
  - `EquipmentTaskStatus` + labels; `EquipmentTask` interface.
  - Helper `VEHICLE_CATEGORIES: Set<EquipmentCategory>` (trucks, pickups, fleet, trailers, arrow_carts, carts, heavy_equipment, forklifts) for the category-aware form.
- [ ] **Step 4:** `tsc --noEmit` — expect pre-existing-only errors (none new). Commit.

---

## Task 3: Auth wiring

**Files:** Modify `src/types/auth.ts`

- [ ] **Step 1:** Add `"fleet"` to `TabId`.
- [ ] **Step 2:** Add `"manage_equipment"` to `ActionPermission` + `ACTION_PERMISSION_LABELS` ("ניהול צי רכב ומכונות").
- [ ] **Step 3:** Add `{ id: "fleet", label: "צי רכב ומכונות", path: "/fleet", section: "מחלקות" }` to `ALL_TABS`.
- [ ] **Step 4:** In `ROLE_DEFAULTS.fleet_manager`: add `"fleet"` to tabs and `"manage_equipment"` to actions.
- [ ] **Step 5:** `tsc --noEmit`. Commit.

---

## Task 4: Sidebar nav item

**Files:** Modify `src/components/Sidebar.tsx`

- [ ] **Step 1:** Add `Truck` to the lucide-react import.
- [ ] **Step 2:** Add to the "מחלקות" `NAV_SECTIONS` entry: `{ tabId: "fleet", href: "/fleet", label: "צי רכב ומכונות", icon: <Truck className={ICON_CLS} />, matchFn: (p) => p.startsWith("/fleet"), noBadge: true }`.
- [ ] **Step 3:** Commit.

---

## Task 5: Equipment API routes (collection + item)

**Files:** Create `src/app/api/equipment/route.ts`, `src/app/api/equipment/[id]/route.ts`

- [ ] **Step 1:** `route.ts`:
  - `GET` — `requireAction(req,"manage_equipment")` (or read allowed to any authenticated; use `requireAuth`), return all rows from `equipment` where `is_active=true` ordered by `display_name`.
  - `POST` — `requireAction("manage_equipment")`; validate `display_name`, `category_key`; generate `id` (`equip-<nanoid>`); insert with safe defaults; return the row.
- [ ] **Step 2:** `[id]/route.ts`:
  - `GET` — single row.
  - `PATCH` — `requireAction`; whitelist updatable fields (identity, status, dates, specs, notes, photos, documents, new Phase-1 columns); set `updated_at`.
  - `DELETE` — `requireAction`; soft delete (`is_active=false`).
- [ ] **Step 3:** `tsc`. Commit.

Follow `getServiceSupabase()` + `requireAction` patterns from `catalog/upload-image/route.ts`.

---

## Task 6: Photo + operational document routes

**Files:** Create `src/app/api/equipment/[id]/photo/route.ts`, `src/app/api/equipment/[id]/document/route.ts`

- [ ] **Step 1:** `photo/route.ts` — clone `catalog/upload-image` logic: bucket `equipment-photos` (public), `ensureBucket`, path `<id>/<ts>.<ext>`, `getPublicUrl`, update `equipment.photos` (set as primary = index 0). `DELETE` removes the object + clears photos. Guard `manage_equipment`.
- [ ] **Step 2:** `document/route.ts` — bucket `equipment-documents` (private), `ensureBucket`, upload, `createSignedUrl` (1 year), append `{type,label,url,expiry_date,storage_path,uploaded_at}` to `equipment.documents`. `DELETE` (by storage_path) removes object + array entry. Allowed types: PDF + images. **No financial side effects.** Guard `manage_equipment`.
- [ ] **Step 3:** `tsc`. Commit.

---

## Task 7: Maintenance / incidents / tasks routes

**Files:** Create the 6 route files under `src/app/api/equipment/[id]/{maintenance,incidents,tasks}/(route.ts | [recId|incId|taskId]/route.ts)`

- [ ] **Step 1:** For each sub-resource: collection `route.ts` → `GET` (list by `equipment_id` ordered by date desc), `POST` (insert with `id` nanoid, `created_by` from profile name like the supplier upload route). Item `[xId]/route.ts` → `PATCH` (whitelist fields), `DELETE` (hard delete the child row). All guard `manage_equipment`.
- [ ] **Step 2:** `tsc`. Commit.

---

## Task 8: useEquipment hook

**Files:** Create `src/hooks/useEquipment.ts`

- [ ] **Step 1:** Read equipment list via `getSupabase().from("equipment").select("*").eq("is_active",true)`; expose `loading`, `equipment`, `refetch`. Provide `createEquipment`, `updateEquipment(id, patch)`, `deleteEquipment(id)` that call the API routes with the bearer token and optimistically update local state with rollback on failure (mirror existing hooks). Subscribe to realtime `equipment` changes for live refresh.
- [ ] **Step 2:** `tsc`. Commit.

(Sub-resource fetching — maintenance/incidents/tasks — is done inside the detail drawer panels via `fetch` to the API routes, scoped to the open asset.)

---

## Task 9: fleetUtils + KPI + filters

**Files:** Create `src/components/Fleet/fleetUtils.ts`, `FleetKpiRow.tsx`, `FleetFilters.tsx`

- [ ] **Step 1:** `fleetUtils.ts` — threshold constants mirrored from `equipment-fleet-agent` (inspection warn 30 / insurance warn 30 / maintenance warn 14, repair-stuck 30/60). Helpers: `isInspectionDueSoon`, `isInsuranceDueSoon`, `isMaintenanceDueSoon`, `daysUntil(date)`, `computeKpis(list)` (total, active, in_repair, …). Open-fault count requires incidents — for the list KPI, derive "upcoming test/service" from equipment date columns; open-faults KPI counted from a lightweight `/api/equipment/incidents-open-count`? **Simpler:** KPI "תקלות פתוחות" computed in Phase 1 from a single aggregate query in the hook (`equipment_incidents` where status in open/in_progress). Add that count to the hook.
- [ ] **Step 2:** `FleetKpiRow.tsx` — 6 KPI cards (total / active / in_repair / open faults / upcoming service / upcoming test) using `bg-surface`/tokens, RTL.
- [ ] **Step 3:** `FleetFilters.tsx` — search input + filter chips (category, status, open-faults, upcoming-service, upcoming-test, unidentified). Controlled via props.
- [ ] **Step 4:** `tsc`. Commit.

---

## Task 10: Equipment card + table

**Files:** Create `src/components/Fleet/EquipmentCard.tsx`, `EquipmentTable.tsx`

- [ ] **Step 1:** `EquipmentCard.tsx` — photo (or placeholder), display_name, category label, license/serial/id, status pill (`EQUIPMENT_STATUS_COLORS`), last/next maintenance, next test, open-fault dot, missing-critical-data amber pill (uses `identification_confidence !== 'confirmed'`), "פתח כרטיס" button. (Document/finance indicators deferred to Phase 2.)
- [ ] **Step 2:** `EquipmentTable.tsx` — compact table alternative with the same fields; sortable columns optional.
- [ ] **Step 3:** `tsc`. Commit.

---

## Task 11: Panels (maintenance / incidents / tasks / documents) + PhotoUploader

**Files:** Create the 4 panels + `PhotoUploader.tsx`

- [ ] **Step 1:** Each panel: fetch its list on mount (`/api/equipment/[id]/...`), render list with status/severity colors, an "add" form (inline or small modal), edit + delete. RTL Hebrew labels per spec §10.
- [ ] **Step 2:** `DocumentsPanel.tsx` — operational doc types only (license/test/insurance/manual/technical/warranty/other); upload via `/api/equipment/[id]/document`; show signed-URL link + expiry; delete. **No financial fields.**
- [ ] **Step 3:** `PhotoUploader.tsx` — file picker + preview, calls `/api/equipment/[id]/photo`, supports replace/delete.
- [ ] **Step 4:** `tsc`. Commit.

---

## Task 12: Detail drawer + form modal

**Files:** Create `EquipmentDetailDrawer.tsx`, `EquipmentFormModal.tsx`

- [ ] **Step 1:** `EquipmentDetailDrawer.tsx` — right-side drawer (full-width on mobile), header (photo + key identity + status), 7 tabs: סקירה כללית / פרטים טכניים / טיפולים (MaintenancePanel) / תקלות ואירועים (IncidentsPanel) / מסמכים (DocumentsPanel) / כספים (placeholder text "מודול הכספים יחובר בשלב 2") / תזכורות (TasksPanel). Overview tab shows out_of_service_reason when status=unserviceable, location, business_use, upcoming dates.
- [ ] **Step 2:** `EquipmentFormModal.tsx` — create/edit form; category-aware sections (vehicle fields when category ∈ VEHICLE_CATEGORIES; machine/spec fields otherwise); `technical_specs` simple key/value editor; status + out_of_service_reason (conditional). Calls hook create/update.
- [ ] **Step 3:** `tsc`. Commit.

---

## Task 13: Main screen + route

**Files:** Create `src/components/Fleet/index.tsx`, `src/app/fleet/page.tsx`

- [ ] **Step 1:** `index.tsx` — uses `useEquipment`; renders Header ("צי רכב ומכונות" + "הוסף כלי" button), `FleetKpiRow`, `FleetFilters`, view-toggle (grid/table), `EquipmentCard` grid / `EquipmentTable`, opens `EquipmentDetailDrawer` and `EquipmentFormModal`. Client-side filtering via fleetUtils.
- [ ] **Step 2:** `page.tsx` — thin client wrapper rendering `<Fleet />`; page background `bg-surface`, `dir="rtl"` inherited from layout.
- [ ] **Step 3:** `tsc`. Commit.

---

## Task 14: Build, typecheck, runtime verify

- [ ] **Step 1:** `npx tsc --noEmit` — clean (no new errors).
- [ ] **Step 2:** `npm run build`. If it fails with `.next` manifest ENOENT, that's the known iCloud/Desktop hazard, not the code — note it; Vercel build is authoritative.
- [ ] **Step 3:** Runtime verify per AGENTS.md: dev server from correct dir started after changes; `curl /fleet` → expect 200; tab visible for master/fleet_manager; create/edit asset, photo upload, open card, add maintenance/incident/task, attach operational doc — all work; no console errors; existing screens unbroken.
- [ ] **Step 4:** Final commit + completion report (files, migrations, tests, limitations, safe-to-proceed-to-UI-review). Do NOT push or apply migration to prod without explicit approval.

---

## What is NOT touched in Phase 1
- No financial tables, routes, or logic (`supplier_documents`, `expense_records`, `document_duplicate_checks`, `duplicateCheck.ts`, `posting.ts`).
- No "הנהלת כספים" screen, no invoices/delivery-notes, no duplicate detection, no expense classification.
- No `equipment_id` on financial documents.
- No production migration apply (file written + reviewed only).

## Final tests (summary)
`tsc --noEmit` clean · `npm run build` (Vercel authoritative) · runtime: `/fleet` 200 + tab visible + full CRUD + photo + operational docs working + no regressions.
