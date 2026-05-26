import "server-only";

/**
 * Download inbound WhatsApp media via the Cloud API: GET /{media-id} → a short-lived URL,
 * then fetch the bytes (both require the access token). Tokens are never logged. Returns
 * null on any failure so callers degrade gracefully. (Adapter-level: WhatsApp-specific.)
 */

const GRAPH_VERSION = "v20.0";

export async function downloadWhatsAppMedia(
  mediaId: string,
): Promise<{ buffer: Buffer; mimeType: string | null } | null> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    console.error("[whatsapp:media] WHATSAPP_ACCESS_TOKEN not set");
    return null;
  }
  try {
    const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!metaRes.ok) {
      console.error(`[whatsapp:media] meta fetch failed: ${metaRes.status}`);
      return null;
    }
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
    if (!meta.url) return null;

    const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!binRes.ok) {
      console.error(`[whatsapp:media] binary fetch failed: ${binRes.status}`);
      return null;
    }
    const buffer = Buffer.from(await binRes.arrayBuffer());
    return { buffer, mimeType: meta.mime_type ?? null };
  } catch (err) {
    console.error("[whatsapp:media] download threw:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
