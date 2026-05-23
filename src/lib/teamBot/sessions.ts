import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import { emptySession, type SessionState } from "./types";

/** Per-user conversation state, persisted in team_bot_sessions. */

export async function loadSession(telegramUserId: string): Promise<SessionState> {
  const db = getServiceSupabase();
  const { data } = await db
    .from("team_bot_sessions")
    .select("state")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  const raw = (data?.state ?? null) as Partial<SessionState> | null;
  if (!raw || typeof raw !== "object") return emptySession();
  return {
    flow: raw.flow ?? "idle",
    cart: Array.isArray(raw.cart) ? raw.cart : [],
    pendingItem: raw.pendingItem ?? null,
    draft: raw.draft ?? {},
    department: raw.department ?? null,
    page: raw.page ?? 1,
    wizardMessageId: raw.wizardMessageId ?? null,
  };
}

export async function saveSession(
  telegramUserId: string,
  state: SessionState,
): Promise<void> {
  const db = getServiceSupabase();
  await db
    .from("team_bot_sessions")
    .upsert(
      { telegram_user_id: telegramUserId, state, updated_at: new Date().toISOString() },
      { onConflict: "telegram_user_id" },
    );
}

/**
 * Reset the flow but keep the cart (used by 🏠 / ↩️ and /start /menu). Also
 * clears the tracked active wizard message so the next render starts a fresh
 * message instead of editing a stale one buried in history.
 */
export async function resetFlow(telegramUserId: string, state: SessionState): Promise<void> {
  await saveSession(telegramUserId, {
    ...state,
    flow: "idle",
    pendingItem: null,
    department: null,
    page: 1,
    wizardMessageId: null,
  });
}

/** Full cancel — clears the cart and any in-progress draft. */
export async function clearSession(telegramUserId: string): Promise<void> {
  await saveSession(telegramUserId, emptySession());
}
