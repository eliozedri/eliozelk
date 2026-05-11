import { SIGNS_DATA } from "@/data/signs";
import type { SignRecord } from "@/types/order";

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
