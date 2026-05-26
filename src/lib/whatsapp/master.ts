import "server-only";
import { sendWhatsAppText } from "./send";
import { createWhatsAppDraft } from "./intake";

/**
 * Jarvis Master Mode (owner-only).
 *
 * Reached only after the gateway has confirmed the sender is a configured master
 * number. This is the SAFE FOUNDATION, not the full assistant brain:
 *   - It always sends an owner-mode Hebrew acknowledgement.
 *   - It creates an Elkayam order draft ONLY when the owner message clearly asks for
 *     one (explicit keyword intent) — never by default.
 *   - It performs NO destructive/sensitive actions. Future management commands
 *     (CEO/manager agent, tasks/reminders) plug in at the marked seam and must
 *     require explicit confirmation for risky actions.
 *
 * The inbound message is already logged to whatsapp_messages by the webhook, so no
 * separate master log table is created here (YAGNI).
 */

const OWNER_ACK =
  "שלום אליוז, ג׳ארוויס כאן. זיהיתי אותך כבעלים. אפשר לשלוח לי הוראות לניהול, תפעול או יצירת טיוטת הזמנה.";

const OWNER_DRAFT_ACK =
  "קיבלתי 👍 פתחתי טיוטת הזמנה חדשה והיא ממתינה לאישור במערכת (הזמנות מהבוט). אפשר לקדם אותה להזמנה רגילה משם.";

// Deterministic explicit-intent detection (foundation seam — a future NLU/LLM brain
// can replace this). Matches clear "create an order draft" phrasings in Hebrew.
const ORDER_DRAFT_INTENT =
  /(צור|פתח|הוסף|תפתח|תוסיף|תיצור)\s+(לי\s+)?(טיוטת\s+)?הזמנה|טיוטת\s+הזמנה|הזמנה\s+חדשה/;

export function wantsOrderDraft(text: string): boolean {
  return ORDER_DRAFT_INTENT.test(text);
}

export async function handleMasterMessage(args: {
  waMessageId: string;
  senderId: string;
  contactName: string | null;
  body: string;
}): Promise<void> {
  if (wantsOrderDraft(args.body)) {
    // Owner explicitly asked for a draft → create it (pending review, source=whatsapp),
    // labelled as owner-initiated. This is a real draft, so its notification fires.
    try {
      await createWhatsAppDraft({
        waMessageId: args.waMessageId,
        senderId: args.senderId,
        contactName: args.contactName,
        body: args.body,
        submittedByName: "בעלים (WhatsApp)",
      });
    } catch (err) {
      console.error("[whatsapp:master] draft creation failed:", (err as Error).message);
    }
    await sendWhatsAppText(args.senderId, OWNER_DRAFT_ACK);
    return;
  }

  // ── Seam for future management commands (operational queries, CEO/manager agent,
  //    tasks/reminders). Until built, master messages are acknowledged + logged only;
  //    no internal action is taken and no customer-order notification is emitted. ──
  await sendWhatsAppText(args.senderId, OWNER_ACK);
}
