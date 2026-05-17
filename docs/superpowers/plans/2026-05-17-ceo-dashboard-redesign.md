# CEO Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current generic dashboard with a focused CEO command center that lives entirely inside `src/components/Dashboard/`, leaving AppShell, Sidebar, and layout.tsx untouched.

**Architecture:** 8 new focused components replace 6 old ones; `index.tsx` is rewritten as a slim composition layer. All data comes from the existing `useDashboardKPIs` hook — no new hooks, no backend changes.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, RTL (Hebrew)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/Dashboard/DashboardHero.tsx` | Dark navy header: greeting, date, action buttons |
| Create | `src/components/Dashboard/ExecutiveAttentionStrip.tsx` | Alert strip (red) or all-clear bar (green) |
| Create | `src/components/Dashboard/ExecutiveKpiRow.tsx` | 6 KPI cards with color-coded bottom border |
| Create | `src/components/Dashboard/PipelineHealthTable.tsx` | Pipeline as table: שלב/תקין/בינוני/קריטי/סה״כ |
| Create | `src/components/Dashboard/AccountingBillingPanel.tsx` | Hero count + billing pipeline rows |
| Create | `src/components/Dashboard/DepartmentLoadPanel.tsx` | 5 dept bar rows with ok/mid/crit badge |
| Create | `src/components/Dashboard/FieldReportsPanel.tsx` | 5 field-doc signals |
| Create | `src/components/Dashboard/CrewCapacityPanel.tsx` | Weekly utilization % + hours bar |
| Rewrite | `src/components/Dashboard/index.tsx` | Compose all panels in correct order |
| Delete | `src/components/Dashboard/CommandStrip.tsx` | Replaced by ExecutiveKpiRow |
| Delete | `src/components/Dashboard/PipelineHealth.tsx` | Replaced by PipelineHealthTable |
| Delete | `src/components/Dashboard/FinancialVisibility.tsx` | Replaced by AccountingBillingPanel |
| Delete | `src/components/Dashboard/FieldExecution.tsx` | Replaced by FieldReportsPanel |
| Delete | `src/components/Dashboard/CrewCapacityWidget.tsx` | Replaced by CrewCapacityPanel |
| Delete | `src/components/Dashboard/AlertsSection.tsx` | Replaced by ExecutiveAttentionStrip |
| Keep | `src/components/Dashboard/ActivitySection.tsx` | Unchanged |
| Keep | `src/components/Dashboard/ProjectMap.tsx` | Unchanged |
| Keep | `src/components/Dashboard/DrillDownPanel.tsx` | Unchanged |
| Keep | `src/components/Dashboard/useDashboardKPIs.ts` | Unchanged |

**Do not touch:** `AppShell.tsx`, `Sidebar.tsx`, `layout.tsx`

---

## Task 1: DashboardHero

**Files:**
- Create: `src/components/Dashboard/DashboardHero.tsx`

- [ ] **Step 1: Create DashboardHero.tsx**

```tsx
// src/components/Dashboard/DashboardHero.tsx
"use client";

import Link from "next/link";

function PlusIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function todayLabel(): string {
  return new Date().toLocaleDateString("he-IL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

export function DashboardHero() {
  return (
    <div style={{ background: "linear-gradient(135deg, #05111f 0%, #0d1b2e 55%, #1a2d4a 100%)" }}>
      <div className="px-6 py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-ek-gold text-[9px] font-bold uppercase tracking-[0.25em] mb-2 opacity-80">
              ELKAYAM CONTROL CENTER
            </p>
            <h1 className="text-3xl font-black text-white leading-tight tracking-tight">
              מרכז שליטה אלקיים
            </h1>
            <p className="text-white/40 text-sm mt-1.5">{todayLabel()} · תמונת מצב תפעולית</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/new-order"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-ek-blue hover:bg-ek-blue-600 text-white text-sm font-semibold transition-colors shadow-lg shadow-ek-blue/20"
            >
              <PlusIcon />
              הזמנה חדשה
            </Link>
            <Link
              href="/work-diary"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-ek-blue hover:bg-ek-blue-600 text-white text-sm font-semibold transition-colors shadow-lg shadow-ek-blue/20"
            >
              <PlusIcon />
              יומן חדש
            </Link>
            <Link
              href="/orders"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-medium transition-colors border border-white/15 hover:bg-white/8"
            >
              כל ההזמנות
            </Link>
          </div>
        </div>
        <div className="mt-5 h-px" style={{ background: "linear-gradient(to left, transparent, rgba(245,158,11,0.4), transparent)" }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd /Users/eliozedri/Desktop/eliozelk && npx tsc --noEmit 2>&1 | grep "DashboardHero" | head -10
```

Expected: no output (no errors in this file).

---

## Task 2: ExecutiveAttentionStrip

**Files:**
- Create: `src/components/Dashboard/ExecutiveAttentionStrip.tsx`

- [ ] **Step 1: Create ExecutiveAttentionStrip.tsx**

```tsx
// src/components/Dashboard/ExecutiveAttentionStrip.tsx
"use client";

import { DEPT_LABELS } from "@/hooks/useWorkflowAlerts";
import type { WorkflowAlert } from "@/hooks/useWorkflowAlerts";

interface Props {
  alerts: WorkflowAlert[];
  onAlertClick: (alert: WorkflowAlert) => void;
}

export function ExecutiveAttentionStrip({ alerts, onAlertClick }: Props) {
  if (alerts.length === 0) {
    return (
      <div className="mx-6 mt-4 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium">
        <span className="text-base">✓</span>
        <span>כל המערכות תקינות — אין פריטים הדורשים תשומת לב</span>
      </div>
    );
  }

  const visible = alerts.slice(0, 5);
  const hidden = alerts.length - visible.length;

  return (
    <div className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-red-200">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-red-700">דורשות טיפול מיידי</span>
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[11px] font-bold leading-none">
            {alerts.length}
          </span>
        </div>
      </div>
      <div className="p-3 flex flex-col gap-2">
        {visible.map((alert) => (
          <button
            key={alert.id}
            onClick={() => onAlertClick(alert)}
            className="w-full text-right flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-white border border-red-100 hover:border-red-300 hover:shadow-sm transition-all group"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-red-800 leading-snug">{alert.message}</p>
              <p className="text-[11px] text-red-500 mt-0.5">
                {DEPT_LABELS[alert.department] ?? alert.department}
              </p>
            </div>
            <span className={`
              shrink-0 inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full text-sm font-bold leading-none
              ${alert.severity === "critical" ? "bg-red-600 text-white" : "bg-amber-100 text-amber-700"}
            `}>
              {alert.count}
            </span>
          </button>
        ))}
        {hidden > 0 && (
          <p className="text-xs text-red-500 text-center py-1">
            + {hidden} התראות נוספות
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors in this file**

```bash
cd /Users/eliozedri/Desktop/eliozelk && npx tsc --noEmit 2>&1 | grep "ExecutiveAttentionStrip" | head -10
```

Expected: no output.

---

## Task 3: ExecutiveKpiRow

**Files:**
- Create: `src/components/Dashboard/ExecutiveKpiRow.tsx`

- [ ] **Step 1: Create ExecutiveKpiRow.tsx**

```tsx
// src/components/Dashboard/ExecutiveKpiRow.tsx
"use client";

interface KpiCardProps {
  label: string;
  value: number | string;
  context: string;
  accentColor: string;
  borderColor: string;
  onClick?: () => void;
}

function KpiCard({ label, value, context, accentColor, borderColor, onClick }: KpiCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`
        flex-1 min-w-0 bg-white rounded-xl px-4 py-3.5 text-right
        border border-gray-100 shadow-sm
        ${onClick ? "hover:shadow-md hover:border-gray-200 transition-all cursor-pointer active:scale-[0.99]" : "cursor-default"}
        flex flex-col gap-1
      `}
      style={{ borderBottom: `3px solid ${borderColor}` }}
    >
      <p className="text-[11px] font-semibold text-gray-500 leading-tight truncate">{label}</p>
      <p className="text-2xl font-black leading-none" style={{ color: accentColor }}>{value}</p>
      <p className="text-[10px] text-gray-400 leading-tight truncate">{context}</p>
    </button>
  );
}

interface Props {
  openOrders: number;
  accountingPending: number;
  criticalAlerts: number;
  todayFieldDiaries: number;
  diariesPending: number;
  capacityUtilizationPct: number;
  scheduledHoursThisWeek: number;
  totalCapacityHoursPerWeek: number;
  onActiveOrdersClick: () => void;
  onAccountingClick: () => void;
  onSlaClick: () => void;
  onDiariesClick: () => void;
}

export function ExecutiveKpiRow({
  openOrders,
  accountingPending,
  criticalAlerts,
  todayFieldDiaries,
  diariesPending,
  capacityUtilizationPct,
  scheduledHoursThisWeek,
  totalCapacityHoursPerWeek,
  onActiveOrdersClick,
  onAccountingClick,
  onSlaClick,
  onDiariesClick,
}: Props) {
  return (
    <div className="px-6 pt-4 pb-2 flex gap-3 flex-wrap sm:flex-nowrap">
      <KpiCard
        label="הזמנות פעילות"
        value={openOrders}
        context="לא כולל מבוטלים"
        accentColor="#1d6fd8"
        borderColor="#1d6fd8"
        onClick={onActiveOrdersClick}
      />
      <KpiCard
        label="ממתינות לחיוב"
        value={accountingPending}
        context="הושלמו, טרם חויבו"
        accentColor="#d97706"
        borderColor="#f59e0b"
        onClick={onAccountingClick}
      />
      <KpiCard
        label="חריגות SLA"
        value={criticalAlerts}
        context="הזמנות בחריגת זמן"
        accentColor={criticalAlerts > 0 ? "#dc2626" : "#6b7280"}
        borderColor={criticalAlerts > 0 ? "#ef4444" : "#e5e7eb"}
        onClick={onSlaClick}
      />
      <KpiCard
        label="יומני שדה היום"
        value={todayFieldDiaries}
        context="דיווח שדה פעיל"
        accentColor="#0d9488"
        borderColor="#14b8a6"
        onClick={onDiariesClick}
      />
      <KpiCard
        label="יומנים לאישור"
        value={diariesPending}
        context="ממתינים לאישור"
        accentColor={diariesPending > 0 ? "#7c3aed" : "#6b7280"}
        borderColor={diariesPending > 0 ? "#8b5cf6" : "#e5e7eb"}
        onClick={onDiariesClick}
      />
      <KpiCard
        label="ניצולת צוותים"
        value={`${capacityUtilizationPct}%`}
        context={`${scheduledHoursThisWeek}/${totalCapacityHoursPerWeek} שעות השבוע`}
        accentColor={capacityUtilizationPct > 90 ? "#dc2626" : capacityUtilizationPct > 70 ? "#d97706" : "#0d9488"}
        borderColor="#0d1b2e"
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd /Users/eliozedri/Desktop/eliozelk && npx tsc --noEmit 2>&1 | grep "ExecutiveKpiRow" | head -10
```

Expected: no output.

---

## Task 4: PipelineHealthTable

**Files:**
- Create: `src/components/Dashboard/PipelineHealthTable.tsx`

- [ ] **Step 1: Create PipelineHealthTable.tsx**

```tsx
// src/components/Dashboard/PipelineHealthTable.tsx
"use client";

import type { PipelineStageKPI } from "./useDashboardKPIs";

interface Props {
  stages: PipelineStageKPI[];
  bottleneck: string | null;
  onStageClick: (label: string, status: string) => void;
}

function CountCell({ n, type }: { n: number; type: "green" | "yellow" | "red" }) {
  if (n === 0) return <td className="px-3 py-2 text-center text-xs text-gray-300 tabular-nums">—</td>;
  const colors = {
    green:  "text-emerald-600 font-semibold",
    yellow: "text-amber-600 font-semibold",
    red:    "text-red-600 font-bold",
  };
  return (
    <td className={`px-3 py-2 text-center text-sm tabular-nums ${colors[type]}`}>{n}</td>
  );
}

export function PipelineHealthTable({ stages, bottleneck, onStageClick }: Props) {
  const hasOrders = stages.some(s => s.count > 0);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden h-full">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-900">בריאות צנרת</h2>
          <p className="text-[10px] text-gray-400 mt-0.5">מצב SLA לפי שלב · לחץ לקידוח</p>
        </div>
        {bottleneck && (
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
            עומס: {bottleneck}
          </span>
        )}
      </div>
      {!hasOrders ? (
        <div className="px-4 py-8 text-center text-xs text-gray-400">אין הזמנות פעילות בצנרת</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="px-4 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wide">שלב</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">תקין</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold text-amber-600 uppercase tracking-wide">בינוני</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold text-red-600 uppercase tracking-wide">קריטי</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide">סה״כ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stages.map((stage) => {
                const isBottleneck = bottleneck === stage.label;
                return (
                  <tr
                    key={stage.status}
                    onClick={() => onStageClick(stage.label, stage.status)}
                    className={`
                      cursor-pointer transition-colors hover:bg-gray-50
                      ${isBottleneck ? "bg-amber-50/60 border-r-2 border-r-amber-400" : ""}
                      ${stage.count === 0 ? "opacity-40" : ""}
                    `}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-800">{stage.label}</span>
                        {isBottleneck && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">עומס</span>
                        )}
                      </div>
                    </td>
                    <CountCell n={stage.greenCount} type="green" />
                    <CountCell n={stage.yellowCount} type="yellow" />
                    <CountCell n={stage.redCount} type="red" />
                    <td className="px-3 py-2 text-center text-sm font-semibold text-gray-700 tabular-nums">
                      {stage.count > 0 ? stage.count : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd /Users/eliozedri/Desktop/eliozelk && npx tsc --noEmit 2>&1 | grep "PipelineHealthTable" | head -10
```

Expected: no output.

---

## Task 5: AccountingBillingPanel

**Files:**
- Create: `src/components/Dashboard/AccountingBillingPanel.tsx`

- [ ] **Step 1: Create AccountingBillingPanel.tsx**

```tsx
// src/components/Dashboard/AccountingBillingPanel.tsx
"use client";

interface Props {
  uninvoicedCompleted: number;
  oldestUninvoicedDays: number;
  verifiedOrders: number;
  invoicedOrders: number;
  accountingPending: number;
  onAccountingClick: () => void;
}

interface BillingRow { label: string; value: number; color: string; }

function Row({ label, value, color }: BillingRow) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-600">{label}</span>
      <span className={`text-sm font-bold ${color}`}>{value}</span>
    </div>
  );
}

export function AccountingBillingPanel({
  uninvoicedCompleted,
  oldestUninvoicedDays,
  verifiedOrders,
  invoicedOrders,
  accountingPending,
  onAccountingClick,
}: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">חיוב וחשבונאות</h2>
        <p className="text-[10px] text-gray-400 mt-0.5">הזמנות בטיפול פיננסי</p>
      </div>

      {uninvoicedCompleted === 0 ? (
        <div className="flex-1 flex items-center justify-center px-4 py-6">
          <p className="text-xs text-gray-400 text-center">✓ אין הזמנות ממתינות לחיוב</p>
        </div>
      ) : (
        <>
          <button
            onClick={onAccountingClick}
            className="flex flex-col items-center justify-center py-5 hover:bg-amber-50 transition-colors border-b border-gray-100 group"
          >
            <p className="text-4xl font-black text-amber-600 group-hover:text-amber-700 tabular-nums">{uninvoicedCompleted}</p>
            <p className="text-[11px] font-semibold text-gray-600 mt-1">הושלמו ולא חויבו</p>
            {oldestUninvoicedDays > 0 && (
              <p className="text-[10px] text-gray-400 mt-0.5">הישנה ביותר: {oldestUninvoicedDays} ימים</p>
            )}
          </button>
          <div className="px-4 py-2 flex-1">
            <Row label="ממתינות לאישור"     value={verifiedOrders}    color="text-amber-600" />
            <Row label="מאושרות לחיוב"      value={invoicedOrders}    color="text-blue-600" />
            <Row label="סה״כ בטיפול חשבונאי" value={accountingPending} color="text-gray-700" />
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd /Users/eliozedri/Desktop/eliozelk && npx tsc --noEmit 2>&1 | grep "AccountingBillingPanel" | head -10
```

Expected: no output.

---

## Task 6: DepartmentLoadPanel

**Files:**
- Create: `src/components/Dashboard/DepartmentLoadPanel.tsx`

- [ ] **Step 1: Create DepartmentLoadPanel.tsx**

```tsx
// src/components/Dashboard/DepartmentLoadPanel.tsx
"use client";

import type { NotificationCounts } from "@/hooks/useNotifications";

interface Props {
  notifications: NotificationCounts;
}

interface DeptRow {
  label: string;
  count: number;
  max: number;
}

function LoadRow({ label, count, max }: DeptRow) {
  const pct = max > 0 ? Math.min(100, Math.round((count / max) * 100)) : 0;
  const badge = count === 0
    ? { text: "תקין", cls: "bg-emerald-100 text-emerald-700" }
    : count <= 2
    ? { text: "בינוני", cls: "bg-amber-100 text-amber-700" }
    : { text: "עמוס", cls: "bg-red-100 text-red-700" };
  const barColor = count === 0 ? "bg-emerald-400" : count <= 2 ? "bg-amber-400" : "bg-red-500";

  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-700 w-20 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${badge.cls}`}>{badge.text}</span>
    </div>
  );
}

export function DepartmentLoadPanel({ notifications }: Props) {
  const maxLoad = 10;
  const rows: DeptRow[] = [
    { label: "גרפיקה",   count: notifications.graphics,    max: maxLoad },
    { label: "מחסן",     count: notifications.warehouse,   max: maxLoad },
    { label: "מסגריה",   count: notifications.fabrication, max: maxLoad },
    { label: "חשבונאות", count: notifications.accounting,  max: maxLoad },
    { label: "שיבוץ",    count: notifications.schedule,    max: maxLoad },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden h-full">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">עומס מחלקות</h2>
        <p className="text-[10px] text-gray-400 mt-0.5">פריטים ממתינים לטיפול לפי מחלקה</p>
      </div>
      <div className="px-4 py-2">
        {rows.map((row) => (
          <LoadRow key={row.label} {...row} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd /Users/eliozedri/Desktop/eliozelk && npx tsc --noEmit 2>&1 | grep "DepartmentLoadPanel" | head -10
```

Expected: no output.

---

## Task 7: FieldReportsPanel

**Files:**
- Create: `src/components/Dashboard/FieldReportsPanel.tsx`

- [ ] **Step 1: Create FieldReportsPanel.tsx**

```tsx
// src/components/Dashboard/FieldReportsPanel.tsx
"use client";

interface ReportRow {
  label: string;
  count: number;
  severity: "info" | "warn" | "critical" | "neutral";
  onClick?: () => void;
}

function ReportRowItem({ label, count, severity, onClick }: ReportRow) {
  const accent: Record<string, string> = {
    critical: "border-r-red-500 bg-red-50/40",
    warn:     "border-r-amber-400 bg-amber-50/30",
    info:     "border-r-blue-400 bg-blue-50/20",
    neutral:  "border-r-gray-200",
  };
  const badge: Record<string, string> = {
    critical: "bg-red-100 text-red-700 font-bold",
    warn:     "bg-amber-100 text-amber-700 font-bold",
    info:     "bg-blue-100 text-blue-700 font-semibold",
    neutral:  "bg-gray-100 text-gray-600",
  };

  return (
    <div
      onClick={onClick}
      className={`
        flex items-center justify-between px-3 py-2.5 border-r-2 mb-1.5 rounded-lg
        ${accent[severity]}
        ${onClick ? "cursor-pointer hover:bg-opacity-60 transition-colors" : ""}
      `}
    >
      <span className={`text-xs ${count > 0 ? "font-semibold text-gray-800" : "text-gray-500"}`}>{label}</span>
      <span className={`text-sm px-2 py-0.5 rounded tabular-nums ${badge[severity]}`}>{count}</span>
    </div>
  );
}

interface Props {
  missingDiaryJobs: number;
  draftDiariesCount: number;
  diariesPending: number;
  todayFieldDiaries: number;
  submittedDiariesCount: number;
  onDiariesClick: () => void;
}

export function FieldReportsPanel({
  missingDiaryJobs,
  draftDiariesCount,
  diariesPending,
  todayFieldDiaries,
  submittedDiariesCount,
  onDiariesClick,
}: Props) {
  const allClear = missingDiaryJobs === 0 && draftDiariesCount === 0 && diariesPending === 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden h-full">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">דוחות שדה ותיעוד</h2>
        <p className="text-[10px] text-gray-400 mt-0.5">יומנים · חתימות · אישורים</p>
      </div>
      <div className="px-3 py-3">
        {allClear ? (
          <p className="text-xs text-emerald-600 font-medium text-center py-2">✓ כל הדוחות הושלמו</p>
        ) : null}
        <ReportRowItem
          label="יומנים ללא חתימת לקוח"
          count={missingDiaryJobs}
          severity={missingDiaryJobs > 0 ? "critical" : "neutral"}
          onClick={missingDiaryJobs > 0 ? onDiariesClick : undefined}
        />
        <ReportRowItem
          label="יומנים בטיוטה (לא הוגשו)"
          count={draftDiariesCount}
          severity={draftDiariesCount > 3 ? "warn" : draftDiariesCount > 0 ? "warn" : "neutral"}
          onClick={draftDiariesCount > 0 ? onDiariesClick : undefined}
        />
        <ReportRowItem
          label="יומנים ממתינים לאישור"
          count={diariesPending}
          severity={diariesPending > 0 ? "warn" : "neutral"}
          onClick={diariesPending > 0 ? onDiariesClick : undefined}
        />
        <ReportRowItem
          label="יומני שדה היום"
          count={todayFieldDiaries}
          severity="info"
        />
        <ReportRowItem
          label="סה״כ יומנים שהוגשו"
          count={submittedDiariesCount}
          severity="neutral"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd /Users/eliozedri/Desktop/eliozelk && npx tsc --noEmit 2>&1 | grep "FieldReportsPanel" | head -10
```

Expected: no output.

---

## Task 8: CrewCapacityPanel

**Files:**
- Create: `src/components/Dashboard/CrewCapacityPanel.tsx`

- [ ] **Step 1: Create CrewCapacityPanel.tsx**

```tsx
// src/components/Dashboard/CrewCapacityPanel.tsx
"use client";

interface Props {
  activeCrews: number;
  totalCapacityHoursPerWeek: number;
  scheduledHoursThisWeek: number;
  capacityUtilizationPct: number;
}

export function CrewCapacityPanel({
  activeCrews,
  totalCapacityHoursPerWeek,
  scheduledHoursThisWeek,
  capacityUtilizationPct,
}: Props) {
  const barColor =
    capacityUtilizationPct > 90 ? "bg-red-500" :
    capacityUtilizationPct > 70 ? "bg-amber-400" :
    "bg-emerald-400";
  const pctColor =
    capacityUtilizationPct > 90 ? "text-red-600" :
    capacityUtilizationPct > 70 ? "text-amber-600" :
    "text-emerald-600";
  const barWidth = Math.min(100, capacityUtilizationPct);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">כושר ייצור שבועי</h2>
        <p className="text-[10px] text-gray-400 mt-0.5">ניצולת צוותי שדה</p>
      </div>
      <div className="flex-1 px-4 py-4 flex flex-col justify-between gap-3">
        <div className="flex flex-col items-center gap-1">
          <p className={`text-4xl font-black tabular-nums ${pctColor}`}>{capacityUtilizationPct}%</p>
          <p className="text-[11px] text-gray-500 font-medium">ניצולת השבוע</p>
        </div>
        <div>
          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
            <span>0%</span>
            <span>100%</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
            <p className="text-lg font-bold text-gray-800 tabular-nums">{scheduledHoursThisWeek}</p>
            <p className="text-[10px] text-gray-400">שעות משובצות</p>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
            <p className="text-lg font-bold text-gray-800 tabular-nums">{totalCapacityHoursPerWeek}</p>
            <p className="text-[10px] text-gray-400">קיבולת שבועית</p>
          </div>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500">{activeCrews} צוותים פעילים</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd /Users/eliozedri/Desktop/eliozelk && npx tsc --noEmit 2>&1 | grep "CrewCapacityPanel" | head -10
```

Expected: no output.

---

## Task 9: Rewrite index.tsx

**Files:**
- Rewrite: `src/components/Dashboard/index.tsx`

- [ ] **Step 1: Rewrite src/components/Dashboard/index.tsx**

Replace the entire file with:

```tsx
// src/components/Dashboard/index.tsx
"use client";

import { useMemo, useState } from "react";
import { useOrdersContext } from "@/context/OrdersContext";
import type { WorkOrder } from "@/types/workOrder";
import type { WorkflowAlert } from "@/hooks/useWorkflowAlerts";
import { DEPT_LABELS } from "@/hooks/useWorkflowAlerts";
import { useDashboardKPIs } from "./useDashboardKPIs";
import { DashboardHero } from "./DashboardHero";
import { ExecutiveAttentionStrip } from "./ExecutiveAttentionStrip";
import { ExecutiveKpiRow } from "./ExecutiveKpiRow";
import { PipelineHealthTable } from "./PipelineHealthTable";
import { AccountingBillingPanel } from "./AccountingBillingPanel";
import { DepartmentLoadPanel } from "./DepartmentLoadPanel";
import { FieldReportsPanel } from "./FieldReportsPanel";
import { CrewCapacityPanel } from "./CrewCapacityPanel";
import { ActivitySection } from "./ActivitySection";
import { ProjectMap } from "./ProjectMap";
import { DrillDownPanel } from "./DrillDownPanel";
import type { DrillState } from "./DrillDownPanel";

function isSameMonth(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
}

export function DashboardPage() {
  const { orders, updateOrderFields } = useOrdersContext();
  const kpis = useDashboardKPIs();
  const [drill, setDrill] = useState<DrillState | null>(null);

  const recentActivity = useMemo(
    () =>
      [...orders]
        .sort((a, b) =>
          new Date(b.updatedAt ?? b.createdAt).getTime() -
          new Date(a.updatedAt ?? a.createdAt).getTime()
        )
        .slice(0, 7),
    [orders]
  );

  function openActiveOrdersDrill() {
    setDrill({
      title: "הזמנות פעילות",
      description: "כל ההזמנות הפעילות",
      getOrders: (all: WorkOrder[]) =>
        all.filter(o => o.status !== "completed" && o.status !== "cancelled"),
    });
  }

  function openStageDrill(label: string, status: string) {
    setDrill({
      title: label,
      description: `הזמנות בשלב: ${label}`,
      getOrders:
        status === "completed"
          ? (all: WorkOrder[]) =>
              all.filter(o => o.status === "completed" && isSameMonth(o.updatedAt ?? o.createdAt))
          : (all: WorkOrder[]) => all.filter(o => o.status === status),
    });
  }

  function openSlaDrill() {
    setDrill({
      title: "חריגות SLA",
      description: "הזמנות בחריגת זמן קריטית",
      getOrders: (all: WorkOrder[]) =>
        all.filter(
          o =>
            o.status !== "completed" &&
            o.status !== "cancelled" &&
            kpis.pipelineStages.some(s => s.status === o.status && s.redCount > 0)
        ),
    });
  }

  function openAccountingDrill() {
    setDrill({
      title: "ממתינות לחיוב",
      description: "הזמנות שהושלמו ממתינות לטיפול חשבונאי",
      getOrders: (all: WorkOrder[]) =>
        all.filter(
          o =>
            o.status === "completed" &&
            !o.invoicedAt &&
            (!o.accountingStatus ||
              o.accountingStatus === "pending" ||
              o.accountingStatus === "verified")
        ),
    });
  }

  function openDiariesDrill() {
    setDrill({
      title: "יומנים לאישור",
      description: "יומני שדה שהוגשו וממתינים לאישור",
      getOrders: () => [],
    });
  }

  function handleAlertClick(alert: WorkflowAlert) {
    const nums = new Set(alert.orderNumbers ?? []);
    setDrill({
      title: alert.message,
      description: DEPT_LABELS[alert.department] ?? alert.department,
      getOrders: (all: WorkOrder[]) =>
        nums.size > 0 ? all.filter(o => nums.has(o.orderNumber)) : [],
    });
  }

  return (
    <div className="min-h-screen bg-surface">

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <DashboardHero />

      {/* ── Attention Strip ───────────────────────────────────────────── */}
      <ExecutiveAttentionStrip
        alerts={kpis.alerts}
        onAlertClick={handleAlertClick}
      />

      {/* ── KPI Row ───────────────────────────────────────────────────── */}
      <ExecutiveKpiRow
        openOrders={kpis.openOrders}
        accountingPending={kpis.accountingPending}
        criticalAlerts={kpis.criticalAlerts}
        todayFieldDiaries={kpis.todayFieldDiaries}
        diariesPending={kpis.diariesPending}
        capacityUtilizationPct={kpis.capacityUtilizationPct}
        scheduledHoursThisWeek={kpis.scheduledHoursThisWeek}
        totalCapacityHoursPerWeek={kpis.totalCapacityHoursPerWeek}
        onActiveOrdersClick={openActiveOrdersDrill}
        onAccountingClick={openAccountingDrill}
        onSlaClick={openSlaDrill}
        onDiariesClick={openDiariesDrill}
      />

      {/* ── Main Panels ───────────────────────────────────────────────── */}
      <div className="px-6 py-4 space-y-4 max-w-[1600px] mx-auto">

        {/* Row A: Pipeline (2) + Accounting (1) + Dept Load (1) */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-2">
            <PipelineHealthTable
              stages={kpis.pipelineStages}
              bottleneck={kpis.bottleneckStage}
              onStageClick={openStageDrill}
            />
          </div>
          <div className="lg:col-span-1">
            <AccountingBillingPanel
              uninvoicedCompleted={kpis.uninvoicedCompleted}
              oldestUninvoicedDays={kpis.oldestUninvoicedDays}
              verifiedOrders={kpis.verifiedOrders}
              invoicedOrders={kpis.invoicedOrders}
              accountingPending={kpis.accountingPending}
              onAccountingClick={openAccountingDrill}
            />
          </div>
          <div className="lg:col-span-1">
            <DepartmentLoadPanel notifications={kpis.notifications} />
          </div>
        </div>

        {/* Row B: Field Reports + Map + Crew Capacity */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FieldReportsPanel
            missingDiaryJobs={kpis.missingDiaryJobs}
            draftDiariesCount={kpis.draftDiariesCount}
            diariesPending={kpis.diariesPending}
            todayFieldDiaries={kpis.todayFieldDiaries}
            submittedDiariesCount={kpis.submittedDiariesCount}
            onDiariesClick={openDiariesDrill}
          />
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-gray-900">מפת פרויקטים</h2>
                <p className="text-[10px] text-gray-400 mt-0.5">מיקום גיאוגרפי</p>
              </div>
              <a href="/workmap" className="text-xs text-blue-500 hover:underline">מפה מלאה</a>
            </div>
            <ProjectMap />
          </div>
          <CrewCapacityPanel
            activeCrews={kpis.activeCrews}
            totalCapacityHoursPerWeek={kpis.totalCapacityHoursPerWeek}
            scheduledHoursThisWeek={kpis.scheduledHoursThisWeek}
            capacityUtilizationPct={kpis.capacityUtilizationPct}
          />
        </div>

        {/* Recent Activity */}
        <ActivitySection orders={recentActivity} />

      </div>

      {drill && (
        <DrillDownPanel
          drill={drill}
          onClose={() => setDrill(null)}
          onUpdateFields={updateOrderFields}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run full TypeScript check**

```bash
cd /Users/eliozedri/Desktop/eliozelk && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors. If errors appear, fix them before proceeding.

---

## Task 10: Remove old files and final commit

**Files:**
- Delete: `src/components/Dashboard/CommandStrip.tsx`
- Delete: `src/components/Dashboard/PipelineHealth.tsx`
- Delete: `src/components/Dashboard/FinancialVisibility.tsx`
- Delete: `src/components/Dashboard/FieldExecution.tsx`
- Delete: `src/components/Dashboard/CrewCapacityWidget.tsx`
- Delete: `src/components/Dashboard/AlertsSection.tsx`

- [ ] **Step 1: Delete replaced files**

```bash
rm src/components/Dashboard/CommandStrip.tsx
rm src/components/Dashboard/PipelineHealth.tsx
rm src/components/Dashboard/FinancialVisibility.tsx
rm src/components/Dashboard/FieldExecution.tsx
rm src/components/Dashboard/CrewCapacityWidget.tsx
rm src/components/Dashboard/AlertsSection.tsx
```

- [ ] **Step 2: Run TypeScript check after deletions**

```bash
cd /Users/eliozedri/Desktop/eliozelk && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors. The deleted files had no external consumers — they were only imported from `index.tsx` which now imports the new files.

- [ ] **Step 3: Confirm global layout files are untouched**

```bash
git diff HEAD -- src/components/AppShell.tsx src/components/Sidebar.tsx src/app/layout.tsx
```

Expected: no output (no changes to these files).

- [ ] **Step 4: Commit**

```bash
cd /Users/eliozedri/Desktop/eliozelk
git add src/components/Dashboard/
git commit -m "$(cat <<'EOF'
feat(dashboard): CEO command center redesign — content area only

Replaces 6 generic dashboard sub-components with 8 focused CEO panels:
- ExecutiveAttentionStrip: alert strip (prominent) or green all-clear bar
- ExecutiveKpiRow: 6 KPI cards with color-coded bottom borders
- PipelineHealthTable: pipeline as table with ok/medium/critical columns
- AccountingBillingPanel: hero count + billing pipeline rows (no ₪)
- DepartmentLoadPanel: 5 dept bar rows with ok/mid/crit badges
- FieldReportsPanel: 5 field-doc signals (signatures, drafts, approvals)
- CrewCapacityPanel: weekly utilization % with progress bar
- DashboardHero: dark navy header with greeting, date, action buttons

AppShell, Sidebar, and layout.tsx untouched.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

Expected: commit created on `main` branch.

---

## Self-Review Checklist

- [x] **Spec §4 (Section order):** Hero → AttentionStrip → KpiRow → Row A → Row B → Activity ✓ reflected in index.tsx Task 9
- [x] **Spec §5 (DashboardHero):** gradient, eyebrow, heading, date, 3 action buttons ✓ Task 1
- [x] **Spec §6 (ExecutiveAttentionStrip):** alert cards with prominent label + count badge; green line when empty ✓ Task 2
- [x] **Spec §7 (ExecutiveKpiRow):** 6 cards, label readable, number medium, color border ✓ Task 3
- [x] **Spec §8 (PipelineHealthTable):** table with greenCount/yellowCount/redCount/count, bottleneck row ✓ Task 4
- [x] **Spec §9 (AccountingBillingPanel):** hero uninvoicedCompleted, oldest days, 3 rows, no ₪ ✓ Task 5
- [x] **Spec §10 (DepartmentLoadPanel):** 5 rows, bars, badge ✓ Task 6; uses `notifications.graphics/warehouse/fabrication/accounting/schedule`
- [x] **Spec §11 (FieldReportsPanel):** 5 rows, prominent, colored left border for non-zero ✓ Task 7
- [x] **Spec §12 (CrewCapacityPanel):** utilization %, hours, crews, progress bar ✓ Task 8
- [x] **Spec §17 (file deletions):** all 6 old files deleted in Task 10
- [x] **Spec §18 (empty states):** all 4 empty states implemented in respective components
- [x] **Spec §20 (constraints):** no AppShell/Sidebar/layout.tsx changes; no ₪; no new hooks
- [x] **Type consistency:** `PipelineStageKPI.count` used (not `.total`); `WorkflowAlert.count` used for badge; `NotificationCounts.graphics/warehouse/etc` used
