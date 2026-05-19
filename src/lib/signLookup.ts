import { SIGNS_DATA } from "@/data/signs";
import type { SignRecord } from "@/types/order";

const KNOWN_SHAPES = new Set(["משולש", "עיגול", "מלבן", "מיוחד"]);

function normalizeInput(raw: string): string {
  const s = raw.trim().toLowerCase();
  // "129b", "129 b" → "129_b"
  const variantMatch = s.match(/^(p?\d+)\s*([bcd])$/);
  if (variantMatch) return `${variantMatch[1]}_${variantMatch[2]}`;
  return s;
}

export function lookupSign(input: string): SignRecord | null {
  if (!input.trim()) return null;
  const normalized = normalizeInput(input);
  return SIGNS_DATA[normalized] ?? null;
}

/** Returns all signs whose shape is missing, "לא ידוע", or not in the known-shapes set.
 *  Used for data-quality audits. */
export function auditSignShapes(): Array<{ key: string; shape: string; series: string }> {
  return Object.entries(SIGNS_DATA)
    .filter(([, r]) => !r.shape || r.shape === "לא ידוע" || !KNOWN_SHAPES.has(r.shape))
    .map(([key, r]) => ({ key, shape: r.shape, series: r.series }));
}
