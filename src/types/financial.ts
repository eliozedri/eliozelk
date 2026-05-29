// Financial classification layer — shared across the central financial tables
// (supplier_documents / expense_records). Every financial document lives in
// those tables; these enums classify it. No separate per-department tables.

import type { SupplierDocumentType } from "@/types/supplierDocument";

// ── Where the document entered the system ─────────────────────────────────────
export type UploadSource =
  | "general_scan"   // לשונית "סריקת מסמך" הכללית
  | "fleet"          // מתוך "צי רכב ומכונות"
  | "finance"        // הועלה ישירות בהנהלת חשבונות
  | "maintenance"    // צורף לטיפול
  | "parts"          // צורף לחלקים
  | "manual"         // הוזן ידנית
  | "other";

export const UPLOAD_SOURCE_LABELS: Record<UploadSource, string> = {
  general_scan: "סריקת מסמך",
  fleet:        "צי רכב ומכונות",
  finance:      "הנהלת חשבונות",
  maintenance:  "טיפול",
  parts:        "חלקים",
  manual:       "הזנה ידנית",
  other:        "אחר",
};

// ── Business area the expense belongs to ──────────────────────────────────────
export type BusinessArea =
  | "fleet"         // צי רכב ומכונות
  | "production"    // ייצור וחיתוך
  | "road_marking"  // סימון כבישים
  | "management"    // הנהלה
  | "warehouse"     // מחסן
  | "project"       // פרויקט
  | "general"       // כללי
  | "other";

export const BUSINESS_AREA_LABELS: Record<BusinessArea, string> = {
  fleet:        "צי רכב ומכונות",
  production:   "ייצור וחיתוך",
  road_marking: "סימון כבישים",
  management:   "הנהלה",
  warehouse:    "מחסן",
  project:      "פרויקט",
  general:      "כללי",
  other:        "אחר",
};

// ── Expense type (what the money was spent on) ────────────────────────────────
export type ExpenseType =
  | "maintenance"    // טיפול / מוסך
  | "spare_parts"    // חלקי חילוף
  | "fuel"           // דלק
  | "insurance"      // ביטוח
  | "test"           // טסט / רישוי
  | "equipment"      // ציוד
  | "raw_materials"  // חומרי גלם
  | "services"       // שירותים
  | "upkeep"         // אחזקה
  | "rent"           // שכירות
  | "electricity"    // חשמל
  | "communications" // תקשורת
  | "external_labor" // עבודה חיצונית
  | "general"        // הוצאה כללית
  | "other";         // אחר

export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  maintenance:    "טיפול / מוסך",
  spare_parts:    "חלקי חילוף",
  fuel:           "דלק",
  insurance:      "ביטוח",
  test:           "טסט / רישוי",
  equipment:      "ציוד",
  raw_materials:  "חומרי גלם",
  services:       "שירותים",
  upkeep:         "אחזקה",
  rent:           "שכירות",
  electricity:    "חשמל",
  communications: "תקשורת",
  external_labor: "עבודה חיצונית",
  general:        "הוצאה כללית",
  other:          "אחר",
};

export const EXPENSE_TYPE_ORDER: ExpenseType[] = [
  "maintenance", "spare_parts", "fuel", "insurance", "test", "equipment",
  "raw_materials", "services", "upkeep", "rent", "electricity",
  "communications", "external_labor", "general", "other",
];

// ── Heuristic expense-type suggestion from free text ──────────────────────────
// Returns null when no confident match — the caller must then mark the document
// requires_classification and ASK the user (never silently guess).
const EXPENSE_TYPE_KEYWORDS: Array<{ type: ExpenseType; words: string[] }> = [
  { type: "fuel",           words: ["דלק", "סולר", "בנזין", "תדלוק", "fuel", "diesel"] },
  { type: "insurance",      words: ["ביטוח", "פוליסה", "insurance"] },
  { type: "test",           words: ["טסט", "רישוי", "רישיון", "מבחן רכב", "test", "license"] },
  { type: "maintenance",    words: ["טיפול", "מוסך", "תיקון", "מכונאי", "garage", "service"] },
  { type: "spare_parts",    words: ["חלק", "חלפים", "חלקי חילוף", "צמיג", "מסנן", "spare", "parts"] },
  { type: "raw_materials",  words: ["חומר גלם", "ויניל", "צבע", "פלסטיק", "מדבקה", "יריעה"] },
  { type: "rent",           words: ["שכירות", "שכ\"ד", "rent", "lease"] },
  { type: "electricity",    words: ["חשמל", "electric", "מונה"] },
  { type: "communications", words: ["טלפון", "סלולר", "אינטרנט", "תקשורת", "phone", "internet"] },
  { type: "external_labor", words: ["קבלן", "קבלן משנה", "עבודה חיצונית", "subcontractor"] },
];

export function suggestExpenseType(text: string | null | undefined): ExpenseType | null {
  if (!text) return null;
  const t = text.toLowerCase();
  for (const { type, words } of EXPENSE_TYPE_KEYWORDS) {
    if (words.some(w => t.includes(w.toLowerCase()))) return type;
  }
  return null;
}

// Whether a document type is financial (creates/relates to an expense).
export const FINANCIAL_DOCUMENT_TYPES: SupplierDocumentType[] = [
  "supplier_invoice", "tax_invoice", "invoice_receipt", "receipt", "delivery_note", "goods_receipt",
];
