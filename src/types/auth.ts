export type Role =
  | "master"
  | "office_manager"
  | "graphics_manager"
  | "procurement_manager"
  | "tender_manager"
  | "finance_manager"
  | "fleet_manager"
  | "field_worker"
  | "viewer";

export const ROLE_LABELS: Record<Role, string> = {
  master: "מנהל ראשי",
  office_manager: "מנהל משרד",
  graphics_manager: "מחלקת גרפיקה",
  procurement_manager: "רכש וספקים",
  tender_manager: "מכרזים ותמחור",
  finance_manager: "כספים",
  fleet_manager: "ציוד ורכב",
  field_worker: "עובד שטח",
  viewer: "צופה",
};

export const ALL_ROLES: Role[] = [
  "master",
  "office_manager",
  "graphics_manager",
  "procurement_manager",
  "tender_manager",
  "finance_manager",
  "fleet_manager",
  "field_worker",
  "viewer",
];

export type TabId =
  | "dashboard"
  | "orders"
  | "customers"
  | "graphics"
  | "fabrication"
  | "catalog"
  | "safety"
  | "accounting"
  | "workmap"
  | "schedule"
  | "crews"
  | "work-diary"
  | "profitability"
  | "cost-settings"
  | "access";

export const ALL_TABS: { id: TabId; label: string; path: string; section: string }[] = [
  { id: "dashboard", label: "לוח בקרה", path: "/", section: "ניהול" },
  { id: "orders", label: "טבלת הזמנות", path: "/orders", section: "ניהול" },
  { id: "customers", label: "לקוחות", path: "/customers", section: "ניהול" },
  { id: "graphics", label: "מחלקת גרפיקה", path: "/graphics", section: "מחלקות" },
  { id: "fabrication", label: "מחלקת מסגריה", path: "/fabrication", section: "מחלקות" },
  { id: "catalog", label: "מוצרים ושירותים", path: "/catalog", section: "מחלקות" },
  { id: "safety", label: "אביזרי בטיחות", path: "/safety", section: "מחלקות" },
  { id: "accounting", label: "הנהלת חשבונות", path: "/accounting", section: "מחלקות" },
  { id: "workmap", label: "מפת עבודות", path: "/workmap", section: "בקרת שטח" },
  { id: "schedule", label: "סידור שבועי", path: "/schedule", section: "בקרת שטח" },
  { id: "crews", label: "צוותי שטח", path: "/crews", section: "בקרת שטח" },
  { id: "work-diary", label: "יומן עבודה", path: "/work-diary", section: "בקרת שטח" },
  { id: "profitability", label: "דשבורד רווחיות", path: "/profitability", section: "ניתוח" },
  { id: "cost-settings", label: "תעריפי עלות", path: "/cost-settings", section: "ניתוח" },
  { id: "access", label: "הרשאות גישה", path: "/access", section: "מערכת" },
];

export type ActionPermission =
  | "create_order"
  | "edit_order"
  | "delete_order"
  | "create_customer"
  | "edit_customer"
  | "delete_customer"
  | "manage_graphics"
  | "view_accounting"
  | "export_accounting"
  | "manage_catalog"
  | "manage_crews"
  | "submit_diary"
  | "delete_diary"
  | "manage_access";

export const ACTION_PERMISSION_LABELS: Record<ActionPermission, string> = {
  create_order: "יצירת הזמנות",
  edit_order: "עריכת הזמנות",
  delete_order: "מחיקת הזמנות",
  create_customer: "יצירת לקוחות",
  edit_customer: "עריכת לקוחות",
  delete_customer: "מחיקת לקוחות",
  manage_graphics: "ניהול גרפיקה",
  view_accounting: "צפייה בחשבונות",
  export_accounting: "ייצוא דוחות כספיים",
  manage_catalog: "ניהול קטלוג",
  manage_crews: "ניהול צוותים",
  submit_diary: "הגשת יומן עבודה",
  delete_diary: "מחיקת יומן עבודה",
  manage_access: "ניהול משתמשים והרשאות",
};

export const ALL_ACTIONS: ActionPermission[] = Object.keys(ACTION_PERMISSION_LABELS) as ActionPermission[];

export const ROLE_DEFAULTS: Record<Role, { tabs: TabId[] | ["*"]; actions: ActionPermission[] | ["*"] }> = {
  master: { tabs: ["*"], actions: ["*"] },
  office_manager: {
    tabs: ["dashboard", "orders", "customers"],
    actions: ["create_order", "edit_order", "create_customer", "edit_customer"],
  },
  graphics_manager: {
    tabs: ["dashboard", "orders", "graphics", "fabrication"],
    actions: ["manage_graphics"],
  },
  procurement_manager: {
    tabs: ["dashboard", "catalog", "safety"],
    actions: ["manage_catalog"],
  },
  tender_manager: {
    tabs: ["dashboard", "orders", "customers"],
    actions: ["create_order", "view_accounting"],
  },
  finance_manager: {
    tabs: ["dashboard", "accounting", "profitability", "cost-settings"],
    actions: ["view_accounting", "export_accounting"],
  },
  fleet_manager: {
    tabs: ["dashboard", "crews", "schedule", "workmap"],
    actions: ["manage_crews"],
  },
  field_worker: {
    tabs: ["work-diary", "schedule"],
    actions: ["submit_diary"],
  },
  viewer: {
    tabs: ["dashboard"],
    actions: [],
  },
};

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: Role;
  is_active: boolean;
  allowed_tabs: string[];
  action_permissions: string[];
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export function canAccessTab(profile: UserProfile, tabId: TabId): boolean {
  if (!profile.is_active) return false;
  if (profile.allowed_tabs.includes("*")) return true;
  return profile.allowed_tabs.includes(tabId);
}

export function canPerformAction(profile: UserProfile, action: ActionPermission): boolean {
  if (!profile.is_active) return false;
  if (profile.action_permissions.includes("*")) return true;
  return profile.action_permissions.includes(action);
}
