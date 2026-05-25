"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, AlertTriangle } from "lucide-react";
import {
  INCIDENT_TYPE_LABELS, INCIDENT_SEVERITY_LABELS, INCIDENT_SEVERITY_COLORS,
  INCIDENT_STATUS_LABELS, INCIDENT_STATUS_COLORS,
  type EquipmentIncident, type IncidentType, type IncidentSeverity, type IncidentStatus,
} from "@/types/equipment";
import { fleetFetch, fleetJson } from "../fleetApi";

const TYPES: IncidentType[] = ["fault", "accident", "issue", "damage", "inspection", "other"];
const SEVERITIES: IncidentSeverity[] = ["low", "medium", "high", "urgent"];
const STATUSES: IncidentStatus[] = ["open", "in_progress", "resolved", "closed"];

const blankForm = {
  opened_at: new Date().toISOString().slice(0, 10),
  incident_type: "fault" as IncidentType,
  severity: "medium" as IncidentSeverity,
  description: "",
  required_action: "",
  due_date: "",
  status: "open" as IncidentStatus,
};

export function IncidentsPanel({ equipmentId, canManage }: { equipmentId: string; canManage: boolean }) {
  const [items, setItems] = useState<EquipmentIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try { setItems(await fleetJson<EquipmentIncident[]>(`/api/equipment/${equipmentId}/incidents`)); }
    catch (e) { setErr(e instanceof Error ? e.message : "טעינה נכשלה"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [equipmentId]);

  async function add() {
    setSaving(true); setErr(null);
    try {
      const payload = { ...form, due_date: form.due_date || null };
      const rec = await fleetJson<EquipmentIncident>(`/api/equipment/${equipmentId}/incidents`, {
        method: "POST", body: JSON.stringify(payload),
      });
      setItems(prev => [rec, ...prev]);
      setForm(blankForm); setShowForm(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "שמירה נכשלה"); }
    finally { setSaving(false); }
  }

  async function changeStatus(id: string, status: IncidentStatus) {
    setItems(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    await fleetFetch(`/api/equipment/${equipmentId}/incidents/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
  }

  async function remove(id: string) {
    setItems(prev => prev.filter(r => r.id !== id));
    await fleetFetch(`/api/equipment/${equipmentId}/incidents/${id}`, { method: "DELETE" });
  }

  return (
    <div dir="rtl" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-navy-900 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> תקלות ואירועים</h4>
        {canManage && (
          <button onClick={() => setShowForm(v => !v)} className="text-sm text-ek-blue flex items-center gap-1 hover:underline">
            <Plus className="w-4 h-4" /> דווח אירוע
          </button>
        )}
      </div>

      {showForm && canManage && (
        <div className="bg-slate-50 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">תאריך פתיחה</span>
            <input type="date" value={form.opened_at} onChange={e => setForm({ ...form, opened_at: e.target.value })} className="border border-slate-200 rounded px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">סוג אירוע</span>
            <select value={form.incident_type} onChange={e => setForm({ ...form, incident_type: e.target.value as IncidentType })} className="border border-slate-200 rounded px-2 py-1.5 bg-white">
              {TYPES.map(t => <option key={t} value={t}>{INCIDENT_TYPE_LABELS[t]}</option>)}
            </select></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">חומרה</span>
            <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value as IncidentSeverity })} className="border border-slate-200 rounded px-2 py-1.5 bg-white">
              {SEVERITIES.map(s => <option key={s} value={s}>{INCIDENT_SEVERITY_LABELS[s]}</option>)}
            </select></label>
          <label className="flex flex-col gap-1"><span className="text-xs text-slate-500">יעד טיפול</span>
            <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="border border-slate-200 rounded px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-xs text-slate-500">תיאור הבעיה</span>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="border border-slate-200 rounded px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-xs text-slate-500">טיפול נדרש</span>
            <input value={form.required_action} onChange={e => setForm({ ...form, required_action: e.target.value })} className="border border-slate-200 rounded px-2 py-1.5" /></label>
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
        <p className="text-sm text-slate-400 py-4 text-center">אין תקלות או אירועים</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map(r => (
            <li key={r.id} className="bg-white border border-slate-200 rounded-lg p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-navy-900">{INCIDENT_TYPE_LABELS[r.incident_type]}</span>
                    <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${INCIDENT_SEVERITY_COLORS[r.severity]}`}>{INCIDENT_SEVERITY_LABELS[r.severity]}</span>
                    <span className="text-xs text-slate-400">{new Date(r.opened_at).toLocaleDateString("he-IL")}</span>
                  </div>
                  {r.description && <div className="text-slate-600 mt-0.5">{r.description}</div>}
                  {r.required_action && <div className="text-xs text-slate-400 mt-1">טיפול נדרש: {r.required_action}{r.due_date ? ` · יעד ${new Date(r.due_date).toLocaleDateString("he-IL")}` : ""}</div>}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {canManage ? (
                    <select value={r.status} onChange={e => changeStatus(r.id, e.target.value as IncidentStatus)}
                      className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border-0 ${INCIDENT_STATUS_COLORS[r.status]}`}>
                      {STATUSES.map(s => <option key={s} value={s}>{INCIDENT_STATUS_LABELS[s]}</option>)}
                    </select>
                  ) : (
                    <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${INCIDENT_STATUS_COLORS[r.status]}`}>{INCIDENT_STATUS_LABELS[r.status]}</span>
                  )}
                  {canManage && <button onClick={() => remove(r.id)} className="text-slate-300 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
