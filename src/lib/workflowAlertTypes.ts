import type { FabricationStatus, WorkOrderStatus } from "@/types/workOrder";

export type AlertSeverity = "warn" | "critical";
export type AlertDepartment = "graphics" | "fabrication" | "office" | "schedule" | "accounting";

export const DEPT_LABELS: Record<AlertDepartment, string> = {
  graphics:    "גרפיקה",
  fabrication: "מסגרייה",
  office:      "משרד",
  schedule:    "תיאום",
  accounting:  "הנה״ח",
};

export interface AffectedOrderContext {
  id: string;
  orderNumber: string;
  customer?: string;
  fabricationStatus?: FabricationStatus;
  orderStatus: WorkOrderStatus;
  hoursStuck: number;
  recommendedDepartmentAction: string;
}

export interface WorkflowAlert {
  id: string;
  severity: AlertSeverity;
  department: AlertDepartment;
  message: string;
  count: number;
  href: string;
  orderNumbers?: string[];
  // QA anomaly extensions (optional — only set by fabricationAnomalyRules)
  recommendedAction?: string;
  escalationTarget?: "department" | "qa" | "operations_manager";
  affectedOrders?: AffectedOrderContext[];
}
