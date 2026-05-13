"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

function generateOrderNumberLocal(orders: WorkOrder[]): string {
  const year = new Date().getFullYear();
  const prefix = `ORD-${year}-`;
  const existing = orders
    .filter((o) => o.orderNumber.startsWith(prefix))
    .map((o) => parseInt(o.orderNumber.replace(prefix, ""), 10))
    .filter((n) => !isNaN(n));
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

function isNewerOrRecent(existing: string, incoming: string, toleranceMs = 5000): boolean {
  try {
    return new Date(incoming).getTime() > new Date(existing).getTime() - toleranceMs;
  } catch { return true; }
}

export function useOrders() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const ref = useRef<WorkOrder[]>([]);

  useEffect(() => { ref.current = orders; }, [orders]);

  useEffect(() => {
    const db = getSupabase();
    if (!db) {
      setOrders(loadLocal());
      return;
    }

    // ── Initial fetch ────────────────────────────────────────────────────────
    const fetchAll = () =>
      db.from("work_orders").select("*").order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) {
            const mapped = data.map(r => fromRow(r as Record<string, unknown>));
            if (mapped.length > 0) {
              setOrders(mapped);
              saveLocal(mapped);
            } else {
              const local = loadLocal();
              if (local.length > 0) {
                console.log("[orders] migrating local cache to Supabase:", local.length, "rows");
                setOrders(local);
                db.from("work_orders").upsert(local.map(toRow), { onConflict: "id" }).then(({ error: migErr }) => {
                  if (migErr) console.error("[orders] migration failed:", migErr.message);
                  else saveLocal(local);
                });
              }
            }
          } else {
            setOrders(loadLocal());
          }
        });

    fetchAll();

    // ── Realtime subscription ────────────────────────────────────────────────
    const channel = db
      .channel("work_orders_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_orders" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const incoming = fromRow(payload.new as Record<string, unknown>);
            setOrders(prev => {
              if (prev.some(o => o.id === incoming.id)) return prev; // dedup optimistic
              return [incoming, ...prev];
            });
          } else if (payload.eventType === "UPDATE") {
            const incoming = fromRow(payload.new as Record<string, unknown>);
            setOrders(prev => prev.map(o =>
              o.id === incoming.id && isNewerOrRecent(o.updatedAt, incoming.updatedAt) ? incoming : o
            ));
          } else if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as { id?: string }).id;
            if (deletedId) setOrders(prev => prev.filter(o => o.id !== deletedId));
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          console.log("[orders] realtime connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[orders] realtime issue:", status, err?.message ?? "");
        }
      });

    // ── Visibility-change fallback (catches missed events on tab switch) ─────
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchAll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      db.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const addOrder = useCallback(async (
    snapshot: OrderState, priority: OrderPriority = "normal", notes = ""
  ): Promise<WorkOrder> => {
    const now = new Date().toISOString();
    const db = getSupabase();

    let orderNumber: string;
    if (db) {
      const { data, error } = await db.rpc("next_counter", { counter_key: "order" });
      if (!error && data != null) {
        const year = new Date().getFullYear();
        orderNumber = `ORD-${year}-${String(data as number).padStart(3, "0")}`;
      } else {
        orderNumber = generateOrderNumberLocal(ref.current);
      }
    } else {
      orderNumber = generateOrderNumberLocal(ref.current);
    }

    const newOrder: WorkOrder = {
      id: nanoid(),
      orderNumber,
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

    setOrders(prev => [newOrder, ...prev]);

    if (db) {
      db.from("work_orders").insert(toRow(newOrder)).then(({ error }) => {
        if (error) {
          console.error("[orders] insert failed:", error.message);
          setOrders(prev => prev.filter(o => o.id !== newOrder.id));
        }
      });
    }
    return newOrder;
  }, []);

  const _patchOrder = useCallback((id: string, patch: Partial<WorkOrder>) => {
    const now = new Date().toISOString();
    const original = ref.current.find(o => o.id === id);
    if (!original) return;
    const updated = { ...original, ...patch, updatedAt: now };

    setOrders(prev => prev.map(o => o.id === id ? updated : o));

    const db = getSupabase();
    if (db) {
      db.from("work_orders").update(toRow(updated)).eq("id", id).then(({ error }) => {
        if (error) {
          console.error("[orders] update failed:", error.message);
          setOrders(prev => prev.map(o => o.id === id ? original : o));
        }
      });
    }
  }, []);

  const acknowledgeOrder = useCallback((id: string, acknowledgedBy = "גרפיקה") => {
    const now = new Date().toISOString();
    const original = ref.current.find(o => o.id === id);
    if (!original) return;
    const activity: OrderActivity = {
      id: nanoid(), orderId: id, type: "graphics_acknowledged",
      timestamp: now, by: acknowledgedBy, department: "graphics",
      description: `אישור קבלה על ידי ${acknowledgedBy}`,
    };
    const updated: WorkOrder = {
      ...original,
      status: "graphics_active" as WorkOrderStatus,
      graphicsAcknowledgedAt: now,
      graphicsAcknowledgedBy: acknowledgedBy,
      updatedAt: now,
      activities: [...(original.activities ?? []), activity],
    };

    setOrders(prev => prev.map(o => o.id === id ? updated : o));

    const db = getSupabase();
    if (db) {
      db.from("work_orders").update(toRow(updated)).eq("id", id).then(({ error }) => {
        if (error) {
          console.error("[orders] acknowledgeOrder failed:", error.message);
          setOrders(prev => prev.map(o => o.id === id ? original : o));
        }
      });
    }
  }, []);

  const completeGraphics = useCallback((id: string) => {
    const now = new Date().toISOString();
    const original = ref.current.find(o => o.id === id);
    if (!original) return;
    const activity: OrderActivity = {
      id: nanoid(), orderId: id, type: "graphics_completed",
      timestamp: now, department: "graphics", description: "עבודת גרפיקה הושלמה",
    };
    const updated: WorkOrder = {
      ...original,
      status: "graphics_done" as WorkOrderStatus,
      graphicsCompletedAt: now,
      updatedAt: now,
      activities: [...(original.activities ?? []), activity],
    };

    setOrders(prev => prev.map(o => o.id === id ? updated : o));

    const db = getSupabase();
    if (db) {
      db.from("work_orders").update(toRow(updated)).eq("id", id).then(({ error }) => {
        if (error) {
          console.error("[orders] completeGraphics failed:", error.message);
          setOrders(prev => prev.map(o => o.id === id ? original : o));
        }
      });
    }
  }, []);

  const updateOrderStatus = useCallback((id: string, status: WorkOrderStatus) => {
    const now = new Date().toISOString();
    const original = ref.current.find(o => o.id === id);
    if (!original) return;
    const extra: Partial<WorkOrder> = {};
    if (status === "ready_installation" && !original.readyForExecutionAt) {
      extra.readyForExecutionAt = now;
    }
    const updated: WorkOrder = { ...original, ...extra, status, updatedAt: now };

    setOrders(prev => prev.map(o => o.id === id ? updated : o));

    const db = getSupabase();
    if (db) {
      db.from("work_orders").update(toRow(updated)).eq("id", id).then(({ error }) => {
        if (error) {
          console.error("[orders] updateOrderStatus failed:", error.message);
          setOrders(prev => prev.map(o => o.id === id ? original : o));
        }
      });
    }
  }, []);

  const updateOrderFields = useCallback((id: string, fields: Partial<WorkOrder>) => {
    _patchOrder(id, fields);
  }, [_patchOrder]);

  const addOrderActivity = useCallback((
    id: string, type: OrderActivityType, description: string,
    opts?: { by?: string; department?: string; meta?: Record<string, string> }
  ) => {
    const now = new Date().toISOString();
    const original = ref.current.find(o => o.id === id);
    if (!original) return;
    const activity: OrderActivity = {
      id: nanoid(), orderId: id, type, timestamp: now, description, ...opts,
    };
    const updated: WorkOrder = {
      ...original,
      activities: [...(original.activities ?? []), activity],
      updatedAt: now,
    };

    setOrders(prev => prev.map(o => o.id === id ? updated : o));

    const db = getSupabase();
    if (db) {
      db.from("work_orders").update(toRow(updated)).eq("id", id).then(({ error }) => {
        if (error) {
          console.error("[orders] addOrderActivity failed:", error.message);
          setOrders(prev => prev.map(o => o.id === id ? original : o));
        }
      });
    }
  }, []);

  const addOrderProblem = useCallback((
    id: string,
    problem: { department: "graphics" | "fabrication" | "office"; category: OrderProblemCategory; description: string; reportedBy?: string }
  ) => {
    const now = new Date().toISOString();
    const original = ref.current.find(o => o.id === id);
    if (!original) return null;

    const newProblem: OrderProblem = {
      id: nanoid(), orderId: id, ...problem, reportedAt: now, status: "open",
    };
    const activity: OrderActivity = {
      id: nanoid(), orderId: id, type: "problem_reported",
      timestamp: now, department: problem.department,
      description: `בעיה דווחה: ${problem.description}`, by: problem.reportedBy,
    };
    const updated: WorkOrder = {
      ...original,
      problems: [...(original.problems ?? []), newProblem],
      activities: [...(original.activities ?? []), activity],
      updatedAt: now,
    };

    setOrders(prev => prev.map(o => o.id === id ? updated : o));

    const db = getSupabase();
    if (db) {
      db.from("work_orders").update(toRow(updated)).eq("id", id).then(({ error }) => {
        if (error) {
          console.error("[orders] addOrderProblem failed:", error.message);
          setOrders(prev => prev.map(o => o.id === id ? original : o));
        }
      });
    }
    return newProblem;
  }, []);

  const resolveOrderProblem = useCallback((
    orderId: string,
    problemId: string,
    opts?: { resolvedBy?: string; resolutionNotes?: string; newStatus?: OrderProblemStatus }
  ) => {
    const now = new Date().toISOString();
    const original = ref.current.find(o => o.id === orderId);
    if (!original) return;

    const status = opts?.newStatus ?? "resolved";
    const updatedProblems = (original.problems ?? []).map(p =>
      p.id === problemId
        ? { ...p, status, resolvedAt: now, resolvedBy: opts?.resolvedBy, resolutionNotes: opts?.resolutionNotes }
        : p
    );
    const activity: OrderActivity = {
      id: nanoid(), orderId, type: "problem_resolved",
      timestamp: now, by: opts?.resolvedBy,
      description: status === "resolved" ? "בעיה סומנה כנפתרה" : `סטטוס בעיה עודכן ל-${status}`,
    };
    const updated: WorkOrder = {
      ...original,
      problems: updatedProblems,
      activities: [...(original.activities ?? []), activity],
      updatedAt: now,
    };

    setOrders(prev => prev.map(o => o.id === orderId ? updated : o));

    const db = getSupabase();
    if (db) {
      db.from("work_orders").update(toRow(updated)).eq("id", orderId).then(({ error }) => {
        if (error) {
          console.error("[orders] resolveOrderProblem failed:", error.message);
          setOrders(prev => prev.map(o => o.id === orderId ? original : o));
        }
      });
    }
  }, []);

  return { orders, addOrder, acknowledgeOrder, completeGraphics, updateOrderStatus, updateOrderFields, addOrderActivity, addOrderProblem, resolveOrderProblem };
}
