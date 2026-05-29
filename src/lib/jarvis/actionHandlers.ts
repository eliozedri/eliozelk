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

const HANDLERS: Record<string, ActionHandler> = {
  price_update_percentage: priceHandler,
  ops_note: opsNoteHandler,
};

/** Resolve a handler by any inbound/canonical action type, or null if not allowlisted. */
export function getHandler(actionType: string): ActionHandler | null {
  const canonical = resolveActionType(actionType);
  return canonical ? HANDLERS[canonical] ?? null : null;
}
