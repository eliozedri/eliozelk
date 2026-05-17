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
    shortDesc: "תיאום כלל-ארגוני ופיקוד",
    department: "operations",
    responsibilities: [
      "פיקוד על כלל הסוכנים",
      "ניהול חריגות קריטיות",
      "אישור מעברי סטטוס מורכבים",
    ],
    workflowRole: "orchestration",
    connectedWorkflows: ["graphics_pending", "production", "ready_installation"],
  },

  "billing-collections-agent": {
    id: "billing-collections-agent",
    label: "הנה״ח וגבייה",
    icon: "💼",
    shortDesc: "חיוב, גבייה וניהול תשלומים",
    department: "accounting",
    responsibilities: [
      "הפקת חשבוניות",
      "מעקב גבייה",
      "ניהול חשבונות לקוחות",
    ],
    workflowRole: "billing",
  },

  "cfo-agent": {
    id: "cfo-agent",
    label: "מנהל כספים",
    icon: "📊",
    shortDesc: "ניתוח פיננסי ורווחיות",
    department: "finance",
    responsibilities: [
      "ניתוח רווחיות פרויקטים",
      "דוחות כספיים",
      "תקצוב ותחזיות",
    ],
    workflowRole: "finance-analysis",
  },

  "field-ops-agent": {
    id: "field-ops-agent",
    label: "מנהל ביצוע שטח",
    icon: "🦺",
    shortDesc: "יומני עבודה וצוותי שטח",
    department: "field",
    responsibilities: [
      "ניהול יומני עבודה",
      "מעקב צוותי שטח",
      "תיעוד ביצוע",
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
    shortDesc: "תיאום עבודות · בקרת מוכנות · בדיקת סתירות",
    department: "operations",
    responsibilities: [
      "תיאום עם לקוח, מזמין ואיש קשר באתר",
      "תיאום לוחות זמנים ואישור תזמון ביצוע",
      "תיאום פנימי בין מחלקות: משרד, גרפיקה, מחסן, מסגרייה, שטח והנה״ח",
      "אימות מוכנות לפני שליחת צוותים לשטח",
      "בדיקת שערי מחסן, גרפיקה, ייצור ומסגרייה",
      "זיהוי סתירות בין סטטוס, התקדמות ותורי מחלקות",
      "חשיפת מצבי workflow בלתי אפשריים למנהל הפעילות",
      "מניעת תזמון עבודות לפני סגירת שערים תפעוליים",
    ],
    workflowRole: "workflow-integrity",
    connectedWorkflows: ["production", "ready_installation"],
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
