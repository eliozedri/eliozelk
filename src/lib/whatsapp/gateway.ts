import "server-only";
import { isMasterPhone } from "./phone";
import { createWhatsAppDraft } from "./intake";
import { sendWhatsAppText } from "./send";
import { handleMasterMessage } from "./master";
import type { InboundClassification, InboundMessage } from "./types";

export type { SenderRole, InboundClassification, InboundMessage } from "./types";

/**
 * Jarvis WhatsApp Gateway — single entry point for every inbound message.
 * Classifies the sender and routes:
 *   - master/owner  → Jarvis Master Mode (stateful personal-assistant menu)
 *   - everyone else → Elkayam customer intake (pending draft + professional reply)
 * External senders NEVER reach master capabilities and never create a work_order.
 */

/** Professional Elkayam intake reply for external senders (unchanged copy). */
const EXTERNAL_ACK =
  "שלום 👋 קיבלנו את פנייתך לאלקיים סימון כבישים. ההודעה הועברה לצוות לבדיקה ונחזור אליך בהקדם. תודה רבה!";

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

  // External customer: only text becomes a pending draft. Any inbound (text or media)
  // still gets the professional acknowledgement; admin/menu capabilities are never shown.
  if (inbound.type === "text" && inbound.body) {
    try {
      await createWhatsAppDraft({
        waMessageId: inbound.waMessageId,
        senderId: inbound.senderId,
        contactName: inbound.contactName,
        body: inbound.body,
      });
    } catch (err) {
      console.error("[whatsapp:gateway] external draft failed:", err instanceof Error ? err.message : String(err));
    }
  }
  await sendWhatsAppText(inbound.senderId, EXTERNAL_ACK);
}
