// PDF pipeline using pdf-parse v2 (which bundles pdfjs-dist + @napi-rs/canvas).
//   1. Try direct text extraction (digital PDFs) — fast, lossless, no OCR.
//   2. If the PDF has little/no embedded text it is a SCANNED/photographed PDF:
//      rasterize each page to an image and run the central Tesseract engine.
// No new dependency is added — pdf-parse already ships the canvas + pdfjs stack.

import { PDFParse } from "pdf-parse";
import { runTesseract } from "./ocrConfig";

export interface PdfExtractResult {
  text: string;
  pages: number;
  /** true when text came from OCR over rasterized pages (scanned PDF). */
  scanned: boolean;
  /** Page-level OCR confidence 0..1 (only when scanned). */
  ocrConfidence?: number;
  lowConfidenceTerms?: string[];
}

// A digital PDF usually yields plenty of selectable text. Below this many
// non-whitespace characters we treat it as scanned and switch to OCR.
const MIN_DIGITAL_CHARS = 40;
// Cap OCR work — invoices/vehicle docs are 1–3 pages; avoid runaway cost.
const MAX_OCR_PAGES = 5;
// Render scale: higher = sharper for OCR but heavier. 2.0 ≈ ~150–200 DPI.
const RENDER_SCALE = 2.0;

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  const data = new Uint8Array(buffer);

  // ── 1. Direct text (digital PDF) ──────────────────────────────────────────
  let digitalText = "";
  let totalPages = 0;
  try {
    const parser = new PDFParse({ data });
    const result = await parser.getText();
    digitalText = result.text ?? "";
    totalPages = result.total ?? 0;
  } catch {
    digitalText = "";
  }

  if (digitalText.replace(/\s/g, "").length >= MIN_DIGITAL_CHARS) {
    return { text: digitalText, pages: totalPages, scanned: false };
  }

  // ── 2. Scanned PDF → rasterize + OCR ──────────────────────────────────────
  try {
    const parser = new PDFParse({ data });
    const shots = await parser.getScreenshot({
      scale: RENDER_SCALE,
      imageBuffer: true,
      first: 1,
      last: MAX_OCR_PAGES,
    });

    const texts: string[] = [];
    const confidences: number[] = [];
    const lowTerms: string[] = [];

    for (const page of shots.pages ?? []) {
      if (!page.data) continue;
      const pageBuffer = Buffer.from(page.data);
      const ocr = await runTesseract(pageBuffer);
      if (ocr.text.trim()) {
        texts.push(ocr.text);
        confidences.push(ocr.pageConfidence);
        lowTerms.push(...ocr.lowConfidenceTerms);
      }
    }

    const text = texts.join("\n\n");
    const ocrConfidence =
      confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : 0;

    return {
      text,
      pages: shots.total ?? totalPages,
      scanned: true,
      ocrConfidence,
      lowConfidenceTerms: Array.from(new Set(lowTerms)).slice(0, 40),
    };
  } catch {
    // Rasterization failed — return whatever digital text we had (possibly empty).
    return { text: digitalText, pages: totalPages, scanned: true, ocrConfidence: 0 };
  }
}
