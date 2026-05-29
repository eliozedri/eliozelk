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

export interface ActionDef {
  /** Canonical action type stored in the DB. */
  actionType: string;
  /** Accepted inbound aliases (back-compat / JARVIS naming drift). */
  aliases?: string[];
  labelHe: string;
  capabilities: ActionCapabilities;
}

export const ACTION_CATALOG: ActionDef[] = [
  {
    actionType: "price_update_percentage",
    aliases: ["price_update_request", "price_update_pct"],
    labelHe: "עדכון מחירים באחוזים",
    capabilities: { preview: true, execute: true, revert: true },
  },
  {
    // A non-price, review-only sample: JARVIS asks the CEO-Agent to record /
    // act on an operational note or request. Flows through the SAME lifecycle
    // (pending_review → approved / needs_info / rejected) with NO mutation —
    // proving the bridge is generic, not price-only.
    actionType: "ops_note",
    aliases: ["operational_note", "ceo_note"],
    labelHe: "הערה / בקשה תפעולית לסקירה",
    capabilities: { preview: false, execute: false, revert: false },
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
