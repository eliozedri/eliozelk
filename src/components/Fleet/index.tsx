"use client";

import { useMemo, useState } from "react";
import { Plus, LayoutGrid, Table2, Loader2, Truck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { canPerformAction } from "@/types/auth";
import { useEquipment } from "@/hooks/useEquipment";
import type { Equipment } from "@/types/equipment";
import { FleetKpiRow } from "./FleetKpiRow";
import { FleetFilters, EMPTY_FILTERS, type FleetFilterState } from "./FleetFilters";
import { EquipmentCard } from "./EquipmentCard";
import { EquipmentTable } from "./EquipmentTable";
import { EquipmentDetailDrawer } from "./EquipmentDetailDrawer";
import { EquipmentFormModal } from "./EquipmentFormModal";
import { computeKpis, isInspectionDueSoon, isMaintenanceDueSoon } from "./fleetUtils";

export default function Fleet() {
  const { profile } = useAuth();
  const canManage = !!profile && canPerformAction(profile, "manage_equipment");

  const {
    equipment, openIncidentsByAsset, loading, error,
    createEquipment, updateEquipment, deleteEquipment, applyServerRow,
  } = useEquipment();

  const [filters, setFilters] = useState<FleetFilterState>(EMPTY_FILTERS);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [selected, setSelected] = useState<Equipment | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Equipment | null>(null);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return equipment.filter(e => {
      if (q) {
        const hay = [e.display_name, e.license_number, e.serial_number, e.manufacturer, e.model]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.category !== "all" && e.category_key !== filters.category) return false;
      if (filters.status !== "all" && e.status !== filters.status) return false;
      if (filters.onlyOpenFaults && (openIncidentsByAsset[e.id] ?? 0) === 0) return false;
      if (filters.onlyUpcomingMaintenance && !isMaintenanceDueSoon(e)) return false;
      if (filters.onlyUpcomingInspection && !isInspectionDueSoon(e)) return false;
      if (filters.onlyUnidentified && e.identification_confidence !== "unidentified" && e.category_key !== "unidentified") return false;
      return true;
    });
  }, [equipment, filters, openIncidentsByAsset]);

  const kpis = useMemo(() => computeKpis(equipment, openIncidentsByAsset), [equipment, openIncidentsByAsset]);

  // Keep the open drawer's row in sync with list updates (photos/docs/edits).
  const selectedLive = selected ? equipment.find(e => e.id === selected.id) ?? selected : null;

  async function handleSubmit(payload: Partial<Equipment>) {
    if (editTarget) {
      await updateEquipment(editTarget.id, payload);
    } else {
      const created = await createEquipment(payload);
      if (created) setSelected(created);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("למחוק את הכלי? הפעולה מעבירה אותו לארכיון.")) return;
    await deleteEquipment(id);
    setSelected(null);
  }

  return (
    <div dir="rtl" className="min-h-screen bg-surface p-4 sm:p-6 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="w-10 h-10 rounded-xl bg-navy-900 text-white flex items-center justify-center"><Truck className="w-5 h-5" /></span>
          <div>
            <h1 className="text-xl font-black text-navy-900 leading-tight">צי רכב ומכונות</h1>
            <p className="text-xs text-slate-500">ניהול תפעולי של רכבים, מכונות וציוד</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button onClick={() => setView("grid")} className={`p-2 ${view === "grid" ? "bg-ek-blue text-white" : "bg-white text-slate-500"}`} title="כרטיסים"><LayoutGrid className="w-4 h-4" /></button>
            <button onClick={() => setView("table")} className={`p-2 ${view === "table" ? "bg-ek-blue text-white" : "bg-white text-slate-500"}`} title="טבלה"><Table2 className="w-4 h-4" /></button>
          </div>
          {canManage && (
            <button onClick={() => { setEditTarget(null); setFormOpen(true); }} className="px-3 py-2 bg-ek-blue text-white rounded-lg text-sm font-semibold flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> הוסף כלי
            </button>
          )}
        </div>
      </div>

      <FleetKpiRow kpis={kpis} />
      <FleetFilters filters={filters} onChange={setFilters} />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400"><Loader2 className="w-7 h-7 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Truck className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{equipment.length === 0 ? "אין כלים במערכת" : "אין תוצאות לסינון הנוכחי"}</p>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map(e => (
            <EquipmentCard key={e.id} equipment={e} openFaults={openIncidentsByAsset[e.id] ?? 0} onOpen={() => setSelected(e)} />
          ))}
        </div>
      ) : (
        <EquipmentTable equipment={filtered} openIncidentsByAsset={openIncidentsByAsset} onOpen={setSelected} />
      )}

      {selectedLive && (
        <EquipmentDetailDrawer
          equipment={selectedLive}
          canManage={canManage}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditTarget(selectedLive); setFormOpen(true); }}
          onPatchLocal={applyServerRow}
          onDelete={handleDelete}
        />
      )}

      {formOpen && (
        <EquipmentFormModal
          initial={editTarget}
          onClose={() => { setFormOpen(false); setEditTarget(null); }}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
