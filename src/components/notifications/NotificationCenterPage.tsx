"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import { getSupabase } from "@/lib/supabase/client";
import { relatedEntityHref } from "@/lib/notifications/state";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import type { NotificationView } from "@/types/notification";

// Full-page "מרכז התראות". User-facing center for everyone; master-only admin
// foundation (read-only rules viewer for now — editing/recipients/audit are future).
type Tab = "mine" | "admin";

interface RuleRow {
  id: string;
  event_type: string;
  severity: string;
  requires_ack: boolean;
  blocking: boolean;
  play_sound: boolean;
  enabled: boolean;
  notification_rule_recipients: { recipient_type: string; recipient_value: string }[] | null;
}

function Section({
  title,
  items,
  onOpen,
  onAcknowledge,
  onReportProblem,
}: {
  title: string;
  items: NotificationView[];
  onOpen: (v: NotificationView) => void;
  onAcknowledge: (v: NotificationView) => void;
  onReportProblem: (v: NotificationView) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold text-gray-500 px-1">{title}</h3>
      {items.map(v => (
        <NotificationItem
          key={v.recipientId}
          view={v}
          onOpen={() => onOpen(v)}
          onAcknowledge={() => onAcknowledge(v)}
          onReportProblem={() => onReportProblem(v)}
        />
      ))}
    </div>
  );
}

// Master-only read-only rules viewer — the admin-management FOUNDATION.
// Editing rules/recipients, severity/display/sound/push policy, viewer policy,
// and the change audit log are future work (spec §19).
function AdminRulesPanel() {
  const [rules, setRules] = useState<RuleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const db = getSupabase();
    if (!db) return;
    db.from("notification_rules")
      .select("id, event_type, severity, requires_ack, blocking, play_sound, enabled, notification_rule_recipients(recipient_type, recipient_value)")
      .order("event_type")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setRules((data as RuleRow[]) ?? []);
      });
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        תצוגה בלבד. עריכת חוקים, נמענים, חומרה/מצב תצוגה/צליל/Web Push, מדיניות צופים, ויומן שינויים —
        יתווספו בהמשך (Phase 2). רק מנהל ראשי רואה אזור זה.
      </div>
      {error && <p className="text-sm text-red-600">שגיאה בטעינת החוקים: {error}</p>}
      {rules === null && !error && <p className="text-sm text-gray-400">טוען חוקים…</p>}
      {rules && rules.length === 0 && <p className="text-sm text-gray-400">אין חוקים מוגדרים.</p>}
      {rules && rules.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-right text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2 font-semibold">אירוע</th>
                <th className="px-3 py-2 font-semibold">חומרה</th>
                <th className="px-3 py-2 font-semibold">דורש אישור</th>
                <th className="px-3 py-2 font-semibold">חוסם</th>
                <th className="px-3 py-2 font-semibold">צליל</th>
                <th className="px-3 py-2 font-semibold">פעיל</th>
                <th className="px-3 py-2 font-semibold">נמענים</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-mono text-navy-900">{r.event_type}</td>
                  <td className="px-3 py-2">{r.severity}</td>
                  <td className="px-3 py-2">{r.requires_ack ? "כן" : "לא"}</td>
                  <td className="px-3 py-2">{r.blocking ? "כן" : "לא"}</td>
                  <td className="px-3 py-2">{r.play_sound ? "כן" : "לא"}</td>
                  <td className="px-3 py-2">{r.enabled ? "כן" : "לא"}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {(r.notification_rule_recipients ?? [])
                      .map(x => `${x.recipient_type}:${x.recipient_value}`)
                      .join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function NotificationCenterPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { views, markSeen, markOpened, acknowledge, reportProblem } = useNotifications();
  const isMaster = profile?.role === "master";
  const [tab, setTab] = useState<Tab>("mine");

  // Mark unseen as seen when the page opens.
  useEffect(() => {
    const unseen = views
      .filter(v => v.status === "pending" || v.status === "delivered")
      .map(v => v.recipientId);
    if (unseen.length > 0) void markSeen(unseen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onOpen = (v: NotificationView) => {
    const href = relatedEntityHref(v.relatedEntityType, v.relatedEntityId, v.metadata);
    if (!href) return;
    void markOpened(v.recipientId);
    router.push(href);
  };
  const onReportProblem = (v: NotificationView) => {
    const description = window.prompt("תאר/י את הבעיה בפריט (אופציונלי):");
    if (description === null) return;
    void reportProblem(v.recipientId, description || undefined);
  };

  const pending = views.filter(v => v.requiresAck && v.status !== "acknowledged");
  const fresh = views.filter(
    v =>
      !(v.requiresAck && v.status !== "acknowledged") &&
      (v.status === "pending" || v.status === "delivered" || v.status === "seen"),
  );
  const history = views.filter(v => v.status === "acknowledged" || v.status === "expired");

  return (
    <div className="min-h-screen bg-surface" dir="rtl">
      <div className="bg-navy-900 px-6 py-5 flex items-center gap-3">
        <Bell className="w-6 h-6 text-white" />
        <div>
          <h1 className="text-xl font-black text-white">מרכז התראות</h1>
          <p className="text-white/40 text-xs mt-0.5">ההתראות שלך, אישורים ודיווחי בעיות</p>
        </div>
      </div>

      {isMaster && (
        <div className="flex gap-1 px-6 pt-4">
          <button
            onClick={() => setTab("mine")}
            className={`px-4 py-2 rounded-t-lg text-sm font-semibold ${tab === "mine" ? "bg-white text-navy-900" : "text-gray-500 hover:text-navy-900"}`}
          >
            ההתראות שלי
          </button>
          <button
            onClick={() => setTab("admin")}
            className={`px-4 py-2 rounded-t-lg text-sm font-semibold ${tab === "admin" ? "bg-white text-navy-900" : "text-gray-500 hover:text-navy-900"}`}
          >
            ניהול התראות
          </button>
        </div>
      )}

      <div className="p-6 max-w-3xl">
        {tab === "mine" || !isMaster ? (
          <div className="space-y-5">
            {views.length === 0 && (
              <p className="text-sm text-gray-400 text-center mt-10">אין התראות</p>
            )}
            <Section title="קריטי וממתין לאישור" items={pending} onOpen={onOpen} onAcknowledge={(v) => void acknowledge(v.recipientId)} onReportProblem={onReportProblem} />
            <Section title="חדש" items={fresh} onOpen={onOpen} onAcknowledge={(v) => void acknowledge(v.recipientId)} onReportProblem={onReportProblem} />
            <Section title="היסטוריה" items={history} onOpen={onOpen} onAcknowledge={(v) => void acknowledge(v.recipientId)} onReportProblem={onReportProblem} />
          </div>
        ) : (
          <AdminRulesPanel />
        )}
      </div>
    </div>
  );
}
