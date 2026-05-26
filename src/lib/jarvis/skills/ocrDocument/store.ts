import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { DocClass } from "./classify";

/** Audit-log a received document/media (one row per inbound media). */
export async function logDocument(args: {
  channel: string;
  senderPhone: string;
  senderRole: string;
  mediaId: string | null;
  mediaKind: string | null;
  mimeType: string | null;
  caption: string | null;
  status?: string;
  classification?: DocClass | null;
  extractedText?: string | null;
  summary?: string | null;
  routedAction?: string | null;
}): Promise<string | null> {
  const db = getServiceSupabase();
  const { data, error } = await db
    .from("jarvis_documents")
    .insert({
      channel: args.channel,
      sender_phone: args.senderPhone,
      sender_role: args.senderRole,
      media_id: args.mediaId,
      media_kind: args.mediaKind,
      mime_type: args.mimeType,
      caption: args.caption,
      status: args.status ?? "received",
      classification: args.classification ?? null,
      extracted_text: args.extractedText ?? null,
      summary: args.summary ?? null,
      routed_action: args.routedAction ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[jarvis:ocr] logDocument failed:", error.message);
    return null;
  }
  return String(data.id);
}
