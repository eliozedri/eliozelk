import type { SignRow, MiscRow } from "./order";

export type WorkOrderStatus =
  | "graphics_pending"
  | "graphics_active"
  | "graphics_done"
  | "production"
  | "ready_installation"
  | "completed"
  | "cancelled";

export type OrderPriority = "normal" | "urgent";

export interface WorkOrder {
  id: string;
  orderNumber: string;
  date: string;
  customer: string;
  location: string;
  reference: string;
  signRows: SignRow[];
  miscRows: MiscRow[];
  priority: OrderPriority;
  notes: string;
  status: WorkOrderStatus;
  createdAt: string;
  updatedAt: string;
  graphicsSentAt: string;
  graphicsAcknowledgedAt: string | null;
  graphicsAcknowledgedBy: string | null;
  graphicsCompletedAt: string | null;
  // Field execution fields
  city?: string;
  estimatedExecutionHours?: number;
  readyForExecutionAt?: string | null;
  assignedCrewId?: string | null;
  scheduledDate?: string | null;
}

export const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  graphics_pending: "ממתין לאישור גרפיקה",
  graphics_active: "בטיפול גרפיקה",
  graphics_done: "גרפיקה הושלמה",
  production: "בייצור",
  ready_installation: "מוכן להתקנה",
  completed: "הושלם",
  cancelled: "בוטל",
};

export const STATUS_COLORS: Record<WorkOrderStatus, string> = {
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
