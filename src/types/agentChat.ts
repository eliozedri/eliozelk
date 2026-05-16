// Phase 2.6 — Channel-agnostic communication layer types
// Only 'internal_app' is active. Other channels are reserved for future integration.

export type CommChannel = "internal_app" | "whatsapp" | "telegram" | "discord" | "email";
export type ThreadStatus = "active" | "archived" | "closed";
export type SenderType = "user" | "agent" | "system";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "auto_approved";

export interface CommThread {
  id: string;
  channel: CommChannel;
  agent_id: string | null;
  user_id: string;
  title: string;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  status: ThreadStatus;
  created_at: string;
  updated_at: string;
}

export interface SourceRef {
  table: string;
  id: string;
  label: string;
}

export interface CommMessage {
  id: string;
  thread_id: string;
  sender_type: SenderType;
  sender_user_id?: string | null;
  agent_id?: string | null;
  channel: CommChannel;
  external_message_id?: string | null;
  content: string;
  structured_payload?: Record<string, unknown> | null;
  source_references?: SourceRef[] | null;
  created_at: string;
}

export interface CommSuggestedAction {
  id: string;
  thread_id: string;
  message_id: string;
  agent_id?: string | null;
  action_type: string;
  action_payload?: Record<string, unknown> | null;
  risk_level: RiskLevel;
  approval_required: boolean;
  approval_status?: ApprovalStatus | null;
  created_task_id?: string | null;
  created_approval_id?: string | null;
  created_at: string;
}
