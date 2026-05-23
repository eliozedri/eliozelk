/**
 * Phase 2.0k — shared read-back helpers for the orders + customers
 * routes. Auth + version gate reuse the same `guard()` as the catalog
 * routes (see ./catalog/_shared.ts).
 */

import type { NextResponse } from "next/server";

/**
 * "Open" = anything not in the terminal states. Used by the open-orders
 * filter so the owner sees real WIP from JARVIS.
 */
export const TERMINAL_ORDER_STATUSES = ["completed", "cancelled"] as const;

/**
 * Map work_orders.status to a polished Hebrew label. Keeps the
 * vocabulary in one place so JARVIS doesn't have to maintain its own
 * mapping for the Elkayam-owned status enum.
 */
export const STATUS_HE: Record<string, string> = {
  graphics_pending: "ממתין לגרפיקה",
  graphics_active: "בעבודת גרפיקה",
  graphics_done: "גרפיקה הושלמה",
  production: "בייצור",
  ready_installation: "מוכן להתקנה",
  completed: "הושלם",
  cancelled: "בוטל",
};

export const PRIORITY_HE: Record<string, string> = {
  urgent: "דחוף",
  high: "גבוה",
  normal: "רגיל",
  low: "נמוך",
};

/**
 * Trim + shape a work_orders row into the public read-back shape.
 * We only expose fields JARVIS legitimately needs — no internal
 * jsonb dump.
 */
export function publicOrderRow(row: Record<string, unknown>): {
  id: string;
  order_number: string;
  status: string;
  status_he: string;
  priority: string;
  priority_he: string;
  customer: string;
  city: string;
  order_date: string;
  is_open: boolean;
  updated_at: string;
} {
  const status = String(row.status ?? "");
  const priority = String(row.priority ?? "normal");
  return {
    id: String(row.id ?? ""),
    order_number: String(row.order_number ?? ""),
    status,
    status_he: STATUS_HE[status] ?? status,
    priority,
    priority_he: PRIORITY_HE[priority] ?? priority,
    customer: String(row.customer ?? ""),
    city: String(row.city ?? ""),
    order_date: String(row.order_date ?? ""),
    is_open: !(TERMINAL_ORDER_STATUSES as readonly string[]).includes(status),
    updated_at: String(row.updated_at ?? ""),
  };
}

/**
 * Single-order detail adds a small slice of the jsonb `data` payload,
 * limited to fields safe to surface to the owner.
 */
export function publicOrderDetail(row: Record<string, unknown>): ReturnType<typeof publicOrderRow> & {
  data: {
    items_summary?: string;
    notes?: string;
    contact?: { name?: string; phone?: string } | null;
  };
} {
  const base = publicOrderRow(row);
  const data = (row.data as Record<string, unknown> | null) ?? {};
  const accessoryRows = Array.isArray(data.accessoryRows) ? data.accessoryRows : [];
  const miscRows = Array.isArray(data.miscRows) ? data.miscRows : [];
  const total = accessoryRows.length + miscRows.length;
  const items_summary = total > 0 ? `${total} פריטים` : undefined;
  const notes = typeof data.notes === "string" && data.notes.trim().length > 0
    ? (data.notes as string)
    : undefined;
  const contact = data.contact && typeof data.contact === "object"
    ? {
        name: typeof (data.contact as { name?: unknown }).name === "string"
          ? ((data.contact as { name?: string }).name as string)
          : undefined,
        phone: typeof (data.contact as { phone?: unknown }).phone === "string"
          ? ((data.contact as { phone?: string }).phone as string)
          : undefined,
      }
    : null;
  return { ...base, data: { items_summary, notes, contact } };
}

export function publicCustomerRow(row: Record<string, unknown>): {
  id: string;
  name: string;
  location: string;
  phone: string;
  last_order: string;
  source: "customers" | "work_orders";
} {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    location: String(row.location ?? ""),
    phone: String(row.phone ?? ""),
    last_order: String(row.last_order ?? ""),
    source: (row.source as "customers" | "work_orders") ?? "customers",
  };
}

/** Common no-op helpers re-exported for the route files. */
export type WithErrorResponse = { ok: false; response: NextResponse };
