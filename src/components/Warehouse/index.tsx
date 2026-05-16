"use client";

import { useState, useCallback } from "react";
import { useOrdersContext } from "@/context/OrdersContext";
import { useCatalogContext } from "@/context/CatalogContext";
import { useAuth } from "@/context/AuthContext";
import { getStockStatus, STOCK_STATUS_LABELS, STOCK_STATUS_COLORS } from "@/types/inventory";
import type { WorkOrder } from "@/types/workOrder";
import type { CatalogItem } from "@/types/catalog";
import type { MiscRow } from "@/types/order";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function UrgentBadge() {
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">דחוף</span>;
}

// ── Order-prep column config ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; bg: string; border: string; badge: string }> = {
  pending:    { label: "ממתין להכנה",  bg: "bg-amber-50",  border: "border-amber-200",  badge: "bg-amber-100 text-amber-700" },
  processing: { label: "בהכנה",        bg: "bg-blue-50",   border: "border-blue-200",   badge: "bg-blue-100 text-blue-700" },
  ready:      { label: "מוכן",         bg: "bg-green-50",  border: "border-green-200",  badge: "bg-green-100 text-green-700" },
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

function OrderCard({ order, catalogMap }: { order: WorkOrder; catalogMap: Map<string, CatalogItem> }) {
  const { updateOrderFields } = useOrdersContext();
  const warehouseStatus = order.warehouseStatus ?? "pending";
  const cfg = STATUS_CONFIG[warehouseStatus] ?? STATUS_CONFIG.pending;
  const accessoryItems = (order.accessoryRows ?? []).filter(r => r.description?.trim());

  function advance() {
    if (warehouseStatus === "pending")    updateOrderFields(order.id, { warehouseStatus: "processing" });
    if (warehouseStatus === "processing") updateOrderFields(order.id, { warehouseStatus: "ready" });
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4">
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

// ── Inventory item row ─────────────────────────────────────────────────────────

function InventoryRow({ item, onAdjust }: { item: CatalogItem; onAdjust: (item: CatalogItem) => void }) {
  const stockStatus = getStockStatus(item.currentQuantity, item.minimumQuantity);
  const statusLabel = STOCK_STATUS_LABELS[stockStatus];
  const statusColor = STOCK_STATUS_COLORS[stockStatus];
  const available   = item.currentQuantity - item.reservedQuantity;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-3 py-2.5 text-sm font-semibold text-gray-900">{item.name}</td>
      <td className="px-3 py-2.5 text-xs text-gray-500">{item.category}</td>
      <td className="px-3 py-2.5 text-sm text-center font-mono">{item.currentQuantity}</td>
      <td className="px-3 py-2.5 text-sm text-center font-mono text-gray-500">{item.minimumQuantity || "—"}</td>
      <td className="px-3 py-2.5 text-sm text-center font-mono text-amber-700">{item.reservedQuantity > 0 ? item.reservedQuantity : "—"}</td>
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

function InventoryPanel() {
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
                <InventoryRow key={item.id} item={item} onAdjust={setAdjusting} />
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

export function Warehouse() {
  const { orders } = useOrdersContext();
  const { items: catalogItems } = useCatalogContext();
  const [activeTab, setActiveTab] = useState<"orders" | "inventory">("orders");

  const catalogMap = new Map<string, CatalogItem>(catalogItems.map(i => [i.id, i]));

  const warehouseOrders = orders
    .filter(o => o.warehouseRequired && o.status !== "completed" && o.status !== "cancelled")
    .sort((a, b) => {
      const p = (o: WorkOrder) => (o.priority === "urgent" ? 0 : 1);
      if (p(a) !== p(b)) return p(a) - p(b);
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

  const groups: { key: string; orders: WorkOrder[] }[] = [
    { key: "pending",    orders: warehouseOrders.filter(o => !o.warehouseStatus || o.warehouseStatus === "pending") },
    { key: "processing", orders: warehouseOrders.filter(o => o.warehouseStatus === "processing") },
    { key: "ready",      orders: warehouseOrders.filter(o => o.warehouseStatus === "ready") },
  ];

  return (
    <div className="min-h-screen bg-[#f0f2f5] py-6 px-4">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center shadow">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">מחלקת מחסן</h1>
            <p className="text-sm text-gray-500">הכנת הזמנות וניהול מלאי</p>
          </div>
          {activeTab === "orders" && (
            <div className="mr-auto flex items-center gap-2">
              <span className="text-sm text-gray-500">פתוחות:</span>
              <span className="font-black text-gray-900">{warehouseOrders.filter(o => o.warehouseStatus !== "ready").length}</span>
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-5 bg-white border border-gray-200 rounded-xl p-1 w-fit">
          {([
            { key: "orders",    label: "הכנת הזמנות" },
            { key: "inventory", label: "מלאי פריטים" },
          ] as const).map(t => (
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
          warehouseOrders.length === 0 ? (
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
                        groupOrders.map(o => <OrderCard key={o.id} order={o} catalogMap={catalogMap} />)
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* Inventory tab */}
        {activeTab === "inventory" && <InventoryPanel />}
      </div>
    </div>
  );
}
