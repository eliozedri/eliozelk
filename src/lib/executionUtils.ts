import type { WorkDiary } from "@/types/workDiary";

export type DiaryCompletionStatus = "none" | "draft" | "submitted" | "approved" | "rejected";

export function getOrderDiaries(diaries: WorkDiary[], orderId: string): WorkDiary[] {
  return diaries.filter(d => d.orderId === orderId);
}

export function hasSubmittedDiary(diaries: WorkDiary[], orderId: string): boolean {
  return diaries.some(d => d.orderId === orderId && d.status === "submitted");
}

export function hasApprovedDiary(diaries: WorkDiary[], orderId: string): boolean {
  return diaries.some(
    d => d.orderId === orderId && d.status === "submitted" && d.approvalStatus === "approved"
  );
}

export function diaryCompletionStatus(diaries: WorkDiary[], orderId: string): DiaryCompletionStatus {
  const linked = getOrderDiaries(diaries, orderId);
  if (linked.length === 0) return "none";
  if (linked.some(d => d.approvalStatus === "approved")) return "approved";
  if (linked.some(d => d.approvalStatus === "rejected")) return "rejected";
  if (linked.some(d => d.status === "submitted")) return "submitted";
  return "draft";
}
