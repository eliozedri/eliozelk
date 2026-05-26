/** Shared WhatsApp gateway types (kept separate to avoid gateway↔master cycles). */

export type SenderRole = "master" | "external";

export interface InboundClassification {
  senderRole: SenderRole;
  routedBy: "jarvis_gateway";
  targetFlow: "jarvis_master" | "elkayam_order_intake";
}

/** A normalized inbound WhatsApp message (text or media). */
export interface InboundMessage {
  waMessageId: string;
  senderId: string;
  contactName: string | null;
  type: string; // 'text' | 'image' | 'document' | 'audio' | ...
  body: string | null; // text body or media caption
  media?: {
    id: string;
    mimeType: string | null;
    kind: "image" | "document";
    filename?: string | null;
  } | null;
}
