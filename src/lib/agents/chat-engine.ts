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
  | "inventory"
  | "profitability"
  | "needs_attention"
  | "department_status"
  | "qa_pilot"
  | "agent_status"
  | "navigation"
  | "supplier_documents"
  | "expenses"
  | "general";

export interface PageContext {
  pathname: string;
}

export interface HistoryTurn {
  role: "user" | "agent";
  content: string;
}

const INTENT_KEYWORDS: Record<Exclude<ChatIntent, "general">, string[]> = {
  // pilot check first — "פיילוט" must win over needs_attention "מה נשאר"
  qa_pilot:          ["פיילוט", "מוכנות", "להתחיל פיילוט", "לפני פיילוט", "מצב פיילוט", "מוכן להתחיל", "שער מוכנות"],
  // billing before approvals: "מה ממתין לחיוב?" has "חיוב"; must not hit approvals first
  billing:           ["חיוב", "חשבונית", "תשלום", "גבייה", "חוב", "billing", "חסום", "חסומות", "חסומים", "חסומ.*מלאי", "מלאי.*חסום", "התאמת.*מלאי.*חיוב", "חיוב.*מלאי"],
  approvals:         ["אישור", "לאשר", "לאישורי"],
  needs_attention:   ["דורש טיפול", "לטפל", "לטיפול", "צריך טיפול", "מה מחכה", "מה נשאר", "מה פתוח", "מה ממתין"],
  agent_status:      ["מצב הסוכנים", "מצב הסוכן", "איזה סוכנים", "כמה סוכנים", "סוכנים פעילים", "איזה סוכן פעיל"],
  navigation:        ["איפה אני רואה", "איך מגיע", "לאיפה", "איזה דף", "איך נכנס", "היכן אני"],
  // department keywords not in other intents (מחסן stays in inventory)
  department_status: ["מצב הגרפיקה", "מצב המסגרייה", "מצב תיאומים", "מה קורה בגרפיקה", "מה קורה במסגרייה", "גרפיקה", "מסגרייה", "QA", "תיאומים", "קואורדינציה"],
  urgent:            ["דחוף", "קריטי", "חירום", "מיידי", "ביותר", "הדחוף ביותר", "הכי דחוף", "הכי קריטי"],
  diaries:           ["יומן", "שטח", "ביצוע", "צוות", "נהג", "diary"],
  // plural forms added: שגיאות, חריגות, אזהרות
  exceptions:        ["חריג", "בעיה", "שגיאה", "שגיאות", "חריגות", "אזהרה", "אזהרות", "exception", "כמה שגיאות", "כמה חריגות"],
  scan:              ["סריקה", "האחרונה", "מצאו", "ממצאים", "פעילות", "scan"],
  // supplier documents before inventory so "חשבונית ספק" hits supplier_documents not inventory
  supplier_documents: ["חשבונית ספק", "מסמך ספק", "מסמכי ספקים", "ממתין לבדיקה", "קליטת מסמך", "תעודת משלוח ממתינה", "חשד לכפילות מסמך", "כמה מסמכים", "אילו מסמכים", "מסמכים תקועים"],
  expenses:          ["הוצאה", "הוצאות", "כמה קנינו", "כמה הוצאנו", "הוצאות החודש", "ממה קנינו", "אצל איזה ספק", "הוצאה לפי קטגוריה", "expense"],
  // inventory before summary so "מה מצב המחסן?" hits inventory not summary
  inventory:         ["מלאי", "מחסן", "פריט", "חסר", "מינימום", "רכש", "ספק", "להזמין", "inventory", "מיפוי", "פריטים", "שריון", "שמור", "שמורים", "reserv", "שוחרר", "פער", "צריכה", "נצרך", "נצרכו", "התאמה", "יומן", "בוצע", "ניוצל", "consump", "החזר", "החזרה", "הוחזר", "תעודת", "תעודה", "קליטה", "נקלט", "נקלטה", "delivery", "return_from", "ספירה", "המלצ", "לרכוש", "לקנות", "לדרוג", "דחוף.*רכש", "purchase", "recommend"],
  // profitability before orders: "לקוח" is in orders keywords; profitability-customer queries must be detected first
  profitability:     ["רווח", "רווחיות", "הפסד", "שולי", "מרווח", "cfo", "כספי", "כלכלי", "snapshot", "פרופיטביליט", "להשלים", "missing_data", "חסרות הזמנות", "חסרים פריטים", "למה הרווחיות", "מה צריך", "פירוט עבודות", "למה לקוח"],
  orders:            ["הזמנה", "פרויקט", "לקוח", "order"],
  restored:          ["שוחזר", "שחזור", "restore", "ביטול", "ארכיון"],
  summary:           ["סיכום", "מצב", "יום", "תעדכן", "תסכם", "קורה", "overview"],
};

export function detectIntent(
  message: string,
  pageContext?: PageContext | null,
  history?: HistoryTurn[] | null,
): ChatIntent {
  const lower = message.trim().toLowerCase();

  // Follow-up: very short or continuation word → re-run on last user message
  const CONTINUATION = ["תפרט", "ומה עוד", "הצג הכל", "המשך", "ולמה", "אז מה"];
  if ((lower.length < 8 || CONTINUATION.some(w => lower.startsWith(w))) && history?.length) {
    const lastUser = [...history].reverse().find(h => h.role === "user");
    if (lastUser) return detectIntent(lastUser.content, pageContext, null);
  }

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS) as [Exclude<ChatIntent, "general">, string[]][]) {
    if (keywords.some(k => lower.includes(k.toLowerCase()))) return intent;
  }

  // Page context auto-routing when no keyword matched
  if (pageContext) {
    const PATHNAME_INTENT: Partial<Record<string, ChatIntent>> = {
      "/warehouse":   "inventory",
      "/accounting":  "billing",
      "/orders":      "orders",
      "/fabrication": "department_status",
      "/graphics":    "department_status",
    };
    const routed = PATHNAME_INTENT[pageContext.pathname];
    if (routed) return routed;
  }

  return "general";
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
  message: string,
  options?: { pageContext?: PageContext | null; history?: HistoryTurn[] | null },
): Promise<ChatEngineResult> {
  const intent      = detectIntent(message, options?.pageContext, options?.history);
  const agentFilter = ctx.agentId;
  const pageContext = options?.pageContext ?? null;

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
      const isInventoryBlockedQuery = /חסום|חסומות|חסומים|התאמת.*מלאי|מלאי.*חיוב|חיוב.*מלאי/.test(message);

      if (isInventoryBlockedQuery) {
        // Query specifically about orders blocked by inventory reconciliation
        const invExcRes = await db.from("agent_exceptions")
          .select("id,severity,title,related_entity_id,detected_from_data")
          .in("status", ["open", "acknowledged"])
          .eq("category", "inventory_reconciliation_missing")
          .limit(20);
        const blocked = invExcRes.data ?? [];
        if (blocked.length === 0) {
          return { content: "✅ אין הזמנות חסומות לחיוב בגלל חוסר התאמת מלאי.", sourceRefs: [] };
        }
        const lines = [`🔒 **${blocked.length} הזמנות חסומות לחיוב — נדרשת התאמת מלאי:**\n`];
        blocked.forEach(e => {
          const d = e.detected_from_data as Record<string, unknown> | null ?? {};
          lines.push(`  🟡 ${e.title as string}${d.customer ? ` | לקוח: ${d.customer}` : ""}`);
        });
        lines.push("\nלפתרון: מחסן ← הזמנות → 'בצע התאמה' עבור כל הזמנה.");
        return {
          content: lines.join("\n"),
          sourceRefs: blocked.slice(0, 3).map(e => ({ table: "agent_exceptions", id: e.id as string, label: e.title as string })),
        };
      }

      const [excRes, ordersRes] = await Promise.all([
        db.from("agent_exceptions")
          .select("id,severity,title,related_entity_id")
          .in("status", ["open", "acknowledged"])
          .eq("agent_id", "billing-collections-agent")
          .limit(15),
        db.from("work_orders")
          .select("id,order_number,customer,accounting_status")
          .eq("status", "completed")
          .in("accounting_status", ["pending", "verified"])
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
      // Number detection: user may reference a count visible in the UI (e.g. "מה אלו 49 השגיאות?")
      const numMatch = message.match(/(\d+)/);
      const mentionedNumber = numMatch ? parseInt(numMatch[1], 10) : null;

      let excQ = db.from("agent_exceptions")
        .select("id,agent_id,severity,category,title,status")
        .in("status", ["open", "acknowledged"])
        .order("severity", { ascending: false })
        .limit(mentionedNumber !== null ? 200 : 20);
      if (agentFilter) excQ = excQ.eq("agent_id", agentFilter);
      const { data: excData } = await excQ;
      const excs = excData ?? [];

      if (excs.length === 0) {
        return { content: "✅ אין חריגות פתוחות כרגע — המערכת תקינה.", sourceRefs: [] };
      }

      const lines: string[] = [];
      if (mentionedNumber !== null) {
        const diff = Math.abs(excs.length - mentionedNumber);
        if (diff <= Math.max(5, Math.round(mentionedNumber * 0.1))) {
          lines.push(`⚠️ **${excs.length} חריגות פתוחות — פירוט לפי חומרה וסוכן:**`);
        } else {
          lines.push(`⚠️ **${excs.length} חריגות פתוחות כרגע** (שאלת על ${mentionedNumber} — ייתכן שהמספר השתנה). פירוט:`);
        }
      } else {
        lines.push(`⚠️ **${excs.length} חריגות פתוחות:**`);
      }

      const bySev: Record<string, typeof excs> = {};
      excs.forEach(e => {
        const s = e.severity as string;
        if (!bySev[s]) bySev[s] = [];
        bySev[s].push(e);
      });

      for (const sev of ["critical", "error", "warn", "info"]) {
        const group = bySev[sev] ?? [];
        if (group.length === 0) continue;
        lines.push(`\n${SEV_ICON[sev]} **${SEV_HE[sev]} (${group.length}):**`);
        if (mentionedNumber !== null) {
          // Detailed: group by agent
          const byAgent: Record<string, typeof excs> = {};
          group.forEach(e => {
            const a = (e.agent_id as string | null) ?? "unknown";
            if (!byAgent[a]) byAgent[a] = [];
            byAgent[a].push(e);
          });
          for (const [aId, aExcs] of Object.entries(byAgent)) {
            const agentLabel = aId.replace(/-agent$/, "").replace(/-/g, " ");
            lines.push(`  📌 ${agentLabel} (${aExcs.length}):`);
            (aExcs as typeof excs).slice(0, 3).forEach(e => lines.push(`    • ${e.title as string}`));
            if (aExcs.length > 3) lines.push(`    ... ועוד ${aExcs.length - 3}`);
          }
        } else {
          group.slice(0, 5).forEach(e => lines.push(`  • ${e.title as string}`));
          if (group.length > 5) lines.push(`  ... ועוד ${group.length - 5}`);
        }
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

    case "inventory": {
      const isReservationQuery    = /שריון|שמור|שמורים|reserv|שוחרר|פער/.test(message);
      const isConsumptionQuery    = /צריכה|נצרך|נצרכו|התאמה|יומן.*מלאי|בוצע.*מלאי|ניוצל|consump|ממתין.*התאמ|פער.*מתוכנן|כפולה/.test(message);
      const isDeliveryNoteQuery   = /תעודת|תעודה|קליטה|נקלט|delivery|ספירה|סחורה.*הגיע|הגיע.*סחורה/.test(message);
      const isReturnQuery         = /החזר|החזרה|הוחזר|return_from|חזר.*שטח|שטח.*חזר/.test(message);
      const isPurchaseQuery       = /המלצ|לרכוש|לקנות|להזמין|purchase|recommend|מה.*דחוף.*רכש|מה.*צריך.*להזמין|פריטים.*בלי.*ספק|ספק.*חסר/.test(message);

      const [excRes, itemsRes, reservationsRes, consumptionsRes] = await Promise.all([
        db.from("agent_exceptions")
          .select("id,severity,title,category,related_entity_id")
          .in("status", ["open", "acknowledged"])
          .eq("agent_id", "inventory-agent")
          .limit(20),
        db.from("catalog_items")
          .select("id,name,unit_of_measure,current_quantity,minimum_quantity,reserved_quantity,supplier_id,is_active")
          .eq("is_active", true),
        db.from("inventory_reservations")
          .select("id,item_id,order_id,order_item_key,quantity,status,metadata")
          .eq("status", "active")
          .limit(200),
        db.from("inventory_consumptions")
          .select("id,item_id,order_id,work_diary_id,order_item_key,quantity,status,metadata,consumed_at")
          .in("status", ["consumed", "pending_review"])
          .order("consumed_at", { ascending: false })
          .limit(100),
      ]);

      const excs         = excRes.data ?? [];
      const items        = itemsRes.data ?? [];
      const reservations = reservationsRes.data ?? [];
      const consumptions = consumptionsRes.data ?? [];

      const itemMap = new Map(items.map(i => [i.id as string, i]));

      // ── Consumption-specific queries ────────────────────────────────────
      if (isConsumptionQuery) {
        const lines: string[] = [`📊 **צריכת מלאי — ${new Date().toLocaleDateString("he-IL")}**\n`];

        if (consumptions.length === 0) {
          lines.push("אין רשומות צריכת מלאי עדיין.");
          lines.push("\nכדי להפעיל צריכה: אשר יומן שטח המקושר להזמנה עם פריטי קטלוג.");
          return { content: lines.join("\n"), sourceRefs: [] };
        }

        // Group by item
        const byItem = new Map<string, typeof consumptions>();
        for (const c of consumptions) {
          const iid = c.item_id as string;
          if (!byItem.has(iid)) byItem.set(iid, []);
          byItem.get(iid)!.push(c);
        }

        // Group by order
        const byOrder = new Map<string, typeof consumptions>();
        for (const c of consumptions) {
          const oid = c.order_id as string;
          if (!byOrder.has(oid)) byOrder.set(oid, []);
          byOrder.get(oid)!.push(c);
        }

        lines.push(`סה"כ רשומות צריכה: **${consumptions.length}** | פריטים שנצרכו: **${byItem.size}** | הזמנות מטופלות: **${byOrder.size}**\n`);

        // Items consumed
        lines.push("**פריטים שנצרכו לאחרונה:**");
        let shown = 0;
        for (const [itemId, cons] of byItem) {
          if (shown >= 6) { lines.push(`  ... ועוד ${byItem.size - shown} פריטים`); break; }
          const item = itemMap.get(itemId);
          const name = item ? (item.name as string) : itemId;
          const unit = item ? (item.unit_of_measure as string) : "";
          const total = cons.reduce((s, c) => s + (c.quantity as number), 0);
          const orderNums = [...new Set(cons.map(c => (c.metadata as { orderNumber?: string } | null)?.orderNumber ?? c.order_id as string))];
          lines.push(`  🔧 **${name}** — נצרך: ${total} ${unit} | הזמנות: ${orderNums.slice(0, 2).join(", ")}${orderNums.length > 2 ? ` +${orderNums.length - 2}` : ""}`);
          shown++;
        }

        // Orders pending reconciliation
        const consumptionExcs = excs.filter(e => ["missing_consumption","completed_order_no_reconciliation","over_consumption","consumption_unapproved_diary","duplicate_consumption"].includes(e.category as string));
        if (consumptionExcs.length > 0) {
          lines.push(`\n⚠️ **חריגות התאמת מלאי פתוחות: ${consumptionExcs.length}**`);
          consumptionExcs.slice(0, 4).forEach(e => lines.push(`  • ${e.title as string}`));
        } else {
          lines.push("\n✅ אין חריגות התאמת מלאי פתוחות");
        }

        return {
          content: lines.join("\n"),
          sourceRefs: consumptionExcs.slice(0, 3).map(e => ({ table: "agent_exceptions", id: e.id as string, label: e.title as string })),
        };
      }

      // ── Reservation-specific queries ────────────────────────────────────
      if (isReservationQuery) {
        const lines: string[] = [`🔒 **שריונות מלאי פעילים — ${new Date().toLocaleDateString("he-IL")}**\n`];

        if (reservations.length === 0) {
          lines.push("אין שריונות פעילים כרגע.");
          return { content: lines.join("\n"), sourceRefs: [] };
        }

        // Group reservations by item
        const byItem = new Map<string, typeof reservations>();
        for (const r of reservations) {
          const itemId = r.item_id as string;
          if (!byItem.has(itemId)) byItem.set(itemId, []);
          byItem.get(itemId)!.push(r);
        }

        lines.push(`סה"כ שריונות פעילים: **${reservations.length}** | פריטים שמורים: **${byItem.size}**\n`);

        // Cache mismatch check
        const mismatches: string[] = [];
        for (const item of items) {
          const active = reservations.filter(r => r.item_id === item.id);
          const computed = active.reduce((s, r) => s + (r.quantity as number), 0);
          if (Math.abs(computed - (item.reserved_quantity as number)) > 0.0001) {
            mismatches.push(`${item.name as string}: מטמון=${item.reserved_quantity} | מחושב=${computed}`);
          }
        }
        if (mismatches.length > 0) {
          lines.push(`⚠️ **פערים במטמון שריונות (${mismatches.length}):**`);
          mismatches.slice(0, 3).forEach(m => lines.push(`  • ${m}`));
          lines.push("בצע סנכרון שריונות לתיקון.\n");
        } else {
          lines.push("✅ מטמון reserved_quantity תואם לשריונות הפעילים\n");
        }

        // Per-item breakdown
        lines.push("**פריטים עם שריונות פעילים:**");
        let shown = 0;
        for (const [itemId, itemRes] of byItem) {
          if (shown >= 8) { lines.push(`  ... ועוד ${byItem.size - shown} פריטים`); break; }
          const item   = itemMap.get(itemId);
          const name   = item ? (item.name as string) : itemId;
          const unit   = item ? (item.unit_of_measure as string) : "";
          const total  = itemRes.reduce((s, r) => s + (r.quantity as number), 0);
          const orders = [...new Set(itemRes.map(r => (r.metadata as { orderNumber?: string } | null)?.orderNumber ?? r.order_id as string))];
          lines.push(`  📦 **${name}** — שמור: ${total} ${unit} | הזמנות: ${orders.slice(0, 3).join(", ")}${orders.length > 3 ? ` +${orders.length - 3}` : ""}`);
          shown++;
        }

        // Stale/invalid exceptions
        const reservationExcs = excs.filter(e => ["stale_reservation","duplicate_reservation","reserved_cache_mismatch","invalid_reservation_quantity","missing_reservation"].includes(e.category as string));
        if (reservationExcs.length > 0) {
          lines.push(`\n⚠️ **חריגות שריון פתוחות: ${reservationExcs.length}**`);
          reservationExcs.slice(0, 3).forEach(e => lines.push(`  • ${e.title as string}`));
        }

        return {
          content: lines.join("\n"),
          sourceRefs: reservationExcs.slice(0, 3).map(e => ({ table: "agent_exceptions", id: e.id as string, label: e.title as string })),
        };
      }

      // ── Delivery note queries ───────────────────────────────────────────
      if (isDeliveryNoteQuery) {
        const [notesRes, noteItemsRes] = await Promise.all([
          db.from("delivery_notes")
            .select("id,supplier_name,document_number,received_date,status,created_at")
            .not("status", "eq", "cancelled")
            .order("received_date", { ascending: false })
            .limit(50),
          db.from("delivery_note_items")
            .select("id,delivery_note_id,item_id,description,delivered_quantity,counted_quantity,status"),
        ]);
        const notes     = notesRes.data ?? [];
        const noteItems = noteItemsRes.data ?? [];

        const lines: string[] = [`📋 **תעודות משלוח — ${new Date().toLocaleDateString("he-IL")}**\n`];

        if (notes.length === 0) {
          lines.push("אין תעודות משלוח פעילות.\nצור תעודה חדשה מלשונית 'קליטת סחורה' במחלקת מחסן.");
          return { content: lines.join("\n"), sourceRefs: [] };
        }

        const byStatus = { draft: 0, counted: 0, approved: 0 } as Record<string, number>;
        for (const n of notes) byStatus[(n.status as string)] = (byStatus[(n.status as string)] ?? 0) + 1;

        lines.push(`סה"כ תעודות פעילות: **${notes.length}** | טיוטות: **${byStatus.draft ?? 0}** | בספירה: **${byStatus.counted ?? 0}** | אושרו: **${byStatus.approved ?? 0}**\n`);

        const pending = notes.filter(n => n.status === "draft" || n.status === "counted");
        if (pending.length > 0) {
          lines.push("**ממתינות לאישור:**");
          pending.slice(0, 5).forEach(n => {
            const itemCount = noteItems.filter(i => i.delivery_note_id === n.id).length;
            lines.push(`  📦 תעודה ${n.document_number ?? n.id} | ${n.supplier_name ?? "ספק לא מוגדר"} | ${n.received_date} | ${itemCount} פריטים | סטטוס: ${n.status}`);
          });
        }

        const mismatches = noteItems.filter(i => {
          const delivQty = i.delivered_quantity as number | null;
          const countQty = i.counted_quantity as number | null;
          return delivQty !== null && countQty !== null && Math.abs(countQty - delivQty) > 0.0001;
        });
        if (mismatches.length > 0) {
          lines.push(`\n⚠️ **פערי ספירה: ${mismatches.length}** — פריטים עם אי-התאמה בין תעודה לספירה`);
        }

        const unmapped = noteItems.filter(i => !i.item_id && i.status !== "approved");
        if (unmapped.length > 0) {
          lines.push(`🔗 **פריטים לא ממופים: ${unmapped.length}** — לא יעודכן מלאי עד למיפוי לקטלוג`);
        }

        return { content: lines.join("\n"), sourceRefs: [] };
      }

      // ── Return from field queries ────────────────────────────────────────
      if (isReturnQuery) {
        const returnsRes = await db.from("inventory_movements")
          .select("id,item_id,quantity,notes,created_by,created_at,source_id")
          .eq("movement_type", "return")
          .eq("source_type", "return_from_field")
          .order("created_at", { ascending: false })
          .limit(50);

        const returns = returnsRes.data ?? [];
        const lines: string[] = [`↩️ **החזרות מהשטח — ${new Date().toLocaleDateString("he-IL")}**\n`];

        if (returns.length === 0) {
          lines.push("אין החזרות מהשטח רשומות.");
          lines.push("החזרות מדווחות מלשונית 'החזרות מהשטח' במחלקת מחסן לאחר אישור יומן שטח.");
          return { content: lines.join("\n"), sourceRefs: [] };
        }

        const totalQty   = returns.reduce((s, r) => s + (r.quantity as number), 0);
        const byItem     = new Map<string, number>();
        for (const r of returns) {
          byItem.set(r.item_id as string, (byItem.get(r.item_id as string) ?? 0) + (r.quantity as number));
        }

        lines.push(`סה"כ החזרות: **${returns.length}** | כמות כוללת שהוחזרה: **${totalQty}** יח׳ | פריטים שונים: **${byItem.size}**\n`);

        lines.push("**החזרות אחרונות:**");
        returns.slice(0, 6).forEach(r => {
          const item     = itemMap.get(r.item_id as string);
          const itemName = item ? (item.name as string) : (r.item_id as string);
          const unit     = item ? (item.unit_of_measure as string) : "יח׳";
          const date     = fmtDate(r.created_at as string);
          lines.push(`  ↩️ **${itemName}** — ${r.quantity} ${unit} | ${date} | ${r.created_by}`);
        });

        const returnExcs = excs.filter(e => e.category === "return_from_field_pending");
        if (returnExcs.length > 0) {
          lines.push(`\n⏳ **ממתינות לדיווח החזרה: ${returnExcs.length}** הזמנות שהושלמו עם ציוד לא מדווח`);
        } else {
          lines.push(`\n✅ אין הזמנות ממתינות לדיווח החזרת ציוד`);
        }

        return { content: lines.join("\n"), sourceRefs: [] };
      }

      // ── Purchase recommendation queries ────────────────────────────────
      if (isPurchaseQuery) {
        const [recRes, suppliersRes] = await Promise.all([
          db.from("purchase_recommendations")
            .select("id,item_id,supplier_id,recommendation_type,current_quantity,minimum_quantity,recommended_quantity,urgency,status,reason")
            .not("status", "in", '("dismissed","resolved","converted_to_order_later")')
            .order("urgency", { ascending: false })
            .limit(50),
          db.from("suppliers").select("id,name").eq("is_active", true).limit(100),
        ]);

        const recs      = recRes.data ?? [];
        const suppMap   = new Map((suppliersRes.data ?? []).map(s => [s.id as string, s.name as string]));
        const urgencyOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        const urgencyHe: Record<string, string> = { critical: "קריטי", high: "גבוה", medium: "בינוני", low: "נמוך" };
        const urgencyIcon: Record<string, string> = { critical: "🔴", high: "🟠", medium: "🟡", low: "🔵" };
        const typeHe: Record<string, string> = {
          negative_stock: "מלאי שלילי", out_of_stock: "חסר", low_stock: "נמוך",
          over_reserved: "שריון חורג", delivery_note_gap: "פער תעודה", manual: "ידני",
        };
        const sorted = [...recs].sort((a, b) =>
          (urgencyOrder[a.urgency as string] ?? 9) - (urgencyOrder[b.urgency as string] ?? 9)
        );

        const lines: string[] = [`🛒 **המלצות רכש — ${new Date().toLocaleDateString("he-IL")}**\n`];

        if (sorted.length === 0) {
          lines.push("אין המלצות רכש פתוחות כרגע.");
          lines.push("הרץ סריקת מלאי לעדכון המלצות אוטומטיות.");
          return { content: lines.join("\n"), sourceRefs: [] };
        }

        const critical = sorted.filter(r => r.urgency === "critical");
        const high     = sorted.filter(r => r.urgency === "high");
        const rest     = sorted.filter(r => r.urgency !== "critical" && r.urgency !== "high");

        lines.push(`סה״כ המלצות פתוחות: **${sorted.length}** | קריטי: **${critical.length}** | גבוה: **${high.length}**\n`);

        const printRec = (r: typeof recs[0]) => {
          const catItem = items.find(i => i.id === r.item_id);
          const name    = catItem ? catItem.name as string : (r.item_id as string).slice(0, 8);
          const unit    = catItem ? catItem.unit_of_measure as string : "";
          const icon    = urgencyIcon[r.urgency as string] ?? "⚪";
          const urgHe   = urgencyHe[r.urgency as string] ?? r.urgency;
          const typeStr = typeHe[r.recommendation_type as string] ?? r.recommendation_type;
          const supplier = r.supplier_id ? suppMap.get(r.supplier_id as string) : null;
          lines.push(`  ${icon} **${name}** — ${typeStr} | מומלץ: ${r.recommended_quantity} ${unit} | דחיפות: ${urgHe}${supplier ? ` | ספק: ${supplier}` : " | ⚠ ספק חסר"}`);
        };

        if (critical.length > 0) {
          lines.push("**קריטי — טיפול מיידי:**");
          critical.slice(0, 5).forEach(printRec);
        }
        if (high.length > 0) {
          lines.push("\n**גבוה:**");
          high.slice(0, 5).forEach(printRec);
        }
        if (rest.length > 0) {
          lines.push(`\n**בינוני/נמוך: ${rest.length} פריטים נוספים**`);
          rest.slice(0, 3).forEach(printRec);
        }

        // Items missing supplier
        const missingSupplier = items.filter(i =>
          (i.minimum_quantity as number) > 0 && !i.supplier_id
        );
        if (missingSupplier.length > 0) {
          lines.push(`\n⚠ **פריטים ללא ספק (${missingSupplier.length}):** ${missingSupplier.slice(0, 3).map(i => i.name as string).join(", ")}${missingSupplier.length > 3 ? " ועוד..." : ""}`);
        }

        lines.push(`\n_לניהול המלצות: לשונית "המלצות רכש" במחלקת מחסן_`);
        return { content: lines.join("\n"), sourceRefs: [] };
      }

      // ── Standard stock summary ──────────────────────────────────────────
      const negative   = items.filter(i => (i.current_quantity as number) < 0);
      const outOfStock = items.filter(i => (i.current_quantity as number) === 0 && (i.minimum_quantity as number) > 0);
      const lowStock   = items.filter(i => (i.minimum_quantity as number) > 0 && (i.current_quantity as number) > 0 && (i.current_quantity as number) < (i.minimum_quantity as number));
      const tracked    = items.filter(i => (i.minimum_quantity as number) > 0);
      const withReservations = items.filter(i => (i.reserved_quantity as number) > 0);

      if (items.length === 0) {
        return { content: "📦 אין פריטי מלאי מוגדרים במערכת. הוסף פריטים בקטלוג ועדכן כמויות.", sourceRefs: [] };
      }

      const lines: string[] = [`📦 **מצב מחסן — ${new Date().toLocaleDateString("he-IL")}**\n`];
      lines.push(`פריטים פעילים: **${items.length}** | מנוהלי מלאי: **${tracked.length}** | עם שריונות: **${withReservations.length}**`);

      if (negative.length > 0)   lines.push(`🔴 מלאי שלילי: **${negative.length}** פריטים — דורש טיפול מיידי`);
      if (outOfStock.length > 0)  lines.push(`🟠 חסר (מלאי אפס): **${outOfStock.length}** פריטים`);
      if (lowStock.length > 0)    lines.push(`🟡 מלאי נמוך: **${lowStock.length}** פריטים`);

      if (negative.length === 0 && outOfStock.length === 0 && lowStock.length === 0 && tracked.length > 0) {
        lines.push(`✅ כל הפריטים המנוהלים עומדים בסף המינימום`);
      }

      if (negative.length > 0) {
        lines.push(`\n**פריטים עם מלאי שלילי:**`);
        negative.slice(0, 5).forEach(i => {
          lines.push(`  🔴 ${i.name as string} — ${i.current_quantity as number} ${i.unit_of_measure as string}`);
        });
      }

      if (outOfStock.length > 0) {
        lines.push(`\n**חסרים — דרושה הזמנת רכש:**`);
        outOfStock.slice(0, 5).forEach(i => {
          lines.push(`  🟠 ${i.name as string} — מינימום: ${i.minimum_quantity as number} ${i.unit_of_measure as string}`);
        });
      }

      if (lowStock.length > 0) {
        lines.push(`\n**מלאי נמוך:**`);
        lowStock.slice(0, 5).forEach(i => {
          const shortage = (i.minimum_quantity as number) - (i.current_quantity as number);
          lines.push(`  🟡 ${i.name as string} — ${i.current_quantity as number}/${i.minimum_quantity as number} (קצר: ${shortage}) ${i.unit_of_measure as string}`);
        });
      }

      if (withReservations.length > 0) {
        lines.push(`\n**פריטים עם שריונות פעילים:**`);
        withReservations.slice(0, 4).forEach(i => {
          const avail = (i.current_quantity as number) - (i.reserved_quantity as number);
          lines.push(`  🔒 ${i.name as string} — שמור: ${i.reserved_quantity} | זמין: ${avail} ${i.unit_of_measure as string}`);
        });
        if (withReservations.length > 4) lines.push(`  ... ועוד ${withReservations.length - 4}`);
      }

      if (excs.length > 0) {
        lines.push(`\n**חריגות מחסן פתוחות: ${excs.length}** — בצע סריקה לעדכון`);
      }

      return {
        content: lines.join("\n"),
        sourceRefs: excs.slice(0, 3).map(e => ({ table: "agent_exceptions", id: e.id as string, label: e.title as string })),
      };
    }

    case "profitability": {
      const lower = message.toLowerCase();

      // ── Sub-query routing ──
      const wantsRevenue = lower.includes("חסר") && (lower.includes("הכנסה") || lower.includes("סכום"));
      const wantsCostPrice = lower.includes("עלות") && (lower.includes("חסר") || lower.includes("פריט"));
      const wantsMissingData = !lower.includes("לקוחות") && (lower.includes("missing") || (lower.includes("חסר") && lower.includes("נתון")) || lower.includes("להשלים") || lower.includes("מה צריך"));
      const wantsLowConf = lower.includes("ביטחון נמוך") || lower.includes("ודאות נמוכה") || (lower.includes("ביטחון") && lower.includes("נמוך")) || lower.includes("low confidence") || lower.includes("אמינות");
      const wantsNegative = lower.includes("הפסדיות") || lower.includes("הזמנות מפסידות") || (lower.includes("הפסד") && (lower.includes("איזה") || lower.includes("אילו") || lower.includes("רשימ")));
      const wantsStale = lower.includes("לא עודכנו") || lower.includes("לא עדכניות") || (lower.includes("מתי") && lower.includes("עודכן")) || lower.includes("ישנים");
      const wantsBelowTarget = lower.includes("מתחת ליעד") || lower.includes("פחות מיעד") || lower.includes("מתחת לסף") || (lower.includes("מתחת") && lower.includes("יעד"));
      const wantsNearTarget = lower.includes("קרוב ליעד") || lower.includes("קרובות ליעד");
      const wantsTargetInfo = lower.includes("מה יעד") || lower.includes("כמה יעד") || lower.includes("יעד הרווחיות") || (lower.includes("יעד") && lower.includes("מרווח"));
      // Customer-level queries (Phase 4.6)
      const wantsCustomerProfit = lower.includes("לפי לקוח") || lower.includes("רווחיות לקוח") || lower.includes("לקוחות רווחי") || lower.includes("הכי רווחי") || lower.includes("לקוח רווח");
      const wantsUnprofitableCustomers = lower.includes("לקוחות פחות רווחי") || lower.includes("לקוחות הפסד") || lower.includes("לקוחות עם הפסד") || (lower.includes("לקוח") && lower.includes("הפסד")) || (lower.includes("לקוח") && lower.includes("הפסדי"));
      const wantsCustomerMissingData = lower.includes("לקוחות חסרים") || (lower.includes("לקוח") && lower.includes("חסר") && lower.includes("נתון"));
      const wantsCustomerDrilldown = (lower.includes("פירוט") && lower.includes("לקוח")) || (lower.includes("עבודות") && lower.includes("לקוח")) || lower.includes("למה לקוח");

      if (wantsRevenue) {
        const { data: orders } = await db
          .from("work_orders")
          .select("id,order_number,customer,status,billed_amount")
          .is("billed_amount", null)
          .not("status", "in", '("cancelled")')
          .order("created_at", { ascending: false })
          .limit(15);
        const list = orders ?? [];
        if (list.length === 0) {
          return { content: "✅ כל ההזמנות הפעילות כבר מכילות סכום הכנסה.", sourceRefs: [] };
        }
        const lines: string[] = [`💰 **${list.length} הזמנות ללא סכום לחישוב רווחיות:**\n`];
        for (const o of list.slice(0, 10)) {
          lines.push(`· ${o.order_number as string} — ${o.customer as string} (${o.status as string})`);
        }
        lines.push(`\nכדי להזין סכום: /profitability ← לשונית CFO ליי ← שדה "סכום לחישוב רווחיות"`);
        return { content: lines.join("\n"), sourceRefs: [] };
      }

      if (wantsCostPrice) {
        const { data: items } = await db
          .from("catalog_items")
          .select("id,name,type")
          .in("type", ["material", "product"])
          .eq("is_active", true)
          .is("cost_price", null)
          .limit(15);
        const list = items ?? [];
        if (list.length === 0) {
          return { content: "✅ כל פריטי החומרים והמוצרים הפעילים מכילים מחיר עלות.", sourceRefs: [] };
        }
        const lines: string[] = [`🏷 **${list.length} פריטי קטלוג ללא מחיר עלות:**\n`];
        for (const i of list.slice(0, 10)) {
          lines.push(`· ${i.name as string} (${i.type as string})`);
        }
        lines.push(`\nכדי לעדכן: /catalog ← לחץ על הפריט ← "מחיר עלות (₪)"`);
        return { content: lines.join("\n"), sourceRefs: [] };
      }

      if (wantsMissingData) {
        const [ordersRes, snapsRes, itemsRes] = await Promise.all([
          db.from("work_orders").select("id", { count: "exact", head: true }).is("billed_amount", null).not("status", "in", '("cancelled")'),
          db.from("profitability_snapshots").select("order_id,confidence_level,missing_data").is("work_diary_id", null),
          db.from("catalog_items").select("id", { count: "exact", head: true }).in("type", ["material","product"]).eq("is_active", true).is("cost_price", null),
        ]);
        const missingRev = ordersRes.count ?? 0;
        const missingCp = itemsRes.count ?? 0;
        const snaps = snapsRes.data ?? [];
        const missingDataSnaps = snaps.filter(s => s.confidence_level === "missing_data").length;
        const lowSnaps = snaps.filter(s => s.confidence_level === "low").length;
        const lines: string[] = [`📋 **מה צריך להשלים לחישוב רווחיות:**\n`];
        if (missingRev > 0) lines.push(`🔴 ${missingRev} הזמנות ללא סכום הכנסה — הזן בלשונית CFO ליי`);
        if (missingCp > 0) lines.push(`🟠 ${missingCp} פריטי קטלוג ללא מחיר עלות — עדכן בקטלוג`);
        if (missingDataSnaps > 0) lines.push(`⚪ ${missingDataSnaps} חישובים במצב "נתונים חסרים"`);
        if (lowSnaps > 0) lines.push(`🟡 ${lowSnaps} חישובים עם ביטחון נמוך`);
        if (missingRev === 0 && missingCp === 0) lines.push(`✅ הנתונים הבסיסיים מלאים — לחץ "חשב מחדש הכל" בלשונית CFO ליי לעדכון`);
        return { content: lines.join("\n"), sourceRefs: [] };
      }

      // ── Low confidence snapshots ──
      if (wantsLowConf) {
        const { data: lowSnaps } = await db
          .from("profitability_snapshots")
          .select("order_id,confidence_level,missing_data,updated_at,work_orders(order_number,customer)")
          .is("work_diary_id", null)
          .in("confidence_level", ["low", "missing_data"])
          .order("updated_at", { ascending: true })
          .limit(15);
        const list = lowSnaps ?? [];
        if (list.length === 0) {
          return { content: "✅ כל הסנאפשוטים הקיימים מכילים רמת ביטחון בינונית או גבוהה.", sourceRefs: [] };
        }
        const lines: string[] = [`⚠️ **${list.length} הזמנות עם ביטחון נמוך / נתונים חסרים:**\n`];
        for (const s of list.slice(0, 10)) {
          const tags = (s.missing_data as string[] | null) ?? [];
          const wo = (Array.isArray(s.work_orders) ? (s.work_orders as Array<{ order_number: string | null; customer: string | null }>)[0] ?? null : null);
          const label = wo?.order_number || (s.order_id as string).slice(0, 8);
          const customer = wo?.customer ? ` — ${wo.customer}` : "";
          lines.push(`· הזמנה ${label}${customer} | ${s.confidence_level as string}${tags.length > 0 ? ` | ${tags[0]}` : ""}`);
        }
        lines.push(`\nלתיקון: CFO ליי → השלם נתונים חסרים → לחץ "חשב"`);
        return { content: lines.join("\n"), sourceRefs: [] };
      }

      // ── Negative margin snapshots ──
      if (wantsNegative) {
        const { data: negSnaps } = await db
          .from("profitability_snapshots")
          .select("order_id,revenue,gross_profit,gross_margin_percent,updated_at,work_orders(order_number,customer)")
          .is("work_diary_id", null)
          .lt("gross_profit", 0)
          .order("gross_profit", { ascending: true })
          .limit(15);
        const list = negSnaps ?? [];
        if (list.length === 0) {
          return { content: "✅ אין הזמנות עם הפסד מחושב כרגע.", sourceRefs: [] };
        }
        const lines: string[] = [`🔴 **${list.length} הזמנות הפסדיות:**\n`];
        for (const s of list.slice(0, 10)) {
          const profit = Math.round(s.gross_profit as number);
          const margin = (s.gross_margin_percent as number).toFixed(1);
          const wo = (Array.isArray(s.work_orders) ? (s.work_orders as Array<{ order_number: string | null; customer: string | null }>)[0] ?? null : null);
          const label = wo?.order_number || (s.order_id as string).slice(0, 8);
          const customer = wo?.customer ? ` (${wo.customer})` : "";
          lines.push(`· הזמנה ${label}${customer} — הפסד ₪${Math.abs(profit).toLocaleString()} | מרווח ${margin}%`);
        }
        lines.push(`\nבדוק תמחור ועלויות ב-CFO ליי.`);
        return { content: lines.join("\n"), sourceRefs: [] };
      }

      // ── Stale snapshots ──
      if (wantsStale) {
        const { data: staleSnaps } = await db
          .from("profitability_snapshots")
          .select("order_id,confidence_level,updated_at,work_orders(order_number,customer)")
          .is("work_diary_id", null)
          .order("updated_at", { ascending: true })
          .limit(10);
        const list = staleSnaps ?? [];
        if (list.length === 0) {
          return { content: "אין חישובי רווחיות שמורים עדיין.", sourceRefs: [] };
        }
        const lines: string[] = [`🕐 **חישובים ישנים ביותר:**\n`];
        for (const s of list.slice(0, 8)) {
          const updatedAt = new Date(s.updated_at as string).toLocaleDateString("he-IL");
          const wo = (Array.isArray(s.work_orders) ? (s.work_orders as Array<{ order_number: string | null; customer: string | null }>)[0] ?? null : null);
          const label = wo?.order_number || (s.order_id as string).slice(0, 8);
          const customer = wo?.customer ? ` — ${wo.customer}` : "";
          lines.push(`· הזמנה ${label}${customer} | עודכן ${updatedAt} | ביטחון: ${s.confidence_level as string}`);
        }
        lines.push(`\nלרענון: CFO ליי → "חשב מחדש הכל"`);
        return { content: lines.join("\n"), sourceRefs: [] };
      }

      // ── Below target threshold ──
      if (wantsBelowTarget) {
        const { data: ratesRow } = await db.from("cost_rates").select("data").eq("id", 1).maybeSingle();
        const ratesData = (ratesRow?.data ?? {}) as Record<string, unknown>;
        const warningThreshold = typeof ratesData.warningMarginPercentage === "number" ? ratesData.warningMarginPercentage : 12;
        const targetMargin = typeof ratesData.targetMarginPercentage === "number" ? ratesData.targetMarginPercentage : 28;
        const { data: belowSnaps } = await db
          .from("profitability_snapshots")
          .select("order_id,gross_profit,gross_margin_percent,work_orders(order_number,customer)")
          .is("work_diary_id", null)
          .gte("gross_profit", 0)
          .lt("gross_margin_percent", warningThreshold)
          .order("gross_margin_percent", { ascending: true })
          .limit(15);
        const list = belowSnaps ?? [];
        if (list.length === 0) {
          return { content: `✅ אין הזמנות עם מרווח מתחת לסף האזהרה (${warningThreshold}%).`, sourceRefs: [] };
        }
        const lines: string[] = [`🟠 **${list.length} הזמנות מתחת לסף האזהרה (${warningThreshold}%):**\n`];
        for (const s of list.slice(0, 10)) {
          const margin = (s.gross_margin_percent as number).toFixed(1);
          const wo = (Array.isArray(s.work_orders) ? (s.work_orders as Array<{ order_number: string | null; customer: string | null }>)[0] ?? null : null);
          const label = wo?.order_number || (s.order_id as string).slice(0, 8);
          const customer = wo?.customer ? ` (${wo.customer})` : "";
          lines.push(`· הזמנה ${label}${customer} — מרווח ${margin}%`);
        }
        lines.push(`\nיעד: ${targetMargin}% | לשיפור: בדוק תמחור ועלויות ב-CFO ליי`);
        return { content: lines.join("\n"), sourceRefs: [] };
      }

      // ── Near target (between warning and target) ──
      if (wantsNearTarget) {
        const { data: ratesRow } = await db.from("cost_rates").select("data").eq("id", 1).maybeSingle();
        const ratesData = (ratesRow?.data ?? {}) as Record<string, unknown>;
        const warningThreshold = typeof ratesData.warningMarginPercentage === "number" ? ratesData.warningMarginPercentage : 12;
        const targetMargin = typeof ratesData.targetMarginPercentage === "number" ? ratesData.targetMarginPercentage : 28;
        const { data: nearSnaps } = await db
          .from("profitability_snapshots")
          .select("order_id,gross_profit,gross_margin_percent,work_orders(order_number,customer)")
          .is("work_diary_id", null)
          .gte("gross_profit", 0)
          .gte("gross_margin_percent", warningThreshold)
          .lt("gross_margin_percent", targetMargin)
          .order("gross_margin_percent", { ascending: false })
          .limit(15);
        const list = nearSnaps ?? [];
        if (list.length === 0) {
          return { content: `✅ אין הזמנות בטווח "קרוב ליעד" (${warningThreshold}%–${targetMargin}%) כרגע.`, sourceRefs: [] };
        }
        const lines: string[] = [`🟡 **${list.length} הזמנות קרובות ליעד (${warningThreshold}%–${targetMargin}%):**\n`];
        for (const s of list.slice(0, 10)) {
          const margin = (s.gross_margin_percent as number).toFixed(1);
          const gap = ((s.gross_margin_percent as number) - targetMargin).toFixed(1);
          const wo = (Array.isArray(s.work_orders) ? (s.work_orders as Array<{ order_number: string | null; customer: string | null }>)[0] ?? null : null);
          const label = wo?.order_number || (s.order_id as string).slice(0, 8);
          const customer = wo?.customer ? ` (${wo.customer})` : "";
          lines.push(`· הזמנה ${label}${customer} — מרווח ${margin}% | פער ${gap}% מהיעד`);
        }
        lines.push(`\nיעד: ${targetMargin}%`);
        return { content: lines.join("\n"), sourceRefs: [] };
      }

      // ── Target info ──
      if (wantsTargetInfo) {
        const { data: ratesRow } = await db.from("cost_rates").select("data").eq("id", 1).maybeSingle();
        const ratesData = (ratesRow?.data ?? {}) as Record<string, unknown>;
        const target = typeof ratesData.targetMarginPercentage === "number" ? ratesData.targetMarginPercentage : 28;
        const warning = typeof ratesData.warningMarginPercentage === "number" ? ratesData.warningMarginPercentage : 12;
        const loss = typeof ratesData.lossThresholdPercentage === "number" ? ratesData.lossThresholdPercentage : 0;
        return {
          content: `🎯 **יעדי רווחיות מוגדרים:**\n\n· יעד מרווח: **${target}%** ✅\n· סף אזהרה: **${warning}%** 🟠\n· סף הפסד: **${loss}%** 🔴\n\nלשינוי: עמוד "הגדרות עלות" (/cost-settings).`,
          sourceRefs: [],
        };
      }

      // ── Customer drill-down (specific customer's orders) ──
      if (wantsCustomerDrilldown) {
        const nameMatch = message.match(/(?:של לקוח|ללקוח|לקוח)\s+(.+?)(?:\s*[?!.,]|$)/);
        const requestedName = nameMatch?.[1]?.trim() || null;

        const { data: allSnaps } = await db
          .from("profitability_snapshots")
          .select("order_id,revenue,total_cost,gross_profit,gross_margin_percent,confidence_level,missing_data,work_orders(order_number,customer,status)")
          .is("work_diary_id", null)
          .not("order_id", "is", null);

        type DrillRow = { orderNum: string; revenue: number; totalCost: number; grossProfit: number; margin: number; confidence: string; missing: string[] };
        const custMap = new Map<string, DrillRow[]>();
        for (const s of (allSnaps ?? [])) {
          const woArr = s.work_orders as Array<{ order_number: string | null; customer: string | null; status: string | null }> | null;
          const orderStatus = (Array.isArray(woArr) ? woArr[0]?.status : null);
          if (orderStatus === "cancelled") continue;
          const name = (Array.isArray(woArr) ? woArr[0]?.customer : null)?.trim() || "לא ידוע";
          const orderNum = (Array.isArray(woArr) ? woArr[0]?.order_number : null) || (s.order_id as string).slice(0, 8);
          if (!custMap.has(name)) custMap.set(name, []);
          custMap.get(name)!.push({
            orderNum,
            revenue: s.revenue as number,
            totalCost: s.total_cost as number,
            grossProfit: s.gross_profit as number,
            margin: s.gross_margin_percent as number,
            confidence: s.confidence_level as string,
            missing: (s.missing_data as string[] | null) ?? [],
          });
        }

        let matchedName: string | null = null;
        if (requestedName) {
          for (const name of custMap.keys()) {
            if (name.toLowerCase().includes(requestedName.toLowerCase()) || requestedName.toLowerCase().includes(name.toLowerCase())) {
              matchedName = name;
              break;
            }
          }
        }

        if (!matchedName) {
          const allCusts = Array.from(custMap.entries())
            .map(([name, orders]) => ({ name, count: orders.length, profit: orders.reduce((s, o) => s + o.grossProfit, 0) }))
            .sort((a, b) => b.profit - a.profit);
          if (allCusts.length === 0) {
            return { content: "אין נתוני רווחיות מחושבים עדיין. הרץ חישוב בלשונית CFO ליי.", sourceRefs: [] };
          }
          const lines = requestedName
            ? [`לא נמצא לקוח "${requestedName}". לקוחות עם נתוני רווחיות:\n`]
            : [`📊 **לקוחות עם פירוט עבודות:**\n`];
          for (const c of allCusts.slice(0, 10)) {
            const icon = c.profit >= 0 ? "🟢" : "🔴";
            lines.push(`${icon} **${c.name}** — ${c.count} עבודות | רווח ₪${Math.round(c.profit).toLocaleString()}`);
          }
          lines.push(`\nנסה: "תראה לי פירוט עבודות של לקוח [שם הלקוח]"`);
          return { content: lines.join("\n"), sourceRefs: [] };
        }

        const MISSING_HE: Record<string, string> = {
          no_revenue: "הזן הכנסה", no_linked_diaries: "קשר יומן", no_approved_diary: "אשר יומן",
          missing_cost_price: "השלם מחיר עלות", no_crew_data: "בדוק צוות",
          no_material_cost: "עדכן חומרים", no_vehicle_data: "בדוק רכב",
        };
        const orders = (custMap.get(matchedName) ?? []).sort((a, b) => a.grossProfit - b.grossProfit);
        const lines: string[] = [`📋 **פירוט עבודות — ${matchedName}** (${orders.length} עבודות)\n`];
        for (const o of orders) {
          const profit = Math.round(o.grossProfit);
          const icon = o.grossProfit >= 0 ? (o.margin >= 28 ? "🟢" : "🟡") : "🔴";
          const confBadge = o.confidence !== "high" ? ` | ⚠ ${o.confidence}` : "";
          const action = o.missing.length > 0 ? ` | → ${MISSING_HE[o.missing[0]] ?? o.missing[0]}` : "";
          lines.push(`${icon} **${o.orderNum}** — הכנסה ₪${Math.round(o.revenue).toLocaleString()} | רווח ₪${Math.abs(profit).toLocaleString()}${profit < 0 ? " 🔴" : ""} | ${o.margin.toFixed(1)}%${confBadge}${action}`);
        }
        const totalP = orders.reduce((s, o) => s + o.grossProfit, 0);
        const avgM = orders.length > 0 ? orders.reduce((s, o) => s + o.margin, 0) / orders.length : 0;
        lines.push(`\n**סיכום ${matchedName}:** רווח כולל ₪${Math.round(totalP).toLocaleString()} | מרווח ממוצע ${avgM.toFixed(1)}%`);
        return { content: lines.join("\n"), sourceRefs: [] };
      }

      // ── Customer aggregation helper (used by customer sub-routes) ──
      async function buildCustomerStats() {
        const { data: snaps } = await db
          .from("profitability_snapshots")
          .select("order_id,revenue,total_cost,gross_profit,gross_margin_percent,confidence_level,work_orders(customer,status)")
          .is("work_diary_id", null)
          .not("order_id", "is", null);
        type CAgg = { customer: string; orderCount: number; revenue: number; totalCost: number; grossProfit: number; marginSum: number; negativeCount: number; lowConfCount: number };
        const map = new Map<string, CAgg>();
        for (const s of (snaps ?? [])) {
          const woArr = s.work_orders as Array<{ customer: string | null; status: string | null }> | null;
          const orderStatus = (Array.isArray(woArr) ? woArr[0]?.status : null);
          if (orderStatus === "cancelled") continue;
          const name = (Array.isArray(woArr) ? woArr[0]?.customer : null)?.trim() || "לא ידוע";
          const ex = map.get(name) ?? { customer: name, orderCount: 0, revenue: 0, totalCost: 0, grossProfit: 0, marginSum: 0, negativeCount: 0, lowConfCount: 0 };
          ex.orderCount++;
          ex.revenue += s.revenue as number;
          ex.totalCost += s.total_cost as number;
          ex.grossProfit += s.gross_profit as number;
          ex.marginSum += s.gross_margin_percent as number;
          if ((s.gross_profit as number) < 0) ex.negativeCount++;
          if (s.confidence_level === "low" || s.confidence_level === "missing_data") ex.lowConfCount++;
          map.set(name, ex);
        }
        return Array.from(map.values()).map(c => ({ ...c, avgMargin: c.orderCount > 0 ? c.marginSum / c.orderCount : 0 }));
      }

      // ── Profitable customers ──
      if (wantsCustomerProfit) {
        const stats = (await buildCustomerStats()).sort((a, b) => b.grossProfit - a.grossProfit);
        if (stats.length === 0) {
          return { content: "אין נתוני רווחיות מחושבים עדיין — הרץ חישוב בלשונית CFO ליי.", sourceRefs: [] };
        }
        const lines: string[] = [`📊 **רווחיות לפי לקוח** (${stats.length} לקוחות):\n`];
        for (const c of stats.slice(0, 10)) {
          const icon = c.grossProfit >= 0 ? "🟢" : "🔴";
          lines.push(`${icon} **${c.customer}** — ${c.orderCount} עבודות | רווח ₪${Math.round(c.grossProfit).toLocaleString()} | מרווח ממוצע ${c.avgMargin.toFixed(1)}%`);
        }
        return { content: lines.join("\n"), sourceRefs: [] };
      }

      // ── Unprofitable / loss customers ──
      if (wantsUnprofitableCustomers) {
        const stats = (await buildCustomerStats())
          .filter(c => c.negativeCount > 0 || c.grossProfit < 0)
          .sort((a, b) => a.grossProfit - b.grossProfit);
        if (stats.length === 0) {
          return { content: "✅ אין לקוחות עם עבודות הפסדיות מחושבות כרגע.", sourceRefs: [] };
        }
        const lines: string[] = [`🔴 **לקוחות עם עבודות הפסדיות (${stats.length} לקוחות):**\n`];
        for (const c of stats.slice(0, 10)) {
          lines.push(`· **${c.customer}** — ${c.negativeCount} הפסדיות מתוך ${c.orderCount} | רווח כולל ₪${Math.round(c.grossProfit).toLocaleString()} | מרווח ממוצע ${c.avgMargin.toFixed(1)}%`);
        }
        lines.push(`\nבדוק תמחור לפי לקוח בלשונית CFO ליי.`);
        return { content: lines.join("\n"), sourceRefs: [] };
      }

      // ── Customers with missing data ──
      if (wantsCustomerMissingData) {
        const stats = (await buildCustomerStats())
          .filter(c => c.lowConfCount > 0)
          .sort((a, b) => b.lowConfCount - a.lowConfCount);
        if (stats.length === 0) {
          return { content: "✅ כל הלקוחות בעלי נתוני רווחיות עם ביטחון גבוה או בינוני.", sourceRefs: [] };
        }
        const lines: string[] = [`⚠️ **לקוחות עם נתוני רווחיות חסרים (${stats.length} לקוחות):**\n`];
        for (const c of stats.slice(0, 10)) {
          lines.push(`· **${c.customer}** — ${c.lowConfCount} עבודות חסרות נתונים מתוך ${c.orderCount}`);
        }
        lines.push(`\nלתיקון: CFO ליי → השלם נתוני הכנסה ויומני עבודה.`);
        return { content: lines.join("\n"), sourceRefs: [] };
      }

      // ── Default: summary of snapshots ──
      const { data: snapshots } = await db
        .from("profitability_snapshots")
        .select("order_id,revenue,total_cost,gross_profit,gross_margin_percent,confidence_level,missing_data,updated_at")
        .is("work_diary_id", null)
        .order("updated_at", { ascending: false })
        .limit(20);

      if (!snapshots || snapshots.length === 0) {
        return {
          content: "📊 **רווחיות הזמנות**\n\nאין תמונות מצב של רווחיות שנוצרו עדיין.\n\nכדי לחשב רווחיות: לשונית CFO ליי בדף הרווחיות → \"חשב\" ליד הזמנה.",
          sourceRefs: [],
        };
      }

      const profitable = snapshots.filter(s => (s.gross_profit as number) > 0);
      const losing = snapshots.filter(s => (s.gross_profit as number) < 0);
      const avgMargin = snapshots.reduce((sum, s) => sum + (s.gross_margin_percent as number), 0) / snapshots.length;

      const lines: string[] = [
        `📊 **רווחיות הזמנות** — ${snapshots.length} הזמנות עם נתונים\n`,
        `✅ רווחיות: **${profitable.length}** | 🔴 הפסד: **${losing.length}** | ממוצע: **${avgMargin.toFixed(1)}%**\n`,
      ];

      for (const s of snapshots.slice(0, 8)) {
        const icon = (s.gross_profit as number) >= 0 ? "🟢" : "🔴";
        const conf = s.confidence_level === "high" ? "" : ` (ביטחון: ${s.confidence_level as string})`;
        lines.push(`${icon} הזמנה ${(s.order_id as string).slice(0, 8)} — הכנסה ₪${Math.round(s.revenue as number).toLocaleString()} | רווח ₪${Math.round(s.gross_profit as number).toLocaleString()} | ${(s.gross_margin_percent as number).toFixed(1)}%${conf}`);
      }

      return { content: lines.join("\n"), sourceRefs: [] };
    }

    case "needs_attention": {
      const [naExcRes, naTaskRes, naApprRes, naDiaryRes, naOrderRes] = await Promise.all([
        excBase().in("severity", ["critical", "error"]).limit(10),
        taskBase().in("priority", ["critical", "high"]).limit(10),
        (agentFilter
          ? db.from("agent_approvals").select("id,agent_id,title,risk_level").eq("agent_id", agentFilter)
          : db.from("agent_approvals").select("id,agent_id,title,risk_level")
        ).eq("status", "pending").limit(10),
        db.from("work_diaries").select("id,customer_name").not("approval_status", "in", '("approved","rejected")').limit(5),
        db.from("work_orders").select("id,order_number,customer").eq("status", "completed").in("accounting_status", ["pending", "verified"]).limit(5),
      ]);

      const naExcs   = naExcRes.data ?? [];
      const naTasks  = naTaskRes.data ?? [];
      const naApprs  = naApprRes.data ?? [];
      const naDiary  = naDiaryRes.data ?? [];
      const naOrders = naOrderRes.data ?? [];

      if (naExcs.length === 0 && naTasks.length === 0 && naApprs.length === 0) {
        return { content: "✅ אין פריטים קריטיים הדורשים טיפול מיידי כרגע.", sourceRefs: [] };
      }

      const naLines: string[] = [`⚡ **מה דורש טיפול כרגע — ${new Date().toLocaleDateString("he-IL")}**\n`];
      if (naExcs.length > 0) {
        naLines.push(`🔴 **${naExcs.length} חריגות קריטיות/שגיאות:**`);
        naExcs.slice(0, 6).forEach(e => naLines.push(`  ${SEV_ICON[e.severity as string] ?? "🔴"} ${e.title as string}`));
      }
      if (naTasks.length > 0) {
        naLines.push(`\n⚡ **${naTasks.length} משימות בעדיפות גבוהה:**`);
        naTasks.slice(0, 5).forEach(t => naLines.push(`  • ${t.title as string} — ${PRI_HE[t.priority as string] ?? t.priority}`));
      }
      if (naApprs.length > 0) {
        naLines.push(`\n📋 **${naApprs.length} אישורים ממתינים:**`);
        naApprs.slice(0, 4).forEach(a => naLines.push(`  • ${a.title as string}`));
      }
      if (naDiary.length > 0)  naLines.push(`\n📝 ${naDiary.length} יומנים ממתינים לאישור`);
      if (naOrders.length > 0) naLines.push(`💰 ${naOrders.length} הזמנות מושלמות ממתינות לחיוב`);

      return {
        content: naLines.join("\n"),
        sourceRefs: naExcs.slice(0, 3).map(e => ({ table: "agent_exceptions", id: e.id as string, label: e.title as string })),
      };
    }

    case "department_status": {
      const DEPT_MAP: { pattern: RegExp; agentId: string; labelHe: string }[] = [
        { pattern: /גרפיקה|ייצור גרפי/,     agentId: "graphics-production-agent", labelHe: "גרפיקה וייצור" },
        { pattern: /מסגרייה/,                agentId: "fabrication-agent",          labelHe: "מסגרייה" },
        { pattern: /תיאומים|קואורדינציה|QA/, agentId: "coordination-qa-agent",     labelHe: "QA ותיאומים" },
        { pattern: /ביצוע שטח|שטח/,          agentId: "field-ops-agent",            labelHe: "ביצוע שטח" },
        { pattern: /כספים|גבייה/,             agentId: "billing-collections-agent",  labelHe: "כספים וגבייה" },
        { pattern: /הזמנות|תפעול/,            agentId: "orders-agent",              labelHe: "הזמנות ותפעול" },
      ];
      const PATH_TO_DEPT: Record<string, { agentId: string; labelHe: string }> = {
        "/graphics":    { agentId: "graphics-production-agent", labelHe: "גרפיקה וייצור" },
        "/fabrication": { agentId: "fabrication-agent",         labelHe: "מסגרייה" },
      };

      const lowerDept = message.toLowerCase();
      let deptAgentId: string | null = null;
      let deptLabel = "המחלקה";
      const deptMatch = DEPT_MAP.find(d => d.pattern.test(lowerDept));
      if (deptMatch) {
        deptAgentId = deptMatch.agentId;
        deptLabel   = deptMatch.labelHe;
      } else if (pageContext) {
        const fromPath = PATH_TO_DEPT[pageContext.pathname];
        if (fromPath) { deptAgentId = fromPath.agentId; deptLabel = fromPath.labelHe; }
      }

      if (!deptAgentId) {
        return {
          content: "לא זיהיתי איזה מחלקה אתה שואל עליה.\n\nניתן לשאול על: **גרפיקה**, **מסגרייה**, **QA ותיאומים**, **ביצוע שטח**, **כספים וגבייה**, **הזמנות ותפעול**.",
          sourceRefs: [],
        };
      }

      const [dExcRes, dTaskRes, dApprRes] = await Promise.all([
        db.from("agent_exceptions").select("id,severity,title").eq("agent_id", deptAgentId).in("status", ["open","acknowledged"]).order("severity", { ascending: false }).limit(10),
        db.from("agent_tasks").select("id,title,priority").eq("agent_id", deptAgentId).in("status", ["open","in_progress"]).order("priority", { ascending: false }).limit(8),
        db.from("agent_approvals").select("id,title").eq("agent_id", deptAgentId).eq("status", "pending").limit(5),
      ]);
      const dExcs  = dExcRes.data ?? [];
      const dTasks = dTaskRes.data ?? [];
      const dApprs = dApprRes.data ?? [];

      if (dExcs.length === 0 && dTasks.length === 0 && dApprs.length === 0) {
        return { content: `✅ **${deptLabel}** — המחלקה פועלת תקין, אין חריגות פתוחות.`, sourceRefs: [] };
      }

      const dLines: string[] = [`🏢 **מצב ${deptLabel} — ${new Date().toLocaleDateString("he-IL")}**\n`];
      const dCrit = dExcs.filter(e => e.severity === "critical" || e.severity === "error");
      const dWarn = dExcs.filter(e => e.severity === "warn" || e.severity === "info");
      if (dCrit.length > 0) {
        dLines.push(`🔴 **חריגות קריטיות (${dCrit.length}):**`);
        dCrit.slice(0, 5).forEach(e => dLines.push(`  ${SEV_ICON[e.severity as string] ?? "🔴"} ${e.title as string}`));
      }
      if (dWarn.length > 0) {
        dLines.push(`🟡 **אזהרות (${dWarn.length}):**`);
        dWarn.slice(0, 4).forEach(e => dLines.push(`  • ${e.title as string}`));
      }
      if (dExcs.length === 0) dLines.push("✅ אין חריגות פתוחות");
      if (dTasks.length > 0) {
        dLines.push(`\n⚡ **${dTasks.length} משימות פתוחות:**`);
        dTasks.slice(0, 5).forEach(t => dLines.push(`  • ${t.title as string} — ${PRI_HE[t.priority as string] ?? t.priority}`));
      }
      if (dApprs.length > 0) {
        dLines.push(`\n📋 **${dApprs.length} אישורים ממתינים:**`);
        dApprs.slice(0, 3).forEach(a => dLines.push(`  • ${a.title as string}`));
      }
      return {
        content: dLines.join("\n"),
        sourceRefs: dExcs.slice(0, 3).map(e => ({ table: "agent_exceptions", id: e.id as string, label: e.title as string })),
      };
    }

    case "qa_pilot": {
      const QA_AGENT = "coordination-qa-agent";
      const [qExcRes, qTaskRes, qApprRes] = await Promise.all([
        db.from("agent_exceptions").select("id,severity,title").eq("agent_id", QA_AGENT).in("status", ["open","acknowledged"]).order("severity", { ascending: false }).limit(15),
        db.from("agent_tasks").select("id,title,priority").eq("agent_id", QA_AGENT).in("status", ["open","in_progress"]).limit(10),
        db.from("agent_approvals").select("id,title").eq("agent_id", QA_AGENT).eq("status", "pending").limit(10),
      ]);
      const qExcs  = qExcRes.data ?? [];
      const qTasks = qTaskRes.data ?? [];
      const qApprs = qApprRes.data ?? [];
      const qCrit  = qExcs.filter(e => e.severity === "critical" || e.severity === "error");

      const pilotReady   = qCrit.length === 0 && qApprs.length === 0 && qTasks.length < 3;
      const pilotWarning = !pilotReady && qCrit.length === 0;

      const qLines: string[] = [`🔍 **סטטוס מוכנות פיילוט — ${new Date().toLocaleDateString("he-IL")}**\n`];
      qLines.push(`${qCrit.length === 0 ? "✅" : "❌"} חריגות QA קריטיות: **${qCrit.length}** (מתוך ${qExcs.length} בסה"כ)`);
      qLines.push(`${qTasks.length === 0 ? "✅" : qTasks.length < 3 ? "⚠️" : "❌"} משימות פתוחות: **${qTasks.length}**`);
      qLines.push(`${qApprs.length === 0 ? "✅" : "❌"} אישורים ממתינים: **${qApprs.length}**`);

      if (qExcs.length > 0) {
        qLines.push(`\n**חריגות QA פתוחות:**`);
        qExcs.slice(0, 6).forEach(e => qLines.push(`  ${SEV_ICON[e.severity as string] ?? "🟡"} ${e.title as string}`));
      }
      if (qTasks.length > 0) {
        qLines.push(`\n**משימות פתוחות:**`);
        qTasks.slice(0, 4).forEach(t => qLines.push(`  • ${t.title as string}`));
      }
      if (qApprs.length > 0) {
        qLines.push(`\n**אישורים ממתינים:**`);
        qApprs.slice(0, 3).forEach(a => qLines.push(`  • ${a.title as string}`));
      }
      qLines.push("");
      if (pilotReady) {
        qLines.push("**המלצה: ✅ ניתן להתחיל פיילוט** — אין חריגות קריטיות, אין אישורים ממתינים.");
      } else if (pilotWarning) {
        qLines.push("**המלצה: ⚠️ יש נושאים לסגירה לפני פיילוט** — אין חריגות קריטיות, אך יש משימות/אישורים פתוחים.");
      } else {
        qLines.push("**המלצה: ❌ לא מומלץ להתחיל פיילוט** — סגור את החריגות הקריטיות תחילה.");
      }
      return {
        content: qLines.join("\n"),
        sourceRefs: qExcs.slice(0, 3).map(e => ({ table: "agent_exceptions", id: e.id as string, label: e.title as string })),
      };
    }

    case "agent_status": {
      if (agentFilter) {
        return {
          content: "מידע מפורט על סוכנים זמין דרך **מרכז הפיקוד**. פתח את הצ׳אט של מרכז הפיקוד (כפתור 🤖) לצפייה ברשימת הסוכנים.",
          sourceRefs: [],
        };
      }
      const [agRes, agExcRes, agTaskRes] = await Promise.all([
        db.from("agents").select("id,name,status,last_run_at").limit(15),
        db.from("agent_exceptions").select("agent_id,severity").in("status", ["open","acknowledged"]).in("severity", ["critical","error"]),
        db.from("agent_tasks").select("agent_id").in("status", ["open","in_progress"]),
      ]);
      const agAgents = agRes.data ?? [];
      const agExcs   = agExcRes.data ?? [];
      const agTasks  = agTaskRes.data ?? [];
      const excByAg  = new Map<string, number>();
      for (const e of agExcs)  excByAg.set(e.agent_id as string, (excByAg.get(e.agent_id as string) ?? 0) + 1);
      const taskByAg = new Map<string, number>();
      for (const t of agTasks) taskByAg.set(t.agent_id as string, (taskByAg.get(t.agent_id as string) ?? 0) + 1);

      const agLines: string[] = [`🤖 **מצב סוכנים — ${new Date().toLocaleDateString("he-IL")}**\n`, `סה"כ: **${agAgents.length}** סוכנים\n`];
      for (const a of agAgents) {
        const critCnt = excByAg.get(a.id as string) ?? 0;
        const taskCnt = taskByAg.get(a.id as string) ?? 0;
        const lastRun = a.last_run_at ? fmtDate(a.last_run_at as string) : "טרם הופעל";
        const icon    = critCnt > 0 ? "🔴" : a.status === "active" ? "🟢" : "⚪";
        agLines.push(`${icon} **${a.name as string}** | סריקה: ${lastRun}${critCnt > 0 ? ` | ⚠ ${critCnt} קריטי` : ""}${taskCnt > 0 ? ` | ${taskCnt} משימות` : ""}`);
      }
      return { content: agLines.join("\n"), sourceRefs: [] };
    }

    case "navigation": {
      const NAV_MAP2: { pattern: RegExp; labelHe: string; path: string }[] = [
        { pattern: /הזמנות/,            labelHe: "הזמנות",        path: "/orders" },
        { pattern: /מחסן|מלאי/,         labelHe: "מחסן",          path: "/warehouse" },
        { pattern: /גרפיקה/,            labelHe: "גרפיקה",        path: "/graphics" },
        { pattern: /מסגרייה/,           labelHe: "מסגרייה",       path: "/fabrication" },
        { pattern: /שטח|יומנים/,        labelHe: "יומני שטח",     path: "/work-diary" },
        { pattern: /כספים|הנהח/,        labelHe: "הנה\"ח",        path: "/accounting" },
        { pattern: /לקוחות/,            labelHe: "לקוחות",        path: "/customers" },
        { pattern: /קטלוג|תמחור|בטיחות/, labelHe: "קטלוג ותמחור", path: "/catalog" },
        { pattern: /סוכנים|פיקוד/,      labelHe: "מרכז הפיקוד",  path: "/agents" },
        { pattern: /רווחיות/,           labelHe: "רווחיות",       path: "/profitability" },
        { pattern: /לוח זמנים/,         labelHe: "לוח זמנים",     path: "/schedule" },
      ];
      const lowerNav = message.toLowerCase();
      const navHit = NAV_MAP2.find(n => n.pattern.test(lowerNav));
      if (!navHit) {
        const allPages = NAV_MAP2.map(n => `• ${n.labelHe} → \`${n.path}\``).join("\n");
        return { content: `🗺 **מפת הניווט:**\n\n${allPages}`, sourceRefs: [] };
      }
      return { content: `🗺 כדי לראות **${navHit.labelHe}**, עבור לנתיב: \`${navHit.path}\``, sourceRefs: [] };
    }

    case "supplier_documents": {
      const [pendingRes, dupRes, postedRes] = await Promise.all([
        db.from("supplier_documents")
          .select("id,document_type,supplier_name_raw,document_number,document_date,total_after_vat,status,suppliers(name)")
          .in("status", ["draft_ready", "needs_review"])
          .order("created_at", { ascending: false })
          .limit(10),
        db.from("supplier_documents")
          .select("id,document_type,supplier_name_raw,document_number,total_after_vat")
          .eq("status", "duplicate_suspected")
          .limit(5),
        db.from("supplier_documents")
          .select("id,total_after_vat")
          .eq("status", "posted")
          .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      ]);

      const pending = pendingRes.data ?? [];
      const dups    = dupRes.data ?? [];
      const posted  = postedRes.data ?? [];
      const totalPostedAmt = (posted as Array<{ total_after_vat: number | null }>)
        .reduce((s, d) => s + (d.total_after_vat ?? 0), 0);

      const sdLines: string[] = [`📄 **מסמכי ספקים — מצב נוכחי**\n`];
      sdLines.push(`ממתינים לבדיקה: **${pending.length}** | חשד לכפילות: **${dups.length}** | נרשמו החודש: **${posted.length}** (₪${totalPostedAmt.toLocaleString("he-IL")})\n`);

      if (pending.length > 0) {
        sdLines.push("**מסמכים ממתינים:**");
        pending.slice(0, 6).forEach(d => {
          const sup = (d as Record<string, unknown>).suppliers;
          const supName = (sup as { name?: string } | null)?.name ?? (d as { supplier_name_raw: string }).supplier_name_raw;
          const total = (d as { total_after_vat: number | null }).total_after_vat;
          sdLines.push(`  • ${supName || "ספק לא מזוהה"} | ${(d as { document_number: string }).document_number || "ללא מספר"} ${total != null ? `· ₪${total.toLocaleString("he-IL")}` : ""}`);
        });
      }
      if (dups.length > 0) {
        sdLines.push("\n⚠️ **מסמכים עם חשד לכפילות — נדרשת בדיקה ידנית:**");
        dups.slice(0, 3).forEach(d => {
          sdLines.push(`  • ${(d as { supplier_name_raw: string }).supplier_name_raw || "—"} | ${(d as { document_number: string }).document_number || "—"}`);
        });
      }

      return {
        content: sdLines.join("\n"),
        sourceRefs: pending.slice(0, 3).map(d => ({ table: "supplier_documents", id: (d as { id: string }).id, label: (d as { document_number: string }).document_number || "מסמך" })),
      };
    }

    case "expenses": {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const [expRes, categoryRes] = await Promise.all([
        db.from("expense_records")
          .select("id,total_amount,supplier_id,document_type,expense_date,suppliers(name)")
          .gte("expense_date", monthStart.substring(0, 10))
          .order("expense_date", { ascending: false })
          .limit(20),
        db.from("expense_records")
          .select("category,total_amount")
          .gte("expense_date", monthStart.substring(0, 10)),
      ]);

      const expenses = expRes.data ?? [];
      const allExp   = categoryRes.data ?? [];

      const totalAmt = (expenses as Array<{ total_amount: number }>)
        .reduce((s, e) => s + (e.total_amount ?? 0), 0);

      const byCategory: Record<string, number> = {};
      for (const e of allExp as Array<{ category: string; total_amount: number }>) {
        if (!e.category) continue;
        byCategory[e.category] = (byCategory[e.category] ?? 0) + (e.total_amount ?? 0);
      }
      const topCats = Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const expLines: string[] = [`💰 **הוצאות — ${new Date().toLocaleDateString("he-IL", { month: "long", year: "numeric" })}**\n`];
      expLines.push(`סה"כ הוצאות החודש: **₪${totalAmt.toLocaleString("he-IL")}** (${expenses.length} מסמכים)\n`);

      if (topCats.length > 0) {
        expLines.push("**הוצאות לפי קטגוריה:**");
        topCats.forEach(([cat, amt]) => expLines.push(`  • ${cat}: ₪${amt.toLocaleString("he-IL")}`));
      }

      if (expenses.length > 0) {
        expLines.push("\n**הוצאות אחרונות:**");
        expenses.slice(0, 5).forEach(e => {
          const sup = (e as Record<string, unknown>).suppliers;
          const supName = (sup as { name?: string } | null)?.name ?? "—";
          expLines.push(`  • ${supName} · ₪${(e as { total_amount: number }).total_amount?.toLocaleString("he-IL")} · ${fmtDate((e as { expense_date: string }).expense_date)}`);
        });
      }

      return {
        content: expLines.join("\n"),
        sourceRefs: expenses.slice(0, 3).map(e => ({ table: "expense_records", id: (e as { id: string }).id, label: (e as Record<string, unknown>).suppliers ? ((e as Record<string, unknown>).suppliers as { name: string }).name : "הוצאה" })),
      };
    }

    case "general": {
      const isCC = !agentFilter;
      const genLines = [
        "לא זיהיתי את נושא השאלה שלך.\n",
        "**אני יכול לענות על:**",
        "• חריגות ושגיאות — \"מה השגיאות הפתוחות?\" / \"מה אלו 49 השגיאות?\"",
        "• משימות ועדיפויות — \"מה הכי דחוף?\"",
        "• אישורים — \"מה ממתין לאישורי?\"",
        "• חיוב — \"מה ממתין לחיוב?\"",
        "• יומני שטח — \"אילו יומנים ממתינים?\"",
        "• מלאי ומחסן — \"מה מצב המחסן?\"",
        "• רווחיות — \"מה הרווחיות?\"",
        "• מוכנות פיילוט — \"האם אפשר להתחיל פיילוט?\"",
        "• מצב מחלקה — \"מה מצב הגרפיקה?\" / \"מה מצב המסגרייה?\"",
        "• מה דורש טיפול — \"מה דורש טיפול כרגע?\"",
      ];
      if (isCC) {
        genLines.push("• מצב סוכנים — \"איזה סוכנים פעילים?\"");
        genLines.push("• ניווט — \"איפה אני רואה הזמנות?\"");
      }
      return { content: genLines.join("\n"), sourceRefs: [] };
    }

    // "summary" + catch-all
    default: {
      // Command-center: show agent health overview
      if (!agentFilter) {
        const [ccAgRes, ccExcRes, ccTaskRes, ccApprRes] = await Promise.all([
          db.from("agents").select("id,name,status").limit(15),
          db.from("agent_exceptions").select("agent_id,severity,status").in("status", ["open","acknowledged"]),
          db.from("agent_tasks").select("agent_id,priority").in("status", ["open","in_progress"]),
          db.from("agent_approvals").select("agent_id").eq("status", "pending"),
        ]);
        const ccAgents = ccAgRes.data ?? [];
        const ccExcs   = ccExcRes.data ?? [];
        const ccTasks  = ccTaskRes.data ?? [];
        const ccApprs  = ccApprRes.data ?? [];
        const ccCrit   = ccExcs.filter(e => e.severity === "critical").length;
        const ccErrors = ccExcs.filter(e => e.severity === "error").length;
        const ccHigh   = ccTasks.filter(t => t.priority === "high" || t.priority === "critical").length;
        const ccLines  = [
          `🖥️ **מצב מרכז הפיקוד — ${new Date().toLocaleDateString("he-IL")}**\n`,
          `🤖 סוכנים: **${ccAgents.length}**`,
          ccCrit > 0 || ccErrors > 0
            ? `🔴 חריגות: **${ccExcs.length} פתוחות** (${ccCrit} קריטיות, ${ccErrors} שגיאות)`
            : `🟢 חריגות: **${ccExcs.length} פתוחות** — ללא קריטיות`,
          `⚡ משימות: **${ccTasks.length} פתוחות** (${ccHigh} גבוהה)`,
          `📋 אישורים ממתינים: **${ccApprs.length}**`,
        ];
        if (ccCrit > 0) {
          ccLines.push(`\n⚠️ שאל "מה השגיאות הקריטיות?" לפרטים.`);
        } else if (ccApprs.length > 0) {
          ccLines.push(`\n💡 ${ccApprs.length} אישורים ממתינים.`);
        } else {
          ccLines.push(`\n✅ המצב תקין.`);
        }
        return { content: ccLines.join("\n"), sourceRefs: [] };
      }

      // Ops-manager: operational summary
      const [excRes, taskRes, approvalRes, diaryRes, orderRes] = await Promise.all([
        db.from("agent_exceptions").select("id,severity,status,agent_id").in("status", ["open","acknowledged"]),
        db.from("agent_tasks").select("id,priority,status").in("status", ["open","in_progress"]),
        db.from("agent_approvals").select("id,risk_level").eq("status", "pending"),
        db.from("work_diaries").select("id,approval_status").not("approval_status", "in", '("approved","rejected")'),
        db.from("work_orders").select("id,accounting_status").eq("status","completed").not("accounting_status","in",'("invoiced","paid","disputed")'),
      ]);

      const excs     = excRes.data ?? [];
      const tasks    = taskRes.data ?? [];
      const approvs  = approvalRes.data ?? [];
      const diaries  = diaryRes.data ?? [];
      const orders   = orderRes.data ?? [];

      const critical     = excs.filter(e => e.severity === "critical").length;
      const errors       = excs.filter(e => e.severity === "error").length;
      const highTasks    = tasks.filter(t => ["high","critical"].includes(t.priority as string)).length;
      const pendingBill  = orders.filter(o => !o.accounting_status || o.accounting_status === "pending" || o.accounting_status === "verified").length;

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
      lines.push(`💰 הזמנות מושלמות ממתינות לחיוב: **${pendingBill}**`);

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
