"use client";

import { createContext, useContext } from "react";
import { useWorkDiaries } from "@/hooks/useWorkDiaries";
import type { WorkDiary } from "@/types/workDiary";

interface WorkDiaryContextValue {
  diaries: WorkDiary[];
  createDiary: () => Promise<WorkDiary>;
  saveDiary: (diary: WorkDiary) => void;
  submitDiary: (id: string) => void;
  deleteDiary: (id: string) => void;
  approveDiary: (id: string, approvedBy: string) => void;
  rejectDiary: (id: string, reason: string) => void;
}

const WorkDiaryContext = createContext<WorkDiaryContextValue | null>(null);

export function WorkDiaryProvider({ children }: { children: React.ReactNode }) {
  const value = useWorkDiaries();
  return (
    <WorkDiaryContext.Provider value={value}>
      {children}
    </WorkDiaryContext.Provider>
  );
}

export function useWorkDiaryContext(): WorkDiaryContextValue {
  const ctx = useContext(WorkDiaryContext);
  if (!ctx)
    throw new Error("useWorkDiaryContext must be used inside WorkDiaryProvider");
  return ctx;
}
