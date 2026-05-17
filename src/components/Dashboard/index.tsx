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
