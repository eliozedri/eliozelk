// Server-side upload content validation (defense-in-depth).
//
// Upload routes already enforce a client-supplied MIME allowlist + size cap, but
// `file.type` is attacker-controlled. This sniffs the actual magic bytes so a file
// renamed/relabeled as an image/PDF that is really an executable, archive, HTML, or
// script is rejected before it is stored or fed to OCR.
//
// Philosophy: REJECT positively-dangerous content; ALLOW the six supported
// document/image signatures; stay LENIENT on genuinely-unrecognizable bytes (return
// ok) so we never false-reject an odd-but-valid scan — the MIME allowlist, size cap,
// private bucket and role gate remain the other layers.

export type DetectedType =
  | "application/pdf"
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/tiff"
  | "image/heic"
  | "image/gif"
  | "application/zip"
  | "application/x-dosexec"
  | "application/x-elf"
  | "text/html-or-script"
  | "video/quicktime-or-mp4"
  | "unknown";

const HEIC_BRANDS = new Set([
  "heic", "heix", "hevc", "heim", "heis", "hevm", "hevs", "mif1", "msf1", "heif",
]);

/** Identify a file by its leading bytes. Returns "unknown" when not recognized. */
export function sniffFileType(buf: Buffer): DetectedType {
  const b = buf;
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf"; // %PDF
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp"; // RIFF....WEBP
  if (b.length >= 4 && ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a))) return "image/tiff";
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
    if (HEIC_BRANDS.has(brand)) return "image/heic";
    return "video/quicktime-or-mp4"; // other ftyp boxes = mp4/mov video — not a document
  }
  // Positively-dangerous / disallowed signatures
  if (b.length >= 2 && b[0] === 0x4d && b[1] === 0x5a) return "application/x-dosexec"; // MZ (PE/EXE)
  if (b.length >= 4 && b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46) return "application/x-elf";
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07)) return "application/zip"; // PK (zip/office/jar)
  if (b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  const head = b.subarray(0, 64).toString("utf8").trim().toLowerCase();
  if (
    head.startsWith("<!doctype html") ||
    head.startsWith("<html") ||
    head.startsWith("<script") ||
    head.startsWith("<?php") ||
    head.startsWith("<svg") // SVG can carry inline script → treat as unsafe markup
  ) {
    return "text/html-or-script";
  }
  return "unknown";
}

const SUPPORTED_SIGNATURES = new Set<DetectedType>([
  "application/pdf", "image/jpeg", "image/png", "image/webp", "image/tiff", "image/heic",
]);

export interface SignatureCheck {
  ok: boolean;
  detected: DetectedType;
  /** User-safe Hebrew reason when ok=false. */
  reason?: string;
}

/**
 * Validate that the bytes are a supported document/image — or at least not
 * positively dangerous. Rejects executables, archives, HTML/script, GIF and video.
 */
export function validateUploadSignature(buf: Buffer): SignatureCheck {
  const detected = sniffFileType(buf);
  if (detected === "unknown") return { ok: true, detected }; // lenient: other layers apply
  if (SUPPORTED_SIGNATURES.has(detected)) return { ok: true, detected };
  return {
    ok: false,
    detected,
    reason: "תוכן הקובץ אינו תואם סוג מסמך/תמונה נתמך — הקובץ נדחה מטעמי אבטחה",
  };
}
