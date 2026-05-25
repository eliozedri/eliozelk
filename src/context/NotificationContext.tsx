"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { NotificationRow, RecipientRow, NotificationView } from "@/types/notification";
import { toView, mergeViews, unseenCount, pickPendingCritical } from "@/lib/notifications/state";
import { notificationsApi } from "@/lib/notifications/client";
import { playChime, primeAudio } from "@/lib/notifications/sound";
import { toast } from "sonner";

// Light informational toast (top-left, auto-dismiss ~5s) for non-blocking,
// non-ack notifications only. Strong intake (requires_ack) and blocking criticals
// surface via the drawer / CriticalAlertGate instead, never as a transient toast.
function showInfoToast(v: NotificationView) {
  const opts = { description: v.message, duration: 5000, position: "top-left" as const };
  if (v.severity === "warning") toast.warning(v.title, opts);
  else toast.info(v.title, opts);
}

interface NotificationContextValue {
  views: NotificationView[];
  unseen: number;
  pendingCritical: NotificationView | null;
  markSeen: (recipientIds: string[]) => Promise<void>;
  markOpened: (recipientId: string) => Promise<void>;
  acknowledge: (recipientId: string) => Promise<boolean>;
  sendDemo: (eventType: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue>({
  views: [],
  unseen: 0,
  pendingCritical: null,
  markSeen: async () => {},
  markOpened: async () => {},
  acknowledge: async () => false,
  sendDemo: async () => {},
});

// Module-level cache of notification rows (keyed by id). Realtime payloads carry
// the recipient row only; the parent notification is fetched once and reused.
const notifCache = new Map<string, NotificationRow>();

async function fetchNotification(id: string): Promise<NotificationRow | null> {
  const cached = notifCache.get(id);
  if (cached) return cached;
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db.from("notifications").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const row = data as NotificationRow;
  notifCache.set(id, row);
  return row;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [views, setViews] = useState<NotificationView[]>([]);

  // Merge a single recipient row (from realtime or hydrate) into state, fetching
  // its parent notification. Plays the chime only for freshly-arrived, sound-enabled
  // notifications that haven't been seen yet.
  const upsertFromRecipient = useCallback(async (rec: RecipientRow, withSound: boolean) => {
    const n = await fetchNotification(rec.notification_id);
    if (!n) return;
    const v = toView(rec, n);
    setViews(prev => mergeViews(prev, v));
    const fresh = v.status === "pending" || v.status === "delivered";
    if (withSound && fresh) {
      if (v.playSound) playChime();
      // Light info notifications get a transient toast; strong/blocking ones don't.
      if (!v.blocking && !v.requiresAck) showInfoToast(v);
    }
  }, []);

  // Full hydrate from the DB (initial load + tab-visibility refresh). RLS limits
  // rows to the current user (or all, for master).
  const hydrate = useCallback(async () => {
    const db = getSupabase();
    if (!db || !profile) return;
    const { data } = await db
      .from("notification_recipients")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!data) return;
    const recs = data as RecipientRow[];
    const built: NotificationView[] = [];
    for (const rec of recs) {
      const n = await fetchNotification(rec.notification_id);
      if (n) built.push(toView(rec, n));
    }
    setViews(built);
  }, [profile]);

  useEffect(() => {
    const db = getSupabase();
    if (!db || !profile) return;

    hydrate();

    // Realtime: this user's recipient rows only (server-side filter).
    const channel = db
      .channel("notification_recipients_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notification_recipients",
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            void upsertFromRecipient(payload.new as RecipientRow, true);
          } else if (payload.eventType === "UPDATE") {
            void upsertFromRecipient(payload.new as RecipientRow, false);
          } else if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string }).id;
            if (id) setViews(prev => prev.filter(v => v.recipientId !== id));
          }
        },
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          console.log("[notifications] realtime connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[notifications] realtime issue:", status, err?.message ?? "");
        }
      });

    // Prime the AudioContext on the first user gesture so the chime is allowed to play.
    const prime = () => {
      primeAudio();
      window.removeEventListener("pointerdown", prime);
    };
    window.addEventListener("pointerdown", prime);

    const onVisible = () => {
      if (document.visibilityState === "visible") hydrate();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      db.removeChannel(channel);
      window.removeEventListener("pointerdown", prime);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [profile, hydrate, upsertFromRecipient]);

  const markSeen = useCallback(async (recipientIds: string[]) => {
    if (recipientIds.length === 0) return;
    setViews(prev =>
      prev.map(v =>
        recipientIds.includes(v.recipientId) && (v.status === "pending" || v.status === "delivered")
          ? { ...v, status: "seen", seenAt: new Date().toISOString() }
          : v,
      ),
    );
    await notificationsApi.seen(recipientIds);
  }, []);

  const markOpened = useCallback(async (recipientId: string) => {
    setViews(prev =>
      prev.map(v =>
        v.recipientId === recipientId && !v.relatedOpenedAt
          ? { ...v, relatedOpenedAt: new Date().toISOString() }
          : v,
      ),
    );
    await notificationsApi.markOpened(recipientId);
  }, []);

  const acknowledge = useCallback(async (recipientId: string) => {
    const ok = await notificationsApi.acknowledge(recipientId);
    if (ok) {
      setViews(prev =>
        prev.map(v =>
          v.recipientId === recipientId
            ? { ...v, status: "acknowledged", acknowledgedAt: new Date().toISOString() }
            : v,
        ),
      );
    }
    return ok;
  }, []);

  const sendDemo = useCallback(async (eventType: string) => {
    await notificationsApi.demo(eventType);
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        views,
        unseen: unseenCount(views),
        pendingCritical: pickPendingCritical(views),
        markSeen,
        markOpened,
        acknowledge,
        sendDemo,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
