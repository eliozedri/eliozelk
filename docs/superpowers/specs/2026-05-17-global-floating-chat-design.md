# Global Floating Chat — Design Spec

> **Historical document — identity migration note (2026-05-24):** Point-in-time design record. The central executive agent was later renamed ops-orchestrator -> ceo (id and type = ceo; Hebrew display name "מנהל תפעול"). Any ops-orchestrator reference below is the PRE-migration name of the current ceo agent and is NOT a live source of truth. All managerial routing (Jarvis, Telegram, WhatsApp, approvals, notifications, agent routing) now targets ceo.

**Date:** 2026-05-17  
**Status:** Approved → implementing

---

## Problem

`FloatingChatWindow` is mounted inside `AgentCommandCenter` (`/agents` route only). Navigating away destroys the window. Users cannot open a chat from any other screen (orders, warehouse, graphics, etc.).

---

## Goal

A floating chat panel that:
- Persists across all non-auth app screens
- Opens from any component via `useGlobalChat()`
- Supports two fixed targets: **command-center** (`agentId=null`) and **ops-orchestrator**
- Also supports ad-hoc agent or meeting chats from within `/agents`
- Survives navigation, remains minimizable, closable, draggable

---

## Architecture: GlobalFloatingChatProvider (Option B)

### New file: `src/context/GlobalFloatingChatContext.tsx`

Context value:
```typescript
interface ChatConfig {
  agentId?: string | null;
  agentName?: string;
  agentIcon?: string;
  threadId?: string | null;
}

type Value = {
  isOpen: boolean;
  config: ChatConfig | null;
  openChat: (c: ChatConfig) => void;
  closeChat: () => void;
};
```

Exports: `GlobalFloatingChatProvider`, `GlobalChatMount`, `useGlobalChat`.

`GlobalChatMount` renders `<FloatingChatWindow key={config?.agentId ?? '__master__'} ...>`.  
The `key` forces a remount only when `agentId` changes (new target), resetting `useAgentChat` state. Reopening the same target keeps the existing component (and its thread/messages) alive.

### Mount point: `src/components/AppShell.tsx`

`GlobalFloatingChatProvider` wraps the entire shell content (inside `AuthProvider`). `GlobalChatMount` is placed after the `flex` div so it renders above all content.

---

## Component changes

### `FloatingChatWindow`
- Drag upgraded from mouse events + document listeners → pointer events with `setPointerCapture` (touch-compatible)
- No other behavioral changes — position/minimized state stays internal

### `DigitalHQ`
- Remove `onMasterChat`, `onOpsManagerChat` props
- Use `useGlobalChat()` directly inside the component
- Button 1: `💬 שיחה עם מרכז הפיקוד` → `openChat({ agentId: null, agentName: "מרכז הפיקוד", agentIcon: "🤖" })`
- Button 2: `📋 פנייה למנהל התפעול` → `openChat({ agentId: "ops-orchestrator", agentName: "מנהל התפעול", agentIcon: "📋" })`
- `onAgentChat: (agentId: string) => void` prop kept for room-card agent buttons

### `AgentCommandCenter/index.tsx`
- Remove: `chatOpen`, `chatAgentId`, `chatThreadId`, `chatTitle`, `chatIcon`, `activeMeeting` state
- Remove: `openMasterChat`, `openOpsManagerChat`, `openAgentChat`, `openMeetingChat` functions
- Remove: `FloatingChatWindow` import + render
- Remove: `onMasterChat`, `onOpsManagerChat` from `DigitalHQ` props
- Add: `useGlobalChat()` → pass `openChat` to `onAgentChat` and AgentRoom's `onChat`
- Header "שיחה עם מרכז הפיקוד" button → `openChat({ agentId: null, ... })`
- Meeting chat → `openChat({ agentId: null, threadId: meeting.thread_id, agentName: "פגישה: ...", agentIcon: "📅" })`

### `ChatDrawer.tsx`
- Delete (orphaned, no importers)

---

## Session persistence

| Scenario | Result |
|---|---|
| Open master chat, navigate to orders, come back | Window stays open ✓ |
| Open master chat, minimize, navigate, expand | Minimized state survives ✓ |
| Open master chat, close, reopen | Same key → same component → same thread ✓ |
| Open master chat, then open ops-manager chat | key changes → fresh component for ops-manager ✓ |
| Drag to new position, navigate, come back | Position survives (component never unmounts) ✓ |

---

## Constraints

- No full-screen drawer or backdrop
- No fake data, scans, tasks, or alerts
- TypeScript strict: no `any`, no implicit types
- Build must pass
