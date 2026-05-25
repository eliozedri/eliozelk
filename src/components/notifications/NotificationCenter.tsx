"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import { relatedEntityHref } from "@/lib/notifications/state";
import { isMuted, setMuted } from "@/lib/notifications/sound";
import { NotificationItem } from "./NotificationItem";
import type { NotificationView } from "@/types/notification";

// Managers/admin who may control the in-app sound and send test notifications.
// POLICY: normal employees/users must NOT be able to mute mandatory notification
// sounds, so the mute control is hidden from non-managers (see audit Part 4).
// Sound policy will later be configurable from the admin "מרכז התראות".
const MANAGER_ROLES = ["master", "office_manager", "fleet_manager"];

export function NotificationCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { profile } = useAuth();
  const { views, markSeen, markOpened, acknowledge, sendDemo } = useNotifications();
  const [muted, setMutedState] = useState(false);

  // Sync the mute toggle label with persisted state whenever the drawer opens.
  useEffect(() => {
    if (open) setMutedState(isMuted());
  }, [open]);

  // Mark currently-unseen items as seen when the drawer opens.
  useEffect(() => {
    if (!open) return;
    const unseen = views
      .filter(v => v.status === "pending" || v.status === "delivered")
      .map(v => v.recipientId);
    if (unseen.length > 0) void markSeen(unseen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const pending = views.filter(v => v.requiresAck && v.status !== "acknowledged");
  const fresh = views.filter(
    v =>
      !(v.requiresAck && v.status !== "acknowledged") &&
      (v.status === "pending" || v.status === "delivered" || v.status === "seen"),
  );
  const history = views.filter(v => v.status === "acknowledged" || v.status === "expired");

  const openItem = (v: NotificationView) => {
    const href = relatedEntityHref(v.relatedEntityType, v.relatedEntityId, v.metadata);
    if (!href) return;
    void markOpened(v.recipientId);
    router.push(href);
    onClose();
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  const isManager = profile != null && MANAGER_ROLES.includes(profile.role);

  const Section = ({ title, items }: { title: string; items: NotificationView[] }) =>
    items.length === 0 ? null : (
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-gray-500 px-1">{title}</h3>
        {items.map(v => (
          <NotificationItem
            key={v.recipientId}
            view={v}
            onOpen={() => openItem(v)}
            onAcknowledge={() => void acknowledge(v.recipientId)}
          />
        ))}
      </div>
    );

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose} aria-hidden />
      <aside
        className="fixed inset-y-0 left-0 z-[61] w-full max-w-sm bg-surface shadow-2xl flex flex-col"
        dir="rtl"
        role="dialog"
        aria-label="מרכז התראות"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b bg-white">
          <h2 className="font-bold text-navy-900">מרכז התראות</h2>
          <button onClick={onClose} aria-label="סגור" className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {views.length === 0 && (
            <p className="text-sm text-gray-400 text-center mt-10">אין התראות</p>
          )}
          <Section title="קריטי וממתין לאישור" items={pending} />
          <Section title="חדש" items={fresh} />
          <Section title="נקרא" items={history} />
        </div>

        {/* Manager/admin-only footer. Normal users get NO mute control —
            mandatory notification sounds cannot be silenced by regular employees. */}
        {isManager && (
          <footer className="border-t bg-white px-4 py-2 flex items-center justify-between">
            <button onClick={toggleMute} className="text-xs text-gray-600 hover:text-navy-900">
              {muted ? "🔕 צליל כבוי" : "🔔 צליל פעיל"}
            </button>
            <button
              onClick={() => void sendDemo("field.issue")}
              className="text-xs font-semibold text-ek-blue hover:underline"
            >
              שלח התראת בדיקה
            </button>
          </footer>
        )}
      </aside>
    </>
  );
}
