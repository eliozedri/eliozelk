"use client";

import Link from "next/link";
import type { WorkOrder } from "@/types/workOrder";
import { STATUS_LABELS } from "@/types/workOrder";

function ExternalLinkIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

const STATUS_STYLE: Record<string, string> = {
  graphics_pending:  "bg-amber-100 text-amber-700",
  graphics_active:   "bg-blue-100 text-blue-700",
  graphics_done:     "bg-green-100 text-green-700",
  production:        "bg-purple-100 text-purple-700",
  ready_installation:"bg-teal-100 text-teal-700",
  completed:         "bg-gray-100 text-gray-600",
  cancelled:         "bg-red-100 text-red-600",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = diff / 3_600_000;
  const m = Math.round(diff / 60_000);
  if (m < 2)   return "עכשיו";
  if (h < 1)   return `לפני ${m} דקות`;
  if (h < 24)  return `לפני ${Math.round(h)} שעות`;
  if (h < 48)  return "אתמול";
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

interface Props {
  orders: WorkOrder[];
}

export function ActivitySection({ orders }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-bold text-navy-900">פעילות אחרונה</h2>
        <Link href="/orders" className="text-xs text-blue-500 hover:underline flex items-center gap-1">
          הצג הכל <ExternalLinkIcon />
        </Link>
      </div>
      <div className="divide-y divide-gray-50">
        {orders.length === 0 ? (
          <div className="px-5 py-5 text-center">
            <p className="text-xs text-gray-400">אין הזמנות עדיין</p>
          </div>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-navy-900 truncate">{order.orderNumber}</span>
                  {order.priority === "urgent" && (
                    <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-100 text-red-600 shrink-0">דחוף</span>
                  )}
                </div>
                <div className="text-[10px] text-gray-400 truncate">{order.customer}</div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_STYLE[order.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {STATUS_LABELS[order.status] ?? order.status}
                </span>
                <span className="text-[10px] text-gray-300">{relativeTime(order.updatedAt ?? order.createdAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
