"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { Equipment } from "@/types/equipment";
import { OPEN_INCIDENT_STATUSES } from "@/types/equipment";

async function getBearerToken(): Promise<string | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db.auth.getSession();
  return data.session?.access_token ?? null;
}

async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await getBearerToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(url, { ...init, headers });
}

export function useEquipment() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [openIncidentsByAsset, setOpenIncidentsByAsset] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const equipmentRef = useRef<Equipment[]>([]);
  equipmentRef.current = equipment;

  const fetchOpenIncidents = useCallback(async () => {
    const db = getSupabase();
    if (!db) return;
    const { data } = await db
      .from("equipment_incidents")
      .select("equipment_id")
      .in("status", OPEN_INCIDENT_STATUSES);
    const counts: Record<string, number> = {};
    for (const row of (data ?? []) as { equipment_id: string }[]) {
      counts[row.equipment_id] = (counts[row.equipment_id] ?? 0) + 1;
    }
    setOpenIncidentsByAsset(counts);
  }, []);

  const refetch = useCallback(async () => {
    const db = getSupabase();
    if (!db) { setLoading(false); return; }
    const { data, error: err } = await db
      .from("equipment")
      .select("*")
      .eq("is_active", true)
      .order("display_name", { ascending: true });
    if (err) {
      setError(err.message);
    } else {
      setEquipment((data ?? []) as Equipment[]);
      setError(null);
    }
    await fetchOpenIncidents();
    setLoading(false);
  }, [fetchOpenIncidents]);

  useEffect(() => {
    refetch();
    const db = getSupabase();
    if (!db) return;
    const channel = db
      .channel("equipment-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment_incidents" }, () => fetchOpenIncidents())
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, [refetch, fetchOpenIncidents]);

  const createEquipment = useCallback(async (payload: Partial<Equipment>): Promise<Equipment | null> => {
    const res = await authedFetch("/api/equipment", { method: "POST", body: JSON.stringify(payload) });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? "יצירת כלי נכשלה");
    }
    const created = (await res.json()) as Equipment;
    setEquipment(prev => [...prev, created].sort((a, b) => a.display_name.localeCompare(b.display_name, "he")));
    return created;
  }, []);

  const updateEquipment = useCallback(async (id: string, patch: Partial<Equipment>): Promise<Equipment | null> => {
    const prev = equipmentRef.current;
    // optimistic
    setEquipment(cur => cur.map(e => (e.id === id ? { ...e, ...patch } as Equipment : e)));
    const res = await authedFetch(`/api/equipment/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    if (!res.ok) {
      setEquipment(prev); // rollback
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? "עדכון נכשל");
    }
    const updated = (await res.json()) as Equipment;
    setEquipment(cur => cur.map(e => (e.id === id ? updated : e)));
    return updated;
  }, []);

  const deleteEquipment = useCallback(async (id: string): Promise<void> => {
    const prev = equipmentRef.current;
    setEquipment(cur => cur.filter(e => e.id !== id)); // optimistic
    const res = await authedFetch(`/api/equipment/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setEquipment(prev); // rollback
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? "מחיקה נכשלה");
    }
  }, []);

  // Apply a fresh row returned by photo/document routes without a full refetch.
  const applyServerRow = useCallback((id: string, patch: Partial<Equipment>) => {
    setEquipment(cur => cur.map(e => (e.id === id ? { ...e, ...patch } as Equipment : e)));
  }, []);

  return {
    equipment,
    openIncidentsByAsset,
    loading,
    error,
    refetch,
    createEquipment,
    updateEquipment,
    deleteEquipment,
    applyServerRow,
  };
}
