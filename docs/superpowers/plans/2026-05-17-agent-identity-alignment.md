# Agent Identity Alignment — Coordination & QA Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert `coordination-qa-agent` into the Supabase agents table and align all TypeScript/config layers so the Coordination & QA Manager appears consistently in every system view — not just as a GhostNode on the visual map.

**Architecture:** Four independent file changes, all additive and non-breaking. The Supabase `agents` table uses plain `text` columns (no enums), so no schema migration is needed — only a seed INSERT. TypeScript union extensions are backward-compatible. The neural-core hotspot rename is display-only with no downstream logic.

**Tech Stack:** TypeScript, Supabase (PostgreSQL, plain-text agent columns), Next.js App Router

---

## File Map

| File | Action | What changes |
|---|---|---|
| `supabase/migrations/20260517100000_seed_coordination_qa_agent.sql` | Create | INSERT coordination-qa-agent row |
| `src/types/agent.ts` | Modify | Add `"coordination_qa"` to `AgentType`, add agent to `AGENT_ORG` |
| `src/lib/agents/neural-core-hotspots.ts` | Modify | Rename procurement hotspot → coordination-qa |

---

### Task 1: Create the Supabase migration

**Files:**
- Create: `supabase/migrations/20260517100000_seed_coordination_qa_agent.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Seed: Coordination & QA Manager agent
-- Adds coordination-qa-agent to the agents table.
-- Pattern matches 20260516100000_agent_framework.sql exactly.
-- autonomy_level 0 = analysis only; no scan routes exist yet.

INSERT INTO public.agents (
  id, name, type, department, description,
  autonomy_level, allowed_read_scopes, allowed_write_scopes, requires_approval_for,
  status, icon, color
) VALUES (
  'coordination-qa-agent',
  'מנהלת תיאומים ו-QA',
  'coordination_qa',
  'operations',
  'מנהלת תיאומים ובקרת איכות — עוזרת ומנהלת תפעול. מתאמת עבודות מול לקוחות, מזמינים ואנשי קשר. מאמתת מוכנות הזמנות לפני תזמון. מזהה סתירות בין סטטוס, התקדמות, תורי מחלקות, לוח הבקרה ועדכוני מערכת. בודקת שערי מחסן, גרפיקה, ייצור ומסגרייה. מעלה תקיעות ומצבים בלתי-אפשריים למנהל הפעילות. מונעת תזמון עבודות לפני סגירת השערים התפעוליים.',
  0,
  ARRAY['work_orders'],
  ARRAY[]::text[],
  ARRAY[]::text[],
  'idle', '🔍', '#0891b2'
)
ON CONFLICT (id) DO UPDATE SET
  name                  = EXCLUDED.name,
  description           = EXCLUDED.description,
  autonomy_level        = EXCLUDED.autonomy_level,
  allowed_read_scopes   = EXCLUDED.allowed_read_scopes,
  allowed_write_scopes  = EXCLUDED.allowed_write_scopes,
  requires_approval_for = EXCLUDED.requires_approval_for,
  icon                  = EXCLUDED.icon,
  color                 = EXCLUDED.color,
  updated_at            = now();
```

- [ ] **Step 2: Verify syntax consistency with existing migrations**

Check that column list matches `20260516100000_agent_framework.sql` exactly. The existing seed uses:
```
id, name, type, department, description,
autonomy_level, allowed_read_scopes, allowed_write_scopes, requires_approval_for,
status, icon, color
```
This migration uses the same column list. ✓

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260517100000_seed_coordination_qa_agent.sql
git commit -m "feat(agents): seed coordination-qa-agent in Supabase agents table

Registers the Coordination & QA Manager as a real agent row.
autonomy_level=0 (no scan yet), status=idle, read_scopes=[work_orders].
Honest DB record — no fake tasks, exceptions, or scan history."
```

---

### Task 2: Update AgentType and AGENT_ORG in types/agent.ts

**Files:**
- Modify: `src/types/agent.ts`

- [ ] **Step 1: Add `"coordination_qa"` to the AgentType union**

Current (lines 4–12 of `src/types/agent.ts`):
```typescript
export type AgentType =
  | "orchestrator"
  | "inventory"
  | "field_operations"
  | "graphics_production"
  | "catalog_pricing"
  | "cfo"
  | "billing_collections"
  | "engineering_analysis";
```

Change to:
```typescript
export type AgentType =
  | "orchestrator"
  | "inventory"
  | "field_operations"
  | "graphics_production"
  | "catalog_pricing"
  | "cfo"
  | "billing_collections"
  | "engineering_analysis"
  | "coordination_qa";
```

- [ ] **Step 2: Add `"coordination-qa-agent"` to AGENT_ORG children**

Current (lines 265–278):
```typescript
export const AGENT_ORG: OrgNode[] = [
  {
    agentId: "ops-orchestrator",
    children: [
      "inventory-agent",
      "field-ops-agent",
      "graphics-production-agent",
      "catalog-pricing-agent",
      "cfo-agent",
      "billing-collections-agent",
      "engineering-plan-agent",
    ],
  },
];
```

Change to:
```typescript
export const AGENT_ORG: OrgNode[] = [
  {
    agentId: "ops-orchestrator",
    children: [
      "coordination-qa-agent",
      "inventory-agent",
      "field-ops-agent",
      "graphics-production-agent",
      "catalog-pricing-agent",
      "cfo-agent",
      "billing-collections-agent",
      "engineering-plan-agent",
    ],
  },
];
```

Place `"coordination-qa-agent"` first — she is the Operations Manager's direct assistant and conceptually closest to him in the org hierarchy.

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no output (zero errors).

- [ ] **Step 4: Commit**

```bash
git add src/types/agent.ts
git commit -m "feat(agents): add coordination_qa AgentType and include in AGENT_ORG

Adds coordination-qa-agent as first child of ops-orchestrator in the
org hierarchy. Extends AgentType union with coordination_qa."
```

---

### Task 3: Rename procurement hotspot in neural-core-hotspots.ts

**Files:**
- Modify: `src/lib/agents/neural-core-hotspots.ts`

- [ ] **Step 1: Replace the procurement entry**

Current (line 23):
```typescript
  { id: 'procurement',  labelHe: 'מחלקת רכש',          labelEn: 'PROCUREMENT',            x: 17.4, y: 73.2, w: 13.2, h:  9.3, shape: 'ellipse' },
```

Change to:
```typescript
  { id: 'coordination-qa', labelHe: 'תיאומים ו-QA',    labelEn: 'COORDINATION & QA',      x: 17.4, y: 73.2, w: 13.2, h:  9.3, shape: 'ellipse' },
```

Coordinates (x, y, w, h) are unchanged — they describe a physical region on the JARVIS brain image that was calibrated in-browser.

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no output (zero errors). The `NeuralHotspot` interface uses `id: string` so any string value is valid.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agents/neural-core-hotspots.ts
git commit -m "feat(agents): rename procurement hotspot to coordination-qa in JARVIS map

The Coordination & QA Manager replaces the obsolete Purchasing Department
concept in the neural-core visual overlay. Coordinates unchanged."
```

---

### Task 4: Final validation

- [ ] **Step 1: Full TypeScript check**

```bash
npx tsc --noEmit 2>&1
```

Expected: no output.

- [ ] **Step 2: Build check (if applicable)**

```bash
npx next build 2>&1 | tail -20
```

Expected: successful build with no type errors. Warnings about image optimization or similar are acceptable.

- [ ] **Step 3: Verify all 9 agents are registered**

Check that `AGENT_REGISTRY` keys match the union of all `room-config.ts` agentIds:

```bash
grep -h '"[a-z-]*-agent\|ops-orchestrator"' \
  src/lib/agents/agent-registry.ts \
  src/lib/agents/room-config.ts | sort | uniq -c | sort -rn
```

Expected: each agent ID appears at least twice (once in registry, once in a room).

- [ ] **Step 4: Verify no residual 'מחלקת רכש' agent label**

```bash
grep -rn "מחלקת רכש\|'procurement'" \
  src/lib/agents/ \
  src/components/AgentCommandCenter/ \
  src/types/agent.ts
```

Expected: zero matches (only legitimate domain-vocabulary hits in warehouse/inventory routes are acceptable, but those files are not in the search scope above).

- [ ] **Step 5: Commit final validation**

```bash
git add -p  # stage anything leftover
git commit -m "chore(agents): validation — coordination-qa-agent fully aligned across system"
```

If nothing is staged, skip the commit.

---

## Self-Review

**Spec coverage:**
- ✅ Supabase migration with INSERT … ON CONFLICT DO UPDATE → Task 1
- ✅ `coordination_qa` AgentType → Task 2 Step 1
- ✅ AGENT_ORG placement under ops-orchestrator → Task 2 Step 2
- ✅ neural-core procurement → coordination-qa rename → Task 3
- ✅ TypeScript + build verification → Task 4
- ✅ `auth.ts` procurement_manager: no task = intentional omission (human ACL, not agent)
- ✅ Warehouse/inventory "רכש" domain wording: no task = intentional (domain vocabulary)

**Placeholder scan:** No TBD, no TODO, no "similar to Task N", all code blocks complete.

**Type consistency:** `"coordination-qa-agent"` (hyphenated string ID) and `"coordination_qa"` (underscore TypeScript type) are used consistently. The DB `type` column is plain text — `"coordination_qa"` matches the TypeScript union.
