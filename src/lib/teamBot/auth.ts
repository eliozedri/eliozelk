import "server-only";
import { createHash, randomInt } from "crypto";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { TeamBotRole, TeamBotUser, TgUser } from "./types";

/**
 * Default-deny access control for the Team Bot.
 *
 * Every Telegram user is unknown → blocked until an admin approves them or
 * they redeem a valid access code. The bot uses the Supabase service role
 * (bypasses RLS), so this module is the ONLY gate between an inbound update
 * and any data access. No menu, catalog, or order data is exposed to a user
 * whose status is not 'active'.
 */

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
    telegram_username: (r.telegram_username as string) ?? null,
    display_name: (r.display_name as string) ?? null,
    role: (r.role as TeamBotRole) ?? "viewer",
    status: (r.status as TeamBotUser["status"]) ?? "pending",
  };
}

/**
 * Find the user, or create a `pending` row on first contact (so the request
 * lands in the admin approval queue). Refreshes username/display_name when
 * they change.
 */
export async function resolveOrCreateUser(tgUser: TgUser): Promise<TeamBotUser> {
  const db = getServiceSupabase();
  const telegramUserId = String(tgUser.id);
  const username = tgUser.username ?? null;
  const displayName = displayNameOf(tgUser) || null;

  const { data: existing } = await db
    .from("team_bot_users")
    .select("*")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (existing) {
    // Keep contact metadata fresh; never touch role/status here, and never
    // clobber a stored value with an empty one (some updates omit name fields).
    const patch: Record<string, unknown> = {};
    if (username && existing.telegram_username !== username) patch.telegram_username = username;
    if (displayName && existing.display_name !== displayName) patch.display_name = displayName;
    if (Object.keys(patch).length > 0) {
      await db.from("team_bot_users").update(patch).eq("telegram_user_id", telegramUserId);
      Object.assign(existing, patch);
    }
    return rowToUser(existing as Record<string, unknown>);
  }

  const { data: inserted } = await db
    .from("team_bot_users")
    .insert({
      telegram_user_id: telegramUserId,
      telegram_username: username,
      display_name: displayName,
      role: "viewer",
      status: "pending",
    })
    .select("*")
    .single();

  return rowToUser((inserted ?? {
    id: "",
    telegram_user_id: telegramUserId,
    telegram_username: username,
    display_name: displayName,
    role: "viewer",
    status: "pending",
  }) as Record<string, unknown>);
}

export type RedeemResult =
  | { ok: true; role: TeamBotRole }
  | { ok: false; reason: "not_found" | "expired" | "exhausted" };

/**
 * Redeem an access code for a Telegram user. On success the user's status
 * becomes 'active' and the code's role is assigned. Codes are matched by
 * SHA-256 hash — plaintext is never stored or compared directly.
 */
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

  await db
    .from("team_bot_users")
    .update({
      role,
      status: "active",
      approved_by: "access_code",
      approved_at: new Date().toISOString(),
    })
    .eq("telegram_user_id", telegramUserId);

  return { ok: true, role };
}

export async function listPendingUsers(): Promise<TeamBotUser[]> {
  const db = getServiceSupabase();
  const { data } = await db
    .from("team_bot_users")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => rowToUser(r as Record<string, unknown>));
}

export async function setUserStatus(
  telegramUserId: string,
  status: TeamBotUser["status"],
  opts: { role?: TeamBotRole; approvedBy?: string } = {},
): Promise<void> {
  const db = getServiceSupabase();
  const patch: Record<string, unknown> = { status };
  if (opts.role) patch.role = opts.role;
  if (status === "active") {
    patch.approved_by = opts.approvedBy ?? "admin";
    patch.approved_at = new Date().toISOString();
  }
  await db.from("team_bot_users").update(patch).eq("telegram_user_id", telegramUserId);
}

/** Generate a human-typeable code, store only its hash. Returns the plaintext. */
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

// Unambiguous alphabet (no 0/O/1/I/L). Format: ELK-XXXX-XXXX
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function generateCode(): string {
  const block = () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `ELK-${block()}-${block()}`;
}

// ── Idempotency / audit ───────────────────────────────────────────────────

/**
 * Record the update and return true if it is NEW. Telegram retries deliver
 * the same update_id; the unique index makes the second insert fail, which we
 * read as "already processed".
 */
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
    // 23505 = unique_violation → duplicate delivery.
    if ((error as { code?: string }).code === "23505") return false;
    // Other errors shouldn't block processing; log and proceed.
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
