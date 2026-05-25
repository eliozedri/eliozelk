"use client";

import type { WorkDiary, SecurityTeams, SecurityTeamLine } from "@/types/workDiary";
import { emptySecurityTeams } from "@/types/workDiary";

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-500";

interface Props {
  diary: WorkDiary;
  onChange: (partial: Partial<WorkDiary>) => void;
  disabled?: boolean;
}

interface SecurityRowProps {
  row: SecurityTeamLine;
  index: number;
  showRemove: boolean;
  onQuantity: (v: string) => void;
  onNotes: (v: string) => void;
  onRemove: () => void;
  disabled: boolean;
}

function SecurityRow({ row, index, showRemove, onQuantity, onNotes, onRemove, disabled }: SecurityRowProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          כמות {index > 0 ? `(שורה ${index + 1})` : ""}
        </label>
        <input
          type="number"
          min="0"
          step="1"
          placeholder="0"
          value={row.quantity}
          onChange={(e) => onQuantity(e.target.value)}
          disabled={disabled}
          dir="ltr"
          className={inputCls}
        />
      </div>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">הערות</label>
          <input
            type="text"
            placeholder="הערות נוספות..."
            value={row.notes}
            onChange={(e) => onNotes(e.target.value)}
            disabled={disabled}
            className={inputCls}
          />
        </div>
        {!disabled && showRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="mb-0.5 px-2 py-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors text-xs"
            title="הסר שורה"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

interface CategorySectionProps {
  labelHe: string;
  label: string;
  rows: SecurityTeamLine[];
  onUpdate: (rows: SecurityTeamLine[]) => void;
  disabled: boolean;
}

function CategorySection({ labelHe, label, rows, onUpdate, disabled }: CategorySectionProps) {
  function updateRow(i: number, field: keyof SecurityTeamLine, val: string) {
    const next = rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r);
    onUpdate(next);
  }

  function addRow() {
    onUpdate([...rows, { quantity: "", notes: "" }]);
  }

  function removeRow(i: number) {
    onUpdate(rows.filter((_, idx) => idx !== i));
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-bold text-gray-700 mb-3">
        {labelHe} <span className="font-normal text-gray-400 mr-1">{label}</span>
      </div>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <SecurityRow
            key={i}
            row={row}
            index={i}
            showRemove={rows.length > 1}
            onQuantity={(v) => updateRow(i, "quantity", v)}
            onNotes={(v) => updateRow(i, "notes", v)}
            onRemove={() => removeRow(i)}
            disabled={disabled}
          />
        ))}
      </div>
      {!disabled && (
        <button
          type="button"
          onClick={addRow}
          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-300 text-blue-600 text-xs font-medium hover:bg-blue-50 transition-colors"
        >
          + הוסף שורה
        </button>
      )}
    </div>
  );
}

export function SecurityTeamsTab({ diary, onChange, disabled = false }: Props) {
  const teams: SecurityTeams = diary.securityTeams ?? emptySecurityTeams();

  return (
    <div className="space-y-4">
      <div className="glass-card p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">צוות אבטחה וניטור תנועה</h3>

        <div className="space-y-4">
          <CategorySection
            labelHe="עגלות חץ"
            label="Arrow Boards"
            rows={teams.arrowBoards}
            onUpdate={(rows) => onChange({ securityTeams: { ...teams, arrowBoards: rows } })}
            disabled={disabled}
          />
          <CategorySection
            labelHe="פקחים"
            label="Inspectors"
            rows={teams.inspectors}
            onUpdate={(rows) => onChange({ securityTeams: { ...teams, inspectors: rows } })}
            disabled={disabled}
          />
        </div>

        <p className="mt-3 text-xs text-gray-400">מלא כמות 0 אם לא נדרש</p>
      </div>
    </div>
  );
}
