"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { toast } from "sonner";

interface Props {
  diaryId: string;
  open: boolean;
  onClose: () => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CustomerEmailDialog({ diaryId, open, onClose }: Props) {
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSend() {
    setError(null);
    const trimmed = to.trim();
    if (!EMAIL_REGEX.test(trimmed)) {
      setError("כתובת המייל אינה תקינה");
      return;
    }
    setSending(true);
    try {
      const supa = getSupabase();
      if (!supa) {
        setError("לא ניתן לשלוח כעת");
        return;
      }
      const { data: { session } } = await supa.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`/api/work-diary/${diaryId}/customer-email`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token ?? ""}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ to: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? `שליחה נכשלה (${res.status})`);
        return;
      }
      toast.success(`נשלח ל-${trimmed}`);
      setTo("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה לא ידועה");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-sm p-4 mx-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold mb-2">שליחת עותק ללקוח</h3>
        <p className="text-xs text-gray-500 mb-3">כתובת מייל של נציג הלקוח/קבלן.</p>
        <input
          autoFocus
          type="email"
          inputMode="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSend();
            if (e.key === "Escape") onClose();
          }}
          placeholder="example@domain.com"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-2"
        />
        {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="px-3 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="px-4 py-1.5 rounded-md bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {sending ? "שולח..." : "שלח"}
          </button>
        </div>
      </div>
    </div>
  );
}
