"use client";

import type { WorkDiary } from "@/types/workDiary";
import { useCustomersContext } from "@/context/CustomersContext";
import { OrderLinkCard } from "./OrderLinkCard";

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-500";

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
  const { customers } = useCustomersContext();

  function inp(key: keyof WorkDiary) {
    return {
      value: (diary[key] as string) ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        onChange({ [key]: e.target.value }),
      disabled,
      className: inputCls,
    };
  }

  function numInp(key: keyof WorkDiary, step = "1") {
    const raw = diary[key];
    return {
      type: "number" as const,
      min: "0",
      step,
      dir: "ltr" as const,
      value: raw !== undefined && raw !== null ? String(raw) : "",
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        onChange({ [key]: e.target.value === "" ? undefined : Number(e.target.value) }),
      disabled,
      className: inputCls,
    };
  }

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
      {/* פרטי עבודה */}
      <SectionCard title="פרטי עבודה">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="שם חברה / לקוח *">
            <input
              type="text"
              list="diary-customers-list"
              placeholder="שם הלקוח או החברה"
              {...inp("customerName")}
            />
            <datalist id="diary-customers-list">
              {customers.map(c => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </Field>
          <Field label="שם עבודה / אתר עבודה *">
            <input type="text" placeholder="שם הפרויקט / כתובת האתר" {...inp("siteName")} />
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
          <Field label="טלפון איש קשר (אופציונלי)">
            <input type="tel" dir="ltr" placeholder="050-0000000" {...inp("contactPhone")} />
          </Field>
        </div>
      </SectionCard>

      {/* צוות */}
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

      {/* רכב */}
      <SectionCard title="רכב">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="מספר רכב">
            <input type="text" dir="ltr" placeholder="123-45-678" {...inp("vehicleNumber")} />
          </Field>
          <Field label="שם נהג">
            <input type="text" placeholder="שם הנהג" {...inp("driverName")} />
          </Field>
        </div>
      </SectionCard>

      {/* נתוני יום */}
      <SectionCard title="נתוני יום" accent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="סכום לחיוב (₪)">
            <input placeholder="0" {...numInp("billedAmount")} />
          </Field>
          <Field label="שעות ביצוע">
            <input placeholder="0" {...numInp("executionTimeHours", "0.5")} />
          </Field>
          <Field label="שעות נסיעה">
            <input placeholder="0" {...numInp("travelTimeHours", "0.5")} />
          </Field>
          <Field label="שעות המתנה">
            <input placeholder="0" {...numInp("waitingTimeHours", "0.5")} />
          </Field>
        </div>
        <p className="mt-3 text-xs text-gray-400">שעות ביצוע / נסיעה / המתנה משמשות לחישוב הרווחיות היומית</p>
      </SectionCard>

      <OrderLinkCard
        orderId={diary.orderId}
        onChange={(v) => onChange({ orderId: v })}
        disabled={disabled}
      />
    </div>
  );
}
