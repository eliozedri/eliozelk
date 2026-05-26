# Jarvis Agent Reasoning (Stage 3)

Lets the **owner** issue a complex request that Jarvis breaks into a SAFE, ordered plan over
**existing** read-only actions, executes it, and summarizes. Code: `src/lib/jarvis/agent/`.

> **Status: deterministic planner live; LLM planner dormant** (no key). This is a *safe planner*,
> not an autonomous code/SQL agent — be honest about that.

## Hard safety model

- **Owner-only.** External customers can never trigger multi-skill internal reasoning (the
  dispatcher is owner-gated; the LLM plan path returns null for external roles).
- **No arbitrary code/SQL.** The LLM may only assemble a plan from a fixed **action catalog**
  (`agent/catalog.ts`), each mapping 1:1 to an existing **read-only** `ceoManager` command.
- **Execution gate.** `runner.ts` runs a step ONLY if `safety==="read_only"` AND it maps to a
  known command. Anything else is **skipped and reported honestly** — never faked.
- **Writes require approval** and are not implemented now (no write action exists in the catalog).

## Flow (inside the ceoManager dispatcher)

```
owner directive
  → Tier 1: single read-only command (matchCommand)         e.g. "כמה מוצרים ללא מחיר"
  → Tier 2: multi-step plan (LLM if enabled+safe, else deterministic known patterns)
              executePlan → run each read-only step → summarize → command-center + WhatsApp report
  → Tier 3: queue a human agent_task (honest fallback)
```

## Plan schema (`LLMPlanResult`)

```json
{
  "goal": "דוח סיכונים תפעולי — מה עלול לתקוע עבודות",
  "steps": [
    { "skill": "operations", "action": "stuck_orders", "parameters": {}, "safety": "read_only" }
  ],
  "requiresApproval": false,
  "riskLevel": "low"
}
```

## Action catalog (read-only)

| skill.action | maps to command | does |
|---|---|---|
| operations.stuck_orders | stuck_orders | orders flagged stuck / SLA / urgent |
| operations.open_orders_overview | open_orders_overview | open orders by status |
| operations.pending_drafts | pending_drafts | inbound drafts awaiting review |
| operations_inventory.items_missing_price | items_missing_price | active commercial items with no price |
| operations.exceptions_overview | exceptions_overview | open exceptions across agents by severity |

## Deterministic known patterns (`agent/planner.ts`)

- "מה יכול לתקוע עבודות" / "דוח סיכונים תפעולי" → stuck_orders + pending_drafts + items_missing_price + exceptions_overview
- "מלאי + הזמנות פתוחות" → open_orders_overview + items_missing_price + pending_drafts
- "תמונת מצב מלאה" / "דוח מנהלים" → all five

## Adding a safe action

1. Add a read-only command to `skills/ceoManager/commands.ts` (never mutates).
2. Add one row to `PLANNER_ACTIONS` in `agent/catalog.ts`.
3. (optional) add a deterministic pattern in `planner.ts`. The LLM planner picks it up via the
   catalog text automatically. No write path is ever added here.

## Honest limits

No write-class actions, no approval workflow yet, LLM planner dormant until a provider key is set.
The deterministic planner covers the high-value owner reports today.
