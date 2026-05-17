"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import type { OrderState } from "@/types/order";
import type {
  WorkOrder, WorkOrderStatus, OrderPriority,
  OrderProblem, OrderProblemStatus, OrderProblemCategory,
  OrderActivity, OrderActivityType,
  FabricationStatus, AccountingStatus,
} from "@/types/workOrder";
import { getSupabase } from "@/lib/supabase/client";
import { canTransition, canMarkReadyForInstallation } from "@/lib/workflowEngine";

const STORAGE_KEY = "elkayam_orders";

// ── Column map: TypeScript field → SQL column name ───────────────────
// These are the promoted first-class columns. Every write touches only
// the relevant domain's columns — no cross-domain JSONB blob clobber.
const COLUMN_MAP: Partial<Record<keyof WorkOrder, string>> = {
  status:                    "status",
  priority:                  "priority",
  customer:                  "customer",
  city:                      "city",
  date:                      "order_date",
  contactPerson:             "contact_person",
  orderedBy:                 "ordered_by",
  location:                  "location",
  jobSlash:                  "job_slash",
  reference:                 "reference",
  // Graphics domain (only graphics dept writes these)
  graphicsSentAt:            "graphics_sent_at",
  graphicsAcknowledgedAt:    "graphics_acknowledged_at",
  graphicsAcknowledgedBy:    "graphics_acknowledged_by",
  graphicsCompletedAt:       "graphics_completed_at",
  // Fabrication domain (only fabrication dept writes these)
  fabricationRequired:       "fabrication_required",
  fabricationStatus:         "fabrication_status",
  fabricationAcknowledgedAt: "fabrication_acknowledged_at",
  fabricationCompletedAt:    "fabrication_completed_at",
  // Accounting domain (only accounting dept writes these)
  accountingStatus:          "accounting_status",
  invoicedAt:                "invoiced_at",
  invoicedBy:                "invoiced_by",
  invoiceNumber:             "invoice_number",
  billedAmount:              "billed_amount",
  // Order classification domain
  orderType:               "order_type",
  fulfillmentMethod:       "fulfillment_method",
  customerApprovalStatus:  "customer_approval_status",
  // Warehouse domain
  warehouseRequired:       "warehouse_required",
  warehouseStatus:         "warehouse_status",
  // Field execution domain (only scheduling/office writes these)
  jobName:                   "job_name",
  estimatedExecutionHours:   "estimated_execution_hours",
  readyForExecutionAt:       "ready_for_execution_at",
  assignedCrewId:            "assigned_crew_id",
  scheduledDate:             "scheduled_date",
  requiredWorkers:           "required_workers",
};

// Fields that live in the content JSONB blob (set at order creation by office)
const CONTENT_FIELDS = new Set<keyof WorkOrder>([
  "signRows", "miscRows", "accessoryRows", "notes", "generalNotes",
  "attachments", "fabricationDetails",
]);

// ── Row mappers ───────────────────────────────────────────────────────

function fromProblemRow(r: Record<string, unknown>): OrderProblem {
  return {
    id:               r.id as string,
    orderId:          r.order_id as string,
    department:       r.department as OrderProblem["department"],
    category:         r.category as OrderProblemCategory,
    description:      r.description as string,
    status:           r.status as OrderProblemStatus,
    reportedAt:       r.reported_at as string,
    reportedBy:       (r.reported_by as string) || undefined,
    resolvedAt:       (r.resolved_at as string) || undefined,
    resolvedBy:       (r.resolved_by as string) || undefined,
    resolutionNotes:  (r.resolution_notes as string) || undefined,
  };
}

function fromRow(r: Record<string, unknown>): WorkOrder {
  // Content blob provides signRows, miscRows, etc. (rarely-changing order content)
  const blob = (r.data ?? {}) as Partial<WorkOrder>;
  return {
    ...blob,
    // First-class columns (authoritative — override anything from blob)
    id:          r.id as string,
    orderNumber: r.order_number as string,
    status:      r.status as WorkOrderStatus,
    priority:    r.priority as OrderPriority,
    customer:    r.customer as string,
    city:        r.city as string,
    date:        r.order_date as string,
    createdAt:   r.created_at as string,
    updatedAt:   r.updated_at as string,
    version:     (r.version as number) ?? 1,
    // Promoted identity fields
    contactPerson:             (r.contact_person as string | null) ?? blob.contactPerson,
    orderedBy:                 (r.ordered_by as string | null) ?? blob.orderedBy,
    location:                  (r.location as string | null) ?? blob.location,
    jobSlash:                  (r.job_slash as string | null) ?? blob.jobSlash,
    reference:                 (r.reference as string | null) ?? blob.reference,
    // Graphics columns
    graphicsSentAt:            (r.graphics_sent_at as string | null) ?? blob.graphicsSentAt ?? (r.created_at as string),
    graphicsAcknowledgedAt:    (r.graphics_acknowledged_at as string | null) ?? blob.graphicsAcknowledgedAt ?? null,
    graphicsAcknowledgedBy:    (r.graphics_acknowledged_by as string | null) ?? blob.graphicsAcknowledgedBy ?? null,
    graphicsCompletedAt:       (r.graphics_completed_at as string | null) ?? blob.graphicsCompletedAt ?? null,
    // Fabrication columns
    fabricationRequired:       r.fabrication_required != null ? (r.fabrication_required as boolean) : (blob.fabricationRequired ?? false),
    fabricationStatus:         (r.fabrication_status as FabricationStatus | null) ?? blob.fabricationStatus,
    fabricationAcknowledgedAt: (r.fabrication_acknowledged_at as string | null) ?? blob.fabricationAcknowledgedAt ?? null,
    fabricationCompletedAt:    (r.fabrication_completed_at as string | null) ?? blob.fabricationCompletedAt ?? null,
    // Accounting columns
    accountingStatus:          (r.accounting_status as AccountingStatus | null) ?? blob.accountingStatus,
    invoicedAt:                (r.invoiced_at as string | null) ?? blob.invoicedAt ?? null,
    invoicedBy:                (r.invoiced_by as string | null) ?? blob.invoicedBy ?? null,
    invoiceNumber:             (r.invoice_number as string | null) ?? blob.invoiceNumber ?? null,
    billedAmount:              r.billed_amount != null ? Number(r.billed_amount) : (blob.billedAmount ?? null),
    // Order classification columns
    orderType:              ((r.order_type as string | null) ?? "field_work") as WorkOrder["orderType"],
    fulfillmentMethod:      (r.fulfillment_method as string | null) as WorkOrder["fulfillmentMethod"] ?? null,
    customerApprovalStatus: ((r.customer_approval_status as string | null) ?? "approved") as WorkOrder["customerApprovalStatus"],
    // Warehouse columns
    warehouseRequired:      r.warehouse_required != null ? (r.warehouse_required as boolean) : false,
    warehouseStatus:        (r.warehouse_status as WorkOrder["warehouseStatus"]) ?? null,
    // Field execution columns
    jobName:                   (r.job_name as string | null) ?? null,
    estimatedExecutionHours:   r.estimated_execution_hours != null ? Number(r.estimated_execution_hours) : blob.estimatedExecutionHours,
    readyForExecutionAt:       (r.ready_for_execution_at as string | null) ?? blob.readyForExecutionAt ?? null,
    assignedCrewId:            (r.assigned_crew_id as string | null) ?? blob.assignedCrewId ?? null,
    scheduledDate:             (r.scheduled_date as string | null) ?? blob.scheduledDate ?? null,
    requiredWorkers:           r.required_workers != null ? Number(r.required_workers) : null,
    // Content arrays — must default to [] if blob doesn't carry them (e.g. older orders or realtime payloads)
    signRows:  Array.isArray(blob.signRows)  ? blob.signRows  : [],
    miscRows:  Array.isArray(blob.miscRows)  ? blob.miscRows  : [],
    // Joined arrays (present in fetchAll response, empty in realtime payloads)
    problems:    ((r.order_problems as Record<string, unknown>[]) ?? []).map(fromProblemRow),
    activities:  [], // Loaded on demand from order_activities (not in main subscription)
  } as WorkOrder;
}

// Serializes only the content blob fields. Operational/lifecycle fields
// are now first-class columns and must NOT be written through this blob.
function buildContentBlob(o: WorkOrder): Record<string, unknown> {
  return {
    signRows:           o.signRows,
    miscRows:           o.miscRows,
    accessoryRows:      o.accessoryRows ?? [],
    notes:              o.notes,
    generalNotes:       o.generalNotes ?? null,
    attachments:        o.attachments ?? [],
    fabricationDetails: o.fabricationDetails ?? null,
  };
}

// Full row for INSERT (new orders only)
function toRow(o: WorkOrder) {
  return {
    id:                          o.id,
    order_number:                o.orderNumber,
    status:                      o.status,
    priority:                    o.priority ?? "normal",
    customer:                    o.customer ?? "",
    city:                        o.city ?? "",
    order_date:                  o.date ?? "",
    version:                     o.version ?? 1,
    contact_person:              o.contactPerson ?? null,
    ordered_by:                  o.orderedBy ?? null,
    location:                    o.location ?? null,
    job_slash:                   o.jobSlash ?? null,
    reference:                   o.reference ?? null,
    graphics_sent_at:            o.graphicsSentAt ?? null,
    graphics_acknowledged_at:    o.graphicsAcknowledgedAt ?? null,
    graphics_acknowledged_by:    o.graphicsAcknowledgedBy ?? null,
    graphics_completed_at:       o.graphicsCompletedAt ?? null,
    fabrication_required:        o.fabricationRequired ?? false,
    fabrication_status:          o.fabricationStatus ?? null,
    fabrication_acknowledged_at: o.fabricationAcknowledgedAt ?? null,
    fabrication_completed_at:    o.fabricationCompletedAt ?? null,
    accounting_status:           o.accountingStatus ?? "pending",
    invoiced_at:                 o.invoicedAt ?? null,
    invoiced_by:                 o.invoicedBy ?? null,
    invoice_number:              o.invoiceNumber ?? null,
    billed_amount:               o.billedAmount ?? null,
    order_type:                  o.orderType ?? "field_work",
    fulfillment_method:          o.fulfillmentMethod ?? null,
    customer_approval_status:    o.customerApprovalStatus ?? "approved",
    warehouse_required:          o.warehouseRequired ?? false,
    warehouse_status:            o.warehouseStatus ?? null,
    job_name:                    o.jobName ?? null,
    estimated_execution_hours:   o.estimatedExecutionHours ?? null,
    ready_for_execution_at:      o.readyForExecutionAt ?? null,
    assigned_crew_id:            o.assignedCrewId ?? null,
    scheduled_date:              o.scheduledDate ?? null,
    required_workers:            o.requiredWorkers ?? null,
    data:                        buildContentBlob(o),
    created_at:                  o.createdAt,
    updated_at:                  o.updatedAt,
  };
}

// ── Local storage fallback ─────────────────────────────────────────────

function loadLocal(): WorkOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLocal(orders: WorkOrder[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(orders)); } catch { /* ignore */ }
}

function generateOrderNumberLocal(orders: WorkOrder[]): string {
  const year = new Date().getFullYear();
  const prefix = `ORD-${year}-`;
  const existing = orders
    .filter(o => o.orderNumber.startsWith(prefix))
    .map(o => parseInt(o.orderNumber.replace(prefix, ""), 10))
    .filter(n => !isNaN(n));
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

// ── Realtime freshness guard ───────────────────────────────────────────
// Tolerates ±5s clock skew between client and server so that a legitimate
// remote update is never silently dropped just because our optimistic
// timestamp was stamped with a slightly-ahead client clock.
function isNewerOrRecent(existing: string, incoming: string, toleranceMs = 5000): boolean {
  try {
    return new Date(incoming).getTime() > new Date(existing).getTime() - toleranceMs;
  } catch { return true; }
}

// ── Fire-and-forget activity insert ────────────────────────────────────
// Activities are append-only and loaded on demand — no state update needed.
function insertActivity(
  orderId: string,
  type: OrderActivityType,
  description: string,
  opts?: { by?: string; department?: string; meta?: Record<string, string> }
) {
  const db = getSupabase();
  if (!db) return;
  db.from("order_activities").insert({
    id:          nanoid(),
    order_id:    orderId,
    type,
    timestamp:   new Date().toISOString(),
    by:          opts?.by ?? null,
    department:  opts?.department ?? null,
    description,
    meta:        opts?.meta ?? null,
  }).then(({ error }) => {
    if (error) console.error("[orders] insertActivity failed:", error.message);
  });
}

// ═══════════════════════════════════════════════════════════════════════
export function useOrders() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const ref = useRef<WorkOrder[]>([]);

  useEffect(() => { ref.current = orders; }, [orders]);

  // ── Full refresh (initial load + visibility-change fallback) ─────────
  const fetchAll = useCallback(() => {
    const db = getSupabase();
    if (!db) { setOrders(loadLocal()); return; }
    db.from("work_orders")
      .select("*, order_problems(*)")
      .order("created_at", { ascending: false })
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
              db.from("work_orders")
                .upsert(local.map(toRow), { onConflict: "id", ignoreDuplicates: true })
                .then(({ error: migErr }) => {
                  if (migErr) console.error("[orders] migration failed:", migErr.message);
                  else saveLocal(local);
                });
            }
          }
        } else {
          setOrders(loadLocal());
        }
      });
  }, []);

  // ── Realtime subscriptions ────────────────────────────────────────────
  useEffect(() => {
    const db = getSupabase();
    if (!db) { setOrders(loadLocal()); return; }

    fetchAll();

    // work_orders → column-level changes (status, fabrication, accounting, etc.)
    const ordersChannel = db
      .channel("work_orders_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const incoming = fromRow(payload.new as Record<string, unknown>);
          setOrders(prev => {
            if (prev.some(o => o.id === incoming.id)) return prev;
            return [incoming, ...prev];
          });
        } else if (payload.eventType === "UPDATE") {
          const incoming = fromRow(payload.new as Record<string, unknown>);
          setOrders(prev => prev.map(o => {
            if (o.id !== incoming.id) return o;
            if (!isNewerOrRecent(o.updatedAt, incoming.updatedAt)) return o;
            // Preserve problems/activities managed by their own subscriptions
            return { ...incoming, problems: o.problems ?? [], activities: o.activities ?? [] };
          }));
        } else if (payload.eventType === "DELETE") {
          const deletedId = (payload.old as { id?: string }).id;
          if (deletedId) setOrders(prev => prev.filter(o => o.id !== deletedId));
        }
      })
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") console.log("[orders] realtime connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          console.warn("[orders] realtime issue:", status, err?.message ?? "");
      });

    // order_problems → independent row lifecycle (INSERT/UPDATE/DELETE)
    const problemsChannel = db
      .channel("order_problems_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "order_problems" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const p = fromProblemRow(payload.new as Record<string, unknown>);
          setOrders(prev => prev.map(o => {
            if (o.id !== p.orderId) return o;
            if ((o.problems ?? []).some(x => x.id === p.id)) return o; // dedup own insert
            return { ...o, problems: [...(o.problems ?? []), p] };
          }));
        } else if (payload.eventType === "UPDATE") {
          const p = fromProblemRow(payload.new as Record<string, unknown>);
          setOrders(prev => prev.map(o => {
            if (o.id !== p.orderId) return o;
            return { ...o, problems: (o.problems ?? []).map(x => x.id === p.id ? p : x) };
          }));
        } else if (payload.eventType === "DELETE") {
          const old = payload.old as { id?: string; order_id?: string };
          if (old.id) {
            setOrders(prev => prev.map(o => {
              if (o.id !== old.order_id) return o;
              return { ...o, problems: (o.problems ?? []).filter(p => p.id !== old.id) };
            }));
          }
        }
      })
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") console.log("[order_problems] realtime connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          console.warn("[order_problems] realtime issue:", status, err?.message ?? "");
      });

    const onVisible = () => { if (document.visibilityState === "visible") fetchAll(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      db.removeChannel(ordersChannel);
      db.removeChannel(problemsChannel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchAll]);

  // ── Core patch: column-level update with optimistic locking ─────────
  //
  // Every write:
  //   1. Applies optimistically to local state immediately.
  //   2. Sends a column-level UPDATE (only the fields in `patch` that
  //      have promoted columns — no full blob overwrite).
  //   3. Includes WHERE version = current_version for conflict detection.
  //   4. On PGRST116 (0 rows matched = version conflict): rolls back the
  //      optimistic update and re-fetches the authoritative DB state.
  //   5. On success: syncs the server-canonical version + timestamp.
  //
  const _patchOrder = useCallback(async (id: string, patch: Partial<WorkOrder>): Promise<void> => {
    const original = ref.current.find(o => o.id === id);
    if (!original) return;

    // Optimistic: apply immediately so the UI is responsive
    const optimistic: WorkOrder = { ...original, ...patch, updatedAt: new Date().toISOString() };
    setOrders(prev => prev.map(o => o.id === id ? optimistic : o));

    const db = getSupabase();
    if (!db) return;

    // Separate patch into column-level fields vs content blob fields
    const columnPatch: Record<string, unknown> = {};
    let needsContentUpdate = false;
    for (const [key, value] of Object.entries(patch)) {
      const col = COLUMN_MAP[key as keyof WorkOrder];
      if (col) {
        columnPatch[col] = value ?? null;
      } else if (CONTENT_FIELDS.has(key as keyof WorkOrder)) {
        needsContentUpdate = true;
      }
    }

    if (Object.keys(columnPatch).length === 0 && !needsContentUpdate) return;

    const dbUpdate: Record<string, unknown> = {
      ...columnPatch,
      version: original.version + 1,
      // updated_at is set by DB trigger; omit here to use server time
    };
    if (needsContentUpdate) {
      dbUpdate.data = buildContentBlob(optimistic);
    }

    const { data: returned, error } = await db.from("work_orders")
      .update(dbUpdate)
      .eq("id", id)
      .eq("version", original.version)   // optimistic lock
      .select("id, version, updated_at")
      .single();

    if (error?.code === "PGRST116") {
      // Version conflict: another user updated this order first.
      // Roll back the optimistic change and re-fetch the canonical state.
      console.warn("[orders] version conflict on", id, "— rolling back and refetching");
      setOrders(prev => prev.map(o => o.id === id ? original : o));
      fetchAll();
      throw new Error("version_conflict");
    } else if (error) {
      console.error("[orders] patch failed:", error.message);
      setOrders(prev => prev.map(o => o.id === id ? original : o));
      throw new Error(error.message);
    } else if (returned) {
      // Sync the server-canonical version and timestamp into local state
      const r = returned as Record<string, unknown>;
      setOrders(prev => prev.map(o =>
        o.id === id
          ? { ...optimistic, version: r.version as number, updatedAt: r.updated_at as string }
          : o
      ));
    }
  }, [fetchAll]);

  // ── addOrder ──────────────────────────────────────────────────────────
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
      version: 1,
      date: snapshot.date,
      customer: snapshot.customer,
      contactPerson: snapshot.contactPerson || undefined,
      orderedBy: snapshot.orderedBy || undefined,
      city: snapshot.city ?? "",
      orderType: snapshot.orderType ?? "field_work",
      fulfillmentMethod: snapshot.orderType === "equipment_supply" ? "delivery" : (snapshot.fulfillmentMethod ?? null),
      customerApprovalStatus: snapshot.awaitingCustomerApproval ? "pending" : "approved",
      warehouseRequired: (snapshot.accessoryRows ?? []).some(r => r.description?.trim() !== ""),
      warehouseStatus: (snapshot.accessoryRows ?? []).some(r => r.description?.trim() !== "") ? "pending" : null,
      jobName: snapshot.jobName?.trim() || null,
      location: snapshot.location?.trim() || undefined,
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
      problems: [],
      activities: [],
    };

    setOrders(prev => [newOrder, ...prev]);

    if (db) {
      db.from("work_orders").insert(toRow(newOrder)).then(({ error }) => {
        if (error) {
          console.error("[orders] insert failed:", error.message);
          setOrders(prev => prev.filter(o => o.id !== newOrder.id));
        } else {
          const depts: string[] = [];
          if (newOrder.signRows?.length || newOrder.miscRows?.length) depts.push("מחלקת גרפיקה");
          if (newOrder.warehouseRequired) depts.push("מחלקת מחסן");
          if (depts.length === 0) depts.push("מחלקת גרפיקה");
          insertActivity(newOrder.id, "order_created", `הזמנה נוצרה ונשלחה ל${depts.join(" ו")}`);
        }
      });
    }
    return newOrder;
  }, []);

  // ── acknowledgeOrder ───────────────────────────────────────────────────
  const acknowledgeOrder = useCallback(async (id: string, acknowledgedBy = "גרפיקה"): Promise<void> => {
    const now = new Date().toISOString();
    await _patchOrder(id, {
      status: "graphics_active",
      graphicsAcknowledgedAt: now,
      graphicsAcknowledgedBy: acknowledgedBy,
    });
    insertActivity(id, "graphics_acknowledged", `אישור קבלה על ידי ${acknowledgedBy}`, {
      by: acknowledgedBy, department: "graphics",
    });
  }, [_patchOrder]);

  // ── completeGraphics ───────────────────────────────────────────────────
  const completeGraphics = useCallback(async (id: string): Promise<void> => {
    const now = new Date().toISOString();
    const order = ref.current.find(o => o.id === id);
    if (!order) return;
    // If no department work needed, advance directly to ready_installation (skip production)
    const needsDeptWork = order.fabricationRequired || order.warehouseRequired;
    const nextStatus: WorkOrderStatus = needsDeptWork ? "graphics_done" : "ready_installation";
    await _patchOrder(id, {
      status: nextStatus,
      graphicsCompletedAt: now,
      ...(nextStatus === "ready_installation" && !order.readyForExecutionAt ? { readyForExecutionAt: now } : {}),
    });
    insertActivity(
      id, "graphics_completed",
      needsDeptWork ? "עבודת גרפיקה הושלמה" : "עבודת גרפיקה הושלמה — ההזמנה מוכנה לביצוע",
      { department: "graphics" }
    );
  }, [_patchOrder]);

  // ── approveCustomerOrder ───────────────────────────────────────────────
  const approveCustomerOrder = useCallback(async (id: string): Promise<void> => {
    await _patchOrder(id, { customerApprovalStatus: "approved" });
    insertActivity(id, "status_changed", "אישור לקוח התקבל — ההזמנה עוברת לשיבוץ");
  }, [_patchOrder]);

  // ── updateOrderStatus ──────────────────────────────────────────────────
  const updateOrderStatus = useCallback(async (id: string, status: WorkOrderStatus): Promise<void> => {
    const original = ref.current.find(o => o.id === id);
    if (!original) return;

    if (!canTransition(original.status, status)) {
      throw new Error(`מעבר סטטוס לא חוקי: ${original.status} → ${status}`);
    }

    if (status === "ready_installation") {
      const fabCheck = canMarkReadyForInstallation(original);
      if (!fabCheck.ok) {
        throw new Error(fabCheck.reason ?? "תנאי מחלקות לא הושלמו");
      }
    }

    const extra: Partial<WorkOrder> = {};
    if (status === "ready_installation" && !original.readyForExecutionAt) {
      extra.readyForExecutionAt = new Date().toISOString();
    }
    await _patchOrder(id, { status, ...extra });

    // Refresh profitability snapshot when order is marked completed — best-effort, non-fatal
    if (status === "completed") {
      const db = getSupabase();
      if (db) {
        db.auth.getSession().then(({ data: { session } }) => {
          if (!session?.access_token) return;
          fetch("/api/profitability/snapshots/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ orderId: id }),
          }).catch(err => console.warn("[orders] snapshot refresh failed (non-fatal):", err));
        }).catch(() => {});
      }
    }
  }, [_patchOrder]);

  // ── updateOrderFields ──────────────────────────────────────────────────
  // Generic patch — callers pass only the fields they own.
  // The column map ensures only the relevant columns are written.
  // Auto-advances status when department completions satisfy all requirements.
  const updateOrderFields = useCallback(async (id: string, fields: Partial<WorkOrder>): Promise<void> => {
    const current = ref.current.find(o => o.id === id);
    if (!current) { await _patchOrder(id, fields); return; }

    const merged: WorkOrder = { ...current, ...fields };
    const extra: Partial<WorkOrder> = {};

    // Auto-advance: production → ready_installation when all required departments are done
    if (("warehouseStatus" in fields || "fabricationStatus" in fields) && merged.status === "production") {
      const warehouseOk = !merged.warehouseRequired || merged.warehouseStatus === "ready";
      const fabricationOk = !merged.fabricationRequired ||
        merged.fabricationStatus === "completed" || merged.fabricationStatus === "ready";
      if (warehouseOk && fabricationOk) {
        extra.status = "ready_installation";
        if (!merged.readyForExecutionAt) extra.readyForExecutionAt = new Date().toISOString();
      }
    }

    await _patchOrder(id, { ...fields, ...extra });

    if (extra.status === "ready_installation") {
      insertActivity(id, "status_changed", "כל שלבי ההכנה הושלמו — ההזמנה מוכנה לביצוע");
    }
  }, [_patchOrder]);

  // ── addOrderProblem ────────────────────────────────────────────────────
  // Inserts a row into order_problems — independent of work_orders version.
  // No cross-domain overwrite risk: problems have their own table and PK.
  const addOrderProblem = useCallback((
    id: string,
    problem: { department: "graphics" | "fabrication" | "office"; category: OrderProblemCategory; description: string; reportedBy?: string }
  ) => {
    const now = new Date().toISOString();
    const newProblem: OrderProblem = {
      id: nanoid(), orderId: id, ...problem, reportedAt: now, status: "open",
    };

    setOrders(prev => prev.map(o =>
      o.id === id ? { ...o, problems: [...(o.problems ?? []), newProblem] } : o
    ));

    const db = getSupabase();
    if (db) {
      db.from("order_problems").insert({
        id:          newProblem.id,
        order_id:    id,
        department:  problem.department,
        category:    problem.category,
        description: problem.description,
        reported_by: problem.reportedBy ?? null,
        status:      "open",
        reported_at: now,
      }).then(({ error }) => {
        if (error) {
          console.error("[orders] addOrderProblem failed:", error.message);
          setOrders(prev => prev.map(o =>
            o.id === id
              ? { ...o, problems: (o.problems ?? []).filter(p => p.id !== newProblem.id) }
              : o
          ));
        } else {
          insertActivity(id, "problem_reported", `בעיה דווחה: ${problem.description}`, {
            department: problem.department, by: problem.reportedBy,
          });
        }
      });
    }
    return newProblem;
  }, []);

  // ── resolveOrderProblem ────────────────────────────────────────────────
  const resolveOrderProblem = useCallback((
    orderId: string,
    problemId: string,
    opts?: { resolvedBy?: string; resolutionNotes?: string; newStatus?: OrderProblemStatus }
  ) => {
    const now = new Date().toISOString();
    const status = opts?.newStatus ?? "resolved";
    const originalProblem = (ref.current.find(o => o.id === orderId)?.problems ?? [])
      .find(p => p.id === problemId);

    setOrders(prev => prev.map(o =>
      o.id === orderId
        ? {
            ...o,
            problems: (o.problems ?? []).map(p =>
              p.id === problemId
                ? { ...p, status, resolvedAt: now, resolvedBy: opts?.resolvedBy, resolutionNotes: opts?.resolutionNotes }
                : p
            ),
          }
        : o
    ));

    const db = getSupabase();
    if (db) {
      db.from("order_problems")
        .update({
          status,
          resolved_at:      now,
          resolved_by:      opts?.resolvedBy ?? null,
          resolution_notes: opts?.resolutionNotes ?? null,
        })
        .eq("id", problemId)
        .eq("order_id", orderId)
        .select("id")
        .single()
        .then(({ error }) => {
          const notFound = error?.code === "PGRST116";
          if (error && !notFound) {
            console.error("[orders] resolveOrderProblem failed:", error.message);
          }
          if ((error && !notFound) || notFound) {
            if (originalProblem) {
              setOrders(prev => prev.map(o =>
                o.id === orderId
                  ? { ...o, problems: (o.problems ?? []).map(p => p.id === problemId ? originalProblem : p) }
                  : o
              ));
            }
            if (notFound) fetchAll();
          } else {
            insertActivity(orderId, "problem_status_changed",
              status === "resolved" ? "בעיה סומנה כנפתרה" : `סטטוס בעיה עודכן ל-${status}`,
              { by: opts?.resolvedBy }
            );
          }
        });
    }
  }, [fetchAll]);

  // ── deleteOrder ────────────────────────────────────────────────────────
  const deleteOrder = useCallback(async (id: string): Promise<void> => {
    const original = ref.current.find(o => o.id === id);
    setOrders(prev => prev.filter(o => o.id !== id));
    const db = getSupabase();
    if (db) {
      const { error } = await db.from("work_orders").delete().eq("id", id);
      if (error) {
        if (original) setOrders(prev => [original, ...prev]);
        throw error;
      }
    }
  }, []);

  // ── addOrderActivity ───────────────────────────────────────────────────
  const addOrderActivity = useCallback((
    id: string, type: OrderActivityType, description: string,
    opts?: { by?: string; department?: string; meta?: Record<string, string> }
  ) => {
    const activity: OrderActivity = {
      id: nanoid(), orderId: id, type, timestamp: new Date().toISOString(), description, ...opts,
    };
    setOrders(prev => prev.map(o =>
      o.id === id ? { ...o, activities: [...(o.activities ?? []), activity] } : o
    ));
    insertActivity(id, type, description, opts);
  }, []);

  return {
    orders, addOrder, acknowledgeOrder, completeGraphics,
    approveCustomerOrder,
    updateOrderStatus, updateOrderFields, addOrderActivity,
    addOrderProblem, resolveOrderProblem,
    deleteOrder,
  };
}
