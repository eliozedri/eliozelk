import type { LlmIntent } from "./llm/types";

/**
 * Department / agent routing — a FIRST-CLASS part of the Brain decision.
 *
 * Jarvis is a reasoning-first orchestrator over business "departments" (agents). Each rich intent
 * names the department that owns the answer + the command-center agent(s) to attribute it to, and
 * whether an executable READ-ONLY capability exists today. When `hasCapability` is false, the
 * Brain must NOT run an unrelated command — the executor files an honest pending request to that
 * department and tells the owner what data source is missing. This is how a finance question never
 * gets answered from operations, and a stock question never becomes a price report.
 */

export type BusinessDomain =
  | "management" | "operations" | "finance" | "warehouse" | "orders"
  | "catalog" | "fleet" | "documents" | "personal" | "development" | "customer" | "unknown";

export interface DepartmentRoute {
  domain: BusinessDomain;
  /** Command-center agent ids to attribute the work / pending request to. */
  agents: string[];
  /** Hebrew department label for owner-facing replies. */
  label: string;
  /** True when an executable read-only skill/command exists for this domain today. */
  hasCapability: boolean;
  /** When !hasCapability: what data source must be connected to answer this verifiably. */
  dataSourceNeeded?: string;
}

const WAREHOUSE = { domain: "warehouse" as const, agents: ["inventory-agent"], label: "מנהל מחסן", hasCapability: true };
const CATALOG = { domain: "catalog" as const, agents: ["catalog-pricing-agent"], label: "מנהל קטלוג", hasCapability: true };
const ORDERS = { domain: "orders" as const, agents: ["orders-agent"], label: "מנהל הזמנות", hasCapability: true };
const PERSONAL = { domain: "personal" as const, agents: [], label: "עוזר אישי", hasCapability: true };

const ROUTES: Partial<Record<LlmIntent, DepartmentRoute>> = {
  inventory_stock_lookup: WAREHOUSE,
  inventory_low_stock: WAREHOUSE,
  inventory_missing_or_zero: WAREHOUSE,
  purchase_recommendation_readonly: WAREHOUSE,
  catalog_missing_price: CATALOG,
  catalog_missing_supplier: CATALOG,
  order_intake: ORDERS,
  order_update: ORDERS,
  orders_status: ORDERS,
  pending_order_drafts: ORDERS,
  stuck_orders: { domain: "operations", agents: ["ceo"], label: "מנהל תפעול", hasCapability: true },
  operations_risk_report: { domain: "operations", agents: ["ceo", "inventory-agent", "orders-agent"], label: "מנהל תפעול", hasCapability: true },
  system_status: { domain: "operations", agents: ["ceo"], label: "מנהל תפעול", hasCapability: true },
  ceo_manager_request: { domain: "management", agents: ["ceo"], label: "מנהל המערכת", hasCapability: true },
  capability_request: {
    domain: "management", agents: ["ceo"], label: "מנהל המערכת", hasCapability: false,
    dataSourceNeeded: "פיתוח יכולת/Skill חדשה — אין כרגע יכולת מובנית לבקשה הזו",
  },
  fleet_equipment_status: { domain: "fleet", agents: ["equipment-fleet-agent"], label: "מנהל ציוד ורכבים", hasCapability: true },
  // Finance AR has NO verified customer-payments/balances source yet → pending finance request.
  finance_open_balance: {
    domain: "finance", agents: ["cfo-agent", "billing-collections-agent"], label: "מנהל הכספים",
    hasCapability: false,
    dataSourceNeeded: "מקור נתונים מאומת ליתרות/תקבולים פתוחים של לקוחות (אין טבלת AR/תשלומי לקוח כיום; קיימים רק billed_amount/invoiced_at על הזמנות)",
  },
  ocr_document: { domain: "documents", agents: [], label: "מסמכים", hasCapability: true },
  development_request: { domain: "development", agents: ["ceo"], label: "מנהל הפיתוח", hasCapability: true },
  general_assistant: { domain: "personal", agents: [], label: "עוזר אישי", hasCapability: true },
  personal_task: PERSONAL,
  personal_note: PERSONAL,
  reminder_request: PERSONAL,
  daily_report: PERSONAL,
};

const UNKNOWN: DepartmentRoute = {
  domain: "unknown", agents: ["ceo"], label: "מנהל המערכת", hasCapability: false,
  dataSourceNeeded: "לא זוהה תחום עסקי ברור לבקשה",
};

export function departmentFor(intent: LlmIntent | string | null | undefined): DepartmentRoute {
  if (!intent) return UNKNOWN;
  return ROUTES[intent as LlmIntent] ?? UNKNOWN;
}

/** Business domains that warrant consulting a department (vs personal/customer chit-chat). */
export function isBusinessConsultation(domain: BusinessDomain): boolean {
  return ["management", "operations", "finance", "warehouse", "orders", "catalog", "fleet"].includes(domain);
}
