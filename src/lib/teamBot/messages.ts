import type { InlineButton, InlineKeyboard } from "./telegram";
import type { CartLine, TeamBotRole, TeamBotUser } from "./types";

/**
 * Hebrew copy + inline-keyboard builders for the Team Bot. Plain text only
 * (no parse_mode) so Hebrew, emoji, and punctuation never need escaping.
 */

const RULE = "━━━━━━━━━━━━━━";

// ── Callback-data vocabulary (kept short; Telegram caps data at 64 bytes) ────
export const CB = {
  HOME: "nav:home",
  CANCEL: "nav:cancel",
  CATALOG: "menu:catalog",
  CART: "menu:cart",
  FREETEXT: "menu:freetext",
  ORDERS: "menu:orders",
  MY_DRAFTS: "menu:mydrafts",
  HELP: "menu:help",
  ADMIN_REQUESTS: "menu:admin_requests",
  ADMIN_NEWCODE: "menu:admin_newcode",
  ENTER_CODE: "act:code",
  CART_SUBMIT: "cart:submit",
  CART_CLEAR: "cart:clear",
  SKIP_CITY: "submit:skipcity",
  SKIP_NOTES: "submit:skipnotes",
} as const;

// Telegram-admin approval callbacks (verified against the env allowlist).
export const CB_ADMIN_OK = "tbadm:ok:"; // tbadm:ok:<telegram_user_id>
export const CB_ADMIN_NO = "tbadm:no:"; // tbadm:no:<telegram_user_id>

// Dynamic callback-data prefixes (followed by an id / slug / index).
export const CB_DEPT = "dept:"; //  dept:<slug>
export const CB_DEPT_PAGE = "dp:"; // dp:<slug>:<page>
export const CB_ITEM = "it:"; //    it:<itemId>
export const CB_CART_RM = "crm:"; // crm:<index>
export const CB_DRAFT = "drf:"; //  drf:<draftId>

// Hebrew labels for a bot draft's review status (team_bot_order_drafts.status).
export const DRAFT_STATUS_LABELS: Record<string, string> = {
  pending_review: "ממתינה לאישור הצוות",
  promoted: "אושרה והפכה להזמנה",
  rejected: "נדחתה",
};

export const navRow = [
  { text: "🏠 תפריט ראשי", callback_data: CB.HOME },
  { text: "🚫 ביטול", callback_data: CB.CANCEL },
];

// ── Access-restricted screen (default-deny) ──────────────────────────────────

export function restrictedScreen(
  telegramUserId: string,
  status: "pending" | "rejected" | "inactive",
): { text: string; keyboard: InlineKeyboard } {
  const statusLine =
    status === "rejected"
      ? "בקשת הגישה שלך נדחתה. לפרטים פנה למנהל."
      : status === "inactive"
        ? "החשבון שלך הושבת. לחידוש גישה פנה למנהל."
        : "הבקשה שלך לגישה לבוט התקבלה וממתינה לאישור מנהל.";

  const text =
    `🔒 הגישה לבוט מוגבלת\n${RULE}\n` +
    `בוט זה מיועד לעובדי וצוותי אלקיים בלבד.\n\n` +
    `${statusLine}\n\n` +
    `מזהה Telegram שלך:\n${telegramUserId}`;

  return { text, keyboard: { inline_keyboard: [] } };
}

/** Sent to a brand-new user the moment their request is created. */
export const newRequestAck =
  "הבקשה שלך לגישה לבוט התקבלה וממתינה לאישור מנהל.";

// ── Admin alert (new access request) ─────────────────────────────────────────

export function adminAlert(user: {
  telegram_user_id: string;
  telegram_username: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  requested_at?: string | null;
}): { text: string; keyboard: InlineKeyboard } {
  const fullName =
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    user.display_name ||
    "—";
  const uname = user.telegram_username ? `@${user.telegram_username}` : "—";
  const when = user.requested_at
    ? new Date(user.requested_at).toLocaleString("he-IL")
    : "—";

  const text =
    `🔔 בקשת גישה חדשה לבוט הצוות\n${RULE}\n` +
    `שם: ${fullName}\n` +
    `שם משתמש: ${uname}\n` +
    `מזהה Telegram: ${user.telegram_user_id}\n` +
    `התקבלה: ${when}`;

  const rows: InlineButton[][] = [
    [
      { text: "✅ אשר משתמש", callback_data: `${CB_ADMIN_OK}${user.telegram_user_id}` },
      { text: "🚫 דחה משתמש", callback_data: `${CB_ADMIN_NO}${user.telegram_user_id}` },
    ],
  ];
  const webUrl = process.env.TEAM_BOT_WEB_URL;
  if (webUrl) {
    rows.push([{ text: "🖥 פתח במערכת", url: `${webUrl.replace(/\/$/, "")}/team-bot-users` }]);
  }
  return { text, keyboard: { inline_keyboard: rows } };
}

export function adminDecisionApplied(approved: boolean, name: string): string {
  return approved
    ? `✅ ${name} אושר/ה. נשלחה הודעה למשתמש.`
    : `🚫 ${name} נדחה/תה.`;
}

export const promptEnterCode =
  "🔑 הזן את קוד הכניסה שקיבלת מהמנהל (לדוגמה: ELK-XXXX-XXXX):";

export function codeResultMessage(role: TeamBotRole): string {
  const roleLabel = ROLE_LABELS[role];
  return `✅ הקוד אומת! קיבלת גישה כ־${roleLabel}.\nשולח את התפריט הראשי...`;
}

export const codeInvalidMessage =
  "❌ הקוד אינו תקין, פג תוקף, או נוצל במלואו.\nנסה שוב או פנה למנהל.";

// ── Main menu ─────────────────────────────────────────────────────────────────

export const ROLE_LABELS: Record<TeamBotRole, string> = {
  admin: "מנהל",
  authorized_user: "משתמש מורשה",
  viewer: "צופה",
};

export function mainMenu(user: TeamBotUser): { text: string; keyboard: InlineKeyboard } {
  const name = user.display_name ? `, ${user.display_name}` : "";
  const text =
    `👷 בוט צוות — אלקיים\n${RULE}\n` +
    `שלום${name} 👋\nבחר פעולה:`;

  const rows: { text: string; callback_data: string }[][] = [];

  if (user.role === "admin" || user.role === "authorized_user") {
    rows.push([{ text: "📚 קטלוג ובניית הזמנה", callback_data: CB.CATALOG }]);
    rows.push([{ text: "🛒 הסל שלי", callback_data: CB.CART }]);
    rows.push([{ text: "📋 הזמנה בטקסט חופשי", callback_data: CB.FREETEXT }]);
    rows.push([{ text: "🧾 ההזמנות שלי מהבוט", callback_data: CB.MY_DRAFTS }]);
  }
  rows.push([{ text: "📂 הזמנות פתוחות במערכת", callback_data: CB.ORDERS }]);
  rows.push([{ text: "❓ עזרה", callback_data: CB.HELP }]);

  if (user.role === "admin") {
    rows.push([{ text: "🔐 בקשות גישה", callback_data: CB.ADMIN_REQUESTS }]);
    rows.push([{ text: "➕ יצירת קוד גישה", callback_data: CB.ADMIN_NEWCODE }]);
  }

  return { text, keyboard: { inline_keyboard: rows } };
}

export function helpScreen(user: TeamBotUser): { text: string; keyboard: InlineKeyboard } {
  const canOrder = user.role === "admin" || user.role === "authorized_user";
  const lines = [
    "❓ עזרה — בוט צוות אלקיים",
    RULE,
    "הבוט מאפשר:",
    canOrder ? "• בניית הזמנה מתוך הקטלוג הפעיל ושליחתה כטיוטה" : null,
    canOrder ? "• שליחת הזמנה בטקסט חופשי" : null,
    canOrder ? "• 🧾 ההזמנות שלי מהבוט — הטיוטות ששלחת והסטטוס שלהן" : null,
    "• 📂 הזמנות פתוחות במערכת — הזמנות עבודה פעילות (לקריאה בלבד)",
    "",
    "שים לב — שתי תצוגות שונות:",
    "🧾 \"ההזמנות שלי מהבוט\" = מה ששלחת דרך הבוט (טיוטות שממתינות לאישור).",
    "📂 \"הזמנות פתוחות במערכת\" = הזמנות עבודה רשמיות שכבר קיימות במערכת.",
    "טיוטה מהבוט מופיעה תחת \"הזמנות פתוחות\" רק לאחר שהצוות אישר אותה.",
    "",
    "כל הזמנה שנשלחת דרך הבוט נרשמת כ\"הזמנה דרך הבוט מהטלגרם\".",
    "",
    "פקודות: /start — התחלה,  /menu — תפריט ראשי,  /cancel — ביטול",
  ].filter(Boolean) as string[];
  return {
    text: lines.join("\n"),
    keyboard: { inline_keyboard: [[{ text: "🏠 תפריט ראשי", callback_data: CB.HOME }]] },
  };
}

// ── Admin: access requests ────────────────────────────────────────────────────

export function adminRequestsScreen(
  pending: TeamBotUser[],
): { text: string; keyboard: InlineKeyboard } {
  if (pending.length === 0) {
    return {
      text: `🔐 בקשות גישה\n${RULE}\nאין בקשות ממתינות.`,
      keyboard: { inline_keyboard: [[{ text: "🏠 תפריט ראשי", callback_data: CB.HOME }]] },
    };
  }
  const rows: { text: string; callback_data: string }[][] = [];
  const lines = [`🔐 בקשות גישה ממתינות (${pending.length})`, RULE];
  for (const u of pending) {
    const label = u.display_name || u.telegram_username || u.telegram_user_id;
    lines.push(`• ${label}  (ID: ${u.telegram_user_id})`);
    rows.push([
      { text: `✅ אשר ${label}`.slice(0, 40), callback_data: `${CB_ADMIN_OK}${u.telegram_user_id}` },
      { text: "🚫 דחה", callback_data: `${CB_ADMIN_NO}${u.telegram_user_id}` },
    ]);
  }
  rows.push([{ text: "🏠 תפריט ראשי", callback_data: CB.HOME }]);
  return { text: lines.join("\n"), keyboard: { inline_keyboard: rows } };
}

// ── Cart rendering (shared with TB-2) ──────────────────────────────────────────

export function renderCartLines(cart: CartLine[]): string {
  if (cart.length === 0) return "הסל ריק.";
  return cart
    .map((l, i) => {
      const unit = l.unit ? ` ${l.unit}` : "";
      const note = l.notes ? ` — ${l.notes}` : "";
      return `${i + 1}. ${l.name} ×${l.quantity}${unit}${note}`;
    })
    .join("\n");
}

export const cancelledMessage = "🚫 הפעולה בוטלה. הסל נוקה.";

// ── Catalog & cart (TB-2) ──────────────────────────────────────────────────────

const homeRow = [{ text: "🏠 תפריט ראשי", callback_data: CB.HOME }];

export function departmentsScreen(
  depts: { slug: string; label: string; emoji: string; count: number }[],
): { text: string; keyboard: InlineKeyboard } {
  const rows = depts
    .filter((d) => d.count > 0)
    .map((d) => [
      { text: `${d.emoji} ${d.label} (${d.count})`, callback_data: `${CB_DEPT}${d.slug}` },
    ]);
  rows.push([{ text: "🛒 הסל שלי", callback_data: CB.CART }, ...homeRow]);
  return {
    text: `📚 קטלוג פעיל\n${RULE}\nבחר מחלקה:`,
    keyboard: { inline_keyboard: rows },
  };
}

export function itemsScreen(
  deptLabel: string,
  slug: string,
  items: { id: string; name: string; unit_of_measure: string | null; default_price: number | null }[],
  page: number,
  total: number,
  pageSize: number,
): { text: string; keyboard: InlineKeyboard } {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rows: { text: string; callback_data: string }[][] = items.map((it) => {
    const unit = it.unit_of_measure ? ` (${it.unit_of_measure})` : "";
    return [{ text: `${it.name}${unit}`.slice(0, 60), callback_data: `${CB_ITEM}${it.id}` }];
  });

  const nav: { text: string; callback_data: string }[] = [];
  if (page > 1) nav.push({ text: "◀️ הקודם", callback_data: `${CB_DEPT_PAGE}${slug}:${page - 1}` });
  if (page < totalPages) nav.push({ text: "הבא ▶️", callback_data: `${CB_DEPT_PAGE}${slug}:${page + 1}` });
  if (nav.length) rows.push(nav);

  rows.push([
    { text: "↩️ מחלקות", callback_data: CB.CATALOG },
    { text: "🛒 הסל שלי", callback_data: CB.CART },
  ]);
  rows.push(homeRow);

  const body = items.length
    ? "בחר פריט להוספה לסל:"
    : "אין פריטים פעילים במחלקה זו.";
  return {
    text: `📦 ${deptLabel}\n${RULE}\n${body}\n(עמוד ${page}/${totalPages})`,
    keyboard: { inline_keyboard: rows },
  };
}

export function quantityPrompt(itemName: string, unit: string | null): string {
  const u = unit ? ` (ביחידות: ${unit})` : "";
  return `כמה ${itemName} להוסיף?${u}\nהקלד מספר (לדוגמה: 10).`;
}

export function quantityInvalid(): string {
  return "❌ כמות לא תקינה. הקלד מספר חיובי (לדוגמה: 5).";
}

export function addedToCart(itemName: string, qty: number, cartCount: number): {
  text: string;
  keyboard: InlineKeyboard;
} {
  return {
    text: `✅ נוסף לסל: ${itemName} ×${qty}\nבסל כעת ${cartCount} פריטים.`,
    keyboard: {
      inline_keyboard: [
        [{ text: "➕ הוסף עוד", callback_data: CB.CATALOG }],
        [{ text: "🛒 לסל ולשליחה", callback_data: CB.CART }],
        homeRow[0] ? homeRow : [],
      ].filter((r) => r.length) as { text: string; callback_data: string }[][],
    },
  };
}

export function cartScreen(cart: CartLine[]): { text: string; keyboard: InlineKeyboard } {
  if (cart.length === 0) {
    return {
      text: `🛒 הסל שלי\n${RULE}\nהסל ריק.\nהוסף פריטים מהקטלוג.`,
      keyboard: {
        inline_keyboard: [[{ text: "📚 לקטלוג", callback_data: CB.CATALOG }], homeRow],
      },
    };
  }
  const rows: { text: string; callback_data: string }[][] = cart.map((l, i) => [
    { text: `🗑 ${i + 1}. ${l.name} ×${l.quantity}`.slice(0, 60), callback_data: `${CB_CART_RM}${i}` },
  ]);
  rows.push([{ text: "📚 הוסף עוד", callback_data: CB.CATALOG }, { text: "🧹 נקה סל", callback_data: CB.CART_CLEAR }]);
  rows.push([{ text: "✅ שליחת הזמנה", callback_data: CB.CART_SUBMIT }]);
  rows.push(homeRow);
  return {
    text: `🛒 הסל שלי\n${RULE}\n${renderCartLines(cart)}\n\nלהסרת פריט — לחץ עליו.`,
    keyboard: { inline_keyboard: rows },
  };
}

export const customerPrompt =
  "👤 שם הלקוח / החברה עבור ההזמנה?\nהקלד את השם.";

export function cityPrompt(): { text: string; keyboard: InlineKeyboard } {
  return {
    text: "📍 עיר / מיקום (לא חובה).\nהקלד עיר או דלג.",
    keyboard: { inline_keyboard: [[{ text: "⏭ דלג", callback_data: CB.SKIP_CITY }]] },
  };
}

export function notesPrompt(): { text: string; keyboard: InlineKeyboard } {
  return {
    text: "📝 הערות להזמנה (לא חובה).\nהקלד הערה או דלג.",
    keyboard: { inline_keyboard: [[{ text: "⏭ דלג ושלח", callback_data: CB.SKIP_NOTES }]] },
  };
}

export const freetextPrompt =
  "📋 הזמנה בטקסט חופשי\nתאר את ההזמנה / בקשת העבודה בהודעה אחת.";

export function inactiveBlocked(names: string[]): { text: string; keyboard: InlineKeyboard } {
  return {
    text:
      `⚠️ לא ניתן לשלוח — חלק מהפריטים אינם פעילים יותר בקטלוג:\n` +
      names.map((n) => `• ${n}`).join("\n") +
      `\n\nהסר אותם מהסל ונסה שוב.`,
    keyboard: { inline_keyboard: [[{ text: "🛒 חזרה לסל", callback_data: CB.CART }], homeRow] },
  };
}

export function draftConfirmation(
  shortRef: string,
  customer: string | null,
  itemCount: number,
): { text: string; keyboard: InlineKeyboard } {
  const cust = customer ? `\nלקוח: ${customer}` : "";
  const items = itemCount > 0 ? `\nפריטים: ${itemCount}` : "";
  return {
    text:
      `✅ ההזמנה נשלחה כטיוטה!\n${RULE}\n` +
      `מספר טיוטה: ${shortRef}${cust}${items}\n\n` +
      `ההזמנה נרשמה כ"הזמנה דרך הבוט מהטלגרם" וממתינה לאישור הצוות במשרד.`,
    keyboard: { inline_keyboard: [homeRow] },
  };
}
