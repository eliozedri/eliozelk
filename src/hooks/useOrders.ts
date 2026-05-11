"use client";

import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import type { OrderState } from "@/types/order";
import type { WorkOrder, WorkOrderStatus, OrderPriority } from "@/types/workOrder";

const STORAGE_KEY = "elkayam_orders";

function loadOrders(): WorkOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function generateOrderNumber(orders: WorkOrder[]): string {
  const year = new Date().getFullYear();
  const prefix = `ORD-${year}-`;
  const existing = orders
    .filter((o) => o.orderNumber.startsWith(prefix))
    .map((o) => parseInt(o.orderNumber.replace(prefix, ""), 10))
    .filter((n) => !isNaN(n));
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export function useOrders() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrders(loadOrders());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  }, [orders, hydrated]);

  const addOrder = useCallback(
    (snapshot: OrderState, priority: OrderPriority = "normal", notes = ""): WorkOrder => {
      const now = new Date().toISOString();
      const newOrder: WorkOrder = {
        id: nanoid(),
        orderNumber: generateOrderNumber(loadOrders()),
        date: snapshot.date,
        customer: snapshot.customer,
        location: snapshot.location,
        city: snapshot.city ?? "",
        reference: snapshot.reference,
        signRows: snapshot.signRows,
        miscRows: snapshot.miscRows,
        priority,
        notes,
        status: "graphics_pending",
        createdAt: now,
        updatedAt: now,
        graphicsSentAt: now,
        graphicsAcknowledgedAt: null,
        graphicsAcknowledgedBy: null,
        graphicsCompletedAt: null,
      };
      setOrders((prev) => [newOrder, ...prev]);
      return newOrder;
    },
    []
  );

  const acknowledgeOrder = useCallback((id: string, acknowledgedBy = "גרפיקה") => {
    const now = new Date().toISOString();
    setOrders((prev) =>
      prev.map((o) =>
        o.id === id
          ? {
              ...o,
              status: "graphics_active" as WorkOrderStatus,
              graphicsAcknowledgedAt: now,
              graphicsAcknowledgedBy: acknowledgedBy,
              updatedAt: now,
            }
          : o
      )
    );
  }, []);

  const completeGraphics = useCallback((id: string) => {
    const now = new Date().toISOString();
    setOrders((prev) =>
      prev.map((o) =>
        o.id === id
          ? {
              ...o,
              status: "graphics_done" as WorkOrderStatus,
              graphicsCompletedAt: now,
              updatedAt: now,
            }
          : o
      )
    );
  }, []);

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

  return { orders, addOrder, acknowledgeOrder, completeGraphics, updateOrderStatus, updateOrderFields };
}
