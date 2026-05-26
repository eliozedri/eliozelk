import "server-only";
import type { Skill, SkillContext, SkillResult } from "../../types";
import { text } from "../../types";
import { logDocument } from "./store";

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

const RECEIVED_OWNER =
  "קיבלתי את המסמך 📄 ושמרתי הפניה אליו.\n" +
  "קריאה אוטומטית של מסמכים מוואטסאפ נמצאת בהקמה (מנוע ה-OCR קיים, החיבור החי בתהליך) — לא אמציא תוכן.\n" +
  "בינתיים מה תרצה? כתוב: 'צור הזמנה' / 'העבר ל-CEO' / 'שמור כפתק'.";

export const ocrDocumentSkill: Skill = {
  name: "ocrDocument",
  async handle(ctx: SkillContext): Promise<SkillResult> {
    const { channel, senderId, senderRole, media } = ctx.input;

    if (media) {
      await logDocument({
        channel,
        senderPhone: senderId,
        senderRole,
        mediaId: media.id,
        mediaKind: media.kind,
        mimeType: media.mimeType,
        caption: ctx.input.text ?? null,
        status: "received",
      });
      return { handled: true, messages: [text(RECEIVED_OWNER)] };
    }

    // OCR intent but no file yet → prompt to send one.
    return { handled: true, messages: [text(ASK_FOR_DOC)] };
  },
};
