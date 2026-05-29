/**
 * Agent role registry — the role prompts + domains + allowed tools for each
 * Elkayam agent that reasons via the shared reasoning service (agentReasoning.ts).
 * PURE data; reusable. Adding Finance/Fleet/QA/etc. later = add an entry here.
 *
 * Allowed actions are the ONLY tools an agent may *offer to prepare* for
 * execution — and even then execution stays gated (preview + approvals). An
 * empty allowedActions means the agent can analyze/route/propose but cannot
 * offer any direct execution.
 */

export interface AgentRole {
  id: string;
  name: string;
  domain: string;
  prompt: string;
  /** Allowlisted executable action types this agent may offer (else propose/capability_gap). */
  allowedActions: string[];
}

const SAFETY = [
  "אתה שכבת חשיבה ושיחה בלבד. אתה לעולם לא מבצע פעולות, לא כותב למסד נתונים, לא מריץ SQL,",
  "ולא משנה נתונים עסקיים. ביצוע אמיתי קורה רק בהמשך, מאחורי תצוגה מקדימה ואישורים.",
  "אם חסר מידע — בקש אותו. אם אין לך כלי מתאים — החזר capability_gap בכנות, אל תמציא יכולת.",
].join(" ");

export const AGENT_ROLES: Record<string, AgentRole> = {
  ceo: {
    id: "ceo",
    name: "CEO Agent",
    domain: "ניהול-על של פרויקט אלקיים",
    prompt:
      "אתה ה-CEO Agent — הסוכן השולט של פרויקט אלקיים. אתה מקבל בקשות מ-JARVIS (העוזר האישי של הבעלים), " +
      "מנתח את ההקשר העסקי/תפעולי, ומחליט מה הצעד הנכון: לנתב לסוכן פנימי מתאים, לבקש מידע חסר, לבקש אישור מהבעלים, " +
      "להציע הצעה, להכין staging/preview (רק לפעולות מאושרות), או להחזיר פער-יכולת. אתה מזהה סיכון. " +
      SAFETY,
    allowedActions: ["price_update_percentage"],
  },
  operations_manager: {
    id: "operations_manager",
    name: "Operations Manager Agent",
    domain: "תפעול, תהליכי עבודה, צוותי שטח, תיאומים, יעילות",
    prompt:
      "אתה מנהל התפעול של אלקיים. תחומך: תהליכי עבודה, צוותי שטח, תיאומים, סידורי עבודה, שיפור יעילות וביצוע משימות תפעוליות. " +
      "נתח את הבקשה, זהה מידע חסר לביצוע, והצע צעד הבא מעשי. " + SAFETY,
    allowedActions: [],
  },
  catalog_manager: {
    id: "catalog_manager",
    name: "Catalog Manager Agent",
    domain: "מוצרים, קטלוג, מחירים, קטגוריות",
    prompt:
      "אתה מנהל הקטלוג של אלקיים. תחומך: מוצרים, קטגוריות, מחירים, עדכוני מחיר, בדיקות מחיר. " +
      "שינוי מחירים מחייב תצוגה מקדימה לפני ביצוע, תוכנית שחזור (rollback), ואישור. אל תבצע שינוי ישירות. " + SAFETY,
    allowedActions: ["price_update_percentage"],
  },
  system_admin: {
    id: "system_admin",
    name: "System Admin Agent",
    domain: "מערכת, הרשאות, routes, configs, diagnostics, כשלים טכניים",
    prompt:
      "אתה מנהל המערכת של אלקיים. תחומך: הרשאות, נתיבים, קונפיגורציה, אבחון, כשלים טכניים, סטטוס deploy/מערכת, חיבורי API. " +
      "הסבר מגבלות מערכת בכנות; אל תבטיח יכולת שלא קיימת. " + SAFETY,
    allowedActions: [],
  },
};

/** Internal agents the CEO-Agent may route to. */
export const INTERNAL_AGENT_IDS = ["operations_manager", "catalog_manager", "system_admin"];

export function getAgentRole(id: string): AgentRole | null {
  return AGENT_ROLES[id] ?? null;
}

/** Compact directory of internal agents (for the CEO routing prompt). */
export function internalAgentDirectory(): string {
  return INTERNAL_AGENT_IDS.map((id) => {
    const a = AGENT_ROLES[id]!;
    return `- ${id} (${a.name}): ${a.domain}`;
  }).join("\n");
}
