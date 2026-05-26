import "server-only";
import { classifyDocText, type DocClass } from "./classify";
import { getActiveOcrProvider } from "./providers";

/**
 * Document analysis SERVICE BOUNDARY — runs the active OCR provider (today: tesseract) and
 * classifies the text. Callable and real, but intentionally NOT invoked inline from the
 * WhatsApp webhook (OCR takes seconds–tens of seconds; Meta retries if the webhook doesn't
 * 200 quickly). Use it from the UI or an async worker. Provider is pluggable (providers.ts).
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
  const provider = getActiveOcrProvider();
  if (!provider.isAvailable()) {
    return { available: false, text: "", classification: "unclear", summary: "", note: `OCR provider unavailable: ${provider.name}` };
  }
  const res = await provider.extract(buffer, mimeType, fileName);
  const text = res.text.trim();
  const classification = classifyDocText(text);
  const summary = text ? text.slice(0, 400) : "";
  return { available: res.available, text, classification, summary, engine: res.engine };
}
