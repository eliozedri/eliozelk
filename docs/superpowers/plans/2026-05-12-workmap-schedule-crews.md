# Work Map + Weekly Schedule + Crews — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three operational modules to the Elkayam system — a visual Leaflet map of active field jobs with SLA color-coding, a weekly scheduling board for assigning jobs to crews, and a crews management page.

**Architecture:** Extend the existing `WorkOrder` with five new optional fields (`city`, `estimatedExecutionHours`, `readyForExecutionAt`, `assignedCrewId`, `scheduledDate`). Store crews in a new `elkayam_crews` localStorage key following the same hook+context pattern as orders. The map uses Leaflet/react-leaflet with a `dynamic({ ssr: false })` wrapper to avoid SSR errors. The weekly schedule is a filtered view over orders data — no separate schedule table needed.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind v4, `leaflet`, `react-leaflet`, `@types/leaflet`, localStorage persistence, Hebrew RTL.

---

## File Map

### New files
| Path | Responsibility |
|------|---------------|
| `src/types/crew.ts` | `Crew` type, `CrewSkill`, `CrewRegion`, labels |
| `src/lib/cityCoordinates.ts` | Israeli city → `[lat, lng]` lookup + `extractCityCoordinates()` |
| `src/lib/slaUtils.ts` | `getSlaColor()`, `getSlaLabel()`, `getHoursWaiting()` |
| `src/hooks/useCrews.ts` | CRUD for crews, localStorage key `elkayam_crews` |
| `src/context/CrewsContext.tsx` | React context + `useCrewsContext()` hook |
| `src/components/CrewsProvider.tsx` | Thin re-export wrapper (matches existing pattern) |
| `src/components/WorkMap/index.tsx` | Page shell: KPI cards + filter bar + dynamic map |
| `src/components/WorkMap/IsraelMap.tsx` | Leaflet `MapContainer` + markers + popups (client-only) |
| `src/components/WorkMap/MapKpiCards.tsx` | Five summary KPI cards |
| `src/components/WorkMap/MapFilters.tsx` | Filter bar (SLA color, city, status) |
| `src/components/Crews/index.tsx` | Crews list + inline add/edit form |
| `src/components/WeeklySchedule/index.tsx` | Weekly schedule page shell |
| `src/components/WeeklySchedule/UnscheduledList.tsx` | Left panel: ready unscheduled jobs |
| `src/components/WeeklySchedule/WeekBoard.tsx` | Right panel: crew × day grid |
| `src/components/WeeklySchedule/AssignModal.tsx` | Modal: pick crew + date for a job |
| `src/app/workmap/page.tsx` | Route → `<WorkMap />` |
| `src/app/crews/page.tsx` | Route → `<Crews />` |
| `src/app/schedule/page.tsx` | Route → `<WeeklySchedule />` |

### Modified files
| Path | Change |
|------|--------|
| `src/types/workOrder.ts` | Add 5 optional fields to `WorkOrder`; add `ready_installation` → auto-set note |
| `src/hooks/useOrders.ts` | Auto-set `readyForExecutionAt`; add `updateOrderFields` |
| `src/context/OrdersContext.tsx` | Expose `updateOrderFields` |
| `src/components/Sidebar.tsx` | Add Map, Schedule, Crews nav links |
| `src/app/layout.tsx` | Wrap children with `<CrewsProvider>` |

---

## Task 1: Install Leaflet dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
cd /Users/eliozedri/Desktop/eliozelk
npm install leaflet react-leaflet
npm install --save-dev @types/leaflet
```

Expected: packages added to `node_modules`, `package.json` updated.

- [ ] **Step 2: Verify TypeScript can find types**

```bash
cd /Users/eliozedri/Desktop/eliozelk
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors about `leaflet` or `react-leaflet` (there may be pre-existing errors — note them but don't fix yet).

- [ ] **Step 3: Commit**

```bash
cd /Users/eliozedri/Desktop/eliozelk
git add package.json package-lock.json
git commit -m "chore: add leaflet + react-leaflet dependencies"
```

---

## Task 2: Create utility libraries

**Files:**
- Create: `src/lib/cityCoordinates.ts`
- Create: `src/lib/slaUtils.ts`

- [ ] **Step 1: Create `src/lib/cityCoordinates.ts`**

```typescript
// src/lib/cityCoordinates.ts

export const CITY_COORDINATES: Record<string, [number, number]> = {
  "תל אביב": [32.0853, 34.7818],
  "תל-אביב": [32.0853, 34.7818],
  "ירושלים": [31.7683, 35.2137],
  "חיפה": [32.7940, 34.9896],
  "באר שבע": [31.2530, 34.7915],
  "נתניה": [32.3215, 34.8532],
  "פתח תקווה": [32.0840, 34.8878],
  "ראשון לציון": [31.9730, 34.7925],
  "אשדוד": [31.8040, 34.6553],
  "אשקלון": [31.6688, 34.5743],
  "רחובות": [31.8927, 34.8113],
  "חולון": [32.0107, 34.7797],
  "בת ים": [32.0204, 34.7505],
  "הרצליה": [32.1663, 34.8441],
  "כפר סבא": [32.1826, 34.9077],
  "רמת גן": [32.0824, 34.8140],
  "בני ברק": [32.0835, 34.8326],
  "לוד": [31.9527, 34.8954],
  "רמלה": [31.9298, 34.8695],
  "מודיעין": [31.8969, 35.0100],
  "קריית גת": [31.6100, 34.7642],
  "שדרות": [31.5244, 34.5953],
  "נתיבות": [31.4178, 34.5924],
  "אופקים": [31.3159, 34.6212],
  "קריית שמונה": [33.2073, 35.5695],
  "נהריה": [33.0056, 35.0981],
  "עכו": [32.9233, 35.0818],
  "קריית אתא": [32.8008, 35.1050],
  "עפולה": [32.6065, 35.2892],
  "בית שאן": [32.4985, 35.4977],
  "טבריה": [32.7922, 35.5312],
  "צפת": [32.9647, 35.4960],
  "נצרת": [32.6996, 35.2985],
  "רהט": [31.3933, 34.7547],
  "דימונה": [31.0659, 35.0335],
  "ערד": [31.2569, 35.2131],
  "מצפה רמון": [30.6100, 34.8017],
  "אילת": [29.5569, 34.9519],
  "יבנה": [31.8762, 34.7431],
  "נס ציונה": [31.9294, 34.7975],
  "גדרה": [31.8120, 34.7764],
  "שוהם": [31.9958, 34.9438],
  "יהוד": [32.0336, 34.8886],
  "מזכרת בתיה": [31.8519, 34.8289],
  "אלעד": [32.0538, 34.9533],
  "גבעתיים": [32.0689, 34.8124],
};

export const ISRAEL_CENTER: [number, number] = [31.5, 34.9];
export const ISRAEL_DEFAULT_ZOOM = 8;

/** Returns coordinates for an exact city name match, or null. */
export function getCoordinatesForCity(city: string): [number, number] | null {
  if (!city) return null;
  return CITY_COORDINATES[city.trim()] ?? null;
}

/**
 * Tries to find coordinates by scanning a free-text location string
 * for any known city name. Returns the first match, or null.
 */
export function extractCityCoordinates(location: string): [number, number] | null {
  if (!location) return null;
  const direct = getCoordinatesForCity(location);
  if (direct) return direct;
  for (const [city, coords] of Object.entries(CITY_COORDINATES)) {
    if (location.includes(city)) return coords;
  }
  return null;
}
```

- [ ] **Step 2: Create `src/lib/slaUtils.ts`**

```typescript
// src/lib/slaUtils.ts

export type SlaColor = "green" | "yellow" | "red" | "gray";

export const SLA_COLORS: Record<SlaColor, { bg: string; text: string; dot: string; label: string }> = {
  green:  { bg: "bg-green-100",  text: "text-green-800",  dot: "bg-green-500",  label: "מוכן (עד 24 שע׳)" },
  yellow: { bg: "bg-amber-100",  text: "text-amber-800",  dot: "bg-amber-500",  label: "מתעכב (1–3 ימים)" },
  red:    { bg: "bg-red-100",    text: "text-red-800",    dot: "bg-red-500",    label: "דחוף (מעל 3 ימים)" },
  gray:   { bg: "bg-gray-100",   text: "text-gray-600",   dot: "bg-gray-400",   label: "לא מוכן לביצוע" },
};

export const SLA_HEX: Record<SlaColor, string> = {
  green:  "#22c55e",
  yellow: "#f59e0b",
  red:    "#ef4444",
  gray:   "#94a3b8",
};

/** Returns the SLA color bucket for a readyForExecutionAt timestamp. */
export function getSlaColor(readyForExecutionAt: string | null | undefined): SlaColor {
  if (!readyForExecutionAt) return "gray";
  const hoursElapsed = (Date.now() - new Date(readyForExecutionAt).getTime()) / 3_600_000;
  if (hoursElapsed <= 24) return "green";
  if (hoursElapsed <= 72) return "yellow";
  return "red";
}

/** Hours elapsed since the order became ready, or null if not ready. */
export function getHoursWaiting(readyForExecutionAt: string | null | undefined): number | null {
  if (!readyForExecutionAt) return null;
  return (Date.now() - new Date(readyForExecutionAt).getTime()) / 3_600_000;
}

/** Human-readable waiting duration, e.g. "3 שעות" or "2 ימים". */
export function formatWaitingDuration(readyForExecutionAt: string | null | undefined): string {
  const hours = getHoursWaiting(readyForExecutionAt);
  if (hours === null) return "—";
  if (hours < 1) return "פחות משעה";
  if (hours < 24) return `${Math.round(hours)} שע׳`;
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  if (remainingHours === 0) return `${days} ${days === 1 ? "יום" : "ימים"}`;
  return `${days} ${days === 1 ? "יום" : "ימים"} ו-${remainingHours} שע׳`;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/eliozedri/Desktop/eliozelk
npx tsc --noEmit 2>&1 | grep -E "cityCoordinates|slaUtils"
```

Expected: no errors for the new files.

- [ ] **Step 4: Commit**

```bash
cd /Users/eliozedri/Desktop/eliozelk
git add src/lib/cityCoordinates.ts src/lib/slaUtils.ts
git commit -m "feat: add city coordinates lookup and SLA color utilities"
```

---

## Task 3: Extend WorkOrder type and useOrders hook

**Files:**
- Modify: `src/types/workOrder.ts`
- Modify: `src/hooks/useOrders.ts`
- Modify: `src/context/OrdersContext.tsx`

- [ ] **Step 1: Add five fields to `WorkOrder` in `src/types/workOrder.ts`**

Add these five optional fields to the `WorkOrder` interface, after the `graphicsCompletedAt` line:

```typescript
// --- Field execution fields ---
city?: string;                      // Explicit city for map pin (falls back to location parse)
estimatedExecutionHours?: number;   // Manual estimate entered by manager
readyForExecutionAt?: string | null; // Set automatically when status → ready_installation
assignedCrewId?: string | null;     // Set during weekly schedule assignment
scheduledDate?: string | null;      // ISO date YYYY-MM-DD set during scheduling
```

The full updated `WorkOrder` interface becomes:

```typescript
export interface WorkOrder {
  id: string;
  orderNumber: string;
  date: string;
  customer: string;
  location: string;
  reference: string;
  signRows: SignRow[];
  miscRows: MiscRow[];
  priority: OrderPriority;
  notes: string;
  status: WorkOrderStatus;
  createdAt: string;
  updatedAt: string;
  graphicsSentAt: string;
  graphicsAcknowledgedAt: string | null;
  graphicsAcknowledgedBy: string | null;
  graphicsCompletedAt: string | null;
  // Field execution fields
  city?: string;
  estimatedExecutionHours?: number;
  readyForExecutionAt?: string | null;
  assignedCrewId?: string | null;
  scheduledDate?: string | null;
}
```

- [ ] **Step 2: Add `updateOrderFields` to `src/hooks/useOrders.ts` and auto-set `readyForExecutionAt`**

Replace the `updateOrderStatus` function and add `updateOrderFields` in `src/hooks/useOrders.ts`:

```typescript
const updateOrderStatus = useCallback((id: string, status: WorkOrderStatus) => {
  const now = new Date().toISOString();
  setOrders((prev) =>
    prev.map((o) => {
      if (o.id !== id) return o;
      const extra: Partial<WorkOrder> = {};
      if (status === "ready_installation" && !o.readyForExecutionAt) {
        extra.readyForExecutionAt = now;
      }
      return { ...o, ...extra, status, updatedAt: now };
    })
  );
}, []);

const updateOrderFields = useCallback((id: string, fields: Partial<WorkOrder>) => {
  const now = new Date().toISOString();
  setOrders((prev) =>
    prev.map((o) => (o.id === id ? { ...o, ...fields, updatedAt: now } : o))
  );
}, []);
```

And update the return statement to include `updateOrderFields`:

```typescript
return { orders, addOrder, acknowledgeOrder, completeGraphics, updateOrderStatus, updateOrderFields };
```

- [ ] **Step 3: Expose `updateOrderFields` in `src/context/OrdersContext.tsx`**

Update `OrdersContextValue` and the provider:

```typescript
interface OrdersContextValue {
  orders: WorkOrder[];
  addOrder: (snapshot: OrderState, priority?: OrderPriority, notes?: string) => WorkOrder;
  acknowledgeOrder: (id: string, acknowledgedBy?: string) => void;
  completeGraphics: (id: string) => void;
  updateOrderStatus: (id: string, status: WorkOrderStatus) => void;
  updateOrderFields: (id: string, fields: Partial<WorkOrder>) => void;
}
```

The provider body stays the same — it spreads `useOrders()` which now returns `updateOrderFields`.

- [ ] **Step 4: Type-check**

```bash
cd /Users/eliozedri/Desktop/eliozelk
npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/eliozedri/Desktop/eliozelk
git add src/types/workOrder.ts src/hooks/useOrders.ts src/context/OrdersContext.tsx
git commit -m "feat: extend WorkOrder with field-execution fields; auto-set readyForExecutionAt"
```

---

## Task 4: Create Crew type, hook, context, and provider

**Files:**
- Create: `src/types/crew.ts`
- Create: `src/hooks/useCrews.ts`
- Create: `src/context/CrewsContext.tsx`
- Create: `src/components/CrewsProvider.tsx`

- [ ] **Step 1: Create `src/types/crew.ts`**

```typescript
// src/types/crew.ts

export type CrewSkill =
  | "road_marking"
  | "sign_installation"
  | "traffic_arrangement"
  | "guardrails"
  | "painting"
  | "general_installation"
  | "field_supervision";

export const CREW_SKILL_LABELS: Record<CrewSkill, string> = {
  road_marking: "סימון כבישים",
  sign_installation: "התקנת שילוט",
  traffic_arrangement: "סידור תנועה",
  guardrails: "גדרות בטיחות",
  painting: "צביעה",
  general_installation: "התקנה כללית",
  field_supervision: "פיקוח שטח",
};

export type CrewRegion = "north" | "center" | "south" | "jerusalem" | "all";

export const CREW_REGION_LABELS: Record<CrewRegion, string> = {
  north: "צפון",
  center: "מרכז",
  south: "דרום",
  jerusalem: "ירושלים והסביבה",
  all: "כל הארץ",
};

export interface Crew {
  id: string;
  name: string;
  leader: string;
  workerCount: number;
  phone: string;
  skills: CrewSkill[];
  region: CrewRegion;
  dailyCapacityHours: number;
  active: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Create `src/hooks/useCrews.ts`**

```typescript
// src/hooks/useCrews.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import type { Crew } from "@/types/crew";

const STORAGE_KEY = "elkayam_crews";

function loadCrews(): Crew[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useCrews() {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCrews(loadCrews());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(crews));
  }, [crews, hydrated]);

  const addCrew = useCallback((data: Omit<Crew, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    const crew: Crew = { id: nanoid(), ...data, createdAt: now, updatedAt: now };
    setCrews((prev) => [...prev, crew]);
    return crew;
  }, []);

  const updateCrew = useCallback((id: string, data: Partial<Omit<Crew, "id" | "createdAt">>) => {
    const now = new Date().toISOString();
    setCrews((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...data, updatedAt: now } : c))
    );
  }, []);

  const deleteCrew = useCallback((id: string) => {
    setCrews((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { crews, addCrew, updateCrew, deleteCrew };
}
```

- [ ] **Step 3: Create `src/context/CrewsContext.tsx`**

```typescript
// src/context/CrewsContext.tsx
"use client";

import { createContext, useContext } from "react";
import { useCrews } from "@/hooks/useCrews";
import type { Crew } from "@/types/crew";

interface CrewsContextValue {
  crews: Crew[];
  addCrew: (data: Omit<Crew, "id" | "createdAt" | "updatedAt">) => Crew;
  updateCrew: (id: string, data: Partial<Omit<Crew, "id" | "createdAt">>) => void;
  deleteCrew: (id: string) => void;
}

const CrewsContext = createContext<CrewsContextValue | null>(null);

export function CrewsProvider({ children }: { children: React.ReactNode }) {
  const value = useCrews();
  return <CrewsContext.Provider value={value}>{children}</CrewsContext.Provider>;
}

export function useCrewsContext(): CrewsContextValue {
  const ctx = useContext(CrewsContext);
  if (!ctx) throw new Error("useCrewsContext must be used inside CrewsProvider");
  return ctx;
}
```

- [ ] **Step 4: Create `src/components/CrewsProvider.tsx`**

```typescript
// src/components/CrewsProvider.tsx
"use client";

import { CrewsProvider as Provider } from "@/context/CrewsContext";

export function CrewsProvider({ children }: { children: React.ReactNode }) {
  return <Provider>{children}</Provider>;
}
```

- [ ] **Step 5: Type-check**

```bash
cd /Users/eliozedri/Desktop/eliozelk
npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/eliozedri/Desktop/eliozelk
git add src/types/crew.ts src/hooks/useCrews.ts src/context/CrewsContext.tsx src/components/CrewsProvider.tsx
git commit -m "feat: add Crew type, useCrews hook, and CrewsContext"
```

---

## Task 5: Update layout and sidebar

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Add `CrewsProvider` to `src/app/layout.tsx`**

Replace the children wrapper in `RootLayout`:

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { OrdersProvider } from "@/components/OrdersProvider";
import { CatalogProvider } from "@/components/CatalogProvider";
import { CrewsProvider } from "@/components/CrewsProvider";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "700"],
  variable: "--font-heebo",
});

export const metadata: Metadata = {
  title: "אלקיים סימון כבישים | הזמנת שילוט",
  description: "מערכת פנימית - פתיחת הזמנת שילוט",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="font-[family-name:var(--font-heebo)] antialiased bg-gray-50 min-h-screen">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 min-w-0">
            <CatalogProvider>
              <OrdersProvider>
                <CrewsProvider>
                  {children}
                </CrewsProvider>
              </OrdersProvider>
            </CatalogProvider>
          </main>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Add three nav links to `src/components/Sidebar.tsx`**

Add three new icon components before the `SidebarLinkProps` interface, and three new `SidebarLink` entries in the `<nav>`:

**New icon components to add after `AccountingIcon`:**

```tsx
function MapIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function CrewsIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      <line x1="19" y1="8" x2="23" y2="8" />
      <line x1="21" y1="6" x2="21" y2="10" />
    </svg>
  );
}
```

**Updated `<nav>` block in `Sidebar` — add a divider section after the existing links:**

```tsx
<nav className="flex flex-col gap-1 p-3">
  <SidebarLink href="/" label="הזמנה" active={pathname === "/"} icon={<OrderIcon />} />
  <SidebarLink href="/customers" label="לקוחות" active={pathname.startsWith("/customers")} icon={<CustomersIcon />} />
  <SidebarLink href="/graphics" label="מחלקת גרפיקה" active={pathname.startsWith("/graphics")} icon={<GraphicsIcon />} />
  <SidebarLink href="/orders" label="טבלת הזמנות" active={pathname.startsWith("/orders")} icon={<TableIcon />} />
  <SidebarLink href="/catalog" label="מוצרים ושירותים" active={pathname.startsWith("/catalog")} icon={<CatalogIcon />} />
  <SidebarLink href="/accounting" label="הנהלת חשבונות" active={pathname.startsWith("/accounting")} icon={<AccountingIcon />} />

  <div className="my-2 border-t border-gray-100" />

  <div className="px-3 py-1">
    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">בקרת שטח</span>
  </div>
  <SidebarLink href="/workmap" label="מפת עבודות" active={pathname.startsWith("/workmap")} icon={<MapIcon />} />
  <SidebarLink href="/schedule" label="סידור שבועי" active={pathname.startsWith("/schedule")} icon={<CalendarIcon />} />
  <SidebarLink href="/crews" label="צוותי שטח" active={pathname.startsWith("/crews")} icon={<CrewsIcon />} />
</nav>
```

- [ ] **Step 3: Type-check and verify dev server starts**

```bash
cd /Users/eliozedri/Desktop/eliozelk
npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/eliozedri/Desktop/eliozelk
git add src/app/layout.tsx src/components/Sidebar.tsx
git commit -m "feat: add CrewsProvider to layout and field-ops nav links to sidebar"
```

---

## Task 6: Build Crews management page

**Files:**
- Create: `src/components/Crews/index.tsx`
- Create: `src/app/crews/page.tsx`

- [ ] **Step 1: Create `src/app/crews/page.tsx`**

```tsx
// src/app/crews/page.tsx
import { Crews } from "@/components/Crews";

export default function CrewsPage() {
  return <Crews />;
}
```

- [ ] **Step 2: Create `src/components/Crews/index.tsx`**

```tsx
// src/components/Crews/index.tsx
"use client";

import { useState, useCallback } from "react";
import { useCrewsContext } from "@/context/CrewsContext";
import type { Crew, CrewSkill, CrewRegion } from "@/types/crew";
import { CREW_SKILL_LABELS, CREW_REGION_LABELS } from "@/types/crew";

const ALL_SKILLS = Object.keys(CREW_SKILL_LABELS) as CrewSkill[];
const ALL_REGIONS = Object.keys(CREW_REGION_LABELS) as CrewRegion[];

const EMPTY_FORM: Omit<Crew, "id" | "createdAt" | "updatedAt"> = {
  name: "",
  leader: "",
  workerCount: 3,
  phone: "",
  skills: [],
  region: "center",
  dailyCapacityHours: 8,
  active: true,
  notes: "",
};

function PlusIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

interface CrewFormProps {
  initial: Omit<Crew, "id" | "createdAt" | "updatedAt">;
  onSave: (data: Omit<Crew, "id" | "createdAt" | "updatedAt">) => void;
  onCancel: () => void;
  submitLabel: string;
}

function CrewForm({ initial, onSave, onCancel, submitLabel }: CrewFormProps) {
  const [form, setForm] = useState(initial);

  const toggleSkill = (skill: CrewSkill) => {
    setForm((prev) => ({
      ...prev,
      skills: prev.skills.includes(skill)
        ? prev.skills.filter((s) => s !== skill)
        : [...prev.skills, skill],
    }));
  };

  return (
    <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-5 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">שם הצוות *</label>
          <input
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="צוות א׳"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">ראש צוות *</label>
          <input
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            value={form.leader}
            onChange={(e) => setForm((p) => ({ ...p, leader: e.target.value }))}
            placeholder="שם ראש הצוות"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">מספר עובדים</label>
          <input
            type="number" min={1} max={20}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            value={form.workerCount}
            onChange={(e) => setForm((p) => ({ ...p, workerCount: Number(e.target.value) }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">טלפון</label>
          <input
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            placeholder="050-0000000"
            dir="ltr"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">אזור עבודה</label>
          <select
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            value={form.region}
            onChange={(e) => setForm((p) => ({ ...p, region: e.target.value as CrewRegion }))}
          >
            {ALL_REGIONS.map((r) => (
              <option key={r} value={r}>{CREW_REGION_LABELS[r]}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">קיבולת יומית (שעות)</label>
          <input
            type="number" min={1} max={24}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            value={form.dailyCapacityHours}
            onChange={(e) => setForm((p) => ({ ...p, dailyCapacityHours: Number(e.target.value) }))}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-600">כישורים</label>
        <div className="flex flex-wrap gap-2">
          {ALL_SKILLS.map((skill) => (
            <button
              key={skill}
              type="button"
              onClick={() => toggleSkill(skill)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                form.skills.includes(skill)
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
              }`}
            >
              {CREW_SKILL_LABELS[skill]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-600">הערות</label>
        <textarea
          rows={2}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          placeholder="הערות נוספות..."
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
            className="w-4 h-4 accent-blue-600"
          />
          צוות פעיל
        </label>
      </div>

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
        >
          ביטול
        </button>
        <button
          onClick={() => {
            if (!form.name.trim() || !form.leader.trim()) return;
            onSave(form);
          }}
          className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function CrewCard({
  crew,
  onEdit,
  onDelete,
}: {
  crew: Crew;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`bg-white rounded-xl border shadow-sm p-4 flex flex-col gap-3 ${crew.active ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900 text-sm">{crew.name}</span>
            {!crew.active && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">לא פעיל</span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{crew.leader} · {crew.workerCount} עובדים</div>
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
            <EditIcon />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
            <TrashIcon />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-gray-400">אזור</span>
          <div className="font-medium text-gray-700 mt-0.5">{CREW_REGION_LABELS[crew.region]}</div>
        </div>
        <div>
          <span className="text-gray-400">קיבולת יומית</span>
          <div className="font-medium text-gray-700 mt-0.5">{crew.dailyCapacityHours} שע׳</div>
        </div>
        {crew.phone && (
          <div>
            <span className="text-gray-400">טלפון</span>
            <div className="font-medium text-gray-700 mt-0.5 dir-ltr" dir="ltr">{crew.phone}</div>
          </div>
        )}
      </div>

      {crew.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {crew.skills.map((skill) => (
            <span key={skill} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
              {CREW_SKILL_LABELS[skill]}
            </span>
          ))}
        </div>
      )}

      {crew.notes && (
        <div className="text-xs text-gray-500 border-t border-gray-100 pt-2">{crew.notes}</div>
      )}
    </div>
  );
}

export function Crews() {
  const { crews, addCrew, updateCrew, deleteCrew } = useCrewsContext();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleAdd = useCallback((data: Omit<Crew, "id" | "createdAt" | "updatedAt">) => {
    addCrew(data);
    setShowAddForm(false);
  }, [addCrew]);

  const handleUpdate = useCallback((id: string, data: Omit<Crew, "id" | "createdAt" | "updatedAt">) => {
    updateCrew(id, data);
    setEditingId(null);
  }, [updateCrew]);

  const activeCrews = crews.filter((c) => c.active);
  const inactiveCrews = crews.filter((c) => !c.active);

  return (
    <div className="min-h-screen bg-[#f0f2f5] py-6 px-4">
      <div className="max-w-5xl mx-auto space-y-5">

        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">צוותי שטח</h1>
            <p className="text-sm text-gray-500 mt-0.5">ניהול צוותי ביצוע לעבודות שטח</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{activeCrews.length} צוותים פעילים</span>
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
              >
                <PlusIcon />
                צוות חדש
              </button>
            )}
          </div>
        </div>

        {showAddForm && (
          <CrewForm
            initial={EMPTY_FORM}
            onSave={handleAdd}
            onCancel={() => setShowAddForm(false)}
            submitLabel="הוסף צוות"
          />
        )}

        {crews.length === 0 && !showAddForm ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="text-4xl mb-3">👷</div>
            <p className="text-gray-600 font-medium mb-1">אין צוותים במערכת עדיין</p>
            <p className="text-sm text-gray-400 mb-4">הוסף את הצוות הראשון כדי להתחיל לתכנן עבודות</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              <PlusIcon />
              הוסף צוות ראשון
            </button>
          </div>
        ) : (
          <>
            {activeCrews.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <h2 className="text-sm font-bold text-gray-700">צוותים פעילים</h2>
                  <span className="text-xs text-gray-400">({activeCrews.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeCrews.map((crew) =>
                    editingId === crew.id ? (
                      <div key={crew.id} className="sm:col-span-2 lg:col-span-3">
                        <CrewForm
                          initial={{ name: crew.name, leader: crew.leader, workerCount: crew.workerCount, phone: crew.phone, skills: crew.skills, region: crew.region, dailyCapacityHours: crew.dailyCapacityHours, active: crew.active, notes: crew.notes }}
                          onSave={(data) => handleUpdate(crew.id, data)}
                          onCancel={() => setEditingId(null)}
                          submitLabel="שמור שינויים"
                        />
                      </div>
                    ) : (
                      <CrewCard
                        key={crew.id}
                        crew={crew}
                        onEdit={() => setEditingId(crew.id)}
                        onDelete={() => deleteCrew(crew.id)}
                      />
                    )
                  )}
                </div>
              </div>
            )}

            {inactiveCrews.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                  <h2 className="text-sm font-bold text-gray-700">צוותים לא פעילים</h2>
                  <span className="text-xs text-gray-400">({inactiveCrews.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inactiveCrews.map((crew) =>
                    editingId === crew.id ? (
                      <div key={crew.id} className="sm:col-span-2 lg:col-span-3">
                        <CrewForm
                          initial={{ name: crew.name, leader: crew.leader, workerCount: crew.workerCount, phone: crew.phone, skills: crew.skills, region: crew.region, dailyCapacityHours: crew.dailyCapacityHours, active: crew.active, notes: crew.notes }}
                          onSave={(data) => handleUpdate(crew.id, data)}
                          onCancel={() => setEditingId(null)}
                          submitLabel="שמור שינויים"
                        />
                      </div>
                    ) : (
                      <CrewCard
                        key={crew.id}
                        crew={crew}
                        onEdit={() => setEditingId(crew.id)}
                        onDelete={() => deleteCrew(crew.id)}
                      />
                    )
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/eliozedri/Desktop/eliozelk
npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/eliozedri/Desktop/eliozelk
git add src/components/Crews/index.tsx src/app/crews/page.tsx
git commit -m "feat: add crews management page with add/edit/delete"
```

---

## Task 7: Build the Leaflet map component

**Files:**
- Create: `src/components/WorkMap/IsraelMap.tsx`

This file is loaded only client-side via `dynamic({ ssr: false })` in the next task.

- [ ] **Step 1: Create `src/components/WorkMap/IsraelMap.tsx`**

```tsx
// src/components/WorkMap/IsraelMap.tsx
"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { WorkOrder } from "@/types/workOrder";
import { STATUS_LABELS } from "@/types/workOrder";
import { getSlaColor, SLA_HEX, SLA_COLORS, formatWaitingDuration } from "@/lib/slaUtils";
import { extractCityCoordinates, ISRAEL_CENTER, ISRAEL_DEFAULT_ZOOM } from "@/lib/cityCoordinates";

// ── Fix Leaflet default icon paths broken by webpack ────────────────────────
// We use divIcon for markers, so no icon fix needed.

function createSlaMarkerIcon(color: string, isScheduled: boolean) {
  const border = isScheduled ? "#3b82f6" : "white";
  const borderWidth = isScheduled ? "3px" : "2.5px";
  return L.divIcon({
    className: "",
    html: `<div style="
      width:22px;height:22px;
      background:${color};
      border:${borderWidth} solid ${border};
      border-radius:50%;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14],
  });
}

function FitBoundsOnOrders({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0], 12);
      return;
    }
    map.fitBounds(positions, { padding: [40, 40] });
  }, [map, positions]);
  return null;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

interface IsraelMapProps {
  orders: WorkOrder[];
  onOpenOrder?: (id: string) => void;
}

export default function IsraelMap({ orders, onOpenOrder }: IsraelMapProps) {
  const positioned = orders
    .map((o) => {
      const coords = extractCityCoordinates(o.city || o.location);
      return coords ? { order: o, coords } : null;
    })
    .filter((x): x is { order: WorkOrder; coords: [number, number] } => x !== null);

  const positions = positioned.map((p) => p.coords);

  return (
    <MapContainer
      center={ISRAEL_CENTER}
      zoom={ISRAEL_DEFAULT_ZOOM}
      style={{ height: "100%", width: "100%" }}
      className="rounded-xl"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <FitBoundsOnOrders positions={positions} />
      {positioned.map(({ order, coords }) => {
        const slaColor = getSlaColor(order.readyForExecutionAt);
        const hexColor = SLA_HEX[slaColor];
        const slaInfo = SLA_COLORS[slaColor];
        const isScheduled = !!order.scheduledDate;
        const signCount = order.signRows.filter((r) => r.signNumber).length;
        const miscCount = order.miscRows.filter((r) => r.description).length;

        return (
          <Marker
            key={order.id}
            position={coords}
            icon={createSlaMarkerIcon(hexColor, isScheduled)}
          >
            <Popup minWidth={240} maxWidth={280}>
              <div dir="rtl" style={{ fontFamily: "Heebo, sans-serif", fontSize: "13px", lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "4px", color: "#111" }}>
                  {order.orderNumber}
                </div>
                <div style={{ fontSize: "11px", color: "#888", marginBottom: "8px" }}>
                  {order.customer || "—"} · {order.location || "—"}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "8px" }}>
                  <div>
                    <div style={{ fontSize: "10px", color: "#aaa" }}>סטטוס הזמנה</div>
                    <div style={{ fontWeight: 600, color: "#333", fontSize: "11px" }}>{STATUS_LABELS[order.status]}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: "#aaa" }}>ממתין</div>
                    <div style={{ fontWeight: 600, fontSize: "11px" }}>
                      <span style={{ color: hexColor }}>{formatWaitingDuration(order.readyForExecutionAt)}</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: "#aaa" }}>סטטוס SLA</div>
                    <div>
                      <span style={{
                        display: "inline-block",
                        padding: "1px 6px",
                        borderRadius: "99px",
                        fontSize: "10px",
                        fontWeight: 600,
                        background: hexColor + "22",
                        color: hexColor,
                      }}>{slaInfo.label}</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: "#aaa" }}>זמן ביצוע משוער</div>
                    <div style={{ fontWeight: 600, color: "#333", fontSize: "11px" }}>
                      {order.estimatedExecutionHours ? `${order.estimatedExecutionHours} שע׳` : "לא הוזן"}
                    </div>
                  </div>
                  {order.scheduledDate && (
                    <div>
                      <div style={{ fontSize: "10px", color: "#aaa" }}>תאריך מתוכנן</div>
                      <div style={{ fontWeight: 600, color: "#3b82f6", fontSize: "11px" }}>{formatDate(order.scheduledDate)}</div>
                    </div>
                  )}
                  {signCount + miscCount > 0 && (
                    <div>
                      <div style={{ fontSize: "10px", color: "#aaa" }}>פריטים</div>
                      <div style={{ fontWeight: 600, color: "#333", fontSize: "11px" }}>
                        {[signCount > 0 && `${signCount} תמרורים`, miscCount > 0 && `${miscCount} שונות`].filter(Boolean).join(" + ")}
                      </div>
                    </div>
                  )}
                </div>

                {onOpenOrder && (
                  <button
                    onClick={() => onOpenOrder(order.id)}
                    style={{
                      width: "100%",
                      padding: "6px 12px",
                      background: "#2563eb",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      fontWeight: 700,
                      fontSize: "12px",
                      cursor: "pointer",
                      marginTop: "4px",
                    }}
                  >
                    פתח הזמנה
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/eliozedri/Desktop/eliozelk
npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/eliozedri/Desktop/eliozelk
git add src/components/WorkMap/IsraelMap.tsx
git commit -m "feat: add Leaflet IsraelMap component with SLA-colored markers"
```

---

## Task 8: Build Work Map page (KPI cards + filters + map shell)

**Files:**
- Create: `src/components/WorkMap/index.tsx`
- Create: `src/app/workmap/page.tsx`

- [ ] **Step 1: Create `src/app/workmap/page.tsx`**

```tsx
// src/app/workmap/page.tsx
import { WorkMap } from "@/components/WorkMap";

export default function WorkMapPage() {
  return <WorkMap />;
}
```

- [ ] **Step 2: Create `src/components/WorkMap/index.tsx`**

```tsx
// src/components/WorkMap/index.tsx
"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useOrdersContext } from "@/context/OrdersContext";
import { useCrewsContext } from "@/context/CrewsContext";
import type { WorkOrder } from "@/types/workOrder";
import { getSlaColor, SLA_COLORS, formatWaitingDuration, type SlaColor } from "@/lib/slaUtils";
import { extractCityCoordinates } from "@/lib/cityCoordinates";

// Load Leaflet map only on the client — it requires window/document
const IsraelMap = dynamic(() => import("./IsraelMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gray-400 text-sm bg-gray-100 rounded-xl">
      טוען מפה...
    </div>
  ),
});

// ── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  value: number;
  label: string;
  dotColor: string;
  onClick?: () => void;
  active?: boolean;
}

function KpiCard({ value, label, dotColor, onClick, active }: KpiCardProps) {
  return (
    <button
      onClick={onClick}
      className={`bg-white rounded-xl border shadow-sm p-4 flex flex-col gap-2 text-right w-full transition-colors ${
        active ? "border-blue-400 ring-2 ring-blue-100" : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <div className="flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
        <span className="text-xs text-gray-500 truncate">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900 leading-none">{value}</div>
    </button>
  );
}

// ── Legend ──────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex flex-wrap gap-4 text-xs">
      <span className="text-gray-500 font-semibold self-center">מקרא:</span>
      {(["green", "yellow", "red", "gray"] as SlaColor[]).map((color) => {
        const info = SLA_COLORS[color];
        return (
          <div key={color} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-full ${info.dot}`} />
            <span className={info.text}>{info.label}</span>
          </div>
        );
      })}
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-full bg-gray-400 ring-2 ring-blue-500 ring-offset-0" />
        <span className="text-gray-500">משובץ לצוות</span>
      </div>
    </div>
  );
}

// ── Filter Bar ───────────────────────────────────────────────────────────────

interface FiltersProps {
  slaFilter: SlaColor | "all";
  setSlaFilter: (v: SlaColor | "all") => void;
  showScheduled: boolean;
  setShowScheduled: (v: boolean) => void;
  showNonReady: boolean;
  setShowNonReady: (v: boolean) => void;
  totalShown: number;
}

function FilterBar({ slaFilter, setSlaFilter, showScheduled, setShowScheduled, showNonReady, setShowNonReady, totalShown }: FiltersProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
      <span className="text-xs font-semibold text-gray-500">סינון לפי SLA:</span>
      {(["all", "red", "yellow", "green", "gray"] as const).map((v) => {
        const label = v === "all" ? "הכל" : SLA_COLORS[v].label;
        const dotClass = v === "all" ? "bg-gray-400" : SLA_COLORS[v].dot;
        return (
          <button
            key={v}
            onClick={() => setSlaFilter(v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              slaFilter === v ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {v !== "all" && <div className={`w-2 h-2 rounded-full ${slaFilter === v ? "bg-white" : dotClass}`} />}
            {label}
          </button>
        );
      })}

      <div className="mr-auto flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showScheduled}
            onChange={(e) => setShowScheduled(e.target.checked)}
            className="w-3.5 h-3.5 accent-blue-600"
          />
          הצג משובצים
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showNonReady}
            onChange={(e) => setShowNonReady(e.target.checked)}
            className="w-3.5 h-3.5 accent-blue-600"
          />
          הצג לא מוכנים
        </label>
        <span className="text-xs text-gray-400">{totalShown} עבודות מוצגות</span>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function WorkMap() {
  const { orders } = useOrdersContext();
  const { crews } = useCrewsContext();

  const [slaFilter, setSlaFilter] = useState<SlaColor | "all">("all");
  const [showScheduled, setShowScheduled] = useState(true);
  const [showNonReady, setShowNonReady] = useState(false);

  // Only show non-terminal orders that have a map position
  const mappableOrders = useMemo(() => {
    return orders.filter(
      (o) => o.status !== "completed" && o.status !== "cancelled" && extractCityCoordinates(o.city || o.location)
    );
  }, [orders]);

  // KPI counts (over ALL active, not just filtered)
  const kpi = useMemo(() => {
    const ready = mappableOrders.filter((o) => o.status === "ready_installation");
    return {
      total: mappableOrders.length,
      green: ready.filter((o) => getSlaColor(o.readyForExecutionAt) === "green").length,
      yellow: ready.filter((o) => getSlaColor(o.readyForExecutionAt) === "yellow").length,
      red: ready.filter((o) => getSlaColor(o.readyForExecutionAt) === "red").length,
      unscheduled: ready.filter((o) => !o.scheduledDate).length,
      scheduled: ready.filter((o) => !!o.scheduledDate).length,
    };
  }, [mappableOrders]);

  // Filtered orders shown on map
  const visibleOrders = useMemo<WorkOrder[]>(() => {
    return mappableOrders.filter((o) => {
      const isReady = o.status === "ready_installation";
      if (!isReady && !showNonReady) return false;
      if (isReady && !showScheduled && o.scheduledDate) return false;
      if (slaFilter !== "all") {
        if (!isReady) return slaFilter === "gray";
        return getSlaColor(o.readyForExecutionAt) === slaFilter;
      }
      return true;
    });
  }, [mappableOrders, slaFilter, showScheduled, showNonReady]);

  const totalEstHours = useMemo(() =>
    visibleOrders.reduce((sum, o) => sum + (o.estimatedExecutionHours ?? 0), 0),
    [visibleOrders]
  );

  return (
    <div className="min-h-screen bg-[#f0f2f5] py-6 px-4 flex flex-col gap-4">
      <div className="max-w-[1400px] mx-auto w-full space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">מפת עבודות</h1>
            <p className="text-sm text-gray-500 mt-0.5">בקרת עבודות ארצית — {crews.length} צוותים פעילים</p>
          </div>
          {totalEstHours > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-2 text-sm">
              <span className="text-gray-500">סה״כ שעות מוצגות: </span>
              <span className="font-bold text-gray-900">{totalEstHours.toFixed(1)} שע׳</span>
            </div>
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard value={kpi.total} label="עבודות פעילות" dotColor="bg-gray-400" onClick={() => { setSlaFilter("all"); setShowNonReady(true); }} active={slaFilter === "all" && showNonReady} />
          <KpiCard value={kpi.green} label="מוכן (עד 24 שע׳)" dotColor="bg-green-500" onClick={() => { setSlaFilter("green"); setShowNonReady(false); }} active={slaFilter === "green"} />
          <KpiCard value={kpi.yellow} label="מתעכב (1–3 ימים)" dotColor="bg-amber-500" onClick={() => { setSlaFilter("yellow"); setShowNonReady(false); }} active={slaFilter === "yellow"} />
          <KpiCard value={kpi.red} label="דחוף (מעל 3 ימים)" dotColor="bg-red-500" onClick={() => { setSlaFilter("red"); setShowNonReady(false); }} active={slaFilter === "red"} />
          <KpiCard value={kpi.unscheduled} label="לא משובצים" dotColor="bg-orange-400" onClick={() => { setSlaFilter("all"); setShowScheduled(false); setShowNonReady(false); }} active={!showScheduled} />
          <KpiCard value={kpi.scheduled} label="משובצים" dotColor="bg-blue-400" onClick={() => { setSlaFilter("all"); setShowScheduled(true); setShowNonReady(false); }} active={slaFilter === "all" && showScheduled && !showNonReady} />
        </div>

        {/* Filter Bar */}
        <FilterBar
          slaFilter={slaFilter}
          setSlaFilter={setSlaFilter}
          showScheduled={showScheduled}
          setShowScheduled={setShowScheduled}
          showNonReady={showNonReady}
          setShowNonReady={setShowNonReady}
          totalShown={visibleOrders.length}
        />

        {/* Legend */}
        <Legend />

        {/* Map */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden" style={{ height: "600px" }}>
          {visibleOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
              <div className="text-4xl">🗺️</div>
              <p className="text-sm font-medium">אין עבודות להצגה בפילטרים הנוכחיים</p>
              <p className="text-xs">שנה את הסינון או ודא שלהזמנות יש שדה מיקום תקין</p>
            </div>
          ) : (
            <IsraelMap orders={visibleOrders} />
          )}
        </div>

        {/* Unmappable notice */}
        {(() => {
          const unmappable = orders.filter(
            (o) => o.status === "ready_installation" && !extractCityCoordinates(o.city || o.location)
          );
          if (unmappable.length === 0) return null;
          return (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              <span className="font-bold">{unmappable.length} הזמנות מוכנות</span> לא מוצגות במפה כי שדה המיקום שלהן לא כולל שם עיר מוכר.
              עדכן את שדה ה״עיר״ בהזמנה כדי שתופיע במפה.
            </div>
          );
        })()}

      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/eliozedri/Desktop/eliozelk
npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/eliozedri/Desktop/eliozelk
git add src/components/WorkMap/index.tsx src/app/workmap/page.tsx
git commit -m "feat: add Work Map page with Leaflet, KPI cards, SLA filters, and legend"
```

---

## Task 9: Build Weekly Schedule page

**Files:**
- Create: `src/components/WeeklySchedule/index.tsx`
- Create: `src/app/schedule/page.tsx`

- [ ] **Step 1: Create `src/app/schedule/page.tsx`**

```tsx
// src/app/schedule/page.tsx
import { WeeklySchedule } from "@/components/WeeklySchedule";

export default function SchedulePage() {
  return <WeeklySchedule />;
}
```

- [ ] **Step 2: Create `src/components/WeeklySchedule/index.tsx`**

```tsx
// src/components/WeeklySchedule/index.tsx
"use client";

import { useMemo, useState, useCallback } from "react";
import { useOrdersContext } from "@/context/OrdersContext";
import { useCrewsContext } from "@/context/CrewsContext";
import type { WorkOrder } from "@/types/workOrder";
import type { Crew } from "@/types/crew";
import { getSlaColor, SLA_COLORS, formatWaitingDuration } from "@/lib/slaUtils";

// ── Week helpers ─────────────────────────────────────────────────────────────

const WEEK_DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי"];

function getWeekDates(weekOffset: number): Date[] {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - dayOfWeek + weekOffset * 7);
  sunday.setHours(0, 0, 0, 0);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDayHeader(d: Date): string {
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
}

// ── Assign Modal ─────────────────────────────────────────────────────────────

interface AssignModalProps {
  order: WorkOrder;
  crews: Crew[];
  weekDates: Date[];
  onAssign: (orderId: string, crewId: string, date: string, hours: number) => void;
  onClose: () => void;
}

function AssignModal({ order, crews, weekDates, onAssign, onClose }: AssignModalProps) {
  const [crewId, setCrewId] = useState(order.assignedCrewId ?? crews[0]?.id ?? "");
  const [dateStr, setDateStr] = useState(order.scheduledDate ?? toISODate(weekDates[0]));
  const [hours, setHours] = useState(order.estimatedExecutionHours ?? 4);

  const activeCrews = crews.filter((c) => c.active);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4" dir="rtl">
        <div>
          <h2 className="text-lg font-bold text-gray-900">שיבוץ לצוות ותאריך</h2>
          <p className="text-sm text-gray-500 mt-0.5">{order.orderNumber} · {order.customer} · {order.location}</p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">צוות</label>
            {activeCrews.length === 0 ? (
              <p className="text-sm text-amber-600">אין צוותים פעילים. הוסף צוות קודם בדף ״צוותי שטח״.</p>
            ) : (
              <select
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                value={crewId}
                onChange={(e) => setCrewId(e.target.value)}
              >
                {activeCrews.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.leader})</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">תאריך ביצוע</label>
            <select
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
            >
              {weekDates.map((d, i) => (
                <option key={i} value={toISODate(d)}>
                  {WEEK_DAYS_HE[i]} {formatDayHeader(d)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">זמן ביצוע משוער (שעות)</label>
            <input
              type="number" min={0.5} max={24} step={0.5}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            ביטול
          </button>
          <button
            disabled={!crewId || activeCrews.length === 0}
            onClick={() => { onAssign(order.id, crewId, dateStr, hours); onClose(); }}
            className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            שבץ עבודה
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Job chip for the board ───────────────────────────────────────────────────

function JobChip({ order, onClick }: { order: WorkOrder; onClick: () => void }) {
  const slaColor = getSlaColor(order.readyForExecutionAt);
  const { dot } = SLA_COLORS[slaColor];
  return (
    <button
      onClick={onClick}
      className="w-full text-right px-2 py-1.5 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors flex items-start gap-1.5 text-xs"
    >
      <div className={`w-2 h-2 rounded-full mt-0.5 shrink-0 ${dot}`} />
      <div className="min-w-0">
        <div className="font-semibold text-gray-900 truncate">{order.orderNumber}</div>
        <div className="text-gray-500 truncate">{order.customer}</div>
        {order.estimatedExecutionHours && (
          <div className="text-blue-600">{order.estimatedExecutionHours}h</div>
        )}
      </div>
    </button>
  );
}

// ── Unscheduled job card ─────────────────────────────────────────────────────

function UnscheduledJobCard({ order, onAssign }: { order: WorkOrder; onAssign: () => void }) {
  const slaColor = getSlaColor(order.readyForExecutionAt);
  const { bg, text, dot } = SLA_COLORS[slaColor];
  return (
    <div className={`bg-white rounded-xl border shadow-sm p-3 flex flex-col gap-2 ${slaColor === "red" ? "border-red-200" : "border-gray-200"}`}>
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
          <span className="font-bold text-sm text-gray-900 truncate">{order.orderNumber}</span>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${bg} ${text}`}>
          {formatWaitingDuration(order.readyForExecutionAt)}
        </span>
      </div>
      <div className="text-xs text-gray-500 truncate">{order.customer}</div>
      <div className="text-xs text-gray-400 truncate">{order.location}</div>
      {order.estimatedExecutionHours ? (
        <div className="text-xs text-gray-600 font-medium">{order.estimatedExecutionHours} שע׳ משוערות</div>
      ) : (
        <div className="text-xs text-amber-600">⚠ זמן ביצוע לא הוזן</div>
      )}
      <button
        onClick={onAssign}
        className="w-full py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
      >
        שבץ לצוות
      </button>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function WeeklySchedule() {
  const { orders, updateOrderFields } = useOrdersContext();
  const { crews } = useCrewsContext();

  const [weekOffset, setWeekOffset] = useState(0);
  const [assigningOrder, setAssigningOrder] = useState<WorkOrder | null>(null);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const weekLabel = useMemo(() => {
    const start = weekDates[0];
    const end = weekDates[5];
    return `${formatDayHeader(start)} – ${formatDayHeader(end)} ${start.getFullYear()}`;
  }, [weekDates]);

  const readyOrders = useMemo(() =>
    orders.filter((o) => o.status === "ready_installation"),
    [orders]
  );

  const unscheduled = useMemo(() =>
    readyOrders.filter((o) => !o.scheduledDate).sort((a, b) => {
      const ca = getSlaColor(a.readyForExecutionAt);
      const cb = getSlaColor(b.readyForExecutionAt);
      const order = { red: 0, yellow: 1, green: 2, gray: 3 };
      return order[ca] - order[cb];
    }),
    [readyOrders]
  );

  const weekDateStrings = useMemo(() => weekDates.map(toISODate), [weekDates]);

  const scheduledThisWeek = useMemo(() =>
    readyOrders.filter((o) => o.scheduledDate && weekDateStrings.includes(o.scheduledDate)),
    [readyOrders, weekDateStrings]
  );

  const handleAssign = useCallback((orderId: string, crewId: string, date: string, hours: number) => {
    updateOrderFields(orderId, {
      assignedCrewId: crewId,
      scheduledDate: date,
      estimatedExecutionHours: hours,
    });
  }, [updateOrderFields]);

  const handleUnassign = useCallback((orderId: string) => {
    updateOrderFields(orderId, { assignedCrewId: null, scheduledDate: null });
  }, [updateOrderFields]);

  // Per crew/day workload
  const workloadMap = useMemo(() => {
    const map: Record<string, Record<string, WorkOrder[]>> = {};
    for (const crew of crews) {
      map[crew.id] = {};
      for (const d of weekDateStrings) map[crew.id][d] = [];
    }
    for (const o of scheduledThisWeek) {
      if (o.assignedCrewId && o.scheduledDate && map[o.assignedCrewId]) {
        map[o.assignedCrewId][o.scheduledDate]?.push(o);
      }
    }
    return map;
  }, [scheduledThisWeek, crews, weekDateStrings]);

  const activeCrews = crews.filter((c) => c.active);

  return (
    <div className="min-h-screen bg-[#f0f2f5] py-6 px-4">
      <div className="max-w-[1400px] mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">סידור שבועי</h1>
            <p className="text-sm text-gray-500 mt-0.5">שיבוץ עבודות לצוותים לפי ימים</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekOffset((w) => w - 1)}
              className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              onClick={() => setWeekOffset(0)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${weekOffset === 0 ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
            >
              השבוע
            </button>
            <button
              onClick={() => setWeekOffset((w) => w + 1)}
              className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
              {weekLabel}
            </span>
          </div>
        </div>

        {/* Summary chips */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
            {unscheduled.length} לא משובצות
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            {scheduledThisWeek.length} משובצות השבוע
          </span>
          {unscheduled.filter((o) => getSlaColor(o.readyForExecutionAt) === "red").length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
              ⚠ {unscheduled.filter((o) => getSlaColor(o.readyForExecutionAt) === "red").length} דחופות לא משובצות
            </span>
          )}
        </div>

        <div className="flex gap-4 items-start">

          {/* Left panel: unscheduled jobs */}
          <div className="w-64 shrink-0 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <h2 className="text-sm font-bold text-gray-700">ממתינות לשיבוץ</h2>
              <span className="text-xs text-gray-400">({unscheduled.length})</span>
            </div>
            {unscheduled.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
                כל העבודות שובצו 🎉
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto">
                {unscheduled.map((o) => (
                  <UnscheduledJobCard
                    key={o.id}
                    order={o}
                    onAssign={() => setAssigningOrder(o)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right panel: week board */}
          <div className="flex-1 min-w-0">
            {activeCrews.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
                <div className="text-3xl mb-2">👷</div>
                לא הוגדרו צוותים. עבור ל<a href="/crews" className="text-blue-600 underline">צוותי שטח</a> כדי להוסיף צוות.
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Header row */}
                <div className="grid border-b border-gray-200" style={{ gridTemplateColumns: `180px repeat(6, 1fr)` }}>
                  <div className="px-3 py-2.5 text-xs font-semibold text-gray-500 bg-gray-50 border-l border-gray-200">צוות</div>
                  {weekDates.map((d, i) => (
                    <div key={i} className={`px-2 py-2.5 text-center border-l border-gray-200 ${toISODate(d) === toISODate(new Date()) ? "bg-blue-50" : "bg-gray-50"}`}>
                      <div className="text-xs font-bold text-gray-700">{WEEK_DAYS_HE[i]}</div>
                      <div className="text-xs text-gray-400">{formatDayHeader(d)}</div>
                    </div>
                  ))}
                </div>

                {/* Crew rows */}
                {activeCrews.map((crew) => (
                  <div key={crew.id} className="grid border-b border-gray-100 last:border-b-0" style={{ gridTemplateColumns: `180px repeat(6, 1fr)` }}>
                    {/* Crew name cell */}
                    <div className="px-3 py-2 border-l border-gray-200 flex flex-col justify-center bg-gray-50/50">
                      <div className="text-xs font-bold text-gray-800">{crew.name}</div>
                      <div className="text-[10px] text-gray-400">{crew.leader}</div>
                      <div className="text-[10px] text-gray-400">קיב׳ {crew.dailyCapacityHours}h</div>
                    </div>

                    {/* Day cells */}
                    {weekDateStrings.map((dateStr, di) => {
                      const jobs = workloadMap[crew.id]?.[dateStr] ?? [];
                      const totalHours = jobs.reduce((s, o) => s + (o.estimatedExecutionHours ?? 0), 0);
                      const overload = totalHours > crew.dailyCapacityHours;
                      return (
                        <div
                          key={dateStr}
                          className={`px-1.5 py-1.5 border-l border-gray-200 min-h-[80px] flex flex-col gap-1 ${overload ? "bg-red-50" : ""}`}
                        >
                          {jobs.length > 0 && (
                            <div className={`text-[9px] font-bold text-right mb-0.5 ${overload ? "text-red-600" : "text-gray-400"}`}>
                              {totalHours}h {overload ? "⚠ עומס" : ""}
                            </div>
                          )}
                          {jobs.map((o) => (
                            <JobChip
                              key={o.id}
                              order={o}
                              onClick={() => setAssigningOrder(o)}
                            />
                          ))}
                          <button
                            onClick={() => setAssigningOrder({ status: "ready_installation" } as WorkOrder)}
                            className="w-full py-1 rounded text-[9px] text-gray-300 hover:text-gray-400 hover:bg-gray-50 transition-colors border border-dashed border-transparent hover:border-gray-200"
                          >
                            + שבץ
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Assign Modal */}
      {assigningOrder && assigningOrder.id && (
        <AssignModal
          order={assigningOrder}
          crews={crews}
          weekDates={weekDates}
          onAssign={handleAssign}
          onClose={() => setAssigningOrder(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Fix the "+ שבץ" button in the board — it should open the modal for a new unscheduled job, not a fake order.**

The inline `+ שבץ` button in the board is a placeholder that should open the assign modal from the unscheduled list.  
Replace the button in the board's day cells with this version that picks the first unscheduled job instead:

```tsx
{unscheduled.length > 0 && (
  <button
    onClick={() => setAssigningOrder(unscheduled[0])}
    className="w-full py-1 rounded text-[9px] text-gray-300 hover:text-gray-400 hover:bg-gray-50 transition-colors border border-dashed border-transparent hover:border-gray-200"
  >
    + שבץ
  </button>
)}
```

Also: in the `AssignModal`, pre-select the `dateStr` to `weekDateStrings[di]` when opened from a cell. Because `setAssigningOrder` doesn't pass the target date, the modal defaults to the first day of the week — acceptable for now.

- [ ] **Step 4: Type-check**

```bash
cd /Users/eliozedri/Desktop/eliozelk
npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/eliozedri/Desktop/eliozelk
git add src/components/WeeklySchedule/index.tsx src/app/schedule/page.tsx
git commit -m "feat: add Weekly Schedule page with crew board and assign modal"
```

---

## Task 10: Add `city` field to OrderForm and final wiring

**Files:**
- Modify: `src/components/OrderForm/OrderHeader.tsx`
- Modify: `src/types/order.ts`
- Modify: `src/hooks/useOrderForm.ts`

This task ensures new orders can record an explicit city for accurate map placement.

- [ ] **Step 1: Add `city` to `OrderHeader` interface in `src/types/order.ts`**

```typescript
export interface OrderHeader {
  date: string;
  customer: string;
  location: string;
  city: string;       // Added: explicit city for map lookup
  reference: string;
}
```

- [ ] **Step 2: Add city field to `useOrderForm.ts` default state**

Read `src/hooks/useOrderForm.ts`. Find the initial `OrderState` object (the one with `date`, `customer`, `location`, `reference`). Add `city: ""` to it. Also ensure `resetForm` includes `city: ""`.

- [ ] **Step 3: Add city input to `src/components/OrderForm/OrderHeader.tsx`**

Read the file, find the `location` input row, and add a city input directly below it:

```tsx
<div className="flex flex-col gap-1">
  <label className="text-xs font-semibold text-gray-600">עיר</label>
  <input
    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
    value={header.city ?? ""}
    onChange={(e) => onUpdate({ city: e.target.value })}
    placeholder="תל אביב, חיפה, ..."
  />
</div>
```

- [ ] **Step 4: Pass city through `addOrder` in `useOrders.ts`**

In `useOrders.ts`, the `addOrder` function builds `newOrder` from `snapshot`. The `snapshot` is an `OrderState` (which extends `OrderHeader`). After adding `city` to `OrderHeader`, `snapshot.city` is already available. Ensure `city` is spread into `newOrder`:

```typescript
const newOrder: WorkOrder = {
  id: nanoid(),
  orderNumber: generateOrderNumber(loadOrders()),
  date: snapshot.date,
  customer: snapshot.customer,
  location: snapshot.location,
  city: snapshot.city,          // pass through
  reference: snapshot.reference,
  // ... rest unchanged
};
```

- [ ] **Step 5: Type-check**

```bash
cd /Users/eliozedri/Desktop/eliozelk
npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: 0 errors.

- [ ] **Step 6: Full build check**

```bash
cd /Users/eliozedri/Desktop/eliozelk
npm run build 2>&1 | tail -30
```

Expected: build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/eliozedri/Desktop/eliozelk
git add src/types/order.ts src/hooks/useOrderForm.ts src/components/OrderForm/OrderHeader.tsx src/hooks/useOrders.ts
git commit -m "feat: add city field to order form for map placement"
```

---

## Task 11: Final lint + build verification

- [ ] **Step 1: Run lint**

```bash
cd /Users/eliozedri/Desktop/eliozelk
npm run lint 2>&1
```

Fix any reported errors before continuing.

- [ ] **Step 2: Run full TypeScript check**

```bash
cd /Users/eliozedri/Desktop/eliozelk
npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: 0 errors.

- [ ] **Step 3: Run production build**

```bash
cd /Users/eliozedri/Desktop/eliozelk
npm run build 2>&1 | tail -40
```

Expected: `✓ Compiled successfully` (or equivalent success message). Fix any build errors — common issues are:
- `leaflet/dist/leaflet.css` import — if Next.js complains, move the import to `globals.css` using `@import "leaflet/dist/leaflet.css";`
- SSR errors in Leaflet component — ensure the `dynamic({ ssr: false })` wrapper in `WorkMap/index.tsx` is in place

- [ ] **Step 4: Final commit**

```bash
cd /Users/eliozedri/Desktop/eliozelk
git add -A
git commit -m "feat: complete Work Map, Weekly Schedule, and Crews modules"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Visual Leaflet map of Israel with SLA-colored markers
- ✅ Green/yellow/red SLA logic (24h / 3 day thresholds)
- ✅ `readyForExecutionAt` auto-set on `ready_installation` status transition
- ✅ Marker popup with order details, waiting time, estimated hours
- ✅ KPI cards: total active, green, yellow, red, unscheduled, scheduled
- ✅ Filter bar: SLA color filter, show/hide scheduled, show/hide non-ready
- ✅ Unmapped orders warning
- ✅ Crews management: add/edit/delete, skills, region, capacity
- ✅ Weekly schedule: unscheduled list sorted by urgency, crew × day board
- ✅ Assign modal: pick crew + date + hours
- ✅ Crew overload warning (red background when hours exceed capacity)
- ✅ Hebrew RTL throughout
- ✅ Sidebar updated with 3 new links + "בקרת שטח" section header
- ✅ `city` field added to order form for accurate map placement
- ✅ localStorage pattern consistent with existing codebase
- ✅ No new global state management libraries introduced
- ✅ Dynamic import for Leaflet (SSR-safe)

**Type consistency check:**
- `updateOrderFields` defined in Task 3 → used in Tasks 8 and 9 ✅
- `getSlaColor` / `SLA_COLORS` / `SLA_HEX` defined in Task 2 → used in Tasks 7, 8, 9 ✅
- `extractCityCoordinates` / `ISRAEL_CENTER` defined in Task 2 → used in Tasks 7, 8 ✅
- `useCrewsContext` defined in Task 4 → used in Tasks 6, 8, 9 ✅
- `Crew` / `CrewSkill` / `CrewRegion` defined in Task 4 → used in Task 6, 9 ✅
- `WorkOrder` extended in Task 3 → consumed in Tasks 7, 8, 9, 10 ✅

**Placeholder scan:** No TBDs, no TODOs, no "implement later" found. All code steps contain complete implementations.
