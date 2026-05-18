// Hebrew + English OCR text parser — deterministic regex extraction for invoice fields.
// Returns partial results on low confidence; never throws.

import { classifyDocumentType } from "./classification";
import type { SupplierDocumentType } from "@/types/supplierDocument";
import type { ExtractedHeader, ExtractedLine } from "./ocrAdapter";

export interface ParseResult {
  header: ExtractedHeader;
  lines: ExtractedLine[];
}

// ── Field extractors ──────────────────────────────────────────────────────────

function extractVatNumber(text: string): string {
  const patterns = [
    // Hebrew prefixes: ח.פ, ע.מ, עוסק מורשה, מס' עוסק
    /(?:ח["״.]?פ["״.]?|ע["״.]?מ["״.]?|עוסק\s*מורש[תה]?|מס['ײ]?\s*עוסק)[:\s#]*(\d[\d\-]{6,11})/,
    // English prefixes
    /(?:vat|company|reg(?:istration)?|bn)[.\s#:]*(\d{7,12})/i,
    // Bare 9-digit number (Israeli company number)
    /\b(\d{9})\b/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].replace(/\D/g, "");
  }
  return "";
}

function extractDocumentNumber(text: string): string {
  const patterns = [
    /(?:חשבונית|תעודה|מסמך|מספר|מס['ײ]?)[:\s#]*(\d[\d\-\/]{1,20})/,
    /(?:invoice|receipt|doc(?:ument)?|no|number)[.:\s#]*(\d[\d\-\/]{1,20})/i,
    /\bno[.]\s*(\d[\d\-\/]{1,20})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return "";
}

function extractDate(text: string): string | undefined {
  // DD/MM/YYYY or DD.MM.YYYY → YYYY-MM-DD
  const ilMatch = text.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);
  if (ilMatch) {
    const d = ilMatch[1].padStart(2, "0");
    const mo = ilMatch[2].padStart(2, "0");
    const yr = ilMatch[3];
    if (parseInt(mo) >= 1 && parseInt(mo) <= 12) return `${yr}-${mo}-${d}`;
  }
  // ISO YYYY-MM-DD
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];
  return undefined;
}

function extractAmount(text: string, keywords: string[]): number | undefined {
  for (const kw of keywords) {
    const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = text.match(new RegExp(`${esc}[:\\s]*([\\d,]+(?:\\.\\d{1,2})?)`, "i"));
    if (m) {
      const n = parseFloat(m[1].replace(/,/g, ""));
      if (!isNaN(n) && n > 0) return n;
    }
  }
  return undefined;
}

function extractSupplierName(text: string): string {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  // Skip numeric lines, dates, very short/long lines; prefer Hebrew
  for (const line of lines.slice(0, 10)) {
    if (/^\d+$/.test(line)) continue;
    if (/^\d{1,2}[\/.]/.test(line)) continue;
    if (line.length < 3 || line.length > 80) continue;
    if (/[֐-׿]/.test(line)) return line;
  }
  return lines.find(l => l.length >= 3) ?? "";
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseOcrText(rawText: string): ParseResult {
  const classification = classifyDocumentType(rawText);

  const vatNumber = extractVatNumber(rawText);
  const documentNumber = extractDocumentNumber(rawText);
  const documentDate = extractDate(rawText);
  const supplierName = extractSupplierName(rawText);

  const currency = /\$|USD/i.test(rawText) ? "USD" : /€|EUR/i.test(rawText) ? "EUR" : "ILS";

  const totalAfterVat = extractAmount(rawText, [
    'סה"כ לתשלום', 'סה"כ כולל מע"מ', 'לתשלום', 'סכום לתשלום',
    "total due", "amount due", "total payable", "total",
  ]);
  const vatAmount = extractAmount(rawText, [
    'מע"מ', "מס ערך מוסף", "vat", "tax",
  ]);
  const subtotalBeforeVat = extractAmount(rawText, [
    'סה"כ לפני מע"מ', "subtotal", "before vat", "לפני מס",
  ]);

  // Confidence: baseline + bonuses per extracted field
  let confidence = 0.3;
  if (vatNumber)            confidence += 0.15;
  if (documentNumber)       confidence += 0.15;
  if (documentDate)         confidence += 0.10;
  if (totalAfterVat != null) confidence += 0.15;
  if (supplierName)         confidence += 0.10;
  confidence = Math.min(confidence, 0.95);

  const missing: string[] = [];
  if (!vatNumber)            missing.push("מס׳ עוסק לא נמצא");
  if (!documentNumber)       missing.push("מספר מסמך לא נמצא");
  if (!documentDate)         missing.push("תאריך לא נמצא");
  if (totalAfterVat == null) missing.push("סכום לא נמצא");

  return {
    header: {
      documentType: classification.type as SupplierDocumentType,
      supplierName,
      supplierVat: vatNumber,
      documentNumber,
      documentDate,
      currency,
      subtotalBeforeVat,
      vatAmount,
      totalAfterVat,
      confidence,
      notes: missing.length > 0 ? missing.join("; ") : "OCR הושלם — יש לאמת נתונים",
    },
    lines: [], // Line-level extraction left for manual review
  };
}
