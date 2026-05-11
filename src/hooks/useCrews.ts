// src/hooks/useCrews.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import type { Crew } from "@/types/crew";

const STORAGE_KEY = "elkayam_crews";

function loadCrews(): Crew[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useCrews() {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCrews(loadCrews());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(crews));
  }, [crews, hydrated]);

  const addCrew = useCallback((data: Omit<Crew, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    const crew: Crew = { id: nanoid(), ...data, createdAt: now, updatedAt: now };
    setCrews((prev) => [...prev, crew]);
    return crew;
  }, []);

  const updateCrew = useCallback((id: string, data: Partial<Omit<Crew, "id" | "createdAt">>) => {
    const now = new Date().toISOString();
    setCrews((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...data, updatedAt: now } : c))
    );
  }, []);

  const deleteCrew = useCallback((id: string) => {
    setCrews((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { crews, addCrew, updateCrew, deleteCrew };
}
