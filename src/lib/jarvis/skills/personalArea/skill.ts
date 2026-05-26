import "server-only";
import type { Skill, SkillContext, SkillResult } from "../../types";
import { text } from "../../types";
import { createPersonalItem, listOpenPersonal, type PersonalKind } from "./store";

/**
 * Personal Area skill — owner-only (the registry never routes external senders here).
 * Stage 1: capture personal tasks / notes / reminders / daily-report requests, and list
 * open personal items. HONEST: reminders are stored as pending items, NOT scheduled — no
 * scheduler exists yet, and we never claim one fired.
 */

const STATUS = /מה\s+(פתוח|המשימות|יש\s+לי)|המשימות\s+שלי|מה\s+יש\s+להיום/;
const REMINDER = /תזכיר\s+לי|תזכורת/;
const DAILY = /דוח\s+יומי|סיכום\s+יומי/;
const TASK = /משימה|תרשום|להתקשר|לבצע/;

const KIND_LABEL: Record<PersonalKind, string> = {
  personal_task: "משימה",
  personal_note: "פתק",
  personal_reminder: "תזכורת",
  daily_report_request: "דוח יומי",
};

export const personalAreaSkill: Skill = {
  name: "personalArea",
  async handle(ctx: SkillContext): Promise<SkillResult> {
    const senderId = ctx.input.senderId;
    const body = (ctx.input.text ?? "").trim();
    const reply = (t: string): SkillResult => ({ handled: true, messages: [text(t)] });

    // Status / list query.
    if (STATUS.test(body) || !body) {
      const items = await listOpenPersonal(senderId);
      if (items.length === 0) return reply("אין לך כרגע משימות או פריטים אישיים פתוחים. 🙂");
      const lines = items.map((it, i) => `${i + 1}. [${KIND_LABEL[it.kind] ?? it.kind}] ${(it.body ?? "").slice(0, 60)}`).join("\n");
      return reply(`הפריטים האישיים הפתוחים שלך (${items.length}):\n${lines}`);
    }

    if (REMINDER.test(body)) {
      await createPersonalItem({ sourcePhone: senderId, kind: "personal_reminder", body });
      return reply("שמרתי כתזכורת ✅ — שים לב: תזכורות עדיין לא נשלחות אוטומטית, נשמרה כפריט ממתין.");
    }
    if (DAILY.test(body)) {
      await createPersonalItem({ sourcePhone: senderId, kind: "daily_report_request", body });
      return reply("רשמתי בקשה לדוח יומי ✅ (הפקה אוטומטית עדיין לא פעילה — נשמר כפריט ממתין).");
    }
    if (TASK.test(body)) {
      await createPersonalItem({ sourcePhone: senderId, kind: "personal_task", body });
      return reply("נשמר כמשימה ✅");
    }
    // Default: personal note.
    await createPersonalItem({ sourcePhone: senderId, kind: "personal_note", body });
    return reply("הפתק נשמר ✅");
  },
};
