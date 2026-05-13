"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkDiary, WorkDiaryStatus } from "@/types/workDiary";
import { createEmptyDiary } from "@/types/workDiary";
import { getSupabase } from "@/lib/supabase/client";

const STORAGE_KEY = "elkayam_work_diaries";

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
    data: d,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

function loadLocal(): WorkDiary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocal(diaries: WorkDiary[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(diaries)); } catch { /* ignore */ }
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
    const db = getSupabase();
    if (db) {
      db.from("work_diaries").select("*").order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) {
            const mapped = data.map(r => fromRow(r as Record<string, unknown>));
            if (mapped.length > 0) {
              setDiaries(mapped);
              saveLocal(mapped); // warm cache — written once
            } else {
              const local = loadLocal();
              if (local.length > 0) {
                console.log("[work_diaries] migrating local cache to Supabase:", local.length, "rows");
                setDiaries(local);
                db.from("work_diaries").upsert(local.map(toRow), { onConflict: "id" }).then(({ error: migErr }) => {
                  if (migErr) console.error("[work_diaries] migration failed:", migErr.message);
                  else saveLocal(local);
                });
              }
            }
          } else {
            setDiaries(loadLocal());
          }
        });
    } else {
      setDiaries(loadLocal());
    }
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
    const updated = { ...diary, updatedAt: now };
    setDiaries(prev => {
      const exists = prev.find(d => d.id === diary.id);
      return exists ? prev.map(d => d.id === diary.id ? updated : d) : [updated, ...prev];
    });
    const db = getSupabase();
    if (db) {
      db.from("work_diaries").upsert(toRow(updated)).then(({ error }) => {
        if (error) console.error("[diaries] save failed:", error.message);
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
    setDiaries(prev => prev.filter(d => d.id !== id));
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

  return { diaries, createDiary, saveDiary, submitDiary, deleteDiary };
}
