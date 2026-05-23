/**
 * SAMPLE PRODUCT FIXTURE — used by every design-lab variant.
 * One product so the user compares design language, not data.
 *
 * No image — /catalog/transparent/ is empty.
 * Each variant renders its own product representation
 * (silhouette, emoji, abstract block) appropriate to its aesthetic.
 */

export interface LabProduct {
  id: string;
  title: string;
  category: string;
  description: string;
  specs: { label: string; value: string }[];
  metrics: { label: string; value: number | string }[];
  tags: string[];
  status: "active";
  unit: string;
  inventoryLabel: string;
  /** Iconographic fallback — large emoji each variant may use */
  emoji: string;
  /** ID-style code for terminal/CAD variants */
  code: string;
}

export const SAMPLE_PRODUCT: LabProduct = {
  id: "speed-bump-70",
  title: "פס האטה גומי 70 ס״מ",
  category: "אביזרי כבישים",
  description:
    "פס האטה מגומי כבד, ייצור מודולרי בהתאם לתקן ישראלי. עמיד UV, בליטות זוהרות, מתאים לחניונים, מפעלים וכניסות מבנים.",
  specs: [
    { label: "חומר", value: "גומי ממוחזר" },
    { label: "ממדים", value: "500×350×50 מ״מ" },
    { label: "עומס מקסימלי", value: "70 טון" },
    { label: "עמידות UV", value: "כן" },
  ],
  metrics: [
    { label: "במלאי", value: 158 },
    { label: "מוזמן", value: 15 },
    { label: "ייצור", value: 19 },
    { label: "סה״כ", value: 329 },
  ],
  tags: ["Advanced Marking Solutions", "ייצור עצמי"],
  status: "active",
  unit: "יחידה",
  inventoryLabel: "מלאי תקין",
  emoji: "🟨",
  code: "EK-SB-70-RBR",
};

/** Other carousel items — placeholder strip, never the focus */
export const SAMPLE_STRIP: { id: string; emoji: string; code: string }[] = [
  { id: "cones",        emoji: "🚧", code: "EK-CN-70" },
  { id: "cat-eyes",     emoji: "👁️", code: "EK-CE-12" },
  { id: "barrier",      emoji: "🟥", code: "EK-JB-200" },
  { id: "arrow-board",  emoji: "➡️", code: "EK-AB-LED" },
  { id: "speed-bump",   emoji: "🟨", code: "EK-SB-70" },
  { id: "sign",         emoji: "🛑", code: "EK-T31" },
  { id: "marker",       emoji: "🔆", code: "EK-FL-AMB" },
  { id: "rail",         emoji: "🚂", code: "EK-RL-1M" },
  { id: "thermo",       emoji: "🟧", code: "EK-TP-KIT" },
];
