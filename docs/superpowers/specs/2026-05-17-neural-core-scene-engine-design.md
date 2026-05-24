# Neural Core Scene Engine — Design Spec

> **Historical document — identity migration note (2026-05-24):** Point-in-time design record. The central executive agent was later renamed ops-orchestrator -> ceo (id and type = ceo; Hebrew display name "מנהל תפעול"). Any ops-orchestrator reference below is the PRE-migration name of the current ceo agent and is NOT a live source of truth. All managerial routing (Jarvis, Telegram, WhatsApp, approvals, notifications, agent routing) now targets ceo.
**Date:** 2026-05-17  
**Status:** Approved  
**Figma file:** Elkayam Neural Operations Core (`xzKrhmGds0wUhHmy6Nh9ju`)

---

## Problem Statement

The current `NeuralOperationsCore` component uses a reference PNG (`public/neural-core/reference.png`) as its base layer with React overlays. Every label, pipe, panel, activity feed, dock, and department name is rasterized into the image. This creates:
- Duplicate UI when real React panels are added
- Impossible-to-maintain label correctness (e.g., Procurement → Coordination/QA required a pixel-level patch)
- Zero separation between visual art and live data

## Decision

**Pivot to a Figma-first React/SVG/CSS Scene Engine.** The reference PNGs become concept art only — never a runtime surface.

**The Procurement Rule:** Department names, Hebrew/English labels, KPI counts, activity feed rows, system health values, agent names/statuses — none of these may ever be rasterized into image pixels.

---

## Architecture: 7-Layer Scene System

```
z:0   SceneBackground     CSS gradient + radial glow + subtle grid
z:10  PipelineLayer       SVG paths with animated data packets
z:20  DepartmentPods      Per-department ellipse + live label + status ring
z:30  Special Entities    DataCoreEntity, OrchestratorEntity, MeetingRoomEntity
z:50  DataPackets         Animated SVG circles flowing along pipeline paths
z:60  Beacons / Speech    StatusBeacon (pulsing ring), SpeechIndicator (bubble)
z:100 UI Panels           SelectedEntityPanel, SystemHealthPanel, ActivityFeedPanel, CommandDock
```

---

## Color Tokens

| Entity | Color | Hex |
|---|---|---|
| Data Core | Cyan | `#00E5FF` |
| Orchestrator | Sky Blue | `#00C2FF` |
| CFO / Finance | Green | `#22C55E` |
| Graphics | Purple | `#A855F7` |
| Accounting | Blue | `#3B82F6` |
| Catalog / Products | Violet | `#8B5CF6` |
| Field Operations | Light Green | `#4ADE80` |
| Fabrication | Orange | `#F97316` |
| Coordination / QA | Teal | `#06B6D4` |
| Warehouse | Gold | `#FACC15` |
| Meeting Room | Sky | `#60A5FA` |
| Warning | Amber | `#FB923C` |
| Critical | Red | `#EF4444` |
| Response / Collab | Fuchsia | `#D946EF` |

**Backgrounds:** Scene `#020612` · Panel `rgba(2,6,18,0.92)` · Pod fill `rgba(0,10,25,0.9)`

---

## Scene Topology

Entities and their approximate positions on the 3:2 stage:

```
                      [ORCHESTRATOR]          ← top center, elevated
                           |
         [CFO]          [DATA CORE]        [GRAPHICS]
        [WAREHOUSE]                        [ACCOUNTING]
    [COORD/QA]  [FABRICATION]  [MEETING]  [FIELD OPS]  [CATALOG]
```

Pipeline connections (all route through Data Core):
- Orchestrator ↔ Data Core (cyan, primary, animated)
- CFO ↔ Data Core (green)
- Graphics ↔ Data Core (purple)
- Warehouse ↔ Data Core (gold)
- Accounting ↔ Data Core (blue)
- Coordination/QA ↔ Data Core (teal)
- Fabrication ↔ Data Core (orange)
- Field Ops ↔ Data Core (light green)
- Catalog ↔ Data Core (violet)

---

## Pipeline Event → Packet Color Mapping

| Event type | Packet color | Visual effect |
|---|---|---|
| `detection` | Cyan | Packet → Data Core or target |
| `action_taken` | Gold | Packet + dept glow burst |
| `exception` | Orange/Red | Packet + beacon pulse |
| `approval` | Green | Pulse → orchestrator highlight |
| `collaboration` | Purple | Packet + speech indicator |

---

## React Component Files (23 total)

**Scene containers** (`NeuralCoreScene/`)
- `NeuralCoreScene.tsx` — root, owns state + WebSocket/poll
- `SceneStage.tsx` — 3:2 aspect ratio container, clipping
- `SceneBackground.tsx` — CSS gradient, grid, radial glow
- `PipelineLayer.tsx` — all SVG paths

**Scene entities**
- `DepartmentPod.tsx` — ellipse + Hebrew/English label + status ring (variant per dept)
- `DataCoreEntity.tsx` — pulsing ellipse, central hub
- `OrchestratorEntity.tsx` — elevated pod, larger glow
- `MeetingRoomEntity.tsx` — dashed border variant
- `AgentEntity.tsx` — avatar circle positioned on its pod

**Pipeline + animation**
- `PipelinePath.tsx` — single SVG path with glow stroke
- `DataPacket.tsx` — animated circle traveling a path
- `EnergyPulse.tsx` — radial burst on event
- `StatusBeacon.tsx` — pulsing ring anchored to pod
- `SpeechIndicator.tsx` — speech bubble above agent

**UI panels**
- `SelectedEntityPanel.tsx` — right-side detail on click
- `SystemHealthPanel.tsx` — top-right health metrics
- `ActivityFeedPanel.tsx` — bottom live event feed
- `CommandDock.tsx` — bottom action bar

**Config + state**
- `scene-config.ts` — pod positions, pipeline topology
- `pipeline-config.ts` — event→color mappings
- `entity-state.ts` — per-pod state type
- `animation-events.ts` — event queue management
- `asset-manifest.ts` — SVG export paths

---

## Canonical Department List

| ID | Hebrew | English | Color |
|---|---|---|---|
| `ops-orchestrator` | מנהל תפעול ראשי | Operations Orchestrator | `#00C2FF` |
| `cfo-agent` | מנהל כספים | CFO / Finance | `#22C55E` |
| `billing-collections-agent` | הנהלת חשבונות | Accounting | `#3B82F6` |
| `inventory-agent` | מחסן | Warehouse | `#FACC15` |
| `graphics-production-agent` | מחלקת גרפיקה | Graphics | `#A855F7` |
| `catalog-pricing-agent` | קטלוג מוצרים | Catalog / Products | `#8B5CF6` |
| `field-ops-agent` | עבודות שטח | Field Operations | `#4ADE80` |
| `fabrication-agent` | מחלקת מסגרייה | Fabrication | `#F97316` |
| `coordination-qa-agent` | מחלקת תיאומים ו-QA | Coordination / QA | `#06B6D4` |

**PROCUREMENT / רכש does not appear anywhere in the Neural Core.**

---

## Agent Status States (8)

`idle` · `active` · `speaking` · `typing` · `warning` · `critical` · `approval` · `inMeeting`

---

## Build Phases

**Phase A — Scene Engine Skeleton**
- `SceneBackground`, `PipelineLayer`, `DepartmentPod` (geometric SVG), `StatusBeacon`, `CommandDock`, `SystemHealthPanel`
- No new assets required
- Old `NeuralOperationsCore` stays as fallback (not deleted yet)

**Phase B — Entities + Animation**
- `DataCoreEntity`, `OrchestratorEntity`, `DataPacket`, `SpeechIndicator`, `ActivityFeedPanel`, `SelectedEntityPanel`
- SVG exports from Figma page 05 integrated

**Phase C — Full Live Scene**
- Agent avatars, isometric pod art
- Embedded department modules (orders, inventory, CFO panels opening inside scene)
- Full live data wired

---

## Figma File Structure

| Page | Purpose |
|---|---|
| 01 Design Tokens | 11 dept colors + 8 status/system colors + 5 pipeline events + typography scale |
| 02 Scene Layout | Full scene topology, 11 entity pods, all pipeline paths, layer legend, Procurement Rule banner |
| 03 Components | 23-file component inventory, 8 agent state swatches, build phase roadmap |

> Note: Starter plan is limited to 3 pages. Original 6-page plan consolidated here.

---

## Constraints

- No new npm dependencies until Phase C (no Phaser, Three.js, PixiJS, Rive, Lottie, Framer Motion yet)
- No DB changes, no migrations
- All Hebrew and English text must remain React text nodes
- `NeuralOperationsCore.tsx` is not deleted until Phase A replacement is ready
- No Procurement / רכש label anywhere
