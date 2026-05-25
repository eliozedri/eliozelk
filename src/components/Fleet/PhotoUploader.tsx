"use client";

import { useRef, useState } from "react";
import { Upload, Trash2, Loader2, Star } from "lucide-react";
import { fleetFetch } from "./fleetApi";

export function PhotoUploader({
  equipmentId, photos, canManage, onChange,
}: {
  equipmentId: string;
  photos: string[];
  canManage: boolean;
  onChange: (photos: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fleetFetch(`/api/equipment/${equipmentId}/photo`, { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "העלאה נכשלה");
      onChange(j.photos as string[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "העלאה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function remove(url: string) {
    setBusy(true); setErr(null);
    try {
      const res = await fleetFetch(`/api/equipment/${equipmentId}/photo`, {
        method: "DELETE",
        body: JSON.stringify({ url }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "מחיקה נכשלה");
      onChange(j.photos as string[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "מחיקה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div dir="rtl" className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {photos.map((url, i) => (
          <div key={url} className="relative w-24 h-24 rounded-lg overflow-hidden border border-slate-200 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="w-full h-full object-cover" />
            {i === 0 && (
              <span className="absolute top-1 right-1 bg-ek-gold text-white rounded-full p-0.5" title="תמונה ראשית">
                <Star className="w-3 h-3" />
              </span>
            )}
            {canManage && (
              <button
                type="button"
                onClick={() => remove(url)}
                disabled={busy}
                className="absolute bottom-1 left-1 bg-red-600/90 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                title="מחק תמונה"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        {canManage && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="w-24 h-24 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:border-ek-blue hover:text-ek-blue transition-colors"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
            <span className="text-[10px] mt-1">העלה תמונה</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
      />
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
