import "server-only";
import { classifyDocText, type DocClass } from "./classify";

/**
 * Document analysis SERVICE BOUNDARY — wraps the existing central tesseract engine
 * (src/lib/supplierDocuments/ocrAdapter). This is callable and real, but is intentionally
 * NOT invoked inline from the WhatsApp webhook (tesseract takes seconds–tens of seconds;
 * Meta retries if the webhook doesn't 200 quickly). Use it from the UI/an async worker.
 * The dynamic import keeps tesseract.js out of the webhook bundle.
 */

export interface AnalyzeResult {
  available: boolean;
  text: string;
  classification: DocClass;
  summary: string;
  engine?: string;
  note?: string;
}

export async function analyzeDocument(
  buffer: Buffer,
  mimeType: string | null,
  fileName?: string,
): Promise<AnalyzeResult> {
  const { extractDocument, isOcrAvailable, getOcrStatusMessage } = await import(
    "@/lib/supplierDocuments/ocrAdapter"
  );
  if (!isOcrAvailable()) {
    return { available: false, text: "", classification: "unclear", summary: "", note: getOcrStatusMessage() };
  }
  const res = await extractDocument({ fileBuffer: buffer, fileName, fileType: mimeType ?? undefined });
  const text = (res.rawText ?? "").trim();
  const classification = classifyDocText(text);
  const summary = text ? text.slice(0, 400) : "";
  return { available: res.available, text, classification, summary, engine: res.engine };
}
