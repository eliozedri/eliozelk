"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Check, X, Power, RotateCcw, RefreshCw } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";

type Status = "pending" | "approved" | "rejected" | "inactive";
type BotUser = {
  telegram_user_id: string;
  telegram_username: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
  status: Status;
  requested_at: string | null;
};

const TABS: { id: Status; label: string }[] = [
  { id: "pending", label: "ממתינים" },
  { id: "approved", label: "מאושרים" },
  { id: "rejected", label: "נדחו" },
  { id: "inactive", label: "מושבתים" },
];

async function authedFetch(input: string, init?: RequestInit): Promise<Response> {
  const db = getSupabase();
  const token = db ? (await db.auth.getSession()).data.session?.access_token : null;
  return fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}`, ...(init?.headers ?? {}) },
  });
}

export function TeamBotUsers() {
  const [tab, setTab] = useState<Status>("pending");
  const [users, setUsers] = useState<BotUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (status: Status) => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/team-bot/users?status=${status}`);
      if (!res.ok) {
        setError(res.status === 403 ? "אין לך הרשאה לנהל גישת בוט." : "שגיאה בטעינה.");
        setUsers([]);
        return;
      }
      const body = (await res.json()) as { users: BotUser[] };
      setUsers(body.users ?? []);
    } catch {
      setError("שגיאת רשת.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  const act = async (id: string, action: "approve" | "reject" | "deactivate" | "reactivate") => {
    setBusy(id);
    try {
      const res = await authedFetch("/api/team-bot/users", {
        method: "POST",
        body: JSON.stringify({ action, id }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? "הפעולה נכשלה.");
        return;
      }
      setUsers((prev) => prev.filter((u) => u.telegram_user_id !== id));
    } finally {
      setBusy(null);
    }
  };

  const fullName = (u: BotUser) =>
    [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.display_name || "—";

  return (
    <div dir="rtl" className="max-w-3xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <ShieldCheck className="w-5 h-5 text-sky-600" />
          גישת בוט הטלגרם — ניהול משתמשים
        </h1>
        <button onClick={() => void load(tab)} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <RefreshCw className="w-4 h-4" /> רענן
        </button>
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${
              tab === t.id ? "border-sky-600 text-sky-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}
      {loading && <div className="text-gray-500 text-sm">טוען…</div>}
      {!loading && users.length === 0 && !error && (
        <div className="text-gray-500 text-sm rounded-lg border border-dashed border-gray-200 p-6 text-center">
          אין משתמשים בקטגוריה זו.
        </div>
      )}

      <div className="space-y-2">
        {users.map((u) => (
          <div
            key={u.telegram_user_id}
            className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 truncate">{fullName(u)}</div>
              <div className="text-xs text-gray-500 truncate">
                {u.telegram_username ? `@${u.telegram_username} · ` : ""}ID: {u.telegram_user_id}
                {u.requested_at ? ` · ${new Date(u.requested_at).toLocaleDateString("he-IL")}` : ""}
              </div>
            </div>
            <div className="flex gap-1.5 shrink-0">
              {(tab === "pending" || tab === "rejected") && (
                <button
                  disabled={busy === u.telegram_user_id}
                  onClick={() => void act(u.telegram_user_id, "approve")}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" /> אשר
                </button>
              )}
              {tab === "pending" && (
                <button
                  disabled={busy === u.telegram_user_id}
                  onClick={() => void act(u.telegram_user_id, "reject")}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" /> דחה
                </button>
              )}
              {tab === "approved" && (
                <button
                  disabled={busy === u.telegram_user_id}
                  onClick={() => void act(u.telegram_user_id, "deactivate")}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-xs font-semibold hover:bg-amber-200 disabled:opacity-50"
                >
                  <Power className="w-3.5 h-3.5" /> השבת
                </button>
              )}
              {tab === "inactive" && (
                <button
                  disabled={busy === u.telegram_user_id}
                  onClick={() => void act(u.telegram_user_id, "reactivate")}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> הפעל מחדש
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
