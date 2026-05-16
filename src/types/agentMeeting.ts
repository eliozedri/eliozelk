// Phase 2.8 — Agent Meeting types

export type MeetingStatus = "active" | "completed" | "cancelled";

export interface AgentMeeting {
  id: string;
  title: string;
  topic?: string | null;
  status: MeetingStatus;
  participating_agents: string[];
  thread_id?: string | null;
  created_by?: string | null;
  summary?: string | null;
  created_at: string;
  updated_at: string;
}

export const MEETING_TOPICS = [
  "עבודות שממתינות לחיוב",
  "יומני עבודה בעייתיים",
  "חריגות פתוחות",
  "מצב שבועי",
  "הזמנות תקועות",
  "אישורים ממתינים",
];
