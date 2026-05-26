import "server-only";
import type { JarvisInput, JarvisResponse } from "./types";
import { text } from "./types";
import { classifyIntentSmart } from "./llm/classifier";
import { resolveSkill } from "./registry";
import { orderIntakeSkill } from "./skills/orderIntake/skill";

/**
 * Jarvis brain / orchestrator.
 *
 * Channel adapters call `runJarvis(input)` and render the returned messages. Pipeline:
 * normalize (done by adapter) → classify intent → resolve a skill (role-gated registry) →
 * execute → return messages.
 *
 * EXTERNAL/unknown senders are funneled to order intake regardless of intent — they can
 * never reach owner skills (CEO/OCR/personal). The owner WhatsApp path is currently served
 * by the owner-menu adapter (master.ts), which calls the same skills; this orchestrator is
 * the channel-agnostic entry that Telegram/Web (and a future owner migration) will use.
 */

export async function runJarvis(input: JarvisInput): Promise<JarvisResponse> {
  const intent = await classifyIntentSmart(input.text ?? "", input.senderRole);

  if (input.senderRole === "external" || input.senderRole === "unknown") {
    const result = await orderIntakeSkill.handle({ input });
    return { messages: result.messages };
  }

  const skill = resolveSkill(input.senderRole, intent.intent) ?? orderIntakeSkill;
  const result = await skill.handle({ input });
  if (result.handled) return { messages: result.messages };
  return { messages: [text("קיבלתי 🙂 אפשר לנסח את הבקשה בקצרה — הזמנה, מסמך, משימה או פנייה ל-CEO?")] };
}
