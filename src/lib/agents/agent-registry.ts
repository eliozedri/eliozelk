// Agent Registry — single source of truth for agent identity and operational meaning.
//
// To add a new CORE agent, check ALL of the following layers:
//   1. Add one entry here in AGENT_REGISTRY (label, icon, responsibilities)
//   2. Add agent id to the relevant room in room-config.ts (visual position)
//   3. Add agent id to AGENT_ORG in types/agent.ts (org hierarchy)
//   4. Add AgentType literal to types/agent.ts (TypeScript union)
//   5. Add a Supabase migration seeding the agent row in the agents table
//   6. Add to SCANNABLE_AGENTS in AgentCommandCenter/index.tsx ONLY if a real scan route exists
//   8. Verify chat/addressability: the openAgentChat(id) path works for any agent in the DB
//
// room-config.ts owns visual layout (grid position, room title, span).
// This file owns agent identity (label, icon, role, responsibilities).

export interface AgentConfig {
  id: string;
  label: string;            // Hebrew display name
  icon: string;             // emoji; replace with avatar_url later
  shortDesc: string;        // one-line subtitle shown in ghost nodes and tooltips
  department: string;       // matches AgentDepartment in types/agent
  responsibilities: string[];
  workflowRole?: string;    // conceptual role in the order lifecycle
  connectedWorkflows?: string[]; // WorkOrderStatus keys this agent monitors or gates
}

export const AGENT_REGISTRY: Record<string, AgentConfig> = {
  "ops-orchestrator": {
    id: "ops-orchestrator",
    label: "מנהל פעילות",
    icon: "🏢",
    shortDesc: "ניטור SLA, דחיפויות וחריגות קריטיות",
    department: "operations",
    responsibilities: [
      "ניטור חריגות SLA בכל שלבי הזמנה",
      "סלמציה הזמנות דחופות תקועות",
      "ניטור בעיות ייצור (fabrication_issue)",
      "אימות כניסה לתהליך חיוב לאחר השלמה",
      "ניטור התאמת מלאי לפני חיוב",
    ],
    workflowRole: "orchestration",
    connectedWorkflows: ["graphics_pending", "production"],
  },

  "billing-collections-agent": {
    id: "billing-collections-agent",
    label: "הנה״ח וגבייה",
    icon: "💼",
    shortDesc: "מעקב מוכנות לחיוב, ניטור חוסמי חיוב ואישור",
    department: "accounting",
    responsibilities: [
      "מעקב מוכנות לחיוב ואישור",
      "ניטור חוסמי חיוב (יומנים, ייצור, מלאי)",
      "מעקב גבייה",
      "ניהול חשבונות לקוחות",
    ],
    workflowRole: "billing",
  },

  "cfo-agent": {
    id: "cfo-agent",
    label: "מנהל כספים",
    icon: "📊",
    shortDesc: "ניטור רווחיות יומנים והזמנות",
    department: "finance",
    responsibilities: [
      "ניטור רווחיות יומנים והזמנות",
      "זיהוי הפסדים ורווחיות שולית",
      "ניתוח מגמות פיננסיות",
    ],
    workflowRole: "finance-analysis",
  },

  "field-ops-agent": {
    id: "field-ops-agent",
    label: "מנהל ביצוע שטח",
    icon: "🦺",
    shortDesc: "בקרת איכות יומני שטח",
    department: "field",
    responsibilities: [
      "בקרת שלמות יומני שטח (צוות, רכב, חתימה, שעות)",
      "זיהוי יומנים ממתינים לאישור מעל 48 שעות",
      "איתור טיוטות ישנות שלא הוגשו",
    ],
    workflowRole: "field-execution",
    connectedWorkflows: ["ready_installation", "completed"],
  },

  "inventory-agent": {
    id: "inventory-agent",
    label: "מנהל מחסן",
    icon: "📦",
    shortDesc: "מלאי וציוד",
    department: "warehouse",
    responsibilities: [
      "ניהול מלאי חומרים",
      "הכנת ציוד להתקנה",
      "אישור מוכנות מחסן",
    ],
    workflowRole: "warehouse-readiness",
    connectedWorkflows: ["production", "ready_installation"],
  },

  "graphics-production-agent": {
    id: "graphics-production-agent",
    label: "מנהל גרפיקה",
    icon: "🎨",
    shortDesc: "גרפיקה וייצור שילוט",
    department: "graphics",
    responsibilities: [
      "ניהול תהליך הגרפיקה",
      "מעקב אישורי לקוח",
      "תיאום עם ייצור",
    ],
    workflowRole: "graphics-production",
    connectedWorkflows: ["graphics_pending", "graphics_active", "graphics_done"],
  },

  "catalog-pricing-agent": {
    id: "catalog-pricing-agent",
    label: "מנהל קטלוג",
    icon: "📋",
    shortDesc: "תמחור וקטלוג מוצרים",
    department: "catalog",
    responsibilities: [
      "ניהול קטלוג מוצרים",
      "עדכון מחירים",
      "הצעות מחיר",
    ],
    workflowRole: "catalog-pricing",
  },

  "engineering-plan-agent": {
    id: "engineering-plan-agent",
    label: "ניתוח תכניות הנדסה",
    icon: "📐",
    shortDesc: "מודול עתידי — ניתוח PDF הנדסי, חישובים וכמויות מדידה",
    department: "engineering",
    responsibilities: [
      "ניתוח תכניות קונסטרוקציה ו-PDF הנדסי",
      "חילוץ כמויות מדידה עם ציון ביטחון",
      "תמיכה בחישובים הנדסיים לצורכי שילוט",
      "אישור מפרטים טכניים",
    ],
    workflowRole: "engineering-review",
    // out-of-core: future specialized analysis agent — not part of active 9-agent Neural Core
  },

  "coordination-qa-agent": {
    id: "coordination-qa-agent",
    label: "מנהלת תיאומים ו-QA",
    icon: "🔍",
    shortDesc: "שער ready_installation: תיאום, מוכנות ו-QA לפני שטח",
    department: "operations",
    responsibilities: [
      "בעלות בלעדית על שלב ready_installation — תיאום, שיבוץ ומעקב",
      "זיהוי הזמנות מוכנות ללא תאריך שיבוץ (unscheduled_ready)",
      "זיהוי יומן שטח חסר לאחר תאריך ביצוע (missing_diary)",
      "זיהוי בעיות פתוחות על הזמנות פעילות (open_problems)",
      "בדיקת שערי מוכנות: מחסן, גרפיקה, ייצור ומסגרייה",
      "תיאום עם לקוח, מזמין ואיש קשר באתר לפני שליחת צוותים",
    ],
    workflowRole: "workflow-integrity",
    connectedWorkflows: ["ready_installation"],
  },

  "orders-agent": {
    id: "orders-agent",
    label: "מנהל הזמנות",
    icon: "📋",
    shortDesc: "מחזור חיי הזמנה, מוכנות לביצוע ואיתור תקיעות",
    department: "operations",
    responsibilities: [
      "מעקב הזמנות חסרות שדות נדרשים",
      "זיהוי הזמנות תקועות בשלב הקלטה",
      "ניטור הזמנות ממתינות לאישור ביצוע לקוח",
      "איתור הזמנות שעברו את תאריך הספקה הנדרש",
    ],
    workflowRole: "order-intake",
    connectedWorkflows: ["draft", "graphics_pending"],
  },

  "equipment-fleet-agent": {
    id: "equipment-fleet-agent",
    label: "מנהל ציוד ורכבים",
    icon: "🚛",
    shortDesc: "תקינות ציוד, תוקפי טסט, ביטוח ותחזוקה",
    department: "fleet",
    responsibilities: [
      "מעקב תוקפי טסט, ביטוח ורישיון",
      "זיהוי ציוד לא שמיש או בשיפוץ ממושך",
      "איתור רשומות ציוד חסרות זיהוי מלא",
      "התראות מועדי תחזוקה קרובים ועברי",
    ],
    workflowRole: "fleet-readiness",
  },

  "fabrication-agent": {
    id: "fabrication-agent",
    label: "מחלקת מסגרייה",
    icon: "⚙️",
    shortDesc: "מסגרייה, ייצור מתכת ומוכנות ייצור",
    department: "fabrication",
    responsibilities: [
      "מעקב סטטוס עבודות מסגרייה וריתוך",
      "ניהול מוכנות ייצור לפני שליחת צוותים לשטח",
      "תיאום עם מחלקת תיאומים ו-QA ועבודות שטח",
      "מעקב עיבוד מתכת ומוכנות חומרים",
      "תיעוד השלמת שלבי ייצור",
    ],
    workflowRole: "fabrication-production",
    connectedWorkflows: ["production", "ready_installation"],
  },
};
