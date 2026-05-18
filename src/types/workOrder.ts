import type { SignRow, MiscRow, OrderAttachment, FabricationDetails } from "./order";

// ─── Order type / fulfillment classification ─────────────────────────────────

export type OrderType =
  | "field_work"        // ביצוע עבודה — field execution, enters weekly schedule
  | "pickup"            // הזמנה לאיסוף — customer collects, never scheduled
  | "equipment_supply"; // אספקת ציוד — depends on fulfillment_method

export type FulfillmentMethod =
  | "self_pickup"  // איסוף עצמי — customer picks up
  | "delivery";    // משלוח — Elkayam delivers (enters scheduling)

export type CustomerApprovalStatus =
  | "approved"  // customer confirmed execution date
  | "pending";  // standby — waiting for customer approval

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  field_work:       "ביצוע עבודה",
  pickup:           "הזמנה לאיסוף",
  equipment_supply: "אספקת ציוד",
};

export const ORDER_TYPE_COLORS: Record<OrderType, string> = {
  field_work:       "bg-blue-100 text-blue-700",
  pickup:           "bg-emerald-100 text-emerald-700",
  equipment_supply: "bg-orange-100 text-orange-700",
};

export const FULFILLMENT_LABELS: Record<FulfillmentMethod, string> = {
  self_pickup: "איסוף עצמי",
  delivery:    "משלוח ע״י אלקיים",
};

// ─── Fabrication ────────────────────────────────────────────────────────────

export type FabricationStatus =
  | "pending"
  | "acknowledged"
  | "in_progress"
  | "ready"
  | "completed"
  | "issue";

export const FABRICATION_STATUS_LABELS: Record<FabricationStatus, string> = {
  pending: "ממתין",
  acknowledged: "התקבל",
  in_progress: "בעבודה",
  ready: "מוכן",
  completed: "הושלם",
  issue: "בעיה",
};

export const FABRICATION_STATUS_COLORS: Record<FabricationStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  acknowledged: "bg-blue-100 text-blue-700",
  in_progress: "bg-purple-100 text-purple-700",
  ready: "bg-teal-100 text-teal-700",
  completed: "bg-green-100 text-green-700",
  issue: "bg-red-100 text-red-700",
};

// ─── Order Problems ──────────────────────────────────────────────────────────

export type OrderProblemStatus =
  | "open"
  | "office_handling"
  | "waiting_customer"
  | "waiting_dept"
  | "resolved"
  | "cancelled";

export type OrderProblemCategory =
  | "missing_dimensions"
  | "missing_file"
  | "unclear_request"
  | "wrong_file"
  | "material_shortage"
  | "fabrication_unclear"
  | "graphic_unclear"
  | "other";

export const PROBLEM_STATUS_LABELS: Record<OrderProblemStatus, string> = {
  open: "פתוחה",
  office_handling: "בטיפול משרד",
  waiting_customer: "ממתין ללקוח",
  waiting_dept: "ממתין למחלקה",
  resolved: "נפתרה",
  cancelled: "בוטלה",
};

export const PROBLEM_STATUS_COLORS: Record<OrderProblemStatus, string> = {
  open: "bg-red-100 text-red-700",
  office_handling: "bg-orange-100 text-orange-700",
  waiting_customer: "bg-yellow-100 text-yellow-700",
  waiting_dept: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export const PROBLEM_CATEGORY_LABELS: Record<OrderProblemCategory, string> = {
  missing_dimensions: "מידות חסרות",
  missing_file: "קובץ חסר",
  unclear_request: "בקשה לא ברורה",
  wrong_file: "קובץ שגוי",
  material_shortage: "מחסור חומרים",
  fabrication_unclear: "פרטי מסגרייה לא ברורים",
  graphic_unclear: "פרטי גרפיקה לא ברורים",
  other: "אחר",
};

export interface OrderProblem {
  id: string;
  orderId: string;
  department: "graphics" | "fabrication" | "office";
  reportedAt: string;
  reportedBy?: string;
  category: OrderProblemCategory;
  description: string;
  status: OrderProblemStatus;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
}

// ─── Order Activity Timeline ─────────────────────────────────────────────────

export type OrderActivityType =
  | "order_created"
  | "sent_to_graphics"
  | "sent_to_fabrication"
  | "graphics_acknowledged"
  | "graphics_completed"
  | "fabrication_acknowledged"
  | "fabrication_status_changed"
  | "fabrication_completed"
  | "problem_reported"
  | "problem_resolved"
  | "problem_status_changed"
  | "correction_added"
  | "file_attached"
  | "status_changed"
  | "note_added"
  | "billing_verified"
  | "billing_approved"
  | "revenue_set";

export interface OrderActivity {
  id: string;
  orderId: string;
  type: OrderActivityType;
  timestamp: string;
  by?: string;
  department?: string;
  description: string;
  meta?: Record<string, string>;
}

// ─── Work Order ──────────────────────────────────────────────────────────────

export type WorkOrderStatus =
  | "draft"                                   // order is being entered — not yet submitted to pipeline
  | "graphics_pending"
  | "graphics_active"
  | "graphics_done"
  | "production"
  | "ready_installation"
  | "completed"
  | "cancelled";

export type OrderPriority = "normal" | "urgent";

// ─── Accounting workflow state ────────────────────────────────────────────────

export type AccountingStatus =
  | "pending"    // operationally complete, not yet verified for billing
  | "verified"   // billing readiness verified — all blockers cleared, awaiting approval
  | "invoiced"   // invoice issued
  | "partial"    // partially billed (reserved for future split-billing)
  | "approved"   // approved for billing queue — ready for invoice generation
  | "paid"       // payment confirmed (reserved for future payment tracking)
  | "disputed";  // billing dispute in progress

export const ACCOUNTING_STATUS_LABELS: Record<AccountingStatus, string> = {
  pending:  "ממתין לאימות",
  verified: "מאומת ומוכן לחיוב",
  invoiced: "חויב",
  partial:  "חויב חלקית",
  approved: "אושר לחיוב",
  paid:     "שולם",
  disputed: "בסכסוך",
};

export const ACCOUNTING_STATUS_COLORS: Record<AccountingStatus, string> = {
  pending:  "bg-amber-100 text-amber-700",
  verified: "bg-blue-100 text-blue-700",
  invoiced: "bg-green-100 text-green-700",
  partial:  "bg-indigo-100 text-indigo-700",
  approved: "bg-teal-100 text-teal-700",
  paid:     "bg-gray-100 text-gray-600",
  disputed: "bg-red-100 text-red-700",
};

export interface WorkOrder {
  id: string;
  orderNumber: string;
  version: number;
  date: string;
  customer: string;
  contactPerson?: string;
  orderedBy?: string;
  location?: string;
  // Order classification — determines workflow routing
  orderType: OrderType;
  fulfillmentMethod?: FulfillmentMethod | null;
  customerApprovalStatus: CustomerApprovalStatus;
  jobSlash?: string;      // kept optional for backward compat
  reference?: string;     // kept optional for backward compat
  signRows: SignRow[];
  miscRows: MiscRow[];
  accessoryRows?: MiscRow[];
  priority: OrderPriority;
  notes: string;
  status: WorkOrderStatus;
  createdAt: string;
  updatedAt: string;
  graphicsSentAt: string | null;
  graphicsAcknowledgedAt: string | null;
  graphicsAcknowledgedBy: string | null;
  graphicsCompletedAt: string | null;
  // Location
  city?: string;
  // Rich content
  generalNotes?: string;
  attachments?: OrderAttachment[];
  // Fabrication
  fabricationRequired?: boolean;
  fabricationDetails?: FabricationDetails;
  fabricationStatus?: FabricationStatus;
  fabricationAcknowledgedAt?: string | null;
  fabricationReadyAt?: string | null;
  fabricationCompletedAt?: string | null;
  // Problem tracking
  problems?: OrderProblem[];
  // Activity timeline
  activities?: OrderActivity[];
  // Field execution
  jobName?: string | null;
  requiredDate?: string | null;
  estimatedExecutionHours?: number;
  readyForExecutionAt?: string | null;
  assignedCrewId?: string | null;
  scheduledDate?: string | null;
  requiredWorkers?: number | null;
  // Warehouse domain — parallel to fabrication, tracks stock prep
  warehouseRequired: boolean;
  warehouseStatus?: "pending" | "processing" | "ready" | null;
  // Accounting (JSONB today; first-class columns when ERP integration begins)
  accountingStatus?: AccountingStatus;
  invoicedAt?: string | null;
  invoicedBy?: string | null;
  invoiceNumber?: string | null;
  billedAmount?: number | null;
}

// ─── Status config ───────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  draft: "טיוטה",
  graphics_pending: "ממתין לאישור גרפיקה",
  graphics_active: "בטיפול גרפיקה",
  graphics_done: "גרפיקה הושלמה",
  production: "בייצור",
  ready_installation: "מוכן להתקנה",
  completed: "הושלם",
  cancelled: "בוטל",
};

export const STATUS_COLORS: Record<WorkOrderStatus, string> = {
  draft: "bg-gray-100 text-gray-500",
  graphics_pending: "bg-amber-100 text-amber-700",
  graphics_active: "bg-blue-100 text-blue-700",
  graphics_done: "bg-green-100 text-green-700",
  production: "bg-purple-100 text-purple-700",
  ready_installation: "bg-teal-100 text-teal-700",
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-600",
};

export const LIFECYCLE_STAGES = [
  { key: "created", label: "נוצרה" },
  { key: "graphics", label: "גרפיקה" },
  { key: "production", label: "ייצור" },
  { key: "installation", label: "התקנה" },
  { key: "completed", label: "הושלם" },
] as const;

export interface ProgressState {
  completedSteps: number;
  activeStep: number | null;
  isPending: boolean;
}

export function getProgressState(status: WorkOrderStatus): ProgressState {
  switch (status) {
    case "draft":
      return { completedSteps: 0, activeStep: 0, isPending: true };
    case "graphics_pending":
      return { completedSteps: 1, activeStep: 1, isPending: true };
    case "graphics_active":
      return { completedSteps: 1, activeStep: 1, isPending: false };
    case "graphics_done":
      return { completedSteps: 2, activeStep: null, isPending: false };
    case "production":
      return { completedSteps: 2, activeStep: 2, isPending: false };
    case "ready_installation":
      return { completedSteps: 3, activeStep: 3, isPending: false };
    case "completed":
      return { completedSteps: 5, activeStep: null, isPending: false };
    case "cancelled":
      return { completedSteps: 1, activeStep: null, isPending: false };
    default:
      return { completedSteps: 1, activeStep: null, isPending: false };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function hasOpenProblems(order: WorkOrder): boolean {
  return (order.problems ?? []).some(
    (p) => p.status !== "resolved" && p.status !== "cancelled"
  );
}

export function openProblemsCount(order: WorkOrder): number {
  return (order.problems ?? []).filter(
    (p) => p.status !== "resolved" && p.status !== "cancelled"
  ).length;
}
