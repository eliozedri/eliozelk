"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorkDiary, WorkDiaryStatus } from "@/types/workDiary";
import { createEmptyDiary } from "@/types/workDiary";

const STORAGE_KEY = "elkayam_work_diaries";

function loadDiaries(): WorkDiary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function generateDiaryNumber(diaries: WorkDiary[]): string {
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
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDiaries(loadDiaries());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(diaries));
  }, [diaries, hydrated]);

  const createDiary = useCallback((): WorkDiary => {
    const existing = loadDiaries();
    const number = generateDiaryNumber(existing);
    const diary = createEmptyDiary(number);
    setDiaries((prev) => [diary, ...prev]);
    return diary;
  }, []);

  const saveDiary = useCallback((diary: WorkDiary) => {
    const now = new Date().toISOString();
    setDiaries((prev) => {
      const exists = prev.find((d) => d.id === diary.id);
      if (exists) {
        return prev.map((d) =>
          d.id === diary.id ? { ...diary, updatedAt: now } : d
        );
      }
      return [{ ...diary, updatedAt: now }, ...prev];
    });
  }, []);

  const submitDiary = useCallback((id: string) => {
    const now = new Date().toISOString();
    setDiaries((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              status: "submitted" as WorkDiaryStatus,
              submittedAt: now,
              updatedAt: now,
            }
          : d
      )
    );
  }, []);

  const deleteDiary = useCallback((id: string) => {
    setDiaries((prev) => prev.filter((d) => d.id !== id));
  }, []);

  return { diaries, createDiary, saveDiary, submitDiary, deleteDiary };
}
