// Agent Framework — Type Definitions
// All agent infrastructure types for the Digital Operations Command Center.

export type AgentType =
  | "orchestrator"
  | "inventory"
  | "field_operations"
  | "graphics_production"
  | "catalog_pricing"
  | "cfo"
  | "billing_collections"
  | "engineering_analysis";

export type AgentStatus = "active" | "idle" | "paused" | "error";

export type AgentDepartment =
  | "operations"
  | "warehouse"
  | "field"
  | "graphics"
  | "catalog"
  | "finance"
  | "accounting"
  | "engineering";

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  department: AgentDepartment;
  description: string;
  autonomy_level: number;
  allowed_read_scopes: string[];
  allowed_write_scopes: string[];
  requires_approval_for: string[];
  status: AgentStatus;
  icon?: string;
  color?: string;
  last_run_at?: string | null;
  created_at: string;
  updated_at: string;
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export type TaskPriority = "low" | "normal" | "high" | "critical";
export type TaskStatus = "open" | "in_progress" | "completed" | "dismissed";

export interface AgentTask {
  id: string;
  agent_id: string;
  related_entity_type?: string;
  related_entity_id?: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  recommended_action?: string;
  requires_approval: boolean;
  assigned_to?: string;
  due_date?: string;
  created_at: string;
  updated_at: string;
}

// ── Exceptions ───────────────────────────────────────────────────────────────

export type ExceptionSeverity = "info" | "warn" | "error" | "critical";
export type ExceptionStatus = "open" | "acknowledged" | "resolved" | "dismissed";

export interface AgentException {
  id: string;
  agent_id: string;
  severity: ExceptionSeverity;
  category: string;
  related_entity_type?: string;
  related_entity_id?: string;
  title: string;
  description: string;
  detected_from_data?: Record<string, unknown>;
  recommended_resolution?: string;
  status: ExceptionStatus;
  created_at: string;
  updated_at: string;
}

// ── Approvals ────────────────────────────────────────────────────────────────

export type ApprovalStatus = "pending" | "approved" | "rejected";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface AgentApproval {
  id: string;
  agent_id: string;
  task_id?: string;
  action_type: string;
  action_payload: Record<string, unknown>;
  risk_level: RiskLevel;
  requested_by_agent: string;
  approval_status: ApprovalStatus;
  approved_by?: string;
  approved_at?: string;
  rejected_reason?: string;
  created_at: string;
  updated_at: string;
}

// ── Activity Feed ────────────────────────────────────────────────────────────

export type ActivityMessageType =
  | "detection"
  | "task_created"
  | "exception"
  | "recommendation"
  | "approval_request"
  | "action_taken"
  | "collaboration"
  | "status_change";

export interface AgentActivityFeedItem {
  id: string;
  agent_id: string;
  related_agent_id?: string;
  related_entity_type?: string;
  related_entity_id?: string;
  message_type: ActivityMessageType;
  content: string;
  structured_payload?: Record<string, unknown>;
  created_at: string;
}

// ── Per-agent aggregated counts ───────────────────────────────────────────────

export interface AgentStats {
  openTasks: number;
  inProgressTasks: number;
  openExceptions: number;
  criticalExceptions: number;
  pendingApprovals: number;
}

// ── Labels & colors ───────────────────────────────────────────────────────────

export const AGENT_STATUS_LABELS: Record<AgentStatus, string> = {
  active:  "פעיל",
  idle:    "ממתין",
  paused:  "מושהה",
  error:   "שגיאה",
};

export const AGENT_STATUS_DOT: Record<AgentStatus, string> = {
  active:  "bg-green-400 shadow-green-400/50",
  idle:    "bg-gray-400",
  paused:  "bg-amber-400",
  error:   "bg-red-500 shadow-red-500/50",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low:      "נמוכה",
  normal:   "רגילה",
  high:     "גבוהה",
  critical: "קריטית",
};

export const TASK_PRIORITY_COLORS: Record<TaskPriority, string> = {
  low:      "bg-gray-100 text-gray-500",
  normal:   "bg-blue-100 text-blue-700",
  high:     "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
};

export const EXCEPTION_SEVERITY_LABELS: Record<ExceptionSeverity, string> = {
  info:     "מידע",
  warn:     "אזהרה",
  error:    "שגיאה",
  critical: "קריטי",
};

export const EXCEPTION_SEVERITY_COLORS: Record<ExceptionSeverity, string> = {
  info:     "bg-blue-100 text-blue-700",
  warn:     "bg-amber-100 text-amber-700",
  error:    "bg-red-100 text-red-700",
  critical: "bg-red-200 text-red-900 font-semibold",
};

export const EXCEPTION_SEVERITY_DOT: Record<ExceptionSeverity, string> = {
  info:     "bg-blue-400",
  warn:     "bg-amber-400",
  error:    "bg-red-500",
  critical: "bg-red-700",
};

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low:      "נמוך",
  medium:   "בינוני",
  high:     "גבוה",
  critical: "קריטי",
};

export const RISK_LEVEL_COLORS: Record<RiskLevel, string> = {
  low:      "bg-green-100 text-green-700",
  medium:   "bg-amber-100 text-amber-700",
  high:     "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

export const AUTONOMY_LEVEL_LABELS: Record<number, string> = {
  0: "ניתוח בלבד",
  1: "יוצר משימות",
  2: "עדכוני סטטוס",
  3: "פעולות עסקיות",
  4: "אוטומציה",
  5: "אוטונומי מלא",
};

export const AUTONOMY_LEVEL_COLORS: Record<number, string> = {
  0: "bg-gray-100 text-gray-500",
  1: "bg-blue-100 text-blue-700",
  2: "bg-teal-100 text-teal-700",
  3: "bg-amber-100 text-amber-700",
  4: "bg-orange-100 text-orange-700",
  5: "bg-red-100 text-red-700",
};

export const DEPARTMENT_LABELS: Record<AgentDepartment, string> = {
  operations:  "תפעול",
  warehouse:   "מחסן",
  field:       "שטח",
  graphics:    "גרפיקה",
  catalog:     "קטלוג",
  finance:     "כספים",
  accounting:  'הנה״ח',
  engineering: "הנדסה",
};

export const ACTIVITY_TYPE_LABELS: Record<ActivityMessageType, string> = {
  detection:        "זיהוי",
  task_created:     "משימה נוצרה",
  exception:        "חריגה",
  recommendation:   "המלצה",
  approval_request: "בקשת אישור",
  action_taken:     "פעולה בוצעה",
  collaboration:    "שיתוף פעולה",
  status_change:    "שינוי סטטוס",
};

export const ACTIVITY_TYPE_COLORS: Record<ActivityMessageType, string> = {
  detection:        "text-blue-600",
  task_created:     "text-teal-600",
  exception:        "text-red-600",
  recommendation:   "text-purple-600",
  approval_request: "text-amber-600",
  action_taken:     "text-green-600",
  collaboration:    "text-indigo-600",
  status_change:    "text-gray-500",
};

// ── Org chart structure ───────────────────────────────────────────────────────

export interface OrgNode {
  agentId: string;
  children?: string[];
}

export const AGENT_ORG: OrgNode[] = [
  {
    agentId: "ops-orchestrator",
    children: [
      "inventory-agent",
      "field-ops-agent",
      "graphics-production-agent",
      "catalog-pricing-agent",
      "cfo-agent",
      "billing-collections-agent",
      "engineering-plan-agent",
    ],
  },
];
