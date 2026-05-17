// Agent Registry — single source of truth for agent identity and operational meaning.
//
// To add a new agent:
//   1. Add one entry here in AGENT_REGISTRY
//   2. Add that agent's id to the relevant room's agentIds in room-config.ts
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
    label: "מנהל הנדסה",
    icon: "🔧",
    shortDesc: "ניתוח תוכניות הנדסיות",
    department: "engineering",
    responsibilities: [
      "ניתוח תוכניות קונסטרוקציה",
      "בדיקת היתכנות הנדסית",
      "אישור מפרטים טכניים",
    ],
    workflowRole: "engineering-review",
  },

  "coordination-qa-agent": {
    id: "coordination-qa-agent",
    label: "מנהלת תיאומים ו-QA",
    icon: "🔍",
    shortDesc: "תיאום עבודות · בקרת מוכנות · בדיקת סתירות",
    department: "operations",
    responsibilities: [
      "תיאום עם לקוח, מזמין ואיש קשר באתר",
      "אימות מוכנות לפני תזמון ביצוע",
      "בדיקת שערי מחסן, גרפיקה, ייצור ומסגרייה",
      "זיהוי סתירות בין סטטוס, התקדמות ותורי מחלקות",
      "חשיפת מצבי workflow בלתי אפשריים למנהל הפעילות",
      "מניעת תזמון עבודות לפני סגירת שערים תפעוליים",
    ],
    workflowRole: "workflow-integrity",
    connectedWorkflows: ["production", "ready_installation"],
  },
};
