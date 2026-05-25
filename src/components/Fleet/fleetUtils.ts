// Shared derivations for the Fleet module — alert thresholds (mirrored from the
// equipment-fleet-agent so the manager's view and the agent stay consistent),
// date helpers, and KPI computation.

import type { Equipment } from "@/types/equipment";

// Thresholds (days). Mirror src/app/api/agents/equipment-fleet-agent/scan/route.ts.
export const INSPECTION_WARN_DAYS = 30;
export const INSURANCE_WARN_DAYS = 30;
export const MAINTENANCE_WARN_DAYS = 14;

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

// "due soon" = due within the window OR already overdue (negative days).
function dueSoon(dateStr: string | null | undefined, windowDays: number): boolean {
  const d = daysUntil(dateStr);
  return d !== null && d <= windowDays;
}

export function isInspectionDueSoon(e: Equipment): boolean {
  return dueSoon(e.next_inspection_date, INSPECTION_WARN_DAYS);
}
export function isInsuranceDueSoon(e: Equipment): boolean {
  return dueSoon(e.next_insurance_date, INSURANCE_WARN_DAYS);
}
export function isMaintenanceDueSoon(e: Equipment): boolean {
  return dueSoon(e.next_maintenance_date, MAINTENANCE_WARN_DAYS);
}

export interface FleetKpis {
  total: number;
  active: number;
  inRepair: number;
  openFaults: number;
  upcomingMaintenance: number;
  upcomingInspection: number;
}

export function computeKpis(
  list: Equipment[],
  openIncidentsByAsset: Record<string, number>,
): FleetKpis {
  let active = 0;
  let inRepair = 0;
  let upcomingMaintenance = 0;
  let upcomingInspection = 0;
  for (const e of list) {
    if (e.status === "active") active++;
    if (e.status === "in_repair") inRepair++;
    if (isMaintenanceDueSoon(e)) upcomingMaintenance++;
    if (isInspectionDueSoon(e)) upcomingInspection++;
  }
  const openFaults = Object.values(openIncidentsByAsset).reduce((a, b) => a + b, 0);
  return {
    total: list.length,
    active,
    inRepair,
    openFaults,
    upcomingMaintenance,
    upcomingInspection,
  };
}
