"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getSupabase } from "@/lib/supabase/client";
import { getReadiness, enablePush, type PushReadiness } from "@/lib/notifications/webpush";

// Enforces the admin-controlled notification setup policy. Everything defaults OFF, so
// this renders nothing until a master turns a requirement on in "מרכז התראות".
//
// Safety rails:
//  - master is NEVER blocked (so an admin can't lock themselves out of the policy UI).
//  - hard-block applies ONLY to the push-permission requirement (actionable via a button)
//    and only when push is supported + VAPID-configured. The PWA-install requirement is
//    never a hard block (install can't be forced programmatically) — it shows a soft
//    banner instead, so users are never trapped.

interface Policy {
  require_pwa_installation: boolean;
  require_push_permission: boolean;
  block_work_until_push_setup_complete: boolean;
}

export function NotificationSetupGate() {
  const { profile } = useAuth();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [ready, setReady] = useState<PushReadiness | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshReady = useCallback(async () => setReady(await getReadiness()), []);

  useEffect(() => {
    const db = getSupabase();
    if (!db || !profile) return;
    db.from("notification_policy")
      .select("require_pwa_installation, require_push_permission, block_work_until_push_setup_complete")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => setPolicy((data as Policy) ?? null));
    void refreshReady();
  }, [profile, refreshReady]);

  if (!profile || !policy || !ready) return null;
  if (profile.role === "master") return null; // never block/nag the admin

  const needsPushPerm = policy.require_push_permission && ready.supported && ready.configured && ready.permission !== "granted";
  const needsPwa = policy.require_pwa_installation && !ready.standalone;
  if (!needsPushPerm && !needsPwa) return null;

  const onEnable = async () => {
    setBusy(true);
    await enablePush();
    await refreshReady();
    setBusy(false);
  };

  const hardBlock = policy.block_work_until_push_setup_complete && needsPushPerm;

  if (hardBlock) {
    return (
      <div className="fixed inset-0 z-[9999] bg-navy-900/95 flex items-center justify-center p-6" dir="rtl">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 text-center space-y-4">
          <h2 className="text-lg font-black text-navy-900">נדרשת הפעלת התראות</h2>
          <p className="text-sm text-gray-600">
            כדי להמשיך לעבוד במערכת יש להפעיל התראות דפדפן במכשיר הזה. ההגדרה נדרשת על פי מדיניות הארגון.
          </p>
          <button
            onClick={onEnable}
            disabled={busy}
            className="w-full px-4 py-2.5 rounded-xl bg-sky-600 text-white font-bold disabled:opacity-50"
          >
            {busy ? "מפעיל…" : "הפעל התראות במכשיר הזה"}
          </button>
          {ready.permission === "denied" && (
            <p className="text-xs text-red-600">ההרשאה נחסמה — יש לאפשר התראות בהגדרות האתר בדפדפן ואז לרענן.</p>
          )}
        </div>
      </div>
    );
  }

  // Soft, non-blocking banner.
  return (
    <div className="fixed bottom-4 inset-x-4 z-[9998] mx-auto max-w-lg rounded-xl border border-sky-200 bg-white shadow-lg p-3 flex items-center gap-3" dir="rtl">
      <span className="text-xs text-gray-700 flex-1">
        {needsPushPerm
          ? "מומלץ להפעיל התראות דפדפן כדי לא לפספס עדכונים חשובים."
          : "מומלץ להתקין את האפליקציה למסך הבית לקבלת התראות אמינות."}
      </span>
      {needsPushPerm && (
        <button onClick={onEnable} disabled={busy} className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-bold disabled:opacity-50">
          {busy ? "…" : "הפעל"}
        </button>
      )}
    </div>
  );
}
