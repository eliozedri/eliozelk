// OCR / extraction adapter — provider-agnostic interface.
//
// The system is NOT locked to a single OCR engine. Engines are pluggable
// "providers" tried in a fallback chain; the parser, classification, routes and
// review UI all consume the same neutral ExtractionResult and never care which
// engine produced the text.
//
// Provider chain (resolveProviderChain):
//   1. httpOcrProvider     — calls an external OCR sidecar (native Tesseract heb+eng,
//                            optionally PaddleOCR) over HTTP. Active only when
//                            OCR_SERVICE_URL is set. This is the production engine.
//   2. tesseractWasmProvider — in-process tesseract.js (WASM). Always available as a
//                            crash-safe fallback so OCR never hard-depends on the
//                            sidecar being reachable.
//   3. rawTextProvider     — manual/raw-text input only (no file).
//
// Failures are always visible and recoverable: every result carries the provider
// name, whether a fallback was used, a technical rawError (audit/logs) and a
// user-safe Hebrew message + manual-review reason. No silent success, no hidden
// failure, no invented financial data.

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
  // ── Provider transparency (multi-engine) ──
  /** Which provider produced this result (e.g. "http-tesseract", "tesseract-wasm"). */
  provider?: string;
  /** True when a preferred provider failed and a fallback produced this result. */
  fallbackUsed?: boolean;
  /** Technical error detail for logs/audit — never shown raw to end users. */
  rawError?: string;
  /** User-safe Hebrew message describing a failure, if any. */
  userError?: string;
  /** Why this document needs human review (undefined when high-confidence). */
  manualReviewReason?: string;
}

// ── Low-level outcome a single engine provider returns (text + meta only) ──────
// The parser + result assembly is centralized in extractDocument so every engine
// goes through identical field-extraction and reporting.

interface RawOcrOutcome {
  ok: boolean;
  rawText?: string;
  pageConfidence?: number;
  lowConfidenceTerms?: string[];
  scanned?: boolean;
  engine?: string;
  provider: string;
  /** Technical failure detail (network error, WASM abort, timeout, …). */
  rawError?: string;
}

type ProviderName = "http" | "wasm";

// ── Provider: external OCR sidecar over HTTP ──────────────────────────────────
// Native Tesseract heb+eng (and optionally PaddleOCR) running in a container.
// Active only when OCR_SERVICE_URL is configured. See ocr-service/.

async function httpOcrProvider(input: ExtractionInput): Promise<RawOcrOutcome> {
  const base = (process.env.OCR_SERVICE_URL ?? "").replace(/\/+$/, "");
  const token = process.env.OCR_SERVICE_TOKEN ?? "";
  if (!base) {
    return { ok: false, provider: "http", rawError: "OCR_SERVICE_URL not configured" };
  }
  if (!input.fileBuffer) {
    return { ok: false, provider: "http", rawError: "no file buffer for http provider" };
  }
  // Which engine the sidecar should use. "auto" lets the service decide
  // (digital-PDF text → Tesseract → optional PaddleOCR for hard images).
  const engineHint = process.env.OCR_SERVICE_ENGINE ?? "auto";

  try {
    const form = new FormData();
    const bytes = new Uint8Array(input.fileBuffer);
    form.append(
      "file",
      new Blob([bytes], { type: input.fileType || "application/octet-stream" }),
      input.fileName || "document",
    );
    form.append("lang", "heb+eng");
    form.append("engine", engineHint);

    // Hard timeout so a slow/hung sidecar can never hang the request.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 120_000);
    let res: Response;
    try {
      res = await fetch(`${base}/ocr`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
        signal: ac.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, provider: "http", rawError: `OCR service ${res.status}: ${detail.slice(0, 300)}` };
    }

    const data = (await res.json()) as {
      text?: string;
      pageConfidence?: number;
      lowConfidenceTerms?: string[];
      scanned?: boolean;
      engine?: string;
    };

    return {
      ok: true,
      rawText: data.text ?? "",
      pageConfidence: typeof data.pageConfidence === "number" ? data.pageConfidence : undefined,
      lowConfidenceTerms: Array.isArray(data.lowConfidenceTerms) ? data.lowConfidenceTerms : [],
      scanned: Boolean(data.scanned),
      engine: data.engine ? `שירות OCR · ${data.engine}` : "שירות OCR חיצוני",
      provider: `http-${(data.engine ?? "ocr").split(/\s|·/)[0]}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, provider: "http", rawError: `OCR service unreachable: ${msg}` };
  }
}

// ── Provider: in-process tesseract.js (WASM) + pdf-parse — crash-safe fallback ──

async function tesseractWasmProvider(input: ExtractionInput): Promise<RawOcrOutcome> {
  if (!input.fileBuffer) {
    return { ok: false, provider: "tesseract-wasm", rawError: "no file buffer" };
  }
  const fileType = input.fileType ?? "";
  const fileName = input.fileName?.toLowerCase() ?? "";
  const isPdf = fileType === "application/pdf" || fileName.endsWith(".pdf");

  try {
    if (isPdf) {
      const { extractPdfText } = await import("./pdfExtractor");
      const result = await extractPdfText(input.fileBuffer);
      return {
        ok: true,
        rawText: result.text,
        scanned: result.scanned,
        pageConfidence: result.scanned ? result.ocrConfidence : 0.95,
        lowConfidenceTerms: result.scanned ? result.lowConfidenceTerms ?? [] : [],
        engine: result.scanned ? ENGINE_BEST : ENGINE_PDF_TEXT,
        provider: "tesseract-wasm",
      };
    }
    const { preprocessImage } = await import("./imagePreprocessor");
    const { runTesseract } = await import("./ocrConfig");
    const preprocessed = await preprocessImage(input.fileBuffer, fileType);
    const ocr = await runTesseract(preprocessed.buffer);
    return {
      ok: true,
      rawText: ocr.text,
      pageConfidence: ocr.pageConfidence,
      lowConfidenceTerms: ocr.lowConfidenceTerms,
      scanned: false,
      engine: ocr.usedBestModel ? ENGINE_BEST : ENGINE_FALLBACK,
      provider: "tesseract-wasm",
    };
  } catch (err) {
    // runTesseract converts WASM aborts/timeouts into catchable errors (ocrConfig).
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, provider: "tesseract-wasm", rawError: msg };
  }
}

// ── Chain resolution ──────────────────────────────────────────────────────────
// Prefer the external sidecar when configured; always keep the in-process WASM
// engine as a fallback so a sidecar outage degrades gracefully instead of failing.

function resolveProviderChain(): ProviderName[] {
  return process.env.OCR_SERVICE_URL ? ["http", "wasm"] : ["wasm"];
}

async function runProvider(name: ProviderName, input: ExtractionInput): Promise<RawOcrOutcome> {
  return name === "http" ? httpOcrProvider(input) : tesseractWasmProvider(input);
}

// ── Result assembly (single place every engine flows through) ──────────────────

async function buildResult(
  outcome: RawOcrOutcome,
  hint: SupplierDocumentType | undefined,
  fallbackUsed: boolean,
): Promise<ExtractionResult> {
  const rawText = outcome.rawText ?? "";
  const pageConfidence = outcome.pageConfidence ?? 0;

  if (!rawText.trim()) {
    // Engine ran but found no text → recoverable manual-entry draft, never silent.
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
        notes: "זיהוי הטקסט האוטומטי לא חילץ טקסט — יש להזין נתונים ידנית",
      },
      lines: [],
      scanned: outcome.scanned ?? false,
      engine: outcome.engine,
      pageConfidence: 0,
      provider: outcome.provider,
      fallbackUsed,
      userError: "זיהוי הטקסט האוטומטי לא הצליח לחלץ טקסט מהמסמך",
      manualReviewReason: "לא חולץ טקסט מה-OCR — נדרשת הזנה/אימות ידני",
    };
  }

  const { parseOcrText } = await import("./parser");
  const parsed = parseOcrText(rawText, hint);

  const lowConf = pageConfidence > 0 && pageConfidence < 0.5;
  const manualReviewReason =
    lowConf
      ? `ביטחון OCR נמוך (${Math.round(pageConfidence * 100)}%) — מומלץ לאמת`
      : (parsed.fieldWarnings && parsed.fieldWarnings.length > 0)
        ? "זוהו אזהרות שדה — מומלץ לאמת"
        : undefined;

  return {
    available: true,
    rawText,
    header: parsed.header,
    lines: parsed.lines,
    vehicle: parsed.vehicle,
    fieldWarnings: parsed.fieldWarnings,
    vatValid: parsed.vatValid,
    lowConfidenceTerms: outcome.lowConfidenceTerms ?? [],
    pageConfidence,
    scanned: outcome.scanned ?? false,
    engine: outcome.engine,
    provider: outcome.provider,
    fallbackUsed,
    manualReviewReason,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function extractDocument(input: ExtractionInput): Promise<ExtractionResult> {
  // Raw-text-only path (manual paste / upstream text) — no engine needed.
  if (!input.fileBuffer) {
    if (!input.rawText) {
      return {
        available: false,
        provider: "none",
        error: "אין קובץ או טקסט גולמי — יש להזין נתונים ידנית",
        userError: "לא התקבל קובץ או טקסט",
        manualReviewReason: "אין קלט",
      };
    }
    const classification = classifyDocumentType(input.rawText);
    return {
      available: true,
      rawText: input.rawText,
      provider: "raw-text",
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
      manualReviewReason: "סווג מטקסט גולמי — יש לאמת",
    };
  }

  const chain = resolveProviderChain();
  let lastError = "unknown error";
  let lastProvider: string = chain[chain.length - 1];

  for (let i = 0; i < chain.length; i++) {
    let outcome: RawOcrOutcome;
    try {
      outcome = await runProvider(chain[i], input);
    } catch (err) {
      // Defensive — runProvider already catches, but never let the chain throw.
      outcome = {
        ok: false,
        provider: chain[i],
        rawError: err instanceof Error ? err.message : String(err),
      };
    }
    lastProvider = outcome.provider;
    if (outcome.ok) {
      return buildResult(outcome, input.documentTypeHint, /* fallbackUsed */ i > 0);
    }
    lastError = outcome.rawError ?? "no result";
    // try next provider in the chain (graceful degradation)
  }

  // Every engine failed → still open a recoverable manual-entry draft, with reasons.
  return {
    available: true,
    rawText: "",
    provider: lastProvider,
    fallbackUsed: chain.length > 1,
    rawError: lastError,
    userError: "זיהוי הטקסט האוטומטי נכשל — נא להזין/לאמת את הנתונים ידנית",
    manualReviewReason: "כל מנועי ה-OCR נכשלו — נדרשת הזנה ידנית",
    header: {
      documentType: "unknown",
      supplierName: "",
      supplierVat: "",
      documentNumber: "",
      currency: "ILS",
      confidence: 0,
      notes: "OCR נכשל — יש להזין נתונים ידנית",
    },
    lines: [],
    pageConfidence: 0,
  };
}

export function isOcrAvailable(): boolean {
  return true;
}

export function getOcrStatusMessage(): string {
  return process.env.OCR_SERVICE_URL
    ? "OCR פעיל — שירות חיצוני (Tesseract מקורי עברית/אנגלית) עם גיבוי tesseract.js"
    : "OCR פעיל — tesseract.js (מודל עברית tessdata_best), ללא שירות חיצוני";
}
