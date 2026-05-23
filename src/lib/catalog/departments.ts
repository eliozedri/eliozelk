/**
 * Catalog department taxonomy — the single source of truth for grouping the
 * ~26 raw Hebrew `catalog_items.category` strings into the higher-level
 * departments shown in chat surfaces (JARVIS catalog API + Team Bot).
 *
 * Pure data + mapping only. No DB, no Next, no runtime deps.
 */

export type DepartmentSlug =
  | "road_marking"
  | "traffic_arrangements"
  | "signage"
  | "safety"
  | "barriers"
  | "field_ops"
  | "other";

export type DepartmentDef = {
  slug: DepartmentSlug;
  label: string;
  emoji: string;
  /** Hebrew categories that fall into this department. Order doesn't matter. */
  categories?: string[];
  /** Prefix-match (for the long "אביזרי בטיחות — ..." family). */
  prefixes?: string[];
};

export const DEPARTMENTS: DepartmentDef[] = [
  {
    slug: "road_marking",
    label: "סימון כבישים",
    emoji: "🛣",
    categories: ["עבודות סימון וצביעה", "הסרת סימון"],
  },
  {
    slug: "traffic_arrangements",
    label: "הסדרי תנועה",
    emoji: "🚧",
    categories: ["הסדרי תנועה"],
  },
  {
    slug: "signage",
    label: "שילוט ותמרור",
    emoji: "🪧",
    categories: ["שלטים ושילוט"],
  },
  {
    slug: "safety",
    label: "אביזרי בטיחות",
    emoji: "🦺",
    categories: ["אביזרי חנייה", "אביזרי כבישים", "דיגלונים"],
    prefixes: ["אביזרי בטיחות"],
  },
  {
    slug: "barriers",
    label: "מעקות / גידור / מחסומים",
    emoji: "🧱",
    categories: ["מעקות ומחסומים", "גדרות ותיחום"],
  },
  {
    slug: "field_ops",
    label: "עבודות שטח ולוגיסטיקה",
    emoji: "📝",
    categories: ["עבודות שטח ולוגיסטיקה", "גובים ותעלות"],
  },
  {
    slug: "other",
    label: "אחר",
    emoji: "📋",
    categories: [],
  },
];

/**
 * Map a raw catalog `category` string to a department slug. Falls back to
 * `other` so no active item gets dropped.
 */
export function categoryToDepartment(rawCategory: string): DepartmentSlug {
  const cat = rawCategory.trim();
  for (const d of DEPARTMENTS) {
    if (d.categories?.includes(cat)) return d.slug;
    if (d.prefixes?.some((p) => cat.startsWith(p))) return d.slug;
  }
  return "other";
}

export function findDepartment(slug: string): DepartmentDef | null {
  return DEPARTMENTS.find((d) => d.slug === slug) ?? null;
}
