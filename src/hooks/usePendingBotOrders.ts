"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";

/**
 * Live count of order REQUESTS awaiting staff approval — bot, JARVIS, and the
 * external web form all land in `team_bot_order_drafts` with status
 * 'pending_review' (a real work_order is only created when staff PROMOTE one).
 *
 * Drives the Sidebar badge on the "הזמנות מהבוט" row. This is intentionally a
 * separate source from `hooks/useNotifications` (which only derives counts from
 * the work_orders/diaries arrays) because pending requests are NOT work_orders
 * yet, so the derived hook can never see them.
 *
 * Reads are RLS-allowed for any authenticated user. Realtime mirrors the
 * notification-center pattern: subscribe to table changes (re-count on any
 * insert/promote/reject) with a tab-visibility refresh as a safety net so the
 * badge stays correct even before the realtime publication migration is applied.
 */
export function usePendingBotOrders(): number {
  const { profile } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const db = getSupabase();
    if (!db || !profile) return;
    const { count: c, error } = await db
      .from("team_bot_order_drafts")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_review");
    if (!error) setCount(c ?? 0);
  }, [profile]);

  useEffect(() => {
    const db = getSupabase();
    if (!db || !profile) return;

    refresh(); // eslint-disable-line react-hooks/set-state-in-effect -- initial count load on mount

    const channel = db
      .channel("team_bot_order_drafts_badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "team_bot_order_drafts" },
        () => void refresh(),
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      db.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [profile, refresh]);

  return count;
}
