import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import { downloadMedia } from "./storage";
import { analyzeDocument } from "./analyze";

/**
 * Async OCR worker. Processes queued jarvis_documents OFF the WhatsApp webhook (OCR is slow):
 * download bytes from storage → run the active OCR provider → write extracted_text / summary /
 * classification onto the document row. Idempotent and best-effort: failures mark the row
 * 'failed' and never throw. Invoked by /api/jarvis/ocr-worker (cron or manual + CRON_SECRET).
 *
 * Note: results land on the document record (visible to a future UI). Sending an extracted
 * summary back to the owner over WhatsApp is a later step.
 */

export interface OcrWorkerResult {
  scanned: number;
  processed: number;
  failed: number;
}

export async function processQueuedDocuments(limit = 5): Promise<OcrWorkerResult> {
  const db = getServiceSupabase();
  const { data } = await db
    .from("jarvis_documents")
    .select("id, media_storage_path, mime_type")
    .eq("status", "queued")
    .not("media_storage_path", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  const rows = data ?? [];
  let processed = 0;
  let failed = 0;

  for (const row of rows) {
    const id = String(row.id);
    try {
      const buffer = await downloadMedia(String(row.media_storage_path));
      if (!buffer) {
        await db.from("jarvis_documents").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", id);
        failed++;
        continue;
      }
      const result = await analyzeDocument(buffer, (row.mime_type as string) ?? null);
      await db
        .from("jarvis_documents")
        .update({
          status: result.available ? "processed" : "failed",
          extracted_text: result.text || null,
          summary: result.summary || null,
          classification: result.classification,
          ocr_engine: result.engine ?? null,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (result.available) processed++;
      else failed++;
    } catch (err) {
      console.error(`[jarvis:ocr-worker] doc ${id} failed:`, err instanceof Error ? err.message : String(err));
      await db.from("jarvis_documents").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", id);
      failed++;
    }
  }

  return { scanned: rows.length, processed, failed };
}
