"use client";

import { nanoid } from "nanoid";
import type { WorkDiary, AdditionalTeams, AdditionalTeamsOtherEntry } from "@/types/workDiary";
import { emptyAdditionalTeams } from "@/types/workDiary";

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-500";

interface Props {
  diary: WorkDiary;
  onChange: (partial: Partial<WorkDiary>) => void;
  disabled?: boolean;
}

interface EquipmentLineProps {
  labelHe: string;
  label: string;
  line: { quantity: string; notes: string };
  onQuantity: (v: string) => void;
  onNotes: (v: string) => void;
  disabled: boolean;
}

function EquipmentLine({ labelHe, label, line, onQuantity, onNotes, disabled }: EquipmentLineProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="text-xs font-bold text-gray-700 mb-3">{labelHe} <span className="font-normal text-gray-400 mr-1">{label}</span></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">כמות / ימים</label>
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

export function AdditionalTeamsTab({ diary, onChange, disabled = false }: Props) {
  const teams: AdditionalTeams = diary.additionalTeams ?? emptyAdditionalTeams();

  function update(patch: Partial<AdditionalTeams>) {
    onChange({ additionalTeams: { ...teams, ...patch } });
  }

  function addOther() {
    const entry: AdditionalTeamsOtherEntry = { id: nanoid(), description: "", quantity: "", notes: "" };
    update({ other: [...teams.other, entry] });
  }

  function updateOther(id: string, field: keyof Omit<AdditionalTeamsOtherEntry, "id">, val: string) {
    update({ other: teams.other.map((e) => e.id === id ? { ...e, [field]: val } : e) });
  }

  function removeOther(id: string) {
    update({ other: teams.other.filter((e) => e.id !== id) });
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">ציוד מיוחד וקבלני משנה</h3>

        <div className="space-y-3">
          <EquipmentLine
            labelHe="מנוף"
            label="Crane"
            line={teams.crane}
            onQuantity={(v) => update({ crane: { ...teams.crane, quantity: v } })}
            onNotes={(v) => update({ crane: { ...teams.crane, notes: v } })}
            disabled={disabled}
          />
          <EquipmentLine
            labelHe="מקרצפת / מכונת כביסה"
            label="Sweeper / Road Milling"
            line={teams.sweeper}
            onQuantity={(v) => update({ sweeper: { ...teams.sweeper, quantity: v } })}
            onNotes={(v) => update({ sweeper: { ...teams.sweeper, notes: v } })}
            disabled={disabled}
          />
        </div>

        {/* Other / custom entries */}
        {teams.other.length > 0 && (
          <div className="mt-3 space-y-2">
            {teams.other.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">סוג ציוד / קבלן</label>
                    <input
                      type="text"
                      placeholder="תיאור הציוד / הקבלן"
                      value={entry.description}
                      onChange={(e) => updateOther(entry.id, "description", e.target.value)}
                      disabled={disabled}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">כמות</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={entry.quantity}
                      onChange={(e) => updateOther(entry.id, "quantity", e.target.value)}
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
                        placeholder="הערות..."
                        value={entry.notes}
                        onChange={(e) => updateOther(entry.id, "notes", e.target.value)}
                        disabled={disabled}
                        className={inputCls}
                      />
                    </div>
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => removeOther(entry.id)}
                        className="mb-0.5 px-2 py-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors text-xs"
                        title="הסר"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!disabled && (
          <button
            type="button"
            onClick={addOther}
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-300 text-blue-600 text-xs font-medium hover:bg-blue-50 transition-colors"
          >
            + הוסף ציוד / קבלן נוסף
          </button>
        )}

        <p className="mt-3 text-xs text-gray-400">מלא כמות 0 אם לא נדרש</p>
      </div>
    </div>
  );
}
