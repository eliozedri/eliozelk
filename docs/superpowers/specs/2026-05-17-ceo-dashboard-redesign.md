# CEO Dashboard Redesign — Spec

**Date:** 2026-05-17  
**Scope:** `src/components/Dashboard/` only  
**Status:** Approved for implementation

---

## 1. Goal

Replace the current generic admin dashboard with a focused CEO command center that answers 10 key operational questions at a glance. No global layout changes. No backend changes. Real data only.

---

## 2. Scope Boundary

**IN SCOPE — modify only:**
- `src/components/Dashboard/index.tsx`
- All files under `src/components/Dashboard/`
- `src/components/Dashboard/useDashboardKPIs.ts`

**OUT OF SCOPE — do not touch:**
- `src/components/AppShell.tsx`
- `src/components/Sidebar.tsx`
- `src/app/layout.tsx`
- Any other page or component outside `src/components/Dashboard/`

---

## 3. App Shell Context

The existing app shell places a 208px dark navy sidebar on the RIGHT (RTL layout), and a `<main class="flex-1">` area for content. The dashboard renders entirely inside `<main>`. No second sidebar. No competing navigation panel.

---

## 4. Section Order (top to bottom)

1. `DashboardHero` — dark navy header, greeting, date, action buttons
2. `ExecutiveAttentionStrip` — FIRST content area section; red strip or green all-clear
3. `ExecutiveKpiRow` — 6 white KPI cards
4. Grid row A (4-col): `PipelineHealthTable` (col-span-2) + `AccountingBillingPanel` (col-span-1) + `DepartmentLoadPanel` (col-span-1)
5. Grid row B (3-col): `FieldReportsPanel` + `ProjectMap` + `CrewCapacityPanel`
6. `ActivitySection` — recent orders

---

## 5. DashboardHero

**File:** `src/components/Dashboard/DashboardHero.tsx`

- Dark navy background (`linear-gradient(135deg, #05111f, #0d1b2e, #1a2d4a)`)
- Content:
  - Eyebrow label: `ELKAYAM CONTROL CENTER` (gold, tiny uppercase)
  - Main heading: `מרכז שליטה אלקיים` (white, bold)
  - Subtext: Hebrew date + `· תמונת מצב תפעולית`
  - Action buttons (right-aligned): `הזמנה חדשה`, `יומן חדש`, `כל ההזמנות`
- Gold separator line below
- Replaces the current inline hero block in `index.tsx`

---

## 6. ExecutiveAttentionStrip

**File:** `src/components/Dashboard/ExecutiveAttentionStrip.tsx`

**Purpose:** Primary mental entry point. CEO sees this before KPI cards.

**When alerts exist (length > 0):**
- Rose/red background (`bg-red-50`, border `border-red-200`)
- Header: `דורשות טיפול מיידי` with alert count badge
- Each alert rendered as a card:
  - **Problem label** (bold, `text-sm`) — the business issue, visually dominant
  - Department label (small, muted)
  - Count badge (secondary, right side)
  - Clickable → opens DrillDownPanel
- Max 5 cards before "הצג עוד" link
- Data source: `kpis.alerts` from `useWorkflowAlerts`

**When no alerts:**
- Single compact green bar (no large card, no wasted space)
- Text: `✓ כל המערכות תקינות — אין פריטים הדורשים תשומת לב`
- Height: ~40px

---

## 7. ExecutiveKpiRow

**File:** `src/components/Dashboard/ExecutiveKpiRow.tsx`

**6 white cards, light workspace background, 3px colored bottom border**

Typography rule: label and context line are immediately readable; number is medium/large but NOT overwhelming. Layout: label (top, medium weight), number (center, 2xl/3xl), context (bottom, small muted).

| # | Label | Number | Context | Color | Click |
|---|---|---|---|---|---|
| 1 | הזמנות פעילות | `openOrders` | לא כולל מבוטלים | blue | `openStageDrill(all active)` |
| 2 | ממתינות לחיוב | `accountingPending` | הושלמו, טרם חויבו | amber | `openAccountingDrill` |
| 3 | חריגות SLA | `criticalAlerts` | הזמנות בחריגת זמן | red | `openSlaDrill` |
| 4 | יומני שדה היום | `todayFieldDiaries` | דיווח שדה פעיל | teal | `openDiariesDrill` |
| 5 | יומנים לאישור | `diariesPending` | ממתינים לאישור | purple | `openDiariesDrill` |
| 6 | ניצולת צוותים | `capacityUtilizationPct`% | `scheduledHoursThisWeek`/`totalCapacityHoursPerWeek` שעות | navy | no drill |

Card 6 replaces the separate "urgentOpen" card and embeds crew utilization visibly in the KPI row so it cannot be missed.

---

## 8. PipelineHealthTable

**File:** `src/components/Dashboard/PipelineHealthTable.tsx` (replaces `PipelineHealth.tsx`)

Table format with columns: **שלב | תקין | בינוני | קריטי | סה״כ**

- One row per pipeline stage
- Count cells: green (ok), amber (medium), red (critical) — colored text, no heavy background
- Bottleneck row: subtle yellow-left-border highlight + `עומס` badge
- Clickable rows → `openStageDrill(label, status)`
- Data source: `kpis.pipelineStages` (each stage has `greenCount`, `yellowCount`, `redCount`, `count` for total)
- Empty state: "אין הזמנות פעילות בצנרת"

---

## 9. AccountingBillingPanel

**File:** `src/components/Dashboard/AccountingBillingPanel.tsx` (replaces `FinancialVisibility.tsx`)

- Hero number: `uninvoicedCompleted` (large, amber)
- Sub-label: "הזמנות הושלמו ולא חויבו"
- Oldest invoice age: `oldestUninvoicedDays` days
- Accounting pipeline rows:
  - ממתינות לאישור: `verifiedOrders`
  - מאושרות לחיוב: `invoicedOrders`
  - סה״כ בטיפול חשבונאי: `accountingPending`
- No ₪ totals anywhere
- Click on hero → `openAccountingDrill`

---

## 10. DepartmentLoadPanel

**File:** `src/components/Dashboard/DepartmentLoadPanel.tsx` (replaces `DepartmentLoad.tsx`)

- 5 department rows (graphics, warehouse, fabrication, field, accounting)
- Each row: department name + horizontal bar + ok/mid/crit badge
- Badge colors: green (0 issues), amber (1-2), red (3+)
- Data source: `kpis.notifications` (per-department counts)

---

## 11. FieldReportsPanel

**File:** `src/components/Dashboard/FieldReportsPanel.tsx` (replaces `FieldExecution.tsx`)

**Prominent panel — not buried.** Shows all 5 documentation signals:

| Row | Label | Data source |
|---|---|---|
| 1 | יומנים ללא חתימת לקוח | `kpis.missingDiaryJobs` |
| 2 | יומנים בטיוטה (לא הוגשו) | `kpis.draftDiariesCount` |
| 3 | יומנים שהוגשו — ממתינים לאישור | `kpis.diariesPending` |
| 4 | יומני שדה היום | `kpis.todayFieldDiaries` |
| 5 | סה״כ יומנים שהוגשו | `kpis.submittedDiariesCount` |

Each row: label (bold) + count (right-aligned badge, color by severity). Rows with count > 0 get a colored left-border accent. Clickable → relevant drill-down. Panel header is strong and visible.

---

## 12. CrewCapacityPanel

**File:** `src/components/Dashboard/CrewCapacityPanel.tsx` (replaces `CrewCapacityWidget.tsx`)

**Placement:** Grid row B, col-span-1 (alongside FieldReportsPanel and ProjectMap) — visible without scrolling on most screens.

- Weekly utilization %: large display
- Used/available hours: `scheduledHoursThisWeek` / `totalCapacityHoursPerWeek`
- Active crews: `activeCrews`
- Progress bar (utilization color: green <70%, amber 70-90%, red >90%)
- No fake next-week data if not available from the hook

---

## 13. ProjectMap (preview)

**File:** `src/components/Dashboard/ProjectMap.tsx` — **unchanged**

Stays in grid row B, col-span-1. Link to `/workmap` for full map.

---

## 14. ActivitySection

**File:** `src/components/Dashboard/ActivitySection.tsx` — **unchanged**

Last section, below all panels.

---

## 15. DrillDownPanel

**File:** `src/components/Dashboard/DrillDownPanel.tsx` — **unchanged**

---

## 16. useDashboardKPIs

**File:** `src/components/Dashboard/useDashboardKPIs.ts`

No new fields required. All data already present. Verify the following are exported:
- `openOrders`, `urgentOpen`, `criticalAlerts`, `stuckOrders`
- `accountingPending`, `diariesPending`, `todayFieldDiaries`
- `pipelineStages` (with `greenCount`, `yellowCount`, `redCount`, `total`, `label`, `status`)
- `uninvoicedCompleted`, `oldestUninvoicedDays`, `verifiedOrders`, `invoicedOrders`
- `submittedDiariesCount`, `draftDiariesCount`, `missingDiaryJobs`
- `activeCrews`, `totalCapacityHoursPerWeek`, `scheduledHoursThisWeek`, `capacityUtilizationPct`
- `notifications`, `alerts`

---

## 17. Files to Delete (replaced by new names)

| Old file | Replaced by |
|---|---|
| `CommandStrip.tsx` | `ExecutiveKpiRow.tsx` |
| `PipelineHealth.tsx` | `PipelineHealthTable.tsx` |
| `FinancialVisibility.tsx` | `AccountingBillingPanel.tsx` |
| `FieldExecution.tsx` | `FieldReportsPanel.tsx` |
| `CrewCapacityWidget.tsx` | `CrewCapacityPanel.tsx` |
| `AlertsSection.tsx` | `ExecutiveAttentionStrip.tsx` |

Old files removed only after new ones are verified working.

---

## 18. Empty States

| Panel | Empty state |
|---|---|
| AttentionStrip (0 alerts) | Single green line "✓ כל המערכות תקינות" |
| PipelineHealthTable (no orders) | "אין הזמנות פעילות בצנרת" |
| AccountingBillingPanel (0) | "אין הזמנות ממתינות לחיוב" |
| FieldReportsPanel (all 0) | "✓ כל הדוחות הושלמו" |
| ActivitySection (no orders) | existing empty state |

---

## 19. What Is Removed

- Priority donut chart — not a CEO question
- `CommandStrip` — replaced by `ExecutiveKpiRow`
- Second assistant sidebar — not applicable (was only in mockup preview)
- Large empty `AlertsSection` card when no alerts — replaced by compact green line

---

## 20. Constraints

- No `AppShell`, `Sidebar`, or `layout.tsx` changes
- No backend/schema changes
- No fake ₪ totals
- No new hooks (reuse `useDashboardKPIs`)
- All new components mounted only inside `DashboardPage`
- RTL preserved throughout
- Build must pass TypeScript check before commit
