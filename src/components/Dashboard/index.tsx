"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useOrdersContext } from "@/context/OrdersContext";
import { DEPT_LABELS } from "@/hooks/useWorkflowAlerts";
import type { WorkOrder } from "@/types/workOrder";
import { useDashboardKPIs } from "./useDashboardKPIs";
import { CommandStrip } from "./CommandStrip";
import { PipelineHealth } from "./PipelineHealth";
import { FinancialVisibility } from "./FinancialVisibility";
import { FieldExecution } from "./FieldExecution";
import { CrewCapacityWidget } from "./CrewCapacityWidget";
import { DepartmentLoad } from "./DepartmentLoad";
import { AlertsSection } from "./AlertsSection";
import { ActivitySection } from "./ActivitySection";
import { DrillDownPanel } from "./DrillDownPanel";
import type { DrillState } from "./DrillDownPanel";
import { ProjectMap } from "./ProjectMap";

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

  function openUrgentDrill() {
    setDrill({
      title: "דורשות תשומת לב",
      description: "הזמנות דחופות",
      getOrders: (all: WorkOrder[]) =>
        all.filter(
          o => o.priority === "urgent" && o.status !== "completed" && o.status !== "cancelled"
        ),
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

  function handleAlertClick(alert: { orderNumbers?: string[]; message: string; department: string }) {
    const nums = new Set(alert.orderNumbers ?? []);
    setDrill({
      title: alert.message,
      description: DEPT_LABELS[alert.department as keyof typeof DEPT_LABELS] ?? alert.department,
      getOrders: (all: WorkOrder[]) =>
        nums.size > 0 ? all.filter(o => nums.has(o.orderNumber)) : [],
    });
  }

  return (
    <div className="min-h-screen bg-surface">

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div style={{ background: "linear-gradient(135deg, #05111f 0%, #0d1b2e 55%, #1a2d4a 100%)" }}>
        <div className="px-8 py-8">
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

          <div className="mt-6 h-px" style={{ background: "linear-gradient(to left, transparent, rgba(245,158,11,0.4), transparent)" }} />

          {/* 6-KPI command strip */}
          <CommandStrip
            openOrders={kpis.openOrders}
            urgentOpen={kpis.urgentOpen}
            criticalAlerts={kpis.criticalAlerts}
            stuckOrders={kpis.stuckOrders}
            accountingPending={kpis.accountingPending}
            diariesPending={kpis.diariesPending}
            todayFieldDiaries={kpis.todayFieldDiaries}
            onUrgentClick={openUrgentDrill}
            onSlaClick={openSlaDrill}
            onAccountingClick={openAccountingDrill}
            onDiariesClick={openDiariesDrill}
          />
        </div>
      </div>

      {/* ── Main Content ──────────────────────────────────────────────────────── */}
      <div className="px-6 py-6 max-w-7xl mx-auto space-y-5">

        {/* Alert Command Center — always visible, above pipeline */}
        <AlertsSection alerts={kpis.alerts} onAlertClick={handleAlertClick} />

        {/* Pipeline Health + Financial Visibility */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <PipelineHealth
              stages={kpis.pipelineStages}
              bottleneck={kpis.bottleneckStage}
              onStageClick={openStageDrill}
            />
          </div>
          <div className="lg:col-span-1">
            <FinancialVisibility
              uninvoicedCompleted={kpis.uninvoicedCompleted}
              oldestUninvoicedDays={kpis.oldestUninvoicedDays}
              verifiedOrders={kpis.verifiedOrders}
              invoicedOrders={kpis.invoicedOrders}
              accountingPending={kpis.accountingPending}
              diariesPending={kpis.diariesPending}
            />
          </div>
        </div>

        {/* Field Execution + Crew Capacity + Department Load */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <FieldExecution
            todayFieldDiaries={kpis.todayFieldDiaries}
            submittedDiariesCount={kpis.submittedDiariesCount}
            draftDiariesCount={kpis.draftDiariesCount}
            diariesPending={kpis.diariesPending}
            missingDiaryJobs={kpis.missingDiaryJobs}
          />
          <CrewCapacityWidget
            activeCrews={kpis.activeCrews}
            totalCapacityHoursPerWeek={kpis.totalCapacityHoursPerWeek}
            scheduledHoursThisWeek={kpis.scheduledHoursThisWeek}
            capacityUtilizationPct={kpis.capacityUtilizationPct}
          />
          <DepartmentLoad notifications={kpis.notifications} />
        </div>

        {/* Recent Activity */}
        <ActivitySection orders={recentActivity} />

        {/* Map */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-navy-900">מפת פרויקטים</h2>
              <p className="text-[10px] text-gray-400 mt-0.5">תצוגה גיאוגרפית · פרויקטים לפי מיקום</p>
            </div>
            <Link href="/workmap" className="text-xs text-blue-500 hover:underline">
              מפה מלאה
            </Link>
          </div>
          <ProjectMap />
        </div>

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
