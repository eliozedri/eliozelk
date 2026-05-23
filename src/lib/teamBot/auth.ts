import "server-only";
import { createHash, randomInt } from "crypto";
import { getServiceSupabase } from "@/lib/supabase/server";
import { sendMessage } from "./telegram";
import { adminAlert } from "./messages";
import type { TeamBotRole, TeamBotStatus, TeamBotUser, TgUser } from "./types";

/**
 * Default-deny access control for the Team Bot.
 *
 * Workflow: user starts bot -> a `pending` request row is created -> the
 * configured admin(s) get a Telegram alert -> admin approves/rejects from
 * Telegram (or the web view) -> status saved in DB -> user gets access.
 *
 * The bot uses the Supabase service role (bypasses RLS), so this module is
 * the ONLY gate between an inbound update and any data access. Only users
 * whose status is 'approved' may use bot features.
 *
 * "Admin" for approval purposes is defined by the TEAM_BOT_ADMIN_IDS env
 * allowlist — NOT by a button or a stored role. Approval callbacks must be
 * verified against this allowlist server-side.
 */

// ── Admin allowlist (env) ─────────────────────────────────────────────────────

export function adminIds(): string[] {
  return (process.env.TEAM_BOT_ADMIN_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAdminTelegramId(telegramUserId: string | number): boolean {
  return adminIds().includes(String(telegramUserId));
}

// ── Hashing / helpers ─────────────────────────────────────────────────────────

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function displayNameOf(u: TgUser): string {
  return [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || (u.username ?? "");
}

function rowToUser(r: Record<string, unknown>): TeamBotUser {
  return {
    id: String(r.id),
    telegram_user_id: String(r.telegram_user_id),
    chat_id: (r.chat_id as string) ?? null,
    telegram_username: (r.telegram_username as string) ?? null,
    display_name: (r.display_name as string) ?? null,
    first_name: (r.first_name as string) ?? null,
    last_name: (r.last_name as string) ?? null,
    role: (r.role as TeamBotRole) ?? "viewer",
    status: (r.status as TeamBotStatus) ?? "pending",
    requested_at: (r.requested_at as string) ?? null,
  };
}

// ── Resolve / create ───────────────────────────────────────────────────────────

/**
 * Find the user, or create a `pending` request on first contact. Telegram-IDs
 * in the env allowlist are auto-provisioned as approved admins (this is the
 * bootstrap: no code needed once TEAM_BOT_ADMIN_IDS is set). On a brand-new
 * pending request, the configured admins receive a Telegram alert.
 */
export async function resolveOrCreateUser(
  tgUser: TgUser,
  chatId?: number | string | null,
): Promise<TeamBotUser> {
  const db = getServiceSupabase();
  const telegramUserId = String(tgUser.id);
  const username = tgUser.username ?? null;
  const firstName = tgUser.first_name ?? null;
  const lastName = tgUser.last_name ?? null;
  const displayName = displayNameOf(tgUser) || null;
  const chat = chatId != null ? String(chatId) : null;
  const isAdmin = isAdminTelegramId(telegramUserId);

  const { data: existing } = await db
    .from("team_bot_users")
    .select("*")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (existing) {
    const patch: Record<string, unknown> = {};
    if (username && existing.telegram_username !== username) patch.telegram_username = username;
    if (displayName && existing.display_name !== displayName) patch.display_name = displayName;
    if (firstName && existing.first_name !== firstName) patch.first_name = firstName;
    if (lastName && existing.last_name !== lastName) patch.last_name = lastName;
    if (chat && existing.chat_id !== chat) patch.chat_id = chat;
    // Self-heal the configured admin so they always have working access.
    if (isAdmin && (existing.status !== "approved" || existing.role !== "admin")) {
      patch.status = "approved";
      patch.role = "admin";
      patch.approved_by = "env_allowlist";
      patch.approved_at = new Date().toISOString();
    }
    if (Object.keys(patch).length > 0) {
      await db.from("team_bot_users").update(patch).eq("telegram_user_id", telegramUserId);
      Object.assign(existing, patch);
    }
    return rowToUser(existing as Record<string, unknown>);
  }

  // New user.
  const base = {
    telegram_user_id: telegramUserId,
    chat_id: chat,
    telegram_username: username,
    display_name: displayName,
    first_name: firstName,
    last_name: lastName,
    requested_at: new Date().toISOString(),
  };

  if (isAdmin) {
    const { data: inserted } = await db
      .from("team_bot_users")
      .insert({ ...base, role: "admin", status: "approved", approved_by: "env_allowlist", approved_at: new Date().toISOString() })
      .select("*")
      .single();
    return rowToUser((inserted ?? base) as Record<string, unknown>);
  }

  const { data: inserted } = await db
    .from("team_bot_users")
    .insert({ ...base, role: "viewer", status: "pending" })
    .select("*")
    .single();

  const user = rowToUser((inserted ?? { ...base, role: "viewer", status: "pending" }) as Record<string, unknown>);
  // Alert admins about the new request (best-effort; never blocks the user).
  await notifyAdminsOfRequest(user).catch(() => {});
  return user;
}

/** Send the new-request alert to every configured admin. */
export async function notifyAdminsOfRequest(user: TeamBotUser): Promise<void> {
  const ids = adminIds();
  if (ids.length === 0) return; // no admin configured yet — surfaced in the web view
  const alert = adminAlert(user);
  for (const adminId of ids) {
    await sendMessage(adminId, alert.text, alert.keyboard).catch(() => {});
  }
}

// ── Status transitions ──────────────────────────────────────────────────────────

export async function approveUser(
  telegramUserId: string,
  approvedBy: string,
  role: TeamBotRole = "authorized_user",
): Promise<void> {
  const db = getServiceSupabase();
  await db
    .from("team_bot_users")
    .update({
      status: "approved",
      role,
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      rejected_at: null,
      rejected_by: null,
    })
    .eq("telegram_user_id", telegramUserId);
}

export async function rejectUser(telegramUserId: string, rejectedBy: string): Promise<void> {
  const db = getServiceSupabase();
  await db
    .from("team_bot_users")
    .update({ status: "rejected", rejected_by: rejectedBy, rejected_at: new Date().toISOString() })
    .eq("telegram_user_id", telegramUserId);
}

export async function deactivateUser(telegramUserId: string, by: string): Promise<void> {
  const db = getServiceSupabase();
  await db
    .from("team_bot_users")
    .update({ status: "inactive", rejected_by: by, rejected_at: new Date().toISOString() })
    .eq("telegram_user_id", telegramUserId);
}

export async function listUsersByStatus(status?: TeamBotStatus): Promise<TeamBotUser[]> {
  const db = getServiceSupabase();
  let q = db.from("team_bot_users").select("*").order("requested_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data } = await q;
  return (data ?? []).map((r) => rowToUser(r as Record<string, unknown>));
}

export async function listPendingUsers(): Promise<TeamBotUser[]> {
  return listUsersByStatus("pending");
}

/** Fetch chat_id for a user so we can notify them after a decision. */
export async function getUserChatId(telegramUserId: string): Promise<string | null> {
  const db = getServiceSupabase();
  const { data } = await db
    .from("team_bot_users")
    .select("chat_id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  return (data?.chat_id as string) ?? null;
}

// ── Access codes (secondary onboarding path) ────────────────────────────────────

export type RedeemResult =
  | { ok: true; role: TeamBotRole }
  | { ok: false; reason: "not_found" | "expired" | "exhausted" };

export async function redeemAccessCode(
  telegramUserId: string,
  rawCode: string,
): Promise<RedeemResult> {
  const db = getServiceSupabase();
  const hash = sha256Hex(rawCode.trim());

  const { data: codes } = await db
    .from("team_bot_access_codes")
    .select("*")
    .eq("code_hash", hash)
    .eq("active", true);

  if (!codes || codes.length === 0) return { ok: false, reason: "not_found" };

  const now = Date.now();
  const usable = codes.find((c) => {
    const notExpired = !c.expires_at || new Date(c.expires_at as string).getTime() > now;
    const underQuota = (c.used_count as number) < (c.max_uses as number);
    return notExpired && underQuota;
  });
  if (!usable) {
    const anyExpired = codes.some(
      (c) => c.expires_at && new Date(c.expires_at as string).getTime() <= now,
    );
    return { ok: false, reason: anyExpired ? "expired" : "exhausted" };
  }

  const role = (usable.role_to_assign as TeamBotRole) ?? "authorized_user";
  const newUsed = (usable.used_count as number) + 1;

  await db
    .from("team_bot_access_codes")
    .update({ used_count: newUsed, active: newUsed < (usable.max_uses as number) })
    .eq("id", usable.id as string);

  await approveUser(telegramUserId, "access_code", role);
  return { ok: true, role };
}

export async function createAccessCode(opts: {
  role: TeamBotRole;
  maxUses?: number;
  expiresInHours?: number | null;
  createdBy?: string;
}): Promise<string> {
  const db = getServiceSupabase();
  const code = generateCode();
  const expiresAt =
    opts.expiresInHours == null
      ? null
      : new Date(Date.now() + opts.expiresInHours * 3600_000).toISOString();
  await db.from("team_bot_access_codes").insert({
    code_hash: sha256Hex(code),
    role_to_assign: opts.role,
    max_uses: opts.maxUses ?? 1,
    used_count: 0,
    expires_at: expiresAt,
    created_by: opts.createdBy ?? "system",
    active: true,
  });
  return code;
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
function generateCode(): string {
  const block = () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `ELK-${block()}-${block()}`;
}

// ── Idempotency / audit ───────────────────────────────────────────────────────

export async function markUpdateSeen(
  updateId: number,
  telegramUserId: string | null,
): Promise<boolean> {
  const db = getServiceSupabase();
  const { error } = await db.from("team_bot_events").insert({
    update_id: updateId,
    telegram_user_id: telegramUserId,
    event_type: "update_received",
  });
  if (error) {
    if ((error as { code?: string }).code === "23505") return false;
    console.error("[team-bot] markUpdateSeen error:", error.message);
  }
  return true;
}

export async function logEvent(
  telegramUserId: string | null,
  eventType: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  const db = getServiceSupabase();
  await db.from("team_bot_events").insert({
    telegram_user_id: telegramUserId,
    event_type: eventType,
    payload: payload ?? null,
  });
}
