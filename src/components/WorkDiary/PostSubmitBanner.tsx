"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import type { WorkDiary } from "@/types/workDiary";

interface Props {
  diary: WorkDiary;
  onOpenCustomerDialog: () => void;
}

export function PostSubmitBanner({ diary, onOpenCustomerDialog }: Props) {
  const [retrying, setRetrying] = useState(false);
  const autoFiredRef = useRef(false);

  const emailed = diary.internalEmailedAt ?? null;
  const error = diary.internalEmailError ?? null;

  async function callArchive() {
    setRetrying(true);
    try {
      const supa = getSupabase();
      if (!supa) return;
      const { data: { session } } = await supa.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      await fetch(`/api/work-diary/${diary.id}/archive-email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      console.warn("[banner] archive retry failed:", e);
    } finally {
      setRetrying(false);
    }
  }

  // Auto-heal: if the diary is submitted but never archived AND has no error
  // (the submit-then-network-drop case), fire the archive POST once on mount.
  useEffect(() => {
    if (diary.status !== "submitted") return;
    if (emailed) return;
    if (error) return;
    if (autoFiredRef.current) return;
    autoFiredRef.current = true;
    void callArchive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diary.status, emailed, error, diary.id]);

  if (diary.status !== "submitted") return null;

  const sending = !emailed && !error;
  const sent = !!emailed;
  const failed = !!error && !emailed;

  return (
    <div
      dir="rtl"
      className={
        "mx-3 my-2 rounded-lg border px-3 py-2 text-sm flex items-center justify-between gap-2 " +
        (sent ? "border-emerald-200 bg-emerald-50" : failed ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50")
      }
    >
      {sending && (
        <span className="text-gray-600">שולח עותק לארכיון יומני אלקיים...</span>
      )}
      {sent && (
        <span className="text-emerald-700 font-medium">
          ✓ היומן הוגש ונשמר. עותק PDF נשלח לארכיון אלקיים.
        </span>
      )}
      {failed && (
        <span className="text-amber-800 font-medium">
          ⚠ היומן נשמר במערכת, אך שליחת העותק הפנימי נכשלה.
        </span>
      )}

      <div className="flex items-center gap-2">
        {failed && (
          <button
            type="button"
            disabled={retrying}
            onClick={callArchive}
            className="px-3 py-1 rounded-md border border-amber-400 text-amber-800 text-xs font-medium disabled:opacity-50"
          >
            {retrying ? "שולח..." : "נסה שוב"}
          </button>
        )}
        <button
          type="button"
          onClick={onOpenCustomerDialog}
          className="px-3 py-1 rounded-md border border-blue-400 text-blue-700 text-xs font-medium hover:bg-blue-50"
        >
          שלח עותק ללקוח במייל
        </button>
      </div>
    </div>
  );
}
