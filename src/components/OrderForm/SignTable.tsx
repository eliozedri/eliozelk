"use client";

import { SignRow } from "./SignRow";
import type { SignRow as SignRowType } from "@/types/order";

interface Props {
  rows: SignRowType[];
  onAdd: () => void;
  onUpdate: (id: string, partial: Partial<SignRowType>) => void;
  onRemove: (id: string) => void;
}

/*
  RTL column visual order (right → left):
  מספר תמרור | כמות | הערות/צורה | תמונה | גודל | סוג | (delete)

  In HTML, first <th> = rightmost column in RTL.
  Last <th> (delete) = leftmost column in RTL.
*/

export function SignTable({ rows, onAdd, onUpdate, onRemove }: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-4 overflow-x-auto">

      {/* Section header — no justify needed; RTL flex-start = RIGHT */}
      <div className="flex items-center gap-2 px-5 py-3.5 bg-blue-50 rounded-t-xl border-b border-blue-100">
        <h2 className="text-base font-bold text-blue-900">תמרורים</h2>
        {/* Icon is SECOND in HTML = appears to LEFT of text in RTL */}
        <svg className="w-5 h-5 text-blue-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-3 py-2.5 text-sm font-medium text-gray-500 text-right">מספר תמרור</th>
            <th className="px-3 py-2.5 text-sm font-medium text-gray-500 text-right w-24">כמות</th>
            <th className="px-3 py-2.5 text-sm font-medium text-gray-500 text-right">הערות / צורה</th>
            <th className="px-3 py-2.5 w-16 text-center text-sm font-medium text-gray-500"></th>
            <th className="px-3 py-2.5 text-sm font-medium text-gray-500 text-right w-24">גודל</th>
            <th className="px-3 py-2.5 text-sm font-medium text-gray-500 text-right w-28">סוג</th>
            <th className="w-10 no-print"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <SignRow
              key={row.id}
              row={row}
              onChange={(partial) => onUpdate(row.id, partial)}
              onRemove={() => onRemove(row.id)}
            />
          ))}
        </tbody>
      </table>

      {/* "הוסף שורה" — justify-end pushes to LEFT in RTL */}
      <div className="flex justify-end px-5 py-3 no-print">
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-blue-400 text-blue-600 text-sm font-medium hover:bg-blue-50 transition-colors"
        >
          <span>+ הוסף שורה</span>
        </button>
      </div>
    </div>
  );
}
