import "server-only";
import webpush from "web-push";
import { getServiceSupabase } from "@/lib/supabase/server";

// Self-hosted native Web Push (VAPID only — no third-party push SaaS). Push is a
// transport hint; the DB stays the source of truth and OS dismissal never acks.
// Dormant no-op until VAPID env is configured, so shipping this changes nothing.

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface PushResult {
  sent: number;
  pruned: number;
  failed: number;
  skipped?: "no-vapid" | "no-subscriptions";
}

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";
  if (!pub || !priv) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

// Whether push is wired (env present). Used by API routes to report availability.
export function pushConfigured(): boolean {
  return ensureConfigured();
}

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Send a push to every enabled device of a user. Never throws into callers:
// dead subscriptions (404/410) are pruned, other errors are counted and logged.
export async function sendWebPush(userId: string, payload: PushPayload): Promise<PushResult> {
  if (!ensureConfigured()) return { sent: 0, pruned: 0, failed: 0, skipped: "no-vapid" };

  const db = getServiceSupabase();
  const { data } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId)
    .eq("enabled", true);

  const subs = (data as SubRow[] | null) ?? [];
  if (subs.length === 0) return { sent: 0, pruned: 0, failed: 0, skipped: "no-subscriptions" };

  const body = JSON.stringify(payload);
  let sent = 0;
  let pruned = 0;
  let failed = 0;

  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      );
      sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.from("push_subscriptions").delete().eq("id", s.id);
        pruned += 1;
      } else {
        failed += 1;
        console.warn("[push] send failed:", status ?? "?", (err as Error).message);
      }
    }
  }

  if (sent > 0) {
    await db
      .from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("enabled", true);
  }

  return { sent, pruned, failed };
}
