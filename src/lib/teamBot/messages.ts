import type { InlineKeyboard } from "./telegram";
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
  HELP: "menu:help",
  ADMIN_REQUESTS: "menu:admin_requests",
  ADMIN_NEWCODE: "menu:admin_newcode",
  ENTER_CODE: "act:code",
} as const;

export const navRow = [
  { text: "🏠 תפריט ראשי", callback_data: CB.HOME },
  { text: "🚫 ביטול", callback_data: CB.CANCEL },
];

// ── Access-restricted screen (default-deny) ──────────────────────────────────

export function restrictedScreen(
  telegramUserId: string,
  status: "pending" | "blocked" | "new",
): { text: string; keyboard: InlineKeyboard } {
  const statusLine =
    status === "blocked"
      ? "החשבון שלך חסום. פנה למנהל."
      : "הבקשה שלך נשלחה למנהל לאישור.\nאפשר גם להזין קוד כניסה שקיבלת מהמנהל.";

  const text =
    `🔒 הגישה לבוט מוגבלת\n${RULE}\n` +
    `בוט זה מיועד לעובדי וצוותי אלקיים בלבד.\n\n` +
    `${statusLine}\n\n` +
    `מזהה Telegram שלך:\n${telegramUserId}`;

  const keyboard: InlineKeyboard = {
    inline_keyboard:
      status === "blocked"
        ? []
        : [[{ text: "🔑 הזנת קוד כניסה", callback_data: CB.ENTER_CODE }]],
  };
  return { text, keyboard };
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
  }
  rows.push([{ text: "📂 הזמנות פתוחות", callback_data: CB.ORDERS }]);
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
    "• צפייה בהזמנות פתוחות (לקריאה בלבד)",
    "",
    "כל הזמנה שנשלחת דרך הבוט נרשמת כ\"הזמנה דרך הבוט מהטלגרם\"",
    "ועוברת לאישור הצוות במשרד לפני שהיא הופכת להזמנה רשמית.",
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
      { text: `✅ אשר ${label}`.slice(0, 40), callback_data: `adm:ok:${u.telegram_user_id}` },
      { text: "🚫 חסום", callback_data: `adm:no:${u.telegram_user_id}` },
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
