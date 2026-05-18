// Image preprocessing pipeline for OCR — HEIC conversion + sharp normalization.
// Always returns something usable: on failure returns the original buffer with a warning.

import sharp from "sharp";

type HeicConvertFn = (opts: { buffer: Buffer; format: "JPEG" | "PNG"; quality?: number }) => Promise<ArrayBuffer>;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const heicConvert = require("heic-convert") as HeicConvertFn;

export interface PreprocessResult {
  buffer: Buffer;
  mimeType: string;
  warning?: string;
}

export async function preprocessImage(
  buffer: Buffer,
  mimeType: string
): Promise<PreprocessResult> {
  try {
    let work = buffer;

    // Convert HEIC/HEIF → JPEG before sharp can touch it
    if (mimeType === "image/heic" || mimeType === "image/heif") {
      const ab = await heicConvert({ buffer: work, format: "JPEG", quality: 0.92 });
      work = Buffer.from(ab);
      mimeType = "image/jpeg";
    }

    // Normalize for OCR: auto-rotate, grayscale, normalize contrast, mild sharpen
    const processed = await sharp(work)
      .rotate()
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1 })
      .png()
      .toBuffer();

    return { buffer: processed, mimeType: "image/png" };
  } catch (err) {
    // Preprocessing failed — OCR can still attempt on the original
    return {
      buffer,
      mimeType,
      warning: `עיבוד תמונה נכשל: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
