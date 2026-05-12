"use client";

import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import type { OrderState } from "@/types/order";
import type { WorkOrder, WorkOrderStatus, OrderPriority, OrderProblem, OrderProblemStatus, OrderProblemCategory, OrderActivity, OrderActivityType } from "@/types/workOrder";

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
        contactPerson: snapshot.contactPerson || undefined,
        orderedBy: snapshot.orderedBy || undefined,
        city: snapshot.city ?? "",
        location: "",
        signRows: snapshot.signRows,
        accessoryRows: snapshot.accessoryRows,
        miscRows: snapshot.miscRows,
        generalNotes: snapshot.generalNotes || undefined,
        attachments: snapshot.attachments?.length ? snapshot.attachments : undefined,
        fabricationRequired: snapshot.fabricationRequired || undefined,
        fabricationDetails: snapshot.fabricationRequired ? snapshot.fabricationDetails : undefined,
        fabricationStatus: snapshot.fabricationRequired ? "pending" : undefined,
        priority,
        notes,
        status: "graphics_pending",
        createdAt: now,
        updatedAt: now,
        graphicsSentAt: now,
        graphicsAcknowledgedAt: null,
        graphicsAcknowledgedBy: null,
        graphicsCompletedAt: null,
        activities: [
          {
            id: nanoid(),
            orderId: "",
            type: "order_created" as OrderActivityType,
            timestamp: now,
            description: "הזמנה נוצרה ונשלחה למחלקת גרפיקה",
          },
        ],
      };
      // Fix orderId inside activities now that we have the id
      newOrder.activities = newOrder.activities!.map((a) => ({ ...a, orderId: newOrder.id }));
      setOrders((prev) => [newOrder, ...prev]);
      return newOrder;
    },
    []
  );

  const acknowledgeOrder = useCallback((id: string, acknowledgedBy = "גרפיקה") => {
    const now = new Date().toISOString();
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const activity: OrderActivity = {
          id: nanoid(), orderId: id, type: "graphics_acknowledged",
          timestamp: now, by: acknowledgedBy, department: "graphics",
          description: `אישור קבלה על ידי ${acknowledgedBy}`,
        };
        return {
          ...o,
          status: "graphics_active" as WorkOrderStatus,
          graphicsAcknowledgedAt: now,
          graphicsAcknowledgedBy: acknowledgedBy,
          updatedAt: now,
          activities: [...(o.activities ?? []), activity],
        };
      })
    );
  }, []);

  const completeGraphics = useCallback((id: string) => {
    const now = new Date().toISOString();
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const activity: OrderActivity = {
          id: nanoid(), orderId: id, type: "graphics_completed",
          timestamp: now, department: "graphics",
          description: "עבודת גרפיקה הושלמה",
        };
        return {
          ...o,
          status: "graphics_done" as WorkOrderStatus,
          graphicsCompletedAt: now,
          updatedAt: now,
          activities: [...(o.activities ?? []), activity],
        };
      })
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

  const addOrderActivity = useCallback((id: string, type: OrderActivityType, description: string, opts?: { by?: string; department?: string; meta?: Record<string, string> }) => {
    const now = new Date().toISOString();
    const activity: OrderActivity = {
      id: nanoid(), orderId: id, type, timestamp: now,
      description, ...opts,
    };
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, activities: [...(o.activities ?? []), activity], updatedAt: now } : o))
    );
  }, []);

  const addOrderProblem = useCallback((
    id: string,
    problem: { department: "graphics" | "fabrication" | "office"; category: OrderProblemCategory; description: string; reportedBy?: string }
  ) => {
    const now = new Date().toISOString();
    const newProblem: OrderProblem = {
      id: nanoid(), orderId: id, ...problem,
      reportedAt: now, status: "open",
    };
    const activity: OrderActivity = {
      id: nanoid(), orderId: id, type: "problem_reported",
      timestamp: now, department: problem.department,
      description: `בעיה דווחה: ${problem.description}`,
      by: problem.reportedBy,
    };
    setOrders((prev) =>
      prev.map((o) =>
        o.id === id
          ? {
              ...o,
              problems: [...(o.problems ?? []), newProblem],
              activities: [...(o.activities ?? []), activity],
              updatedAt: now,
            }
          : o
      )
    );
    return newProblem;
  }, []);

  const resolveOrderProblem = useCallback((
    orderId: string,
    problemId: string,
    opts?: { resolvedBy?: string; resolutionNotes?: string; newStatus?: OrderProblemStatus }
  ) => {
    const now = new Date().toISOString();
    const status = opts?.newStatus ?? "resolved";
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        const updatedProblems = (o.problems ?? []).map((p) =>
          p.id === problemId
            ? { ...p, status, resolvedAt: now, resolvedBy: opts?.resolvedBy, resolutionNotes: opts?.resolutionNotes }
            : p
        );
        const activity: OrderActivity = {
          id: nanoid(), orderId, type: "problem_resolved",
          timestamp: now, by: opts?.resolvedBy,
          description: status === "resolved" ? "בעיה סומנה כנפתרה" : `סטטוס בעיה עודכן ל-${status}`,
        };
        return {
          ...o,
          problems: updatedProblems,
          activities: [...(o.activities ?? []), activity],
          updatedAt: now,
        };
      })
    );
  }, []);

  return { orders, addOrder, acknowledgeOrder, completeGraphics, updateOrderStatus, updateOrderFields, addOrderActivity, addOrderProblem, resolveOrderProblem };
}
