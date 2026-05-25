// Image preprocessing pipeline for OCR — HEIC conversion + sharp normalization.
// Tuned for phone photos of invoices and vehicle documents (low contrast, small,
// slightly rotated). Always returns something usable: on failure it returns the
// original buffer with a warning so OCR can still attempt.

import sharp from "sharp";

type HeicConvertFn = (opts: { buffer: Buffer; format: "JPEG" | "PNG"; quality?: number }) => Promise<ArrayBuffer>;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const heicConvert = require("heic-convert") as HeicConvertFn;

export interface PreprocessResult {
  buffer: Buffer;
  mimeType: string;
  warning?: string;
}

// Below this width we upscale — small phone shots OCR poorly at native size.
const MIN_OCR_WIDTH = 1500;
// Above this we downscale to keep memory/time bounded on Vercel.
const MAX_OCR_WIDTH = 3000;

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

    const base = sharp(work, { failOn: "none" }).rotate(); // honour EXIF orientation
    const meta = await base.metadata();
    const width = meta.width ?? 0;

    let pipeline = sharp(work, { failOn: "none" })
      .rotate()
      .flatten({ background: "#ffffff" }) // drop alpha → white bg (stamps/scans)
      .grayscale();

    // Upscale small captures, downscale oversized ones — both help OCR + cost.
    if (width > 0 && width < MIN_OCR_WIDTH) {
      pipeline = pipeline.resize({ width: MIN_OCR_WIDTH, withoutEnlargement: false });
    } else if (width > MAX_OCR_WIDTH) {
      pipeline = pipeline.resize({ width: MAX_OCR_WIDTH });
    }

    const processed = await pipeline
      .median(1)                 // light denoise (kills phone-camera speckle)
      .normalize()               // stretch contrast to full range
      .linear(1.15, -12)         // mild contrast boost for faded thermal prints
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
