// Shared types for the agent scan infrastructure.
// Used by all scan API routes and utilities.

import type { SupabaseClient } from "@supabase/supabase-js";

export type { SupabaseClient };

// ── Scan result returned by every scan endpoint ───────────────────────────────

export interface ScanResult {
  agentId: string;
  agentName: string;
  scannedAt: string;
  durationMs: number;
  entitiesScanned: number;
  exceptionsCreated: number;
  exceptionsUpdated: number;
  exceptionsResolved: number;
  tasksCreated: number;
  tasksUpdated: number;
  approvalsCreated: number;
  errors: string[];
}

export function emptyScanResult(agentId: string, agentName: string): ScanResult {
  return {
    agentId,
    agentName,
    scannedAt: new Date().toISOString(),
    durationMs: 0,
    entitiesScanned: 0,
    exceptionsCreated: 0,
    exceptionsUpdated: 0,
    exceptionsResolved: 0,
    tasksCreated: 0,
    tasksUpdated: 0,
    approvalsCreated: 0,
    errors: [],
  };
}

// ── Detected issue (pre-insert) ───────────────────────────────────────────────

export interface DetectedIssue {
  category: string;
  entityType: string;
  entityId: string;
  severity: "info" | "warn" | "error" | "critical";
  title: string;
  description: string;
  detectedFromData?: Record<string, unknown>;
  recommendedResolution?: string;
}

// ── Detected task (pre-insert) ────────────────────────────────────────────────

export interface DetectedTask {
  category: string;
  entityType: string;
  entityId: string;
  title: string;
  description: string;
  priority: "low" | "normal" | "high" | "critical";
  recommendedAction?: string;
  requiresApproval?: boolean;
  assignedTo?: string;
}

// ── Dedupe map: key → existing exception id ───────────────────────────────────

export type DedupeMap = Map<string, { id: string; status: string }>;

// ── DB row shapes (minimal — only fields we use) ──────────────────────────────

export interface DbOrderRow {
  id: string;
  order_number: string;
  status: string;
  priority: string;
  customer: string;
  city: string;
  order_date: string;
  created_at: string;
  updated_at: string;
  graphics_sent_at: string | null;
  graphics_acknowledged_at: string | null;
  graphics_completed_at: string | null;
  fabrication_required: boolean;
  fabrication_status: string | null;
  accounting_status: string;
  invoiced_at: string | null;
  billed_amount: number | null;
  scheduled_date: string | null;
  ready_for_execution_at: string | null;
  order_type: string | null;
  customer_approval_status: string | null;
  warehouse_required: boolean;
  warehouse_status: string | null;
  data: Record<string, unknown>;
  // Group 2 additions
  design_approval_status: string | null;
  design_sent_at: string | null;
  design_approved_at: string | null;
  billing_ready_at: string | null;
  billing_approved_at: string | null;
  required_date: string | null;
}

export interface DbDiaryRow {
  id: string;
  diary_number: string;
  status: string;
  customer_name: string;
  site_name: string;
  execution_date: string;
  submitted_at: string | null;
  order_id: string | null;
  approval_status: string;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  data: Record<string, unknown>;
}

export interface DbCostRates {
  data: Record<string, unknown>;
}

// ── Extract typed fields from diary JSONB data ────────────────────────────────

export interface DiaryExtracted {
  crewLeaderName: string;
  crewMembers: string[];
  vehicleNumber: string;
  startTime: string;
  endTime: string;
  customerSignature: unknown;
  billedAmount: number;
  isBillable: boolean | undefined;
  travelTimeHours: number | undefined;
  waitingTimeHours: number | undefined;
  setupTimeHours: number | undefined;
  executionTimeHours: number | undefined;
  vehicleCostOverride: number | undefined;
  equipmentCost: number | undefined;
  materialCost: number | undefined;
  photos: unknown[];
}

export function extractDiaryData(row: DbDiaryRow): DiaryExtracted {
  const d = (row.data ?? {}) as Record<string, unknown>;
  return {
    crewLeaderName:    (d.crewLeaderName as string) ?? "",
    crewMembers:       Array.isArray(d.crewMembers) ? (d.crewMembers as string[]) : [],
    vehicleNumber:     (d.vehicleNumber as string) ?? "",
    startTime:         (d.startTime as string) ?? "",
    endTime:           (d.endTime as string) ?? "",
    customerSignature: d.customerSignature ?? null,
    billedAmount:      typeof d.billedAmount === "number" ? d.billedAmount : 0,
    isBillable:        typeof d.isBillable === "boolean" ? d.isBillable : undefined,
    travelTimeHours:   typeof d.travelTimeHours === "number" ? d.travelTimeHours : undefined,
    waitingTimeHours:  typeof d.waitingTimeHours === "number" ? d.waitingTimeHours : undefined,
    setupTimeHours:    typeof d.setupTimeHours === "number" ? d.setupTimeHours : undefined,
    executionTimeHours: typeof d.executionTimeHours === "number" ? d.executionTimeHours : undefined,
    vehicleCostOverride: typeof d.vehicleCostOverride === "number" ? d.vehicleCostOverride : undefined,
    equipmentCost:     typeof d.equipmentCost === "number" ? d.equipmentCost : undefined,
    materialCost:      typeof d.materialCost === "number" ? d.materialCost : undefined,
    photos:            Array.isArray(d.photos) ? (d.photos as unknown[]) : [],
  };
}
