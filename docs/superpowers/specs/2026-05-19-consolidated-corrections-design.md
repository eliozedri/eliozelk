# Consolidated Corrections — Design Spec
**Date:** 2026-05-19  
**Scope:** 25 operational corrections across WorkDiary, OrderForm, Orders table, Graphics, Warehouse, Accounting, Customers, Scheduling

---

## Phase 1 — Critical Data Integrity

### 1A. Navigation Guard System
**Files:** `NavigationGuardContext.tsx`, `DraftProtectionModal.tsx`, `AppShell.tsx`, `Sidebar.tsx`

- `NavigationGuardContext` stores: `{ isDirty, onSaveDraft, onDiscard, showModal, pendingHref }`
- `DraftProtectionModal` renders Hebrew modal: "יש שינויים שלא נשמרו" / "הישאר בעמוד" / "שמור כטיוטה" / "מחק ויצא"
- `AppShell` wraps with `NavigationGuardProvider` + renders modal
- `Sidebar` links become guard-aware: onClick checks `isDirty`, if true → stores `pendingHref` + shows modal, else navigates normally
- `window.beforeunload` fallback: registered by forms when `isDirty === true`

### 1B. WorkDiary Form — Local-First Architecture
**Files:** `WorkDiary/index.tsx`, `types/workDiary.ts`

Root cause: `createDiary()` is called on every mount → inserts DB row immediately.

Fix:
- Remove the `useEffect(() => { createDiary()... })` call
- Replace with pure local state: `useState(() => createEmptyDiaryLocal())` — no DB write
- `createEmptyDiaryLocal()` returns a WorkDiary with local nanoid + placeholder number `"טיוטה"`
- Track `isDirty` = any field differs from initial empty state
- `handleSaveDraft()`: first call creates DB row (`status: "draft"`), subsequent calls update it
- `handleSubmit()`: creates DB row if not yet saved, then marks `status: "submitted"`
- Add `draftName?: string` field to `WorkDiary` type (optional, for display in draft list)
- Register guard with `NavigationGuardContext` when `isDirty && !submitted`

### 1C. OrderForm — Draft Protection
**Files:** `OrderForm/index.tsx`

The order form does NOT auto-create on mount (it uses `useOrderForm` local state). But we need:
- Track `isDirty` = any field differs from initial empty state
- Register guard with `NavigationGuardContext` when `isDirty && !submitted`
- "שמור כטיוטה" → call `addOrder(order, priority, { asDraft: true })` which saves with `status: "draft"`

### 1D. Dashboard Counter Fix
**File:** `Dashboard/useDashboardKPIs.ts`

- `todayFieldDiaries`: filter `d.status === "submitted" && d.executionDate === todayStr` (was counting all statuses)
- All other counters already correct (filter by status)

---

## Phase 2 — Operational Improvements

### 2A. "Show Completed" Toggles
- **Graphics** (`Graphics/index.tsx`): add `showCompleted` state → also show `graphics_done` orders
- **Warehouse** (`Warehouse/index.tsx`): add `showCompleted` state → also show completed warehouse items
- **Orders table** (`OrdersTableV2.tsx`): add toggle → include `completed` status orders
- **Schedule** (`WeeklySchedule/index.tsx`): add toggle → include completed scheduled jobs

### 2B. Warehouse Status in Orders Table
- `OrdersTableV2.tsx`: show "בטיפול מחסן" badge when `warehouseStatus === "processing"`
- `STATUS_LABELS.ready_installation` → rename to `"מוכן לביצוע ושיבוץ"`

### 2C. Accounting — Completed Orders Only + Filters
- `Accounting/index.tsx`: default filter = `status === "completed"` (was showing all)
- Add search/filter bar: customer, work type, location, date range, invoice status

### 2D. Customer Card Improvements
- `CustomerDetailPage.tsx`: add contact info section (phone, email, address), open balance/status, related orders, related journals, notes area (editable, persisted to customer record)
- `types/customer.ts`: add `address?: string`, `openBalance?: number`, `billingNotes?: string`

### 2E. New Order Form Cleanup
- **Merge fields**: remove separate `contactPerson` + `orderedBy` → single `"מזמין / איש קשר"` field (update `OrderHeader.tsx`, `types/order.ts`)
- **City expansion**: convert city dropdown to searchable input with 80+ Israeli cities in `cityCoordinates.ts`
- **jobName prominence**: already required in validation, ensure it appears before sections
- **Collapsible sections**: wrap sign/accessory/misc/service tables in `<details>` / accordion

### 2F. Work Diary Improvements
- **Item 16**: `startTime`/`endTime` already exist as fields but currently auto-fill with current time in `createEmptyDiary`. Change `startTime` default to `""` (require manual entry)
- **Item 17**: Remove phone from required validation
- **Item 18**: Evaluate "נתוני יום" section — contains billable amount, execution/travel/waiting hours. These ARE operationally useful (profitability panel uses them). Keep but move below tabs or make collapsible. Do NOT remove blindly.
- **Item 19**: Add `SecurityTeamsTab` with עגלות חץ + פקחים fields + quantity + notes
- **Item 20**: Add `AdditionalTeamsTab` with מנוף + מקרצפת + other tools + quantity + notes
- **Item 21**: Identify irrelevant "selection window" → review `DiaryHeader`, `PolesSignsTab`, `DocumentTab` before removing
- Add `securityTeams` and `additionalTeams` fields to `WorkDiary` type

### 2G. Monthly Scheduling View
- `WeeklySchedule/index.tsx`: add view mode toggle (week / month)
- Monthly view: 4-week grid, show job nicknames, estimated duration chips
- Support multi-day job spanning: `estimatedDurationDays?: number` field on WorkOrder
- Crew preference stored as `assignedCrewId` (already exists)

---

## DB/Schema Changes
- None destructive. Additive only:
  - `work_diaries.data` JSONB blob gets new fields: `draftName`, `securityTeams`, `additionalTeams`
  - `customers.data` or separate columns: `address`, `open_balance`, `billing_notes`
  - `work_orders.data` blob: `estimatedDurationDays`
  - All backward-compatible

---

## Counter Audit Targets
Dashboard: `openOrders`, `urgentOpen`, `todayFieldDiaries`, `submittedDiariesCount`, `draftDiariesCount`  
Sidebar badges: `notifications` from `useNotifications`  
Accounting screen: `uninvoicedCompleted`, `accountingPending`  
Graphics/Warehouse: local counts in component header
