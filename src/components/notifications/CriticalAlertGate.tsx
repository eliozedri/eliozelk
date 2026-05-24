"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { useNotifications } from "@/context/NotificationContext";
import { relatedEntityHref, isOpenedSatisfied, canAcknowledge } from "@/lib/notifications/state";

// Blocks the app while a `blocking && requires_ack` notification is pending.
// One at a time in Phase 1 (pickPendingCritical returns the oldest). order.created
// is NON-blocking, so today only field.issue reaches this gate.
export function CriticalAlertGate() {
  const { pendingCritical, markOpened, acknowledge } = useNotifications();
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!pendingCritical) return null;
  const v = pendingCritical;

  const href = relatedEntityHref(v.relatedEntityType, v.relatedEntityId, v.metadata);
  const onEntityRoute = href != null && pathname === href;
  const opened = isOpenedSatisfied(v);
  const ackEnabled = canAcknowledge(v) && !busy;

  const handleOpen = async () => {
    if (!href) return;
    await markOpened(v.recipientId);
    router.push(href);
  };

  const handleAck = async () => {
    setBusy(true);
    const ok = await acknowledge(v.recipientId);
    setBusy(false);
    if (!ok) {
      // Server rejected (e.g. item not opened yet). The gate stays up so the user
      // must open the item first; no extra UI needed in Phase 1.
      console.warn("[notifications] acknowledge rejected for", v.recipientId);
    }
  };

  // VIEWED + on the related entity's route -> collapse to a persistent, non-dismissable
  // banner so the user can actually work the item while still being required to ack.
  if (opened && onEntityRoute) {
    return (
      <div
        className="fixed bottom-0 inset-x-0 z-[80] bg-red-600 text-white px-4 py-3 flex items-center justify-between gap-3 no-print"
        dir="rtl"
      >
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span className="text-sm font-semibold truncate">{v.title} — אשר/י לאחר צפייה בפריט</span>
        </div>
        <button
          onClick={handleAck}
          disabled={!ackEnabled}
          className="px-4 py-1.5 rounded-lg bg-white text-red-700 text-sm font-bold disabled:opacity-60"
        >
          אישור
        </button>
      </div>
    );
  }

  // Otherwise -> full-screen blocking modal (blocks normal navigation/usage).
  return (
    <div
      className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4 no-print"
      dir="rtl"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <AlertTriangle className="w-7 h-7 text-red-600" />
        </div>
        <h2 className="text-lg font-bold text-navy-900">{v.title}</h2>
        <p className="text-sm text-gray-600 mt-2">{v.message}</p>
        {!opened && href && (
          <p className="text-xs text-red-600 mt-3 font-semibold">צפה/י בפריט לפני אישור</p>
        )}
        <div className="flex gap-2 mt-6">
          {href && (
            <button
              onClick={handleOpen}
              className="flex-1 px-4 py-2.5 rounded-xl bg-ek-blue text-white text-sm font-bold"
            >
              פתח/י את הפריט
            </button>
          )}
          <button
            onClick={handleAck}
            disabled={!ackEnabled}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-50"
          >
            אישור
          </button>
        </div>
      </div>
    </div>
  );
}
