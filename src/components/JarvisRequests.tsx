"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveExecution,
  approveRequest,
  archiveRequest,
  executeRequest,
  generatePreview,
  needsInfoRequest,
  rejectRequest,
  revertRequest,
} from "@/app/jarvis-requests/actions";
import { actionCapabilities } from "@/lib/jarvis/actionCatalog";

/**
 * Owner-facing review screen for JARVIS → CEO-Agent requests (generic, any
 * action type). List + status/risk badges + details modal + decisions, and a
 * capability-gated Tier-B execution workflow (preview → 2nd approval → execute
 * → revert) shown only for actions whose handler supports it. Review-only
 * actions (e.g. ops_note) stop at "approved" with no mutation.
 */

export interface JarvisRequestRow {
  id: string;
  correlation_id: string;
  requested_by: string | null;
  title: string | null;
  summary: string | null;
  full_request: string | null;
  action_type: string;
  target_department: string | null;
  target_role: string | null;
  risk_level: string | null;
  status: string;
  approval_required: boolean;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  dry_run_summary: string | null;
  rollback_plan: string | null;
  payload_json: Record<string, unknown> | null;
  preview_json: PreviewJson | null;
  execution_result: ExecutionResultJson | null;
  executed_at: string | null;
  conversation: ConversationTurn[] | null;
  last_message_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationTurn {
  seq: number;
  source_agent: string;
  target_agent: string;
  message_type: string;
  message_text: string;
  created_at?: string;
}

interface PreviewJson {
  affected_count: number;
  pct: number;
  department: string;
  price_column: string;
  items: { id: string; name: string; old_price: number; new_price: number }[];
}
interface ExecutionResultJson {
  updated_count: number;
  failed_count: number;
  failures?: { id: string; error: string }[];
}

const STATUS: Record<string, { label: string; badge: string }> = {
  pending_review: { label: "ממתין לאישור", badge: "badge-amber" },
  approved: { label: "אושר — מוכן לתצוגה מקדימה", badge: "badge-green" },
  preview_ready: { label: "תצוגה מקדימה מוכנה", badge: "badge-teal" },
  execution_approved: { label: "אושר לביצוע (אישור 2)", badge: "badge-violet" },
  executed: { label: "בוצע", badge: "badge-green" },
  failed: { label: "נכשל", badge: "badge-red" },
  reverted: { label: "שוחזר", badge: "badge-gray" },
  rejected: { label: "נדחה", badge: "badge-red" },
  needs_info: { label: "דרוש מידע", badge: "badge-blue" },
  archived: { label: "אורכב", badge: "badge-gray" },
  execution_disabled: { label: "ביצוע מושבת", badge: "badge-gray" },
  executed_later: { label: "בוצע בהמשך", badge: "badge-teal" },
};
const RISK: Record<string, { label: string; badge: string }> = {
  high: { label: "גבוה", badge: "badge-red" },
  medium: { label: "בינוני", badge: "badge-amber" },
  low: { label: "נמוך", badge: "badge-green" },
};
const ROLE_HE: Record<string, string> = {
  catalog_manager: "מנהל קטלוג",
  system_manager: "מנהל מערכת",
  operations_manager: "מנהל תפעול",
  coo: "סמנכ״ל תפעול",
  ceo: "מנכ״ל",
};

function fmt(iso: string): string {
  try {
    return new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function agentLabel(a: string): string {
  if (a === "jarvis") return "JARVIS";
  if (a === "elkayam_ceo_agent") return "CEO Agent";
  if (a === "owner") return "אתה";
  return a;
}
const MSG_TYPE_HE: Record<string, string> = {
  request: "בקשה", analysis: "ניתוח", needs_info: "דרוש מידע", approval_request: "בקשת אישור",
  proposal: "הצעה", execution_preview: "תצוגת ביצוע", capability_gap: "פער יכולת",
  status_update: "עדכון סטטוס", final_result: "תוצאה סופית",
};
function msgTypeLabel(t: string): string {
  return MSG_TYPE_HE[t] ?? t;
}

export function JarvisRequests({ rows }: { rows: JarvisRequestRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<JarvisRequestRow | null>(null);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const pendingCount = rows.filter((r) => r.status === "pending_review").length;

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) alert(`הפעולה נכשלה: ${res.error ?? "שגיאה"}`);
      setSelected(null);
      setReason("");
      router.refresh();
    });
  };

  return (
    <div className="p-4 md:p-6" dir="rtl">
      <div className="glass-card-head mb-4">
        <h1 className="text-xl font-semibold text-white/90">🤖 בקשות מ-JARVIS — CEO Agent</h1>
        <p className="text-sm text-white/50 mt-1">
          משימות ובקשות שגראוויס שלח ל-CEO Agent של אלקיים. {pendingCount} ממתינות לאישור.
        </p>
        <p className="text-xs text-amber-300/80 mt-2">
          ⚠️ אישור מסמן את הבקשה כ״מאושרת לביצוע ידני/עתידי״. ביצוע אוטומטי עדיין כבוי — שום שינוי במחירים/קטלוג/כספים/צי אינו מתבצע מכאן.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="glass-panel p-8 text-center text-white/50">אין בקשות מ-JARVIS עדיין.</div>
      ) : (
        <div className="glass-table-wrap">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/50 text-right">
                <th className="p-3">בקשה</th>
                <th className="p-3">מחלקה / תפקיד</th>
                <th className="p-3">סיכון</th>
                <th className="p-3">סטטוס</th>
                <th className="p-3">נוצר</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="p-3 text-white/90">
                    <div className="font-medium">{r.title ?? r.action_type}</div>
                    <div className="text-white/40 text-xs truncate max-w-[28ch]">{r.summary}</div>
                  </td>
                  <td className="p-3 text-white/70">
                    {r.target_department ?? "—"}
                    {r.target_role ? <span className="text-white/40"> · {ROLE_HE[r.target_role] ?? r.target_role}</span> : null}
                  </td>
                  <td className="p-3">
                    <span className={`badge ${RISK[r.risk_level ?? ""]?.badge ?? "badge-gray"}`}>{RISK[r.risk_level ?? ""]?.label ?? r.risk_level ?? "—"}</span>
                  </td>
                  <td className="p-3">
                    <span className={`badge ${STATUS[r.status]?.badge ?? "badge-gray"}`}>{STATUS[r.status]?.label ?? r.status}</span>
                  </td>
                  <td className="p-3 text-white/50 whitespace-nowrap">{fmt(r.created_at)}</td>
                  <td className="p-3">
                    <button className="btn-glass" onClick={() => { setSelected(r); setReason(""); }}>פרטים</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="glass-modal" onClick={() => setSelected(null)}>
          <div className="glass-card max-w-2xl w-full p-5" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <h2 className="text-lg font-semibold text-white/90">{selected.title ?? selected.action_type}</h2>
              <button className="text-white/40 hover:text-white/80" onClick={() => setSelected(null)} aria-label="סגור">✕</button>
            </div>

            <div className="flex gap-2 mb-3">
              <span className={`badge ${STATUS[selected.status]?.badge ?? "badge-gray"}`}>{STATUS[selected.status]?.label ?? selected.status}</span>
              <span className={`badge ${RISK[selected.risk_level ?? ""]?.badge ?? "badge-gray"}`}>סיכון: {RISK[selected.risk_level ?? ""]?.label ?? selected.risk_level ?? "—"}</span>
            </div>

            <dl className="space-y-2 text-sm text-white/80">
              <Row k="הבקשה המקורית" v={selected.full_request ?? selected.summary} />
              <Row k="סוג פעולה" v={selected.action_type} />
              <Row k="מחלקת יעד" v={selected.target_department} />
              <Row k="תפקיד אחראי" v={selected.target_role ? (ROLE_HE[selected.target_role] ?? selected.target_role) : null} />
              <Row k="תקציר Dry-run" v={selected.dry_run_summary} />
              <Row k="תוכנית שחזור (rollback)" v={selected.rollback_plan} />
              <Row k="מבקש" v={selected.requested_by} />
              <Row k="Correlation ID" v={selected.correlation_id} mono />
              {selected.rejection_reason ? <Row k="הערה / סיבה" v={selected.rejection_reason} /> : null}
              {selected.approved_at ? <Row k="אושר" v={`${selected.approved_by ?? ""} · ${fmt(selected.approved_at)}`} /> : null}
            </dl>

            {/* Agent-to-agent conversation thread (JARVIS ↔ CEO-Agent ↔ owner) */}
            {selected.conversation && selected.conversation.length > 0 && (
              <div className="glass-inner mt-3 p-3 rounded">
                <div className="text-white/50 text-xs mb-2">שיחת הסוכנים</div>
                <div className="space-y-2">
                  {selected.conversation.map((t) => (
                    <div key={t.seq} className="text-sm">
                      <span className="text-white/40 text-xs">{agentLabel(t.source_agent)} · {msgTypeLabel(t.message_type)}</span>
                      <div className="text-white/85">{t.message_text}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-amber-300/80 mt-3">
              כל ביצוע דורש שני שלבים: תצוגה מקדימה (dry-run, ללא שינוי) ואז אישור ביצוע (אישור שני). השינוי הפיך — נשמר snapshot לשחזור.
            </p>

            {/* Dry-run preview panel */}
            {selected.preview_json && (
              <div className="glass-inner mt-3 p-3 rounded text-sm">
                <div className="text-white/70 mb-1">
                  תצוגה מקדימה (dry-run) — {selected.preview_json.affected_count} פריטים · {selected.preview_json.pct > 0 ? "+" : ""}{selected.preview_json.pct}% · עמודה: {selected.preview_json.price_column}
                </div>
                {selected.preview_json.items.slice(0, 6).map((it) => (
                  <div key={it.id} className="text-white/80">• {it.name}: ₪{it.old_price} → ₪{it.new_price}</div>
                ))}
                {selected.preview_json.affected_count > 6 && (
                  <div className="text-white/40">…ועוד {selected.preview_json.affected_count - 6}</div>
                )}
              </div>
            )}

            {/* Execution result */}
            {selected.execution_result && (
              <div className="glass-inner mt-3 p-3 rounded text-sm">
                <div className="text-green-300/90">
                  בוצע: {selected.execution_result.updated_count} עודכנו
                  {selected.execution_result.failed_count ? ` · ${selected.execution_result.failed_count} נכשלו` : ""}.
                </div>
                {selected.executed_at && <div className="text-white/40">{fmt(selected.executed_at)}</div>}
              </div>
            )}

            <div className="mt-4">
              {(selected.status === "pending_review" || selected.status === "needs_info") && (
                <>
                  <textarea
                    className="glass-inner w-full p-2 text-sm text-white/90 bg-transparent rounded"
                    placeholder="סיבת דחייה / הערה (לדחייה או 'דרוש מידע')"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                  />
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button className="btn-glow" disabled={pending} onClick={() => act(() => approveRequest(selected.id))}>✅ אשר בקשה</button>
                    <button className="btn-glass" disabled={pending} onClick={() => act(() => rejectRequest(selected.id, reason))}>🗑️ דחה</button>
                    <button className="btn-glass" disabled={pending} onClick={() => act(() => needsInfoRequest(selected.id, reason))}>❓ דרוש מידע</button>
                    <button className="btn-glass" disabled={pending} onClick={() => act(() => archiveRequest(selected.id))}>📦 ארכב</button>
                  </div>
                </>
              )}
              {selected.status === "approved" && actionCapabilities(selected.action_type).preview && (
                <div className="flex flex-wrap gap-2">
                  <button className="btn-glow" disabled={pending} onClick={() => act(() => generatePreview(selected.id))}>🔍 צור תצוגה מקדימה (dry-run)</button>
                  <button className="btn-glass" disabled={pending} onClick={() => act(() => archiveRequest(selected.id))}>📦 ארכב</button>
                </div>
              )}
              {selected.status === "approved" && !actionCapabilities(selected.action_type).preview && (
                <div className="flex flex-wrap gap-2">
                  <span className="text-white/50 text-sm self-center">פעולה זו אינה דורשת ביצוע — לאחר אישור היא נחשבת מטופלת.</span>
                  <button className="btn-glass" disabled={pending} onClick={() => act(() => archiveRequest(selected.id))}>📦 ארכב</button>
                </div>
              )}
              {selected.status === "preview_ready" && (
                <div className="flex flex-wrap gap-2">
                  <button className="btn-glow" disabled={pending} onClick={() => act(() => approveExecution(selected.id))}>✅ אשר ביצוע (אישור 2)</button>
                  <button className="btn-glass" disabled={pending} onClick={() => act(() => rejectRequest(selected.id, reason))}>🗑️ דחה</button>
                  <button className="btn-glass" disabled={pending} onClick={() => act(() => archiveRequest(selected.id))}>📦 ארכב</button>
                </div>
              )}
              {selected.status === "execution_approved" && (
                <div className="flex flex-wrap gap-2">
                  <button className="btn-glow" disabled={pending} onClick={() => act(() => executeRequest(selected.id))}>🚀 בצע עכשיו (עדכון מחירים)</button>
                  <button className="btn-glass" disabled={pending} onClick={() => act(() => archiveRequest(selected.id))}>📦 ארכב</button>
                </div>
              )}
              {selected.status === "executed" && (
                <div className="flex flex-wrap gap-2">
                  <button className="btn-glass" disabled={pending} onClick={() => act(() => revertRequest(selected.id))}>↩️ שחזר מחירים (revert)</button>
                  <button className="btn-glass" disabled={pending} onClick={() => act(() => archiveRequest(selected.id))}>📦 ארכב</button>
                </div>
              )}
              {(selected.status === "failed" || selected.status === "reverted" || selected.status === "rejected") && (
                <div className="flex gap-2">
                  <button className="btn-glass" disabled={pending} onClick={() => act(() => archiveRequest(selected.id))}>📦 ארכב</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string | null | undefined; mono?: boolean }) {
  if (!v) return null;
  return (
    <div className="flex flex-col">
      <dt className="text-white/40 text-xs">{k}</dt>
      <dd className={`text-white/85 ${mono ? "font-mono text-xs break-all" : ""}`}>{v}</dd>
    </div>
  );
}
