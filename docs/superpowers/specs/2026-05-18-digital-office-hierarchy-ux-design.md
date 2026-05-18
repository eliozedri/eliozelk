# Digital Office Hierarchy UX — Design Spec
Date: 2026-05-18
Status: Approved for implementation

## Summary

Refactor the existing "משרד דיגיטלי / Digital Office" tab (`DigitalHQ.tsx`) from a static 4-column grid of room cards into a **live hierarchical operational office** with agent presence modeling, a real-time activity feed, and an actionable KPI sidebar. The refactor is additive — existing Supabase data loading, routing, auth, and tab behavior are preserved.

---

## Architecture

### Layout: 3-column + sticky header + bottom presence bar

```
[Header: title, status, actions]
[Left KPI Sidebar | Center Hierarchy | Right Activity Feed]
[Bottom: Active Agents Presence Bar]
```

Responsive: on smaller screens, sidebars collapse below the hierarchy.

### Center Hierarchy (top → bottom):

1. **ExecutiveControlCard** — ops-orchestrator, full-width, KPI stats inline
2. **MeetingRoomStrip** — always visible; shows active meetings or "no meetings" state
3. **DepartmentGrid** — 3 rows × 3 columns of DepartmentRoomCard
4. **ActiveAgentsPresenceBar** — pinned to bottom, scrollable horizontally

---

## Agent Presence Model

Each agent has:
- `id`, `name`, `icon`, `homeRoomId`, `currentRoomId`
- `presenceStatus`: `active | idle | waiting | critical | in_meeting | away`
- `currentActivity` (string)
- `relatedEntity?` (type + id)
- `lastActivityAt` (ISO string)

**Visual rules:**
- `currentRoomId === homeRoomId` → show normally in department card
- `currentRoomId !== homeRoomId` → ghost chip (dashed border, 50% opacity, label "בחדר ישיבות") in home room; active chip in current room
- `in_meeting` → ghost in home room + avatar in Meeting Room strip
- `critical` → red dot, escalates room status

---

## Room Model

Each room:
- `id`, `titleHe`, `titleEn`, `departmentType`, `icon`, `accentColor`
- `status`: `healthy | active | waiting | warning | critical | inactive`
- Computed from agent stats: `openTasks`, `pendingApprovals`, `alerts`
- `homeAgents[]`, `visitingAgents[]`, `awayAgents[]`
- `lastActivity` (string)

**Status derivation (priority order):**
1. Any critical exception → `critical`
2. Pending approvals → `warning`  
3. Agents in meeting (all away) → `waiting`
4. Scan running → `active`
5. No issues → `healthy`

**If room has >3 agent chips** → show first 2 + `+N` chip.

---

## Meeting Room

Special coordination area. Shows:
- Meeting title, related entity, participating agents (from their home rooms)
- Blocking issue + next required action
- Status: `active | waiting | critical | completed`
- "No active meetings" empty state with + button

When agents join: ghost appears in their home room, avatar appears in Meeting Room.
When meeting ends: agents return visually to home rooms, feed logs the event.

---

## Activity Feed (Right Sidebar)

Operational conversation layer. Each event:
- `time`, agent `icon` + `name`, `sourceDept`, `action text`, `targetDept?`, `relatedEntity?`, `severity`, `eventType`

Event types: `agent_joined_room`, `meeting_started`, `meeting_ended`, `task_created`, `task_moved`, `approval_required`, `approval_received`, `stock_issue`, `invoice_ready`, `work_diary_pending`, `critical_exception`

Feed events influence room status visually (derived, not persisted).

---

## Left KPI Sidebar

- System health (overall)
- Active agents count
- Agents in meetings count
- Open tasks
- Critical issues
- Pending approvals
- Blocked workflows
- Active rooms count
- Last update time

---

## Bottom Presence Bar

All agents scrollable horizontally. Each chip shows:
- avatar/icon, name, home dept, **current location**, status dot, state label

If `currentRoom !== homeRoom` → location shown in teal (meeting) or purple (other room).

---

## Data Architecture

### Real Supabase data (via existing `useAgentContext`):
- `agents[]` — id, name, icon, status, department, stats
- `tasks[]`, `exceptions[]`, `approvals[]`, `activityFeed[]`
- `meetings[]` via `useAgentMeetings`

### Placeholder data (isolated in one file):
**`src/lib/agents/digitalOfficeState.ts`**
- `AGENT_PRESENCE_MAP`: `Record<agentId, { homeRoomId, currentRoomId, presenceStatus, currentActivity, relatedEntity }>`
- `MOCK_ACTIVITY_EVENTS`: `ActivityEvent[]` — derived examples, clearly typed
- `ACTIVE_MEETINGS_MOCK`: supplement real meetings with derived state

All placeholder data is typed, documented as temporary, and structured to be replaced by Supabase columns/queries later.

### Fallback mapping:
If an agent has no valid `department` → place in "management" room (fallback). Never break UI.

---

## Components Created/Modified

| Component | Action | File |
|-----------|--------|------|
| `DigitalHQ` | Refactor layout | `AgentCommandCenter/DigitalHQ.tsx` |
| `ExecutiveControlCard` | New | inside DigitalHQ |
| `MeetingRoomStrip` | New (replaces MeetingRoomCard) | inside DigitalHQ |
| `DepartmentRoomCard` | New (replaces RoomCard) | inside DigitalHQ |
| `AgentAvatarChip` | New shared chip | inside DigitalHQ |
| `SystemHealthSidebar` | New | inside DigitalHQ |
| `ActivityFeedSidebar` | New | inside DigitalHQ |
| `ActiveAgentsPresenceBar` | New | inside DigitalHQ |
| `digitalOfficeState.ts` | New data adapter | `src/lib/agents/` |
| `room-config.ts` | Extend RoomConfig | `src/lib/agents/` |

**Preserved unchanged:**
- `AgentCommandCenter/index.tsx` — tab switching, scan logic, AgentRoom drawer, approval/exception handlers
- `AgentCommandCenter/NewMeetingModal.tsx`
- All API routes, hooks, context

---

## UI States Required

- Loading: spinner + skeleton cards
- No agents: empty state with scan CTA
- Error/Supabase failure: error banner, retry button
- No active meetings: empty Meeting Room with + button
- No recent activity: empty feed state

---

## Design Constraints

- Hebrew RTL throughout
- Dark premium (navy #0d1b2e base)
- No heavy animations — only: status dot pulse, critical glow, simple transitions
- No spiderweb connection lines
- Agent chips: max 3 visible + "+N" if overflow
- Responsive: sidebars collapse on screens < 1200px
