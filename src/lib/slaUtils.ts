// src/lib/slaUtils.ts

export type SlaColor = "green" | "yellow" | "red" | "gray";

export const SLA_COLORS: Record<SlaColor, { bg: string; text: string; dot: string; label: string }> = {
  green:  { bg: "bg-green-100",  text: "text-green-800",  dot: "bg-green-500",  label: "מוכן (עד 24 שע׳)" },
  yellow: { bg: "bg-amber-100",  text: "text-amber-800",  dot: "bg-amber-500",  label: "מתעכב (1–3 ימים)" },
  red:    { bg: "bg-red-100",    text: "text-red-800",    dot: "bg-red-500",    label: "דחוף (מעל 3 ימים)" },
  gray:   { bg: "bg-gray-100",   text: "text-gray-600",   dot: "bg-gray-400",   label: "לא מוכן לביצוע" },
};

export const SLA_HEX: Record<SlaColor, string> = {
  green:  "#22c55e",
  yellow: "#f59e0b",
  red:    "#ef4444",
  gray:   "#94a3b8",
};

/** Returns the SLA color bucket for a readyForExecutionAt timestamp. */
export function getSlaColor(readyForExecutionAt: string | null | undefined): SlaColor {
  if (!readyForExecutionAt) return "gray";
  const hoursElapsed = (Date.now() - new Date(readyForExecutionAt).getTime()) / 3_600_000;
  if (hoursElapsed <= 24) return "green";
  if (hoursElapsed <= 72) return "yellow";
  return "red";
}

/** Hours elapsed since the order became ready, or null if not ready. */
export function getHoursWaiting(readyForExecutionAt: string | null | undefined): number | null {
  if (!readyForExecutionAt) return null;
  return (Date.now() - new Date(readyForExecutionAt).getTime()) / 3_600_000;
}

/** Human-readable waiting duration, e.g. "3 שעות" or "2 ימים". */
export function formatWaitingDuration(readyForExecutionAt: string | null | undefined): string {
  const hours = getHoursWaiting(readyForExecutionAt);
  if (hours === null) return "—";
  if (hours < 1) return "פחות משעה";
  if (hours < 24) return `${Math.round(hours)} שע׳`;
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  if (remainingHours === 0) return `${days} ${days === 1 ? "יום" : "ימים"}`;
  return `${days} ${days === 1 ? "יום" : "ימים"} ו-${remainingHours} שע׳`;
}
