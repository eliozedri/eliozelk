import "server-only";

/**
 * Outbound WhatsApp (Cloud API) primitives.
 *
 * sendWhatsAppPayload is the shared low-level sender used by text, interactive, and
 * media helpers. Tokens live ONLY in env and are never logged. Every helper returns
 * true on success / false on failure and never throws — a failed send must not break
 * inbound processing, and callers can fall back (e.g. interactive → plain text).
 */

const GRAPH_VERSION = "v20.0";

/** POST an arbitrary Cloud API message payload (without messaging_product/to). */
export async function sendWhatsAppPayload(
  to: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.error("[whatsapp] cannot send — WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN not set");
    return false;
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, ...payload }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[whatsapp] send failed (${(payload.type as string) ?? "?"}): ${res.status} — ${errText}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[whatsapp] send threw:", err instanceof Error ? err.message : String(err));
    return false;
  }
}

export async function sendWhatsAppText(to: string, body: string): Promise<boolean> {
  return sendWhatsAppPayload(to, { type: "text", text: { preview_url: false, body } });
}
