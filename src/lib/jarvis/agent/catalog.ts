/**
 * Catalog of SAFE planner actions. PURE metadata — no imports of server-only command code, so the
 * planner and the LLM prompt can reference it without pulling in DB access. Each action maps 1:1
 * to an existing READ-ONLY ceoManager command (executed by the server-only runner). Adding a new
 * safe action = add a read-only command + one row here. There is deliberately NO write action.
 */

export interface PlannerAction {
  skill: string;
  action: string;
  description: string;
  /** id of the read-only command in skills/ceoManager/commands.ts */
  commandId: string;
}

export const PLANNER_ACTIONS: PlannerAction[] = [
  { skill: "operations_inventory", action: "items_missing_price", commandId: "items_missing_price", description: "Count active commercial catalog items with no sell price." },
  { skill: "operations_inventory", action: "inventory_low_stock", commandId: "inventory_low_stock", description: "Active items at/below their minimum quantity." },
  { skill: "operations", action: "open_orders_overview", commandId: "open_orders_overview", description: "Open work orders grouped by status." },
  { skill: "operations", action: "stuck_orders", commandId: "stuck_orders", description: "Orders flagged stuck / SLA-breaching / urgent." },
  { skill: "operations", action: "pending_drafts", commandId: "pending_drafts", description: "Inbound order drafts awaiting review." },
  { skill: "operations", action: "exceptions_overview", commandId: "exceptions_overview", description: "Open exceptions across all agents by severity." },
  { skill: "fleet", action: "fleet_unusable_equipment", commandId: "fleet_unusable_equipment", description: "Active equipment that is unusable or blocked from dispatch." },
];

export function actionsCatalogText(): string {
  return PLANNER_ACTIONS.map((a) => `${a.skill}.${a.action} — ${a.description}`).join("\n");
}

export function findAction(skill: string, action: string): PlannerAction | null {
  return (
    PLANNER_ACTIONS.find((a) => a.action === action) ??
    PLANNER_ACTIONS.find((a) => a.skill === skill && a.action === action) ??
    null
  );
}
