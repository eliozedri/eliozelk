// Document type classification and category suggestion engine.
// Uses keyword matching on Hebrew and English text.
// No external AI dependency — fully local.

import type { SupplierDocumentType, InventoryLineAction } from "@/types/supplierDocument";

// ── Document type signals ─────────────────────────────────────────────────────

const TYPE_SIGNALS: Array<{ type: SupplierDocumentType; keywords: string[] }> = [
  {
    type: "invoice_receipt",
    keywords: ["חשבונית מס/קבלה", "חשבונית מס קבלה", "חשבונית/קבלה", "invoice receipt"],
  },
  {
    type: "tax_invoice",
    keywords: ["חשבונית מס", "חשבונית מע\"מ", "tax invoice", "vat invoice"],
  },
  {
    type: "goods_receipt",
    keywords: ["תעודת קבלת סחורה", "קבלת סחורה", "goods receipt", "receiving report"],
  },
  {
    type: "delivery_note",
    keywords: ["תעודת משלוח", "תעודת הובלה", "delivery note", "packing list", "delivery order"],
  },
  {
    type: "supplier_order_confirmation",
    keywords: ["אישור הזמנה", "אישור הצעה", "order confirmation", "po confirmation"],
  },
  {
    type: "supplier_quote",
    keywords: ["הצעת מחיר", "הצעה", "quotation", "quote", "offer", "견적서"],
  },
  {
    type: "receipt",
    keywords: ["קבלה", "receipt", "payment receipt"],
  },
  {
    type: "supplier_invoice",
    keywords: ["חשבונית עסקה", "חשבונית", "invoice", "faktura", "فاتورة"],
  },
];

export function classifyDocumentType(text: string): {
  type: SupplierDocumentType;
  confidence: number;
} {
  const lower = text.toLowerCase();

  for (const signal of TYPE_SIGNALS) {
    for (const kw of signal.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return { type: signal.type, confidence: 0.85 };
      }
    }
  }

  return { type: "unknown", confidence: 0.2 };
}

// ── Category classification ───────────────────────────────────────────────────

const CATEGORY_SIGNALS: Array<{ category: string; keywords: string[] }> = [
  {
    category: "תמרורים ושלטים",
    keywords: [
      "תמרור", "שלט", "eg ", "egp", "diamond grade", "high intensity",
      "יהלום", "רב עוצמה", "3m", "oralite", "סרט חישוקים", "לוחית",
      "sign blank", "sign face",
    ],
  },
  {
    category: "מדבקות / ויניל / חומר מחזיר אור",
    keywords: [
      "מחזיר אור", "ויניל", "vinyl", "reflexite", "reflective",
      "scotchlite", "foil", "פויל", "מדבקה", "sticker", "decal",
    ],
  },
  {
    category: "צבעים וחומרי סימון כבישים",
    keywords: [
      "צבע", "paint", "מדלל", "thinner", "solvent", "primer",
      "road marking paint", "צבע כביש", "צבע סמן",
    ],
  },
  {
    category: "פלסטיק קר / תרמופלסטי / דו רכיבי",
    keywords: [
      "תרמופלסטי", "thermoplastic", "פלסטיק קר", "cold plastic",
      "דו רכיבי", "two component", "2c", "מקשה", "preform",
    ],
  },
  {
    category: "אביזרי בטיחות",
    keywords: [
      "קונוס", "cone", "עמוד גמיש", "delineator", "עין חתול",
      "cat eye", "פנס הבהוב", "flashing light", "אביזר בטיחות",
    ],
  },
  {
    category: "ציוד הסדרי תנועה",
    keywords: [
      "הסדרי תנועה", "traffic", "כניסה לכביש", "תמרור הכוונה",
      "arrow board", "משולש", "warning triangle",
    ],
  },
  {
    category: "מחסומים / מעקות / גידור",
    keywords: [
      "מחסום", "barrier", "מעקה", "guardrail", "גידור", "fence",
      "חומת ג׳רסי", "jersey", "water filled",
    ],
  },
  {
    category: "חלקי חילוף ותחזוקת מכונות",
    keywords: [
      "חלק חילוף", "spare part", "תחזוקה", "maintenance",
      "חלקים", "parts", "מכונה", "machine",
    ],
  },
  {
    category: "כלי עבודה וציוד מפעל",
    keywords: [
      "כלי עבודה", "tool", "ציוד מפעל", "workshop",
      "drill", "מקדח", "מפתח", "wrench", "grinder", "משחזת",
    ],
  },
  {
    category: "צי רכב / טיפולים / דלק",
    keywords: [
      "טיפול", "service", "מוסך", "garage", "שמן", "oil",
      "בלמים", "brakes", "צמיג", "tire", "tyre", "דלק", "fuel",
      "diesel", "petrol", "תיקון", "repair", "vehicle",
    ],
  },
  {
    category: "צמ״ה / מלגזות / גנרטורים",
    keywords: [
      "מלגזה", "forklift", "גנרטור", "generator", "צמ\"ה",
      "excavator", "חפירה", "loader",
    ],
  },
  {
    category: "שירותי קבלן משנה",
    keywords: [
      "קבלן", "subcontractor", "שכר עבודה", "labor", "עבודה",
      "ביצוע", "installation", "התקנה",
    ],
  },
  {
    category: "הוצאות משרדיות",
    keywords: [
      "משרד", "office", "נייר", "paper", "מדפסת", "printer",
      "דיו", "ink", "ריהוט", "furniture", "ניייר כתיבה",
    ],
  },
  {
    category: "חומרי גלם לייצור שילוט",
    keywords: [
      "אלומיניום", "aluminum", "aluminium", "פח", "sheet",
      "profile", "פרופיל", "extrusion", "מסגרת", "frame",
    ],
  },
];

export function suggestCategory(description: string): {
  category: string;
  confidence: number;
} {
  const lower = description.toLowerCase();
  for (const sig of CATEGORY_SIGNALS) {
    for (const kw of sig.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return { category: sig.category, confidence: 0.75 };
      }
    }
  }
  return { category: "לא מסווג / דורש בדיקה", confidence: 0.1 };
}

// ── Inventory action classification ──────────────────────────────────────────

const SERVICE_KEYWORDS = [
  "שירות", "service", "עבודה", "labor", "תיקון", "repair",
  "ייעוץ", "consulting", "הובלה", "shipping", "freight",
  "שכירות", "rent", "rental", "ביטוח", "insurance",
  "חשמל", "electricity", "מים", "water", "gas", "גז",
  "תקשורת", "communication", "אינטרנט", "internet",
  "ניקיון", "cleaning", "שמירה", "security",
];

const MAINTENANCE_KEYWORDS = [
  "טיפול", "service", "שמן", "oil", "דלק", "fuel",
  "צמיג", "tire", "tyre", "בלמים", "brakes",
  "מוסך", "garage", "רכב", "vehicle", "תחזוקה", "maintenance",
];

const ASSET_KEYWORDS = [
  "מכונה", "machine", "ציוד", "equipment", "גנרטור", "generator",
  "מלגזה", "forklift", "רכב", "vehicle", "מחשב", "computer",
  "מדפסת", "printer", "מצלמה", "camera",
];

const INVENTORY_KEYWORDS = [
  "תמרור", "שלט", "קונוס", "cone", "מחסום", "barrier",
  "ויניל", "vinyl", "צבע", "paint", "תרמופלסטי", "thermoplastic",
  "מחזיר אור", "reflective", "אלומיניום", "aluminum",
  "עין חתול", "פרופיל", "profile", "פח", "sheet",
  "כדורית", "מעקה", "guardrail",
];

export function suggestInventoryAction(
  description: string,
  category: string
): { action: InventoryLineAction; confidence: number } {
  const text = `${description} ${category}`.toLowerCase();

  for (const kw of SERVICE_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) {
      return { action: "service_only", confidence: 0.7 };
    }
  }

  for (const kw of MAINTENANCE_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) {
      return { action: "maintenance_expense", confidence: 0.7 };
    }
  }

  for (const kw of ASSET_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) {
      return { action: "asset_purchase", confidence: 0.6 };
    }
  }

  for (const kw of INVENTORY_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) {
      return { action: "increase_stock", confidence: 0.65 };
    }
  }

  return { action: "requires_review", confidence: 0.2 };
}

// ── Unit normalization ────────────────────────────────────────────────────────

const UNIT_MAP: Record<string, string> = {
  "יח'": "יחידה",
  'יח"': "יחידה",
  "יחידות": "יחידה",
  "יח": "יחידה",
  "pcs": "יחידה",
  "pc": "יחידה",
  "unit": "יחידה",
  'מ"א': "מטר",
  "ml": "מטר",
  "meter": "מטר",
  'מ"ר': "מ\"ר",
  "sqm": "מ\"ר",
  'm2': "מ\"ר",
  'ק"ג': "ק\"ג",
  "kg": "ק\"ג",
  "kilogram": "ק\"ג",
  "ltr": "ליטר",
  "liter": "ליטר",
  "litre": "ליטר",
  "gallon": "גלון",
  "gal": "גלון",
  "ton": "טון",
  "tonne": "טון",
  "set": "סט",
  "pair": "זוג",
  "זוגות": "זוג",
  "pack": "חבילה",
  "box": "ארגז",
  "pallet": "משטח",
  "day": "יום",
  "hour": "שעה",
  "hr": "שעה",
  "roll": "גליל",
  "bucket": "דלי",
  "bag": "שק",
  "complete": "קומפלט",
};

export function normalizeUnit(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim().toLowerCase();
  return UNIT_MAP[trimmed] ?? raw.trim();
}
