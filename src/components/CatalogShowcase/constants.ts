// Shared badge helpers and category config for /catalog and /catalog-showcase

export interface ShowcaseCategory {
  key: string;
  label: string;
  icon: string;
  folder?: string;
}

export const SHOWCASE_CATEGORIES: ShowcaseCategory[] = [
  { key: "אביזרי בטיחות — קונוסים ואביזריהם",        label: "קונוסים ואביזריהם",   icon: "🦺", folder: "cones" },
  { key: "אביזרי בטיחות — מפרדים ועמודים גמישים",   label: "עמודים גמישים",        icon: "🪧", folder: "flexible-posts" },
  { key: "אביזרי בטיחות — עמודי מחסום ועמודי חסימה", label: "עמודי מחסום",          icon: "🛑", folder: "barriers" },
  { key: "אביזרי כבישים",                             label: "אביזרי כבישים",         icon: "🚧", folder: "speed-bumps" },
  { key: "אביזרי חנייה",                              label: "אביזרי חנייה",          icon: "🛞", folder: "parking-stops" },
  { key: "מעקות ומחסומים",                            label: "מעקות ומחסומים",        icon: "🚧", folder: "barriers" },
  { key: "גדרות ותיחום",                              label: "גדרות ותיחום",          icon: "⛽", folder: "other-safety-equipment" },
  { key: "שלטים ושילוט",                              label: "שלטים ושילוט",          icon: "🚦", folder: "signage" },
  { key: "הסדרי תנועה",                               label: "הסדרי תנועה",           icon: "🚐", folder: "other-safety-equipment" },
  { key: "עבודות סימון וצביעה",                       label: "סימון וצביעה",          icon: "🖌️", folder: "road-marking" },
  { key: "הסרת סימון",                                label: "הסרת סימון",            icon: "💧", folder: "road-marking" },
  { key: "גובים ותעלות",                              label: "גובים ותעלות",          icon: "🔌", folder: "cable-covers" },
  { key: "אביזרי בטיחות — נגישות",                   label: "נגישות",                icon: "♿", folder: "other-safety-equipment" },
  { key: "אביזרי בטיחות — כללי",                     label: "אביזרי בטיחות כלליים", icon: "🛡️", folder: "other-safety-equipment" },
];

export function getCategoryIcon(category: string): string {
  const found = SHOWCASE_CATEGORIES.find(c => c.key === category);
  if (found) return found.icon;
  if (category.includes("קונוס")) return "🦺";
  if (category.includes("עמוד")) return "🪧";
  if (category.includes("מחסום") || category.includes("מעקה")) return "🛑";
  if (category.includes("שלט") || category.includes("תמרור")) return "🚦";
  if (category.includes("חניה") || category.includes("חנייה")) return "🛞";
  if (category.includes("כביש") || category.includes("האטה")) return "🚧";
  if (category.includes("סימון")) return "🖌️";
  if (category.includes("גדר")) return "⛽";
  if (category.includes("תנועה")) return "🚐";
  return "🛡️";
}

export type SourceType = "elkayam" | "external" | "manual" | "unknown";

export function getSourceType(metadata?: Record<string, unknown>): SourceType {
  const sources = metadata?.sources as Array<{ type: string }> | undefined;
  const type = sources?.[0]?.type ?? "";
  if (["website", "company_profile", "seed", "existing_catalog"].includes(type)) return "elkayam";
  if (type === "external_supplier_reference") return "external";
  if (type === "manual") return "manual";
  return "unknown";
}

export interface BadgeConfig {
  label: string;
  className: string;
}

export const SOURCE_BADGE: Record<SourceType, BadgeConfig | null> = {
  elkayam:  { label: "אלקיים",      className: "bg-blue-100 text-blue-700 border border-blue-200" },
  external: { label: "מקור חיצוני", className: "bg-amber-100 text-amber-700 border border-amber-200" },
  manual:   { label: "ידני",         className: "bg-gray-100 text-gray-500 border border-gray-200" },
  unknown:  null,
};

export const STATUS_BADGE: Record<"active" | "inactive", BadgeConfig> = {
  active:   { label: "● פעיל",    className: "bg-green-100 text-green-700" },
  inactive: { label: "○ לא פעיל", className: "bg-gray-100 text-gray-500" },
};

export const REVIEW_BADGE: Record<string, BadgeConfig> = {
  needs_review:            { label: "דורש בדיקה",   className: "bg-red-100 text-red-600 border border-red-200" },
  missing_image:           { label: "חסרת תמונה",   className: "bg-orange-100 text-orange-600 border border-orange-200" },
  image_needs_replacement: { label: "תמונה לעדכון", className: "bg-orange-100 text-orange-600 border border-orange-200" },
};

export function resolveProductImage(metadata?: Record<string, unknown>): string | null {
  const images = metadata?.images as Record<string, unknown> | undefined;
  const thumb = images?.thumb as string | undefined;
  const full  = images?.full  as string | undefined;
  return thumb ?? full ?? null;
}

export function resolveDetailImage(metadata?: Record<string, unknown>): string | null {
  const images = metadata?.images as Record<string, unknown> | undefined;
  const full  = images?.full  as string | undefined;
  const thumb = images?.thumb as string | undefined;
  return full ?? thumb ?? null;
}
