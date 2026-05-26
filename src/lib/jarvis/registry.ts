import type { Intent, SenderRole, Skill } from "./types";
import { orderIntakeSkill } from "./skills/orderIntake/skill";
import { ceoManagerSkill } from "./skills/ceoManager/skill";
import { ocrDocumentSkill } from "./skills/ocrDocument/skill";
import { personalAreaSkill } from "./skills/personalArea/skill";

/**
 * Skill registry — maps intent → skill, gated by sender role. EXTERNAL senders can ONLY
 * ever reach order intake (customer context); CEO / OCR / personal / status are owner-only.
 * Extend by adding a skill + a row here — adapters/orchestrator never change.
 */

const OWNER_SKILLS: Partial<Record<Intent, Skill>> = {
  order_intake: orderIntakeSkill,
  ocr_document: ocrDocumentSkill,
  ceo_manager: ceoManagerSkill,
  personal: personalAreaSkill,
  status: personalAreaSkill,
};

const EXTERNAL_SKILLS: Partial<Record<Intent, Skill>> = {
  order_intake: orderIntakeSkill,
};

export function resolveSkill(role: SenderRole, intent: Intent): Skill | null {
  if (role === "external" || role === "unknown") return EXTERNAL_SKILLS[intent] ?? null;
  return OWNER_SKILLS[intent] ?? null;
}

/** Intents only the owner may reach (everything except order intake). */
export function isOwnerOnlyIntent(intent: Intent): boolean {
  return intent !== "order_intake";
}
