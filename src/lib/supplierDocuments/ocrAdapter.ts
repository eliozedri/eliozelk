// OCR / extraction adapter — provider-agnostic interface.
// MVP: manual-only mode. OCR integration is a future plug-in.

import type { SupplierDocumentType } from "@/types/supplierDocument";
import { classifyDocumentType } from "./classification";

export interface ExtractionInput {
  fileBuffer?: Buffer;
  fileName?: string;
  fileType?: string;
  rawText?: string;
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
}

export interface ExtractionResult {
  available: boolean;
  header?: ExtractedHeader;
  lines?: ExtractedLine[];
  rawText?: string;
  error?: string;
}

// ── Extraction interface ──────────────────────────────────────────────────────

type ExtractionProvider = (input: ExtractionInput) => Promise<ExtractionResult>;

// ── Provider: manual mode (no OCR) ───────────────────────────────────────────

const manualProvider: ExtractionProvider = async () => ({
  available: false,
  error: "OCR לא מוגדר — יש להזין נתונים ידנית",
});

// ── Provider: raw text classification only ────────────────────────────────────
// If raw_text is provided (e.g. from future AI extraction), classify it and
// return minimal structured data.

const rawTextProvider: ExtractionProvider = async (input) => {
  if (!input.rawText) return manualProvider(input);

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

// ── Provider registry ─────────────────────────────────────────────────────────

function resolveProvider(): ExtractionProvider {
  // Future: check for API keys (OPENAI_API_KEY, GOOGLE_VISION_KEY, etc.)
  // and return the appropriate provider.
  // For now, use rawText if provided, otherwise manual.
  return rawTextProvider;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function extractDocument(input: ExtractionInput): Promise<ExtractionResult> {
  const provider = resolveProvider();
  try {
    return await provider(input);
  } catch (err) {
    return {
      available: false,
      error: `שגיאה בחילוץ נתונים: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function isOcrAvailable(): boolean {
  // Future: check env vars for OCR provider credentials
  return false;
}

export function getOcrStatusMessage(): string {
  if (isOcrAvailable()) return "OCR זמין";
  return "OCR אינו מוגדר — מצב הזנה ידנית פעיל";
}
