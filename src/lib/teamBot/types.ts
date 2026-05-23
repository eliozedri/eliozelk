/** Shared Team Bot types — Telegram update subset + domain state. */

export type TgUser = {
  id: number;
  is_bot?: boolean;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export type TgChat = { id: number; type?: string };

export type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
};

export type TgCallbackQuery = {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
};

export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
};

// ── Domain ──────────────────────────────────────────────────────────────────

export type TeamBotRole = "admin" | "authorized_user" | "viewer";
export type TeamBotStatus = "pending" | "approved" | "rejected" | "inactive";

export type TeamBotUser = {
  id: string;
  telegram_user_id: string;
  chat_id: string | null;
  telegram_username: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  role: TeamBotRole;
  status: TeamBotStatus;
  requested_at?: string | null;
};

export type CartLine = {
  catalog_item_id: string;
  name: string;
  unit: string | null;
  category: string | null;
  type: string | null;
  quantity: number;
  notes: string | null;
};

/**
 * Conversation flow. TB-1 only uses 'idle' and 'awaiting_code'. The remaining
 * states are introduced by TB-2 (catalog/cart) and reserved here so the
 * session shape is stable.
 */
export type SessionFlow =
  | "idle"
  | "awaiting_code"
  | "awaiting_quantity"
  | "awaiting_customer"
  | "awaiting_city"
  | "awaiting_notes"
  | "awaiting_freetext";

export type PendingItem = {
  catalog_item_id: string;
  name: string;
  unit: string | null;
  category: string | null;
  type: string | null;
};

export type SessionState = {
  flow: SessionFlow;
  cart: CartLine[];
  pendingItem?: PendingItem | null;
  draft?: { customer?: string; city?: string; notes?: string };
  /** breadcrumb for the catalog department being browsed (TB-2). */
  department?: string | null;
  page?: number;
};

export function emptySession(): SessionState {
  return { flow: "idle", cart: [] };
}
