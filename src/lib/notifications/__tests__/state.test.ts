import { describe, it, expect } from "vitest";
import type { NotificationRow, RecipientRow } from "@/types/notification";
import {
  toView, relatedEntityHref, isOpenedSatisfied, canAcknowledge,
  pickPendingCritical, unseenCount, mergeViews, serverAckAllowed,
} from "@/lib/notifications/state";

function row(over: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: "n1", event_type: "field.issue", rule_id: "r1", title: "t", message: "m",
    severity: "critical", source_module: "field", related_entity_type: "work_order",
    related_entity_id: "o1", created_by: null, requires_ack: true, blocking: true,
    play_sound: true, expires_at: null, metadata: {}, created_at: "2026-06-01T10:00:00Z", ...over,
  };
}
function rec(over: Partial<RecipientRow> = {}): RecipientRow {
  return {
    id: "rc1", notification_id: "n1", user_id: "u1", matched_role: "office_manager",
    status: "pending", delivered_at: null, seen_at: null, related_opened_at: null,
    acknowledged_at: null, ack_was_direct: false, resolution: null, escalation_level: 0,
    last_push_sent_at: null, next_reminder_at: null, created_at: "2026-06-01T10:00:00Z", ...over,
  };
}

describe("relatedEntityHref", () => {
  it("maps known entity types to module routes", () => {
    expect(relatedEntityHref("work_order", "o1")).toBe("/orders");
    expect(relatedEntityHref("order_problem", "p1")).toBe("/orders");
    expect(relatedEntityHref("work_diary", "d1")).toBe("/work-diary");
  });
  it("returns null when there is no related entity", () => {
    expect(relatedEntityHref(null, null)).toBeNull();
  });
});

describe("toView", () => {
  it("merges a recipient row and notification row into a view", () => {
    const v = toView(rec({ status: "seen", related_opened_at: "2026-06-01T11:00:00Z" }), row());
    expect(v.recipientId).toBe("rc1");
    expect(v.notificationId).toBe("n1");
    expect(v.severity).toBe("critical");
    expect(v.requiresAck).toBe(true);
    expect(v.status).toBe("seen");
    expect(v.relatedOpenedAt).toBe("2026-06-01T11:00:00Z");
  });
});

describe("isOpenedSatisfied / canAcknowledge", () => {
  it("requires opening the related item before ack", () => {
    const unopened = toView(rec(), row());
    expect(isOpenedSatisfied(unopened)).toBe(false);
    expect(canAcknowledge(unopened)).toBe(false);
    const opened = toView(rec({ related_opened_at: "2026-06-01T11:00:00Z" }), row());
    expect(isOpenedSatisfied(opened)).toBe(true);
    expect(canAcknowledge(opened)).toBe(true);
  });
  it("allows direct ack when there is no related entity", () => {
    const v = toView(rec(), row({ related_entity_type: null, related_entity_id: null }));
    expect(isOpenedSatisfied(v)).toBe(true);
    expect(canAcknowledge(v)).toBe(true);
  });
  it("cannot ack an already-acknowledged item", () => {
    const v = toView(rec({ status: "acknowledged", related_opened_at: "x" }), row());
    expect(canAcknowledge(v)).toBe(false);
  });
  it("is false for notifications that do not require ack (by design)", () => {
    const v = toView(rec({ related_opened_at: "2026-06-01T11:00:00Z" }), row({ requires_ack: false }));
    expect(canAcknowledge(v)).toBe(false);
  });
});

describe("pickPendingCritical", () => {
  it("returns the oldest pending blocking+requires_ack view, or null", () => {
    expect(pickPendingCritical([])).toBeNull();
    const a = toView(rec({ id: "a" }), row({ id: "na", created_at: "2026-06-01T10:00:00Z" }));
    const b = toView(rec({ id: "b" }), row({ id: "nb", created_at: "2026-06-01T09:00:00Z" }));
    const ackd = toView(rec({ id: "c", notification_id: "nc", status: "acknowledged" }), row({ id: "nc" }));
    expect(pickPendingCritical([a, b, ackd])?.recipientId).toBe("b");
  });
  it("ignores non-blocking notifications", () => {
    const info = toView(rec(), row({ blocking: false, requires_ack: false, severity: "info" }));
    expect(pickPendingCritical([info])).toBeNull();
  });
});

describe("unseenCount", () => {
  it("counts pending + delivered", () => {
    const a = toView(rec({ id: "a", status: "pending" }), row({ id: "na" }));
    const b = toView(rec({ id: "b", status: "delivered" }), row({ id: "nb" }));
    const c = toView(rec({ id: "c", status: "seen" }), row({ id: "nc" }));
    expect(unseenCount([a, b, c])).toBe(2);
  });
  it("does not count escalated, failed, acknowledged, or expired", () => {
    const views = (["escalated", "failed", "acknowledged", "expired"] as const).map((status, i) =>
      toView(rec({ id: `r${i}`, notification_id: `n${i}`, status }), row({ id: `n${i}` })));
    expect(unseenCount(views)).toBe(0);
  });
});

describe("mergeViews", () => {
  it("prepends new and replaces existing by recipientId", () => {
    const a = toView(rec({ id: "a" }), row({ id: "na" }));
    const a2 = toView(rec({ id: "a", status: "seen" }), row({ id: "na" }));
    const b = toView(rec({ id: "b" }), row({ id: "nb" }));
    expect(mergeViews([a], b).map(v => v.recipientId)).toEqual(["b", "a"]);
    expect(mergeViews([a], a2).find(v => v.recipientId === "a")?.status).toBe("seen");
  });
});

describe("serverAckAllowed", () => {
  it("blocks ack of a related-entity notification until opened", () => {
    expect(serverAckAllowed("work_order", null)).toBe(false);
    expect(serverAckAllowed("work_order", "2026-06-01T11:00:00Z")).toBe(true);
    expect(serverAckAllowed(null, null)).toBe(true);
  });
});
