import "server-only";
import { isMasterPhone } from "./phone";
import { createWhatsAppDraft } from "./intake";
import { sendWhatsAppText } from "./send";
import { sendWhatsAppImage } from "./interactive";
import { buildCustomerSummary, isPureStarter } from "./summary";
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

/** Generic professional reply for external messages that aren't a clear text request. */
const EXTERNAL_ACK =
  "שלום 👋 קיבלנו את פנייתך לאלקיים סימון כבישים. ההודעה הועברה לצוות לבדיקה ונחזור אליך בהקדם. תודה רבה!";

/** Wizard intro shown when an external customer sends the bare pre-filled starter. */
const EXTERNAL_INTRO =
  "שלום 👋 הגעת לג׳ארוויס של אלקיים סימון כבישים.\nכדי לפתוח בקשת הזמנה, כתוב לי בקצרה מה צריך לבצע.";

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

  // ── External customer: intake only. Never a work_order, never the owner menu. ──
  if (inbound.type === "text" && inbound.body) {
    const phone = inbound.senderId;
    const text = inbound.body.trim();
    const awaiting = await isExternalAwaiting(phone);
    const bareStarter = isPureStarter(text);

    // Bare pre-filled starter (no details yet) → begin the guided wizard, ask for details.
    if (bareStarter && !awaiting) {
      await setExternalAwaiting(phone);
      await sendWhatsAppText(phone, EXTERNAL_INTRO);
      return;
    }
    // Still nothing concrete while awaiting → re-prompt instead of saving an empty draft.
    if (bareStarter && awaiting) {
      await sendWhatsAppText(phone, "כתוב לי בבקשה בקצרה מה צריך לבצע 🙂");
      return;
    }

    // Real details (either the customer's first full request, or their reply after the
    // intro): create a PENDING draft, send a structured summary + the Elkayam logo.
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
    return;
  }

  // Non-text external (media/etc.): acknowledge professionally, no draft.
  await sendWhatsAppText(inbound.senderId, EXTERNAL_ACK);
}
