import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import { sendWebPush } from "@/lib/notifications/push";
import { relatedEntityHref } from "@/lib/notifications/state";
import type { RelatedEntityType } from "@/types/notification";

// Idempotent background processor for the notification system. Designed to be invoked
// repeatedly (Vercel Cron) and safe to re-run: every action is gated by a stored marker
// (last_push_sent_at / next_reminder_at / escalation_level / status) so nothing fires
// twice. Web Push is best-effort and a no-op when VAPID env is absent — the state
// transitions (reminders/escalation/expiry) still run so the system is useful pre-VAPID.

export interface WorkerResult {
  scanned: number;
  pushed: number;
  reminded: number;
  escalated: number;
  expired: number;
  errors: number;
}

interface RuleBits {
  web_push_enabled: boolean;
  reminder_enabled: boolean;
  reminder_interval_minutes: number | null;
  escalation_enabled: boolean;
  escalation_delay_minutes: number | null;
}

interface JoinedRow {
  id: string;
  user_id: string;
  status: string;
  related_opened_at: string | null;
  last_push_sent_at: string | null;
  next_reminder_at: string | null;
  escalation_level: number;
  created_at: string;
  notifications: {
    id: string;
    title: string;
    message: string;
    requires_ack: boolean;
    related_entity_type: RelatedEntityType | null;
    related_entity_id: string | null;
    expires_at: string | null;
    notification_rules: RuleBits | null;
  } | null;
}

const ACTIVE_STATUSES = ["pending", "delivered", "seen"];

function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60_000);
}

export async function processNotifications(now: Date = new Date()): Promise<WorkerResult> {
  const db = getServiceSupabase();
  const result: WorkerResult = { scanned: 0, pushed: 0, reminded: 0, escalated: 0, expired: 0, errors: 0 };

  const { data, error } = await db
    .from("notification_recipients")
    .select(
      "id, user_id, status, related_opened_at, last_push_sent_at, next_reminder_at, escalation_level, created_at, " +
        "notifications!inner ( id, title, message, requires_ack, related_entity_type, related_entity_id, expires_at, " +
        "notification_rules ( web_push_enabled, reminder_enabled, reminder_interval_minutes, escalation_enabled, escalation_delay_minutes ) )",
    )
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    console.error("[notif-worker] query failed:", error.message);
    return { ...result, errors: 1 };
  }

  const rows = (data as unknown as JoinedRow[]) ?? [];
  result.scanned = rows.length;
  const nowIso = now.toISOString();

  for (const row of rows) {
    const n = row.notifications;
    if (!n) continue;
    const rule = n.notification_rules;
    let pushedThisRow = false;

    try {
      // ── Expiry: drop out of the active set, no push. ──
      if (n.expires_at && new Date(n.expires_at) <= now) {
        await db.from("notification_recipients").update({ status: "expired" }).eq("id", row.id);
        result.expired += 1;
        continue;
      }

      const url = relatedEntityHref(n.related_entity_type, n.related_entity_id) ?? "/notifications";
      const basePayload = { title: n.title, body: n.message, url, tag: `notif-${n.id}` };
      const unacked = row.status !== "acknowledged" && row.status !== "expired";

      // ── First-delivery push fan-out (once per recipient). ──
      if (rule?.web_push_enabled && !row.last_push_sent_at) {
        const r = await sendWebPush(row.user_id, basePayload);
        result.pushed += r.sent;
        if (r.sent > 0) {
          await db.from("notification_recipients").update({ last_push_sent_at: nowIso }).eq("id", row.id);
          pushedThisRow = true;
        }
      }

      // ── Reminders: requires_ack, still unacked, reminder configured, due. ──
      if (
        !pushedThisRow &&
        n.requires_ack &&
        unacked &&
        rule?.reminder_enabled &&
        rule.reminder_interval_minutes
      ) {
        const dueAt = row.next_reminder_at
          ? new Date(row.next_reminder_at)
          : addMinutes(new Date(row.created_at), rule.reminder_interval_minutes);
        if (dueAt <= now) {
          if (rule.web_push_enabled) {
            const r = await sendWebPush(row.user_id, basePayload);
            result.pushed += r.sent;
          }
          await db
            .from("notification_recipients")
            .update({ next_reminder_at: addMinutes(now, rule.reminder_interval_minutes).toISOString() })
            .eq("id", row.id);
          result.reminded += 1;
          pushedThisRow = true;
        }
      }

      // ── Escalation tracking: overdue ack past the delay, escalate once. ──
      if (
        n.requires_ack &&
        unacked &&
        rule?.escalation_enabled &&
        rule.escalation_delay_minutes &&
        row.escalation_level === 0
      ) {
        const escalateAt = addMinutes(new Date(row.created_at), rule.escalation_delay_minutes);
        if (escalateAt <= now) {
          await db.from("notification_recipients").update({ escalation_level: 1 }).eq("id", row.id);
          if (!pushedThisRow && rule.web_push_enabled) {
            const r = await sendWebPush(row.user_id, {
              ...basePayload,
              title: `⚠ ${n.title}`,
              body: `טרם אושר — ${n.message}`,
            });
            result.pushed += r.sent;
          }
          result.escalated += 1;
        }
      }
    } catch (err) {
      result.errors += 1;
      console.error("[notif-worker] row failed:", row.id, (err as Error).message);
    }
  }

  return result;
}
