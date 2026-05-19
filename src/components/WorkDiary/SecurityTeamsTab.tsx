"use client";

import type { WorkDiary } from "@/types/workDiary";

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-500";

interface Props {
  diary: WorkDiary;
  onChange: (partial: Partial<WorkDiary>) => void;
  disabled?: boolean;
}

export function SecurityTeamsTab({ diary, onChange, disabled = false }: Props) {
  const guards = diary.securityGuards ?? [];

  function add() {
    onChange({ securityGuards: [...guards, ""] });
  }

  function update(idx: number, val: string) {
    const next = [...guards];
    next[idx] = val;
    onChange({ securityGuards: next });
  }

  function remove(idx: number) {
    const next = guards.filter((_, i) => i !== idx);
    onChange({ securityGuards: next });
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">צוות אבטחה</h3>

        {guards.length === 0 && (
          <p className="text-sm text-gray-400 mb-4">לא הוסף שומר עדיין.</p>
        )}

        <div className="space-y-2">
          {guards.map((g, i) => (
            <div key={i} className="flex gap-2 items-center">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder={`שם שומר ${i + 1}`}
                  value={g}
                  onChange={(e) => update(i, e.target.value)}
                  disabled={disabled}
                  className={inputCls}
                />
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="px-2 py-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors text-xs"
                  title="הסר"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {!disabled && (
          <button
            type="button"
            onClick={add}
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-300 text-blue-600 text-xs font-medium hover:bg-blue-50 transition-colors"
          >
            + הוסף שומר
          </button>
        )}
      </div>
    </div>
  );
}
