"use client";

import { useCallback, useEffect, useState } from "react";
import { Send, Check, X, RefreshCw, Link2, MessageCircle } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { JARVIS_CUSTOMER_LINK } from "@/lib/whatsapp/assets";

type CartLine = { name: string; quantity: number; unit: string | null; notes: string | null };
type Draft = {
  id: string;
  telegram_user_id: string | null;
  submitted_by_name: string | null;
  customer: string | null;
  contact_person: string | null;
  customer_phone: string | null;
  city: string | null;
  notes: string | null;
  cart: CartLine[];
  source: string | null;
  customer_confirmed: boolean | null;
  created_at: string;
};

async function authedFetch(input: string, init?: RequestInit): Promise<Response> {
  const db = getSupabase();
  const token = db ? (await db.auth.getSession()).data.session?.access_token : null;
  return fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}`, ...(init?.headers ?? {}) },
  });
}

export function TeamBotOrders() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  // Copy the external (customer-facing) order-request form link to the clipboard.
  // The full URL incl. its share token lives in NEXT_PUBLIC_EXTERNAL_ORDER_FORM_URL
  // (config, not hardcoded). This only copies a link — it creates no DB record.
  const copyExternalOrderLink = async () => {
    const url = process.env.NEXT_PUBLIC_EXTERNAL_ORDER_FORM_URL;
    if (!url) {
      setCopyMsg("הקישור החיצוני לא הוגדר. פנה למנהל המערכת.");
      setTimeout(() => setCopyMsg(null), 4000);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopyMsg("הקישור הועתק");
    } catch {
      // Clipboard API can be blocked (insecure context / permissions) — offer manual copy.
      window.prompt("העתקה אוטומטית נכשלה. העתק/י את הקישור ידנית:", url);
      setCopyMsg("העתק/י את הקישור ידנית מהחלון שנפתח");
    }
    setTimeout(() => setCopyMsg(null), 4000);
  };

  // Copy the customer-facing WhatsApp order link (wa.me deep link with the pre-filled
  // starter). Mirrors copyExternalOrderLink (copy-to-clipboard). The link is the single
  // source of truth in src/lib/whatsapp/assets.ts — no DB record is created.
  const copyWhatsAppOrderLink = async () => {
    try {
      await navigator.clipboard.writeText(JARVIS_CUSTOMER_LINK);
      setCopyMsg("קישור ה-WhatsApp הועתק");
    } catch {
      window.prompt("העתקה אוטומטית נכשלה. העתק/י את הקישור ידנית:", JARVIS_CUSTOMER_LINK);
      setCopyMsg("העתק/י את הקישור ידנית מהחלון שנפתח");
    }
    setTimeout(() => setCopyMsg(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/team-bot/drafts");
      if (!res.ok) {
        setError(res.status === 403 ? "אין לך הרשאה לצפות בטיוטות הבוט." : "שגיאה בטעינת הטיוטות.");
        setDrafts([]);
        return;
      }
      const body = (await res.json()) as { drafts: Draft[] };
      setDrafts(body.drafts ?? []);
    } catch {
      setError("שגיאת רשת.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, action: "promote" | "reject") => {
    setBusy(id);
    try {
      const res = await authedFetch("/api/team-bot/drafts", {
        method: "POST",
        body: JSON.stringify({ action, id }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? "הפעולה נכשלה.");
        return;
      }
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div dir="rtl" className="max-w-3xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <Send className="w-5 h-5 text-sky-600" />
          הזמנות מהבוט — ממתינות לאישור
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={copyExternalOrderLink}
            title="העתק את הקישור לטופס בקשת הזמנה החיצוני"
            className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700"
          >
            <Link2 className="w-4 h-4" /> לינק לקישור הזמנות חיצוני
          </button>
          <button
            onClick={copyWhatsAppOrderLink}
            title="העתק את קישור הזמנות ה-WhatsApp"
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <MessageCircle className="w-4 h-4" /> WhatsApp Orders Link
          </button>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
          >
            <RefreshCw className="w-4 h-4" /> רענן
          </button>
        </div>
      </div>

      {copyMsg && (
        <div className="mb-4 rounded-lg bg-emerald-50 text-emerald-700 text-sm px-3 py-2">{copyMsg}</div>
      )}

      <p className="text-xs text-gray-500 mb-4">
        בקשות הזמנה הממתינות לאישור — מבוט הטלגרם, מוואטסאפ ומהטופס החיצוני. קידום הופך בקשה להזמנה רגילה
        (ואז רץ זרימת ההתראות הרגילה למחלקות).
      </p>

      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}
      {loading && <div className="text-gray-500 text-sm">טוען…</div>}
      {!loading && drafts.length === 0 && !error && (
        <div className="text-gray-500 text-sm rounded-lg border border-dashed border-gray-200 p-6 text-center">
          אין טיוטות הזמנה ממתינות.
        </div>
      )}

      <div className="space-y-3">
        {drafts.map((d) => (
          <div key={d.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
              {d.source === "jarvis" ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">
                  👤 הזמנת מנהל (JARVIS)
                </span>
              ) : d.source === "external_web_form" ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-100 text-violet-700">
                  🌐 טופס חיצוני
                </span>
              ) : d.source === "telegram_orders_bot" ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-700">
                  📱 בוט הזמנות
                </span>
              ) : d.source === "whatsapp" ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">
                  📱 וואטסאפ
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-700">
                  📱 טלגרם
                </span>
              )}
              {d.customer_confirmed ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-600 text-white">
                  ✓ אושר ע״י הלקוח
                </span>
              ) : null}
              </div>
              <span className="font-mono text-[11px] text-gray-400">
                {new Date(d.created_at).toLocaleString("he-IL")}
              </span>
            </div>
            <div className="mt-2 text-sm text-gray-900 font-semibold">{d.customer || "ללא לקוח"}</div>
            <div className="text-xs text-gray-500">
              {d.city ? `${d.city} · ` : ""}
              נשלח ע&quot;י {d.submitted_by_name || d.telegram_user_id || "טופס חיצוני"}
            </div>
            {d.customer_phone && (
              <div className="text-xs text-gray-500">📞 {d.customer_phone}</div>
            )}

            {d.cart.length > 0 && (
              <ul className="mt-2 text-sm text-gray-700 list-disc pr-5 space-y-0.5">
                {d.cart.map((l, i) => (
                  <li key={i}>
                    {l.name} × {l.quantity}
                    {l.unit ? ` ${l.unit}` : ""}
                  </li>
                ))}
              </ul>
            )}
            {d.notes && <div className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">📝 {d.notes}</div>}

            <div className="mt-3 flex gap-2">
              <button
                disabled={busy === d.id}
                onClick={() => void act(d.id, "promote")}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                <Check className="w-4 h-4" /> קדם להזמנה
              </button>
              <button
                disabled={busy === d.id}
                onClick={() => void act(d.id, "reject")}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 disabled:opacity-50"
              >
                <X className="w-4 h-4" /> דחה
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
