import "server-only";
import { sendWhatsAppText } from "./send";
import { sendWhatsAppButtons, sendWhatsAppList, sendWhatsAppImage } from "./interactive";
import { DICTATION_HELP_URLS } from "./assets";

/**
 * All owner-mode OUTBOUND messaging (interactive menus, prompts, dictation help).
 * Each menu tries an interactive message and falls back to a clean numbered/plain text
 * version if the interactive send fails — so the wizard degrades gracefully and the
 * router (master.ts) still understands typed numbers. Stable ids (main.orders, nav.back…)
 * drive routing, never the Hebrew labels.
 */

export const DICTATION_TIP =
  "💡 טיפ: לא נוח להקליד? לחץ על כפתור ההכתבה במקלדת של הטלפון, דבר חופשי, ושלח לי את הטקסט שנוצר — כך אבין את הבקשה מיד ואטפל בה במדויק.";

const NAV_MAIN = { id: "nav.main", title: "תפריט ראשי" };
const NAV_CANCEL = { id: "nav.cancel", title: "ביטול" };

// ── Main menu (list — 5 areas + dictation help) ──────────────────────────────

export async function sendMainMenu(to: string): Promise<void> {
  const ok = await sendWhatsAppList(
    to,
    "ג׳ארוויס — העוזר האישי שלך 👋\nמה נעשה?",
    "פתח תפריט",
    [
      { id: "main.orders", title: "📋 הזמנות וטיוטות" },
      { id: "main.ocr", title: "📄 סריקת מסמך / OCR" },
      { id: "main.ceo", title: "🧑‍💼 פנייה ל-CEO" },
      { id: "main.personal", title: "👤 האזור האישי" },
      { id: "main.settings", title: "⚙️ הגדרות" },
      { id: "help.dictation", title: "💡 הכתבה במקום הקלדה" },
    ],
    { sectionTitle: "תפריט ראשי" },
  );
  if (!ok) {
    await sendWhatsAppText(
      to,
      "ג׳ארוויס — העוזר האישי שלך 👋\nמה נעשה?\n" +
        "1. 📋 הזמנות וטיוטות\n2. 📄 סריקת מסמך / OCR\n3. 🧑‍💼 פנייה ל-CEO\n" +
        "4. 👤 האזור האישי\n5. ⚙️ הגדרות\n0. ביטול\n\n" +
        DICTATION_TIP,
    );
  }
}

// ── Orders submenu (reply buttons) ───────────────────────────────────────────

export async function sendOrdersMenu(to: string): Promise<void> {
  const ok = await sendWhatsAppButtons(to, "📋 הזמנות וטיוטות — מה תרצה?", [
    { id: "orders.create", title: "טיוטה חדשה" },
    { id: "orders.pending", title: "טיוטות ממתינות" },
    NAV_MAIN,
  ]);
  if (!ok) {
    await sendWhatsAppText(
      to,
      "📋 הזמנות וטיוטות — מה תרצה?\n1. ליצור טיוטה חדשה\n2. לבדוק טיוטות ממתינות\n0. חזור",
    );
  }
}

// ── Personal area (list) ─────────────────────────────────────────────────────

export async function sendPersonalMenu(to: string): Promise<void> {
  const ok = await sendWhatsAppList(
    to,
    "👤 האזור האישי — מה לנהל?",
    "בחר",
    [
      { id: "personal.task", title: "משימה / מטלה" },
      { id: "personal.reminder", title: "תזכורת" },
      { id: "personal.note", title: "פתק אישי" },
      { id: "personal.daily", title: "דוח יומי" },
      { id: "personal.medical", title: "אישי / רפואי" },
      { id: "nav.main", title: "תפריט ראשי" },
    ],
    { sectionTitle: "האזור האישי" },
  );
  if (!ok) {
    await sendWhatsAppText(
      to,
      "👤 האזור האישי — מה לנהל?\n1. משימה / מטלה\n2. תזכורת\n3. פתק אישי\n4. דוח יומי\n5. אישי / רפואי\n0. חזור",
    );
  }
}

// ── Settings (reply buttons) ─────────────────────────────────────────────────

export async function sendSettingsMenu(to: string): Promise<void> {
  const ok = await sendWhatsAppButtons(to, "⚙️ הגדרות ג׳ארוויס:", [
    { id: "settings.whatsapp", title: "סטטוס WhatsApp" },
    { id: "settings.owner", title: "זיהוי בעלים" },
    NAV_MAIN,
  ]);
  if (!ok) {
    await sendWhatsAppText(
      to,
      "⚙️ הגדרות ג׳ארוויס:\n1. סטטוס חיבור WhatsApp\n2. מצב זיהוי בעלים\n0. חזור",
    );
  }
}

// ── Prompts that wait for typed/sent content (text + back/cancel buttons) ─────

async function sendPromptWithNav(to: string, prompt: string): Promise<void> {
  const ok = await sendWhatsAppButtons(to, prompt, [NAV_MAIN, NAV_CANCEL]);
  if (!ok) await sendWhatsAppText(to, prompt + "\n('תפריט ראשי' / 'ביטול')");
}

export async function sendOrdersCreatePrompt(to: string): Promise<void> {
  await sendPromptWithNav(
    to,
    "כתוב לי את פרטי ההזמנה (לקוח, פריטים, כמויות, מיקום…) ואפתח טיוטה ממתינה לאישור.\n" + DICTATION_TIP,
  );
}
export async function sendOcrPrompt(to: string): Promise<void> {
  await sendPromptWithNav(to, "שלח לי עכשיו צילום, PDF או מסמך. אנסה לקרוא, לסכם, ולשאול מה לעשות איתו.");
}
export async function sendCeoPrompt(to: string): Promise<void> {
  await sendPromptWithNav(to, "כתוב לי מה להעביר ל-CEO / מנהל המערכת. אתעד את הבקשה ואסמן אותה לטיפול.");
}
export async function sendPersonalPrompt(to: string, what: string): Promise<void> {
  await sendPromptWithNav(to, what);
}

// ── Dictation help: short tip + the two keyboard screenshots ─────────────────

export async function sendDictationHelp(to: string): Promise<void> {
  await sendWhatsAppText(to, DICTATION_TIP);
  for (const url of DICTATION_HELP_URLS) {
    await sendWhatsAppImage(to, url, "כפתור ההכתבה במקלדת");
  }
}
