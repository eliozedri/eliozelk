// OCR / extraction adapter — provider-agnostic interface.
// tesseract.js engine (best Hebrew+English LSTM models) for images and scanned
// PDFs; direct text extraction for digital PDFs. Server-side only, no paid APIs.
// This is the SINGLE central engine used by both "סריקת מסמך" and "צי רכב".

import type { SupplierDocumentType } from "@/types/supplierDocument";
import type { VehicleFields } from "./parser";
import { classifyDocumentType } from "./classification";

// Engine labels kept as local literals so this module does not eagerly import
// tesseract.js (the engine is dynamically imported only when a file is present).
const ENGINE_BEST = "tesseract.js 7 · tessdata_best (עברית + אנגלית, LSTM)";
const ENGINE_FALLBACK = "tesseract.js 7 · מודל ברירת מחדל (עברית + אנגלית)";
const ENGINE_PDF_TEXT = "pdf-parse · טקסט מוטמע (ללא OCR)";

export interface ExtractionInput {
  fileBuffer?: Buffer;
  fileName?: string;
  fileType?: string;
  rawText?: string;
  documentTypeHint?: SupplierDocumentType; // user's pre-selected card → guides parser priorities
}

export interface ExtractedHeader {
  documentType: SupplierDocumentType;
  supplierName: string;
  supplierVat: string;
  documentNumber: string;
  documentDate?: string;
  dueDate?: string;
  currency: string;
  subtotalBeforeVat?: number;
  vatAmount?: number;
  vatRate?: number;
  totalAfterVat?: number;
  confidence: number;
  notes: string;
}

export interface ExtractedLine {
  lineNumber: number;
  originalDescription: string;
  supplierSku: string;
  quantity?: number;
  unitOfMeasure: string;
  unitPrice?: number;
  discountPercent?: number;
  lineTotal?: number;
  confidence: number;
  warnings?: string[];
}

export interface ExtractionResult {
  available: boolean;
  header?: ExtractedHeader;
  lines?: ExtractedLine[];
  rawText?: string;
  error?: string;
  // ── Extended metadata (engine upgrade) ──
  vehicle?: VehicleFields;
  fieldWarnings?: string[];
  vatValid?: boolean;
  /** Distinct terms the OCR engine was least confident about. */
  lowConfidenceTerms?: string[];
  /** Page-level OCR confidence 0..1 (separate from the parser's field score). */
  pageConfidence?: number;
  /** true when text came from OCR over a scanned/photographed PDF. */
  scanned?: boolean;
  /** Human-readable engine label for audit/UX. */
  engine?: string;
}

// ── Extraction interface ──────────────────────────────────────────────────────

type ExtractionProvider = (input: ExtractionInput) => Promise<ExtractionResult>;

// ── Provider: fallback for raw-text-only input ────────────────────────────────

const rawTextProvider: ExtractionProvider = async (input) => {
  if (!input.rawText) {
    return { available: false, error: "אין קובץ או טקסט גולמי — יש להזין נתונים ידנית" };
  }
  const classification = classifyDocumentType(input.rawText);
  return {
    available: true,
    rawText: input.rawText,
    header: {
      documentType: classification.type,
      supplierName: "",
      supplierVat: "",
      documentNumber: "",
      currency: "ILS",
      confidence: classification.confidence,
      notes: "סווג מטקסט גולמי — יש לאמת שדות",
    },
    lines: [],
  };
};

// ── Provider: tesseract engine (images + scanned PDF) + pdf-parse (digital PDF) ─

const tesseractProvider: ExtractionProvider = async (input) => {
  if (!input.fileBuffer) return rawTextProvider(input);

  const fileType = input.fileType ?? "";
  const fileName = input.fileName?.toLowerCase() ?? "";
  const isPdf = fileType === "application/pdf" || fileName.endsWith(".pdf");

  let rawText = "";
  let pageConfidence: number | undefined;
  let lowConfidenceTerms: string[] = [];
  let scanned = false;
  let engine = ENGINE_BEST;

  if (isPdf) {
    const { extractPdfText } = await import("./pdfExtractor");
    const result = await extractPdfText(input.fileBuffer);
    rawText = result.text;
    scanned = result.scanned;
    if (result.scanned) {
      pageConfidence = result.ocrConfidence;
      lowConfidenceTerms = result.lowConfidenceTerms ?? [];
    } else {
      engine = ENGINE_PDF_TEXT;
      pageConfidence = 0.95; // embedded text is exact, not OCR-guessed
    }
  } else {
    const { preprocessImage } = await import("./imagePreprocessor");
    const { runTesseract } = await import("./ocrConfig");
    const preprocessed = await preprocessImage(input.fileBuffer, fileType);
    const ocr = await runTesseract(preprocessed.buffer);
    rawText = ocr.text;
    pageConfidence = ocr.pageConfidence;
    lowConfidenceTerms = ocr.lowConfidenceTerms;
    if (!ocr.usedBestModel) engine = ENGINE_FALLBACK;
  }

  if (!rawText.trim()) {
    return {
      available: true,
      rawText: "",
      header: {
        documentType: "unknown",
        supplierName: "",
        supplierVat: "",
        documentNumber: "",
        currency: "ILS",
        confidence: 0.1,
        notes: "OCR לא הצליח לחלץ טקסט — יש להזין נתונים ידנית",
      },
      lines: [],
      scanned,
      engine,
      pageConfidence: 0,
    };
  }

  const { parseOcrText } = await import("./parser");
  const parsed = parseOcrText(rawText, input.documentTypeHint);
  return {
    available: true,
    rawText,
    header: parsed.header,
    lines: parsed.lines,
    vehicle: parsed.vehicle,
    fieldWarnings: parsed.fieldWarnings,
    vatValid: parsed.vatValid,
    lowConfidenceTerms,
    pageConfidence,
    scanned,
    engine,
  };
};

// ── Provider registry ─────────────────────────────────────────────────────────

function resolveProvider(): ExtractionProvider {
  return tesseractProvider;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function extractDocument(input: ExtractionInput): Promise<ExtractionResult> {
  try {
    return await resolveProvider()(input);
  } catch (err) {
    return {
      available: false,
      error: `שגיאה בחילוץ נתונים: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function isOcrAvailable(): boolean {
  return true;
}

export function getOcrStatusMessage(): string {
  return "OCR פעיל — tesseract.js (מודל עברית מיטבי tessdata_best)";
}
