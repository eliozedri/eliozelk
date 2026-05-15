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

function isNewerOrRecent(existing: string, incoming: string, toleranceMs = 5000): boolean {
  try {
    return new Date(incoming).getTime() > new Date(existing).getTime() - toleranceMs;
  } catch { return true; }
}

export function useCrews() {
  const [crews, setCrews] = useState<Crew[]>([]);
  const ref = useRef<Crew[]>([]);

  useEffect(() => { ref.current = crews; }, [crews]);

  useEffect(() => {
    const db = getSupabase();
    if (!db) {
      setCrews(loadLocal());
      return;
    }

    const fetchAll = () =>
      db.from("crews").select("*").order("created_at", { ascending: true })
        .then(({ data, error }) => {
          if (!error && data) {
            const mapped = data.map(r => fromRow(r as Record<string, unknown>));
            if (mapped.length > 0) {
              setCrews(mapped);
              saveLocal(mapped);
            } else {
              const local = loadLocal();
              if (local.length > 0) {
                console.log("[crews] migrating local cache to Supabase:", local.length, "rows");
                setCrews(local);
                db.from("crews").upsert(local.map(toRow), { onConflict: "id" }).then(({ error: migErr }) => {
                  if (migErr) console.error("[crews] migration failed:", migErr.message);
                  else saveLocal(local);
                });
              }
            }
          } else {
            setCrews(loadLocal());
          }
        });

    fetchAll();

    const channel = db
      .channel("crews_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crews" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const incoming = fromRow(payload.new as Record<string, unknown>);
            setCrews(prev => {
              if (prev.some(c => c.id === incoming.id)) return prev;
              return [...prev, incoming];
            });
          } else if (payload.eventType === "UPDATE") {
            const incoming = fromRow(payload.new as Record<string, unknown>);
            setCrews(prev => prev.map(c =>
              c.id === incoming.id && isNewerOrRecent(c.updatedAt, incoming.updatedAt) ? incoming : c
            ));
          } else if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as { id?: string }).id;
            if (deletedId) setCrews(prev => prev.filter(c => c.id !== deletedId));
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          console.log("[crews] realtime connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[crews] realtime issue:", status, err?.message ?? "");
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
    const remaining = ref.current.filter(c => c.id !== id);
    setCrews(remaining);
    saveLocal(remaining);
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
