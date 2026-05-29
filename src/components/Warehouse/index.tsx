"use client";

import { useState, useCallback, useEffect } from "react";
import { useOrdersContext } from "@/context/OrdersContext";
import { useCatalogContext } from "@/context/CatalogContext";
import { useAuth } from "@/context/AuthContext";
import { getStockStatus, STOCK_STATUS_LABELS, STOCK_STATUS_COLORS } from "@/types/inventory";
import { getSupabase } from "@/lib/supabase/client";
import type { WorkOrder } from "@/types/workOrder";
import type { CatalogItem } from "@/types/catalog";
import type { MiscRow } from "@/types/order";
import { formatDate } from "@/lib/dateFormatting";

function UrgentBadge() {
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">דחוף</span>;
}

// ── Reconciliation status ─────────────────────────────────────────────────────

type ReconciliationStatus = "not_required" | "pending" | "reconciled" | "needs_review";

const RECONCILIATION_LABELS: Record<ReconciliationStatus, string> = {
  not_required: "לא נדרש",
  pending:      "ממתין להתאמת מלאי",
  reconciled:   "מלאי הותאם",
  needs_review: "דורש בדיקה",
};

const RECONCILIATION_COLORS: Record<ReconciliationStatus, string> = {
  not_required: "bg-gray-100 text-gray-500",
  pending:      "bg-amber-100 text-amber-700",
  reconciled:   "bg-green-100 text-green-700",
  needs_review: "bg-red-100 text-red-700",
};

// ── Order-prep column config ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; bg: string; border: string; badge: string }> = {
  pending:    { label: "ממתין להכנה",  bg: "bg-amber-50",  border: "border-amber-200",  badge: "bg-amber-100 text-amber-700" },
  processing: { label: "בהכנה",        bg: "bg-blue-50",   border: "border-blue-200",   badge: "bg-blue-100 text-blue-700" },
  ready:      { label: "מוכן",         bg: "bg-green-50",  border: "border-green-200",  badge: "bg-green-100 text-green-700" },
  completed:  { label: "הושלמו",       bg: "bg-gray-50",   border: "border-gray-200",   badge: "bg-gray-100 text-gray-600" },
};

// ── Availability badge for a single linked accessory row ─────────────────────

function AvailabilityBadge({ row, catalogMap }: { row: MiscRow; catalogMap: Map<string, CatalogItem> }) {
  if (!row.catalogItemId) return null;
  const item = catalogMap.get(row.catalogItemId);
  if (!item) return null;

  const needed    = parseFloat(row.quantity) || 0;
  const available = item.currentQuantity - item.reservedQuantity;

  let color = "bg-green-100 text-green-700";
  let label = `זמין: ${available} ${item.unitOfMeasure}`;
  if (available <= 0) {
    color = "bg-red-100 text-red-700";
    label = `חסר (${available} ${item.unitOfMeasure})`;
  } else if (needed > 0 && available < needed) {
    color = "bg-amber-100 text-amber-700";
    label = `חלקי: ${available}/${needed} ${item.unitOfMeasure}`;
  }

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ${color}`}>
      {label}
    </span>
  );
}

// ── Order card ────────────────────────────────────────────────────────────────

function OrderCard({
  order, catalogMap, reconciliationStatus, onReconcile,
}: {
  order: WorkOrder;
  catalogMap: Map<string, CatalogItem>;
  reconciliationStatus: ReconciliationStatus;
  onReconcile: (order: WorkOrder) => void;
}) {
  const { updateOrderFields, releaseWarehouseOrder } = useOrdersContext();
  const warehouseStatus = order.warehouseStatus ?? "pending";
  const cfg = STATUS_CONFIG[warehouseStatus] ?? STATUS_CONFIG.pending;
  const accessoryItems = (order.accessoryRows ?? []).filter(r => r.description?.trim());

  function advance() {
    if (warehouseStatus === "pending")    void updateOrderFields(order.id, { warehouseStatus: "processing" });
    if (warehouseStatus === "processing") {
      const now = new Date().toISOString();
      void updateOrderFields(order.id, { warehouseStatus: "ready", warehouseReadyAt: now });
    }
  }

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 flex flex-col gap-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-black text-gray-900">{order.orderNumber}</span>
            {order.priority === "urgent" && <UrgentBadge />}
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.badge}`}>{cfg.label}</span>
          </div>
          <span className="text-sm font-semibold text-gray-700 truncate">{order.customer}</span>
          {order.jobName && <span className="text-xs text-gray-500 truncate">{order.jobName}</span>}
        </div>
        <div className="text-xs text-gray-400 shrink-0">{formatDate(order.date)}</div>
      </div>

      {accessoryItems.length > 0 && (
        <ul className="text-xs text-gray-700 space-y-1.5 bg-white/70 rounded-lg px-3 py-2 border border-gray-100">
          {accessoryItems.map((row, i) => (
            <li key={i} className="flex flex-col gap-0.5">
              <div className="flex justify-between gap-2">
                <span className="truncate">{row.description}</span>
                {row.quantity && <span className="shrink-0 text-gray-500">× {row.quantity}</span>}
              </div>
              <AvailabilityBadge row={row} catalogMap={catalogMap} />
            </li>
          ))}
        </ul>
      )}

      {order.notes && (
        <p className="text-xs text-gray-500 bg-white/60 rounded-lg px-3 py-2 border border-gray-100 line-clamp-2">{order.notes}</p>
      )}

      {warehouseStatus !== "ready" && (
        <button type="button" onClick={advance}
          className={`w-full py-2 rounded-lg text-xs font-bold text-white transition-colors ${
            warehouseStatus === "pending" ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"
          }`}>
          {warehouseStatus === "pending" ? "אשר קבלה — התחל הכנה" : "סמן כמוכן"}
        </button>
      )}

      {warehouseStatus === "ready" && (
        <button
          type="button"
          onClick={() => void releaseWarehouseOrder(order.id)}
          className="w-full py-2 rounded-lg text-xs font-bold text-white transition-colors bg-teal-600 hover:bg-teal-700 flex items-center justify-center gap-1.5"
        >
          <span>🚛</span>
          <span>שחרר לביצוע שטח</span>
        </button>
      )}

      {/* Reconciliation status + manual trigger */}
      {reconciliationStatus !== "not_required" && (
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${RECONCILIATION_COLORS[reconciliationStatus]}`}>
            {RECONCILIATION_LABELS[reconciliationStatus]}
          </span>
          {reconciliationStatus === "pending" && (
            <button
              type="button"
              onClick={() => onReconcile(order)}
              className="text-xs px-2 py-1 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 font-semibold transition-colors border border-amber-200"
            >
              בצע התאמת מלאי
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Stock adjustment modal ────────────────────────────────────────────────────

interface AdjustModalProps {
  item: CatalogItem;
  onClose: () => void;
  onSave: (delta: number, movementType: "receive" | "consume" | "adjustment" | "correction" | "return", notes: string) => Promise<void>;
}

function AdjustModal({ item, onClose, onSave }: AdjustModalProps) {
  const [direction, setDirection] = useState<"add" | "subtract">("add");
  const [qty, setQty] = useState("");
  const [movType, setMovType] = useState<"receive" | "consume" | "adjustment" | "correction" | "return">("receive");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const DIRECTION_TYPES = {
    add:      ["receive", "return", "adjustment"] as const,
    subtract: ["consume", "adjustment", "correction"] as const,
  };

  const MOV_LABELS: Record<string, string> = {
    receive: "קבלת סחורה", consume: "צריכה", adjustment: "התאמה ידנית",
    correction: "תיקון", return: "החזרה",
  };

  async function handleSave() {
    const n = parseFloat(qty);
    if (!qty || isNaN(n) || n <= 0) { setErr("הזן כמות חיובית"); return; }
    setSaving(true); setErr("");
    try {
      await onSave(direction === "add" ? n : -n, movType, notes);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4 max-h-[90dvh] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-gray-900">עדכון מלאי — {item.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="bg-gray-50 rounded-xl px-4 py-2 text-sm text-gray-600">
          כמות נוכחית: <strong>{item.currentQuantity}</strong> {item.unitOfMeasure}
        </div>

        {/* Direction */}
        <div className="grid grid-cols-2 gap-2">
          {(["add", "subtract"] as const).map(d => (
            <button key={d} type="button" onClick={() => { setDirection(d); setMovType(DIRECTION_TYPES[d][0]); }}
              className={`py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${
                direction === d ? (d === "add" ? "border-green-500 bg-green-50 text-green-700" : "border-red-400 bg-red-50 text-red-700") : "border-gray-200 text-gray-500"
              }`}>
              {d === "add" ? "＋ הוספה" : "－ הפחתה"}
            </button>
          ))}
        </div>

        {/* Quantity */}
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">כמות ({item.unitOfMeasure})</label>
          <input type="number" min="0.01" step="0.01" value={qty} onChange={e => setQty(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            placeholder="0" />
        </div>

        {/* Movement type */}
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">סוג פעולה</label>
          <select value={movType} onChange={e => setMovType(e.target.value as typeof movType)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
            {DIRECTION_TYPES[direction].map(t => (
              <option key={t} value={t}>{MOV_LABELS[t]}</option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">הערות (נשמר ביומן תנועות)</label>
          <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
            placeholder="סיבה לעדכון..." />
        </div>

        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          כל עדכון מלאי נרשם ביומן תנועות מלאי לצורך ביקורת. לא ניתן למחוק רשומות.
        </p>

        {err && <p className="text-xs text-red-600">{err}</p>}

        <button onClick={handleSave} disabled={saving}
          className="w-full py-2.5 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white transition-colors">
          {saving ? "שומר..." : "שמור עדכון מלאי"}
        </button>
      </div>
    </div>
  );
}

// ── Reservation detail per item ───────────────────────────────────────────────

interface OrderReservation { orderNumber: string; qty: number; orderId: string }

function ReservationDetail({ reservations }: { reservations: OrderReservation[] }) {
  if (reservations.length === 0) return null;
  return (
    <div className="mt-1 text-xs text-gray-500 space-y-0.5">
      {reservations.map((r, i) => (
        <div key={i} className="flex gap-1">
          <span className="text-amber-600 font-semibold">{r.orderNumber}</span>
          <span>← {r.qty}</span>
        </div>
      ))}
    </div>
  );
}

// ── Inventory item row ─────────────────────────────────────────────────────────

function InventoryRow({
  item, onAdjust, reservationsByItem,
}: {
  item: CatalogItem;
  onAdjust: (item: CatalogItem) => void;
  reservationsByItem: Map<string, OrderReservation[]>;
}) {
  const [showReservations, setShowReservations] = useState(false);
  const stockStatus = getStockStatus(item.currentQuantity, item.minimumQuantity);
  const statusLabel = STOCK_STATUS_LABELS[stockStatus];
  const statusColor = STOCK_STATUS_COLORS[stockStatus];
  const available      = item.currentQuantity - item.reservedQuantity;
  const itemReservations = reservationsByItem.get(item.id) ?? [];

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors align-top">
      <td className="px-3 py-2.5 text-sm font-semibold text-gray-900">{item.name}</td>
      <td className="px-3 py-2.5 text-xs text-gray-500">{item.category}</td>
      <td className="px-3 py-2.5 text-sm text-center font-mono">{item.currentQuantity}</td>
      <td className="px-3 py-2.5 text-sm text-center font-mono text-gray-500">{item.minimumQuantity || "—"}</td>
      <td className="px-3 py-2.5 text-sm text-center font-mono text-amber-700">
        {item.reservedQuantity > 0 ? (
          <button
            onClick={() => setShowReservations(v => !v)}
            className="underline decoration-dotted hover:text-amber-900 transition-colors"
            title="הצג הזמנות שומרות"
          >
            {item.reservedQuantity}
          </button>
        ) : "—"}
        {showReservations && itemReservations.length > 0 && (
          <ReservationDetail reservations={itemReservations} />
        )}
      </td>
      <td className="px-3 py-2.5 text-sm text-center font-mono">{available}</td>
      <td className="px-3 py-2.5 text-xs text-gray-500">{item.unitOfMeasure}</td>
      <td className="px-3 py-2.5">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor}`}>
          {statusLabel}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <button onClick={() => onAdjust(item)}
          className="text-xs px-2 py-1 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 font-semibold transition-colors">
          עדכן
        </button>
      </td>
    </tr>
  );
}

// ── Inventory panel ───────────────────────────────────────────────────────────

type StockFilter = "all" | "low_stock" | "negative" | "out_of_stock" | "untracked";

function InventoryPanel({ reservationsByItem }: { reservationsByItem: Map<string, OrderReservation[]> }) {
  const { items, adjustStock } = useCatalogContext();
  const { profile } = useAuth();
  const [filter, setFilter]     = useState<StockFilter>("all");
  const [search, setSearch]     = useState("");
  const [adjusting, setAdjusting] = useState<CatalogItem | null>(null);

  const activeItems = items.filter(i => i.isActive);

  const filteredItems = activeItems.filter(item => {
    const status = getStockStatus(item.currentQuantity, item.minimumQuantity);
    if (filter === "low_stock"   && status !== "low_stock")   return false;
    if (filter === "negative"    && status !== "negative")    return false;
    if (filter === "out_of_stock" && status !== "out_of_stock") return false;
    if (filter === "untracked"   && status !== "untracked")   return false;
    if (search && !item.name.toLowerCase().includes(search.toLowerCase()) && !item.category.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total:     activeItems.length,
    negative:  activeItems.filter(i => getStockStatus(i.currentQuantity, i.minimumQuantity) === "negative").length,
    out:       activeItems.filter(i => getStockStatus(i.currentQuantity, i.minimumQuantity) === "out_of_stock").length,
    low:       activeItems.filter(i => getStockStatus(i.currentQuantity, i.minimumQuantity) === "low_stock").length,
    untracked: activeItems.filter(i => getStockStatus(i.currentQuantity, i.minimumQuantity) === "untracked").length,
  };

  const handleAdjust = useCallback(async (delta: number, movementType: "receive" | "consume" | "adjustment" | "correction" | "return", notes: string) => {
    if (!adjusting) return;
    const res = await adjustStock(adjusting.id, delta, movementType, notes, profile?.name ?? "unknown");
    if (!res.ok) throw new Error(res.error ?? "שגיאה");
  }, [adjusting, adjustStock, profile?.name]);

  const FILTERS: { key: StockFilter; label: string; color: string; count: number }[] = [
    { key: "all",        label: "הכל",         color: "bg-gray-100 text-gray-700",   count: stats.total },
    { key: "negative",   label: "מלאי שלילי",  color: "bg-red-100 text-red-700",     count: stats.negative },
    { key: "out_of_stock", label: "חסר",        color: "bg-red-50 text-red-600",      count: stats.out },
    { key: "low_stock",  label: "מלאי נמוך",   color: "bg-amber-100 text-amber-700", count: stats.low },
    { key: "untracked",  label: "לא מנוהל",    color: "bg-gray-100 text-gray-500",   count: stats.untracked },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "פריטים פעילים", value: stats.total, color: "text-gray-900" },
          { label: "מלאי שלילי",   value: stats.negative, color: stats.negative > 0 ? "text-red-600" : "text-gray-400" },
          { label: "חסר",          value: stats.out,      color: stats.out      > 0 ? "text-orange-600" : "text-gray-400" },
          { label: "מלאי נמוך",    value: stats.low,      color: stats.low      > 0 ? "text-amber-600" : "text-gray-400" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters + Search */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.filter(f => f.key === "all" || f.count > 0).map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
              filter === f.key ? "ring-2 ring-teal-400 border-teal-400" : "border-gray-200"
            } ${f.color}`}>
            {f.label}
            {f.key !== "all" && <span className="font-black">{f.count}</span>}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש שם/קטגוריה..."
          className="mr-auto border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-400 w-48" />
      </div>

      {/* Table */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-gray-400 text-sm">
            {search ? `לא נמצאו פריטים מתאימים ל-"${search}"` : "אין פריטי מלאי פעילים"}
          </p>
          <p className="text-xs text-gray-400 mt-1">הוסף פריטים בקטלוג והגדר כמויות מינימום</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-right">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["שם פריט", "קטגוריה", "כמות", "מינימום", "שמור", "זמין", "יחידה", "סטטוס", ""].map(h => (
                  <th key={h} className="px-3 py-2.5 text-xs font-bold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => (
                <InventoryRow key={item.id} item={item} onAdjust={setAdjusting} reservationsByItem={reservationsByItem} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Adjust modal */}
      {adjusting && (
        <AdjustModal item={adjusting} onClose={() => setAdjusting(null)} onSave={handleAdjust} />
      )}
    </div>
  );
}

// ── Main Warehouse component ──────────────────────────────────────────────────

interface ConsumptionRecord {
  order_id: string;
  order_item_key: string | null;
  status: string;
  work_diary_id: string | null;
  quantity: number;
  metadata: { quantitySource?: string } | null;
}

interface DiaryRecord {
  id: string;
  order_id: string | null;
  status: string;
  approval_status: string;
}

interface DeliveryNoteRecord {
  id: string;
  supplier_name: string | null;
  document_number: string | null;
  received_date: string;
  status: string;
  notes: string;
  created_by: string;
  created_at: string;
}

interface ReturnRecord {
  orderId: string;
  orderNumber: string;
  catalogItemId: string;
  itemName: string;
  orderItemKey: string;
  consumedQty: number;
}

// ── Delivery Notes Panel ──────────────────────────────────────────────────────

const DN_STATUS_LABELS: Record<string, string> = {
  draft:    "טיוטה",
  counted:  "נספר",
  approved: "אושר",
  cancelled:"בוטל",
};

const DN_STATUS_COLORS: Record<string, string> = {
  draft:    "bg-gray-100 text-gray-600",
  counted:  "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  cancelled:"bg-red-100 text-red-600",
};

function DeliveryNotesPanel() {
  const [notes, setNotes] = useState<DeliveryNoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  // New note form state
  const [formOpen, setFormOpen] = useState(false);
  const [formSupplier, setFormSupplier] = useState("");
  const [formDocNum, setFormDocNum] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formNotes, setFormNotes] = useState("");

  async function fetchNotes() {
    const db = getSupabase();
    if (!db) return;
    const { data: { session } } = await db.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch("/api/inventory/delivery-notes", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) setNotes(await res.json() as DeliveryNoteRecord[]);
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void fetchNotes(); }, []);

  async function handleCreate() {
    if (!formDocNum && !formSupplier) { return; }
    setCreating(true);
    try {
      const db = getSupabase();
      if (!db) return;
      const { data: { session } } = await db.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/inventory/delivery-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ supplierName: formSupplier, documentNumber: formDocNum, receivedDate: formDate, notes: formNotes }),
      });
      if (res.ok) {
        setFormOpen(false); setFormSupplier(""); setFormDocNum(""); setFormNotes("");
        await fetchNotes();
      }
    } finally { setCreating(false); }
  }

  async function handleApprove(noteId: string) {
    setApproving(noteId); setMsg(null);
    try {
      const db = getSupabase();
      if (!db) return;
      const { data: { session } } = await db.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/inventory/delivery-notes/${noteId}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = await res.json() as { itemsReceived?: number; error?: string };
      if (res.ok) {
        setMsg({ id: noteId, text: `קולטו ${body.itemsReceived ?? 0} פריטים`, ok: true });
        await fetchNotes();
      } else {
        setMsg({ id: noteId, text: body.error ?? "שגיאה", ok: false });
      }
    } finally { setApproving(null); }
  }

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">טוען תעודות משלוח...</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-black text-gray-900">תעודות משלוח</h2>
        <button onClick={() => setFormOpen(v => !v)}
          className="px-3 py-2 rounded-xl text-xs font-bold bg-teal-600 text-white hover:bg-teal-700 transition-colors">
          + תעודה חדשה
        </button>
      </div>

      {/* Create form */}
      {formOpen && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3">
          <p className="text-sm font-bold text-gray-700">תעודת משלוח חדשה</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">ספק</label>
              <input value={formSupplier} onChange={e => setFormSupplier(e.target.value)} placeholder="שם ספק"
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">מספר תעודה</label>
              <input value={formDocNum} onChange={e => setFormDocNum(e.target.value)} placeholder="מספר תעודה"
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">תאריך קבלה</label>
              <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">הערות</label>
              <input value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="הערות"
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-400" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={creating || (!formDocNum && !formSupplier)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 transition-colors">
              {creating ? "יוצר..." : "צור תעודה"}
            </button>
            <button onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors">
              ביטול
            </button>
          </div>
        </div>
      )}

      {notes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-gray-400 text-sm">אין תעודות משלוח פעילות</p>
          <p className="text-xs text-gray-400 mt-1">צור תעודת משלוח חדשה לתיעוד קבלת סחורה</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["מספר תעודה", "ספק", "תאריך קבלה", "סטטוס", ""].map(h => (
                  <th key={h} className="px-3 py-2.5 text-xs font-bold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {notes.map(note => (
                <tr key={note.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2.5 font-semibold text-gray-900">{note.document_number ?? "—"}</td>
                  <td className="px-3 py-2.5 text-gray-600">{note.supplier_name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-gray-500">{note.received_date}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${DN_STATUS_COLORS[note.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {DN_STATUS_LABELS[note.status] ?? note.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-left">
                    {(note.status === "draft" || note.status === "counted") && (
                      <button onClick={() => handleApprove(note.id)} disabled={approving === note.id}
                        className="text-xs px-2 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 font-semibold transition-colors disabled:opacity-50">
                        {approving === note.id ? "מאשר..." : "אשר קליטה"}
                      </button>
                    )}
                    {msg?.id === note.id && (
                      <span className={`mr-2 text-xs ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Returns from Field Panel ──────────────────────────────────────────────────

function ReturnFromFieldPanel({
  returnCandidates,
  catalogMap,
}: {
  returnCandidates: ReturnRecord[];
  catalogMap: Map<string, CatalogItem>;
}) {
  const [returning, setReturning] = useState<string | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [returnNotes, setReturnNotes] = useState<Record<string, string>>({});
  const [msgs, setMsgs] = useState<Record<string, { text: string; ok: boolean }>>({});

  async function handleReturn(r: ReturnRecord) {
    const qty = parseFloat(returnQty[r.orderItemKey] ?? "");
    if (!qty || qty <= 0) return;
    const key = r.orderItemKey;
    setReturning(key);
    try {
      const db = getSupabase();
      if (!db) return;
      const { data: { session } } = await db.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/inventory/return-from-field", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          orderId: r.orderId,
          catalogItemId: r.catalogItemId,
          orderItemKey: r.orderItemKey,
          returnedQty: qty,
          notes: returnNotes[key] ?? `החזרה מהשטח | הזמנה ${r.orderNumber}`,
        }),
      });
      const body = await res.json() as { movementsWritten?: number; warnings?: string[]; error?: string };
      if (res.ok) {
        setMsgs(prev => ({ ...prev, [key]: { text: `הוחזרו ${qty} ${catalogMap.get(r.catalogItemId)?.unitOfMeasure ?? "יח׳"} למלאי`, ok: true } }));
      } else {
        setMsgs(prev => ({ ...prev, [key]: { text: body.error ?? "שגיאה", ok: false } }));
      }
    } finally { setReturning(null); }
  }

  if (returnCandidates.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
        <p className="text-gray-400 text-sm">אין החזרות מהשטח לאישור</p>
        <p className="text-xs text-gray-400 mt-1">פריטים שנצרכו על בסיס שריון יופיעו כאן לדיווח החזרה</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-black text-gray-900">החזרות מהשטח</h2>
      <p className="text-xs text-gray-500">פריטים אלו נצרכו על בסיס כמות שריון. דווח כמות שהוחזרה לאישור המלאי.</p>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-right text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["הזמנה", "פריט", "נצרך", "כמות שהוחזרה", "הערות", ""].map(h => (
                <th key={h} className="px-3 py-2.5 text-xs font-bold text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {returnCandidates.map(r => {
              const item = catalogMap.get(r.catalogItemId);
              const key = r.orderItemKey;
              const m = msgs[key];
              return (
                <tr key={key} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2.5 font-semibold text-gray-900">{r.orderNumber}</td>
                  <td className="px-3 py-2.5 text-gray-700">{r.itemName}</td>
                  <td className="px-3 py-2.5 text-gray-500 font-mono">{r.consumedQty} {item?.unitOfMeasure ?? ""}</td>
                  <td className="px-3 py-2.5">
                    <input type="number" min="0.01" step="0.01" max={r.consumedQty}
                      value={returnQty[key] ?? ""} onChange={e => setReturnQty(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder="0" className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-400" />
                  </td>
                  <td className="px-3 py-2.5">
                    <input value={returnNotes[key] ?? ""} onChange={e => setReturnNotes(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder="הערה"
                      className="w-36 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-400" />
                  </td>
                  <td className="px-3 py-2.5 text-left">
                    {m ? (
                      <span className={`text-xs ${m.ok ? "text-green-600" : "text-red-600"}`}>{m.text}</span>
                    ) : (
                      <button onClick={() => handleReturn(r)} disabled={returning === key || !returnQty[key]}
                        className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold disabled:opacity-40 transition-colors">
                        {returning === key ? "מדווח..." : "דווח החזרה"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Purchase Recommendations Panel ───────────────────────────────────────────

interface PurchaseRecommendationRecord {
  id: string;
  item_id: string;
  supplier_id: string | null;
  recommendation_type: string;
  current_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  minimum_quantity: number;
  recommended_quantity: number;
  urgency: string;
  status: string;
  reason: string;
  approved_by: string | null;
  approved_at: string | null;
  dismissed_reason: string | null;
  created_at: string;
}

const REC_URGENCY_LABELS: Record<string, string> = {
  critical: "קריטי",
  high:     "גבוה",
  medium:   "בינוני",
  low:      "נמוך",
};

const REC_URGENCY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high:     "bg-orange-100 text-orange-700",
  medium:   "bg-amber-100 text-amber-700",
  low:      "bg-gray-100 text-gray-600",
};

const REC_STATUS_LABELS: Record<string, string> = {
  draft:                    "טיוטה",
  pending_approval:         "ממתין לאישור",
  approved_internal:        "אושר פנימית",
  dismissed:                "נדחה",
  converted_to_order_later: "הועבר להזמנה",
  resolved:                 "טופל",
};

const REC_STATUS_COLORS: Record<string, string> = {
  draft:                    "bg-gray-100 text-gray-600",
  pending_approval:         "bg-blue-100 text-blue-700",
  approved_internal:        "bg-green-100 text-green-700",
  dismissed:                "bg-red-50 text-red-500",
  converted_to_order_later: "bg-purple-100 text-purple-700",
  resolved:                 "bg-teal-100 text-teal-700",
};

const REC_TYPE_LABELS: Record<string, string> = {
  low_stock:        "מלאי נמוך",
  out_of_stock:     "חסר",
  over_reserved:    "שריון חורג",
  negative_stock:   "מלאי שלילי",
  delivery_note_gap:"פער תעודה",
  manual:           "ידני",
};

function PurchaseRecommendationsPanel({ catalogMap }: { catalogMap: Map<string, CatalogItem> }) {
  const [recs, setRecs] = useState<PurchaseRecommendationRecord[]>([]);
  const [suppMap, setSuppMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Record<string, { text: string; ok: boolean }>>({});
  const [editQty, setEditQty] = useState<Record<string, string>>({});

  async function fetchRecs() {
    const db = getSupabase();
    if (!db) return;
    const { data: { session } } = await db.auth.getSession();
    if (!session?.access_token) return;
    const [res, suppRes] = await Promise.all([
      fetch("/api/inventory/purchase-recommendations", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }),
      db.from("suppliers").select("id,name").eq("is_active", true).limit(200),
    ]);
    if (res.ok) setRecs(await res.json() as PurchaseRecommendationRecord[]);
    if (!suppRes.error && suppRes.data) {
      setSuppMap(new Map((suppRes.data as Array<{ id: string; name: string }>).map(s => [s.id, s.name])));
    }
    setLoading(false);
  }

  useEffect(() => {
    const controller = new AbortController();
    const db = getSupabase();
    if (!db) { setLoading(false); return; } // eslint-disable-line react-hooks/set-state-in-effect
    db.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.access_token || controller.signal.aborted) { setLoading(false); return; }
      const [res, suppRes] = await Promise.all([
        fetch("/api/inventory/purchase-recommendations", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: controller.signal,
        }).catch(() => null),
        db.from("suppliers").select("id,name").eq("is_active", true).limit(200),
      ]);
      if (controller.signal.aborted) return;
      if (res?.ok) setRecs(await res.json() as PurchaseRecommendationRecord[]);
      if (!suppRes.error && suppRes.data)
        setSuppMap(new Map((suppRes.data as Array<{ id: string; name: string }>).map(s => [s.id, s.name])));
      setLoading(false);
    });
    return () => controller.abort();
  }, []);

  async function sendAction(id: string, action: "approve_internal" | "dismiss" | "update_quantity", extra?: Record<string, unknown>) {
    setActing(id); setMsgs(prev => ({ ...prev, [id]: { text: "", ok: true } }));
    try {
      const db = getSupabase();
      if (!db) return;
      const { data: { session } } = await db.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/inventory/purchase-recommendations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action, ...extra }),
      });
      const body = await res.json() as { ok?: boolean; error?: string };
      if (res.ok) {
        const label = action === "approve_internal" ? "אושר פנימית" : action === "dismiss" ? "נדחה" : "עודכן";
        setMsgs(prev => ({ ...prev, [id]: { text: label, ok: true } }));
        await fetchRecs();
      } else {
        setMsgs(prev => ({ ...prev, [id]: { text: body.error ?? "שגיאה", ok: false } }));
      }
    } finally { setActing(null); }
  }

  const activeRecs = recs.filter(r => r.status !== "dismissed" && r.status !== "resolved");
  const urgencyOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...activeRecs].sort((a, b) =>
    (urgencyOrder[a.urgency] ?? 9) - (urgencyOrder[b.urgency] ?? 9)
  );

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">טוען המלצות רכש...</div>;

  if (sorted.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
        <p className="text-gray-400 text-sm">אין המלצות רכש פתוחות</p>
        <p className="text-xs text-gray-400 mt-1">הרץ סריקת מלאי לעדכון המלצות, או הוסף המלצה ידנית</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-black text-gray-900">המלצות רכש</h2>
        <span className="text-xs text-gray-500">{sorted.length} המלצות פתוחות</span>
      </div>
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        אישור פנימי אינו שולח הזמנה לספק. זהו אישור לתכנון פנימי בלבד.
      </p>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-right text-sm min-w-[900px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["פריט","סוג","נוכחי","שמור","זמין","מינימום","מומלץ","דחיפות","סטטוס","ספק","סיבה",""].map(h => (
                <th key={h} className="px-2 py-2.5 text-xs font-bold text-gray-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const item = catalogMap.get(r.item_id);
              const msg = msgs[r.id];
              const canAct = r.status === "draft" || r.status === "pending_approval";
              return (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                  <td className="px-2 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{item?.name ?? r.item_id.slice(0,8)}</td>
                  <td className="px-2 py-2.5">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                      {REC_TYPE_LABELS[r.recommendation_type] ?? r.recommendation_type}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-center font-mono text-sm">{r.current_quantity}</td>
                  <td className="px-2 py-2.5 text-center font-mono text-sm text-amber-700">{r.reserved_quantity}</td>
                  <td className="px-2 py-2.5 text-center font-mono text-sm">{r.available_quantity}</td>
                  <td className="px-2 py-2.5 text-center font-mono text-sm text-gray-400">{r.minimum_quantity}</td>
                  <td className="px-2 py-2.5 text-center">
                    {canAct ? (
                      <input
                        type="number" min="0.01" step="0.01"
                        value={editQty[r.id] ?? String(r.recommended_quantity)}
                        onChange={e => setEditQty(prev => ({ ...prev, [r.id]: e.target.value }))}
                        className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-teal-400"
                      />
                    ) : (
                      <span className="font-mono">{r.recommended_quantity}</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold ${REC_URGENCY_COLORS[r.urgency] ?? "bg-gray-100 text-gray-500"}`}>
                      {REC_URGENCY_LABELS[r.urgency] ?? r.urgency}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold ${REC_STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {REC_STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-xs text-gray-500 max-w-[100px] truncate">
                    {r.supplier_id ? (suppMap.get(r.supplier_id) ?? r.supplier_id.slice(0, 8) + "…") : "—"}
                  </td>
                  <td className="px-2 py-2.5 text-xs text-gray-500 max-w-[140px]">
                    <span className="line-clamp-2">{r.reason}</span>
                  </td>
                  <td className="px-2 py-2.5 text-left">
                    {msg?.text ? (
                      <span className={`text-xs font-medium ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</span>
                    ) : canAct ? (
                      <div className="flex flex-col gap-1 min-w-[120px]">
                        {editQty[r.id] && editQty[r.id] !== String(r.recommended_quantity) && (
                          <button onClick={() => sendAction(r.id, "update_quantity", { recommendedQuantity: parseFloat(editQty[r.id]) })}
                            disabled={acting === r.id}
                            className="text-xs px-2 py-0.5 rounded bg-gray-50 text-gray-700 hover:bg-gray-100 font-medium disabled:opacity-40">
                            שמור כמות
                          </button>
                        )}
                        <button onClick={() => sendAction(r.id, "approve_internal")}
                          disabled={acting === r.id}
                          className="text-xs px-2 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 font-semibold disabled:opacity-40 transition-colors">
                          {acting === r.id ? "..." : "אשר פנימית"}
                        </button>
                        <button onClick={() => sendAction(r.id, "dismiss", { dismissReason: "user_dismissed" })}
                          disabled={acting === r.id}
                          className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 font-medium disabled:opacity-40 transition-colors">
                          דחה
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Warehouse() {
  const { orders } = useOrdersContext();
  const { items: catalogItems } = useCatalogContext();
  const [activeTab, setActiveTab] = useState<"orders" | "inventory" | "delivery" | "returns" | "recommendations">("orders");
  const [consumptions, setConsumptions] = useState<ConsumptionRecord[]>([]);
  const [approvedDiaryOrderIds, setApprovedDiaryOrderIds] = useState<Set<string>>(new Set());
  const [reconciling, setReconciling] = useState<string | null>(null);
  const [reconcileMsg, setReconcileMsg] = useState<{ orderId: string; text: string; ok: boolean } | null>(null);

  // Load consumptions and approved diaries once on mount
  useEffect(() => {
    const db = getSupabase();
    if (!db) return;
    Promise.all([
      db.from("inventory_consumptions").select("order_id,order_item_key,status,work_diary_id,quantity,metadata").in("status", ["consumed", "pending_review"]),
      db.from("work_diaries").select("id,order_id,status,approval_status").eq("status", "submitted").eq("approval_status", "approved"),
    ]).then(([consRes, diaryRes]) => {
      if (!consRes.error && consRes.data) setConsumptions(consRes.data as ConsumptionRecord[]);
      if (!diaryRes.error && diaryRes.data) {
        setApprovedDiaryOrderIds(new Set(
          (diaryRes.data as DiaryRecord[]).map(d => d.order_id).filter(Boolean) as string[]
        ));
      }
    });
  }, []);

  const catalogMap = new Map<string, CatalogItem>(catalogItems.map(i => [i.id, i]));

  // Build per-item reservation breakdown from active warehouse orders (derived, no extra query)
  const reservationsByItem = new Map<string, OrderReservation[]>();
  for (const order of orders) {
    if (order.status === "completed" || order.status === "cancelled") continue;
    if (!order.warehouseRequired) continue;
    const rows = [...(order.accessoryRows ?? []), ...(order.miscRows ?? [])];
    for (const row of rows) {
      if (!row.catalogItemId) continue;
      const qty = parseFloat(row.quantity) || 0;
      if (qty <= 0) continue;
      const existing = reservationsByItem.get(row.catalogItemId) ?? [];
      existing.push({ orderNumber: order.orderNumber, qty, orderId: order.id });
      reservationsByItem.set(row.catalogItemId, existing);
    }
  }

  // Derive reconciliation status per order
  function getReconciliationStatus(order: WorkOrder): ReconciliationStatus {
    const hasMappedItems = [...(order.accessoryRows ?? []), ...(order.miscRows ?? [])]
      .some(r => r.catalogItemId && (parseFloat(r.quantity) || 0) > 0);
    if (!hasMappedItems) return "not_required";
    const hasApprovedDiary = approvedDiaryOrderIds.has(order.id);
    if (!hasApprovedDiary) return "not_required";
    const orderConsumptions = consumptions.filter(c => c.order_id === order.id && (c.status === "consumed" || c.status === "pending_review"));
    if (orderConsumptions.length === 0) return "pending";
    return "reconciled";
  }

  // Manual reconciliation trigger
  async function handleReconcile(order: WorkOrder) {
    setReconciling(order.id);
    setReconcileMsg(null);
    try {
      const db = getSupabase();
      if (!db) throw new Error("לא מחובר לבסיס הנתונים");
      const { data: { session } } = await db.auth.getSession();
      if (!session?.access_token) throw new Error("אין הרשאה — יש להתחבר מחדש");

      // Find approved diary for this order
      const { data: diaries } = await db.from("work_diaries")
        .select("id").eq("order_id", order.id).eq("approval_status", "approved").limit(1);
      const diaryId = (diaries as Array<{ id: string }> | null)?.[0]?.id;
      if (!diaryId) throw new Error("לא נמצא יומן מאושר להזמנה זו");

      const res = await fetch("/api/inventory/consume-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({ orderId: order.id, diaryId }),
      });
      const body = await res.json() as { consumptionsCreated?: number; error?: string; warnings?: string[] };
      if (!res.ok) throw new Error(body.error ?? `שגיאה ${res.status}`);

      const created = body.consumptionsCreated ?? 0;
      setReconcileMsg({
        orderId: order.id,
        text: created > 0 ? `התאמת מלאי בוצעה — ${created} פריטים הותאמו` : "אין פריטים חדשים להתאמה",
        ok: true,
      });

      // Refresh consumptions
      const { data: fresh } = await db.from("inventory_consumptions")
        .select("order_id,order_item_key,status,work_diary_id,quantity,metadata")
        .in("status", ["consumed", "pending_review"]);
      if (fresh) setConsumptions(fresh as ConsumptionRecord[]);
    } catch (err) {
      setReconcileMsg({ orderId: order.id, text: err instanceof Error ? err.message : "שגיאה בהתאמת מלאי", ok: false });
    } finally {
      setReconciling(null);
    }
  }

  const [showCompletedWarehouse, setShowCompletedWarehouse] = useState(false);

  const warehouseOrders = orders
    .filter(o =>
      o.warehouseRequired &&
      o.status !== "completed" &&
      o.status !== "cancelled" &&
      // Exclude orders that warehouse has released: ready_installation means all departments
      // are done; production+ready means warehouse released while fabrication is still in progress.
      o.status !== "ready_installation" &&
      !(o.status === "production" && o.warehouseStatus === "ready"),
    )
    .sort((a, b) => {
      const p = (o: WorkOrder) => (o.priority === "urgent" ? 0 : 1);
      if (p(a) !== p(b)) return p(a) - p(b);
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

  const completedWarehouseOrders = showCompletedWarehouse
    ? orders.filter(o => o.warehouseRequired && o.status === "completed").sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    : [];

  const groups: { key: string; label?: string; orders: WorkOrder[] }[] = [
    { key: "pending",    orders: warehouseOrders.filter(o => !o.warehouseStatus || o.warehouseStatus === "pending") },
    { key: "processing", orders: warehouseOrders.filter(o => o.warehouseStatus === "processing") },
    { key: "ready",      orders: warehouseOrders.filter(o => o.warehouseStatus === "ready") },
    ...(showCompletedWarehouse ? [{ key: "completed", label: "עבודות שהושלמו", orders: completedWarehouseOrders }] : []),
  ];

  // Build return candidates: completed orders with proxy-consumed items
  const returnCandidates: ReturnRecord[] = [];
  for (const c of consumptions) {
    if (c.metadata?.quantitySource !== "reservation_quantity") continue;
    const order = orders.find(o => o.id === c.order_id);
    if (!order || order.status !== "completed") continue;
    if (!c.order_item_key) continue;
    const allRows = [...(order.accessoryRows ?? []), ...(order.miscRows ?? [])];
    const row = allRows.find(r => r.id === c.order_item_key);
    if (!row?.catalogItemId) continue;
    const catItem = catalogMap.get(row.catalogItemId);
    if (!catItem) continue;
    returnCandidates.push({
      orderId: order.id,
      orderNumber: order.orderNumber,
      catalogItemId: row.catalogItemId,
      itemName: catItem.name,
      orderItemKey: c.order_item_key,
      consumedQty: c.quantity,
    });
  }

  const TAB_CONFIG = [
    { key: "orders" as const,    label: "הכנת הזמנות" },
    { key: "inventory" as const, label: "מלאי פריטים" },
    { key: "delivery" as const,  label: "קליטת סחורה" },
    { key: "returns" as const,   label: `החזרות מהשטח${returnCandidates.length > 0 ? ` (${returnCandidates.length})` : ""}` },
    { key: "recommendations" as const, label: "המלצות רכש" },
  ];

  return (
    <div className="min-h-screen py-6 px-4">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center" style={{ boxShadow: "0 0 20px rgba(20,184,166,0.45)" }}>
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-black scene-title">מחלקת מחסן</h1>
            <p className="text-sm scene-subtitle">הכנת הזמנות, ניהול מלאי וקליטת סחורה</p>
          </div>
          {activeTab === "orders" && (
            <div className="mr-auto flex items-center gap-3">
              <span className="text-sm text-white/60">פתוחות: <strong className="text-white">{warehouseOrders.filter(o => o.warehouseStatus !== "ready").length}</strong></span>
              <button
                type="button"
                onClick={() => setShowCompletedWarehouse(v => !v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                  showCompletedWarehouse
                    ? "bg-gray-200 text-gray-700 border-gray-300"
                    : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {showCompletedWarehouse ? "הסתר הושלמו" : "הצג הושלמו"}
              </button>
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 mb-5 bg-white border border-gray-200 rounded-xl p-1 w-fit">
          {TAB_CONFIG.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                activeTab === t.key ? "bg-teal-600 text-white shadow" : "text-gray-600 hover:bg-gray-100"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Orders tab */}
        {activeTab === "orders" && (
          warehouseOrders.length === 0 && (!showCompletedWarehouse || completedWarehouseOrders.length === 0) ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
              <p className="text-gray-500 font-medium">אין הזמנות הממתינות להכנה במחסן</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {groups.map(({ key, orders: groupOrders }) => {
                const cfg = STATUS_CONFIG[key];
                return (
                  <div key={key}>
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <span className="text-sm font-bold text-gray-700">{cfg.label}</span>
                      {groupOrders.length > 0 && (
                        <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold ${cfg.badge}`}>
                          {groupOrders.length}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-3">
                      {groupOrders.length === 0 ? (
                        <div className={`rounded-xl border ${cfg.border} ${cfg.bg} px-4 py-6 text-center`}>
                          <p className="text-xs text-gray-400">אין הזמנות</p>
                        </div>
                      ) : (
                        groupOrders.map(o => (
                          <div key={o.id}>
                            <OrderCard
                              order={o}
                              catalogMap={catalogMap}
                              reconciliationStatus={getReconciliationStatus(o)}
                              onReconcile={handleReconcile}
                            />
                            {reconcileMsg?.orderId === o.id && (
                              <p className={`text-xs px-3 py-1.5 rounded-lg mt-1 ${reconcileMsg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                                {reconciling === o.id ? "מבצע התאמת מלאי..." : reconcileMsg.text}
                              </p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* Inventory tab */}
        {activeTab === "inventory" && <InventoryPanel reservationsByItem={reservationsByItem} />}

        {/* Delivery notes tab */}
        {activeTab === "delivery" && <DeliveryNotesPanel />}

        {/* Returns from field tab */}
        {activeTab === "returns" && (
          <ReturnFromFieldPanel returnCandidates={returnCandidates} catalogMap={catalogMap} />
        )}

        {/* Purchase recommendations tab */}
        {activeTab === "recommendations" && <PurchaseRecommendationsPanel catalogMap={catalogMap} />}
      </div>
    </div>
  );
}
