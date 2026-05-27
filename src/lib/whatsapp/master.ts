import "server-only";
import { sendWhatsAppText } from "./send";
import { sendWhatsAppImage } from "./interactive";
import { createWhatsAppDraft } from "./intake";
import { createMasterItem, pendingDraftsSummary, type MasterItemKind } from "./masterItems";
import { loadMasterFlow, saveMasterFlow, resetMasterFlow, type MasterFlow } from "./masterSession";
import {
  sendMainMenu, sendOrdersMenu, sendPersonalMenu, sendSettingsMenu,
  sendOrdersCreatePrompt, sendOcrPrompt, sendCeoPrompt, sendPersonalPrompt, sendDictationHelp,
} from "./masterMenus";
import { JARVIS_CUSTOMER_LINK } from "./assets";
import { isPureStarter } from "./summary";
import type { InboundMessage } from "./types";
import type { JarvisInput, Skill } from "@/lib/jarvis/types";
import { ceoManagerSkill } from "@/lib/jarvis/skills/ceoManager/skill";
import { ocrDocumentSkill } from "@/lib/jarvis/skills/ocrDocument/skill";
import { personalAreaSkill } from "@/lib/jarvis/skills/personalArea/skill";
import { generalAssistantSkill } from "@/lib/jarvis/skills/generalAssistant/skill";
import { developmentSkill } from "@/lib/jarvis/skills/development/skill";
import { imageCreativeSkill } from "@/lib/jarvis/skills/imageCreative/skill";
import { decideBrain } from "@/lib/jarvis/brain";
import { executeManagerDecision, formatDispatchReply } from "@/lib/jarvis/skills/ceoManager/dispatcher";
import { recordBrainAudit } from "@/lib/jarvis/audit";

/**
 * Jarvis Master Mode — owner-only stateful WhatsApp wizard.
 *
 * Reached only after the gateway confirmed a master number, so nothing here is ever
 * shown to external customers. Navigation is driven by stable interactive ids
 * (main.orders, nav.back…); typed numbers / Hebrew words are accepted as a fallback so
 * the wizard still works if interactive sends fail. Honest by design: CEO requests,
 * personal items, and documents are captured as PENDING records — never executed,
 * never faked. The only Elkayam write is a pending order DRAFT (never a work_order).
 */

// Confirmation copy (sent after a capture, before returning to the main menu).
const DRAFT_CREATED = "פתחתי טיוטת הזמנה חדשה ✅ ממתינה לאישור ב'הזמנות מהבוט'. אפשר לקדם אותה להזמנה משם.";

// Free-text intent detection is now centralized in the Brain (src/lib/jarvis/intent.ts);
// the owner free-text router delegates to it and routes to the matching skill.

// ── Owner adapter → Jarvis skills (channel-agnostic skills return messages) ──
function toJarvisInput(inbound: InboundMessage): JarvisInput {
  return {
    channel: "whatsapp",
    senderId: inbound.senderId,
    senderRole: "master",
    contactName: inbound.contactName,
    text: inbound.body,
    interactiveId: inbound.interactiveId ?? null,
    media: inbound.media ?? null,
    messageId: inbound.waMessageId,
  };
}
async function runSkill(inbound: InboundMessage, skill: Skill): Promise<string> {
  const { messages } = await skill.handle({ input: toJarvisInput(inbound) });
  const texts: string[] = [];
  for (const m of messages) {
    if (m.kind === "text") { await sendWhatsAppText(inbound.senderId, m.text); texts.push(m.text); }
    else await sendWhatsAppImage(inbound.senderId, m.imageUrl, m.caption);
  }
  return texts.join("\n");
}

const MENU_FLOWS: MasterFlow[] = ["main_menu", "orders_menu", "personal_menu", "settings_menu"];

// ── Entry point ──────────────────────────────────────────────────────────────

export async function handleMasterMessage(inbound: InboundMessage): Promise<void> {
  const phone = inbound.senderId;

  // 1. A tapped button / list row routes directly by its stable id (flow-independent).
  if (inbound.interactiveId) {
    return runAction(phone, inbound.interactiveId);
  }

  const flow = await loadMasterFlow(phone);

  // 2. Media (image/document) — MEDIA IS CONTEXT, NOT INTENT. Route through the Brain (caption +
  //    media metadata), never auto-OCR. Non-media (e.g. audio) with no handler falls through.
  if (inbound.type !== "text") {
    if (inbound.media) return handleOwnerMedia(inbound, flow);
    await sendWhatsAppText(phone, "קיבלתי הודעה שאינה טקסט. אפשר לכתוב לי מה לעשות 🙂");
    return;
  }

  const text = (inbound.body ?? "").trim();
  const lower = text.toLowerCase();

  // 3. Global word triggers.
  if (["תפריט", "menu", "ג׳ארוויס", "גארוויס"].includes(text) || lower === "jarvis") {
    return runAction(phone, "main");
  }
  if (text === "ביטול") return runAction(phone, "nav.cancel");
  if (text === "חזור") return runAction(phone, "main");

  // 4. Menu states: typed number = fallback for a tap; other text = intent router.
  if (MENU_FLOWS.includes(flow)) {
    const action = numericAction(flow, pickDigit(text));
    if (action) return runAction(phone, action);
    return freeTextRouter(inbound, text);
  }

  // 5. Content-capture states.
  switch (flow) {
    case "orders_create_wait":
      await createOwnerDraft(inbound, text);
      return confirmToMain(phone, DRAFT_CREATED);
    case "ceo_wait":
      await runSkill(inbound, ceoManagerSkill);
      return toMain(phone);
    case "personal_task_wait":
      return captureToMain(phone, "personal_task", text, "נשמר כמשימה ✅");
    case "personal_reminder_wait":
      return captureToMain(phone, "personal_reminder", text,
        "שמרתי כתזכורת ✅ — שים לב: תזכורות עדיין לא נשלחות אוטומטית, נשמרה כפריט ממתין.");
    case "personal_note_wait":
      return captureToMain(phone, "personal_note", text, "הפתק נשמר ✅");
    case "personal_medical_wait":
      return captureToMain(phone, "personal_medical", text,
        "נשמר כפתק אישי ✅ (איני נותן ייעוץ רפואי — נשמר כפתק/תזכורת בלבד).");
    case "ocr_wait":
      await sendWhatsAppText(phone, "שלח צילום או PDF, או כתוב 'תפריט' לחזרה.");
      return;
    case "idle":
    default:
      return freeTextRouter(inbound, text);
  }
}

// ── Action runner (shared by interactive ids and numeric fallback) ───────────

async function runAction(phone: string, action: string): Promise<void> {
  switch (action) {
    case "main":
    case "nav.main":
    case "nav.back":
      return toMain(phone);
    case "nav.cancel": {
      await resetMasterFlow(phone);
      await sendWhatsAppText(phone, "בוטל ✓ כתוב 'תפריט' בכל עת.");
      return;
    }

    case "main.orders":
    case "orders":
      await saveMasterFlow(phone, "orders_menu");
      return sendOrdersMenu(phone);
    case "main.ocr":
    case "ocr":
      await saveMasterFlow(phone, "ocr_wait");
      return sendOcrPrompt(phone);
    case "main.ceo":
    case "ceo":
      await saveMasterFlow(phone, "ceo_wait");
      return sendCeoPrompt(phone);
    case "main.personal":
    case "personal":
      await saveMasterFlow(phone, "personal_menu");
      return sendPersonalMenu(phone);
    case "main.settings":
    case "settings":
      await saveMasterFlow(phone, "settings_menu");
      return sendSettingsMenu(phone);
    case "help.dictation":
      await sendDictationHelp(phone);
      return toMain(phone);

    case "orders.create":
      await saveMasterFlow(phone, "orders_create_wait");
      return sendOrdersCreatePrompt(phone);
    case "orders.pending": {
      const { count, lines } = await pendingDraftsSummary();
      const body = count === 0
        ? "אין כרגע טיוטות ממתינות."
        : `יש ${count} טיוטות ממתינות:\n${lines.join("\n")}\n\nלאישור/קידום — מסך 'הזמנות מהבוט'.`;
      await sendWhatsAppText(phone, body);
      return toMain(phone);
    }

    case "personal.task":
      await saveMasterFlow(phone, "personal_task_wait");
      return sendPersonalPrompt(phone, "כתוב את המשימה ואשמור אותה.");
    case "personal.reminder":
      await saveMasterFlow(phone, "personal_reminder_wait");
      return sendPersonalPrompt(phone, "כתוב את התזכורת (ומתי, אם רלוונטי).");
    case "personal.note":
      await saveMasterFlow(phone, "personal_note_wait");
      return sendPersonalPrompt(phone, "כתוב את הפתק.");
    case "personal.medical":
      await saveMasterFlow(phone, "personal_medical_wait");
      return sendPersonalPrompt(phone, "כתוב את הפתק האישי/רפואי (נשמר כפתק בלבד).");
    case "personal.daily": {
      await createMasterItem({ sourcePhone: phone, kind: "daily_report_request", body: "בקשת דוח יומי" });
      const { count } = await pendingDraftsSummary();
      await sendWhatsAppText(
        phone,
        `📊 תמונת מצב מהירה: ${count} טיוטות ממתינות.\nרשמתי בקשה לדוח יומי מלא (הפקה אוטומטית עדיין לא פעילה).`,
      );
      return toMain(phone);
    }

    case "settings.whatsapp":
      await sendWhatsAppText(
        phone,
        "מצב WhatsApp: פעיל ✅ (מחובר ל-Cloud API).\n\nקישור הזמנה ללקוחות (לשיתוף — לחיצה פותחת וואטסאפ עם הודעה מוכנה):\n" +
          JARVIS_CUSTOMER_LINK,
      );
      return sendSettingsMenu(phone);
    case "settings.owner":
      await sendWhatsAppText(phone, "מצב זיהוי בעלים: פעיל ✅ — אתה מזוהה כבעלים.\nמצב ג׳ארוויס: Master Gateway פעיל.");
      return sendSettingsMenu(phone);

    default:
      return toMain(phone);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function toMain(phone: string): Promise<void> {
  await saveMasterFlow(phone, "main_menu");
  await sendMainMenu(phone);
}

async function confirmToMain(phone: string, confirm: string): Promise<void> {
  await sendWhatsAppText(phone, confirm);
  await toMain(phone);
}

async function captureToMain(phone: string, kind: MasterItemKind, body: string, confirm: string): Promise<void> {
  await createMasterItem({ sourcePhone: phone, kind, body });
  await confirmToMain(phone, confirm);
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

function pickDigit(text: string): string {
  return text.replace(/[^0-9]/g, "").slice(0, 1);
}

function numericAction(flow: MasterFlow, d: string): string | null {
  if (!d) return null;
  const maps: Partial<Record<MasterFlow, Record<string, string>>> = {
    main_menu: { "1": "orders", "2": "ocr", "3": "ceo", "4": "personal", "5": "settings", "0": "nav.cancel" },
    orders_menu: { "1": "orders.create", "2": "orders.pending", "3": "orders.create", "0": "main" },
    personal_menu: { "1": "personal.task", "2": "personal.reminder", "3": "personal.note", "4": "personal.daily", "5": "personal.medical", "0": "main" },
    settings_menu: { "1": "settings.whatsapp", "2": "settings.owner", "3": "main", "0": "main" },
  };
  return maps[flow]?.[d] ?? null;
}

// ── Free-text intent router (idle + non-numeric text in a menu) ──────────────

async function freeTextRouter(inbound: InboundMessage, text: string): Promise<void> {
  const phone = inbound.senderId;
  // Pre-filled wa.me starter (no details) → open the orders menu directly.
  if (isPureStarter(text)) {
    await sendWhatsAppText(phone, "פתחתי לך את תפריט ההזמנות 👇");
    await saveMasterFlow(phone, "orders_menu");
    return sendOrdersMenu(phone);
  }
  return routeOwnerDecision(inbound, text, false);
}

/**
 * Owner MEDIA handler — media is CONTEXT, not intent. Everything goes through the Brain:
 *  - explicit OCR mode (ocr_wait) + no contradicting caption → OCR the current media now;
 *  - caption present → Brain reasons from the caption (image+"תיצור"→creative, image+"קרא"→OCR, …);
 *  - no caption → ask what to do (read / create / save / forward), never assume OCR.
 */
async function handleOwnerMedia(inbound: InboundMessage, flow: MasterFlow): Promise<void> {
  const phone = inbound.senderId;
  const caption = (inbound.body ?? "").trim();
  const isReadIntent = /קרא|תקרא|סרוק|תסרוק|סריקה|תוציא\s+טקסט|מסמך|extract|ocr/i.test(caption);

  if (flow === "ocr_wait" && (!caption || isReadIntent)) {
    await runSkill(inbound, ocrDocumentSkill);
    return toMain(phone);
  }
  if (!caption) {
    await sendWhatsAppText(phone,
      "קיבלתי תמונה 📷 מה תרצה שאעשה איתה?\n• לקרוא/לסרוק טקסט (OCR)\n• ליצור/לערוך תמונה\n• לשמור כפתק\n• להעביר ל-CEO");
    return; // stay in place; the follow-up text will be routed by the Brain
  }
  return routeOwnerDecision(inbound, caption, true);
}

/**
 * Shared owner routing — REASONING-FIRST for BOTH text and media. ONE Brain decision (Gemini→Groq
 * LLM Router if enabled, else deterministic), then route to the chosen skill. Media metadata is
 * passed as CONTEXT to the Brain (never as the intent). Old handlers never decide before the Brain.
 */
async function routeOwnerDecision(inbound: InboundMessage, text: string, hasMedia: boolean): Promise<void> {
  const phone = inbound.senderId;
  const decision = await decideBrain({
    text, role: "master", channel: "whatsapp",
    state: hasMedia ? { media: inbound.media?.kind ?? "image" } : undefined,
  });
  const auditText = hasMedia ? `[media:${inbound.media?.kind ?? "image"}] ${text}` : text;

  if (decision.coarseIntent === "ceo_manager") {
    const result = await executeManagerDecision(decision, { text, sourcePhone: phone, channel: "whatsapp", msgId: inbound.waMessageId });
    await sendWhatsAppText(phone, formatDispatchReply(result));
    return toMain(phone);
  }

  let outgoing = "";
  switch (decision.coarseIntent) {
    case "personal":
    case "status":
      outgoing = await runSkill(inbound, personalAreaSkill);
      break;
    case "general":
      outgoing = await runSkill(inbound, generalAssistantSkill);
      break;
    case "development":
      outgoing = await runSkill(inbound, developmentSkill);
      break;
    case "creative":
      outgoing = await runSkill(inbound, imageCreativeSkill);
      break;
    case "order_intake":
      await createOwnerDraft(inbound, text);
      outgoing = DRAFT_CREATED;
      break;
    case "ocr_document":
      if (hasMedia) {
        // The image/document is already here → OCR it now (do not prompt for another).
        outgoing = await runSkill(inbound, ocrDocumentSkill);
      } else {
        outgoing = "(הופנה לסריקת מסמך)";
        await recordBrainAudit({ decision, senderRole: "master", channel: "whatsapp", msgId: inbound.waMessageId, inboundText: auditText, outgoingSummary: outgoing });
        await saveMasterFlow(phone, "ocr_wait");
        return sendOcrPrompt(phone);
      }
      break;
    case "greeting":
      if (!hasMedia) {
        await recordBrainAudit({ decision, senderRole: "master", channel: "whatsapp", msgId: inbound.waMessageId, inboundText: auditText, outgoingSummary: "(תפריט ראשי)" });
        return runAction(phone, "main");
      }
      outgoing = "קיבלתי תמונה 📷 מה לעשות איתה? לקרוא (OCR) · ליצור/לערוך תמונה · לשמור כפתק · להעביר ל-CEO";
      await sendWhatsAppText(phone, outgoing);
      break;
    default:
      outgoing = decision.clarificationQuestion ?? (hasMedia
        ? "קיבלתי תמונה 📷 מה לעשות איתה? לקרוא (OCR) · ליצור/לערוך תמונה · לשמור כפתק · להעביר ל-CEO"
        : "לא בטוח שהבנתי 🙂 הנה התפריט:");
      await sendWhatsAppText(phone, outgoing);
      break;
  }
  await recordBrainAudit({ decision, senderRole: "master", channel: "whatsapp", msgId: inbound.waMessageId, inboundText: auditText, outgoingSummary: outgoing, safetyResult: decision.requiresClarification ? "clarify" : "accept" });
  return toMain(phone);
}
