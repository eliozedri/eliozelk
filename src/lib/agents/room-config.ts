// Phase 2.8 — Digital HQ room configuration
// Defined as static TypeScript for Phase 2.8.
// Type matches the intended communication_rooms DB schema so migration is trivial later.
// Future: move to DB table for dynamic layout, room backgrounds, custom positions.

export interface RoomConfig {
  id: string;
  name: string;            // Hebrew display label
  nameEn: string;          // English sub-label
  department: string;      // matches AgentDepartment
  icon: string;            // emoji placeholder; replace with avatar_url later
  description: string;
  agentIds: string[];      // agent.id values that belong to this room
  gridCol: number;         // 1-indexed CSS grid column
  gridRow: number;         // 1-indexed CSS grid row
  gridColSpan?: number;    // default 1
}

export const ROOMS: RoomConfig[] = [
  {
    id: "management",
    name: "חדר הנהלה",
    nameEn: "Management",
    department: "operations",
    icon: "🏢",
    description: "מרכז פיקוד ותיאום כלל ארגוני",
    agentIds: ["ops-orchestrator"],
    gridCol: 1, gridRow: 1, gridColSpan: 2,
  },
  {
    id: "accounting",
    name: "חדר הנה״ח",
    nameEn: "Accounting & Collections",
    department: "accounting",
    icon: "💼",
    description: "חיוב, גבייה וניהול תשלומים",
    agentIds: ["billing-collections-agent"],
    gridCol: 3, gridRow: 1,
  },
  {
    id: "finance",
    name: "חדר כספים",
    nameEn: "Finance",
    department: "finance",
    icon: "📊",
    description: "ניתוח פיננסי ורווחיות",
    agentIds: ["cfo-agent"],
    gridCol: 4, gridRow: 1,
  },
  {
    id: "field",
    name: "חדר ביצוע",
    nameEn: "Field Operations",
    department: "field",
    icon: "🦺",
    description: "יומני עבודה וצוותי שטח",
    agentIds: ["field-ops-agent"],
    gridCol: 1, gridRow: 2,
  },
  {
    id: "warehouse",
    name: "חדר מחסן",
    nameEn: "Warehouse",
    department: "warehouse",
    icon: "📦",
    description: "מלאי וציוד",
    agentIds: ["inventory-agent"],
    gridCol: 2, gridRow: 2,
  },
  {
    id: "graphics",
    name: "חדר גרפיקה",
    nameEn: "Graphics & Production",
    department: "graphics",
    icon: "🎨",
    description: "גרפיקה וייצור שילוט",
    agentIds: ["graphics-production-agent"],
    gridCol: 3, gridRow: 2,
  },
  {
    id: "catalog",
    name: "חדר קטלוג",
    nameEn: "Catalog & Pricing",
    department: "catalog",
    icon: "📋",
    description: "תמחור וקטלוג מוצרים",
    agentIds: ["catalog-pricing-agent"],
    gridCol: 4, gridRow: 2,
  },
  {
    id: "fabrication",
    name: "חדר מסגרייה",
    nameEn: "Fabrication",
    department: "fabrication",
    icon: "⚙️",
    description: "מסגרייה, ייצור מתכת ומוכנות ייצור",
    agentIds: ["fabrication-agent"],
    gridCol: 1, gridRow: 3,
  },
  {
    id: "coordination-qa",
    name: "מחלקת תיאומים ו-QA",
    nameEn: "Coordination / QA",
    department: "operations",
    icon: "🔍",
    description: "בקרת מוכנות, תיאום לקוחות וזיהוי סתירות תפעוליות",
    agentIds: ["coordination-qa-agent"],
    gridCol: 2, gridRow: 3,
  },
];

// Meeting room — rendered only when active meetings exist.
// Sits at cols 3–4 of row 3 (span 2) to make room for Coordination & QA at col 2.
export const MEETING_ROOM: RoomConfig = {
  id: "meetings",
  name: "חדר ישיבות",
  nameEn: "Meeting Room",
  department: "operations",
  icon: "📅",
  description: "פגישות סוכנים פעילות",
  agentIds: [],
  gridCol: 3, gridRow: 3, gridColSpan: 2,
};
