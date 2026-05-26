/** Shared WhatsApp gateway types (kept separate to avoid gateway↔master cycles). */

export type SenderRole = "master" | "external";

export interface InboundClassification {
  senderRole: SenderRole;
  routedBy: "jarvis_gateway";
  targetFlow: "jarvis_master" | "elkayam_order_intake";
}

/** A normalized inbound WhatsApp message (text, media, or interactive reply). */
export interface InboundMessage {
  waMessageId: string;
  senderId: string;
  contactName: string | null;
  type: string; // 'text' | 'image' | 'document' | 'interactive' | ...
  body: string | null; // text body, media caption, or interactive reply title
  media?: {
    id: string;
    mimeType: string | null;
    kind: "image" | "document";
    filename?: string | null;
  } | null;
  /** Stable id from a tapped reply button / list row (e.g. "main.orders", "nav.back"). */
  interactiveId?: string | null;
}
