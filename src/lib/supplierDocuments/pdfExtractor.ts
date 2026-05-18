// PDF text extraction using pdf-parse v2 (class-based API).
// Used for digitally-created PDFs; returns raw text for the parser.

import { PDFParse } from "pdf-parse";

export interface PdfTextResult {
  text: string;
  pages: number;
}

export async function extractPdfText(buffer: Buffer): Promise<PdfTextResult> {
  // PDFParse v2: constructor takes LoadParameters where data accepts TypedArray (Buffer qualifies)
  const parser = new PDFParse({ data: buffer as unknown as ArrayBuffer });
  const result = await parser.getText();
  return { text: result.text, pages: result.total };
}
