import "server-only";
import { isMasterPhone } from "./phone";
import { createWhatsAppDraft } from "./intake";
import { sendWhatsAppText } from "./send";
import { handleMasterMessage } from "./master";

/**
 * Jarvis WhatsApp Gateway.
 *
 * Single entry point for every inbound WhatsApp text. It classifies the sender and
 * routes accordingly:
 *   - master/owner  → Jarvis Master Mode (personal assistant; safe foundation)
 *   - everyone else → Elkayam customer intake (pending draft + professional reply)
 *
 * The gateway never exposes master/admin capabilities to external senders, and never
 * creates a real work_order — external messages only ever become pending drafts.
 */

export type SenderRole = "master" | "external";

export interface InboundClassification {
  senderRole: SenderRole;
  routedBy: "jarvis_gateway";
  targetFlow: "jarvis_master" | "elkayam_order_intake";
}

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
  args: { waMessageId: string; senderId: string; contactName: string | null; body: string },
  classification: InboundClassification,
): Promise<void> {
  if (classification.senderRole === "master") {
    await handleMasterMessage(args);
    return;
  }

  // External customer: pending draft (source=whatsapp) + professional Hebrew reply.
  // Best-effort draft so an intake failure never blocks the acknowledgement.
  try {
    await createWhatsAppDraft({
      waMessageId: args.waMessageId,
      senderId: args.senderId,
      contactName: args.contactName,
      body: args.body,
    });
  } catch (err) {
    console.error("[whatsapp:gateway] external draft failed:", err instanceof Error ? err.message : String(err));
  }
  await sendWhatsAppText(args.senderId, EXTERNAL_ACK);
}
