// OCR / extraction adapter — provider-agnostic interface.
// tesseract.js WASM provider: Hebrew + English, server-side only, no external APIs.

import type { SupplierDocumentType } from "@/types/supplierDocument";
import { classifyDocumentType } from "./classification";

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

// ── Provider: tesseract.js WASM (images) + pdf-parse (digital PDFs) ───────────

const tesseractProvider: ExtractionProvider = async (input) => {
  if (!input.fileBuffer) return rawTextProvider(input);

  const fileType = input.fileType ?? "";
  const fileName = input.fileName?.toLowerCase() ?? "";
  const isPdf = fileType === "application/pdf" || fileName.endsWith(".pdf");

  let rawText: string;

  if (isPdf) {
    const { extractPdfText } = await import("./pdfExtractor");
    const result = await extractPdfText(input.fileBuffer);
    rawText = result.text;
  } else {
    const { preprocessImage } = await import("./imagePreprocessor");
    const { createWorker } = await import("tesseract.js");

    const preprocessed = await preprocessImage(input.fileBuffer, fileType);
    const worker = await createWorker(["heb", "eng"], 1, { langPath: "/tmp" });
    try {
      const { data } = await worker.recognize(preprocessed.buffer);
      rawText = data.text;
    } finally {
      await worker.terminate();
    }
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
    };
  }

  const { parseOcrText } = await import("./parser");
  const parsed = parseOcrText(rawText, input.documentTypeHint);
  return { available: true, rawText, header: parsed.header, lines: parsed.lines };
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
  return "OCR פעיל — tesseract.js (עברית + אנגלית)";
}
