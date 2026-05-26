import "server-only";

/**
 * Outbound WhatsApp helper (Cloud API).
 *
 * Sends a plain-text message via the Graph API. Tokens live ONLY in env and are
 * never logged. Returns true on success; never throws — a failed send must not
 * break inbound processing.
 */

const GRAPH_VERSION = "v20.0";

export async function sendWhatsAppText(to: string, body: string): Promise<boolean> {
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
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body },
      }),
    });

    if (!res.ok) {
      // Log status + Meta error body, never the token.
      const errText = await res.text().catch(() => "");
      console.error(`[whatsapp] send failed: ${res.status} — ${errText}`);
      return false;
    }
    console.log(`[whatsapp] message sent to ${to}`);
    return true;
  } catch (err) {
    console.error("[whatsapp] send threw:", err instanceof Error ? err.message : String(err));
    return false;
  }
}
