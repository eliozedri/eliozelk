"use client";

import type { WorkDiary } from "@/types/workDiary";

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-500";

interface Props {
  diary: WorkDiary;
  onChange: (partial: Partial<WorkDiary>) => void;
  disabled?: boolean;
}

function ListEditor({
  title,
  addLabel,
  placeholder,
  items,
  onAdd,
  onUpdate,
  onRemove,
  disabled,
}: {
  title: string;
  addLabel: string;
  placeholder: (i: number) => string;
  items: string[];
  onAdd: () => void;
  onUpdate: (i: number, v: string) => void;
  onRemove: (i: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-sm font-bold text-gray-700 mb-4">{title}</h3>

      {items.length === 0 && (
        <p className="text-sm text-gray-400 mb-4">לא נוסף פריט עדיין.</p>
      )}

      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2 items-center">
            <div className="flex-1">
              <input
                type="text"
                placeholder={placeholder(i)}
                value={item}
                onChange={(e) => onUpdate(i, e.target.value)}
                disabled={disabled}
                className={inputCls}
              />
            </div>
            {!disabled && (
              <button
                type="button"
                onClick={() => onRemove(i)}
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
          onClick={onAdd}
          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-300 text-blue-600 text-xs font-medium hover:bg-blue-50 transition-colors"
        >
          + {addLabel}
        </button>
      )}
    </div>
  );
}

export function AdditionalTeamsTab({ diary, onChange, disabled = false }: Props) {
  const crews = diary.additionalCrews ?? [];
  const equipment = diary.additionalEquipment ?? [];

  return (
    <div className="space-y-5">
      <ListEditor
        title="צוותים נוספים / קבלני משנה"
        addLabel="הוסף צוות / קבלן"
        placeholder={(i) => `שם צוות / קבלן ${i + 1}`}
        items={crews}
        onAdd={() => onChange({ additionalCrews: [...crews, ""] })}
        onUpdate={(i, v) => { const n = [...crews]; n[i] = v; onChange({ additionalCrews: n }); }}
        onRemove={(i) => onChange({ additionalCrews: crews.filter((_, idx) => idx !== i) })}
        disabled={disabled}
      />

      <ListEditor
        title="ציוד וכלים נוספים"
        addLabel="הוסף ציוד / כלי"
        placeholder={(i) => `ציוד / כלי ${i + 1}`}
        items={equipment}
        onAdd={() => onChange({ additionalEquipment: [...equipment, ""] })}
        onUpdate={(i, v) => { const n = [...equipment]; n[i] = v; onChange({ additionalEquipment: n }); }}
        onRemove={(i) => onChange({ additionalEquipment: equipment.filter((_, idx) => idx !== i) })}
        disabled={disabled}
      />
    </div>
  );
}
