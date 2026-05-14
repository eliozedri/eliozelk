"use client";

import { nanoid } from "nanoid";
import type { PoleItem, SignItem } from "@/types/workDiary";

const numCls =
  "w-12 px-1 py-1.5 text-center text-sm rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white disabled:bg-gray-50";
const txtCls =
  "w-full px-2 py-1.5 text-sm rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white disabled:bg-gray-50";
const smCls =
  "w-14 px-1 py-1.5 text-center text-sm rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white disabled:bg-gray-50";

function emptyPole(): PoleItem {
  return {
    id: nanoid(),
    name: "",
    unit: "יח׳",
    isCustom: true,
    out: "", supply: "", install: "", dismantle: "", move: "", straighten: "", returned: "", size: "", notes: "",
  };
}

function emptySign(): SignItem {
  return {
    id: nanoid(),
    urban: "", basic: "", regular: "", reinforced: "", diamond: "",
    out: "", supply: "", install: "", dismantle: "", move: "",
    angle: "", frame: "", profile: "", signSize: "",
    battery: false, solar: false, returned: "", notes: "",
  };
}

function updatePole(items: PoleItem[], id: string, p: Partial<PoleItem>) {
  return items.map((i) => (i.id === id ? { ...i, ...p } : i));
}
function updateSign(items: SignItem[], id: string, p: Partial<SignItem>) {
  return items.map((i) => (i.id === id ? { ...i, ...p } : i));
}

interface Props {
  poleItems: PoleItem[];
  signItems: SignItem[];
  onPolesChange: (items: PoleItem[]) => void;
  onSignsChange: (items: SignItem[]) => void;
  disabled?: boolean;
}

export function PolesSignsTab({ poleItems, signItems, onPolesChange, onSignsChange, disabled = false }: Props) {
  function addPole() {
    onPolesChange([...poleItems, emptyPole()]);
  }

  function removePole(id: string) {
    const filtered = poleItems.filter((p) => p.id !== id);
    onPolesChange(filtered.length > 0 ? filtered : [emptyPole()]);
  }

  function addSign() {
    onSignsChange([...signItems, emptySign()]);
  }

  function removeSign(id: string) {
    const filtered = signItems.filter((s) => s.id !== id);
    onSignsChange(filtered.length > 0 ? filtered : [emptySign()]);
  }

  const updP = (id: string, p: Partial<PoleItem>) => onPolesChange(updatePole(poleItems, id, p));
  const updS = (id: string, p: Partial<SignItem>) => onSignsChange(updateSign(signItems, id, p));

  return (
    <div className="space-y-6">
      {/* POLES */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 bg-blue-50 border-b border-blue-100">
          <svg className="w-5 h-5 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="2" x2="12" y2="22" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <h2 className="text-base font-bold text-blue-900">עמודים</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: 900 }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                <th className="px-3 py-2.5 text-right font-medium" style={{ minWidth: 150 }}>פריט</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">יצא</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">אספקה</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">התקנה</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">פירוק</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">העתקה</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">יישור</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">חזר</th>
                <th className="px-2 py-2.5 text-center font-medium w-16">מידה</th>
                <th className="px-3 py-2.5 text-right font-medium">הערות</th>
                {!disabled && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {poleItems.map((item, idx) => (
                <tr key={item.id} className={`border-b border-gray-100 ${idx % 2 === 1 ? "bg-gray-50/40" : ""}`}>
                  <td className="px-3 py-2">
                    {item.isCustom ? (
                      <input type="text" value={item.name} onChange={(e) => updP(item.id, { name: e.target.value })} disabled={disabled} placeholder="שם פריט" className={txtCls} />
                    ) : (
                      <span className="font-medium text-gray-800">{item.name}</span>
                    )}
                  </td>
                  {(["out", "supply", "install", "dismantle", "move", "straighten", "returned"] as const).map((col) => (
                    <td key={col} className="px-1 py-1.5 text-center">
                      <input type="number" min="0" value={item[col]} onChange={(e) => updP(item.id, { [col]: e.target.value })} disabled={disabled} className={numCls} />
                    </td>
                  ))}
                  <td className="px-1 py-1.5 text-center">
                    <input type="text" value={item.size} onChange={(e) => updP(item.id, { size: e.target.value })} disabled={disabled} className={numCls} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="text" value={item.notes} onChange={(e) => updP(item.id, { notes: e.target.value })} disabled={disabled} placeholder="הערה" className={txtCls} />
                  </td>
                  {!disabled && (
                    <td className="px-1 py-1.5 text-center">
                      <button type="button" onClick={() => removePole(item.id)} className="text-gray-300 hover:text-red-500 transition-colors text-xs px-1" title="הסר שורה">✕</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!disabled && (
          <div className="flex justify-end px-5 py-3 border-t border-gray-100">
            <button type="button" onClick={addPole} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-blue-400 text-blue-600 text-sm font-medium hover:bg-blue-50 transition-colors">
              + הוסף שורה
            </button>
          </div>
        )}
      </div>

      {/* SIGNS */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 bg-orange-50 border-b border-orange-100">
          <svg className="w-5 h-5 text-orange-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <h2 className="text-base font-bold text-orange-900">תמרורים</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: 1100 }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                <th className="px-2 py-2.5 text-center font-medium w-14">עירוני</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">ב״ע</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">רגיל</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">ר״ע</th>
                <th className="px-2 py-2.5 text-center font-medium w-14">יהלום</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">יצא</th>
                <th className="px-2 py-2.5 text-center font-medium w-14">אספקה</th>
                <th className="px-2 py-2.5 text-center font-medium w-14">התקנה</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">פירוק</th>
                <th className="px-2 py-2.5 text-center font-medium w-14">העתקה</th>
                <th className="px-2 py-2.5 text-center font-medium w-14">זווית</th>
                <th className="px-2 py-2.5 text-center font-medium w-14">מסגרת</th>
                <th className="px-2 py-2.5 text-center font-medium w-14">פרופיל</th>
                <th className="px-2 py-2.5 text-center font-medium w-16">גודל</th>
                <th className="px-2 py-2.5 text-center font-medium w-14">סוללה</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">סולרי</th>
                <th className="px-2 py-2.5 text-center font-medium w-12">חזר</th>
                <th className="px-3 py-2.5 text-right font-medium">הערות</th>
                {!disabled && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {signItems.map((item, idx) => (
                <tr key={item.id} className={`border-b border-gray-100 ${idx % 2 === 1 ? "bg-gray-50/40" : ""}`}>
                  {(["urban", "basic", "regular", "reinforced", "diamond", "out", "supply", "install", "dismantle", "move"] as const).map((col) => (
                    <td key={col} className="px-1 py-1.5 text-center">
                      <input type="number" min="0" value={item[col]} onChange={(e) => updS(item.id, { [col]: e.target.value })} disabled={disabled} className={numCls} />
                    </td>
                  ))}
                  {(["angle", "frame", "profile", "signSize"] as const).map((col) => (
                    <td key={col} className="px-1 py-1.5 text-center">
                      <input type="text" value={item[col]} onChange={(e) => updS(item.id, { [col]: e.target.value })} disabled={disabled} className={smCls} />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" checked={item.battery} onChange={(e) => updS(item.id, { battery: e.target.checked })} disabled={disabled} className="w-4 h-4 accent-blue-600" />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" checked={item.solar} onChange={(e) => updS(item.id, { solar: e.target.checked })} disabled={disabled} className="w-4 h-4 accent-blue-600" />
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <input type="number" min="0" value={item.returned} onChange={(e) => updS(item.id, { returned: e.target.value })} disabled={disabled} className={numCls} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="text" value={item.notes} onChange={(e) => updS(item.id, { notes: e.target.value })} disabled={disabled} placeholder="הערה" className={txtCls} />
                  </td>
                  {!disabled && (
                    <td className="px-1 py-1.5 text-center">
                      <button type="button" onClick={() => removeSign(item.id)} className="text-gray-300 hover:text-red-500 transition-colors text-xs px-1" title="הסר שורה">✕</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50">
          <p className="text-xs text-gray-400">מלא רק את השורות הרלוונטיות</p>
          {!disabled && (
            <button type="button" onClick={addSign} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-orange-400 text-orange-600 text-sm font-medium hover:bg-orange-50 transition-colors">
              + הוסף שורה
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
