// Phase 2.6 — Agent chat response engine
// Queries real Supabase data and formats structured Hebrew responses.
// No LLM required — answers are grounded in live DB state.
// Future: add an LLM layer on top to interpret free-form answers if desired.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SourceRef } from "@/types/agentChat";

// ── Intent classification ────────────────────────────────────────────────────

export type ChatIntent =
  | "urgent"
  | "approvals"
  | "billing"
  | "diaries"
  | "exceptions"
  | "scan"
  | "summary"
  | "orders"
  | "restored"
  | "general";

const INTENT_KEYWORDS: Record<Exclude<ChatIntent, "general">, string[]> = {
  urgent:     ["דחוף", "קריטי", "חירום", "מיידי", "ביותר"],
  approvals:  ["אישור", "לאשר", "ממתינ"],
  billing:    ["חיוב", "חשבונית", "תשלום", "גבייה", "חוב", "billing"],
  diaries:    ["יומן", "שטח", "ביצוע", "צוות", "נהג", "diary"],
  exceptions: ["חריג", "בעיה", "שגיאה", "אזהרה", "exception"],
  scan:       ["סריקה", "האחרונה", "מצאו", "ממצאים", "פעילות", "scan"],
  summary:    ["סיכום", "מצב", "יום", "תעדכן", "תסכם", "קורה", "overview"],
  orders:     ["הזמנה", "פרויקט", "לקוח", "order"],
  restored:   ["שוחזר", "שחזור", "restore", "ביטול", "ארכיון"],
};

export function detectIntent(message: string): ChatIntent {
  const lower = message.toLowerCase();
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS) as [Exclude<ChatIntent, "general">, string[]][]) {
    if (keywords.some(k => lower.includes(k.toLowerCase()))) return intent;
  }
  return "summary";
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

const SEV_HE: Record<string, string> = { critical: "קריטי", error: "שגיאה", warn: "אזהרה", info: "מידע" };
const SEV_ICON: Record<string, string> = { critical: "🔴", error: "🟠", warn: "🟡", info: "🔵" };
const PRI_HE: Record<string, string> = { critical: "קריטי", high: "גבוה", normal: "רגיל", low: "נמוך" };

// ── Engine result ─────────────────────────────────────────────────────────────

export interface ChatEngineResult {
  content: string;
  sourceRefs: SourceRef[];
}

// ── Main engine ───────────────────────────────────────────────────────────────

export async function runChatEngine(
  db: SupabaseClient,
  ctx: { agentId: string | null; userId: string },
  message: string
): Promise<ChatEngineResult> {
  const intent = detectIntent(message);
  const agentFilter = ctx.agentId;

  // Scoped exception query builder
  function excBase() {
    let q = db.from("agent_exceptions")
      .select("id,agent_id,severity,category,title,related_entity_type,related_entity_id,status")
      .in("status", ["open", "acknowledged"])
      .order("severity", { ascending: false })
      .limit(20);
    if (agentFilter) q = q.eq("agent_id", agentFilter);
    return q;
  }

  // Scoped task query builder
  function taskBase() {
    let q = db.from("agent_tasks")
      .select("id,agent_id,title,priority,status,related_entity_type,related_entity_id,due_date")
      .in("status", ["open", "in_progress"])
      .order("priority", { ascending: false })
      .limit(20);
    if (agentFilter) q = q.eq("agent_id", agentFilter);
    return q;
  }

  switch (intent) {

    case "urgent": {
      const [excRes, taskRes] = await Promise.all([
        excBase().in("severity", ["critical", "error"]),
        taskBase().in("priority", ["critical", "high"]),
      ]);
      const excs = excRes.data ?? [];
      const tasks = taskRes.data ?? [];

      if (excs.length === 0 && tasks.length === 0) {
        return { content: "✅ אין חריגות קריטיות או משימות בעדיפות גבוהה פתוחות כרגע.", sourceRefs: [] };
      }

      const lines: string[] = [];
      if (excs.length > 0) {
        lines.push(`🚨 **${excs.length} חריגות קריטיות/שגיאות:**`);
        excs.slice(0, 8).forEach(e => {
          const loc = e.related_entity_id ? ` (${e.related_entity_type}: ${e.related_entity_id})` : "";
          lines.push(`  ${SEV_ICON[e.severity as string] ?? "🔴"} ${e.title as string}${loc}`);
        });
      }
      if (tasks.length > 0) {
        lines.push(`\n⚡ **${tasks.length} משימות בעדיפות גבוהה:**`);
        tasks.slice(0, 8).forEach(t => {
          lines.push(`  • ${t.title as string} — עדיפות: ${PRI_HE[t.priority as string] ?? t.priority}`);
        });
      }

      return {
        content: lines.join("\n"),
        sourceRefs: [
          ...excs.slice(0, 4).map(e => ({ table: "agent_exceptions", id: e.id as string, label: e.title as string })),
          ...tasks.slice(0, 4).map(t => ({ table: "agent_tasks", id: t.id as string, label: t.title as string })),
        ],
      };
    }

    case "approvals": {
      let q = db.from("agent_approvals")
        .select("id,agent_id,title,description,risk_level,status,created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(15);
      if (agentFilter) q = q.eq("agent_id", agentFilter);
      const { data } = await q;
      const approvals = data ?? [];

      if (approvals.length === 0) {
        return { content: "✅ אין אישורים ממתינים כרגע.", sourceRefs: [] };
      }

      const lines = [`📋 **${approvals.length} אישורים ממתינים:**`];
      approvals.slice(0, 10).forEach(a => {
        const riskIcon = ["high", "critical"].includes(a.risk_level as string) ? "⚠️" : "📌";
        lines.push(`  ${riskIcon} ${a.title as string} — סיכון: ${a.risk_level as string}`);
      });
      lines.push("\nלביצוע אישור: לשונית 'אישורים' במרכז הפיקוד.");

      return {
        content: lines.join("\n"),
        sourceRefs: approvals.slice(0, 5).map(a => ({ table: "agent_approvals", id: a.id as string, label: a.title as string })),
      };
    }

    case "billing": {
      const [excRes, ordersRes] = await Promise.all([
        db.from("agent_exceptions")
          .select("id,severity,title,related_entity_id")
          .in("status", ["open", "acknowledged"])
          .eq("agent_id", "billing-collections-agent")
          .limit(15),
        db.from("work_orders")
          .select("id,order_number,customer,accounting_status")
          .neq("status", "cancelled")
          .eq("accounting_status", "pending")
          .limit(10),
      ]);
      const billingExcs = excRes.data ?? [];
      const pendingOrders = ordersRes.data ?? [];

      if (billingExcs.length === 0 && pendingOrders.length === 0) {
        return { content: "✅ אין חריגות חיוב פתוחות ואין הזמנות ממתינות לחיוב.", sourceRefs: [] };
      }

      const lines: string[] = [];
      if (billingExcs.length > 0) {
        lines.push(`💰 **${billingExcs.length} חריגות חיוב פתוחות:**`);
        billingExcs.slice(0, 8).forEach(e => {
          lines.push(`  ${SEV_ICON[e.severity as string] ?? "🟡"} ${e.title as string}`);
        });
      }
      if (pendingOrders.length > 0) {
        lines.push(`\n📄 **${pendingOrders.length} הזמנות ממתינות לחיוב:**`);
        pendingOrders.slice(0, 8).forEach(o => {
          lines.push(`  • ${o.order_number as string} · ${o.customer as string}`);
        });
      }
      lines.push("\nלחיוב: לשונית 'הנה״ח' ← 'ממתין לחיוב'.");

      return {
        content: lines.join("\n"),
        sourceRefs: billingExcs.slice(0, 3).map(e => ({ table: "agent_exceptions", id: e.id as string, label: e.title as string })),
      };
    }

    case "diaries": {
      const [excRes, diariesRes] = await Promise.all([
        db.from("agent_exceptions")
          .select("id,severity,title,related_entity_id")
          .in("status", ["open", "acknowledged"])
          .eq("agent_id", "field-ops-agent")
          .limit(15),
        db.from("work_diaries")
          .select("id,customer_name,site_name,execution_date,approval_status,submitted_at")
          .not("approval_status", "in", '("approved","rejected")')
          .order("execution_date", { ascending: false })
          .limit(10),
      ]);
      const diaryExcs = excRes.data ?? [];
      const unapproved = diariesRes.data ?? [];

      if (diaryExcs.length === 0 && unapproved.length === 0) {
        return { content: "✅ כל יומני העבודה תקינים ומאושרים.", sourceRefs: [] };
      }

      const lines: string[] = [];
      if (diaryExcs.length > 0) {
        lines.push(`📋 **${diaryExcs.length} חריגות יומני עבודה:**`);
        diaryExcs.slice(0, 8).forEach(e => {
          lines.push(`  ${SEV_ICON[e.severity as string] ?? "🟡"} ${e.title as string}`);
        });
      }
      if (unapproved.length > 0) {
        lines.push(`\n📝 **${unapproved.length} יומנים ממתינים לאישור:**`);
        unapproved.slice(0, 8).forEach(d => {
          const name = (d.customer_name as string) || "—";
          const site = (d.site_name as string) || "—";
          lines.push(`  • ${name} · ${site} (${fmtDate(d.execution_date as string)})`);
        });
      }

      return {
        content: lines.join("\n"),
        sourceRefs: unapproved.slice(0, 5).map(d => ({ table: "work_diaries", id: d.id as string, label: `${d.customer_name} — ${fmtDate(d.execution_date as string)}` })),
      };
    }

    case "exceptions": {
      const { data } = await excBase();
      const excs = data ?? [];

      if (excs.length === 0) {
        return { content: "✅ אין חריגות פתוחות כרגע — המערכת תקינה.", sourceRefs: [] };
      }

      const bySev: Record<string, typeof excs> = {};
      excs.forEach(e => {
        const s = e.severity as string;
        if (!bySev[s]) bySev[s] = [];
        bySev[s].push(e);
      });

      const lines = [`⚠️ **${excs.length} חריגות פתוחות:**`];
      for (const sev of ["critical", "error", "warn", "info"]) {
        const group = bySev[sev] ?? [];
        if (group.length === 0) continue;
        lines.push(`\n${SEV_ICON[sev]} **${SEV_HE[sev]} (${group.length}):**`);
        group.slice(0, 5).forEach(e => lines.push(`  • ${e.title as string}`));
      }

      return {
        content: lines.join("\n"),
        sourceRefs: excs.slice(0, 5).map(e => ({ table: "agent_exceptions", id: e.id as string, label: e.title as string })),
      };
    }

    case "scan": {
      const actQ = db.from("agent_activity_feed")
        .select("id,agent_id,content,message_type,created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      const [actRes, agentsRes] = await Promise.all([
        agentFilter ? actQ.eq("agent_id", agentFilter) : actQ,
        db.from("agents").select("id,name,last_run_at,status").limit(10),
      ]);
      const activities = actRes.data ?? [];
      const agentsList = agentsRes.data ?? [];

      const lines: string[] = ["🔍 **תוצאות הסריקה האחרונה:**"];
      agentsList.forEach(a => {
        const lastRun = a.last_run_at ? fmtDate(a.last_run_at as string) : "טרם הופעל";
        lines.push(`  • ${a.name as string}: ${lastRun}`);
      });
      if (activities.length > 0) {
        lines.push(`\n📋 **${activities.length} רשומות אחרונות בפיד:**`);
        activities.slice(0, 6).forEach(a => lines.push(`  • ${a.content as string}`));
      } else {
        lines.push("\nאין רשומות בפיד. הפעל סריקה כללית ממרכז הפיקוד.");
      }

      return { content: lines.join("\n"), sourceRefs: [] };
    }

    case "orders": {
      const { data } = await db.from("work_orders")
        .select("id,order_number,customer,status,accounting_status")
        .neq("status", "cancelled")
        .neq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(10);
      const orders = data ?? [];

      if (orders.length === 0) {
        return { content: "אין הזמנות פעילות כרגע.", sourceRefs: [] };
      }

      const lines = [`📦 **${orders.length} הזמנות פעילות:**`];
      orders.forEach(o => {
        lines.push(`  • ${o.order_number as string} · ${o.customer as string} — ${o.status as string}`);
      });

      return {
        content: lines.join("\n"),
        sourceRefs: orders.slice(0, 5).map(o => ({ table: "work_orders", id: o.id as string, label: `${o.order_number} · ${o.customer}` })),
      };
    }

    case "restored": {
      const { data } = await db.from("order_activities")
        .select("id,order_id,description,created_at")
        .ilike("description", "%שוחזר%")
        .order("created_at", { ascending: false })
        .limit(10);
      const restored = data ?? [];

      if (restored.length === 0) {
        return { content: "לא נמצאו הזמנות שוחזרו לאחרונה.", sourceRefs: [] };
      }

      const lines = [`🔄 **${restored.length} שחזורים אחרונים:**`];
      restored.forEach(a => {
        lines.push(`  • הזמנה ${a.order_id as string} (${fmtDate(a.created_at as string)})`);
      });

      return { content: lines.join("\n"), sourceRefs: [] };
    }

    // "summary" + default + "general"
    default: {
      const [excRes, taskRes, approvalRes, diaryRes, orderRes] = await Promise.all([
        db.from("agent_exceptions").select("id,severity,status,agent_id").in("status", ["open","acknowledged"]),
        db.from("agent_tasks").select("id,priority,status").in("status", ["open","in_progress"]),
        db.from("agent_approvals").select("id,risk_level").eq("status", "pending"),
        db.from("work_diaries").select("id,approval_status").not("approval_status", "in", '("approved","rejected")'),
        db.from("work_orders").select("id,status,accounting_status").neq("status","cancelled").neq("status","completed"),
      ]);

      const excs     = excRes.data ?? [];
      const tasks    = taskRes.data ?? [];
      const approvs  = approvalRes.data ?? [];
      const diaries  = diaryRes.data ?? [];
      const orders   = orderRes.data ?? [];

      const critical     = excs.filter(e => e.severity === "critical").length;
      const errors       = excs.filter(e => e.severity === "error").length;
      const highTasks    = tasks.filter(t => ["high","critical"].includes(t.priority as string)).length;
      const pendingBill  = orders.filter(o => o.accounting_status === "pending").length;

      const lines: string[] = [
        `📊 **סיכום מצב — ${new Date().toLocaleDateString("he-IL")}**\n`,
      ];

      lines.push(critical > 0 || errors > 0
        ? `🔴 חריגות: **${excs.length} פתוחות** (${critical} קריטיות, ${errors} שגיאות)`
        : `🟢 חריגות: **${excs.length} פתוחות** — ללא קריטיות`
      );
      lines.push(`⚡ משימות: **${tasks.length} פתוחות** (${highTasks} בעדיפות גבוהה)`);
      lines.push(`📋 אישורים ממתינים: **${approvs.length}**`);
      lines.push(`📝 יומנים ממתינים לאישור: **${diaries.length}**`);
      lines.push(`💰 הזמנות ממתינות לחיוב: **${pendingBill} מתוך ${orders.length} פעילות**`);

      if (critical > 0) {
        lines.push(`\n⚠️ **דורש טיפול מיידי:** ${critical} חריגות קריטיות פתוחות. שאל "מה הכי דחוף?" לפרטים.`);
      } else if (approvs.length > 0) {
        lines.push(`\n💡 **מומלץ:** ${approvs.length} אישורים ממתינים לטיפולך.`);
      } else if (pendingBill > 0) {
        lines.push(`\n💡 **מומלץ:** ${pendingBill} הזמנות מוכנות לחיוב.`);
      } else {
        lines.push(`\n✅ **המצב תקין** — ניתן להמשיך בעבודה השוטפת.`);
      }

      return { content: lines.join("\n"), sourceRefs: [] };
    }
  }
}
