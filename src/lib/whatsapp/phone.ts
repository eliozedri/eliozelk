import "server-only";

/**
 * Phone normalization for WhatsApp routing.
 *
 * Produces a canonical digits-only E.164-without-plus form so that values from
 * different sources compare equal:
 *   "+972 50-344-4483"  → "972503444483"
 *   "0503444483"        → "972503444483"   (Israeli local mobile)
 *   "972503444483"      → "972503444483"   (Meta sends this form, no '+')
 *
 * Only Israeli local (leading 0) is rewritten to the +972 country code; any value
 * already carrying a country code is kept as-is (minus formatting). Non-IL numbers
 * pass through untouched so the master comparison never false-matches.
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  // Keep only digits (drops '+', spaces, dashes, parens, etc.).
  let d = raw.replace(/\D+/g, "");
  if (!d) return "";
  // 00-prefixed international → drop the 00.
  if (d.startsWith("00")) d = d.slice(2);
  // Israeli local mobile/landline: leading 0 + 9 digits → swap 0 for 972.
  if (d.startsWith("0")) d = "972" + d.slice(1);
  return d;
}

/** Master phone allowlist, normalized. Supports JARVIS_MASTER_PHONES (csv) with
 *  JARVIS_MASTER_PHONE as the single-value fallback. */
function masterAllowlist(): string[] {
  const csv = process.env.JARVIS_MASTER_PHONES ?? process.env.JARVIS_MASTER_PHONE ?? "";
  return csv
    .split(",")
    .map((s) => normalizePhone(s))
    .filter((s) => s.length > 0);
}

/** True when the inbound sender is a configured master/owner number. If no master
 *  phone is configured, returns false (everyone is treated as external — safe default). */
export function isMasterPhone(sender: string | null | undefined): boolean {
  const norm = normalizePhone(sender);
  if (!norm) return false;
  return masterAllowlist().includes(norm);
}
