export type SafetySubcategory =
  | "קונוסים ואביזריהם"
  | "מפרדים ועמודים גמישים"
  | "עמודי מחסום ועמודי חסימה"
  | "מתקני שילוט ואבזור תמרורים"
  | "תאורת בטיחות ועיני חתול"
  | "פסי האטה ומגן כבלים"
  | "אביזרי חניה"
  | "מד מהירות ומראות בטיחות"
  | "גדרות ותיחום"
  | "אביזרים ושילוט נוסף"
  | "נגישות ומניעת הצפות";

export type SafetyPowerSource = "solar" | "electric" | "solar_or_electric" | "none";
export type SafetyReadinessStatus = "ready" | "missing_data" | "needs_review";
export type SafetyConfidence = "high" | "medium" | "low";

export interface SafetyVariant {
  label: string;
  dimension?: string;
  material?: string;
  color?: string;
  notes?: string;
}

export interface SafetyAccessoryItem {
  id: string;
  catalogName: string;
  name: string;
  subcategory: SafetySubcategory;
  description: string;
  material: string | null;
  dimensions: string | null;
  colors: string[] | null;
  isReflective: boolean | null;
  powerSource: SafetyPowerSource | null;
  isSolar: boolean;
  isElectric: boolean;
  installationMethod: string | null;
  usageEnvironment: string | null;
  intendedUse: string | null;
  variants: SafetyVariant[];
  catalogPage: number;
  notes: string | null;
  missingFields: string[];
  confidence: SafetyConfidence;
  status: SafetyReadinessStatus;
  unitOfMeasure: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const SAFETY_SUBCATEGORIES: SafetySubcategory[] = [
  "קונוסים ואביזריהם",
  "מפרדים ועמודים גמישים",
  "עמודי מחסום ועמודי חסימה",
  "מתקני שילוט ואבזור תמרורים",
  "תאורת בטיחות ועיני חתול",
  "פסי האטה ומגן כבלים",
  "אביזרי חניה",
  "מד מהירות ומראות בטיחות",
  "גדרות ותיחום",
  "אביזרים ושילוט נוסף",
  "נגישות ומניעת הצפות",
];

export const SAFETY_SUBCATEGORY_COLORS: Record<SafetySubcategory, string> = {
  "קונוסים ואביזריהם":           "bg-orange-100 text-orange-700",
  "מפרדים ועמודים גמישים":       "bg-yellow-100 text-yellow-700",
  "עמודי מחסום ועמודי חסימה":   "bg-red-100 text-red-700",
  "מתקני שילוט ואבזור תמרורים": "bg-blue-100 text-blue-700",
  "תאורת בטיחות ועיני חתול":    "bg-amber-100 text-amber-700",
  "פסי האטה ומגן כבלים":        "bg-slate-100 text-slate-700",
  "אביזרי חניה":                 "bg-cyan-100 text-cyan-700",
  "מד מהירות ומראות בטיחות":    "bg-indigo-100 text-indigo-700",
  "גדרות ותיחום":                "bg-green-100 text-green-700",
  "אביזרים ושילוט נוסף":        "bg-purple-100 text-purple-700",
  "נגישות ומניעת הצפות":        "bg-teal-100 text-teal-700",
};

export const STATUS_LABELS: Record<SafetyReadinessStatus, string> = {
  ready:        "מוכן",
  missing_data: "חסרים נתונים",
  needs_review: "לבדיקה",
};

export const STATUS_COLORS: Record<SafetyReadinessStatus, string> = {
  ready:        "bg-green-100 text-green-700",
  missing_data: "bg-yellow-100 text-yellow-700",
  needs_review: "bg-red-100 text-red-700",
};

export const POWER_SOURCE_LABELS: Record<SafetyPowerSource, string> = {
  solar:           "סולארי",
  electric:        "חשמלי",
  solar_or_electric: "סולארי / חשמלי",
  none:            "ללא",
};
