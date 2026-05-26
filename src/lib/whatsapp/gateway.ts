import "server-only";
import { isMasterPhone } from "./phone";
import { sendWhatsAppText } from "./send";
import { sendWhatsAppImage } from "./interactive";
import { handleMasterMessage } from "./master";
import { runJarvis } from "@/lib/jarvis/orchestrator";
import type { JarvisInput } from "@/lib/jarvis/types";
import type { InboundClassification, InboundMessage } from "./types";

export type { SenderRole, InboundClassification, InboundMessage } from "./types";

/**
 * WhatsApp channel adapter for Jarvis.
 *
 * It does NOT own business logic. It (1) classifies sender role, (2) for external
 * customers normalizes the message into a JarvisInput and hands it to the Jarvis
 * orchestrator (Order Intake skill), then renders the returned messages, and (3) for the
 * owner routes to the WhatsApp owner-menu handler (still adapter-direct, pending its own
 * migration into the skill layer). External senders never reach owner capabilities and
 * never create a work_order.
 */

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
  // Owner: WhatsApp-specific menu (sends its own replies). Reusing the order skill for
  // the owner is a future step; today the owner menu stays here.
  if (classification.senderRole === "master") {
    await handleMasterMessage(inbound);
    return;
  }

  // External customer → Jarvis brain (Order Intake skill). Adapter just renders messages.
  const input: JarvisInput = {
    channel: "whatsapp",
    senderId: inbound.senderId,
    senderRole: "external",
    contactName: inbound.contactName,
    text: inbound.body,
    interactiveId: inbound.interactiveId ?? null,
    media: inbound.media ?? null,
    messageId: inbound.waMessageId,
  };

  const { messages } = await runJarvis(input);
  for (const msg of messages) {
    if (msg.kind === "text") await sendWhatsAppText(inbound.senderId, msg.text);
    else await sendWhatsAppImage(inbound.senderId, msg.imageUrl, msg.caption);
  }
}
