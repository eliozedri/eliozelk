# Agent Identity Alignment — Coordination & QA Manager

> **Historical document — identity migration note (2026-05-24):** Point-in-time design record. The central executive agent was later renamed ops-orchestrator -> ceo (id and type = ceo; Hebrew display name "מנהל תפעול"). Any ops-orchestrator reference below is the PRE-migration name of the current ceo agent and is NOT a live source of truth. All managerial routing (Jarvis, Telegram, WhatsApp, approvals, notifications, agent routing) now targets ceo.
**Date:** 2026-05-17
**Status:** Approved — ready for implementation

## Problem

`coordination-qa-agent` was created in `AGENT_REGISTRY` and `room-config.ts` as the new "Coordination & QA Manager" role, replacing the obsolete Purchasing/רכש concept. However, it does not exist in the Supabase `agents` table.

The result is an identity split:
- Visual agent map (DigitalHQ) → shows a GhostNode for coordination-qa-agent
- Digital Command Center overview, agent cards, org chart → agent completely absent
- `neural-core-hotspots.ts` → still shows `{ id: 'procurement', labelHe: 'מחלקת רכש' }` for the same conceptual slot

There is no duplicate agent. The role exists only as static config, not as a live registered agent.

## Goal

Make `coordination-qa-agent` a first-class registered agent visible consistently across all system views, with honest (non-fake) DB metadata.

## Agent Definition

| Field | Value |
|---|---|
| ID | `coordination-qa-agent` |
| Hebrew name | `מנהלת תיאומים ו-QA` |
| English role | Coordination & QA Manager |
| Short subtitle | תיאום עבודות · בקרת מוכנות · בדיקת סתירות |
| Department | `operations` |
| Type (TypeScript) | `"coordination_qa"` |
| Autonomy level | `0` (analysis only, no scan yet) |
| Status | `"idle"` |
| Icon | 🔍 |
| Color | `#0891b2` (cyan — unused, distinct from all existing agents) |
| Scopes | None yet |

**Responsibilities represented in description:**
Customer/site/requester coordination, order readiness validation before scheduling, pre-scheduling QA, workflow integrity, contradiction detection between status/progress/department queues/dashboard/badges/notifications, escalation to Operations Manager, blocked order detection, waiting-for-customer detection, preventing premature scheduling or readiness marking.

**Connection to workflow engine:**
Conceptually connected to `canMarkReadyForInstallation` and `canMarkOperationallyComplete` in `src/lib/workflowEngine.ts`. She enforces and surfaces violations of these gates.

## Architecture

### Layer model

```
AGENT_REGISTRY (static config)  ←── label, icon, description, responsibilities, workflowRole
room-config.ts (static layout)  ←── grid position, room, agentIds
Supabase agents table (live)    ←── status, scans, tasks, exceptions
types/agent.ts (TypeScript)     ←── AgentType union, AGENT_ORG hierarchy
neural-core-hotspots.ts         ←── JARVIS brain image overlay labels
```

All five layers must reference the same agent ID: `"coordination-qa-agent"`.

### Identity contract

> To add a future agent, only two steps are required:
> 1. One entry in `AGENT_REGISTRY`
> 2. One agent ID in the relevant room's `agentIds` in `room-config.ts`
>
> A Supabase migration is needed only if the agent should appear in DB-driven views (overview, org chart, agent cards).

## Changes Required

### 1. New Supabase migration

**File:** `supabase/migrations/20260517100000_seed_coordination_qa_agent.sql`

Pattern: `INSERT ... ON CONFLICT (id) DO UPDATE SET`, identical to existing agent seed in `20260516100000_agent_framework.sql`.

Columns: `id, name, type, department, description, autonomy_level, allowed_read_scopes, allowed_write_scopes, requires_approval_for, status, icon, color`

Values:
- `autonomy_level: 0` — analysis only, no autonomous scan
- `allowed_read_scopes: '{work_orders}'` — minimal read for QA review
- `allowed_write_scopes: '{}'` — no write capability yet
- `requires_approval_for: '{}'` — none yet
- `status: 'idle'`
- No seed activity feed entry (avoids fake historical data)

### 2. `src/types/agent.ts`

- Add `"coordination_qa"` to `AgentType` union
- Add `"coordination-qa-agent"` to `AGENT_ORG[0].children` array under `ops-orchestrator`

### 3. `src/lib/agents/neural-core-hotspots.ts`

Change the `procurement` hotspot:
- `id`: `'procurement'` → `'coordination-qa'`
- `labelHe`: `'מחלקת רכש'` → `'תיאומים ו-QA'`
- `labelEn`: `'PROCUREMENT'` → `'COORDINATION & QA'`
- Coordinates (x, y, w, h): **unchanged** — they describe a physical region on the JARVIS image

### 4. No changes to

| File | Reason |
|---|---|
| `auth.ts` | `procurement_manager` is a human ACL role, unrelated to agents |
| `inventory-agent/scan/route.ts` | "המלצת רכש" = domain vocabulary for purchase recommendations |
| `chat-engine.ts` | "המלצות רכש" = domain vocabulary for warehouse agent |
| `Warehouse/index.tsx` | "המלצות רכש" tab = a feature, not an agent identity |
| `Catalog/index.tsx` | "כמות מינימום (לרכש)" = form label |
| `AGENT_REGISTRY` | Already contains coordination-qa-agent ✅ |
| `room-config.ts` | Already contains coordination-qa room ✅ |
| `DigitalHQ.tsx` | GhostNode already reads from AGENT_REGISTRY ✅ |

## Post-Change Validation

After implementation, verify:
1. `coordination-qa-agent` is present in Supabase `agents` table
2. `AgentType` includes `"coordination_qa"`
3. `AGENT_ORG[0].children` includes `"coordination-qa-agent"`
4. Digital Command Center overview shows her as a real agent card
5. Org chart shows her under Operations Orchestrator
6. Visual map (DigitalHQ) shows her as an `AgentNode` (not GhostNode) after DB load
7. `neural-core-hotspots.ts` no longer has `'מחלקת רכש'` or `id: 'procurement'`
8. TypeScript passes with no errors
9. No duplicate agent representing the same role

## Risk Assessment

**Low risk overall.** All changes are additive:
- The migration uses `ON CONFLICT DO UPDATE` — safe to re-run
- The TypeScript union extension is non-breaking
- The hotspot rename has no downstream logic effects (it's display-only)
- No existing agent data is removed or modified
