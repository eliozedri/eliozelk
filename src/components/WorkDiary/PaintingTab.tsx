"use client";

import type { PaintingItem } from "@/types/workDiary";

const numCls =
  "w-14 px-1 py-1.5 text-center text-sm rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white disabled:bg-gray-50";
const txtCls =
  "w-full px-2 py-1.5 text-sm rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white disabled:bg-gray-50";

interface Props {
  items: PaintingItem[];
  onChange: (items: PaintingItem[]) => void;
  disabled?: boolean;
}

function updateItem(
  items: PaintingItem[],
  id: string,
  partial: Partial<PaintingItem>
): PaintingItem[] {
  return items.map((item) =>
    item.id === id ? { ...item, ...partial } : item
  );
}

export function PaintingTab({ items, onChange, disabled = false }: Props) {
  const upd = (id: string, partial: Partial<PaintingItem>) =>
    onChange(updateItem(items, id, partial));

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 bg-yellow-50 border-b border-yellow-100">
        <svg
          className="w-5 h-5 text-yellow-600 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <h2 className="text-base font-bold text-yellow-900">
          צביעה וסימון כבישים
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table
          className="w-full text-sm border-collapse"
          style={{ minWidth: 820 }}
        >
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
              <th
                className="px-3 py-2.5 text-right font-medium"
                style={{ minWidth: 170 }}
              >
                פריט
              </th>
              <th className="px-2 py-2.5 text-center font-medium w-12">יח׳</th>
              <th className="px-2 py-2.5 text-center font-medium w-16">לבן</th>
              <th className="px-2 py-2.5 text-center font-medium w-16">כתום</th>
              <th className="px-2 py-2.5 text-center font-medium w-16">צהוב</th>
              <th className="px-2 py-2.5 text-center font-medium w-16">שחור</th>
              <th className="px-2 py-2.5 text-center font-medium w-16">קירוצף</th>
              <th className="px-2 py-2.5 text-center font-medium w-16">כדוריות</th>
              <th className="px-2 py-2.5 text-center font-medium w-16">מידה</th>
              <th className="px-3 py-2.5 text-right font-medium">הערות</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr
                key={item.id}
                className={`border-b border-gray-100 ${
                  idx % 2 === 1 ? "bg-gray-50/40" : ""
                }`}
              >
                <td className="px-3 py-2 font-medium text-gray-800 text-sm">
                  {item.name}
                  <span className="text-xs text-gray-400 mr-1">
                    ({item.unit})
                  </span>
                </td>
                <td className="px-1 py-1.5 text-center text-xs text-gray-400">
                  {item.unit}
                </td>
                {(["white", "orange", "yellow", "black"] as const).map(
                  (col) => (
                    <td key={col} className="px-1 py-1.5 text-center">
                      <input
                        type="number"
                        min="0"
                        value={item[col]}
                        onChange={(e) => upd(item.id, { [col]: e.target.value })}
                        disabled={disabled}
                        className={numCls}
                      />
                    </td>
                  )
                )}
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={item.retroReflective}
                    onChange={(e) =>
                      upd(item.id, { retroReflective: e.target.checked })
                    }
                    disabled={disabled}
                    className="w-4 h-4 accent-blue-600"
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={item.beads}
                    onChange={(e) =>
                      upd(item.id, { beads: e.target.checked })
                    }
                    disabled={disabled}
                    className="w-4 h-4 accent-blue-600"
                  />
                </td>
                <td className="px-1 py-1.5 text-center">
                  <input
                    type="text"
                    value={item.size}
                    onChange={(e) => upd(item.id, { size: e.target.value })}
                    disabled={disabled}
                    className={numCls}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={item.notes}
                    onChange={(e) => upd(item.id, { notes: e.target.value })}
                    disabled={disabled}
                    placeholder="הערה"
                    className={txtCls}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
        <p className="text-xs text-gray-400">
          מלא כמויות בעמודות הצבע הרלוונטיות. שאר העמודות ניתן להשאיר ריקות.
        </p>
      </div>
    </div>
  );
}
