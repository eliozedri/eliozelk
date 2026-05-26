import "server-only";
import { isMasterPhone } from "./phone";
import { createWhatsAppDraft } from "./intake";
import { sendWhatsAppText } from "./send";
import { sendWhatsAppImage } from "./interactive";
import { buildCustomerSummary } from "./summary";
import { looksLikeOrder, isPureGreetingOrNoise } from "./classify";
import { ELKAYAM_LOGO_URL } from "./assets";
import { isExternalAwaiting, setExternalAwaiting, clearExternalState } from "./externalSession";
import { handleMasterMessage } from "./master";
import type { InboundClassification, InboundMessage } from "./types";

export type { SenderRole, InboundClassification, InboundMessage } from "./types";

/**
 * Jarvis WhatsApp Gateway — single entry point for every inbound message.
 * Classifies the sender and routes:
 *   - master/owner  → Jarvis Master Mode (stateful personal-assistant menu)
 *   - everyone else → Elkayam customer intake (pending draft + structured summary + logo)
 * External senders NEVER reach master capabilities and never create a work_order.
 */

/** Generic professional reply for external media/etc. (no order text to parse). */
const EXTERNAL_ACK =
  "שלום 👋 קיבלנו את פנייתך לאלקיים סימון כבישים. ההודעה הועברה לצוות לבדיקה ונחזור אליך בהקדם. תודה רבה!";

/** Wizard intro — first response to ANY vague/greeting/starter external opener. */
const EXTERNAL_INTRO =
  "שלום 👋 הגעת לג׳ארוויס של אלקיים סימון כבישים.\n" +
  "אפשר לפתוח כאן בקשת הזמנה בצורה פשוטה.\n" +
  "כתוב לי בקצרה מה צריך לבצע — למשל סוג העבודה, מיקום וכמות.";

/** Service-oriented re-prompt — used ONLY after we've already guided the customer. */
const EXTERNAL_REPROMPT =
  "לא הצלחתי להבין את הפרטים בצורה מספיק ברורה. אפשר לכתוב בקצרה מה העבודה הדרושה, למשל: סוג עבודה, מיקום וכמות?";

export function classifyInbound(senderId: string): InboundClassification {
  if (isMasterPhone(senderId)) {
    return { senderRole: "master", routedBy: "jarvis_gateway", targetFlow: "jarvis_master" };
  }
  return { senderRole: "external", routedBy: "jarvis_gateway", targetFlow: "elkayam_order_intake" };
}

export async function dispatchInbound(
  inbound: InboundMessage,
  classification: InboundClassification,
): Promise<void> {
  if (classification.senderRole === "master") {
    await handleMasterMessage(inbound);
    return;
  }

  // ── External Customer Mode: intake only. Never a work_order, never the owner menu. ──
  if (inbound.type === "text" && inbound.body) {
    const phone = inbound.senderId;
    const text = inbound.body.trim();

    if (await isExternalAwaiting(phone)) {
      // Already guided once → capture their reply as the request, unless it's still
      // pure greeting/noise (then re-prompt service-style instead of an empty draft).
      if (looksLikeOrder(text) || !isPureGreetingOrNoise(text)) {
        return createExternalDraft(inbound, text);
      }
      await sendWhatsAppText(phone, EXTERNAL_REPROMPT);
      return;
    }

    // First message: concrete request → draft directly; anything else (greeting /
    // starter / vague / random / "1" / "?") → open the guided intake wizard.
    if (looksLikeOrder(text)) {
      return createExternalDraft(inbound, text);
    }
    await setExternalAwaiting(phone);
    await sendWhatsAppText(phone, EXTERNAL_INTRO);
    return;
  }

  // Non-text external (media/etc.): acknowledge professionally, no draft.
  await sendWhatsAppText(inbound.senderId, EXTERNAL_ACK);
}

/** Create the pending draft, send the structured summary + logo, clear wizard state. */
async function createExternalDraft(inbound: InboundMessage, text: string): Promise<void> {
  const phone = inbound.senderId;
  try {
    await createWhatsAppDraft({
      waMessageId: inbound.waMessageId,
      senderId: phone,
      contactName: inbound.contactName,
      body: text,
    });
  } catch (err) {
    console.error("[whatsapp:gateway] external draft failed:", err instanceof Error ? err.message : String(err));
  }
  await sendWhatsAppText(phone, buildCustomerSummary(text));
  await sendWhatsAppImage(phone, ELKAYAM_LOGO_URL, "אלקיים סימון כבישים בע״מ");
  await clearExternalState(phone);
}
