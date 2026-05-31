import { resolveActionType } from "./actionCatalog";
import {
  buildPreview,
  executeApproved,
  revertExecution,
  validateCommand,
  type CommandLike,
  type ExecDb,
  type ExecutionResult,
  type PreviewResult,
  type RollbackSnapshot,
} from "./priceExecution";

/**
 * Per-action execution handlers — the generic dispatch layer for the
 * JARVIS ↔ CEO-Agent bridge. The intake/lifecycle/UI are action-agnostic; the
 * ONLY action-specific logic (validate / preview / execute / revert) lives in a
 * handler here, keyed by canonical action type. Add an operational command type
 * = add a catalog entry (actionCatalog.ts) + a handler here. Nothing executes
 * unless its handler implements execute() AND the lifecycle gates pass.
 */

export type HandlerFail = { ok: false; error: string };

export interface ActionHandler {
  actionType: string;
  validate(command: CommandLike): { ok: true } | HandlerFail;
  buildPreview?(db: ExecDb, command: CommandLike): Promise<{ ok: true; preview: PreviewResult; rollback: RollbackSnapshot } | HandlerFail>;
  execute?(db: ExecDb, command: CommandLike): Promise<{ ok: true; result: ExecutionResult } | HandlerFail>;
  revert?(db: ExecDb, command: CommandLike): Promise<{ ok: true; reverted_count: number } | HandlerFail>;
}

/** price_update_percentage — bulk % price change. Full preview/execute/revert. */
const priceHandler: ActionHandler = {
  actionType: "price_update_percentage",
  validate: (c) => {
    const v = validateCommand(c);
    return v.ok ? { ok: true } : v;
  },
  buildPreview: (db, c) => buildPreview(db, c),
  execute: (db, c) => executeApproved(db, c),
  revert: (db, c) => revertExecution(db, c),
};

/** ops_note — review-only operational note/request. No mutation; no execution. */
const opsNoteHandler: ActionHandler = {
  actionType: "ops_note",
  validate: (c) => {
    const ownerRequest = String((c.payload_json as { owner_request?: unknown } | null)?.owner_request ?? "").trim();
    return ownerRequest ? { ok: true } : { ok: false, error: "empty_note" };
  },
  // no buildPreview/execute/revert — this action is staged + reviewed only.
};

/**
 * Generic REVIEW-ONLY handler — for domain actions that record / ask / flag
 * (create review task, request missing info, return for clarification…). No
 * buildPreview/execute/revert → NO business mutation. They flow through the same
 * approve→handled lifecycle as ops_note (guarded + approval-gated + audited).
 */
function reviewOnlyHandler(actionType: string): ActionHandler {
  return { actionType, validate: () => ({ ok: true }) };
}

// Review-only action types (Level 0–1, no mutation) — in sync with the
// reviewOnly entries in actionCatalog.ts.
const REVIEW_ONLY_ACTIONS = [
  "finance_request_missing_invoice_fields",
  "inventory_create_stock_review_task",
  "fleet_create_maintenance_followup_task",
  "orders_return_for_clarification",
  "orders_create_coordination_task",
  "document_create_human_review_task",
  "graphics_request_missing_design_info",
  "fabrication_create_production_readiness_task",
  "coordination_create_site_readiness_task",
  "ceo_create_cross_domain_review_task",
];

const HANDLERS: Record<string, ActionHandler> = {
  price_update_percentage: priceHandler,
  ops_note: opsNoteHandler,
  ...Object.fromEntries(REVIEW_ONLY_ACTIONS.map((t) => [t, reviewOnlyHandler(t)])),
};

/** Resolve a handler by any inbound/canonical action type, or null if not allowlisted. */
export function getHandler(actionType: string): ActionHandler | null {
  const canonical = resolveActionType(actionType);
  return canonical ? HANDLERS[canonical] ?? null : null;
}
