import "server-only";
import type { Skill, SkillContext, SkillResult } from "../../types";
import { text } from "../../types";
import { createCapabilityRequest } from "../../capabilities";
import { resolveCapability } from "../../capabilityResolver";

/**
 * Image / Creative Media skill — OWNER-ONLY. Handles requests to GENERATE or EDIT images
 * ("תיצור לי תמונה", "תערוך את התמונה", "נאנו בננה 2", "בסגנון הזה"). An attached image is treated
 * as a STYLE REFERENCE (context), not as a document to OCR.
 *
 * HONEST STAGE 1: no image-generation provider is connected. Jarvis NEVER fakes that it created an
 * image. It (1) opens a Capability Request (kind=tool) to connect an image tool — routed to the
 * System Manager / Development skill — and (2) prepares a clean, ready-to-use image prompt for the
 * requested tool. External senders never reach this skill.
 */

const EDIT_RE = /תערוך|לערוך|\bedit\b|שנה\s+את\s+התמונה|עריכת\s+תמונה|retouch/i;
const TOOL_RE = /נאנו\s*בננה(\s*\d+)?|nano\s*banana(\s*\d+)?|dall[\s-]?e|midjourney|stable\s*diffusion|gpt[\s-]?image|imagen|flux/i;
// Strip the request verbs/tool mention to leave the actual image description.
const STRIP_RE = /תיצור\s+לי|תעשה\s+לי|תייצר|ליצור|תיצור|תעשה|לי\s+תמונה|תמונה\s+חדשה|עוד\s+סגנונות|בסגנון\s+הזה|עם\s+הכלי|תשתמש\s+ב?כלי(\s+שלך)?|תשתמש\s+ב|נאנו\s*בננה(\s*\d+)?|nano\s*banana(\s*\d+)?/gi;

function buildImagePrompt(body: string, hasImage: boolean): string {
  const desc = body.replace(STRIP_RE, " ").replace(/\s+/g, " ").trim() || "(תאר כאן מה שברצונך שיופיע בתמונה)";
  return [
    "🎨 Image prompt (לשימוש בכלי יצירת התמונות שלך):",
    `Subject/desc: ${desc}`,
    hasImage ? "Style reference: התמונה ששלחת (שמור על קומפוזיציה/צבעוניות דומים)." : "Style: (ציין סגנון רצוי)",
    "Quality: high detail, clean composition.",
  ].join("\n");
}

export const imageCreativeSkill: Skill = {
  name: "imageCreative",
  async handle(ctx: SkillContext): Promise<SkillResult> {
    if (ctx.input.senderRole !== "master") {
      return { handled: true, messages: [text("הפעולה הזו זמינה לבעלים בלבד.")] };
    }
    const body = (ctx.input.text ?? "").trim();
    const isEdit = EDIT_RE.test(body);
    const tool = body.match(TOOL_RE)?.[0]?.trim() ?? null;
    const hasImage = !!ctx.input.media;
    const kind = isEdit ? "image_editing" : "image_generation";

    // Investigate FIRST: is image generation already reachable via existing providers/keys?
    const cap = resolveCapability(kind);
    const promptText = buildImagePrompt(body, hasImage);

    // "available" would mean a wired, owner-approved generation pipeline — not built yet, so we never
    // fake it. Today the resolver returns needs_approval (Gemini key present, paid, not wired) or missing.
    const id = await createCapabilityRequest({
      requestedBy: ctx.input.senderId,
      channel: ctx.input.channel,
      originalMessage: body,
      interpretedIntent: kind,
      kind: "tool",
      missingSkillOrDataSource: `image ${isEdit ? "editing" : "generation"} tool${tool ? ` (${tool})` : ""} — ${cap.status}`,
      targetAgent: "ceo",
      recommendedNextStep: cap.enablement ?? "לחבר ספק יצירת תמונות דרך ה-Development skill.",
      priority: "normal",
    });
    const ref = id ? ` (#${id.slice(0, 8)})` : "";

    return {
      handled: true,
      messages: [text(
        `הבנתי שאתה רוצה ${isEdit ? "לערוך" : "ליצור"} תמונה${tool ? ` עם ${tool}` : ""}${hasImage ? " (לפי התמונה ששלחת כרפרנס)" : ""}.\n` +
        `בדקתי מה אפשרי: ${cap.detail}\n` +
        `לא אזייף יצירת תמונה. פתחתי בקשת יכולת${ref}.\n\n` +
        `${promptText}\n\n` +
        (cap.paid
          ? "החיבור כרוך כנראה בעלות API — צריך אישור מפורש ממך. תרצה שאפתח משימת חיבור (Development)? כתוב 'תחבר כלי יצירת תמונות'."
          : "תרצה שאפתח משימת חיבור דרך Development? כתוב 'תחבר כלי יצירת תמונות'."),
      )],
    };
  },
};
