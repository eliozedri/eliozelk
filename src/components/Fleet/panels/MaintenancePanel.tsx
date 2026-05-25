"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Wrench } from "lucide-react";
import {
  MAINTENANCE_STATUS_LABELS, MAINTENANCE_STATUS_COLORS,
  type EquipmentMaintenanceRecord, type MaintenanceStatus,
} from "@/types/equipment";
import { fleetFetch, fleetJson } from "../fleetApi";

const STATUSES: MaintenanceStatus[] = ["open", "in_progress", "completed", "needs_check"];

const blankForm = {
  service_date: "", maintenance_type: "", description: "", provider: "",
  cost: "", parts_replaced: "", status: "completed" as MaintenanceStatus, notes: "",
};

export function MaintenancePanel({ equipmentId, canManage }: { equipmentId: string; canManage: boolean }) {
  const [records, setRecords] = useState<EquipmentMaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRecords(await fleetJson<EquipmentMaintenanceRecord[]>(`/api/equipment/${equipmentId}/maintenance`));
    } catch (e) { setErr(e instanceof Error ? e.message : "טעינה נכשלה"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [equipmentId]);

  async function add() {
    setSaving(true); setErr(null);
    try {
      const payload = {
        service_date: form.service_date || null,
        maintenance_type: form.maintenance_type,
        description: form.description,
        provider: form.provider,
        cost: form.cost ? Number(form.cost) : null,
        parts_replaced: form.parts_replaced,
        status: form.status,
        notes: form.notes,
      };
      const rec = await fleetJson<EquipmentMaintenanceRecord>(`/api/equipment/${equipmentId}/maintenance`, {
        method: "POST", body: JSON.stringify(payload),
      });
      setRecords(prev => [rec, ...prev]);
      setForm(blankForm); setShowForm(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "שמירה נכשלה"); }
    finally { setSaving(false); }
  }

  async function changeStatus(id: string, status: MaintenanceStatus) {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    await fleetFetch(`/api/equipment/${equipmentId}/maintenance/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
  }

  async function remove(id: string) {
    setRecords(prev => prev.filter(r => r.id !== id));
    await fleetFetch(`/api/equipment/${equipmentId}/maintenance/${id}`, { method: "DELETE" });
  }

  return (
    <div dir="rtl" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-navy-900 flex items-center gap-2"><Wrench className="w-4 h-4" /> היסטוריית טיפולים</h4>
        {canManage && (
          <button onClick={() => setShowForm(v => !v)} className="text-sm text-ek-blue flex items-center gap-1 hover:underline">
            <Plus className="w-4 h-4" /> הוסף טיפול
          </button>
        )}
      </div>

      {showForm && canManage && (
        <div className="bg-slate-50 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">תאריך טיפול</span>
            <input type="date" value={form.service_date} onChange={e => setForm({ ...form, service_date: e.target.value })} className="border border-slate-200 rounded px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">סוג טיפול</span>
            <input value={form.maintenance_type} onChange={e => setForm({ ...form, maintenance_type: e.target.value })} placeholder="שמן / בלמים / טיפול תקופתי" className="border border-slate-200 rounded px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-xs text-slate-500">תיאור</span>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="border border-slate-200 rounded px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">מוסך / ספק / טכנאי</span>
            <input value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} className="border border-slate-200 rounded px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">עלות (₪)</span>
            <input type="number" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} className="border border-slate-200 rounded px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">חלקים שהוחלפו</span>
            <input value={form.parts_replaced} onChange={e => setForm({ ...form, parts_replaced: e.target.value })} className="border border-slate-200 rounded px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">סטטוס</span>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as MaintenanceStatus })} className="border border-slate-200 rounded px-2 py-1.5 bg-white">
              {STATUSES.map(s => <option key={s} value={s}>{MAINTENANCE_STATUS_LABELS[s]}</option>)}
            </select></label>
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
      ) : records.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">אין טיפולים רשומים</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {records.map(r => (
            <li key={r.id} className="bg-white border border-slate-200 rounded-lg p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-navy-900">{r.maintenance_type || "טיפול"}{r.service_date ? ` · ${new Date(r.service_date).toLocaleDateString("he-IL")}` : ""}</div>
                  {r.description && <div className="text-slate-600 mt-0.5">{r.description}</div>}
                  <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {r.provider && <span>ספק: {r.provider}</span>}
                    {r.cost != null && <span>עלות: ₪{r.cost.toLocaleString()}</span>}
                    {r.parts_replaced && <span>חלקים: {r.parts_replaced}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {canManage ? (
                    <select value={r.status} onChange={e => changeStatus(r.id, e.target.value as MaintenanceStatus)}
                      className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border-0 ${MAINTENANCE_STATUS_COLORS[r.status]}`}>
                      {STATUSES.map(s => <option key={s} value={s}>{MAINTENANCE_STATUS_LABELS[s]}</option>)}
                    </select>
                  ) : (
                    <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${MAINTENANCE_STATUS_COLORS[r.status]}`}>{MAINTENANCE_STATUS_LABELS[r.status]}</span>
                  )}
                  {canManage && (
                    <button onClick={() => remove(r.id)} className="text-slate-300 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
