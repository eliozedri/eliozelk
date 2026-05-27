import "server-only";
import { githubAvailable } from "./skills/development/github";

/**
 * Autonomous Capability Resolution — before Jarvis says "I can't" or asks to build a new skill, it
 * INVESTIGATES whether the capability is already reachable via existing providers/keys/skills, and
 * whether enabling it is free/safe or needs approval (paid/secret/manual). Returns an honest status
 * the skill turns into a natural reply. It NEVER auto-enables a paid capability.
 *
 * Presence-only env checks (never logs/returns secret values).
 */

export type CapabilityStatus = "available" | "needs_approval" | "missing";

export interface CapabilityCheck {
  capability: string;
  status: CapabilityStatus;
  /** Owner-facing Hebrew detail. */
  detail: string;
  /** What is needed to enable it (when not available). */
  enablement?: string;
  /** True when enabling/using it incurs paid usage → requires explicit owner approval. */
  paid?: boolean;
}

export function resolveCapability(name: string): CapabilityCheck {
  switch (name) {
    case "image_generation":
    case "image_editing": {
      const hasGemini = !!process.env.GEMINI_API_KEY;
      if (hasGemini) {
        return {
          capability: name,
          status: "needs_approval",
          paid: true,
          detail:
            "יש לנו מפתח Gemini. 'נאנו בננה' הוא מודל יצירת/עריכת התמונות של Google Gemini — " +
            "ניתן לחבר אותו דרך אותו מפתח, אך יצירת תמונות כרוכה בעלות API ואינה מחוברת כעת ב-Jarvis.",
          enablement:
            "אישור עלות + חיבור מודל תמונות של Gemini (responseModalities: IMAGE), העלאת התוצאה ל-Storage " +
            "ושליחתה בוואטסאפ. דרך ה-Development skill / Claude Code, מאחורי דגל JARVIS_IMAGE_GEN_ENABLED.",
        };
      }
      return {
        capability: name,
        status: "missing",
        detail: "אין כרגע ספק יצירת תמונות מחובר.",
        enablement: "להוסיף ספק image-gen (Gemini image / אחר) + מפתח, ולחבר דרך Development.",
      };
    }
    case "ocr_document":
    case "ocr":
      return { capability: "ocr", status: "available", detail: "קריאת מסמכים (OCR) זמינה (tesseract)." };
    case "github":
      return githubAvailable()
        ? { capability: "github", status: "available", detail: "GitHub מחובר." }
        : { capability: "github", status: "needs_approval", detail: "GitHub אינו מחובר.", enablement: "GITHUB_INTEGRATION_ENABLED=true + טוקן (ראה docs/JARVIS_GITHUB_CLAUDE_CODE_INTEGRATION.md)." };
    case "claude_code":
      return { capability: "claude_code", status: "needs_approval", detail: "הרצת Claude Code זמינה רק דרך GitHub Action (לא מהשרת).", enablement: "secret CLAUDE_CODE_OAUTH_TOKEN/ANTHROPIC_API_KEY ב-GitHub Actions." };
    default:
      return { capability: name, status: "missing", detail: "יכולת לא מוכרת — נדרשת בדיקה/פיתוח." };
  }
}
