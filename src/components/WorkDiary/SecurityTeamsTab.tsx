"use client";

import type { WorkDiary, SecurityTeams } from "@/types/workDiary";
import { emptySecurityTeams } from "@/types/workDiary";

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-500";

interface Props {
  diary: WorkDiary;
  onChange: (partial: Partial<WorkDiary>) => void;
  disabled?: boolean;
}

interface SecurityLineProps {
  label: string;
  labelHe: string;
  line: { quantity: string; notes: string };
  onQuantity: (v: string) => void;
  onNotes: (v: string) => void;
  disabled: boolean;
}

function SecurityLine({ label, labelHe, line, onQuantity, onNotes, disabled }: SecurityLineProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="text-xs font-bold text-gray-700 mb-3">{labelHe} <span className="font-normal text-gray-400 mr-1">{label}</span></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">כמות</label>
          <input
            type="number"
            min="0"
            step="1"
            placeholder="0"
            value={line.quantity}
            onChange={(e) => onQuantity(e.target.value)}
            disabled={disabled}
            dir="ltr"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">הערות</label>
          <input
            type="text"
            placeholder="הערות נוספות..."
            value={line.notes}
            onChange={(e) => onNotes(e.target.value)}
            disabled={disabled}
            className={inputCls}
          />
        </div>
      </div>
    </div>
  );
}

export function SecurityTeamsTab({ diary, onChange, disabled = false }: Props) {
  const teams: SecurityTeams = diary.securityTeams ?? emptySecurityTeams();

  function updateArrowBoards(field: "quantity" | "notes", val: string) {
    onChange({ securityTeams: { ...teams, arrowBoards: { ...teams.arrowBoards, [field]: val } } });
  }

  function updateInspectors(field: "quantity" | "notes", val: string) {
    onChange({ securityTeams: { ...teams, inspectors: { ...teams.inspectors, [field]: val } } });
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">צוות אבטחה וניטור תנועה</h3>

        <div className="space-y-3">
          <SecurityLine
            label="Arrow Boards"
            labelHe="עגלות חץ"
            line={teams.arrowBoards}
            onQuantity={(v) => updateArrowBoards("quantity", v)}
            onNotes={(v) => updateArrowBoards("notes", v)}
            disabled={disabled}
          />
          <SecurityLine
            label="Inspectors"
            labelHe="פקחים"
            line={teams.inspectors}
            onQuantity={(v) => updateInspectors("quantity", v)}
            onNotes={(v) => updateInspectors("notes", v)}
            disabled={disabled}
          />
        </div>

        <p className="mt-3 text-xs text-gray-400">מלא כמות 0 אם לא נדרש</p>
      </div>
    </div>
  );
}
