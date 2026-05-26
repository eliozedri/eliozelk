import type { Intent, SenderRole } from "./types";

/**
 * Pure role-gating helpers. Kept in a LEAF module (imports only types) so the brain and the LLM
 * classifier can use `sanitizeIntentForRole` WITHOUT importing the skill registry — which would
 * create a cycle (registry → skills → dispatcher → brain). Defense-in-depth lives here and is
 * re-exported by the registry for backward compatibility.
 */

/** Intents an external/unknown sender is ever allowed to act on (coarse level). */
export const EXTERNAL_ALLOWED_COARSE: Intent[] = ["order_intake", "greeting", "unclear"];

export function isOwnerOnlyIntent(intent: Intent): boolean {
  return intent !== "order_intake";
}

/**
 * Clamp a classified intent to what the role may reach BEFORE routing. External/unknown →
 * owner-only intents collapse to order_intake. Protects against any classifier (deterministic OR
 * LLM) leaking owner intents to a customer, independent of the registry's skill-resolution gate.
 */
export function sanitizeIntentForRole(intent: Intent, role: SenderRole): Intent {
  if (role === "external" || role === "unknown") {
    return EXTERNAL_ALLOWED_COARSE.includes(intent) ? intent : "order_intake";
  }
  return intent;
}
