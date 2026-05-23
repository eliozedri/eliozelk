export type NotificationSeverity = "info" | "warning" | "critical";

export type NotificationSourceModule =
  | "orders" | "work_logs" | "inventory" | "finance" | "system" | "telegram" | "field";

export type NotificationStatus =
  | "pending" | "delivered" | "seen" | "acknowledged" | "escalated" | "failed" | "expired";

export type RelatedEntityType = "work_order" | "work_diary" | "order_problem";

export interface NotificationRow {
  id: string;
  event_type: string;
  rule_id: string | null;
  title: string;
  message: string;
  severity: NotificationSeverity;
  source_module: NotificationSourceModule;
  related_entity_type: RelatedEntityType | null;
  related_entity_id: string | null;
  created_by: string | null;
  requires_ack: boolean;
  blocking: boolean;
  play_sound: boolean;
  expires_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RecipientRow {
  id: string;
  notification_id: string;
  user_id: string;
  matched_role: string | null;
  status: NotificationStatus;
  delivered_at: string | null;
  seen_at: string | null;
  related_opened_at: string | null;
  acknowledged_at: string | null;
  ack_was_direct: boolean;
  escalation_level: number;
  last_push_sent_at: string | null;
  next_reminder_at: string | null;
  created_at: string;
}

export interface NotificationView {
  recipientId: string;
  notificationId: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  sourceModule: NotificationSourceModule;
  relatedEntityType: RelatedEntityType | null;
  relatedEntityId: string | null;
  metadata: Record<string, unknown>;
  requiresAck: boolean;
  blocking: boolean;
  playSound: boolean;
  status: NotificationStatus;
  seenAt: string | null;
  relatedOpenedAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}
