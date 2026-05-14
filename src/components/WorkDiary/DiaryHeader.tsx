"use client";

import { nanoid } from "nanoid";
import type { WorkDiary } from "@/types/workDiary";
import { useOrdersContext } from "@/context/OrdersContext";
import { useAuth } from "@/context/AuthContext";

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-500";

const numCls =
  "w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent text-center disabled:bg-gray-50";

interface Props {
  diary: WorkDiary;
  onChange: (partial: Partial<WorkDiary>) => void;
  disabled?: boolean;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function SectionCard({ title, children, accent = false }: { title: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`bg-white rounded-xl border shadow-sm p-5 ${accent ? "border-blue-200" : "border-gray-200"}`}>
      <h3 className={`text-sm font-bold mb-4 ${accent ? "text-blue-700" : "text-gray-700"}`}>{title}</h3>
      {children}
    </div>
  );
}

export function DiaryHeader({ diary, onChange, disabled = false }: Props) {
  const { orders } = useOrdersContext();
  const { profile } = useAuth();
  const isWorker = profile?.role === "field_worker";

  function inp(key: keyof WorkDiary) {
    return {
      value: (diary[key] as string) ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        onChange({ [key]: e.target.value }),
      disabled,
      className: inputCls,
    };
  }

  function numInp(key: keyof WorkDiary, placeholder = "0") {
    return {
      type: "number" as const,
      min: "0",
      step: "0.25",
      value: (diary[key] as number | undefined) ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        onChange({ [key]: e.target.value === "" ? undefined : parseFloat(e.target.value) }),
      disabled,
      placeholder,
      className: numCls,
    };
  }

  const linkableOrders = orders.filter(
    (o) => o.status !== "cancelled" && o.status !== "completed"
  );

  function addCrewMember() {
    onChange({ crewMembers: [...(diary.crewMembers ?? []), ""] });
  }

  function updateCrewMember(idx: number, val: string) {
    const updated = [...(diary.crewMembers ?? [])];
    updated[idx] = val;
    onChange({ crewMembers: updated });
  }

  function removeCrewMember(idx: number) {
    const updated = (diary.crewMembers ?? []).filter((_, i) => i !== idx);
    onChange({ crewMembers: updated.length > 0 ? updated : [""] });
  }

  return (
    <div className="space-y-5">
      {/* פרטי עבודה — section 1 */}
      <SectionCard title="פרטי עבודה">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="שם הקבלן *">
            <input type="text" placeholder="שם הקבלן או הלקוח" {...inp("customerName")} />
          </Field>
          <Field label="אתר העבודה *">
            <input type="text" placeholder="כתובת / שם האתר" {...inp("siteName")} />
          </Field>
          <Field label="תאריך ביצוע *">
            <input type="date" dir="ltr" {...inp("executionDate")} />
          </Field>
          <Field label="שעת תחילה">
            <input type="time" dir="ltr" {...inp("startTime")} />
          </Field>
          <Field label="שעת סיום">
            <input type="time" dir="ltr" {...inp("endTime")} />
          </Field>
          <Field label="איש קשר">
            <input type="text" placeholder="שם איש הקשר" {...inp("contactName")} />
          </Field>
          <Field label="טלפון">
            <input type="tel" placeholder="050-0000000" dir="ltr" {...inp("contactPhone")} />
          </Field>

          {/* קישור להזמנה — hidden from field workers */}
          {!isWorker && (
            <div className="sm:col-span-2">
              <Field label="קישור להזמנה">
                <select
                  value={diary.orderId ?? ""}
                  onChange={(e) => {
                    const order = orders.find((o) => o.id === e.target.value);
                    onChange({
                      orderId: e.target.value || undefined,
                      orderNumber: order?.orderNumber ?? undefined,
                    });
                  }}
                  disabled={disabled}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">— ללא קישור להזמנה —</option>
                  {linkableOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderNumber} · {o.customer}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </div>
      </SectionCard>

      {/* פרטי ביצוע — vehicles + time breakdown */}
      <SectionCard title="פרטי ביצוע">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="רכב מס׳">
            <input type="text" placeholder="מספר הרכב" {...inp("vehicleNumber")} />
          </Field>
          <Field label="נגרר מס׳">
            <input type="text" placeholder="מספר הנגרר" {...inp("trailerNumber")} />
          </Field>
          <Field label="שם הנהג">
            <input type="text" placeholder="שם הנהג" {...inp("driverName")} />
          </Field>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">פירוט זמנים (שעות)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="נסיעה הלוך-חזור">
              <input {...numInp("travelTimeHours")} />
            </Field>
            <Field label="הכנה ופירוק">
              <input {...numInp("setupTimeHours")} />
            </Field>
            <Field label="המתנה באתר">
              <input {...numInp("waitingTimeHours")} />
            </Field>
            <Field label="ביצוע בפועל">
              <input {...numInp("executionTimeHours")} />
            </Field>
          </div>
        </div>
      </SectionCard>

      {/* Crew — dynamic count */}
      <SectionCard title="צוות">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="ראש צוות">
            <input type="text" placeholder="שם ראש הצוות" {...inp("crewLeaderName")} />
          </Field>
          {(diary.crewMembers ?? []).map((member, i) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">איש צוות {i + 1}</label>
                <input
                  type="text"
                  placeholder={`שם איש צוות ${i + 1}`}
                  value={member}
                  onChange={(e) => updateCrewMember(i, e.target.value)}
                  disabled={disabled}
                  className={inputCls}
                />
              </div>
              {!disabled && (diary.crewMembers ?? []).length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCrewMember(i)}
                  className="mb-0.5 px-2 py-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors text-xs"
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
            onClick={addCrewMember}
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-300 text-blue-600 text-xs font-medium hover:bg-blue-50 transition-colors"
          >
            + הוסף איש צוות
          </button>
        )}
      </SectionCard>

      {/* Billing & Costs — hidden from field workers */}
      {!isWorker && (
        <SectionCard title="חיוב ועלויות" accent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="סכום לחיוב (₪)">
              <input
                type="number"
                min="0"
                step="100"
                value={diary.billedAmount ?? ""}
                onChange={(e) =>
                  onChange({ billedAmount: e.target.value === "" ? undefined : parseFloat(e.target.value) })
                }
                disabled={disabled}
                placeholder="0"
                className={numCls}
                dir="ltr"
              />
            </Field>
            <Field label="ניתן לחיוב?">
              <select
                value={diary.isBillable === false ? "false" : "true"}
                onChange={(e) => onChange({ isBillable: e.target.value !== "false" })}
                disabled={disabled}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="true">כן — ניתן לחיוב</option>
                <option value="false">לא — עבודה פנימית</option>
              </select>
            </Field>
            <Field label="עלות חומרים (₪)">
              <input
                type="number" min="0" step="50"
                value={diary.materialCost ?? ""}
                onChange={(e) => onChange({ materialCost: e.target.value === "" ? undefined : parseFloat(e.target.value) })}
                disabled={disabled} placeholder="0" className={numCls} dir="ltr"
              />
            </Field>
            <Field label="עלות ציוד/קבלן (₪)">
              <input
                type="number" min="0" step="50"
                value={diary.equipmentCost ?? ""}
                onChange={(e) => onChange({ equipmentCost: e.target.value === "" ? undefined : parseFloat(e.target.value) })}
                disabled={disabled} placeholder="0" className={numCls} dir="ltr"
              />
            </Field>
            <Field label="הערות חיוב">
              <input type="text" placeholder="הערות לחשבונית..." {...inp("billingNotes")} />
            </Field>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
