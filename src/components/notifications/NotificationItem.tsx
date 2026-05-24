"use client";

import type { NotificationView } from "@/types/notification";
import { canAcknowledge } from "@/lib/notifications/state";

const SEVERITY_STYLES: Record<NotificationView["severity"], { dot: string; label: string }> = {
  critical: { dot: "bg-red-500", label: "קריטי" },
  warning: { dot: "bg-amber-500", label: "אזהרה" },
  info: { dot: "bg-sky-500", label: "מידע" },
};

const STATUS_LABEL: Record<string, string> = {
  pending: "ממתין",
  delivered: "ממתין",
  seen: "נצפה",
  acknowledged: "אושר",
  escalated: "הוסלם",
  failed: "נכשל",
  expired: "פג תוקף",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "עכשיו";
  if (m < 60) return `לפני ${m} ד׳`;
  const h = Math.floor(m / 60);
  if (h < 24) return `לפני ${h} ש׳`;
  return `לפני ${Math.floor(h / 24)} ימים`;
}

export function NotificationItem({
  view,
  onOpen,
  onAcknowledge,
}: {
  view: NotificationView;
  onOpen: () => void;
  onAcknowledge: () => void;
}) {
  const sev = SEVERITY_STYLES[view.severity];
  const isUnseen = view.status === "pending" || view.status === "delivered";
  const needsAck = view.requiresAck && view.status !== "acknowledged";
  const opened = view.relatedOpenedAt != null;
  const hasEntity = view.relatedEntityType != null;
  const ackEnabled = canAcknowledge(view);

  return (
    <div
      className={`w-full text-right rounded-xl border p-3 ${
        isUnseen ? "bg-sky-50 border-sky-200" : "bg-white border-gray-200"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${sev.dot}`} aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-navy-900 text-sm truncate">{view.title}</span>
            <span className="text-[11px] text-gray-400 shrink-0">{timeAgo(view.createdAt)}</span>
          </div>
          <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{view.message}</p>

          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
              {view.sourceModule}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
              {STATUS_LABEL[view.status] ?? view.status}
            </span>
            {needsAck && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
                דורש אישור
              </span>
            )}
            {needsAck && hasEntity && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                  opened ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {opened ? "הפריט נצפה" : "יש לפתוח את הפריט"}
              </span>
            )}
          </div>

          {(hasEntity || needsAck) && (
            <div className="flex items-center gap-2 mt-2">
              {hasEntity && (
                <button
                  onClick={onOpen}
                  className="px-3 py-1 rounded-lg bg-ek-blue text-white text-xs font-bold"
                >
                  פתח/י את הפריט
                </button>
              )}
              {needsAck && (
                <button
                  onClick={onAcknowledge}
                  disabled={!ackEnabled}
                  title={!ackEnabled && hasEntity ? "צפה/י בפריט לפני אישור" : undefined}
                  className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-50"
                >
                  אישור קבלה
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
