# Active / Inactive Product Status — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Catalog Manager a fast, safe way to bulk-review and activate the 137 imported (`needs_review`) products, manage active/inactive state per product, surface a `ממתין לבדיקה` status, guarantee inactive products never reach any orderable pool, and add a premium glassmorphism `אתר מכירה` sales-site preview tab that reads the same active pool.

**Architecture:** Reuse the existing `catalog_items.is_active` boolean as the single operational flag (no new column). Display state is derived from `is_active` + `metadata.review_state`. A new `SECURITY DEFINER` RPC `set_catalog_active(ids, active)` flips `is_active` and strips `needs_review` on activation in one atomic call. `useCatalog` gets `setActiveBulk`; the existing single `toggleActive` is rewired onto the same RPC. The `/catalog` page gains a four-way status filter (chips), a selection mode with a bulk action bar, and an amber `ממתין לבדיקה` pill. A shared `isSellable` helper centralizes the operational pool for order creation and the new sales-site page.

**Tech Stack:** Next.js 16.2.6, React 19, TypeScript, Tailwind v4, Supabase (Postgres + realtime), Vitest, lucide-react. Cloud Supabase project `gtevmcnasvrahzfdqrqk`.

**Spec:** `docs/superpowers/specs/2026-05-24-active-inactive-products-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260602000000_catalog_bulk_active_rpc.sql` | Create | `set_catalog_active` RPC + grant |
| `src/lib/catalog/sellable.ts` | Create | `isSellable`, `statusBucket`, `STATUS_LABEL_HE`, `statusPillClass` |
| `src/lib/catalog/__tests__/sellable.test.ts` | Create | Unit tests for the helper |
| `src/hooks/useCatalog.ts` | Modify | Add `setActiveBulk`; rewire `toggleActive` to RPC |
| `src/context/CatalogContext.tsx` | Modify | Expose `setActiveBulk` |
| `src/components/Catalog/index.tsx` | Modify | 4-way filter chips, selection mode, bulk bar, amber pill |
| `src/components/OrderForm/MiscSection.tsx` | Modify | Use `isSellable` for the operational selector |
| `src/components/SalesSite/index.tsx` | Create | `SalesSitePage` — composition of the premium sales-site sections |
| `src/components/SalesSite/SalesGlassPanel.tsx` | Create | Reusable glassmorphism container (blur + glow border) |
| `src/components/SalesSite/SalesHero.tsx` | Create | Premium hero (title/subtitle, ambient gradient) |
| `src/components/SalesSite/SalesStatsCards.tsx` | Create | Glass stat cards: sellable / hidden product counts |
| `src/components/SalesSite/SalesProductPreviewGrid.tsx` | Create | Premium product cards from the active pool + hidden-products strip |
| `src/components/SalesSite/SalesFutureModules.tsx` | Create | Coming-soon module tiles (disabled) |
| `src/app/sales-site/page.tsx` | Create | Route wrapper |
| `src/components/Sidebar.tsx` | Modify | Add `אתר מכירה` nav item to בנוסף |

**Verification-only (no edits expected):** `src/lib/teamBot/catalog.ts`, `src/lib/teamBot/intake.ts`, `src/app/api/jarvis/catalog/items/route.ts`, agent scan routes.

---

## Task 1: Database — bulk activation RPC

**Files:**
- Create: `supabase/migrations/20260602000000_catalog_bulk_active_rpc.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Bulk active/inactive toggle for catalog_items.
-- Activating clears the imported-batch review flag (metadata.review_state = 'needs_review').
-- Deactivating never re-adds it. Only is_active + updated_at + that one metadata key change.
create or replace function set_catalog_active(p_ids text[], p_active boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update catalog_items
  set is_active  = p_active,
      updated_at = now(),
      metadata   = case when p_active then metadata - 'review_state' else metadata end
  where id = any(p_ids);
$$;

grant execute on function set_catalog_active(text[], boolean) to authenticated;
```

- [ ] **Step 2: Apply the migration to the cloud project**

Apply via the Supabase MCP `apply_migration` tool (name: `catalog_bulk_active_rpc`, project_id: `gtevmcnasvrahzfdqrqk`) using the SQL above. If the MCP tool is unavailable, run `supabase db push` from the repo root (CLI must be linked to the project).

- [ ] **Step 3: Verify the function exists and is callable (read-only smoke)**

Run via Supabase MCP `execute_sql` (project `gtevmcnasvrahzfdqrqk`):

```sql
select proname, pg_get_function_identity_arguments(oid) as args
from pg_proc where proname = 'set_catalog_active';
```

Expected: one row, `args = p_ids text[], p_active boolean`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260602000000_catalog_bulk_active_rpc.sql
git commit -m "feat(catalog): add set_catalog_active bulk RPC migration"
```

---

## Task 2: Shared sellable / status helper (TDD)

**Files:**
- Create: `src/lib/catalog/sellable.ts`
- Test: `src/lib/catalog/__tests__/sellable.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/catalog/__tests__/sellable.test.ts
import { describe, it, expect } from "vitest";
import { isSellable, statusBucket, STATUS_LABEL_HE } from "@/lib/catalog/sellable";

const base = { isActive: false, metadata: {} as Record<string, unknown> };

describe("isSellable", () => {
  it("active product is sellable", () => {
    expect(isSellable({ isActive: true })).toBe(true);
  });
  it("inactive product is not sellable", () => {
    expect(isSellable({ isActive: false })).toBe(false);
  });
});

describe("statusBucket", () => {
  it("active -> active regardless of residual review_state", () => {
    expect(statusBucket({ isActive: true, metadata: { review_state: "needs_review" } })).toBe("active");
  });
  it("inactive + needs_review -> needs_review", () => {
    expect(statusBucket({ ...base, metadata: { review_state: "needs_review" } })).toBe("needs_review");
  });
  it("inactive + no review flag -> inactive", () => {
    expect(statusBucket({ ...base, metadata: {} })).toBe("inactive");
  });
  it("inactive + undefined metadata -> inactive", () => {
    expect(statusBucket({ isActive: false, metadata: undefined })).toBe("inactive");
  });
});

describe("STATUS_LABEL_HE", () => {
  it("maps buckets to Hebrew", () => {
    expect(STATUS_LABEL_HE.active).toBe("פעיל");
    expect(STATUS_LABEL_HE.needs_review).toBe("ממתין לבדיקה");
    expect(STATUS_LABEL_HE.inactive).toBe("לא פעיל");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/catalog/__tests__/sellable.test.ts`
Expected: FAIL — cannot resolve `@/lib/catalog/sellable`.

- [ ] **Step 3: Implement the helper**

```ts
// src/lib/catalog/sellable.ts
import type { CatalogItem } from "@/types/catalog";

/**
 * Single source of truth for "is this product part of the operational / sellable pool?".
 * Operational = active. Out-of-stock is intentionally NOT considered here — stock is a
 * separate concept (current_quantity) and must never gate operational visibility.
 */
export function isSellable(item: Pick<CatalogItem, "isActive">): boolean {
  return item.isActive;
}

export type CatalogStatusBucket = "active" | "needs_review" | "inactive";

/** Derive the mutually-exclusive display bucket from is_active + metadata.review_state. */
export function statusBucket(
  item: Pick<CatalogItem, "isActive"> & { metadata?: Record<string, unknown> },
): CatalogStatusBucket {
  if (item.isActive) return "active";
  if (item.metadata?.review_state === "needs_review") return "needs_review";
  return "inactive";
}

export const STATUS_LABEL_HE: Record<CatalogStatusBucket, string> = {
  active: "פעיל",
  needs_review: "ממתין לבדיקה",
  inactive: "לא פעיל",
};

/** Tailwind classes for the status pill, keyed by bucket. */
export const statusPillClass: Record<CatalogStatusBucket, string> = {
  active: "bg-green-100 text-green-700 hover:bg-green-200",
  needs_review: "bg-amber-100 text-amber-700 hover:bg-amber-200",
  inactive: "bg-gray-100 text-gray-500 hover:bg-gray-200",
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/catalog/__tests__/sellable.test.ts`
Expected: PASS (8 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/sellable.ts src/lib/catalog/__tests__/sellable.test.ts
git commit -m "feat(catalog): add isSellable + statusBucket status helper"
```

---

## Task 3: `useCatalog.setActiveBulk` + rewire `toggleActive`

**Files:**
- Modify: `src/hooks/useCatalog.ts` (toggleActive at 194-211; return at 326)
- Modify: `src/context/CatalogContext.tsx`

- [ ] **Step 1: Replace `toggleActive` with bulk-backed versions**

In `src/hooks/useCatalog.ts`, replace the entire `toggleActive` `useCallback` block (lines 194-211) with:

```ts
  const setActiveBulk = useCallback(async (
    ids: string[],
    active: boolean,
  ): Promise<{ ok: boolean; error?: string }> => {
    if (ids.length === 0) return { ok: true };
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    const originals = ref.current.filter(i => idSet.has(i.id));

    // Optimistic: flip is_active; when activating, strip the needs_review flag locally.
    setItems(prev => prev.map(i => {
      if (!idSet.has(i.id)) return i;
      let metadata = i.metadata;
      if (active && metadata && "review_state" in metadata) {
        metadata = { ...metadata };
        delete (metadata as Record<string, unknown>).review_state;
      }
      return { ...i, isActive: active, metadata, updatedAt: now };
    }));

    const db = getSupabase();
    if (!db) return { ok: true };

    const { error } = await db.rpc("set_catalog_active", { p_ids: ids, p_active: active });
    if (error) {
      console.error("[catalog] setActiveBulk failed:", error.message);
      const byId = new Map(originals.map(o => [o.id, o]));
      setItems(prev => prev.map(i => byId.get(i.id) ?? i));
      return { ok: false, error: error.message };
    }
    return { ok: true };
  }, []);

  const toggleActive = useCallback((id: string) => {
    const original = ref.current.find(i => i.id === id);
    if (!original) return;
    void setActiveBulk([id], !original.isActive);
  }, [setActiveBulk]);
```

- [ ] **Step 2: Export `setActiveBulk` from the hook**

In `src/hooks/useCatalog.ts`, update the return statement (line ~326) to add `setActiveBulk`:

```ts
  return { items, addItem, updateItem, toggleActive, setActiveBulk, deleteItem, adjustStock, updateStockConfig, updateCostPrice };
```

- [ ] **Step 3: Expose `setActiveBulk` on the context type**

In `src/context/CatalogContext.tsx`, add to the `CatalogContextValue` interface (after the `toggleActive` line):

```ts
  setActiveBulk: (ids: string[], active: boolean) => Promise<{ ok: boolean; error?: string }>;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors related to `setActiveBulk` / `useCatalog` / `CatalogContext`.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCatalog.ts src/context/CatalogContext.tsx
git commit -m "feat(catalog): add setActiveBulk and route toggleActive through bulk RPC"
```

---

## Task 4: `/catalog` four-way status filter + segmented chips (discoverability)

**Files:**
- Modify: `src/components/Catalog/index.tsx` (imports; state 844; filtered predicate 914-915; filter UI 1137-1145; add chips near 1118)

- [ ] **Step 1: Import the helper**

Add to the import block near the top of `src/components/Catalog/index.tsx`:

```ts
import { statusBucket, STATUS_LABEL_HE, statusPillClass } from "@/lib/catalog/sellable";
```

- [ ] **Step 2: Widen the filter state**

Replace line 844:

```ts
  const [filterActive, setFilterActive] = useState<"all" | "active" | "needs_review" | "inactive">("all");
```

- [ ] **Step 3: Replace the active predicate with bucket logic**

In the `filtered` `useMemo`, replace lines 914-915:

```ts
      if (filterActive === "active" && !item.isActive) return false;
      if (filterActive === "inactive" && item.isActive) return false;
```

with:

```ts
      if (filterActive !== "all" && statusBucket(item) !== filterActive) return false;
```

- [ ] **Step 4: Add live status counts**

Immediately after the `filtered` `useMemo` block (after line ~935), add:

```ts
  const statusCounts = useMemo(() => {
    const c = { all: items.length, active: 0, needs_review: 0, inactive: 0 };
    for (const i of items) {
      const b = statusBucket(i);
      c[b] += 1;
    }
    return c;
  }, [items]);
```

- [ ] **Step 5: Add the segmented chips above the filter row**

Directly before the search-input/select filter group (immediately before line 1121's `<select>` for category, inside the same toolbar container), insert:

```tsx
              <div className="flex items-center gap-1.5 flex-wrap">
                {([
                  ["all", `כל המוצרים (${statusCounts.all})`],
                  ["active", `פעילים (${statusCounts.active})`],
                  ["needs_review", `ממתינים לבדיקה (${statusCounts.needs_review})`],
                  ["inactive", `לא פעילים (${statusCounts.inactive})`],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilterActive(value)}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap ${
                      filterActive === value
                        ? "border-blue-400 bg-blue-50 text-blue-700"
                        : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
```

- [ ] **Step 6: Remove the now-redundant active/inactive `<select>`**

Delete the `<select>` block at lines 1137-1145 (the one bound to `filterActive` with options `פעיל / לא פעיל`, `פעילים בלבד`, `לא פעילים`). The chips replace it. Leave the category/type/image/price selects untouched.

- [ ] **Step 7: Build to verify no type/JSX errors**

Run: `npx tsc --noEmit`
Expected: no errors. (Full `npm run build` runs in Task 9.)

- [ ] **Step 8: Commit**

```bash
git add src/components/Catalog/index.tsx
git commit -m "feat(catalog): four-way status filter chips with live counts"
```

---

## Task 5: `/catalog` selection mode + bulk action bar + amber pill

**Files:**
- Modify: `src/components/Catalog/index.tsx` (state, handlers, table header, table row 1498-1537, header toolbar)

- [ ] **Step 1: Add selection state + handlers**

After the `statusCounts` memo (Task 4 Step 4), and after `setActiveBulk` is destructured (see Step 2), add:

```ts
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const allFilteredSelected = filtered.length > 0 && filtered.every(i => selectedIds.has(i.id));

  function toggleSelectAll() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach(i => next.delete(i.id));
      else filtered.forEach(i => next.add(i.id));
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function applyBulk(active: boolean) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const verb = active ? "להפעיל" : "להשבית";
    if (!window.confirm(`האם ${verb} ${ids.length} מוצרים?`)) return;
    setBulkBusy(true);
    const res = await setActiveBulk(ids, active);
    setBulkBusy(false);
    if (res.ok) setSelectedIds(new Set());
    else window.alert(`הפעולה נכשלה: ${res.error ?? "שגיאה לא ידועה"}`);
  }
```

- [ ] **Step 2: Destructure `setActiveBulk` from context**

Update line 840 to include `setActiveBulk`:

```ts
  const { items, addItem, updateItem, toggleActive, setActiveBulk, deleteItem, updateStockConfig, updateCostPrice } = useCatalogContext();
```

- [ ] **Step 3: Add the selection-mode toggle button**

Next to the chips group (after the chips `</div>` from Task 4 Step 5), add:

```tsx
              <button
                type="button"
                onClick={() => {
                  setSelectMode(v => {
                    const next = !v;
                    if (next) setViewMode("table");
                    else setSelectedIds(new Set());
                    return next;
                  });
                }}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap ${
                  selectMode
                    ? "border-blue-500 bg-blue-600 text-white hover:bg-blue-700"
                    : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {selectMode ? "✕ סיום בחירה" : "מצב בחירה"}
              </button>
```

- [ ] **Step 4: Add the sticky bulk action bar**

Immediately inside the page's main content wrapper, before the table/cards render (search for the `viewMode === "table"` conditional and place this just before it), add:

```tsx
            {selectMode && selectedIds.size > 0 && (
              <div className="sticky top-2 z-20 mb-3 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-navy-900 text-white shadow-lg">
                <span className="text-sm font-medium">נבחרו {selectedIds.size} מוצרים</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => applyBulk(true)}
                    className="px-3 py-1.5 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50 transition-colors"
                  >
                    {bulkBusy ? "..." : `הפעל נבחרים (${selectedIds.size})`}
                  </button>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => applyBulk(false)}
                    className="px-3 py-1.5 rounded-lg bg-white/15 text-white text-sm font-medium hover:bg-white/25 disabled:opacity-50 transition-colors"
                  >
                    {bulkBusy ? "..." : `השבת נבחרים (${selectedIds.size})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="px-2 py-1.5 rounded-lg text-white/60 text-sm hover:text-white transition-colors"
                  >
                    נקה
                  </button>
                </div>
              </div>
            )}
```

- [ ] **Step 5: Add the select-all header cell (table view)**

In the table's `<thead>` row, add as the first `<th>` (guarded by `selectMode`):

```tsx
                        {selectMode && (
                          <th className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={allFilteredSelected}
                              onChange={toggleSelectAll}
                              className="rounded"
                              aria-label="בחר הכל"
                            />
                          </th>
                        )}
```

- [ ] **Step 6: Add the per-row checkbox cell (table view)**

In the data `<tr>` at line 1498, add as the first child cell (before the name `<td>` at line 1502):

```tsx
                              {selectMode && (
                                <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(item.id)}
                                    onChange={() => toggleSelect(item.id)}
                                    className="rounded"
                                  />
                                </td>
                              )}
```

- [ ] **Step 7: Upgrade the status pill to three buckets (amber for needs_review)**

Replace the table status button at lines 1530-1536 with:

```tsx
                                {(() => {
                                  const bucket = statusBucket(item);
                                  return (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); toggleActive(item.id); }}
                                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${statusPillClass[bucket]}`}
                                      title={item.isActive ? "לחץ להשבתה" : "לחץ להפעלה (סקירה ואישור)"}
                                    >
                                      {STATUS_LABEL_HE[bucket]}
                                    </button>
                                  );
                                })()}
```

- [ ] **Step 8: Upgrade the card-view pill (line 145-146 and 429-432)**

In the card render, replace the two-state pill expressions (`item.isActive ? "פעיל" : "לא פעיל"` and their green/gray class) with bucket-driven equivalents:

At line ~145-146 (badge), use:
```tsx
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${statusPillClass[statusBucket(item)]}`}>
                      {STATUS_LABEL_HE[statusBucket(item)]}
                    </span>
```

At line ~429-432 (toggle button label), keep the `toggleActive` onClick but swap label/class to `STATUS_LABEL_HE[statusBucket(item)]` / `statusPillClass[statusBucket(item)]`. The action button text at line 166 (`item.isActive ? "השבת" : "הפעל"`) stays as-is (it's an action verb, not a status).

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/components/Catalog/index.tsx
git commit -m "feat(catalog): selection mode + bulk activate/deactivate + amber needs-review pill"
```

---

## Task 6: Order-creation filtering contract via `isSellable`

**Files:**
- Modify: `src/components/OrderForm/MiscSection.tsx` (filter at 121-124)

- [ ] **Step 1: Import the helper**

Add near the top of `src/components/OrderForm/MiscSection.tsx`:

```ts
import { isSellable } from "@/lib/catalog/sellable";
```

- [ ] **Step 2: Replace the inline active check**

In `getSuggestions`, replace line 123:

```ts
        if (!item.isActive) return false;
```

with:

```ts
        if (!isSellable(item)) return false;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/OrderForm/MiscSection.tsx
git commit -m "refactor(order-form): use shared isSellable for the product selector"
```

---

## Task 7: Verify Telegram + Jarvis/agent filtering (read-only, no code unless gap)

**Files:** none expected (verification task).

- [ ] **Step 1: Confirm Telegram reads filter `is_active`**

Run: `grep -n "is_active" src/lib/teamBot/catalog.ts src/lib/teamBot/intake.ts`
Expected: every catalog read uses `.eq("is_active", true)`; `intake.ts` re-validates `is_active` at submit. If any read lacks the filter, add `.eq("is_active", true)` to that query and commit `fix(team-bot): enforce is_active on catalog read`.

- [ ] **Step 2: Confirm Jarvis catalog API filters `is_active`**

Run: `grep -n "is_active" src/app/api/jarvis/catalog/items/route.ts src/app/api/jarvis/catalog/items/[id]/route.ts src/app/api/jarvis/catalog/departments/route.ts`
Expected: list/department endpoints use `.eq("is_active", true)`; single-item endpoint returns an `is_active` flag and treats `is_active=false` as not-orderable. No change expected.

- [ ] **Step 3: Confirm agent orderable pools filter `is_active`**

Run: `grep -n "is_active" src/app/api/agents/inventory-agent/scan/route.ts src/lib/agents/chat-engine.ts`
Expected: catalog reads that feed orderable/recommendation pools use `.eq("is_active", true)`. (Catalog-pricing agent intentionally reads both active and inactive for pricing analysis — that is reporting, not an orderable pool, so leave it.)

- [ ] **Step 4: Record the verification result**

No commit if nothing changed. If a gap was fixed, commit it with the message from Step 1.

---

## Task 8: `אתר מכירה` — premium glassmorphism sales-site page + sidebar tab

**Intent:** Not a dry placeholder. The first version of `/sales-site` must look intentionally designed —
deep glassmorphism, layered translucency, ambient gradients, glowing edges — a premium digital-catalog
"starting point" inspired by Nike / Adidas / Apple Store browsing. **Bounded:** no cart, checkout, payment,
customer accounts, or sales flows. It is a premium **management/preview** surface that prepares the ground.

**Design contract:**
- Dark premium canvas (`from-navy-950 via-navy-900 to-navy-950`), not the light admin `bg-surface`.
- Glass panels: `border-white/10 bg-white/5 backdrop-blur-xl` + soft shadow; accent glow with `ek-blue`/`ek-gold`.
- Strong hierarchy: large hero → stat cards → product preview → future modules. Generous spacing, minimal clutter.
- **Hebrew RTL** throughout (`dir="rtl"`, all labels Hebrew). Tab name exactly `אתר מכירה`.
- **Visibility rule:** active (sellable) products only in the "ready to publish" pool, via shared `isSellable`.
  Inactive shown separately as muted "won't appear" preview. Out-of-stock is never referenced here.
- **No duplicated filtering** — reuse `isSellable` / `statusBucket` from `src/lib/catalog/sellable.ts`.
- No hardcoded mock products — render real active items; graceful empty state when none.

**Files:**
- Create: `src/components/SalesSite/SalesGlassPanel.tsx`
- Create: `src/components/SalesSite/SalesHero.tsx`
- Create: `src/components/SalesSite/SalesStatsCards.tsx`
- Create: `src/components/SalesSite/SalesProductPreviewGrid.tsx`
- Create: `src/components/SalesSite/SalesFutureModules.tsx`
- Create: `src/components/SalesSite/index.tsx`
- Create: `src/app/sales-site/page.tsx`
- Modify: `src/components/Sidebar.tsx` (icon import; בנוסף section after line 86)

- [ ] **Step 1: Create the reusable glass container**

```tsx
// src/components/SalesSite/SalesGlassPanel.tsx
"use client";

import type { ReactNode } from "react";

export function SalesGlassPanel({
  children,
  className = "",
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.35)] ${
        glow ? "ring-1 ring-ek-blue/30" : ""
      } ${className}`}
    >
      {glow && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-ek-blue/10 via-transparent to-ek-gold/10" />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Create the hero**

```tsx
// src/components/SalesSite/SalesHero.tsx
"use client";

import { Store } from "lucide-react";

export function SalesHero({ sellableCount }: { sellableCount: number }) {
  return (
    <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-navy-900 via-navy-800 to-navy-950 px-6 py-12 md:px-10 md:py-16">
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-ek-blue/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-ek-gold/20 blur-3xl" />
      <div className="relative max-w-2xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/70 backdrop-blur">
          <Store className="h-3.5 w-3.5 text-ek-gold" />
          קטלוג מכירה דיגיטלי
        </div>
        <h1 className="mt-5 text-4xl font-bold tracking-tight text-white md:text-5xl">אתר מכירה</h1>
        <p className="mt-4 text-base leading-relaxed text-white/70 md:text-lg">
          נקודת הפתיחה לחוויית מכירה דיגיטלית פרימיום. כאן ינוהלו המוצרים שיוצגו וימכרו באתר —
          רק מוצרים פעילים מופיעים כמוכנים לפרסום.
        </p>
        <div className="mt-7 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur-xl">
          <span className="text-3xl font-bold text-white">{sellableCount}</span>
          <span className="text-sm leading-tight text-white/60">
            מוצרים פעילים
            <br />
            מוכנים לפרסום
          </span>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Create the stat cards**

```tsx
// src/components/SalesSite/SalesStatsCards.tsx
"use client";

import { CheckCircle2, EyeOff, Clock } from "lucide-react";
import { SalesGlassPanel } from "./SalesGlassPanel";

export function SalesStatsCards({
  sellable,
  hidden,
  awaitingReview,
}: {
  sellable: number;
  hidden: number;
  awaitingReview: number;
}) {
  const stats = [
    { label: "מוכנים לפרסום", value: sellable, Icon: CheckCircle2, accent: "text-emerald-300", ring: "ring-emerald-400/20" },
    { label: "לא יופיעו באתר", value: hidden, Icon: EyeOff, accent: "text-white/50", ring: "ring-white/10" },
    { label: "ממתינים לבדיקה", value: awaitingReview, Icon: Clock, accent: "text-amber-300", ring: "ring-amber-400/20" },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {stats.map(({ label, value, Icon, accent, ring }) => (
        <SalesGlassPanel key={label} className={`p-5 ring-1 ${ring}`}>
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">{label}</span>
            <Icon className={`h-5 w-5 ${accent}`} />
          </div>
          <div className={`mt-3 text-3xl font-bold ${accent}`}>{value}</div>
        </SalesGlassPanel>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create the product preview grid**

```tsx
// src/components/SalesSite/SalesProductPreviewGrid.tsx
"use client";

import { useMemo } from "react";
import type { CatalogItem } from "@/types/catalog";
import { resolveProductImage } from "@/components/CatalogShowcase/constants";
import { SalesGlassPanel } from "./SalesGlassPanel";

function ProductGlassCard({ item, muted = false }: { item: CatalogItem; muted?: boolean }) {
  const img = resolveProductImage(item.metadata);
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl transition-all hover:-translate-y-1 hover:border-white/25 hover:shadow-[0_12px_40px_rgba(29,111,216,0.25)] ${
        muted ? "opacity-45 saturate-50" : ""
      }`}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-navy-700/60 to-navy-900/60">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt={item.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-4xl font-bold text-white/30">{item.name.slice(0, 1)}</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-navy-950/70 via-transparent to-transparent" />
      </div>
      <div className="p-4">
        <h3 className="truncate text-sm font-semibold text-white">{item.name}</h3>
        <p className="mt-1 truncate text-xs text-white/50">{item.category || "—"}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-bold text-white">
            {item.defaultPrice != null ? `₪${item.defaultPrice.toLocaleString()}` : "—"}
          </span>
          {!muted && (
            <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
              מוכן לפרסום
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function SalesProductPreviewGrid({
  sellableItems,
  hiddenItems,
}: {
  sellableItems: CatalogItem[];
  hiddenItems: CatalogItem[];
}) {
  const previewSellable = useMemo(() => sellableItems.slice(0, 10), [sellableItems]);
  const previewHidden = useMemo(() => hiddenItems.slice(0, 5), [hiddenItems]);

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">מוצרים שמוכנים לפרסום</h2>
          <span className="text-sm text-white/50">{sellableItems.length} מוצרים</span>
        </div>
        {previewSellable.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {previewSellable.map((item) => (
              <ProductGlassCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <SalesGlassPanel className="p-8 text-center">
            <p className="text-sm text-white/50">אין כרגע מוצרים פעילים. ניתן להפעיל מוצרים במסך הקטלוג.</p>
          </SalesGlassPanel>
        )}
      </section>

      {previewHidden.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white/70">מוצרים שלא יופיעו באתר</h2>
            <span className="text-sm text-white/40">{hiddenItems.length} מוצרים</span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {previewHidden.map((item) => (
              <ProductGlassCard key={item.id} item={item} muted />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create the future-modules tiles**

```tsx
// src/components/SalesSite/SalesFutureModules.tsx
"use client";

import { LayoutTemplate, Tags, PackageCheck, Eye, Settings2 } from "lucide-react";

const MODULES = [
  { label: "ניהול תצוגת אתר", Icon: LayoutTemplate },
  { label: "קטגוריות מכירה", Icon: Tags },
  { label: "מוצרים לפרסום", Icon: PackageCheck },
  { label: "תצוגה מקדימה", Icon: Eye },
  { label: "הגדרות אתר", Icon: Settings2 },
];

export function SalesFutureModules() {
  return (
    <section>
      <h2 className="mb-4 text-lg font-bold text-white">מודולים עתידיים</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {MODULES.map(({ label, Icon }) => (
          <div
            key={label}
            aria-disabled
            className="relative cursor-not-allowed rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl"
          >
            <Icon className="h-6 w-6 text-white/40" />
            <div className="mt-4 text-sm font-medium text-white/70">{label}</div>
            <span className="mt-2 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/50">בקרוב</span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Create the page composition (`SalesSitePage`)**

```tsx
// src/components/SalesSite/index.tsx
"use client";

import { useMemo } from "react";
import type { CatalogItem } from "@/types/catalog";
import { useCatalogContext } from "@/context/CatalogContext";
import { isSellable, statusBucket } from "@/lib/catalog/sellable";
import { SalesHero } from "./SalesHero";
import { SalesStatsCards } from "./SalesStatsCards";
import { SalesProductPreviewGrid } from "./SalesProductPreviewGrid";
import { SalesFutureModules } from "./SalesFutureModules";

export function SalesSitePage() {
  const { items } = useCatalogContext();

  const { sellableItems, hiddenItems, awaitingReview } = useMemo(() => {
    const sellable: CatalogItem[] = [];
    const hidden: CatalogItem[] = [];
    let awaiting = 0;
    for (const item of items) {
      if (isSellable(item)) {
        sellable.push(item);
      } else {
        hidden.push(item);
        if (statusBucket(item) === "needs_review") awaiting += 1;
      }
    }
    return { sellableItems: sellable, hiddenItems: hidden, awaitingReview: awaiting };
  }, [items]);

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-navy-950 via-navy-900 to-navy-950 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <SalesHero sellableCount={sellableItems.length} />
        <SalesStatsCards
          sellable={sellableItems.length}
          hidden={hiddenItems.length}
          awaitingReview={awaitingReview}
        />
        <SalesProductPreviewGrid sellableItems={sellableItems} hiddenItems={hiddenItems} />
        <SalesFutureModules />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create the route wrapper**

```tsx
// src/app/sales-site/page.tsx
import { SalesSitePage } from "@/components/SalesSite";

export default function Page() {
  return <SalesSitePage />;
}
```

- [ ] **Step 8: Add the `Store` icon to the Sidebar imports**

In `src/components/Sidebar.tsx`, add `Store` to the existing `lucide-react` import (alongside `LayoutGrid`, `Layers`, etc.).

- [ ] **Step 9: Add the nav item to the בנוסף section**

In `src/components/Sidebar.tsx`, in the בנוסף `NavSection` (catalog items at lines 84-86), add after the `holographic-catalog` line (line 86):

```tsx
      { tabId: "catalog", href: "/sales-site", label: "אתר מכירה", icon: <Store className={ICON_CLS} />, matchFn: (p) => p.startsWith("/sales-site"), noBadge: true },
```

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add src/components/SalesSite/ src/app/sales-site/page.tsx src/components/Sidebar.tsx
git commit -m "feat(sales-site): premium glassmorphism אתר מכירה page reading the active pool"
```

---

## Task 9: Full verification — build, tests, runtime protocol, data safety

**Files:** none (verification + runtime checks).

- [ ] **Step 1: Run the unit tests**

Run: `npm run test`
Expected: all pass, including `src/lib/catalog/__tests__/sellable.test.ts`.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors in changed files.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds; `/sales-site` appears in the route manifest.

- [ ] **Step 4: Runtime UI verification (per AGENTS.md protocol)**

```bash
git branch --show-current          # confirm main
git log --oneline -3               # confirm latest commits present
lsof -ti :3000 || npm run dev &     # ensure a dev server started AFTER these changes
# wait for ✓ Ready
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/catalog       # expect 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/sales-site    # expect 200
```

If the dev server was already running from before the changes, restart it: `kill $(lsof -ti :3000); npm run dev &`. Then instruct the user to hard-refresh (Cmd+Shift+R).

- [ ] **Step 5: Manual UI checks (golden path)**

In the browser at `/catalog`:
- Chips show `כל המוצרים (245) · פעילים (108) · ממתינים לבדיקה (137) · לא פעילים (0)`.
- Click `ממתינים לבדיקה` → only needs_review rows; each shows the amber `ממתין לבדיקה` pill.
- Click `מצב בחירה` → view switches to table, checkboxes appear; `בחר הכל` selects the 137; the bulk bar shows `נבחרו 137 מוצרים`.
- Select a small subset (e.g. 2), click `הפעל נבחרים (2)`, confirm → those rows become `פעיל`, leave the needs-review bucket, counts update (active +2, needs_review −2).
At `/sales-site` (premium page, RTL):
- Renders the dark glass canvas with the `אתר מכירה` hero — not a light admin table.
- Hero count + the "מוכנים לפרסום" stat equal the active chip count from `/catalog`.
- "מוצרים שמוכנים לפרסום" grid shows real active products (images via `resolveProductImage`, gradient fallback otherwise); none of the inactive/needs_review items appear there.
- "מוצרים שלא יופיעו באתר" shows inactive/needs_review items muted; "ממתינים לבדיקה" stat matches `/catalog`.
- Future-module tiles (`ניהול תצוגת אתר`, `קטגוריות מכירה`, `מוצרים לפרסום`, `תצוגה מקדימה`, `הגדרות אתר`) render as disabled "בקרוב".
- Activate a product in `/catalog`, return to `/sales-site` → it moves into the "ready to publish" grid (realtime/context update); no out-of-stock concept appears anywhere.

- [ ] **Step 6: Data-safety SQL checks (read-only)**

Via Supabase MCP `execute_sql` (project `gtevmcnasvrahzfdqrqk`):

```sql
-- Activated items must have lost the needs_review flag; total never changes.
select count(*) as total,
       count(*) filter (where is_active) as active,
       count(*) filter (where not is_active and metadata->>'review_state' = 'needs_review') as needs_review,
       count(*) filter (where not is_active and (metadata->>'review_state') is distinct from 'needs_review') as inactive
from catalog_items;
```
Expected: `total` stays 245; `active + needs_review + inactive = total`; activated rows moved from needs_review to active.

- [ ] **Step 7: Historical-order safety check**

Confirm an existing order that references a now-inactive product still renders. Open an order in `/orders` whose row has a `catalogItemId` pointing at an inactive item; the row must still display its stored `catalogItemName`/`catalogItemUnit` (snapshot in the order JSONB) and show the stale-link indicator rather than disappearing. No data change expected — this verifies the contract, not a code edit.

- [ ] **Step 8: Final report**

Produce the completion report (per the project's required format) covering: schema findings, field reuse, scraped-product handling, bulk activate/deactivate behavior, filtering verification across order/Telegram/Jarvis/sales-site, historical-order safety, files changed, the migration, tests/build results, rollback risks, and the go/no-go for next steps.

The report MUST include a dedicated section titled **"אתר מכירה UX/UI"** covering:
- what was created visually (dark glass canvas, hero, stat cards, product preview, future modules);
- which components were added (`SalesGlassPanel`, `SalesHero`, `SalesStatsCards`, `SalesProductPreviewGrid`, `SalesFutureModules`, `SalesSitePage`);
- how the glass/futuristic design was implemented (backdrop-blur, translucent layers, ambient gradient blobs, glow rings, navy gradient canvas, RTL);
- how active products are shown (shared `isSellable` → "מוכנים לפרסום" grid with real images);
- how inactive products are excluded from the sellable pool (shown only in the muted "לא יופיעו באתר" strip; out-of-stock never referenced);
- what remains for future sales-site development (the disabled coming-soon modules, and that no cart/checkout/payment/accounts exist yet by design).

---

## Rollback Risks & Notes

- **Migration is additive.** Rollback = `drop function set_catalog_active(text[], boolean);`. No table/column/data change.
- **Activation clears `needs_review` irreversibly.** Once activated, an item no longer carries the imported-batch flag (by design). This is not auto-recoverable; re-marking would be a manual metadata edit. Acceptable per spec §5.
- **Optimistic bulk rollback:** `setActiveBulk` snapshots originals and restores all rows on RPC error; realtime UPDATE events re-sync afterward. Low divergence risk.
- **No destructive operations:** no deletes; only `is_active`, `updated_at`, and the single `review_state` metadata key are touched.
- **Permissions:** bulk actions inherit existing catalog-tab access; tightening to manager/master is a deferred follow-up, not in scope.
- **Code changes are revertable per commit** — each task is its own commit.

## Test / Build Commands (summary)

```bash
npx vitest run src/lib/catalog/__tests__/sellable.test.ts   # Task 2
npx tsc --noEmit                                             # after each code task
npm run test                                                 # Task 9
npm run lint                                                 # Task 9
npm run build                                                # Task 9
```
