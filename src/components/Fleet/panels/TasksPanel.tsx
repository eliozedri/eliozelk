"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, BellRing, Check } from "lucide-react";
import {
  EQUIPMENT_TASK_STATUS_LABELS, EQUIPMENT_TASK_STATUS_COLORS,
  type EquipmentTask, type EquipmentTaskStatus,
} from "@/types/equipment";
import { daysUntil } from "../fleetUtils";
import { fleetFetch, fleetJson } from "../fleetApi";

const blankForm = { title: "", task_type: "", due_date: "", notes: "" };

export function TasksPanel({ equipmentId, canManage }: { equipmentId: string; canManage: boolean }) {
  const [items, setItems] = useState<EquipmentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try { setItems(await fleetJson<EquipmentTask[]>(`/api/equipment/${equipmentId}/tasks`)); }
    catch (e) { setErr(e instanceof Error ? e.message : "טעינה נכשלה"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [equipmentId]);

  async function add() {
    if (!form.title.trim()) { setErr("יש להזין כותרת"); return; }
    setSaving(true); setErr(null);
    try {
      const rec = await fleetJson<EquipmentTask>(`/api/equipment/${equipmentId}/tasks`, {
        method: "POST", body: JSON.stringify({ ...form, due_date: form.due_date || null }),
      });
      setItems(prev => [rec, ...prev]);
      setForm(blankForm); setShowForm(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "שמירה נכשלה"); }
    finally { setSaving(false); }
  }

  async function setStatus(id: string, status: EquipmentTaskStatus) {
    setItems(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    await fleetFetch(`/api/equipment/${equipmentId}/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
  }

  async function remove(id: string) {
    setItems(prev => prev.filter(t => t.id !== id));
    await fleetFetch(`/api/equipment/${equipmentId}/tasks/${id}`, { method: "DELETE" });
  }

  return (
    <div dir="rtl" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-navy-900 flex items-center gap-2"><BellRing className="w-4 h-4" /> תזכורות ומשימות</h4>
        {canManage && (
          <button onClick={() => setShowForm(v => !v)} className="text-sm text-ek-blue flex items-center gap-1 hover:underline">
            <Plus className="w-4 h-4" /> הוסף תזכורת
          </button>
        )}
      </div>

      {showForm && canManage && (
        <div className="bg-slate-50 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-xs text-slate-500">כותרת</span>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="חידוש רישיון / הזמנת טסט" className="border border-slate-200 rounded px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">סוג</span>
            <input value={form.task_type} onChange={e => setForm({ ...form, task_type: e.target.value })} className="border border-slate-200 rounded px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">תאריך יעד</span>
            <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="border border-slate-200 rounded px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-xs text-slate-500">הערות</span>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="border border-slate-200 rounded px-2 py-1.5" /></label>
          <div className="sm:col-span-2 flex justify-end gap-2 mt-1">
            <button onClick={() => { setShowForm(false); setForm(blankForm); }} className="px-3 py-1.5 text-sm text-slate-600">ביטול</button>
            <button onClick={add} disabled={saving} className="px-3 py-1.5 text-sm bg-ek-blue text-white rounded-lg flex items-center gap-1">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} שמור
            </button>
          </div>
        </div>
      )}

      {err && <p className="text-xs text-red-600">{err}</p>}
      {loading ? (
        <div className="flex justify-center py-6 text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">אין תזכורות</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map(t => {
            const d = daysUntil(t.due_date);
            const overdue = t.status === "pending" && d !== null && d < 0;
            return (
              <li key={t.id} className="bg-white border border-slate-200 rounded-lg p-3 text-sm flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold ${t.status === "done" ? "line-through text-slate-400" : "text-navy-900"}`}>{t.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap gap-x-3">
                    {t.task_type && <span>{t.task_type}</span>}
                    {t.due_date && <span className={overdue ? "text-red-600 font-semibold" : ""}>יעד: {new Date(t.due_date).toLocaleDateString("he-IL")}{overdue ? " (עבר!)" : ""}</span>}
                  </div>
                  {t.notes && <div className="text-xs text-slate-500 mt-1">{t.notes}</div>}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${EQUIPMENT_TASK_STATUS_COLORS[t.status]}`}>{EQUIPMENT_TASK_STATUS_LABELS[t.status]}</span>
                  {canManage && t.status === "pending" && (
                    <button onClick={() => setStatus(t.id, "done")} className="text-green-600 hover:text-green-700" title="סמן כבוצע"><Check className="w-4 h-4" /></button>
                  )}
                  {canManage && <button onClick={() => remove(t.id)} className="text-slate-300 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
