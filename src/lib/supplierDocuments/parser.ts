// Hebrew + English OCR text parser — deterministic extraction for invoice headers and line items.
// Best-effort: returns fewer lines with warnings rather than inventing data.
// Never throws; returns partial results on low confidence.

import { classifyDocumentType, normalizeUnit } from "./classification";
import type { SupplierDocumentType } from "@/types/supplierDocument";
import type { ExtractedHeader, ExtractedLine } from "./ocrAdapter";

export interface VehicleFields {
  plateNumber?: string;       // מספר רכב / רישוי
  chassisNumber?: string;     // מספר שלדה / VIN
  licenseValidUntil?: string; // תוקף רישיון (YYYY-MM-DD)
  insuranceValidUntil?: string; // תוקף ביטוח (YYYY-MM-DD)
  mileage?: number;           // קילומטראז'
}

export interface ParseResult {
  header: ExtractedHeader;
  lines: ExtractedLine[];
  /** Vehicle-document fields (present only when something was detected). */
  vehicle?: VehicleFields;
  /** Per-field human-verification warnings (e.g. invalid VAT check digit). */
  fieldWarnings?: string[];
  /** Whether the extracted VAT/company number passed the Israeli check digit. */
  vatValid?: boolean;
}

// ── Israeli ID / company-number (ח.פ / עוסק מורשה / ת.ז) check digit ──────────
// Same algorithm for personal IDs and company numbers: weighted mod-10.

export function isValidIsraeliId(raw: string): boolean {
  const s = (raw || "").replace(/\D/g, "");
  if (s.length < 5 || s.length > 9) return false;
  const padded = s.padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const factor = (i % 2) + 1; // 1,2,1,2,...
    let inc = Number(padded[i]) * factor;
    if (inc > 9) inc -= 9;
    sum += inc;
  }
  return sum % 10 === 0;
}

// ── OCR character correction ──────────────────────────────────────────────────

function fixOcrDigits(s: string): string {
  // Replace common OCR mistakes only when flanked by digits or punctuation
  return s
    .replace(/(?<=[\d,.])O(?=[\d,.])/g, "0")
    .replace(/(?<=[\d,.])[lI](?=[\d,.])/g, "1")
    .replace(/(?<=[\d,.])B(?=[\d,.])/g, "8");
}

// ── Number parsing ────────────────────────────────────────────────────────────

export function parseNumber(raw: string): number | undefined {
  let s = raw
    .replace(/[₪\s]/g, "")
    .replace(/ש["'״]?ח/g, ""); // Remove ש"ח currency label
  s = fixOcrDigits(s);
  if (!s || !/\d/.test(s)) return undefined;

  // Detect Israeli (1,234.56) vs European (1.234,56) format
  const hasComma = s.includes(",");
  const hasDot   = s.includes(".");

  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // European: last delimiter is comma → comma is decimal
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // Israeli: last delimiter is dot → comma is thousands
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      // Decimal comma: 1234,56
      s = s.replace(",", ".");
    } else {
      // Thousands comma: 1,234
      s = s.replace(/,/g, "");
    }
  }

  const n = parseFloat(s);
  return isNaN(n) || n < 0 ? undefined : n;
}

// ── Row skip / header patterns ────────────────────────────────────────────────

const SKIP_ROW = [
  /^(?:סה["״]?כ|סך הכל|סכום)/,
  /^(?:מע["״]?מ|מסמ|מס ערך|מע מ)/,
  /^(?:כולל מע|כולל מ|incl)/i,
  /^(?:לתשלום|amount due|total due|balance due|payment)/i,
  /^(?:הנחה|discount|rebate)/i,
  /^(?:יתרה|balance|carry forward)/i,
  /^(?:total|subtotal|grand total|net total)/i,
  /^(?:vat|tax|gst)\b/i,
  /^(?:תאריך|date)[\s:]/i,
  /^(?:ספק|supplier|vendor|מוכר)[\s:]/i,
  /^(?:מספר|number|no)[\s:.#]/i,
  /^(?:חשבונית|invoice|receipt)\s+(?:מס|no|#|\d)/i,
  /^(?:שם|name|customer|לקוח)[\s:]/i,
  /^(?:כתובת|address)[\s:]/i,
  /^(?:ח[".']?פ|ע[".']?מ|vat\s+no|ח\.פ)/i,
  /^(?:הובלה|delivery charge|shipping|freight)\s*$/i,
  /^-{3,}$/, // separator lines
  /^={3,}$/,
];

const HEADER_KEYWORDS = [
  /(?:תיאור|פריט|description|item\b)/i,
  /(?:כמות|qty|quantity)/i,
  /(?:מחיר|price)/i,
  /(?:סה["״]?כ|total)/i,
  /(?:מק["״]?ט|sku|catalog)/i,
];

function isSkipRow(line: string): boolean {
  return SKIP_ROW.some(p => p.test(line.trim()));
}

function isHeaderRow(line: string): boolean {
  return HEADER_KEYWORDS.filter(p => p.test(line)).length >= 2;
}

// ── Unit detection ────────────────────────────────────────────────────────────

const UNIT_RE = new RegExp(
  [
    "יח['\"״]?",       // יח' יח"
    "יחידות?",
    'מ["\'״]?[אר]',    // מ"א  מ"ר
    'ק["\'״]?ג',       // ק"ג
    "ליטר|לטר",
    "גליל|גל'",
    "חבילה|חב'",
    "שק",
    "דלי",
    "ארגז",
    "שעה|שע'",
    "יום",
    "סט",
    "זוג",
    "משטח",
    "pcs?\\b",
    "pc\\b",
    "kg\\b",
    "ltr?\\b",
    "liter\\b|litre\\b",
    "m2\\b|sqm\\b",
    "ton(?:ne)?\\b",
    "unit\\b",
    "hour\\b",
    "day\\b",
    "roll\\b",
    "bag\\b",
    "box\\b",
    "set\\b",
  ].join("|"),
  "i"
);

// ── Number token extraction ───────────────────────────────────────────────────

const NUM_RE = /\d+(?:[,.]\d+)*/g;

function extractNumbers(text: string): number[] {
  const fixed = fixOcrDigits(text);
  const matches = fixed.match(NUM_RE) ?? [];
  return matches
    .map(m => parseNumber(m))
    .filter((n): n is number => n !== undefined && n > 0);
}

// ── Consistency check ─────────────────────────────────────────────────────────

function isConsistent(qty: number | undefined, price: number, total: number): boolean {
  const base = qty !== undefined ? qty * price : price;
  return Math.abs(base - total) / total < 0.11; // 11% tolerance: rounding + small discounts
}

// ── Line item extractor ───────────────────────────────────────────────────────

function extractLines(rawText: string): ExtractedLine[] {
  const textLines = rawText.split(/\n/).map(l => l.trim()).filter(l => l.length >= 4);
  const results: ExtractedLine[] = [];
  let lineNumber = 1;

  for (const line of textLines) {
    if (isSkipRow(line)) continue;
    if (isHeaderRow(line)) continue;

    const allNumbers = extractNumbers(line);
    if (allNumbers.length < 2) continue;

    // Strip numbers and unit tokens to get description
    const descRaw = line
      .replace(NUM_RE, " ")
      .replace(UNIT_RE, " ")
      .replace(/[₪:;,()\[\]{}|\\\/\-+]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (descRaw.length < 2) continue;
    if (isSkipRow(descRaw)) continue;
    if (/^[\d\s.,'"%]+$/.test(descRaw)) continue; // pure-numeric residue

    // Detect unit label
    const unitMatch = line.match(UNIT_RE);
    const unitRaw = unitMatch ? unitMatch[0] : "";
    const unitOfMeasure = normalizeUnit(unitRaw) || "יחידה";

    let quantity: number | undefined;
    let unitPrice: number | undefined;
    let lineTotal: number | undefined;
    let consistent = false;
    const warnings: string[] = [];

    // ── Assignment strategy ───────────────────────────────────────────────────
    // Priority: unit-position split (most reliable) → positional LTR → value search

    if (unitMatch?.index !== undefined) {
      // Unit label found: numbers before it = qty, numbers after it = [price, total]
      const beforeUnit = line.slice(0, unitMatch.index);
      const afterUnit  = line.slice(unitMatch.index + unitMatch[0].length);
      const qtyNums   = extractNumbers(beforeUnit);
      const priceNums = extractNumbers(afterUnit);

      if (qtyNums.length > 0 && priceNums.length >= 1) {
        quantity  = qtyNums[qtyNums.length - 1];
        lineTotal = priceNums[priceNums.length - 1];
        unitPrice = priceNums.length >= 2 ? priceNums[priceNums.length - 2] : undefined;
        consistent = isConsistent(quantity, unitPrice ?? lineTotal, lineTotal);
        if (!consistent) warnings.push('חישוב שורה אינו עקבי: כמות × מחיר ≠ סה"כ — יש לאמת');
      } else {
        // Unit found but can't split well — fall through to positional
        lineTotal = allNumbers[allNumbers.length - 1];
        unitPrice = allNumbers.length >= 2 ? allNumbers[allNumbers.length - 2] : undefined;
        quantity  = allNumbers.length >= 3 ? allNumbers[allNumbers.length - 3] : undefined;
        consistent = isConsistent(quantity, unitPrice ?? lineTotal, lineTotal);
      }
    } else {
      // No unit label: use positional LTR order (most common column order in Israeli invoices)
      // Columns: description | qty | unit_price | total
      lineTotal = allNumbers[allNumbers.length - 1];
      unitPrice = allNumbers.length >= 2 ? allNumbers[allNumbers.length - 2] : undefined;
      quantity  = allNumbers.length >= 3 ? allNumbers[allNumbers.length - 3] : undefined;
      consistent = isConsistent(quantity, unitPrice ?? lineTotal, lineTotal);

      if (!consistent && allNumbers.length >= 3) {
        // Try value-consistency search as fallback
        const sorted = [...allNumbers].sort((a, b) => b - a);
        const total2 = sorted[0];
        const rest   = sorted.slice(1);
        let found = false;
        outer:
        for (let i = 0; i < rest.length; i++) {
          for (let j = i + 1; j < rest.length; j++) {
            if (isConsistent(rest[j], rest[i], total2)) {
              // Keep positional roles: don't swap qty/price arbitrarily
              lineTotal = total2;
              unitPrice = rest[i];
              quantity  = rest[j];
              consistent = true;
              found = true;
              break outer;
            }
          }
        }
        if (!found) {
          warnings.push('חישוב שורה אינו עקבי: כמות × מחיר ≠ סה"כ — יש לאמת');
        }
      }
    }

    // Confidence scoring
    let confidence = 0.35;
    if (consistent)            confidence += 0.35;
    if (quantity !== undefined) confidence += 0.10;
    if (/[֐-׿]/.test(descRaw)) confidence += 0.10; // Hebrew content
    if (unitRaw)               confidence += 0.05;
    confidence = Math.min(confidence, 0.88);

    results.push({
      lineNumber: lineNumber++,
      originalDescription: descRaw,
      supplierSku: "",
      quantity,
      unitOfMeasure,
      unitPrice,
      lineTotal,
      confidence,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  }

  return results;
}

// ── Header field extractors ───────────────────────────────────────────────────

function extractVatNumber(text: string): string {
  const patterns = [
    /(?:ח["״.]?פ["״.]?|ע["״.]?מ["״.]?|עוסק\s*מורש[תה]?|מס['ײ]?\s*עוסק)[:\s#]*(\d[\d\-]{6,11})/,
    /(?:vat|company|reg(?:istration)?|bn)[.\s#:]*(\d{7,12})/i,
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
    // Hebrew: keyword then digit-led value
    /(?:חשבונית|תעודה|מסמך|מספר|מס['ײ]?)[:\s#]*(\d[\d\-\/]{1,20})/g,
    // "Invoice No: INV-2026-001" or "Invoice: 12345" — absorbs optional "No" into the lead
    /(?:invoice|receipt|doc(?:ument)?)\s*(?:no\.?)?\s*[:\s]+([A-Z0-9][\w\-\/]{1,20})/gi,
    // "No: INV-123" or "No. 123" — requires colon/dot, so "no numbers" never matches
    /\bno[.:]\s*([A-Z0-9][\w\-\/]{1,20})/gi,
  ];
  for (const p of patterns) {
    for (const m of text.matchAll(p)) {
      const v = m[1].trim();
      if (/\d/.test(v)) return v;
    }
  }
  return "";
}

function extractDate(text: string): string | undefined {
  // DD/MM/YYYY or DD.MM.YYYY → YYYY-MM-DD
  const il = text.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);
  if (il) {
    const d  = il[1].padStart(2, "0");
    const mo = il[2].padStart(2, "0");
    const yr = il[3];
    if (parseInt(mo) >= 1 && parseInt(mo) <= 12) return `${yr}-${mo}-${d}`;
  }
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return undefined;
}

// Per-line keyword search so "מע"מ" doesn't match inside "לפני מע"מ: 1450"
function extractAmount(text: string, keywords: string[]): number | undefined {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  for (const kw of keywords) {
    const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Keyword must be at the START of the trimmed line (after optional leading symbols/spaces)
    const re = new RegExp(`^(?:[^֐-׿a-z]*)?${esc}[:\\s]*([\\d,]+(?:\\.\\d{1,2})?)`, "i");
    for (const line of lines) {
      const m = line.match(re);
      if (m) {
        const n = parseNumber(m[1]);
        if (n != null && n > 0) return n;
      }
    }
  }
  return undefined;
}

function extractSupplierName(text: string): string {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 10)) {
    if (/^\d+$/.test(line)) continue;
    if (/^\d{1,2}[\/.]/.test(line)) continue;
    if (line.length < 3 || line.length > 80) continue;
    if (/[֐-׿]/.test(line)) return line;
  }
  return lines.find(l => l.length >= 3) ?? "";
}

// ── Vehicle document field extractors ─────────────────────────────────────────

function normalizeDate(d: string, mo: string, yr: string): string | undefined {
  const dd = d.padStart(2, "0");
  const mm = mo.padStart(2, "0");
  let yyyy = yr;
  if (yyyy.length === 2) yyyy = (Number(yyyy) > 50 ? "19" : "20") + yyyy;
  if (parseInt(mm) < 1 || parseInt(mm) > 12) return undefined;
  return `${yyyy}-${mm}-${dd}`;
}

// Find a date that appears on a line containing any of the keywords.
function findDateNear(text: string, keywords: string[]): string | undefined {
  const lines = text.split(/\n/);
  for (const line of lines) {
    const low = line.toLowerCase();
    if (!keywords.some(k => low.includes(k.toLowerCase()))) continue;
    const m = line.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
    if (m) {
      const norm = normalizeDate(m[1], m[2], m[3]);
      if (norm) return norm;
    }
  }
  return undefined;
}

function extractPlateNumber(text: string): string | undefined {
  // Keyword-anchored first (most reliable)
  const kw = text.match(
    /(?:מספר\s*רכב|מס['׳]?\s*רכב|מספר\s*רישוי|מס['׳]?\s*רישוי|לוחית\s*זיהוי|מ\.?ר\.?)[:\s]*([0-9]{2,3}[-\s]?[0-9]{2,3}[-\s]?[0-9]{2,3})/
  );
  if (kw) {
    const digits = kw[1].replace(/\D/g, "");
    if (digits.length === 7 || digits.length === 8) return digits;
  }
  // Bare Israeli plate patterns: 12-345-67 / 123-45-678 / 12-345-678
  const bare = text.match(/\b(\d{2,3}[-]\d{2,3}[-]\d{2,3})\b/);
  if (bare) {
    const digits = bare[1].replace(/\D/g, "");
    if (digits.length === 7 || digits.length === 8) return digits;
  }
  return undefined;
}

function extractChassisNumber(text: string): string | undefined {
  const kw = text.match(/(?:מספר\s*שלדה|מס['׳]?\s*שלדה|שלדה|chassis|vin)[:\s#]*([A-HJ-NPR-Z0-9]{8,17})/i);
  if (kw && /[A-Z]/i.test(kw[1])) return kw[1].toUpperCase();
  // Bare 17-char VIN (no I/O/Q)
  const vin = text.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
  if (vin) return vin[1].toUpperCase();
  return undefined;
}

function extractMileage(text: string): number | undefined {
  const m = text.match(/(\d[\d,]{2,})\s*(?:ק["'״]?מ|קילומטר|km\b)/i)
        ?? text.match(/(?:ק["'״]?מ|קילומטר|מד\s*אוץ|קריאת\s*מד)[:\s]*(\d[\d,]{2,})/i);
  if (m) {
    const n = parseInt(m[1].replace(/\D/g, ""), 10);
    if (!isNaN(n) && n > 0 && n < 5_000_000) return n;
  }
  return undefined;
}

export function parseVehicleFields(text: string): VehicleFields {
  const v: VehicleFields = {};
  const plate = extractPlateNumber(text);
  if (plate) v.plateNumber = plate;
  const chassis = extractChassisNumber(text);
  if (chassis) v.chassisNumber = chassis;
  const lic = findDateNear(text, ["תוקף", "בתוקף עד", "תאריך תפוגה", "תוקף הרישיון", "עד תאריך", "רישוי עד"]);
  if (lic) v.licenseValidUntil = lic;
  const ins = findDateNear(text, ["ביטוח", "פוליסה", "בתוקף עד", "תוקף הביטוח"]);
  if (ins) v.insuranceValidUntil = ins;
  const mileage = extractMileage(text);
  if (mileage != null) v.mileage = mileage;
  return v;
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseOcrText(rawText: string, typeHint?: SupplierDocumentType): ParseResult {
  const classification    = classifyDocumentType(rawText);
  const vatNumber         = extractVatNumber(rawText);
  const documentNumber    = extractDocumentNumber(rawText);
  const documentDate      = extractDate(rawText);
  const supplierName      = extractSupplierName(rawText);
  const currency          = /\$|USD/i.test(rawText) ? "USD"
                          : /€|EUR/i.test(rawText)  ? "EUR" : "ILS";

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

  const lines = extractLines(rawText);

  // Adjust scoring based on user's pre-selected document type
  // Delivery notes: totals are optional; reward found line items instead
  // Receipt: total is the key field; line items are secondary
  const isDeliveryHint = typeHint === "delivery_note" || typeHint === "goods_receipt";

  let confidence = 0.3;
  if (vatNumber)                              confidence += 0.15;
  if (documentNumber)                         confidence += 0.15;
  if (documentDate)                           confidence += 0.10;
  if (!isDeliveryHint && totalAfterVat != null) confidence += 0.15;
  if (isDeliveryHint && lines.length > 0)      confidence += 0.15;
  if (supplierName)                           confidence += 0.10;
  confidence = Math.min(confidence, 0.95);

  const missing: string[] = [];
  if (!vatNumber)                               missing.push("מס׳ עוסק לא נמצא");
  if (!documentNumber)                          missing.push("מספר מסמך לא נמצא");
  if (!documentDate)                            missing.push("תאריך לא נמצא");
  if (!isDeliveryHint && totalAfterVat == null) missing.push("סכום לא נמצא");

  // When OCR can't classify (unknown) but user gave a hint, use the hint as the document type
  const finalDocType = (classification.type === "unknown" && typeHint && typeHint !== "unknown")
    ? typeHint
    : classification.type as SupplierDocumentType;

  // ── Critical-field validation + vehicle fields ──────────────────────────────
  const fieldWarnings: string[] = [];
  const vatValid = vatNumber ? isValidIsraeliId(vatNumber) : undefined;
  if (vatNumber && vatValid === false) {
    fieldWarnings.push(`מס׳ עוסק/ח.פ ("${vatNumber}") נכשל בבדיקת ספרת ביקורת — יש לאמת ידנית`);
  }
  if (subtotalBeforeVat != null && vatAmount != null && totalAfterVat != null) {
    const sum = subtotalBeforeVat + vatAmount;
    if (Math.abs(sum - totalAfterVat) / totalAfterVat > 0.02) {
      fieldWarnings.push('סכומים אינם מאזנים: לפני מע"מ + מע"מ ≠ סה"כ — יש לאמת');
    }
  }

  const vehicle = parseVehicleFields(rawText);
  const hasVehicleData = Object.keys(vehicle).length > 0;

  return {
    header: {
      documentType: finalDocType,
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
    lines,
    vehicle: hasVehicleData ? vehicle : undefined,
    fieldWarnings: fieldWarnings.length > 0 ? fieldWarnings : undefined,
    vatValid,
  };
}
