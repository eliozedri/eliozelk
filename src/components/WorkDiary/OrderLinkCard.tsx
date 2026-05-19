"use client";

import { useState, useEffect, useMemo } from "react";
import { useOrdersContext } from "@/context/OrdersContext";
import { STATUS_LABELS } from "@/types/workOrder";

interface Props {
  orderId: string | undefined;
  onChange: (orderId: string | undefined) => void;
  disabled?: boolean;
}

export function OrderLinkCard({ orderId, onChange, disabled = false }: Props) {
  const { orders } = useOrdersContext();
  const [open, setOpen] = useState(!!orderId);

  // Keep open state in sync when diary loads with a pre-linked orderId
  useEffect(() => {
    if (orderId) setOpen(true);
  }, [orderId]);

  const available = useMemo(
    () =>
      orders
        .filter((o) => o.status !== "cancelled")
        .sort((a, b) => b.date.localeCompare(a.date)),
    [orders]
  );

  function handleToggle(checked: boolean) {
    setOpen(checked);
    if (!checked) onChange(undefined);
  }

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    onChange(e.target.value || undefined);
  }

  const linked = orderId ? orders.find((o) => o.id === orderId) : undefined;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={open}
          onChange={(e) => handleToggle(e.target.checked)}
          disabled={disabled}
          className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
        />
        <span className="text-sm font-bold text-gray-700">קישור להזמנה קיימת</span>
        {linked && (
          <span className="mr-auto text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
            {linked.orderNumber}
          </span>
        )}
      </label>

      {open && (
        <div className="mt-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">בחר הזמנה</label>
          <select
            value={orderId ?? ""}
            onChange={handleSelect}
            disabled={disabled}
            dir="rtl"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
          >
            <option value="">— ללא קישור —</option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {o.orderNumber}
                {o.customer ? ` · ${o.customer}` : ""}
                {o.location ? ` · ${o.location}` : ""}
                {` · ${STATUS_LABELS[o.status]}`}
              </option>
            ))}
          </select>

          {linked && (
            <p className="mt-2 text-xs text-blue-600">
              מקושר להזמנה {linked.orderNumber} ({linked.customer})
            </p>
          )}
        </div>
      )}
    </div>
  );
}
