import "server-only";
import type { Skill, SkillContext, SkillResult } from "../../types";
import { text } from "../../types";
import { logDocument } from "./store";
import { persistMediaForOcr } from "./storage";

/**
 * OCR / Document skill — OWNER-only (external documents are handled as customer-intake
 * attachments by the Order Intake path, not here).
 *
 * Stage 1: receive media → audit-log it (jarvis_documents) → honest reply offering next
 * actions. The OCR engine exists (see analyze.ts → tesseract), but is NOT run inline here
 * to protect the WhatsApp webhook's fast-ack to Meta; in-chat extraction is the documented
 * async next step. We never fake extracted text.
 */

const ASK_FOR_DOC =
  "שלח לי עכשיו צילום, PDF או מסמך ואטפל בו. ('תפריט' לחזרה)";

const QUEUED_OWNER =
  "קיבלתי את המסמך 📄 ושלחתי אותו לעיבוד ברקע. ברגע שאסיים לקרוא, התוצאה תופיע ברשומת המסמך.\n" +
  "בינתיים מה תרצה? כתוב: 'צור הזמנה' / 'העבר ל-CEO' / 'שמור כפתק'.";
const LOGGED_OWNER =
  "קיבלתי את המסמך 📄 ושמרתי הפניה אליו (קריאה אוטומטית עדיין בהקמה — לא אמציא תוכן).\n" +
  "מה תרצה? כתוב: 'צור הזמנה' / 'העבר ל-CEO' / 'שמור כפתק'.";

export const ocrDocumentSkill: Skill = {
  name: "ocrDocument",
  async handle(ctx: SkillContext): Promise<SkillResult> {
    const { channel, senderId, senderRole, media } = ctx.input;

    if (media) {
      const docId = await logDocument({
        channel,
        senderPhone: senderId,
        senderRole,
        mediaId: media.id,
        mediaKind: media.kind,
        mimeType: media.mimeType,
        caption: ctx.input.text ?? null,
        status: "received",
      });
      // Best-effort: persist the bytes now (Meta URLs expire) + queue for the async worker.
      let queued = false;
      if (docId) {
        queued = await persistMediaForOcr({ docId, channel, mediaId: media.id, senderRole });
      }
      return { handled: true, messages: [text(queued ? QUEUED_OWNER : LOGGED_OWNER)] };
    }

    // OCR intent but no file yet → prompt to send one.
    return { handled: true, messages: [text(ASK_FOR_DOC)] };
  },
};
