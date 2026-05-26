import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import { downloadWhatsAppMedia } from "@/lib/whatsapp/media";

/**
 * Media persistence for async OCR. Meta media URLs expire (~5 min), so we download the
 * bytes AT RECEIPT and store them in the private 'jarvis-docs' bucket; the cron worker then
 * reads from storage. All best-effort — a failure leaves the document at status 'received'.
 */

const BUCKET = "jarvis-docs";

export async function uploadMedia(path: string, buffer: Buffer, contentType: string | null): Promise<boolean> {
  const db = getServiceSupabase();
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: contentType ?? undefined,
    upsert: true,
  });
  if (error) {
    console.error("[jarvis:ocr] storage upload failed:", error.message);
    return false;
  }
  return true;
}

export async function downloadMedia(path: string): Promise<Buffer | null> {
  const db = getServiceSupabase();
  const { data, error } = await db.storage.from(BUCKET).download(path);
  if (error || !data) {
    console.error("[jarvis:ocr] storage download failed:", error?.message);
    return null;
  }
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Download channel media + persist to storage + enqueue for OCR. Returns true if queued.
 * Channel-specific download lives here for now (WhatsApp only); Telegram/Web add their own.
 */
export async function persistMediaForOcr(args: {
  docId: string;
  channel: string;
  mediaId: string;
  senderRole: string;
}): Promise<boolean> {
  if (args.channel !== "whatsapp") return false;
  const dl = await downloadWhatsAppMedia(args.mediaId);
  if (!dl) return false;
  const path = `${args.senderRole}/${args.docId}`;
  if (!(await uploadMedia(path, dl.buffer, dl.mimeType))) return false;
  const db = getServiceSupabase();
  await db
    .from("jarvis_documents")
    .update({ status: "queued", media_storage_path: path, mime_type: dl.mimeType, updated_at: new Date().toISOString() })
    .eq("id", args.docId);
  return true;
}
