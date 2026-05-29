import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";

/**
 * Recovery sweep for supplier documents stranded in the "extracting" state.
 *
 * The upload route inserts the row as "extracting" and then runs OCR synchronously.
 * If the function is killed mid-OCR — a platform timeout, an OOM, or a tesseract WASM
 * abort that escapes the request's try/catch — the row never transitions and becomes a
 * silent, dataless entry in the review queue with no explanation.
 *
 * This sweep finds those rows (older than the grace window, so we never race a scan that
 * is legitimately still running) and moves them to "draft_ready" with an explicit,
 * human-readable reason. The original file is preserved, so the reviewer can open it and
 * enter the fields manually. Nothing is ever deleted and no financial data is invented.
 *
 * Idempotent and best-effort: invoked by /api/jarvis/ocr-worker (cron or manual).
 */

// Real OCR finishes inside the request; anything still "extracting" past this is stranded.
const STUCK_GRACE_MINUTES = 5;

export interface RecoverStuckResult {
  recovered: number;
}

export async function recoverStuckExtractingDocuments(): Promise<RecoverStuckResult> {
  const db = getServiceSupabase();
  const cutoff = new Date(Date.now() - STUCK_GRACE_MINUTES * 60_000).toISOString();

  const { data, error } = await db
    .from("supplier_documents")
    .select("id")
    .eq("status", "extracting")
    .lt("updated_at", cutoff);

  if (error || !data || data.length === 0) return { recovered: 0 };

  const ids = data.map((r) => String((r as { id: string }).id));
  const now = new Date().toISOString();
  await db
    .from("supplier_documents")
    .update({
      status: "draft_ready",
      extraction_confidence: 0,
      extraction_notes:
        "העיבוד האוטומטי (OCR) לא הושלם — נא לפתוח את המסמך ולהזין/לאמת את השדות ידנית.",
      updated_at: now,
    })
    .in("id", ids);

  return { recovered: ids.length };
}
