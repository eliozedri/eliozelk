// High-level routing classifier: decides whether a scanned document belongs to
// the FINANCIAL pipeline (supplier_documents → finance) or is an OPERATIONAL
// vehicle document (license / insurance / test) that lives on the equipment card.
//
// This avoids polluting the financial SupplierDocumentType enum with vehicle
// paperwork: operational docs map onto the existing OperationalDocType and the
// /api/equipment/[id]/document route.

import type { OperationalDocType } from "@/types/equipment";

export type DocumentClass =
  | "financial" // invoice / receipt / delivery note → supplier_documents
  | "vehicle_license" // רישיון רכב
  | "vehicle_insurance" // תעודת ביטוח
  | "vehicle_test" // טסט / מבחן רישוי שנתי
  | "vehicle_maintenance" // מסמך טיפול ללא סימני חשבונית
  | "other";

export interface DocumentClassResult {
  documentClass: DocumentClass;
  confidence: number;
  /** For non-financial vehicle docs: the equipment.documents type to file under. */
  operationalType?: OperationalDocType;
  reason: string;
}

const FINANCIAL_SIGNALS = [
  "חשבונית", "קבלה", "תעודת משלוח", "סה\"כ", 'סה"כ', "מע\"מ", 'מע"מ',
  "לתשלום", "invoice", "receipt", "total", "vat", "ח.פ", "עוסק מורשה",
];

const LICENSE_SIGNALS = ["רישיון רכב", "רשיון רכב", "רישוי רכב", "רישיון נהיגה אינו", "משרד התחבורה", "tofes harishuy", "טופס הרישוי"];
const INSURANCE_SIGNALS = ["תעודת ביטוח", "ביטוח חובה", "ביטוח מקיף", "פוליסה", "פוליסת ביטוח", "מבטח", "insurance policy", "תעודת חובה"];
const TEST_SIGNALS = ["טסט", "מבחן רישוי", "בדיקת רכב", "מכון רישוי", "תקינות הרכב", "roadworthiness"];
const MAINTENANCE_SIGNALS = ["טיפול", "מוסך", "החלפת שמן", "בלמים", "תיקון רכב", "service report", "garage"];

function countHits(lower: string, signals: string[]): number {
  return signals.reduce((n, s) => (lower.includes(s.toLowerCase()) ? n + 1 : n), 0);
}

export function detectDocumentClass(rawText: string): DocumentClassResult {
  const lower = (rawText || "").toLowerCase();

  const financial = countHits(lower, FINANCIAL_SIGNALS);
  const license = countHits(lower, LICENSE_SIGNALS);
  const insurance = countHits(lower, INSURANCE_SIGNALS);
  const test = countHits(lower, TEST_SIGNALS);
  const maintenance = countHits(lower, MAINTENANCE_SIGNALS);

  // Strong vehicle-document markers win over generic financial words only when
  // the document is clearly a certificate (license/insurance/test) — these are
  // rarely invoices. A garage/service doc with invoice markers stays financial.
  if (insurance >= 1 && financial < 2) {
    return { documentClass: "vehicle_insurance", confidence: 0.8, operationalType: "insurance", reason: "זוהו סימני תעודת ביטוח" };
  }
  if (license >= 1 && financial < 2) {
    return { documentClass: "vehicle_license", confidence: 0.8, operationalType: "license", reason: "זוהו סימני רישיון רכב" };
  }
  if (test >= 1 && financial < 2) {
    return { documentClass: "vehicle_test", confidence: 0.75, operationalType: "test", reason: "זוהו סימני טסט / מבחן רישוי" };
  }

  if (financial >= 1) {
    return { documentClass: "financial", confidence: financial >= 2 ? 0.85 : 0.6, reason: "זוהו סימנים כספיים (חשבונית/סכומים/מע\"מ)" };
  }

  if (maintenance >= 1) {
    // Maintenance without invoice markers → operational note on the card.
    return { documentClass: "vehicle_maintenance", confidence: 0.55, operationalType: "technical", reason: "זוהו סימני טיפול/מוסך ללא סימני חשבונית" };
  }

  return { documentClass: "other", confidence: 0.3, operationalType: "other", reason: "לא זוהה סוג מובהק — נדרש סיווג ידני" };
}
