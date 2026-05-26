import "server-only";
import type { Skill, SkillContext, SkillResult, OutboundMessage } from "../../types";
import { text, image } from "../../types";
import { addItems, removeItem, setQuantity, summarize, type OrderItem } from "./state";
import { extractItems, parseOrderEdit } from "./parse";
import {
  loadOrderSession, saveOrderSession, clearOrderSession,
  createOrderDraft, loadDraftItems, updateDraftItems, confirmDraft,
} from "./store";
import { looksLikeOrder, isPureGreetingOrNoise } from "@/lib/whatsapp/classify";
import { ELKAYAM_LOGO_URL } from "@/lib/whatsapp/assets";
import { logDocument } from "../ocrDocument/store";

/**
 * Order Intake — the first Jarvis skill. Channel-agnostic: it reads a JarvisInput and
 * returns OutboundMessage[]; the adapter sends them. Understands natural Hebrew
 * throughout (add / remove / correct quantity / confirm / cancel / representative), keeps
 * an editable draft in place (Option-2), and never creates a work_order.
 */

const LOGO = (): OutboundMessage => image(ELKAYAM_LOGO_URL, "אלקיים סימון כבישים בע״מ");

const INTRO =
  "שלום 👋 הגעת לג׳ארוויס של אלקיים סימון כבישים.\n" +
  "אפשר לפתוח כאן בקשת הזמנה בצורה פשוטה.\n" +
  "כתוב לי בקצרה מה צריך לבצע — למשל סוג העבודה, מיקום וכמות.";
const REPROMPT =
  "לא הצלחתי להבין את הפרטים בצורה מספיק ברורה. אפשר לכתוב בקצרה מה העבודה הדרושה, למשל: סוג עבודה, מיקום וכמות?";

const openingMsg = (items: OrderItem[]) =>
  "שלום 👋 קיבלנו את פנייתך לאלקיים סימון כבישים.\n\n" +
  "סיכום הפנייה כפי שהתקבלה אצלנו:\n" + summarize(items) +
  "\n\nאפשר להוסיף או לתקן בכתב, וכשהכול נכון כתוב 'מאשר'. הצוות יחזור אליך בהקדם.";
const updatedMsg = (lead: string, items: OrderItem[]) => `${lead}\n\nהסיכום המעודכן:\n${summarize(items)}\n\nמשהו נוסף? כשמוכן כתוב 'מאשר'.`;
const confirmMsg = (items: OrderItem[]) =>
  "מצוין! ✅ הפנייה סומנה כמוכנה לבדיקת הצוות ונחזור אליך בהקדם.\n\nסיכום סופי:\n" + summarize(items);

export const orderIntakeSkill: Skill = {
  name: "orderIntake",
  async handle(ctx: SkillContext): Promise<SkillResult> {
    const { senderId, contactName, messageId, media, channel, senderRole } = ctx.input;
    const body = (ctx.input.text ?? "").trim();
    const reply = (...messages: OutboundMessage[]): SkillResult => ({ handled: true, messages });

    // External document/media → log as a customer-intake attachment (no owner OCR).
    if (media) {
      await logDocument({
        channel, senderPhone: senderId, senderRole, mediaId: media.id, mediaKind: media.kind,
        mimeType: media.mimeType, caption: body || null, status: "received", routedAction: "customer_attachment",
      });
      return reply(text("קיבלנו את הקובץ וצירפנו לפנייתך 🙏 הצוות יבדוק ויחזור אליך בהקדם."));
    }

    const session = await loadOrderSession(senderId);

    // ── Active order: interpret the message as an edit / confirm / cancel ──
    if (session.draftId) {
      const items = await loadDraftItems(session.draftId);
      if (items) {
        const edit = parseOrderEdit(body);
        switch (edit.kind) {
          case "confirm":
            await confirmDraft(session.draftId);
            return reply(text(confirmMsg(items)), LOGO());
          case "cancel":
            await clearOrderSession(senderId);
            return reply(text("ביטלתי את הבקשה הנוכחית. אם תרצה לפתוח חדשה — כתוב לי מה צריך."));
          case "representative":
            return reply(text("אין בעיה 🙂 נציג מאלקיים יחזור אליך בהקדם. אפשר גם להשאיר כאן פרטים נוספים."));
          case "remove": {
            const { items: next, removed } = removeItem(items, edit.phrase);
            await updateDraftItems(session.draftId, next);
            return reply(text(updatedMsg(removed ? "הסרתי מהבקשה ✅" : "לא מצאתי פריט מתאים להסרה — הנה הסיכום הנוכחי:", next)));
          }
          case "setQty": {
            const { items: next, changed } = setQuantity(items, edit.phrase, edit.qty);
            await updateDraftItems(session.draftId, next);
            return reply(text(updatedMsg(changed ? "עדכנתי את הכמות ✅" : "לא מצאתי פריט מתאים לעדכון — הנה הסיכום הנוכחי:", next)));
          }
          case "add": {
            const next = addItems(items, edit.items);
            await updateDraftItems(session.draftId, next);
            return reply(text(updatedMsg("עדכנתי את הפנייה ✅", next)));
          }
          case "unclear":
          default:
            return reply(text(
              "לא הצלחתי להבין את העדכון. אפשר להוסיף ('תוסיף 10 קונוסים'), לתקן כמות ('בעצם 7 תמרורים'), להסיר ('תמחק את סימון החניה'), או לכתוב 'מאשר'.\n\n" +
              "הסיכום הנוכחי:\n" + summarize(items),
            ));
        }
      }
      // Draft vanished (promoted/removed) → start fresh below.
      await clearOrderSession(senderId);
    }

    // ── No active order ──
    if (looksLikeOrder(body)) {
      return startNewOrder(senderId, contactName, messageId, extractItems(body), reply);
    }
    if (session.awaiting && !isPureGreetingOrNoise(body)) {
      // Replied to the intro with something substantive (even without a keyword).
      const items = extractItems(body);
      if (items.length > 0) return startNewOrder(senderId, contactName, messageId, items, reply);
    }
    if (session.awaiting && isPureGreetingOrNoise(body)) {
      return reply(text(REPROMPT));
    }
    // First vague/greeting/starter message → guide into intake.
    await saveOrderSession(senderId, { awaiting: true });
    return reply(text(INTRO));
  },
};

async function startNewOrder(
  senderId: string,
  contactName: string | null,
  messageId: string,
  items: OrderItem[],
  reply: (...m: OutboundMessage[]) => SkillResult,
): Promise<SkillResult> {
  const draftId = await createOrderDraft({ senderId, contactName, items, messageId });
  if (draftId) await saveOrderSession(senderId, { draftId });
  return reply(text(openingMsg(items)), LOGO());
}
