"use client";

import { useState, useCallback, useMemo } from "react";
import { useCrewsContext } from "@/context/CrewsContext";
import type { Crew, CrewSkill, CrewRegion } from "@/types/crew";
import { CREW_SKILL_LABELS, CREW_REGION_LABELS } from "@/types/crew";
import { useOperationalKPIs } from "@/hooks/useOperationalKPIs";
import type { CrewMetrics } from "@/lib/operationalKPIs";

const ALL_SKILLS = Object.keys(CREW_SKILL_LABELS) as CrewSkill[];
const ALL_REGIONS = Object.keys(CREW_REGION_LABELS) as CrewRegion[];

const EMPTY_FORM: Omit<Crew, "id" | "createdAt" | "updatedAt"> = {
  name: "",
  leader: "",
  workerCount: 3,
  phone: "",
  skills: [],
  region: "center",
  dailyCapacityHours: 8,
  active: true,
  notes: "",
};

function PlusIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

interface CrewFormProps {
  initial: Omit<Crew, "id" | "createdAt" | "updatedAt">;
  onSave: (data: Omit<Crew, "id" | "createdAt" | "updatedAt">) => void;
  onCancel: () => void;
  submitLabel: string;
}

function CrewForm({ initial, onSave, onCancel, submitLabel }: CrewFormProps) {
  const [form, setForm] = useState(initial);

  const toggleSkill = (skill: CrewSkill) => {
    setForm((prev) => ({
      ...prev,
      skills: prev.skills.includes(skill)
        ? prev.skills.filter((s) => s !== skill)
        : [...prev.skills, skill],
    }));
  };

  return (
    <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-5 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">שם הצוות *</label>
          <input
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="צוות א׳"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">ראש צוות *</label>
          <input
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            value={form.leader}
            onChange={(e) => setForm((p) => ({ ...p, leader: e.target.value }))}
            placeholder="שם ראש הצוות"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">מספר עובדים</label>
          <input
            type="number" min={1} max={20}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            value={form.workerCount}
            onChange={(e) => setForm((p) => ({ ...p, workerCount: Number(e.target.value) }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">טלפון</label>
          <input
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            placeholder="050-0000000"
            dir="ltr"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">אזור עבודה</label>
          <select
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            value={form.region}
            onChange={(e) => setForm((p) => ({ ...p, region: e.target.value as CrewRegion }))}
          >
            {ALL_REGIONS.map((r) => (
              <option key={r} value={r}>{CREW_REGION_LABELS[r]}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">קיבולת יומית (שעות)</label>
          <input
            type="number" min={1} max={24}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            value={form.dailyCapacityHours}
            onChange={(e) => setForm((p) => ({ ...p, dailyCapacityHours: Number(e.target.value) }))}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-600">כישורים</label>
        <div className="flex flex-wrap gap-2">
          {ALL_SKILLS.map((skill) => (
            <button
              key={skill}
              type="button"
              onClick={() => toggleSkill(skill)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                form.skills.includes(skill)
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
              }`}
            >
              {CREW_SKILL_LABELS[skill]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-600">הערות</label>
        <textarea
          rows={2}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          placeholder="הערות נוספות..."
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
            className="w-4 h-4 accent-blue-600"
          />
          צוות פעיל
        </label>
      </div>

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
        >
          ביטול
        </button>
        <button
          onClick={() => {
            if (!form.name.trim() || !form.leader.trim()) return;
            onSave(form);
          }}
          className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function CrewCard({
  crew,
  metrics,
  onEdit,
  onDelete,
}: {
  crew: Crew;
  metrics: CrewMetrics | undefined;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const fmtRevenue = (n: number) =>
    n >= 1_000 ? `₪${Math.round(n / 1_000)}k` : `₪${Math.round(n)}`;

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-4 flex flex-col gap-3 ${crew.active ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900 text-sm">{crew.name}</span>
            {!crew.active && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">לא פעיל</span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{crew.leader} · {crew.workerCount} עובדים</div>
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
            <EditIcon />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
            <TrashIcon />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-gray-400">אזור</span>
          <div className="font-medium text-gray-700 mt-0.5">{CREW_REGION_LABELS[crew.region]}</div>
        </div>
        <div>
          <span className="text-gray-400">קיבולת יומית</span>
          <div className="font-medium text-gray-700 mt-0.5">{crew.dailyCapacityHours} שע׳</div>
        </div>
        {crew.phone && (
          <div>
            <span className="text-gray-400">טלפון</span>
            <div className="font-medium text-gray-700 mt-0.5 dir-ltr" dir="ltr">{crew.phone}</div>
          </div>
        )}
      </div>

      {/* Performance metrics strip */}
      {metrics && metrics.totalDays > 0 && (
        <div className="border-t border-gray-100 pt-2.5 grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-gray-400">הכנסות</div>
            <div className="font-semibold text-gray-800 mt-0.5">{fmtRevenue(metrics.totalRevenue)}</div>
          </div>
          <div>
            <div className="text-gray-400">מרווח</div>
            <div className={`font-semibold mt-0.5 ${
              metrics.avgMarginPct < 0 ? "text-red-600" :
              metrics.avgMarginPct < 10 ? "text-amber-600" : "text-green-700"
            }`}>
              {metrics.avgMarginPct.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-gray-400">ימים</div>
            <div className="font-semibold text-gray-800 mt-0.5">
              <span className="text-green-700">{metrics.profitableDays}+</span>
              {" / "}
              <span className={metrics.lossDays > 0 ? "text-red-600" : "text-gray-400"}>
                {metrics.lossDays}−
              </span>
            </div>
          </div>
          <div className="col-span-3">
            <div className="text-gray-400">₪ לעובד/יום</div>
            <div className="font-semibold text-gray-700 mt-0.5">
              {metrics.totalWorkerDays > 0
                ? `₪${Math.round(metrics.revenuePerWorkerDay).toLocaleString()}`
                : "—"}
            </div>
          </div>
        </div>
      )}

      {crew.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {crew.skills.map((skill) => (
            <span key={skill} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
              {CREW_SKILL_LABELS[skill]}
            </span>
          ))}
        </div>
      )}

      {crew.notes && (
        <div className="text-xs text-gray-500 border-t border-gray-100 pt-2">{crew.notes}</div>
      )}
    </div>
  );
}

export function Crews() {
  const { crews, addCrew, updateCrew, deleteCrew } = useCrewsContext();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { byCrew } = useOperationalKPIs();
  const crewMetricsMap = useMemo(() => {
    const m = new Map<string, CrewMetrics>();
    for (const c of byCrew) {
      if (c.crewId) m.set(c.crewId, c);
    }
    return m;
  }, [byCrew]);

  const handleAdd = useCallback((data: Omit<Crew, "id" | "createdAt" | "updatedAt">) => {
    addCrew(data);
    setShowAddForm(false);
  }, [addCrew]);

  const handleUpdate = useCallback((id: string, data: Omit<Crew, "id" | "createdAt" | "updatedAt">) => {
    updateCrew(id, data);
    setEditingId(null);
  }, [updateCrew]);

  const activeCrews = crews.filter((c) => c.active);
  const inactiveCrews = crews.filter((c) => !c.active);

  return (
    <div className="min-h-screen bg-[#f0f2f5] py-6 px-4">
      <div className="max-w-5xl mx-auto space-y-5">

        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">צוותי שטח</h1>
            <p className="text-sm text-gray-500 mt-0.5">ניהול צוותי ביצוע לעבודות שטח</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{activeCrews.length} צוותים פעילים</span>
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
              >
                <PlusIcon />
                צוות חדש
              </button>
            )}
          </div>
        </div>

        {showAddForm && (
          <CrewForm
            initial={EMPTY_FORM}
            onSave={handleAdd}
            onCancel={() => setShowAddForm(false)}
            submitLabel="הוסף צוות"
          />
        )}

        {crews.length === 0 && !showAddForm ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="text-4xl mb-3">👷</div>
            <p className="text-gray-600 font-medium mb-1">אין צוותים במערכת עדיין</p>
            <p className="text-sm text-gray-400 mb-4">הוסף את הצוות הראשון כדי להתחיל לתכנן עבודות</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              <PlusIcon />
              הוסף צוות ראשון
            </button>
          </div>
        ) : (
          <>
            {activeCrews.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <h2 className="text-sm font-bold text-gray-700">צוותים פעילים</h2>
                  <span className="text-xs text-gray-400">({activeCrews.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeCrews.map((crew) =>
                    editingId === crew.id ? (
                      <div key={crew.id} className="sm:col-span-2 lg:col-span-3">
                        <CrewForm
                          initial={{ name: crew.name, leader: crew.leader, workerCount: crew.workerCount, phone: crew.phone, skills: crew.skills, region: crew.region, dailyCapacityHours: crew.dailyCapacityHours, active: crew.active, notes: crew.notes }}
                          onSave={(data) => handleUpdate(crew.id, data)}
                          onCancel={() => setEditingId(null)}
                          submitLabel="שמור שינויים"
                        />
                      </div>
                    ) : (
                      <CrewCard
                        key={crew.id}
                        crew={crew}
                        metrics={crewMetricsMap.get(crew.id)}
                        onEdit={() => setEditingId(crew.id)}
                        onDelete={() => deleteCrew(crew.id)}
                      />
                    )
                  )}
                </div>
              </div>
            )}

            {inactiveCrews.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                  <h2 className="text-sm font-bold text-gray-700">צוותים לא פעילים</h2>
                  <span className="text-xs text-gray-400">({inactiveCrews.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inactiveCrews.map((crew) =>
                    editingId === crew.id ? (
                      <div key={crew.id} className="sm:col-span-2 lg:col-span-3">
                        <CrewForm
                          initial={{ name: crew.name, leader: crew.leader, workerCount: crew.workerCount, phone: crew.phone, skills: crew.skills, region: crew.region, dailyCapacityHours: crew.dailyCapacityHours, active: crew.active, notes: crew.notes }}
                          onSave={(data) => handleUpdate(crew.id, data)}
                          onCancel={() => setEditingId(null)}
                          submitLabel="שמור שינויים"
                        />
                      </div>
                    ) : (
                      <CrewCard
                        key={crew.id}
                        crew={crew}
                        metrics={crewMetricsMap.get(crew.id)}
                        onEdit={() => setEditingId(crew.id)}
                        onDelete={() => deleteCrew(crew.id)}
                      />
                    )
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
