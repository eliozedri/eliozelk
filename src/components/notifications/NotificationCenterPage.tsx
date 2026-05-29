"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import { getSupabase } from "@/lib/supabase/client";
import { relatedEntityHref } from "@/lib/notifications/state";
import { notificationsApi } from "@/lib/notifications/client";
import { getReadiness, enablePush, disablePush, type PushReadiness } from "@/lib/notifications/webpush";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import type { NotificationView } from "@/types/notification";

// Full-page "מרכז התראות". User-facing center for everyone; master-only admin area
// with EDITABLE notification rules + a change audit log (recipients editing is future).
type Tab = "mine" | "admin";

interface RuleRow {
  id: string;
  event_type: string;
  severity: string;
  requires_ack: boolean;
  blocking: boolean;
  play_sound: boolean;
  show_in_center: boolean;
  enabled: boolean;
  in_app_notification_enabled: boolean;
  require_open_before_ack: boolean;
  web_push_enabled: boolean;
  notification_rule_recipients: { recipient_type: string; recipient_value: string }[] | null;
}

interface PolicyRow {
  require_pwa_installation: boolean;
  require_push_permission: boolean;
  block_work_until_push_setup_complete: boolean;
}

interface AuditRow {
  id: string;
  rule_event_type: string | null;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by_name: string | null;
  changed_at: string;
}

function RuleToggle({ on, disabled, onToggle }: { on: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`px-2 py-0.5 rounded text-[11px] font-bold disabled:opacity-50 ${on ? "bg-emerald-600 text-white" : "bg-gray-200 text-gray-600"}`}
    >
      {on ? "כן" : "לא"}
    </button>
  );
}

// Opt-in browser-push control. Never auto-prompts: permission is only requested when
// the user clicks "enable". OS push is a transport hint — acking still happens in-app.
function PushOptIn({ isMaster }: { isMaster: boolean }) {
  const [ready, setReady] = useState<PushReadiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => setReady(await getReadiness()), []);
  useEffect(() => { void refresh(); }, [refresh]);

  if (!ready) return null;

  if (!ready.supported) {
    return <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">הדפדפן הזה לא תומך בהתראות דחיפה.</div>;
  }
  if (!ready.configured) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">התראות דפדפן עדיין לא הופעלו בשרת (חסר מפתח VAPID).</div>;
  }

  const onEnable = async () => {
    setBusy(true); setTestMsg(null);
    await enablePush();
    await refresh();
    setBusy(false);
  };
  const onDisable = async () => {
    setBusy(true); setTestMsg(null);
    await disablePush();
    await refresh();
    setBusy(false);
  };
  const onTest = async () => {
    setBusy(true); setTestMsg(null);
    const ok = await notificationsApi.testPush();
    setTestMsg(ok ? "נשלחה התראת בדיקה למכשיר הזה." : "שליחת הבדיקה נכשלה.");
    setBusy(false);
  };

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 flex flex-wrap items-center gap-3">
      <span className="text-sm font-bold text-sky-900">התראות דפדפן</span>
      {ready.permission === "denied" ? (
        <span className="text-xs text-red-600">ההרשאה נחסמה בדפדפן — יש לאפשר התראות בהגדרות האתר.</span>
      ) : ready.subscribed ? (
        <>
          <span className="text-xs text-emerald-700 font-semibold">פעיל במכשיר הזה ✓</span>
          <button onClick={onDisable} disabled={busy} className="px-3 py-1 rounded-lg text-xs font-bold bg-gray-200 text-gray-700 disabled:opacity-50">כבה</button>
          {isMaster && <button onClick={onTest} disabled={busy} className="px-3 py-1 rounded-lg text-xs font-bold bg-sky-600 text-white disabled:opacity-50">שלח בדיקה</button>}
        </>
      ) : (
        <button onClick={onEnable} disabled={busy} className="px-3 py-1 rounded-lg text-xs font-bold bg-sky-600 text-white disabled:opacity-50">הפעל במכשיר הזה</button>
      )}
      {testMsg && <span className="text-xs text-gray-600 w-full">{testMsg}</span>}
    </div>
  );
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

// Master-only admin area: EDITABLE rule behavior flags + change audit log.
// Editable = existing wired columns only (enabled/severity/requires_ack/blocking/
// play_sound/show_in_center). Recipients editing + Web Push/display_mode policy are
// future (no inert policy columns added). Reads via RLS; writes via the master-gated
// /api/notifications/rules/update route.
function AdminRulesPanel() {
  const [rules, setRules] = useState<RuleRow[] | null>(null);
  const [policy, setPolicy] = useState<PolicyRow | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const load = useCallback(async () => {
    const db = getSupabase();
    if (!db) return;
    const { data: r, error: re } = await db
      .from("notification_rules")
      .select("id, event_type, severity, requires_ack, blocking, play_sound, show_in_center, enabled, in_app_notification_enabled, require_open_before_ack, web_push_enabled, notification_rule_recipients(recipient_type, recipient_value)")
      .order("event_type");
    if (re) { setError(re.message); return; }
    setRules((r as RuleRow[]) ?? []);
    const { data: p } = await db
      .from("notification_policy")
      .select("require_pwa_installation, require_push_permission, block_work_until_push_setup_complete")
      .eq("id", true)
      .maybeSingle();
    setPolicy((p as PolicyRow) ?? null);
    const { data: a } = await db
      .from("notification_admin_audit_log")
      .select("id, rule_event_type, field, old_value, new_value, changed_by_name, changed_at")
      .order("changed_at", { ascending: false })
      .limit(20);
    setAudit((a as AuditRow[]) ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveField = async (rule: RuleRow, field: string, value: unknown) => {
    setSavingId(rule.id);
    const ok = await notificationsApi.updateRule(rule.id, { [field]: value });
    setSavingId(null);
    if (ok) void load();
  };

  const savePolicy = async (field: keyof PolicyRow, value: boolean) => {
    setSavingPolicy(true);
    const ok = await notificationsApi.updatePolicy({ [field]: value });
    setSavingPolicy(false);
    if (ok) void load();
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
        אזור ניהול — מנהל ראשי בלבד. שינויים נשמרים מיידית ומתועדים ביומן השינויים למטה.
        עריכת נמענים ומדיניות Web Push/PWA תתווסף בהמשך.
      </div>
      {error && <p className="text-sm text-red-600">שגיאה: {error}</p>}
      {rules === null && !error && <p className="text-sm text-gray-400">טוען…</p>}
      {rules && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-right text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-2 py-2 font-semibold">אירוע</th>
                <th className="px-2 py-2 font-semibold">חומרה</th>
                <th className="px-2 py-2 font-semibold">פעיל</th>
                <th className="px-2 py-2 font-semibold">דורש אישור</th>
                <th className="px-2 py-2 font-semibold">חוסם</th>
                <th className="px-2 py-2 font-semibold">צליל</th>
                <th className="px-2 py-2 font-semibold">במרכז</th>
                <th className="px-2 py-2 font-semibold">בתוך האפליקציה</th>
                <th className="px-2 py-2 font-semibold">פתיחה לפני אישור</th>
                <th className="px-2 py-2 font-semibold">Web Push</th>
                <th className="px-2 py-2 font-semibold">נמענים</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-2 py-2 font-mono text-navy-900">{r.event_type}</td>
                  <td className="px-2 py-2">
                    <select
                      value={r.severity}
                      disabled={savingId === r.id}
                      onChange={e => saveField(r, "severity", e.target.value)}
                      className="rounded border border-gray-200 px-1 py-0.5 text-[11px]"
                    >
                      <option value="info">info</option>
                      <option value="warning">warning</option>
                      <option value="critical">critical</option>
                    </select>
                  </td>
                  <td className="px-2 py-2"><RuleToggle on={r.enabled} disabled={savingId === r.id} onToggle={() => saveField(r, "enabled", !r.enabled)} /></td>
                  <td className="px-2 py-2"><RuleToggle on={r.requires_ack} disabled={savingId === r.id} onToggle={() => saveField(r, "requires_ack", !r.requires_ack)} /></td>
                  <td className="px-2 py-2"><RuleToggle on={r.blocking} disabled={savingId === r.id} onToggle={() => saveField(r, "blocking", !r.blocking)} /></td>
                  <td className="px-2 py-2"><RuleToggle on={r.play_sound} disabled={savingId === r.id} onToggle={() => saveField(r, "play_sound", !r.play_sound)} /></td>
                  <td className="px-2 py-2"><RuleToggle on={r.show_in_center} disabled={savingId === r.id} onToggle={() => saveField(r, "show_in_center", !r.show_in_center)} /></td>
                  <td className="px-2 py-2"><RuleToggle on={r.in_app_notification_enabled} disabled={savingId === r.id} onToggle={() => saveField(r, "in_app_notification_enabled", !r.in_app_notification_enabled)} /></td>
                  <td className="px-2 py-2"><RuleToggle on={r.require_open_before_ack} disabled={savingId === r.id} onToggle={() => saveField(r, "require_open_before_ack", !r.require_open_before_ack)} /></td>
                  <td className="px-2 py-2"><RuleToggle on={r.web_push_enabled} disabled={savingId === r.id} onToggle={() => saveField(r, "web_push_enabled", !r.web_push_enabled)} /></td>
                  <td className="px-2 py-2 text-gray-600">
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

      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
        <h3 className="text-sm font-bold text-indigo-900">מדיניות התקנה והתראות (כלל-ארגונית)</h3>
        <p className="text-[11px] text-indigo-700/80">
          שכבות נפרדות. ברירת המחדל כבויה — דרישות נכפות רק כאשר מנהל מפעיל אותן. חסימת עבודה לא חלה על מנהל ראשי.
        </p>
        {policy ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
              <span className="text-xs text-gray-700">דרישת התקנת אפליקציה (PWA)</span>
              <RuleToggle on={policy.require_pwa_installation} disabled={savingPolicy} onToggle={() => savePolicy("require_pwa_installation", !policy.require_pwa_installation)} />
            </div>
            <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
              <span className="text-xs text-gray-700">דרישת אישור הרשאת התראות</span>
              <RuleToggle on={policy.require_push_permission} disabled={savingPolicy} onToggle={() => savePolicy("require_push_permission", !policy.require_push_permission)} />
            </div>
            <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
              <span className="text-xs text-gray-700">חסימת עבודה עד השלמת ההתקנה</span>
              <RuleToggle on={policy.block_work_until_push_setup_complete} disabled={savingPolicy} onToggle={() => savePolicy("block_work_until_push_setup_complete", !policy.block_work_until_push_setup_complete)} />
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400">טוען מדיניות…</p>
        )}
      </div>

      <div>
        <h3 className="text-xs font-bold text-gray-500 px-1 mb-2">יומן שינויים (20 אחרונים)</h3>
        {audit.length === 0 ? (
          <p className="text-xs text-gray-400">אין שינויים מתועדים.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-right text-[11px]">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">מתי</th>
                  <th className="px-2 py-1.5 font-semibold">מי</th>
                  <th className="px-2 py-1.5 font-semibold">אירוע</th>
                  <th className="px-2 py-1.5 font-semibold">שדה</th>
                  <th className="px-2 py-1.5 font-semibold">לפני</th>
                  <th className="px-2 py-1.5 font-semibold">אחרי</th>
                </tr>
              </thead>
              <tbody>
                {audit.map(a => (
                  <tr key={a.id} className="border-t border-gray-100">
                    <td className="px-2 py-1.5 text-gray-500">{new Date(a.changed_at).toLocaleString("he-IL")}</td>
                    <td className="px-2 py-1.5">{a.changed_by_name ?? "—"}</td>
                    <td className="px-2 py-1.5 font-mono">{a.rule_event_type ?? "—"}</td>
                    <td className="px-2 py-1.5">{a.field}</td>
                    <td className="px-2 py-1.5 text-gray-500">{a.old_value ?? "—"}</td>
                    <td className="px-2 py-1.5 font-semibold">{a.new_value ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function NotificationCenterPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { views, markSeen, markOpened, acknowledge, reportProblem } = useNotifications();
  const isMaster = profile?.role === "master";
  const [tab, setTab] = useState<Tab>("mine");

  // Note: we intentionally do NOT auto-mark-as-read on open — that hid the real
  // unread count. The user clears via the explicit "mark all as read" button so the
  // badge reflects genuinely-unread items. Nothing is deleted (audit preserved).

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
  const notAck = (v: NotificationView) => !(v.requiresAck && v.status !== "acknowledged");
  const fresh = views.filter(v => notAck(v) && (v.status === "pending" || v.status === "delivered")); // unread
  const read = views.filter(v => notAck(v) && v.status === "seen");                                   // read, kept
  const history = views.filter(v => v.status === "acknowledged" || v.status === "expired");
  const markAllRead = () => { const ids = fresh.map(v => v.recipientId); if (ids.length) void markSeen(ids); };

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
            <PushOptIn isMaster={isMaster} />
            {views.length === 0 && (
              <p className="text-sm text-gray-400 text-center mt-10">אין התראות</p>
            )}
            {fresh.length > 0 && (
              <div className="flex justify-end">
                <button
                  onClick={markAllRead}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg hover:bg-blue-50"
                >
                  סמן הכל כנקרא ({fresh.length})
                </button>
              </div>
            )}
            <Section title="קריטי וממתין לאישור" items={pending} onOpen={onOpen} onAcknowledge={(v) => void acknowledge(v.recipientId)} onReportProblem={onReportProblem} />
            <Section title={`חדש (${fresh.length})`} items={fresh} onOpen={onOpen} onAcknowledge={(v) => void acknowledge(v.recipientId)} onReportProblem={onReportProblem} />
            <Section title="נקראו" items={read} onOpen={onOpen} onAcknowledge={(v) => void acknowledge(v.recipientId)} onReportProblem={onReportProblem} />
            <Section title="היסטוריה" items={history} onOpen={onOpen} onAcknowledge={(v) => void acknowledge(v.recipientId)} onReportProblem={onReportProblem} />
          </div>
        ) : (
          <AdminRulesPanel />
        )}
      </div>
    </div>
  );
}
