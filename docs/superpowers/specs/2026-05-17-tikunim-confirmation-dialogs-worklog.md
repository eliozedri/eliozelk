# Spec: TIKUNIM 17/5/26 — Confirmation Dialogs & Work Log Fixes

**Date:** 2026-05-17  
**Session:** TIKUNIM 17/5/26  
**Status:** Ready for implementation  

---

## Summary

Fix multiple operational safety and UX problems found during real pilot usage:

1. Missing confirmation dialogs on critical business-state actions (orders, accounting, graphics)
2. Permanent invoice/order deletion with two-step safeguard (both archive + invoiced history tabs)
3. Archive restore confirmations (orders)
4. Work log simplification for field workers

---

## Database Dependency Analysis — Permanent Delete Safety

Before implementing `deleteOrder(id)`, the following FK graph was inspected:

| Dependent Table | FK Type | On Delete Behavior |
|---|---|---|
| `order_problems` | Hard FK `REFERENCES work_orders(id)` | `CASCADE` — rows deleted automatically ✓ |
| `order_activities` | Hard FK `REFERENCES work_orders(id)` | `CASCADE` — rows deleted automatically ✓ |
| `work_diaries` | Hard FK `REFERENCES work_orders(id)` | `SET NULL` — diary record survives, `order_id` becomes null ✓ |
| `inventory_consumptions` | Soft text ref (intentionally no FK) | Orphaned rows remain — acceptable, analytics/reconciliation only |
| `inventory_reservations` | Soft text ref (intentionally no FK, comment in migration confirms this) | Orphaned rows remain — acceptable |
| `profitability_snapshots` | Soft text ref (no FK) | Orphaned rows remain — acceptable |

**Verdict: True hard delete is safe.** Cascade handles structured dependencies. Orphaned analytics rows cause no integrity violations or runtime errors. The app does not query these tables by order_id at startup or in core flows.

Implementation: `db.from("work_orders").delete().eq("id", id)` — same pattern as `deleteDiary`.

---

## Part 1 — Shared ConfirmDialog Component

### New file: `src/components/ui/ConfirmDialog.tsx`

A reusable overlay modal for simple one-step confirmations. Does NOT replace the existing specialized modals (`CancelOrderModal`, `CompleteOrderModal`, `ApproveToBillingModal`) — those stay untouched.

**Props:**
```ts
interface ConfirmDialogProps {
  title: string;
  body: React.ReactNode;           // contextual detail (order #, customer, what changes)
  confirmLabel: string;
  cancelLabel?: string;            // default: "ביטול"
  variant: "warning" | "destructive" | "info";
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  loading?: boolean;
}
```

**Visual structure:**
- Full-screen dark overlay (same as existing modals)
- Centered card with icon (amber triangle for warning, red circle-X for destructive, blue info for info)
- Title + body (body is React node so it can include structured data)
- Two buttons: confirm (right, colored) + cancel (left, outlined)
- `dir="rtl"` at card level
- While `loading`, confirm button shows spinner and is disabled

---

## Part 2 — Orders Table Missing Confirmations

### File: `src/components/OrdersTable/index.tsx`

**Current problems:**
- X (cancel) button in `OrderRow` calls `onUpdateStatus(id, "cancelled")` directly — no dialog
- "שלח לייצור" calls `onUpdateStatus(order.id, "production")` directly
- "מוכן להתקנה" (from production) calls `onUpdateStatus(order.id, "ready_installation")` directly  
- "✓ אישור לקוח" calls `onApproveCustomer(order.id)` directly

**Fix:**

Add to `OrdersTable` state:
```ts
const [cancelingOrder, setCancelingOrder] = useState<WorkOrder | null>(null);
const [pendingStatusChange, setPendingStatusChange] = useState<{
  order: WorkOrder;
  nextStatus: WorkOrderStatus;
  title: string;
  body: string;
} | null>(null);
```

Update `OrderRow` props to add `onRequestCancel` and `onRequestStatusChange`:
- X cancel button → calls `onRequestCancel(order)` → parent sets `cancelingOrder`
- "שלח לייצור" → calls `onRequestStatusChange(order, "production", ...)`
- "מוכן להתקנה" → calls `onRequestStatusChange(order, "ready_installation", ...)`
- "✓ אישור לקוח" → calls `onRequestStatusChange(order, same status, "אישור לקוח התקבל", ...)`

Note: `onApproveCustomer` changes a sub-field (`customerApprovalStatus`), not the main `status`. Treat it the same way — intercept and confirm via `ConfirmDialog`.

At the bottom of `OrdersTable` JSX, render:
1. `{cancelingOrder && <CancelOrderModal order={cancelingOrder} onConfirm={...} onClose={() => setCancelingOrder(null)} />}`
2. `{pendingStatusChange && <ConfirmDialog ... onClose={() => setPendingStatusChange(null)} />}`

**Confirmation text examples (Hebrew):**

| Action | Title | Body |
|---|---|---|
| שלח לייצור | "העברה לשלב ייצור" | "הזמנה #{orderNumber} · {customer} תועבר לשלב ייצור. הפעולה ניתנת לביטול בשלב זה." |
| מוכן להתקנה | "סימון כמוכן להתקנה" | "הזמנה #{orderNumber} · {customer} תסומן כמוכנה להתקנה וניתן יהיה לסגור אותה תפעולית." |
| אישור לקוח | "אישור קבלת אישור לקוח" | "הזמנה #{orderNumber} · {customer} — מאשר שאישור לקוח התקבל. פעולה זו מסירה את דגל 'ממתין לאישור לקוח'." |

**Full audit of all action buttons in `OrderRow`:**

| Button | Current behavior | Fix |
|---|---|---|
| X (cancel) | Direct `updateStatus(cancelled)` | → `CancelOrderModal` via `onRequestCancel` |
| שלח לייצור (graphics_done + fab/wh required) | Direct update | → `ConfirmDialog` via `onRequestStatusChange` |
| מוכן להתקנה (graphics_done, no fab/wh) | Direct update | → `ConfirmDialog` |
| מוכן להתקנה (from production) | Direct update | → `ConfirmDialog` |
| ✓ אישור לקוח התקבל | Direct `approveCustomer` | → `ConfirmDialog` |
| סמן כהושלם תפעולית | Already uses `CompleteOrderModal` ✓ | No change |
| PDF / CSV | Export only, no state change | No confirmation needed |

---

## Part 3 — Accounting Confirmations, Restore, Permanent Delete

### File: `src/components/Accounting/index.tsx`

#### 3a. Restore from archive — add confirmation

**Current:** `handleRestoreOrder(order)` called directly from button.

**Fix:** Add state `confirmingRestoreOrder: WorkOrder | null`. Button sets it. `ConfirmDialog` renders:
- Title: "שחזור הזמנה מהארכיון"
- Body: "הזמנה #{orderNumber} · {customer} תשוחזר לסטטוס 'מוכן להתקנה' ותחזור לטבלת ההזמנות הפעילות. סטטוס החיוב יאופס לפניית אימות מחדש."
- Confirm: "שחזר הזמנה"
- Variant: warning

#### 3b. Issue invoice — add confirmation

**Current:** "הנפק חשבונית" / "סמן כחויב" in both the billing queue and approved-billing section call `handleMarkInvoiced(order)` directly.

**Fix:** Add state `confirmingInvoiceOrder: WorkOrder | null`. Both buttons set it instead of calling directly. `ConfirmDialog` renders:
- Title: "הנפקת חשבונית"
- Body: "הזמנה #{orderNumber} · {customer}. סכום לחיוב: ₪{billedAmount || 'לא הוזן'}. מס׳ חשבונית: {invoiceNumber || 'לא הוזן'}. הפעולה תסמן את ההזמנה כחויבה ותעביר אותה להיסטוריית חיוב."
- Confirm: "אשר הנפקה"
- Variant: info

After confirmation → call the existing `handleMarkInvoiced(confirmingInvoiceOrder)`.

#### 3c. Permanent delete — new feature (both tabs)

**New state:**
```ts
const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<WorkOrder | null>(null);
```

**New component: `PermanentDeleteModal`** (defined inside or alongside `Accounting/index.tsx`)

Two-step flow rendered in one modal:
- **Step 1** (initial render): Warning screen
  - Red icon, title "מחיקה לצמיתות"
  - "הזמנה #{orderNumber} · {customer} תימחק לצמיתות מהמערכת. פעולה זו אינה ניתנת לביטול ולא ניתן לשחזר את הנתונים."
  - "פרטים נוספים שיימחקו: פעילויות הזמנה, בעיות פתוחות. יומני שטח המקושרים להזמנה זו לא יימחקו אך הקישור ינותק."
  - Button: "המשך למחיקה" → advances to step 2
  - Button: "ביטול"

- **Step 2**: Confirmation with checkbox
  - "לפני המחיקה הסופית:"
  - Checkbox: label = "קראתי ואני מאשר/ת שהמחיקה היא לצמיתות ולא ניתנת לשחזור"
  - "מחק לצמיתות" button — **disabled until checkbox is checked**
  - "חזרה" button → goes back to step 1
  - On confirm: calls `deleteOrder(order.id)` → closes modal

**UI placement:**
- Archive tab ("ארכיון חשבוניות"): add small red "מחק" button beside each row's existing "שחזר" button
- Invoiced history tab ("היסטוריית חיוב"): add small red "מחק" button in a new column

#### 3d. New `deleteOrder` function in orders hook

**File to update:** wherever `useOrders` hook is defined (find and update).

Add:
```ts
const deleteOrder = useCallback(async (id: string): Promise<void> => {
  // Optimistic: remove from local state immediately
  const original = ref.current.find(o => o.id === id);
  setOrders(prev => prev.filter(o => o.id !== id));
  const db = getSupabase();
  if (db) {
    const { error } = await db.from("work_orders").delete().eq("id", id);
    if (error) {
      // Rollback
      if (original) setOrders(prev => [original, ...prev]);
      throw error;
    }
  }
}, []);
```

Expose via `OrdersContext` (add to interface + provider value).

---

## Part 4 — Graphics Confirmations

### File: `src/components/Graphics/index.tsx`

#### 4a. "אשר קבלה" — add confirmation

**Current:** `handleAction()` calls `onAcknowledge()` directly when `isPending`.

**Fix:** Change the condition in `handleAction`:
```ts
async function handleAction() {
  if (isPending) {
    setShowConfirm(true);  // was: setActionState("saving"); await onAcknowledge?.()
  } else {
    setShowConfirm(true);
  }
}
```

Use the existing `showConfirm` state and modal, but render different content depending on `isPending`.

#### 4b. Enrich the existing "סמן כהושלם" / "אשר קבלה" modal

**Current modal content:** "האם ההזמנה מוכנה ולאישור להתקנה?" — no order context.

**Updated modal content (for both actions, switching on `isPending`):**

When `isPending` (acknowledging — graphics_pending → graphics_active):
- Title: "אישור קבלת הזמנה לטיפול"
- Body: "הזמנה #{order.orderNumber} · {order.customer} תועבר לסטטוס 'בטיפול גרפיקה'. האישור מסמן שהגרפיקאי קיבל את ההזמנה לידיו."
- Confirm: "אשר קבלה"

When not `isPending` (completing — graphics_active → graphics_done):
- Title: "סיום עבודת גרפיקה"
- Body: "הזמנה #{order.orderNumber} · {order.customer} תסומן כהושלמה גרפית ותועבר לשלב הבא (ייצור / מוכן להתקנה)."
- Confirm: "סמן כהושלם"

Both: Cancel button = "ביטול"

The existing `showConfirm` state + modal block in `GraphicsOrderCard` is reused — only the content is updated.

---

## Part 5 — Work Log Field Worker Simplification

### File: `src/types/workDiary.ts` — `createEmptyDiary()`

```ts
// Add auto-fill for startTime
const now = new Date();
const startTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

// Already: executionDate: today ✓
// Add: startTime: startTime (was: "")
```

This sets startTime once when the diary is first created. It does NOT reset on edit because edits go through `saveDiary()` which patches existing diary state — `createEmptyDiary` is only called for new diaries.

### File: `src/components/WorkDiary/DiaryHeader.tsx`

**Change 1 — Remove phone field:**
Delete the `<Field label="טלפון">` block (currently line ~122). This includes the `<input type="tel">` for `contactPhone`. The `contactPhone` field remains in the TypeScript type (it's in the shared WorkDiary interface and may be used in PDF generation) — only removed from the UI form.

**Change 2 — Hide "פרטי ביצוע" section for field workers:**
Wrap the entire `<SectionCard title="פרטי ביצוע">` block with `{!isWorker && (...)}`. This hides vehicle number, trailer number, driver name, and the full time breakdown sub-section.

**Change 3 — Hide "חיוב ועלויות" section for field workers:**
This section is already wrapped: `{!isWorker && (<SectionCard title="חיוב ועלויות" accent> ...)}` — verify and confirm it remains correct.

**Result for field workers in "פרטי עבודה" tab:**
- שם חברה / לקוח ✓
- שם עבודה / אתר עבודה ✓
- תאריך ביצוע (auto-filled, editable) ✓
- שעת תחילה (auto-filled, editable) ✓
- שעת סיום ✓
- איש קשר ✓
- ~~טלפון~~ — removed
- קישור להזמנה (already hidden from workers) ✓

Sections hidden from workers:
- ~~פרטי ביצוע~~ — newly hidden
- ~~חיוב ועלויות~~ — already hidden ✓

Tabs hidden from workers (via TabBar `workerMode`):
- ~~ניתוח רווחיות~~ — already hidden ✓

---

## Part 6 — Signature Validation

### File: `src/components/WorkDiary/index.tsx` — `handleSubmit()`

**Current validation:**
```ts
if (!diary.customerName.trim() || !diary.siteName.trim() || !diary.executionDate) {
  alert("...");
  setActiveTab("header");
  return;
}
```

**Add after the existing check:**
```ts
if (!diary.customerSignature?.dataUrl) {
  setSignatureError(true);
  setActiveTab("docs");
  // Show alert or use inline error state
  alert("נדרשת חתימת קבלן / מפקח לפני שליחת יומן העבודה. עבור ללשונית 'תיעוד' וחתום.");
  return;
}
```

Better: use local state `signatureError: boolean` instead of raw `alert()`, then:
- Pass `signatureError` to `DocumentTab`
- `DocumentTab` passes it to the first `SignatureBlock` (חתימת קבלן / מפקח)
- `SignatureBlock` shows a red border + message "חתימה נדרשת לפני השליחה" when `hasError` prop is true
- Clear `signatureError` when the user draws a signature

**Which signature is required:** `customerSignature` (חתימת קבלן / מפקח) — the external party's confirmation that work was done. `companySignature` (חתימת ראש צוות) remains optional.

**Props chain update:**
- `WorkDiaryForm` → add `signatureError` state
- Pass `signatureError` to `DocumentTab` via new prop `signatureError?: boolean`
- `DocumentTab` passes `hasError` to first `SignatureBlock`
- `SignatureBlock` uses `hasError` to show red border on the canvas and inline error text: "נדרשת חתימה לפני השליחה"
- When user draws (onChange fires with non-empty dataUrl), clear `signatureError` in parent via callback

---

## Part 7 — Diary Archive (no action needed)

Diary archive tab shows cancelled diaries for viewing only. No restore or delete button exists. No changes required.

If a future restore button is added there, it MUST use `ConfirmDialog` before executing.

---

## Implementation Order (for writing-plans)

Execute in this order to minimize merge conflicts and test early:

1. **Create `ConfirmDialog` component** — new file, no dependencies on other changes
2. **`createEmptyDiary` startTime** — small, isolated
3. **`DiaryHeader` field worker simplification** — remove phone, hide פרטי ביצוע
4. **Signature validation** — update `WorkDiaryForm`, `DocumentTab`, `SignatureBlock`
5. **Orders table confirmations** — add state + wire buttons + render modals
6. **Graphics confirmations** — enrich existing modal content
7. **Accounting: restore confirmation** — add state + ConfirmDialog
8. **Accounting: invoice confirmation** — add state + ConfirmDialog
9. **`deleteOrder` function** — add to orders hook + context
10. **`PermanentDeleteModal`** — new component
11. **Wire permanent delete buttons** into archive + invoiced history tabs

---

## Files to Modify

| File | Changes |
|---|---|
| `src/components/ui/ConfirmDialog.tsx` | **NEW** — shared confirmation primitive |
| `src/types/workDiary.ts` | Auto-fill `startTime` in `createEmptyDiary()` |
| `src/components/WorkDiary/DiaryHeader.tsx` | Remove phone field; hide פרטי ביצוע for workers |
| `src/components/WorkDiary/index.tsx` | Add signature validation in `handleSubmit`; add `signatureError` state |
| `src/components/WorkDiary/DocumentTab.tsx` | Pass `signatureError` prop; add error highlight to first SignatureBlock |
| `src/components/WorkDiary/SignatureCanvas.tsx` | (possibly) add `hasError` visual state |
| `src/components/OrdersTable/index.tsx` | Wire cancel to CancelOrderModal; add `pendingStatusChange` state; confirm all transitions |
| `src/components/Graphics/index.tsx` | Enrich existing confirm modal with order context; add confirm for "אשר קבלה" |
| `src/components/Accounting/index.tsx` | Add restore confirmation; add invoice confirmation; add permanent delete UI |
| Orders hook (find via grep) | Add `deleteOrder(id)` function |
| Orders context (find via grep) | Expose `deleteOrder` in interface + value |

---

## Risks and Extra-Care Areas

1. **`deleteOrder` is irreversible** — always guarded by `PermanentDeleteModal`'s two-step flow. Never expose as a one-click action.

2. **Orphaned analytics rows** — `inventory_consumptions`, `inventory_reservations`, `profitability_snapshots` will have orphaned `order_id` values after permanent delete. No DB errors, but if a future query filters these by order_id and then joins work_orders, it will return no match. This is acceptable for current architecture.

3. **`contactPhone` removal** — the `contactPhone` field remains in the `WorkDiary` TypeScript type. Old diary records that already have a phone stored will retain it in the database; it just won't be shown or editable in the form. If the PDF export (`WorkDiaryDocument.tsx`) uses `contactPhone`, verify it still renders correctly for old records (it will — the data is still there).

4. **Start time auto-fill** — only applies to NEW diaries created after this change. Existing diaries with empty `startTime` will still show empty. This is correct behavior.

5. **`signatureError` state reset** — must be cleared when: (a) user draws a signature, (b) user clicks "שמור טיוטה" (not a blocking action). Do NOT clear it when switching tabs — the user needs to see the error remain until they actually sign.

6. **Orders table cancel in `OrderRow`** — the X button is rendered inside `OrderRow`, which means `onRequestCancel` must be threaded through as a prop. Test that this does not break the existing cancel flow in Accounting (which already uses `CancelOrderModal` separately and independently).

---

## Build/Typecheck/Test Plan

1. `npm run build` — must pass with no TS errors
2. Manually test each confirmation dialog:
   - Orders table: cancel, שלח לייצור, מוכן להתקנה, אישור לקוח
   - Accounting: restore from archive, issue invoice, permanent delete (both steps)
   - Graphics: אשר קבלה, סמן כהושלם
3. Test work log as field_worker role:
   - Phone field not visible
   - פרטי ביצוע not visible
   - חיוב ועלויות not visible
   - Execution date auto-filled on new diary
   - Start time auto-filled on new diary
   - Editing existing diary does not reset date/time
4. Test signature validation:
   - Try submitting without signature → error, switch to docs tab
   - Draw signature → error clears
   - Submit with signature → succeeds
5. Test permanent delete:
   - Verify first warning shows
   - Verify "מחק לצמיתות" is disabled until checkbox checked
   - Verify order disappears from DB after deletion
   - Verify linked diaries remain (with null order_id)
