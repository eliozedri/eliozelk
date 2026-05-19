"use client";

import { useEffect } from "react";
import { useSignLookup } from "@/hooks/useSignLookup";
import { SignThumbnail } from "@/components/SignThumbnail";
import type { SignRow as SignRowType } from "@/types/order";

const SIZES = ["40", "50", "60", "70", "80", "90", "100", "120", "140", "160"];
const TYPES = ["EG", "EGP", "יהלום", "רב עוצמה"];

const cellInput =
  "w-full px-2.5 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400 transition-all";

const cellSelect =
  "w-full px-2.5 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all cursor-pointer";

function TrashIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" /><path d="M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

interface Props {
  row: SignRowType;
  onChange: (partial: Partial<SignRowType>) => void;
  onRemove: () => void;
}

export function SignRow({ row, onChange, onRemove }: Props) {
  const { record, status } = useSignLookup(row.signNumber);

  useEffect(() => {
    if (status === "found" && record) {
      const autoNote = record.name ? `${record.shape} — ${record.name}` : record.shape;
      onChange({ imageUrl: `/signs/${record.imageFile}`, notes: autoNote, lookupStatus: "found" });
    } else if (status === "not_found") {
      onChange({ imageUrl: null, lookupStatus: "not_found" });
    } else if (status === "idle") {
      onChange({ imageUrl: null, lookupStatus: "idle" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, record]);

  const numRing =
    row.lookupStatus === "found"
      ? "ring-2 ring-green-400 border-transparent"
      : row.lookupStatus === "not_found"
      ? "ring-2 ring-red-400 border-transparent"
      : "";

  return (
    <tr className="border-b border-gray-100 hover:bg-blue-50/20 transition-colors">

      {/* מספר תמרור — 1st in HTML = rightmost in RTL */}
      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          <input
            type="text"
            dir="ltr"
            inputMode="numeric"
            value={row.signNumber}
            onChange={(e) => onChange({ signNumber: e.target.value })}
            placeholder="מספר"
            className={`${cellInput} text-center font-medium ${numRing}`}
          />
          {row.lookupStatus === "not_found" && (
            <span className="text-xs text-red-500 text-center">לא נמצא</span>
          )}
        </div>
      </td>

      {/* כמות */}
      <td className="px-3 py-2.5 w-24">
        <input
          type="number"
          min="0"
          value={row.quantity}
          onChange={(e) => onChange({ quantity: e.target.value })}
          placeholder="0"
          className={`${cellInput} text-center`}
          dir="ltr"
        />
      </td>

      {/* הערות / צורה */}
      <td className="px-3 py-2.5">
        <input
          type="text"
          value={row.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="—"
          className={cellInput}
        />
      </td>

      {/* תמונה */}
      <td className="px-3 py-2.5 w-16 text-center">
        <SignThumbnail src={row.imageUrl} alt={`תמרור ${row.signNumber}`} />
      </td>

      {/* גודל */}
      <td className="px-3 py-2.5 w-24">
        <select
          value={row.size}
          onChange={(e) => onChange({ size: e.target.value })}
          className={cellSelect}
          dir="rtl"
        >
          <option value="">—</option>
          {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>

      {/* סוג */}
      <td className="px-3 py-2.5 w-28">
        <select
          value={row.type}
          onChange={(e) => onChange({ type: e.target.value })}
          className={cellSelect}
          dir="rtl"
        >
          <option value="">—</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </td>

      {/* delete — last in HTML = leftmost in RTL */}
      <td className="px-2 py-2.5 w-10 no-print">
        <button
          type="button"
          onClick={onRemove}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          title="הסר שורה"
        >
          <TrashIcon />
        </button>
      </td>
    </tr>
  );
}
