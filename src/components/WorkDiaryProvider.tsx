"use client";

import { WorkDiaryProvider as Provider } from "@/context/WorkDiaryContext";

export function WorkDiaryProvider({ children }: { children: React.ReactNode }) {
  return <Provider>{children}</Provider>;
}
