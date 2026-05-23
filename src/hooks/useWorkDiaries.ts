"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkDiary, WorkDiaryStatus, DiaryApprovalStatus } from "@/types/workDiary";
import { createEmptyDiary, normalizeSecurityTeams } from "@/types/workDiary";
import { getSupabase } from "@/lib/supabase/client";

function fromRow(r: Record<string, unknown>): WorkDiary {
  const data = (r.data ?? {}) as Partial<WorkDiary>;
  return {
    ...data,
    id: r.id as string,
    diaryNumber: r.diary_number as string,
    status: r.status as WorkDiaryStatus,
    customerName: r.customer_name as string,
    siteName: r.site_name as string,
    executionDate: r.execution_date as string,
    submittedAt: r.submitted_at as string | null | undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    // Promoted execution lifecycle columns take priority over blob
    orderId: (r.order_id as string | null | undefined) ?? data.orderId,
    approvalStatus: (r.approval_status as DiaryApprovalStatus | null | undefined) ?? data.approvalStatus,
    approvedBy: (r.approved_by as string | null | undefined) ?? data.approvedBy,
    approvedAt: (r.approved_at as string | null | undefined) ?? data.approvedAt,
    rejectionReason: (r.rejection_reason as string | null | undefined) ?? data.rejectionReason,
    internalEmailedAt: (r.internal_emailed_at as string | null | undefined) ?? null,
    internalEmailError: (r.internal_email_error as string | null | undefined) ?? null,
    crewMembers: Array.isArray(data.crewMembers) ? data.crewMembers : [],
    securityTeams: data.securityTeams ? normalizeSecurityTeams(data.securityTeams) : undefined,
  } as WorkDiary;
}

function toRow(d: WorkDiary) {
  return {
    id: d.id,
    diary_number: d.diaryNumber,
    status: d.status,
    customer_name: d.customerName,
    site_name: d.siteName,
    execution_date: d.executionDate,
    submitted_at: d.submittedAt ?? null,
    order_id: d.orderId ?? null,
    approval_status: d.approvalStatus ?? "pending",
    approved_by: d.approvedBy ?? null,
    approved_at: d.approvedAt ?? null,
    rejection_reason: d.rejectionReason ?? null,
    internal_emailed_at: d.internalEmailedAt ?? null,
    internal_email_error: d.internalEmailError ?? null,
    data: d,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

// Apply incoming update if it's newer than or within clock-skew tolerance of existing.
// Strictly greater-than would silently drop legitimate remote updates when the local
// optimistic timestamp (client clock) is slightly ahead of the server clock.
function isNewerOrRecent(existing: string, incoming: string, toleranceMs = 5000): boolean {
  try {
    return new Date(incoming).getTime() > new Date(existing).getTime() - toleranceMs;
  } catch { return true; }
}

function generateDiaryNumberLocal(diaries: WorkDiary[]): string {
  const year = new Date().getFullYear();
  const prefix = `WD-${year}-`;
  const existing = diaries
    .filter((d) => d.diaryNumber.startsWith(prefix))
    .map((d) => parseInt(d.diaryNumber.replace(prefix, ""), 10))
    .filter((n) => !isNaN(n));
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export function useWorkDiaries() {
  const [diaries, setDiaries] = useState<WorkDiary[]>([]);
  const ref = useRef<WorkDiary[]>([]);

  useEffect(() => { ref.current = diaries; }, [diaries]);

  useEffect(() => {
    // ARCHITECTURE: Supabase is the sole source of truth for operational business data.
    // localStorage is not used — no seeding, no fallback, no caching.
    const db = getSupabase();
    if (!db) { return; }

    const fetchAll = () =>
      db.from("work_diaries").select("*").order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) {
            const mapped = data.map(r => fromRow(r as Record<string, unknown>));
            setDiaries(mapped);
          } else {
            setDiaries([]);
          }
        });

    fetchAll();

    const channel = db
      .channel("work_diaries_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_diaries" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const incoming = fromRow(payload.new as Record<string, unknown>);
            setDiaries(prev => {
              if (prev.some(d => d.id === incoming.id)) return prev;
              return [incoming, ...prev];
            });
          } else if (payload.eventType === "UPDATE") {
            const incoming = fromRow(payload.new as Record<string, unknown>);
            setDiaries(prev => prev.map(d =>
              d.id === incoming.id && isNewerOrRecent(d.updatedAt, incoming.updatedAt) ? incoming : d
            ));
          } else if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as { id?: string }).id;
            if (deletedId) setDiaries(prev => prev.filter(d => d.id !== deletedId));
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          console.log("[work_diaries] realtime connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[work_diaries] realtime issue:", status, err?.message ?? "");
        }
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") fetchAll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      db.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const createDiary = useCallback(async (): Promise<WorkDiary> => {
    const db = getSupabase();
    let number: string;
    if (db) {
      const { data, error } = await db.rpc("next_counter", { counter_key: "diary" });
      if (!error && data != null) {
        const year = new Date().getFullYear();
        number = `WD-${year}-${String(data as number).padStart(3, "0")}`;
      } else {
        number = generateDiaryNumberLocal(ref.current);
      }
    } else {
      number = generateDiaryNumberLocal(ref.current);
    }

    const diary = createEmptyDiary(number);
    setDiaries(prev => [diary, ...prev]);

    if (db) {
      db.from("work_diaries").insert(toRow(diary)).then(({ error }) => {
        if (error) {
          console.error("[diaries] insert failed:", error.message);
          setDiaries(prev => prev.filter(d => d.id !== diary.id));
        }
      });
    }
    return diary;
  }, []);

  const saveDiary = useCallback((diary: WorkDiary) => {
    const now = new Date().toISOString();
    const original = ref.current.find(d => d.id === diary.id);
    const updated = { ...diary, updatedAt: now };
    setDiaries(prev => {
      const exists = prev.find(d => d.id === diary.id);
      return exists ? prev.map(d => d.id === diary.id ? updated : d) : [updated, ...prev];
    });
    const db = getSupabase();
    if (db) {
      db.from("work_diaries").upsert(toRow(updated)).then(({ error }) => {
        if (error) {
          console.error("[diaries] save failed:", error.message);
          if (original) setDiaries(prev => prev.map(d => d.id === diary.id ? original : d));
        }
      });
    }
  }, []);

  const submitDiary = useCallback((id: string) => {
    const now = new Date().toISOString();
    const original = ref.current.find(d => d.id === id);
    if (!original) return;
    const updated = { ...original, status: "submitted" as WorkDiaryStatus, submittedAt: now, updatedAt: now };

    setDiaries(prev => prev.map(d => d.id === id ? updated : d));

    const db = getSupabase();
    if (db) {
      db.from("work_diaries")
        .update({ status: "submitted", submitted_at: now, updated_at: now, data: updated })
        .eq("id", id)
        .then(({ error }) => {
          if (error) {
            console.error("[diaries] submit failed:", error.message);
            setDiaries(prev => prev.map(d => d.id === id ? original : d));
          }
        });
    }
  }, []);

  const deleteDiary = useCallback((id: string) => {
    const original = ref.current.find(d => d.id === id);
    const remaining = ref.current.filter(d => d.id !== id);
    setDiaries(remaining);
    const db = getSupabase();
    if (db) {
      db.from("work_diaries").delete().eq("id", id).then(({ error }) => {
        if (error) {
          console.error("[diaries] delete failed:", error.message);
          if (original) setDiaries(prev => [original, ...prev]);
        }
      });
    }
  }, []);

  const cancelDiary = useCallback((id: string) => {
    const now = new Date().toISOString();
    const original = ref.current.find(d => d.id === id);
    if (!original) return;
    const updated: WorkDiary = { ...original, status: "cancelled", cancelledAt: now, updatedAt: now };
    const next = ref.current.map(d => d.id === id ? updated : d);
    setDiaries(next);
    const db = getSupabase();
    if (db) {
      db.from("work_diaries")
        .update({ status: "cancelled", updated_at: now, data: updated })
        .eq("id", id)
        .then(({ error }) => {
          if (error) {
            console.error("[diaries] cancel failed:", error.message);
            if (original) setDiaries(prev => prev.map(d => d.id === id ? original : d));
          }
        });
    }
  }, []);

  const approveDiary = useCallback((id: string, approvedBy: string) => {
    const now = new Date().toISOString();
    const original = ref.current.find(d => d.id === id);
    if (!original || original.status !== "submitted") return;
    const updated: WorkDiary = {
      ...original,
      approvalStatus: "approved",
      approvedBy,
      approvedAt: now,
      rejectionReason: undefined,
      updatedAt: now,
    };
    setDiaries(prev => prev.map(d => d.id === id ? updated : d));
    const db = getSupabase();
    if (db) {
      db.from("work_diaries")
        .update({
          approval_status: "approved",
          approved_by: approvedBy,
          approved_at: now,
          rejection_reason: null,
          updated_at: now,
          data: updated,
        })
        .eq("id", id)
        .then(async ({ error }) => {
          if (error) {
            console.error("[diaries] approve failed:", error.message);
            setDiaries(prev => prev.map(d => d.id === id ? original : d));
            return;
          }
          // Trigger inventory consumption for order-linked diaries
          if (updated.orderId) {
            try {
              const { data: { session } } = await db.auth.getSession();
              if (session?.access_token) {
                const res = await fetch("/api/inventory/consume-order", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session.access_token}`,
                  },
                  body: JSON.stringify({ orderId: updated.orderId, diaryId: id }),
                });
                if (!res.ok) {
                  const body = await res.json().catch(() => ({})) as { error?: string };
                  console.warn("[diaries] consumption sync warning:", body.error ?? res.status);
                }
                // Refresh profitability snapshot after diary approval — best-effort, non-fatal
                fetch("/api/profitability/snapshots/generate", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session.access_token}`,
                  },
                  body: JSON.stringify({ orderId: updated.orderId }),
                }).catch(err => console.warn("[diaries] snapshot refresh failed (non-fatal):", err));
              }
            } catch (consumeErr) {
              console.warn("[diaries] consumption trigger failed (non-fatal):", consumeErr);
            }
          }
        });
    }
  }, []);

  const rejectDiary = useCallback((id: string, reason: string) => {
    const now = new Date().toISOString();
    const original = ref.current.find(d => d.id === id);
    if (!original || original.status !== "submitted") return;
    const updated: WorkDiary = {
      ...original,
      approvalStatus: "rejected",
      rejectionReason: reason,
      approvedBy: undefined,
      approvedAt: undefined,
      updatedAt: now,
    };
    setDiaries(prev => prev.map(d => d.id === id ? updated : d));
    const db = getSupabase();
    if (db) {
      db.from("work_diaries")
        .update({
          approval_status: "rejected",
          rejection_reason: reason,
          approved_by: null,
          approved_at: null,
          updated_at: now,
          data: updated,
        })
        .eq("id", id)
        .then(({ error }) => {
          if (error) {
            console.error("[diaries] reject failed:", error.message);
            setDiaries(prev => prev.map(d => d.id === id ? original : d));
          }
        });
    }
  }, []);

  return { diaries, createDiary, saveDiary, submitDiary, deleteDiary, cancelDiary, approveDiary, rejectDiary };
}
