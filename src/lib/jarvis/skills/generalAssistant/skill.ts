import "server-only";
import type { Skill, SkillContext, SkillResult } from "../../types";
import { text } from "../../types";
import { generateReply } from "../../llm/index";

/**
 * General Assistant — owner-only open reasoning / advice / thinking partner. This is what makes
 * Jarvis feel like a real personal assistant, not just a business-command brain. It uses the LLM
 * to produce a natural Hebrew reply for open-ended requests ("תעזור לי לחשוב…", "תן לי המלצה…",
 * "בוא נבנה תוכנית…"). READ-ONLY ADVICE ONLY: it performs no actions and never invents live
 * business data — for that it tells the owner to ask specifically (which routes to a department).
 * When the LLM is unavailable it answers honestly in safe mode rather than faking.
 */

const SYSTEM_PROMPT = [
  "אתה ג׳ארוויס — העוזר האישי של בעל העסק 'אלקיים' (חברת שילוט ותמרור).",
  "ענה בעברית, בקצרה ולעניין, בטון מקצועי וידידותי. עזור לחשוב, לייעץ, להסביר ולבנות תוכניות פעולה.",
  "אתה שכבת חשיבה בלבד — אינך מבצע פעולות ואין לך כאן גישה לנתונים חיים (מלאי/הזמנות/כספים).",
  "אם דרושים נתונים אמיתיים מהמערכת, אמור לבעלים לשאול ספציפית (למשל 'כמה X במלאי') ותבדוק במחלקה המתאימה.",
  "לעולם אל תמציא מספרים, מלאי, חובות או נתונים עסקיים. אם אינך יודע — אמור זאת בכנות.",
].join(" ");

export const generalAssistantSkill: Skill = {
  name: "generalAssistant",
  async handle(ctx: SkillContext): Promise<SkillResult> {
    const body = (ctx.input.text ?? "").trim();
    if (!body) {
      return { handled: true, messages: [text("מה תרצה לחשוב עליו יחד? 🙂")] };
    }
    const reply = await generateReply({
      text: body,
      role: ctx.input.senderRole,
      channel: ctx.input.channel,
      systemPrompt: SYSTEM_PROMPT,
    });
    if (reply?.text) {
      return { handled: true, messages: [text(reply.text)] };
    }
    // LLM unavailable → honest safe-mode answer (never fake a business answer).
    return {
      handled: true,
      messages: [text(
        "אני כרגע במצב בטוח (שכבת ההבנה המתקדמת לא זמינה כרגע) 🙂\n" +
        "אפשר לשאול אותי ישירות על מלאי, הזמנות, כספים, ציוד או משימות אישיות — או לנסח מחדש ואשתדל לעזור.",
      )],
    };
  },
};
