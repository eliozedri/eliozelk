"use client";

import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import type { OrderState } from "@/types/order";
import type { WorkOrder, WorkOrderStatus, OrderPriority, OrderProblem, OrderProblemStatus, OrderProblemCategory, OrderActivity, OrderActivityType } from "@/types/workOrder";
import { getSupabase } from "@/lib/supabase/client";

const STORAGE_KEY = "elkayam_orders";

function fromRow(r: Record<string, unknown>): WorkOrder {
  const data = (r.data ?? {}) as Partial<WorkOrder>;
  return {
    ...data,
    id: r.id as string,
    orderNumber: r.order_number as string,
    status: r.status as WorkOrderStatus,
    priority: r.priority as OrderPriority,
    customer: r.customer as string,
    city: r.city as string,
    date: r.order_date as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  } as WorkOrder;
}

function toRow(o: WorkOrder) {
  return {
    id: o.id,
    order_number: o.orderNumber,
    status: o.status,
    priority: o.priority ?? "normal",
    customer: o.customer ?? "",
    city: o.city ?? "",
    order_date: o.date ?? "",
    data: o,
    created_at: o.createdAt,
    updated_at: o.updatedAt,
  };
}

function loadLocal(): WorkOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocal(orders: WorkOrder[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(orders)); } catch { /* ignore */ }
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
    const db = getSupabase();
    if (db) {
      db.from("work_orders").select("*").order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) {
            const mapped = data.map(fromRow);
            setOrders(mapped);
            saveLocal(mapped);
          } else {
            setOrders(loadLocal());
          }
          setHydrated(true);
        });
    } else {
      setOrders(loadLocal());
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveLocal(orders);
  }, [orders, hydrated]);

  const addOrder = useCallback(
    (snapshot: OrderState, priority: OrderPriority = "normal", notes = ""): WorkOrder => {
      const now = new Date().toISOString();
      const localOrders = loadLocal();
      const newOrder: WorkOrder = {
        id: nanoid(),
        orderNumber: generateOrderNumber(localOrders),
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
        activities: [],
      };
      const activity: OrderActivity = {
        id: nanoid(), orderId: newOrder.id, type: "order_created" as OrderActivityType,
        timestamp: now, description: "הזמנה נוצרה ונשלחה למחלקת גרפיקה",
      };
      newOrder.activities = [activity];
      setOrders((prev) => [newOrder, ...prev]);
      const db = getSupabase();
      if (db) db.from("work_orders").insert(toRow(newOrder)).then(() => {});
      return newOrder;
    },
    []
  );

  const _patchOrder = useCallback((id: string, patch: Partial<WorkOrder>) => {
    const now = new Date().toISOString();
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const updated = { ...o, ...patch, updatedAt: now };
        const db = getSupabase();
        if (db) db.from("work_orders").update(toRow(updated)).eq("id", id).then(() => {});
        return updated;
      })
    );
  }, []);

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
        const updated = {
          ...o,
          status: "graphics_active" as WorkOrderStatus,
          graphicsAcknowledgedAt: now,
          graphicsAcknowledgedBy: acknowledgedBy,
          updatedAt: now,
          activities: [...(o.activities ?? []), activity],
        };
        const db = getSupabase();
        if (db) db.from("work_orders").update(toRow(updated)).eq("id", id).then(() => {});
        return updated;
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
          timestamp: now, department: "graphics", description: "עבודת גרפיקה הושלמה",
        };
        const updated = {
          ...o,
          status: "graphics_done" as WorkOrderStatus,
          graphicsCompletedAt: now,
          updatedAt: now,
          activities: [...(o.activities ?? []), activity],
        };
        const db = getSupabase();
        if (db) db.from("work_orders").update(toRow(updated)).eq("id", id).then(() => {});
        return updated;
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
        const updated = { ...o, ...extra, status, updatedAt: now };
        const db = getSupabase();
        if (db) db.from("work_orders").update(toRow(updated)).eq("id", id).then(() => {});
        return updated;
      })
    );
  }, []);

  const updateOrderFields = useCallback((id: string, fields: Partial<WorkOrder>) => {
    _patchOrder(id, fields);
  }, [_patchOrder]);

  const addOrderActivity = useCallback((id: string, type: OrderActivityType, description: string, opts?: { by?: string; department?: string; meta?: Record<string, string> }) => {
    const now = new Date().toISOString();
    const activity: OrderActivity = {
      id: nanoid(), orderId: id, type, timestamp: now, description, ...opts,
    };
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const updated = { ...o, activities: [...(o.activities ?? []), activity], updatedAt: now };
        const db = getSupabase();
        if (db) db.from("work_orders").update(toRow(updated)).eq("id", id).then(() => {});
        return updated;
      })
    );
  }, []);

  const addOrderProblem = useCallback((
    id: string,
    problem: { department: "graphics" | "fabrication" | "office"; category: OrderProblemCategory; description: string; reportedBy?: string }
  ) => {
    const now = new Date().toISOString();
    const newProblem: OrderProblem = {
      id: nanoid(), orderId: id, ...problem, reportedAt: now, status: "open",
    };
    const activity: OrderActivity = {
      id: nanoid(), orderId: id, type: "problem_reported",
      timestamp: now, department: problem.department,
      description: `בעיה דווחה: ${problem.description}`, by: problem.reportedBy,
    };
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const updated = {
          ...o,
          problems: [...(o.problems ?? []), newProblem],
          activities: [...(o.activities ?? []), activity],
          updatedAt: now,
        };
        const db = getSupabase();
        if (db) db.from("work_orders").update(toRow(updated)).eq("id", id).then(() => {});
        return updated;
      })
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
        const updated = {
          ...o,
          problems: updatedProblems,
          activities: [...(o.activities ?? []), activity],
          updatedAt: now,
        };
        const db = getSupabase();
        if (db) db.from("work_orders").update(toRow(updated)).eq("id", orderId).then(() => {});
        return updated;
      })
    );
  }, []);

  return { orders, addOrder, acknowledgeOrder, completeGraphics, updateOrderStatus, updateOrderFields, addOrderActivity, addOrderProblem, resolveOrderProblem };
}
