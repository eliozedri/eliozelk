import "server-only";

/**
 * OCR provider interface — pluggable engines behind one contract. Today the active provider
 * is the central tesseract engine (src/lib/supplierDocuments/ocrAdapter). A future cloud OCR
 * or LLM-vision provider implements the same interface and is swapped in `getActiveOcrProvider`
 * with no change to the skill. (Note: actual extraction runs off the webhook — see analyze.ts.)
 */

export interface OcrExtraction {
  available: boolean;
  text: string;
  engine?: string;
}

export interface OcrProvider {
  name: string;
  isAvailable(): boolean;
  extract(buffer: Buffer, mimeType: string | null, fileName?: string): Promise<OcrExtraction>;
}

/** Current provider: the project's central tesseract engine (Hebrew+English). */
export const tesseractProvider: OcrProvider = {
  name: "tesseract.js (heb+eng, tessdata_best)",
  isAvailable() {
    return true;
  },
  async extract(buffer, mimeType, fileName) {
    const { extractDocument, isOcrAvailable } = await import("@/lib/supplierDocuments/ocrAdapter");
    if (!isOcrAvailable()) return { available: false, text: "" };
    const res = await extractDocument({ fileBuffer: buffer, fileName, fileType: mimeType ?? undefined });
    return { available: res.available, text: (res.rawText ?? "").trim(), engine: res.engine };
  },
};

/** Placeholder for a future cloud OCR / LLM-vision provider (not connected). */
export const placeholderProvider: OcrProvider = {
  name: "placeholder (none)",
  isAvailable() {
    return false;
  },
  async extract() {
    return { available: false, text: "" };
  },
};

export function getActiveOcrProvider(): OcrProvider {
  return tesseractProvider;
}
