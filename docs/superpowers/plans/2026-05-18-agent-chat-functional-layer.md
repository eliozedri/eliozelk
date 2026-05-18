# Agent Chat Functional Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the global agent chat answer real operational questions instead of returning a static summary block for every message.

**Architecture:** Fix intent detection in `chat-engine.ts` (Hebrew plural keywords, new intents, honest fallback, channel split, number detection), plumb `pageContext`+`history` from `FloatingChatWindow` → `useAgentChat` → API route → engine. No schema changes, no new routes.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (via `@supabase/supabase-js`), React (`usePathname` from `next/navigation`)

**Spec:** `docs/superpowers/specs/2026-05-18-agent-chat-functional-layer-design.md`

---

## File Map

| File | Change |
|---|---|
| `src/lib/agents/chat-engine.ts` | New types, restructured keywords, new detectIntent, 6 new intent handlers, number detection in exceptions, channel-aware summary |
| `src/app/api/agents/chat/messages/route.ts` | Accept `pageContext` from body; load last 6 messages as history before engine call |
| `src/hooks/useAgentChat.ts` | Export `PageContext`; add optional `pageContext` param to `sendMessage` |
| `src/components/AgentChat/FloatingChatWindow.tsx` | Read `usePathname()`; pass `{ pathname }` to every `sendMessage` call |

---

## Task 1 — chat-engine.ts: Types, Keywords, detectIntent

**Files:** Modify `src/lib/agents/chat-engine.ts`

- [ ] **Step 1.1 — Extend the `ChatIntent` union**

Replace lines 11–23:

```typescript
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
  | "general";
```

- [ ] **Step 1.2 — Add `PageContext` and `HistoryTurn` types** (insert after the existing imports, before the intent classification comment)

```typescript
export interface PageContext {
  pathname: string;
}

export interface HistoryTurn {
  role: "user" | "agent";
  content: string;
}
```

- [ ] **Step 1.3 — Replace `INTENT_KEYWORDS` and `detectIntent`**

Replace the entire `INTENT_KEYWORDS` block and `detectIntent` function (lines 25–47) with:

```typescript
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
  // inventory before summary so "מה מצב המחסן?" hits inventory not summary
  inventory:         ["מלאי", "מחסן", "פריט", "חסר", "מינימום", "רכש", "ספק", "להזמין", "inventory", "מיפוי", "פריטים", "שריון", "שמור", "שמורים", "reserv", "שוחרר", "פער", "צריכה", "נצרך", "נצרכו", "התאמה", "יומן", "בוצע", "ניוצל", "consump", "החזר", "החזרה", "הוחזר", "תעודת", "תעודה", "קליטה", "נקלט", "נקלטה", "delivery", "return_from", "ספירה", "המלצ", "לרכוש", "לקנות", "לדרוג", "דחוף.*רכש", "purchase", "recommend"],
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

  // Follow-up detection: very short or continuation → re-run intent on last user message
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
      "/warehouse": "inventory",
      "/accounting": "billing",
      "/orders":    "orders",
      "/fabrication": "department_status",
      "/graphics":  "department_status",
    };
    const routed = PATHNAME_INTENT[pageContext.pathname];
    if (routed) return routed;
  }

  return "general";
}
```

- [ ] **Step 1.4 — Verify TypeScript compiles**

```bash
cd /Users/eliozedri/Desktop/eliozelk && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors related to the edited region. (Other pre-existing errors are acceptable at this stage.)

- [ ] **Step 1.5 — Commit**

```bash
git add src/lib/agents/chat-engine.ts
git commit -m "feat(chat): extend ChatIntent types and restructure intent keywords"
```

---

## Task 2 — chat-engine.ts: runChatEngine signature + new handlers

**Files:** Modify `src/lib/agents/chat-engine.ts`

- [ ] **Step 2.1 — Update `runChatEngine` signature**

Replace:
```typescript
export async function runChatEngine(
  db: SupabaseClient,
  ctx: { agentId: string | null; userId: string },
  message: string
): Promise<ChatEngineResult> {
  const intent = detectIntent(message);
  const agentFilter = ctx.agentId;
```

With:
```typescript
export async function runChatEngine(
  db: SupabaseClient,
  ctx: { agentId: string | null; userId: string },
  message: string,
  options?: { pageContext?: PageContext | null; history?: HistoryTurn[] | null },
): Promise<ChatEngineResult> {
  const intent = detectIntent(message, options?.pageContext, options?.history);
  const agentFilter = ctx.agentId;
  const pageContext = options?.pageContext ?? null;
```

- [ ] **Step 2.2 — Update the `exceptions` case to add number detection**

Replace the entire `case "exceptions":` block with:

```typescript
    case "exceptions": {
      const numMatch = message.match(/(\d+)/);
      const mentionedNumber = numMatch ? parseInt(numMatch[1], 10) : null;

      let q = db.from("agent_exceptions")
        .select("id,agent_id,severity,category,title,status")
        .in("status", ["open", "acknowledged"])
        .order("severity", { ascending: false })
        .limit(mentionedNumber !== null ? 200 : 20);
      if (agentFilter) q = q.eq("agent_id", agentFilter);
      const { data } = await q;
      const excs = data ?? [];

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
          // Group by agent for detailed breakdown
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
```

- [ ] **Step 2.3 — Add new intent cases before the default block**

Locate the comment `// "summary" + default + "general"` and insert the following 6 new cases immediately before it:

```typescript
    case "needs_attention": {
      const [excRes, taskRes, approvalRes, diaryRes, orderRes] = await Promise.all([
        excBase().in("severity", ["critical", "error"]).limit(10),
        taskBase().in("priority", ["critical", "high"]).limit(10),
        (agentFilter
          ? db.from("agent_approvals").select("id,agent_id,title,risk_level").eq("agent_id", agentFilter)
          : db.from("agent_approvals").select("id,agent_id,title,risk_level")
        ).eq("status", "pending").limit(10),
        db.from("work_diaries").select("id,customer_name").not("approval_status", "in", '("approved","rejected")').limit(5),
        db.from("work_orders").select("id,order_number,customer").eq("status", "completed").in("accounting_status", ["pending", "verified"]).limit(5),
      ]);

      const excs      = excRes.data ?? [];
      const tasks     = taskRes.data ?? [];
      const approvals = approvalRes.data ?? [];
      const diaries   = diaryRes.data ?? [];
      const orders    = orderRes.data ?? [];

      if (excs.length === 0 && tasks.length === 0 && approvals.length === 0) {
        return { content: "✅ אין פריטים קריטיים הדורשים טיפול מיידי כרגע.", sourceRefs: [] };
      }

      const lines: string[] = [`⚡ **מה דורש טיפול כרגע — ${new Date().toLocaleDateString("he-IL")}**\n`];
      if (excs.length > 0) {
        lines.push(`🔴 **${excs.length} חריגות קריטיות/שגיאות:**`);
        excs.slice(0, 6).forEach(e => lines.push(`  ${SEV_ICON[e.severity as string] ?? "🔴"} ${e.title as string}`));
      }
      if (tasks.length > 0) {
        lines.push(`\n⚡ **${tasks.length} משימות בעדיפות גבוהה:**`);
        tasks.slice(0, 5).forEach(t => lines.push(`  • ${t.title as string} — ${PRI_HE[t.priority as string] ?? t.priority}`));
      }
      if (approvals.length > 0) {
        lines.push(`\n📋 **${approvals.length} אישורים ממתינים:**`);
        approvals.slice(0, 4).forEach(a => lines.push(`  • ${a.title as string}`));
      }
      if (diaries.length > 0) lines.push(`\n📝 ${diaries.length} יומנים ממתינים לאישור`);
      if (orders.length > 0)  lines.push(`💰 ${orders.length} הזמנות מושלמות ממתינות לחיוב`);

      return {
        content: lines.join("\n"),
        sourceRefs: excs.slice(0, 3).map(e => ({ table: "agent_exceptions", id: e.id as string, label: e.title as string })),
      };
    }

    case "department_status": {
      const DEPT: { pattern: RegExp; agentId: string; labelHe: string }[] = [
        { pattern: /גרפיקה|ייצור גרפי/,    agentId: "graphics-production-agent",  labelHe: "גרפיקה וייצור" },
        { pattern: /מסגרייה/,               agentId: "fabrication-agent",           labelHe: "מסגרייה" },
        { pattern: /תיאומים|קואורדינציה|QA/, agentId: "coordination-qa-agent",      labelHe: "QA ותיאומים" },
        { pattern: /ביצוע שטח|שטח/,         agentId: "field-ops-agent",             labelHe: "ביצוע שטח" },
        { pattern: /כספים|גבייה/,            agentId: "billing-collections-agent",   labelHe: "כספים וגבייה" },
        { pattern: /הזמנות|תפעול/,           agentId: "orders-agent",               labelHe: "הזמנות ותפעול" },
      ];
      const PATH_DEPT: Record<string, { agentId: string; labelHe: string }> = {
        "/graphics":   { agentId: "graphics-production-agent", labelHe: "גרפיקה וייצור" },
        "/fabrication": { agentId: "fabrication-agent",         labelHe: "מסגרייה" },
      };

      const lower2 = message.toLowerCase();
      let deptAgentId: string | null = null;
      let deptLabel = "המחלקה";
      const matched = DEPT.find(d => d.pattern.test(lower2));
      if (matched) {
        deptAgentId = matched.agentId;
        deptLabel   = matched.labelHe;
      } else if (pageContext) {
        const fromPath = PATH_DEPT[pageContext.pathname];
        if (fromPath) { deptAgentId = fromPath.agentId; deptLabel = fromPath.labelHe; }
      }

      if (!deptAgentId) {
        return {
          content: "לא זיהיתי איזה מחלקה אתה שואל עליה.\n\nניתן לשאול על: **גרפיקה**, **מסגרייה**, **QA ותיאומים**, **ביצוע שטח**, **כספים וגבייה**, **הזמנות ותפעול**.",
          sourceRefs: [],
        };
      }

      const [excRes2, taskRes2, apprRes2] = await Promise.all([
        db.from("agent_exceptions").select("id,severity,title").eq("agent_id", deptAgentId).in("status", ["open", "acknowledged"]).order("severity", { ascending: false }).limit(10),
        db.from("agent_tasks").select("id,title,priority").eq("agent_id", deptAgentId).in("status", ["open", "in_progress"]).order("priority", { ascending: false }).limit(8),
        db.from("agent_approvals").select("id,title").eq("agent_id", deptAgentId).eq("status", "pending").limit(5),
      ]);
      const dExcs  = excRes2.data ?? [];
      const dTasks = taskRes2.data ?? [];
      const dAppr  = apprRes2.data ?? [];

      if (dExcs.length === 0 && dTasks.length === 0 && dAppr.length === 0) {
        return { content: `✅ **${deptLabel}** — המחלקה פועלת תקין, אין חריגות פתוחות.`, sourceRefs: [] };
      }

      const lines2: string[] = [`🏢 **מצב ${deptLabel} — ${new Date().toLocaleDateString("he-IL")}**\n`];
      const critical2 = dExcs.filter(e => e.severity === "critical" || e.severity === "error");
      const warns2    = dExcs.filter(e => e.severity === "warn" || e.severity === "info");
      if (critical2.length > 0) {
        lines2.push(`🔴 **חריגות קריטיות (${critical2.length}):**`);
        critical2.slice(0, 5).forEach(e => lines2.push(`  ${SEV_ICON[e.severity as string] ?? "🔴"} ${e.title as string}`));
      }
      if (warns2.length > 0) {
        lines2.push(`🟡 **אזהרות (${warns2.length}):**`);
        warns2.slice(0, 4).forEach(e => lines2.push(`  • ${e.title as string}`));
      }
      if (dExcs.length === 0) lines2.push("✅ אין חריגות פתוחות");
      if (dTasks.length > 0) {
        lines2.push(`\n⚡ **${dTasks.length} משימות פתוחות:**`);
        dTasks.slice(0, 5).forEach(t => lines2.push(`  • ${t.title as string} — ${PRI_HE[t.priority as string] ?? t.priority}`));
      }
      if (dAppr.length > 0) {
        lines2.push(`\n📋 **${dAppr.length} אישורים ממתינים:**`);
        dAppr.slice(0, 3).forEach(a => lines2.push(`  • ${a.title as string}`));
      }
      return {
        content: lines2.join("\n"),
        sourceRefs: dExcs.slice(0, 3).map(e => ({ table: "agent_exceptions", id: e.id as string, label: e.title as string })),
      };
    }

    case "qa_pilot": {
      const QA = "coordination-qa-agent";
      const [qExcRes, qTaskRes, qApprRes] = await Promise.all([
        db.from("agent_exceptions").select("id,severity,title").eq("agent_id", QA).in("status", ["open", "acknowledged"]).order("severity", { ascending: false }).limit(15),
        db.from("agent_tasks").select("id,title,priority").eq("agent_id", QA).in("status", ["open", "in_progress"]).limit(10),
        db.from("agent_approvals").select("id,title").eq("agent_id", QA).eq("status", "pending").limit(10),
      ]);
      const qExcs  = qExcRes.data ?? [];
      const qTasks = qTaskRes.data ?? [];
      const qAppr  = qApprRes.data ?? [];
      const critQ  = qExcs.filter(e => e.severity === "critical" || e.severity === "error");

      const pilotReady   = critQ.length === 0 && qAppr.length === 0 && qTasks.length < 3;
      const pilotWarning = !pilotReady && critQ.length === 0;

      const lines3: string[] = [`🔍 **סטטוס מוכנות פיילוט — ${new Date().toLocaleDateString("he-IL")}**\n`];
      lines3.push(`${critQ.length === 0 ? "✅" : "❌"} חריגות QA קריטיות: **${critQ.length}** (מתוך ${qExcs.length} בסה"כ)`);
      lines3.push(`${qTasks.length === 0 ? "✅" : qTasks.length < 3 ? "⚠️" : "❌"} משימות פתוחות: **${qTasks.length}**`);
      lines3.push(`${qAppr.length === 0 ? "✅" : "❌"} אישורים ממתינים: **${qAppr.length}**`);

      if (qExcs.length > 0) {
        lines3.push(`\n**חריגות QA פתוחות:**`);
        qExcs.slice(0, 6).forEach(e => lines3.push(`  ${SEV_ICON[e.severity as string] ?? "🟡"} ${e.title as string}`));
      }
      if (qTasks.length > 0) {
        lines3.push(`\n**משימות פתוחות:**`);
        qTasks.slice(0, 4).forEach(t => lines3.push(`  • ${t.title as string}`));
      }
      if (qAppr.length > 0) {
        lines3.push(`\n**אישורים ממתינים:**`);
        qAppr.slice(0, 3).forEach(a => lines3.push(`  • ${a.title as string}`));
      }
      lines3.push("");
      if (pilotReady) {
        lines3.push("**המלצה: ✅ ניתן להתחיל פיילוט** — אין חריגות קריטיות, אין אישורים ממתינים.");
      } else if (pilotWarning) {
        lines3.push("**המלצה: ⚠️ יש נושאים לסגירה לפני פיילוט** — אין חריגות קריטיות, אך יש משימות/אישורים פתוחים.");
      } else {
        lines3.push("**המלצה: ❌ לא מומלץ להתחיל פיילוט** — סגור את החריגות הקריטיות תחילה.");
      }
      return {
        content: lines3.join("\n"),
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
        db.from("agent_exceptions").select("agent_id,severity").in("status", ["open", "acknowledged"]).in("severity", ["critical", "error"]),
        db.from("agent_tasks").select("agent_id").in("status", ["open", "in_progress"]),
      ]);
      const agents4   = agRes.data ?? [];
      const agExcs4   = agExcRes.data ?? [];
      const agTasks4  = agTaskRes.data ?? [];
      const excByAg   = new Map<string, number>();
      for (const e of agExcs4)  excByAg.set(e.agent_id as string, (excByAg.get(e.agent_id as string) ?? 0) + 1);
      const taskByAg  = new Map<string, number>();
      for (const t of agTasks4) taskByAg.set(t.agent_id as string, (taskByAg.get(t.agent_id as string) ?? 0) + 1);

      const lines4: string[] = [`🤖 **מצב סוכנים — ${new Date().toLocaleDateString("he-IL")}**\n`, `סה"כ: **${agents4.length}** סוכנים\n`];
      for (const a of agents4) {
        const critCnt = excByAg.get(a.id as string) ?? 0;
        const taskCnt = taskByAg.get(a.id as string) ?? 0;
        const lastRun = a.last_run_at ? fmtDate(a.last_run_at as string) : "טרם הופעל";
        const icon    = critCnt > 0 ? "🔴" : a.status === "active" ? "🟢" : "⚪";
        lines4.push(`${icon} **${a.name as string}** | סריקה: ${lastRun}${critCnt > 0 ? ` | ⚠ ${critCnt} קריטי` : ""}${taskCnt > 0 ? ` | ${taskCnt} משימות` : ""}`);
      }
      return { content: lines4.join("\n"), sourceRefs: [] };
    }

    case "navigation": {
      const NAV: { pattern: RegExp; labelHe: string; path: string }[] = [
        { pattern: /הזמנות/,           labelHe: "הזמנות",          path: "/orders" },
        { pattern: /מחסן|מלאי/,        labelHe: "מחסן",            path: "/warehouse" },
        { pattern: /גרפיקה/,           labelHe: "גרפיקה",          path: "/graphics" },
        { pattern: /מסגרייה/,          labelHe: "מסגרייה",         path: "/fabrication" },
        { pattern: /שטח|יומני/,        labelHe: "יומני שטח",       path: "/work-diary" },
        { pattern: /כספים|הנה"ח|הנהח/, labelHe: "הנה\"ח",          path: "/accounting" },
        { pattern: /לקוחות/,           labelHe: "לקוחות",          path: "/customers" },
        { pattern: /קטלוג|תמחור/,      labelHe: "קטלוג ותמחור",   path: "/catalog" },
        { pattern: /סוכנים|פיקוד/,     labelHe: "מרכז הפיקוד",    path: "/agents" },
        { pattern: /רווחיות/,          labelHe: "רווחיות",         path: "/profitability" },
        { pattern: /לוח זמנים/,        labelHe: "לוח זמנים",       path: "/schedule" },
        { pattern: /בטיחות/,           labelHe: "בטיחות",          path: "/safety" },
      ];
      const lowerNav = message.toLowerCase();
      const navMatch = NAV.find(n => n.pattern.test(lowerNav));
      if (!navMatch) {
        const allPages = NAV.map(n => `• ${n.labelHe} → \`${n.path}\``).join("\n");
        return { content: `🗺 **מפת הניווט:**\n\n${allPages}`, sourceRefs: [] };
      }
      return { content: `🗺 כדי לראות **${navMatch.labelHe}**, עבור לנתיב: \`${navMatch.path}\``, sourceRefs: [] };
    }

    case "general": {
      const isCC = !agentFilter;
      const lines5 = [
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
        lines5.push("• מצב סוכנים — \"איזה סוכנים פעילים?\"");
        lines5.push("• ניווט — \"איפה אני רואה הזמנות?\"");
      }
      return { content: lines5.join("\n"), sourceRefs: [] };
    }
```

- [ ] **Step 2.4 — Update the `default` case to be channel-aware**

Replace the comment + default block:
```typescript
    // "summary" + default + "general"
    default: {
```

With:
```typescript
    // "summary" + catch-all
    default: {
```

Then inside the default handler, wrap the existing code so command-center (agentFilter===null) gets a system overview:

Replace the opening of the default block's logic. Find where the default block's `const [excRes, taskRes, ...]` starts and insert a channel-branch before it:

```typescript
    default: {
      // Command-center: show agent health overview instead of operational summary
      if (!agentFilter) {
        const [ccAgRes, ccExcRes, ccTaskRes, ccApprRes] = await Promise.all([
          db.from("agents").select("id,name,status").limit(15),
          db.from("agent_exceptions").select("agent_id,severity,status").in("status", ["open","acknowledged"]),
          db.from("agent_tasks").select("agent_id,priority").in("status", ["open","in_progress"]),
          db.from("agent_approvals").select("agent_id").eq("status", "pending"),
        ]);
        const ccAgents  = ccAgRes.data ?? [];
        const ccExcs    = ccExcRes.data ?? [];
        const ccTasks   = ccTaskRes.data ?? [];
        const ccAppr    = ccApprRes.data ?? [];
        const ccCrit    = ccExcs.filter(e => e.severity === "critical").length;
        const ccErrors  = ccExcs.filter(e => e.severity === "error").length;
        const ccHigh    = ccTasks.filter(t => t.priority === "high" || t.priority === "critical").length;
        const ccLines = [
          `🖥️ **מצב מרכז הפיקוד — ${new Date().toLocaleDateString("he-IL")}**\n`,
          `🤖 סוכנים: **${ccAgents.length}**`,
          ccCrit > 0 || ccErrors > 0
            ? `🔴 חריגות: **${ccExcs.length} פתוחות** (${ccCrit} קריטיות, ${ccErrors} שגיאות)`
            : `🟢 חריגות: **${ccExcs.length} פתוחות** — ללא קריטיות`,
          `⚡ משימות: **${ccTasks.length} פתוחות** (${ccHigh} גבוהה)`,
          `📋 אישורים ממתינים: **${ccAppr.length}**`,
        ];
        if (ccCrit > 0) {
          ccLines.push(`\n⚠️ שאל "מה השגיאות הקריטיות?" לפרטים.`);
        } else if (ccAppr.length > 0) {
          ccLines.push(`\n💡 ${ccAppr.length} אישורים ממתינים.`);
        } else {
          ccLines.push(`\n✅ המצב תקין.`);
        }
        return { content: ccLines.join("\n"), sourceRefs: [] };
      }

      // Ops-manager: operational summary (existing logic below)
      const [excRes, taskRes, approvalRes, diaryRes, orderRes] = await Promise.all([
```

The rest of the existing default body (from the `const [excRes, ...` line onwards) remains unchanged.

- [ ] **Step 2.5 — Verify TypeScript compiles**

```bash
cd /Users/eliozedri/Desktop/eliozelk && npx tsc --noEmit 2>&1 | head -50
```

Expected: no errors in the edited files.

- [ ] **Step 2.6 — Commit**

```bash
git add src/lib/agents/chat-engine.ts
git commit -m "feat(chat-engine): add 6 new intent handlers, number detection, channel-aware summary"
```

---

## Task 3 — messages/route.ts: pageContext + history

**Files:** Modify `src/app/api/agents/chat/messages/route.ts`

- [ ] **Step 3.1 — Update imports** (add `HistoryTurn` to the import from `chat-engine`)

Replace:
```typescript
import { runChatEngine } from "@/lib/agents/chat-engine";
```
With:
```typescript
import { runChatEngine, type PageContext, type HistoryTurn } from "@/lib/agents/chat-engine";
```

- [ ] **Step 3.2 — Accept `pageContext` from request body**

Replace:
```typescript
  const { threadId, content } = await req.json() as { threadId: string; content: string };
```
With:
```typescript
  const { threadId, content, pageContext } = await req.json() as {
    threadId: string;
    content: string;
    pageContext?: PageContext | null;
  };
```

- [ ] **Step 3.3 — Load conversation history before calling the engine**

Find the line:
```typescript
  const agentId = thread.agent_id as string | null;
```

Add the following block immediately after it (before the user message insert):

```typescript
  // Load last 6 messages for follow-up context (3 pairs)
  const { data: historyRows } = await db
    .from("communication_messages")
    .select("sender_type,content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(6);
  const history: HistoryTurn[] = (historyRows ?? [])
    .reverse()
    .map(m => ({
      role: (m.sender_type as string) === "user" ? "user" : "agent" as const,
      content: m.content as string,
    }));
```

- [ ] **Step 3.4 — Pass options to runChatEngine**

Replace:
```typescript
  // 2. Run chat engine against live data
  const engineResult = await runChatEngine(db, { agentId, userId }, content.trim());
```
With:
```typescript
  // 2. Run chat engine against live data
  const engineResult = await runChatEngine(
    db,
    { agentId, userId },
    content.trim(),
    { pageContext: pageContext ?? null, history },
  );
```

- [ ] **Step 3.5 — Verify TypeScript**

```bash
cd /Users/eliozedri/Desktop/eliozelk && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 3.6 — Commit**

```bash
git add src/app/api/agents/chat/messages/route.ts
git commit -m "feat(chat-api): accept pageContext and load conversation history for engine"
```

---

## Task 4 — useAgentChat.ts: sendMessage accepts pageContext

**Files:** Modify `src/hooks/useAgentChat.ts`

- [ ] **Step 4.1 — Export the PageContext type from the hook**

Add near the top of the file (after the existing imports):

```typescript
export type { PageContext } from "@/lib/agents/chat-engine";
```

- [ ] **Step 4.2 — Update `sendMessage` signature and body**

Replace:
```typescript
  const sendMessage = useCallback(async (content: string): Promise<void> => {
```
With:
```typescript
  const sendMessage = useCallback(async (content: string, pageContext?: { pathname: string } | null): Promise<void> => {
```

Replace the `body: JSON.stringify(...)` line inside sendMessage:
```typescript
      body: JSON.stringify({ threadId: t.id, content: content.trim() }),
```
With:
```typescript
      body: JSON.stringify({ threadId: t.id, content: content.trim(), pageContext: pageContext ?? null }),
```

- [ ] **Step 4.3 — Verify TypeScript**

```bash
cd /Users/eliozedri/Desktop/eliozelk && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4.4 — Commit**

```bash
git add src/hooks/useAgentChat.ts
git commit -m "feat(useAgentChat): pass pageContext to chat message API"
```

---

## Task 5 — FloatingChatWindow.tsx: read pathname, pass context

**Files:** Modify `src/components/AgentChat/FloatingChatWindow.tsx`

- [ ] **Step 5.1 — Add `usePathname` import**

Add to the existing `import` block at the top of the file:
```typescript
import { usePathname } from "next/navigation";
```

- [ ] **Step 5.2 — Read pathname inside the component**

Inside the `FloatingChatWindow` component body, add immediately after the existing state declarations:

```typescript
  const pathname = usePathname();
```

- [ ] **Step 5.3 — Pass pathname to every `sendMessage` call**

Update `handleSend`:
```typescript
  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    await sendMessage(text, { pathname });
  }
```

Update `handleChip`:
```typescript
  async function handleChip(chip: string) {
    if (sending) return;
    await sendMessage(chip, { pathname });
  }
```

- [ ] **Step 5.4 — Verify TypeScript**

```bash
cd /Users/eliozedri/Desktop/eliozelk && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 5.5 — Commit**

```bash
git add src/components/AgentChat/FloatingChatWindow.tsx
git commit -m "feat(FloatingChatWindow): pass current pathname as pageContext to chat engine"
```

---

## Task 6 — Typecheck, lint, build

**Files:** None (verification only)

- [ ] **Step 6.1 — Full typecheck**

```bash
cd /Users/eliozedri/Desktop/eliozelk && npx tsc --noEmit 2>&1
```

Expected: 0 errors.

- [ ] **Step 6.2 — ESLint**

```bash
cd /Users/eliozedri/Desktop/eliozelk && npx next lint 2>&1 | tail -20
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 6.3 — Build**

```bash
cd /Users/eliozedri/Desktop/eliozelk && npx next build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` (or equivalent success message).

- [ ] **Step 6.4 — Commit verification results**

No files to commit — this is a verification step only. If any type/lint errors were found and fixed, commit those fixes.

---

## Test Questions (manual, in browser)

After starting the dev server (`npm run dev`), open the chat and test:

**Ops Manager (🎯 button — permission required):**
1. "מה אלו 49 השגיאות?" → must show grouped exception breakdown by severity+agent, NOT static summary
2. "מה השגיאות?" → must show exception list (plural keyword now matched)
3. "מה דורש טיפול?" → must show needs_attention response with critical issues
4. "מה מצב המחסן?" → must show inventory status
5. "האם אפשר להתחיל פיילוט?" → must show pilot readiness check with ✅/⚠️/❌ per category
6. "מה מצב הגרפיקה?" → must show graphics-production-agent status card

**Digital Command Center (🤖 button):**
7. "מה מצב המערכת?" → must show agent health overview (NOT ops operational summary)
8. "איזה סוכנים פעילים?" → must show agent list with last-run dates
9. "איפה אני רואה הזמנות?" → must return navigation response with `/orders` path

**Fallback:**
10. Type a random unrelated question → must receive honest "I can't answer" list, NOT static summary block
