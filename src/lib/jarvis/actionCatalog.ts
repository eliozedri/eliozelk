/**
 * Generic action catalog for the JARVIS ↔ CEO-Agent bridge — PURE (no DB/Next),
 * so the intake route, the server actions, and the UI all share one source of
 * truth for "which action types are allowlisted and what can they do".
 *
 * This is the allowlist + capability layer. The actual execution logic per
 * action lives in actionHandlers/ (server-only). Adding a new operational
 * command type = add an entry here + a handler there; nothing else changes.
 */

export interface ActionCapabilities {
  /** Has a dry-run preview step (affected rows + rollback snapshot). */
  preview: boolean;
  /** Has a real (gated) execution step that mutates business data. */
  execute: boolean;
  /** Can be reverted from a stored snapshot. */
  revert: boolean;
}

/**
 * Approval level (least-privilege ladder):
 *  0 — safe metadata/task only (create/assign/route task, note) → may be automatic
 *  1 — low-risk business metadata (link confirmed doc, mark review done) → approval
 *  2 — operational state change (mark dept complete, route to scheduling, doc expiry) → approval + audit
 *  3 — financial/inventory/customer-critical (billing, stock adjust, price, ambiguous FK) → 2nd approval
 */
export type ApprovalLevel = 0 | 1 | 2 | 3;

export interface ActionDef {
  /** Canonical action type stored in the DB. */
  actionType: string;
  /** Accepted inbound aliases (back-compat / JARVIS naming drift). */
  aliases?: string[];
  labelHe: string;
  capabilities: ActionCapabilities;
  /** Owning domain/agent role (for least-privilege + UI grouping). */
  domain?: string;
  /** Least-privilege approval ladder for this action. */
  approvalLevel?: ApprovalLevel;
  riskLevel?: "low" | "medium" | "high";
  /**
   * Review-only: no business mutation — the action records/asks/flags and flows
   * through the same approve→handled lifecycle (like ops_note). Safe by design.
   */
  reviewOnly?: boolean;
  /**
   * Mutating action whose guarded execute() handler is NOT built yet → the system
   * must file a capability request (createCapabilityRequest) instead of executing.
   */
  requiresCapability?: boolean;
}

const REVIEW_ONLY: ActionCapabilities = { preview: false, execute: false, revert: false };

export const ACTION_CATALOG: ActionDef[] = [
  {
    actionType: "price_update_percentage",
    aliases: ["price_update_request", "price_update_pct"],
    labelHe: "עדכון מחירים באחוזים",
    capabilities: { preview: true, execute: true, revert: true },
    domain: "catalog", approvalLevel: 3, riskLevel: "high",
  },
  // ── Review-only / task & request actions (Level 0–1, NO business mutation) ──
  // Each flows through the same approve→handled lifecycle as ops_note (a guarded,
  // approval-gated, audited handler that records/asks/flags — never mutates).
  { actionType: "finance_request_missing_invoice_fields", aliases: ["finance_request_fields"], labelHe: "בקשת השלמת שדות חשבונית", capabilities: REVIEW_ONLY, domain: "finance", approvalLevel: 0, riskLevel: "low", reviewOnly: true },
  { actionType: "inventory_create_stock_review_task", labelHe: "פתיחת משימת בדיקת מלאי", capabilities: REVIEW_ONLY, domain: "warehouse", approvalLevel: 0, riskLevel: "low", reviewOnly: true },
  { actionType: "fleet_create_maintenance_followup_task", labelHe: "פתיחת מעקב תחזוקה/מסמך צי", capabilities: REVIEW_ONLY, domain: "fleet", approvalLevel: 0, riskLevel: "low", reviewOnly: true },
  { actionType: "orders_return_for_clarification", labelHe: "החזרת הזמנה להבהרה", capabilities: REVIEW_ONLY, domain: "orders", approvalLevel: 0, riskLevel: "low", reviewOnly: true },
  { actionType: "orders_create_coordination_task", labelHe: "פתיחת משימת תיאום", capabilities: REVIEW_ONLY, domain: "orders", approvalLevel: 0, riskLevel: "low", reviewOnly: true },
  { actionType: "document_create_human_review_task", labelHe: "פתיחת בדיקת מסמך/OCR אנושית", capabilities: REVIEW_ONLY, domain: "document", approvalLevel: 0, riskLevel: "low", reviewOnly: true },
  { actionType: "graphics_request_missing_design_info", labelHe: "בקשת השלמת מפרט עיצוב", capabilities: REVIEW_ONLY, domain: "graphics", approvalLevel: 0, riskLevel: "low", reviewOnly: true },
  { actionType: "fabrication_create_production_readiness_task", labelHe: "פתיחת משימת מוכנות ייצור", capabilities: REVIEW_ONLY, domain: "fabrication", approvalLevel: 0, riskLevel: "low", reviewOnly: true },
  { actionType: "coordination_create_site_readiness_task", labelHe: "פתיחת משימת מוכנות שטח", capabilities: REVIEW_ONLY, domain: "coordination", approvalLevel: 0, riskLevel: "low", reviewOnly: true },
  { actionType: "ceo_create_cross_domain_review_task", labelHe: "פתיחת משימת בדיקה חוצת-מחלקות (CEO)", capabilities: REVIEW_ONLY, domain: "ceo", approvalLevel: 0, riskLevel: "low", reviewOnly: true },
  {
    // A non-price, review-only sample: JARVIS asks the CEO-Agent to record /
    // act on an operational note or request. Flows through the SAME lifecycle
    // (pending_review → approved / needs_info / rejected) with NO mutation —
    // proving the bridge is generic, not price-only.
    actionType: "ops_note",
    aliases: ["operational_note", "ceo_note"],
    labelHe: "הערה / בקשה תפעולית לסקירה",
    capabilities: { preview: false, execute: false, revert: false },
    domain: "ceo", approvalLevel: 1, riskLevel: "low", reviewOnly: true,
  },
];

const NO_CAPS: ActionCapabilities = { preview: false, execute: false, revert: false };

/** Resolve any inbound action string (canonical or alias) to its canonical type, or null if not allowlisted. */
export function resolveActionType(raw: string): string | null {
  const r = (raw ?? "").trim();
  for (const a of ACTION_CATALOG) {
    if (a.actionType === r || (a.aliases ?? []).includes(r)) return a.actionType;
  }
  return null;
}

export function isAllowedAction(raw: string): boolean {
  return resolveActionType(raw) !== null;
}

export function actionDef(raw: string): ActionDef | null {
  const c = resolveActionType(raw);
  return c ? ACTION_CATALOG.find((a) => a.actionType === c) ?? null : null;
}

export function actionLabel(raw: string): string {
  return actionDef(raw)?.labelHe ?? raw;
}

export function actionCapabilities(raw: string): ActionCapabilities {
  return actionDef(raw)?.capabilities ?? NO_CAPS;
}

/** Least-privilege approval level for an action (default 0 when unknown/safe). */
export function actionApprovalLevel(raw: string): ApprovalLevel {
  return actionDef(raw)?.approvalLevel ?? 0;
}

export function actionDomain(raw: string): string | null {
  return actionDef(raw)?.domain ?? null;
}

/** Actions a given domain may propose (least-privilege list for agentRoles). */
export function actionsForDomain(domain: string): string[] {
  return ACTION_CATALOG.filter((a) => a.domain === domain).map((a) => a.actionType);
}

/**
 * True when an action is allowlisted but its guarded execute() handler is not
 * built yet → the system should file a capability request instead of executing.
 * (Review-only actions are NOT in this set — they legitimately don't mutate.)
 */
export function actionRequiresCapability(raw: string): boolean {
  const d = actionDef(raw);
  return Boolean(d && d.requiresCapability && !d.capabilities.execute);
}
