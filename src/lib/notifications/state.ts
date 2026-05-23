import type {
  NotificationRow, RecipientRow, NotificationView, RelatedEntityType,
} from "@/types/notification";

export function toView(rec: RecipientRow, n: NotificationRow): NotificationView {
  return {
    recipientId: rec.id,
    notificationId: n.id,
    title: n.title,
    message: n.message,
    severity: n.severity,
    sourceModule: n.source_module,
    relatedEntityType: n.related_entity_type,
    relatedEntityId: n.related_entity_id,
    metadata: n.metadata ?? {},
    requiresAck: n.requires_ack,
    blocking: n.blocking,
    playSound: n.play_sound,
    status: rec.status,
    seenAt: rec.seen_at,
    relatedOpenedAt: rec.related_opened_at,
    acknowledgedAt: rec.acknowledged_at,
    createdAt: n.created_at,
  };
}

// SINGLE source of the module-route assumption (Phase 1 compromise).
// A later phase upgrades this to deep links (e.g. `/orders?orderId=${id}`)
// without touching any other file.
export function relatedEntityHref(
  type: RelatedEntityType | null,
  _id: string | null,
  _metadata?: Record<string, unknown>,
): string | null {
  if (!type) return null;
  switch (type) {
    case "work_order": return "/orders";
    case "order_problem": return "/orders";
    case "work_diary": return "/work-diary";
    default: return null;
  }
}

// SINGLE predicate for "view-before-ack". A later phase can require the
// *specific* entity to have been viewed; callers must not re-implement this.
export function isOpenedSatisfied(v: NotificationView): boolean {
  if (!v.relatedEntityType) return true;
  return v.relatedOpenedAt != null;
}

export function canAcknowledge(v: NotificationView): boolean {
  if (!v.requiresAck) return false;
  if (v.status === "acknowledged") return false;
  return isOpenedSatisfied(v);
}

export function pickPendingCritical(views: NotificationView[]): NotificationView | null {
  const pending = views.filter(
    v => v.blocking && v.requiresAck && v.status !== "acknowledged" && v.status !== "expired",
  );
  if (pending.length === 0) return null;
  return pending
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
}

export function unseenCount(views: NotificationView[]): number {
  return views.filter(v => v.status === "pending" || v.status === "delivered").length;
}

export function mergeViews(prev: NotificationView[], incoming: NotificationView): NotificationView[] {
  const idx = prev.findIndex(v => v.recipientId === incoming.recipientId);
  if (idx === -1) return [incoming, ...prev];
  const next = prev.slice();
  next[idx] = incoming;
  return next;
}

// Server-side mirror of isOpenedSatisfied, working on raw values (no view object).
export function serverAckAllowed(
  relatedEntityType: string | null,
  relatedOpenedAt: string | null,
): boolean {
  if (!relatedEntityType) return true;
  return relatedOpenedAt != null;
}
