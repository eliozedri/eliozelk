// src/hooks/useCrews.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import type { Crew } from "@/types/crew";
import { getSupabase } from "@/lib/supabase/client";

const STORAGE_KEY = "elkayam_crews";

function fromRow(r: Record<string, unknown>): Crew {
  return {
    id: r.id as string,
    name: r.name as string,
    leader: r.leader as string,
    workerCount: r.worker_count as number,
    phone: r.phone as string,
    skills: r.skills as Crew["skills"],
    region: r.region as Crew["region"],
    dailyCapacityHours: Number(r.daily_capacity_hours),
    active: r.active as boolean,
    notes: r.notes as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function toRow(c: Crew) {
  return {
    id: c.id,
    name: c.name,
    leader: c.leader,
    worker_count: c.workerCount,
    phone: c.phone,
    skills: c.skills,
    region: c.region,
    daily_capacity_hours: c.dailyCapacityHours,
    active: c.active,
    notes: c.notes,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

function loadLocal(): Crew[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}

function saveLocal(crews: Crew[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(crews)); } catch { /* ignore */ }
}

export function useCrews() {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const ref = useRef<Crew[]>([]);

  useEffect(() => { ref.current = crews; }, [crews]);

  useEffect(() => {
    if (!hydrated) return;
    saveLocal(crews);
  }, [crews, hydrated]);

  useEffect(() => {
    const db = getSupabase();
    if (db) {
      db.from("crews").select("*").order("created_at", { ascending: true })
        .then(({ data, error }) => {
          if (!error && data) {
            if (data.length > 0) {
              const mapped = data.map(r => fromRow(r as Record<string, unknown>));
              setCrews(mapped);
              saveLocal(mapped);
            } else {
              const local = loadLocal();
              setCrews(local);
              if (local.length > 0) {
                db.from("crews").upsert(local.map(toRow), { onConflict: "id" }).then(() => {});
              }
            }
          } else {
            setCrews(loadLocal());
          }
          setHydrated(true);
        });
    } else {
      setCrews(loadLocal());
      setHydrated(true);
    }
  }, []);

  const addCrew = useCallback((data: Omit<Crew, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    const crew: Crew = { id: nanoid(), ...data, createdAt: now, updatedAt: now };

    setCrews(prev => [...prev, crew]);

    const db = getSupabase();
    if (db) {
      db.from("crews").insert(toRow(crew)).then(({ error }) => {
        if (error) {
          console.error("[crews] insert failed:", error.message);
          setCrews(prev => prev.filter(c => c.id !== crew.id));
        }
      });
    }
    return crew;
  }, []);

  const updateCrew = useCallback((id: string, data: Partial<Omit<Crew, "id" | "createdAt">>) => {
    const now = new Date().toISOString();
    const original = ref.current.find(c => c.id === id);
    if (!original) return;
    const updated = { ...original, ...data, updatedAt: now };

    setCrews(prev => prev.map(c => c.id === id ? updated : c));

    const db = getSupabase();
    if (db) {
      db.from("crews").update(toRow(updated)).eq("id", id).then(({ error }) => {
        if (error) {
          console.error("[crews] update failed:", error.message);
          setCrews(prev => prev.map(c => c.id === id ? original : c));
        }
      });
    }
  }, []);

  const deleteCrew = useCallback((id: string) => {
    const original = ref.current.find(c => c.id === id);

    setCrews(prev => prev.filter(c => c.id !== id));

    const db = getSupabase();
    if (db) {
      db.from("crews").delete().eq("id", id).then(({ error }) => {
        if (error) {
          console.error("[crews] delete failed:", error.message);
          if (original) setCrews(prev => [...prev, original]);
        }
      });
    }
  }, []);

  return { crews, addCrew, updateCrew, deleteCrew };
}
