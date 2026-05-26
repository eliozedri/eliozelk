import "server-only";
import { sendWhatsAppText } from "./send";
import { createWhatsAppDraft } from "./intake";
import { createMasterItem, pendingDraftsSummary, type MasterItemKind } from "./masterItems";
import { loadMasterFlow, saveMasterFlow, resetMasterFlow, type MasterFlow } from "./masterSession";
import type { InboundMessage } from "./types";

/**
 * Jarvis Master Mode — owner-only WhatsApp personal assistant.
 *
 * A small, stateful menu. Reached only after the gateway confirmed the sender is a
 * master number, so nothing here is ever exposed to external customers. Honest by
 * design: it captures CEO requests / personal items / documents as PENDING records
 * and never claims an action ran that didn't. The only thing that touches Elkayam
 * data is an order DRAFT (pending review) — never a work_order.
 */

// ── Menu copy (concise, assistant-style Hebrew) ──────────────────────────────

// Owner-only guidance: encourage keyboard dictation-as-text (NOT WhatsApp voice notes —
// there is no backend audio transcription). Shown only inside Master Mode.
const DICTATION_TIP =
  "💡 טיפ: לא נוח להקליד? לחץ על כפתור ההכתבה במקלדת של הטלפון, דבר חופשי, ושלח לי את הטקסט שנוצר — כך אבין את הבקשה מיד ואטפל בה במדויק.";

const MAIN_MENU =
  "ג׳ארוויס — העוזר האישי שלך 👋\n" +
  "מה נעשה?\n" +
  "1. 📋 הזמנות וטיוטות\n" +
  "2. 📄 סריקת מסמך / OCR\n" +
  "3. 🧑‍💼 פנייה ל-CEO / מנהל המערכת\n" +
  "4. 👤 האזור האישי שלי\n" +
  "5. ⚙️ הגדרות\n" +
  "0. ביטול\n\n" +
  DICTATION_TIP;

const ORDERS_MENU =
  "📋 הזמנות וטיוטות — מה תרצה?\n" +
  "1. ליצור טיוטת הזמנה חדשה\n" +
  "2. לבדוק טיוטות ממתינות\n" +
  "3. להפוך הודעה לטיוטה\n" +
  "0. חזור";

const ORDERS_CREATE_PROMPT =
  "כתוב לי את פרטי ההזמנה (לקוח, פריטים, כמויות, מיקום…) ואפתח טיוטה ממתינה לאישור.\n" +
  DICTATION_TIP +
  "\n('חזור' לתפריט)";

const OCR_PROMPT =
  "שלח לי עכשיו צילום, PDF או מסמך. אנסה לקרוא, לסכם, ולשאול מה לעשות איתו. ('חזור' לתפריט)";

const OCR_RECEIVED =
  "קיבלתי את המסמך 📄 ושמרתי הפניה אליו. קריאה אוטומטית של מסמכים מוואטסאפ עדיין לא מחוברת — אעדכן כשתהיה זמינה. כתוב 'תפריט' להמשך.";

const CEO_PROMPT =
  "כתוב לי מה להעביר ל-CEO / מנהל המערכת. אתעד את הבקשה ואסמן אותה לטיפול. ('חזור')";

const PERSONAL_MENU =
  "👤 האזור האישי — מה לנהל?\n" +
  "1. משימה / מטלה חדשה\n" +
  "2. תזכורת\n" +
  "3. פתק אישי\n" +
  "4. דוח יומי\n" +
  "5. קטגוריה אישית / רפואית\n" +
  "0. חזור";

const SETTINGS_MENU =
  "⚙️ הגדרות ג׳ארוויס:\n" +
  "1. סטטוס חיבור WhatsApp\n" +
  "2. מצב זיהוי בעלים\n" +
  "3. חזרה לתפריט\n" +
  "0. חזור";

const DRAFT_CREATED =
  "פתחתי טיוטת הזמנה חדשה ✅ ממתינה לאישור ב'הזמנות מהבוט'. אפשר לקדם אותה להזמנה משם. ('תפריט')";

const CEO_SAVED =
  "תיעדתי את הבקשה ל-CEO/מנהל המערכת ✅ נשמרה כפעולה ממתינה (אין ביצוע אוטומטי עדיין — אעדכן כשיהיה). ('תפריט')";

// ── Intent detection (deterministic foundation; a future NLU/LLM can replace) ──

const ORDER_INTENT =
  /(צור|פתח|הוסף|תפתח|תוסיף|תיצור)\s+(לי\s+)?(טיוטת\s+)?הזמנה|טיוטת\s+הזמנה|הזמנה\s+חדשה/;
const REMINDER_INTENT = /תזכיר\s+לי|תזכורת|תרשום\s+(לי\s+)?משימה|משימה\s+חדשה/;
const OCR_INTENT = /קרא\s+(את\s+)?המסמך|תקרא|סרוק|סריקה|תסרוק/;
const CEO_INTENT = /תעביר\s+ל-?\s*(ceo|מנהל)|מנהל\s+המערכת|\bceo\b|תבדוק|תכין\s+(לי\s+)?דוח|בעיה\s+במערכת/i;

export function wantsOrderDraft(text: string): boolean {
  return ORDER_INTENT.test(text);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function reply(phone: string, text: string, nextFlow: MasterFlow): Promise<void> {
  await saveMasterFlow(phone, nextFlow);
  await sendWhatsAppText(phone, text);
}

async function createOwnerDraft(inbound: InboundMessage, text: string): Promise<void> {
  try {
    await createWhatsAppDraft({
      waMessageId: inbound.waMessageId,
      senderId: inbound.senderId,
      contactName: inbound.contactName,
      body: text,
      submittedByName: "בעלים (WhatsApp)",
    });
  } catch (err) {
    console.error("[whatsapp:master] owner draft failed:", (err as Error).message);
  }
}

async function savePersonal(phone: string, kind: MasterItemKind, body: string, confirm: string): Promise<void> {
  await createMasterItem({ sourcePhone: phone, kind, body });
  await reply(phone, confirm, "main_menu");
}

function pickDigit(text: string): string {
  return text.replace(/[^0-9]/g, "").slice(0, 1);
}

// ── Entry point ────────────────────────────────────────────────────────────

export async function handleMasterMessage(inbound: InboundMessage): Promise<void> {
  const phone = inbound.senderId;
  const flow = await loadMasterFlow(phone);

  // Media (image/document): only meaningful while awaiting a document for OCR.
  if (inbound.type !== "text") {
    if (inbound.media && flow === "ocr_wait") {
      await createMasterItem({
        sourcePhone: phone,
        kind: "document",
        body: inbound.body ?? inbound.media.filename ?? "(מסמך)",
        metadata: { media_id: inbound.media.id, mime: inbound.media.mimeType, kind: inbound.media.kind },
      });
      await reply(phone, OCR_RECEIVED, "main_menu");
    } else {
      await sendWhatsAppText(
        phone,
        "קיבלתי קובץ 📎 לקריאת מסמך בחר '2 · סריקת מסמך' מהתפריט (כתוב 'תפריט').",
      );
    }
    return;
  }

  const text = (inbound.body ?? "").trim();
  const lower = text.toLowerCase();

  // Global commands (work in any state).
  if (["תפריט", "menu", "ג׳ארוויס", "גארוויס"].includes(text) || lower === "jarvis") {
    return reply(phone, MAIN_MENU, "main_menu");
  }
  if (text === "ביטול") {
    await resetMasterFlow(phone);
    await sendWhatsAppText(phone, "בוטל ✓ לתפריט כתוב 'תפריט'.");
    return;
  }
  if (text === "חזור") {
    return reply(phone, MAIN_MENU, "main_menu");
  }

  const d = pickDigit(text);

  switch (flow) {
    case "main_menu":
      if (d === "1") return reply(phone, ORDERS_MENU, "orders_menu");
      if (d === "2") return reply(phone, OCR_PROMPT, "ocr_wait");
      if (d === "3") return reply(phone, CEO_PROMPT, "ceo_wait");
      if (d === "4") return reply(phone, PERSONAL_MENU, "personal_menu");
      if (d === "5") return reply(phone, SETTINGS_MENU, "settings_menu");
      if (d === "0") {
        await resetMasterFlow(phone);
        await sendWhatsAppText(phone, "בוטל ✓ כתוב 'תפריט' בכל עת.");
        return;
      }
      return reply(phone, "לא הבנתי 🙂 הנה התפריט:\n\n" + MAIN_MENU, "main_menu");

    case "orders_menu":
      if (d === "1" || d === "3") return reply(phone, ORDERS_CREATE_PROMPT, "orders_create_wait");
      if (d === "2") {
        const { count, lines } = await pendingDraftsSummary();
        const body = count === 0
          ? "אין כרגע טיוטות ממתינות. ('תפריט')"
          : `יש ${count} טיוטות ממתינות:\n${lines.join("\n")}\n\nלאישור/קידום — מסך 'הזמנות מהבוט'. ('תפריט')`;
        return reply(phone, body, "main_menu");
      }
      if (d === "0") return reply(phone, MAIN_MENU, "main_menu");
      return reply(phone, ORDERS_MENU, "orders_menu");

    case "orders_create_wait":
      await createOwnerDraft(inbound, text);
      return reply(phone, DRAFT_CREATED, "main_menu");

    case "ocr_wait":
      // They typed instead of sending a file.
      return reply(phone, "שלח צילום או PDF, או 'חזור' לתפריט.", "ocr_wait");

    case "ceo_wait":
      await createMasterItem({ sourcePhone: phone, kind: "ceo_request", body: text });
      return reply(phone, CEO_SAVED, "main_menu");

    case "personal_menu":
      if (d === "1") return reply(phone, "כתוב את המשימה ואשמור אותה.", "personal_task_wait");
      if (d === "2") return reply(phone, "כתוב את התזכורת (ומתי, אם רלוונטי).", "personal_reminder_wait");
      if (d === "3") return reply(phone, "כתוב את הפתק.", "personal_note_wait");
      if (d === "4") {
        await createMasterItem({ sourcePhone: phone, kind: "daily_report_request", body: "בקשת דוח יומי" });
        const { count } = await pendingDraftsSummary();
        return reply(
          phone,
          `📊 תמונת מצב מהירה: ${count} טיוטות ממתינות.\nרשמתי בקשה לדוח יומי מלא (הפקה אוטומטית עדיין לא פעילה). ('תפריט')`,
          "main_menu",
        );
      }
      if (d === "5") return reply(phone, "כתוב את הפתק האישי/רפואי (נשמר כפתק בלבד).", "personal_medical_wait");
      if (d === "0") return reply(phone, MAIN_MENU, "main_menu");
      return reply(phone, PERSONAL_MENU, "personal_menu");

    case "personal_task_wait":
      return savePersonal(phone, "personal_task", text, "נשמר כמשימה ✅ ('תפריט')");
    case "personal_reminder_wait":
      return savePersonal(
        phone, "personal_reminder", text,
        "שמרתי כתזכורת ✅ — שים לב: תזכורות עדיין לא נשלחות אוטומטית, נשמרה כפריט ממתין. ('תפריט')",
      );
    case "personal_note_wait":
      return savePersonal(phone, "personal_note", text, "הפתק נשמר ✅ ('תפריט')");
    case "personal_medical_wait":
      return savePersonal(
        phone, "personal_medical", text,
        "נשמר כפתק אישי ✅ (איני נותן ייעוץ רפואי — נשמר כפתק/תזכורת בלבד). ('תפריט')",
      );

    case "settings_menu":
      if (d === "1") return reply(phone, "מצב WhatsApp: פעיל ✅ (מחובר ל-Cloud API).", "settings_menu");
      if (d === "2")
        return reply(phone, "מצב זיהוי בעלים: פעיל ✅ — אתה מזוהה כבעלים.\nמצב ג׳ארוויס: Master Gateway פעיל.", "settings_menu");
      if (d === "3" || d === "0") return reply(phone, MAIN_MENU, "main_menu");
      return reply(phone, SETTINGS_MENU, "settings_menu");

    case "idle":
    default:
      return freeTextRouter(inbound, text);
  }
}

// ── Free-text intent router (idle state) ─────────────────────────────────────

async function freeTextRouter(inbound: InboundMessage, text: string): Promise<void> {
  const phone = inbound.senderId;

  // Reminder/task wins over CEO so "תזכיר לי לבדוק..." stays personal.
  if (REMINDER_INTENT.test(text)) {
    return savePersonal(
      phone, "personal_reminder", text,
      "שמרתי כתזכורת ✅ — שים לב: תזכורות עדיין לא נשלחות אוטומטית, נשמרה כפריט ממתין. ('תפריט')",
    );
  }
  if (wantsOrderDraft(text)) {
    await createOwnerDraft(inbound, text);
    return reply(phone, DRAFT_CREATED, "main_menu");
  }
  if (OCR_INTENT.test(text)) {
    return reply(phone, OCR_PROMPT, "ocr_wait");
  }
  if (CEO_INTENT.test(text)) {
    await createMasterItem({ sourcePhone: phone, kind: "ceo_request", body: text });
    return reply(phone, CEO_SAVED, "main_menu");
  }
  return reply(phone, "לא בטוח שהבנתי 🙂 הנה התפריט:\n\n" + MAIN_MENU, "main_menu");
}
