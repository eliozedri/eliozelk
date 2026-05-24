# Agent Chat — First Functional Layer

> **Historical document — identity migration note (2026-05-24):** Point-in-time design record. The central executive agent was later renamed ops-orchestrator -> ceo (id and type = ceo; Hebrew display name "מנהל תפעול"). Any ops-orchestrator reference below is the PRE-migration name of the current ceo agent and is NOT a live source of truth. All managerial routing (Jarvis, Telegram, WhatsApp, approvals, notifications, agent routing) now targets ceo.

**Date:** 2026-05-18
**Status:** Approved for implementation
**Approach:** B — keyword expansion + page context + number detection

---

## Problem

The Global Chat UI exists and routes to a real backend (`chat-engine.ts`), but the engine returns the static daily-summary block for most questions because:

1. **Hebrew plural forms not matched**: "שגיאות" (plural) does not contain "שגיאה" (singular keyword), causing intent detection to fall through.
2. **Unknown intent defaults to `"summary"`**: Any unrecognized question triggers the summary block, making it look like the engine ignored the question.
3. **No page context**: "מה אלו 49 השגיאות?" refers to a number visible in the UI; the engine receives no context about it.
4. **Command-center and ops-manager respond identically**: No channel-specific behavior exists.

---

## Goal

Make the chat genuinely answer user questions:
- Fix keyword matching for Hebrew plurals
- Add 5 new intent handlers that cover common operational questions
- Pass the current page pathname so the engine can interpret context-references
- Detect numbers in questions to group and explain specific counts
- Differentiate command-center vs ops-manager response sets
- Replace the static fallback with an honest "I can't answer this" message

No LLM integration in this phase. All responses remain deterministic, grounded in live Supabase data.

---

## Architecture

### Data Flow

```
FloatingChatWindow
  usePathname() → pathname: e.g. "/agents"
  handleSend() → sendMessage(content, { pathname })
       ↓
useAgentChat.sendMessage(content, pageContext?)
  POST /api/agents/chat/messages
  body: { threadId, content, pageContext: { pathname } }
       ↓
messages/route.ts  (POST handler)
  loads last 6 messages from DB → conversationHistory (last 3 pairs)
  calls runChatEngine(db, ctx, message, { pageContext, conversationHistory })
       ↓
chat-engine.ts  runChatEngine()
  detectIntent(message, pageContext, history) → ChatIntent
  handler(intent) → DB queries → { content: string, sourceRefs: SourceRef[] }
```

### Files Changed

| File | Change |
|---|---|
| `src/lib/agents/chat-engine.ts` | New intents, keyword fixes, page context, number detection, history, honest fallback |
| `src/app/api/agents/chat/messages/route.ts` | Accept `pageContext` from body; load last 6 messages as `conversationHistory` before calling engine |
| `src/hooks/useAgentChat.ts` | `sendMessage(content, pageContext?)` signature update |
| `src/components/AgentChat/FloatingChatWindow.tsx` | `usePathname()` → build `PageContext`; pass to `sendMessage` |

No new files. No schema changes. No new API routes.

---

## Intent System

### Existing Intents — Keyword Fixes

| Intent | Added keywords |
|---|---|
| `exceptions` | `"שגיאות"`, `"חריגות"`, `"אזהרות"`, `"כמה שגיאות"`, `"כמה חריגות"` |
| `urgent` | `"הדחוף ביותר"`, `"הכי דחוף"`, `"הכי קריטי"` |
| `approvals` | `"ממתין לאישורי"`, `"לאישורי"`, `"מה ממתין"` (shared with needs_attention) |
| `summary` | The intent is kept; its **handler** branches by channel: command-center → agent health overview; ops-manager → operational status block. `"מה המצב"` remains a summary keyword. |

### New Intents

#### `needs_attention`
**Keywords:** `"דורש טיפול"`, `"לטפל"`, `"לטיפול"`, `"מה צריך טיפול"`, `"מה מחכה"`, `"מה נשאר"`, `"מה פתוח"` — Note: `"מה ממתין"` is shared with `approvals`; `needs_attention` is checked **first** in intent detection order since it is more general.

**Handler:** Query in parallel:
- Open/critical exceptions (all agents or filtered)
- Pending approvals
- Unbilled completed orders
- Unapproved work diaries

Response: Ranked list of what needs attention, highest priority first. Honest "nothing open" if all clear.

---

#### `department_status`
**Keywords:** `"מצב ה"`, `"מה קורה ב"`, `"מה מצב ה"`, `"גרפיקה"`, `"מסגרייה"`, `"מחסן"`, `"שטח"`, `"כספים"`, `"גבייה"`, `"תיאומים"`, `"קואורדינציה"`

**Detection pattern:** Match department name in the message against a department→agentId map:

```
גרפיקה / ייצור גרפי   → graphics-production-agent
מחסן / לוגיסטיקה       → inventory-agent
מסגרייה / ייצור        → fabrication-agent
שטח / ביצוע / צוות     → field-ops-agent
כספים / גבייה / חיוב   → billing-collections-agent
QA / תיאומים            → coordination-qa-agent
הזמנות / תפעול          → orders-agent
```

**Handler:** For the matched agent, query:
- Open exceptions (by severity)
- Open/in-progress tasks
- Pending approvals

Response: Department health card with severity breakdown.

---

#### `qa_pilot`
**Keywords:** `"פיילוט"`, `"QA"`, `"מוכנות"`, `"שער"`, `"gate"`, `"להתחיל פיילוט"`, `"לפני פיילוט"`, `"מצב פיילוט"`, `"מוכן להתחיל"`

**Handler:** Query coordination-qa-agent:
- Open exceptions (count + list)
- Open tasks (count + list)
- Pending approvals

Response format:
```
🔍 סטטוס מוכנות פיילוט — [date]

✅/⚠️/❌ חריגות QA פתוחות: N
✅/⚠️/❌ משימות פתוחות: N
✅/⚠️/❌ אישורים ממתינים: N

המלצה: ✅ ניתן להתחיל / ⚠️ יש נושאים לסגירה / ❌ לא מומלץ
```

Pilot is recommended ✅ only when: 0 critical exceptions, 0 pending approvals, <3 open tasks.

---

#### `agent_status` (command-center channel only)
**Keywords:** `"סוכנים"`, `"איזה סוכן"`, `"כמה סוכנים"`, `"פעילים"`, `"מצב הסוכנים"`, `"מצב הסוכן"`

**Handler:** Query `agents` table + `agent_exceptions` + `agent_tasks` counts per agent.

Response: List of agents with status, open exceptions, open tasks.

If called from ops-manager channel: return navigation hint → "מידע על סוכנים זמין במרכז הפיקוד".

---

#### `navigation` (command-center channel only)
**Keywords:** `"איפה אני רואה"`, `"איך מגיע"`, `"איפה ה"`, `"לאיפה"`, `"איזה דף"`, `"איך נכנס"`, `"היכן"`

**Handler:** Deterministic page map:

```
הזמנות        → /orders
מחסן          → /warehouse
גרפיקה        → /graphics
מסגרייה       → /fabrication
שטח / ביצוע  → /work-diary
כספים / הנה"ח → /accounting
לקוחות        → /customers
קטלוג         → /catalog
סוכנים        → /agents
רווחיות       → /profitability
לוח זמנים    → /schedule
בטיחות        → /safety
```

Response: "כדי לראות [נושא], עבור ל [קישור/נתיב]."

---

### Honest Fallback (intent = "general")

When no keyword matches and no page context resolves intent:

```
לא זיהיתי את נושא השאלה שלך.

אני יכול לענות על שאלות בנושאים הבאים:
• חריגות ושגיאות (מה השגיאות? מה החריגות הקריטיות?)
• משימות ועדיפויות (מה הדחוף ביותר?)
• אישורים ממתינים (מה ממתין לאישורי?)
• חיוב והזמנות (מה ממתין לחיוב?)
• יומני שטח (אילו יומנים ממתינים?)
• מלאי ומחסן (מה מצב המחסן?)
• רווחיות (מה הרווחיות של הזמנה X?)
• מוכנות פיילוט (האם אפשר להתחיל פיילוט?)
• מצב מחלקה (מה מצב הגרפיקה?)

[command-center only: נווט לדף הרצוי על ידי שאלה כמו "איפה אני רואה הזמנות?"]
```

---

## Page Context

### What Is Passed

```typescript
interface PageContext {
  pathname: string;  // window.location.pathname
}
```

### Auto-Routing by Pathname

When the user sends a message without specific keywords but has a clear page context:

| Pathname | Default intent override |
|---|---|
| `/warehouse` | `inventory` (if message is vague like "מה המצב?") |
| `/fabrication` | `department_status` → fabrication-agent |
| `/graphics` | `department_status` → graphics-production-agent |
| `/agents` | `agent_status` (command-center) / `needs_attention` (ops-manager) |
| `/accounting` | `billing` |
| `/orders` | `orders` |

Override only applies when detected intent is "general" — never overrides a clearly detected keyword intent.

### Number Detection

```typescript
const mentionedNumber = message.match(/(\d+)/)?.[1];
```

If `mentionedNumber` is detected AND intent is `exceptions` or `needs_attention`:
1. Query total open exception count from DB
2. If total matches mentionedNumber (±5%), proceed with full grouped breakdown
3. Group by `(severity, agent_id, category)` instead of top-20 flat list
4. Response header: "ישנן [N] חריגות פתוחות. הנה הפירוט לפי חומרה וסוכן:"

If the count does not match: answer naturally (show whatever is in DB) and note: "ישנן כרגע [actual count] חריגות פתוחות — ייתכן שהמספר שאתה רואה כולל נושאים נוספים."

---

## Conversation History

### What Is Loaded

API route loads the last 6 `communication_messages` for the thread (ordered ascending), which represents the last 3 pairs of user+agent exchanges.

These are passed as:
```typescript
interface HistoryTurn {
  role: "user" | "agent";
  content: string;
}
```

### How the Engine Uses History

The engine checks history only for follow-up detection. A message is a follow-up if:
- It is very short (< 8 chars): "תפרט", "ולמה?", "ומה עוד?", "הצג הכל"
- It starts with a continuation word: "ו", "גם", "אבל", "כן", "לא", "אז"

When a follow-up is detected, the engine re-runs the previous user intent with a "detail" flag, returning more results (e.g., more exceptions listed, pagination-style).

History is NOT used to synthesize new answers or blend topics. It is only used to extend the previous answer.

---

## Channel Differentiation

### Command Center (agentId = null)

Primary use cases:
- "מה מצב המערכת?" → `summary` intent, command-center branch → agent health overview (agent counts, issue counts)
- "איזה סוכנים פעילים?" → `agent_status` intent
- "איפה אני רואה הזמנות?" → `navigation` intent
- "מה נשאר לסיום?" → `needs_attention` across all agents
- "תסכם לי את מצב הפיילוט" → `qa_pilot`

### Ops Manager (agentId = "ops-orchestrator")

Primary use cases:
- "מה אלו 49 השגיאות?" → `exceptions` with number detection
- "מה דורש טיפול כרגע?" → `needs_attention`
- "מה מצב המחסן?" → `department_status` → inventory
- "האם אפשר להתחיל פיילוט?" → `qa_pilot`
- "איזה בעיות QA פתוחות?" → `department_status` → coordination-qa-agent

When ops-manager receives a command-center-only question (agent_status, navigation), it returns a brief redirect: "מידע זה זמין דרך מרכז הפיקוד. פתח את הצ'אט של מרכז הפיקוד מהכפתור הכחול."

---

## Testing Checklist

After implementation, verify each of these:

**Ops Manager:**
- [ ] "מה אלו 49 השגיאות?" → shows grouped breakdown, NOT static summary
- [ ] "מה השגיאות?" → shows exception list (plural keyword now matched)
- [ ] "מה האזהרות?" → shows warn-severity exceptions
- [ ] "מה דורש טיפול כרגע?" → shows top issues across categories
- [ ] "מה מצב המחסן?" → shows inventory department status
- [ ] "האם אפשר להתחיל פיילוט?" → shows pilot readiness check
- [ ] "איזה בעיות QA פתוחות?" → shows coordination-qa-agent exceptions
- [ ] Unknown question → honest "I can't answer" message (NOT repeated summary)

**Digital Command Center:**
- [ ] "מה מצב המערכת?" → agent health overview
- [ ] "איזה סוכנים פעילים?" → agent list with statuses
- [ ] "איפה אני רואה הזמנות?" → navigation response
- [ ] "מה נשאר לסיום?" → needs_attention across all agents
- [ ] "תסכם לי את מצב הפיילוט" → pilot readiness

**Permission gating:**
- [ ] Ops Manager chat button still hidden from users without `chat_ops_manager` permission
- [ ] No ops-manager data leaks through command-center channel

---

## What Remains Missing After This Phase

The following capabilities are explicitly out of scope for this phase:

1. **True natural language understanding** — questions must still contain recognizable Hebrew keywords. Completely free-form phrasing will hit the honest fallback.
2. **LLM/AI responses** — no Claude API integration in this phase.
3. **ESLint/build log access** — the engine has no connection to CI/build artifacts.
4. **Real-time streaming** — responses are still request/response (no SSE).
5. **Cross-message memory** — history is used only for short follow-ups, not full conversation synthesis.
6. **UI counter injection** — visible counts from the dashboard are not injected into context (pathname only is passed).

---

## Not Changed

- `communication_threads` table — no schema changes
- `communication_messages` table — no schema changes
- `GlobalFloatingChatContext` — no changes
- All existing intent handlers (urgent, billing, diaries, orders, inventory, profitability, scan, restored) remain unchanged
- Permission system for ops-manager channel remains unchanged
