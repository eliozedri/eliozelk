"use client";

import type { WorkDiary } from "@/types/workDiary";

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-500";

interface Props {
  diary: WorkDiary;
  onChange: (partial: Partial<WorkDiary>) => void;
  disabled?: boolean;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

export function DiaryHeader({ diary, onChange, disabled = false }: Props) {
  function inp(key: keyof WorkDiary) {
    return {
      value: (diary[key] as string) ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        onChange({ [key]: e.target.value }),
      disabled,
      className: inputCls,
    };
  }

  return (
    <div className="space-y-5">
      {/* Project */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">פרטי הפרויקט</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="שם הקבלן *">
            <input
              type="text"
              placeholder="שם הקבלן או הלקוח"
              {...inp("customerName")}
            />
          </Field>
          <Field label="אתר העבודה *">
            <input
              type="text"
              placeholder="כתובת / שם האתר"
              {...inp("siteName")}
            />
          </Field>
          <Field label="איש קשר">
            <input
              type="text"
              placeholder="שם איש הקשר"
              {...inp("contactName")}
            />
          </Field>
          <Field label="טלפון">
            <input
              type="tel"
              placeholder="050-0000000"
              dir="ltr"
              {...inp("contactPhone")}
            />
          </Field>
        </div>
      </div>

      {/* Execution */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">פרטי ביצוע</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="תאריך ביצוע *">
            <input type="date" dir="ltr" {...inp("executionDate")} />
          </Field>
          <Field label="שעת תחילה">
            <input type="time" dir="ltr" {...inp("startTime")} />
          </Field>
          <Field label="שעת סיום">
            <input type="time" dir="ltr" {...inp("endTime")} />
          </Field>
          <Field label="רכב מס׳">
            <input
              type="text"
              placeholder="מספר הרכב"
              {...inp("vehicleNumber")}
            />
          </Field>
          <Field label="נגרר מס׳">
            <input
              type="text"
              placeholder="מספר הנגרר"
              {...inp("trailerNumber")}
            />
          </Field>
          <Field label="שם הנהג">
            <input type="text" placeholder="שם הנהג" {...inp("driverName")} />
          </Field>
        </div>
      </div>

      {/* Crew */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">צוות</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="ראש צוות">
            <input
              type="text"
              placeholder="שם ראש הצוות"
              {...inp("crewLeaderName")}
            />
          </Field>
          {([0, 1, 2, 3] as const).map((i) => (
            <Field key={i} label={`איש צוות ${i + 1}`}>
              <input
                type="text"
                placeholder={`שם איש צוות ${i + 1}`}
                value={diary.crewMembers[i]}
                onChange={(e) => {
                  const updated: [string, string, string, string] = [
                    ...diary.crewMembers,
                  ];
                  updated[i] = e.target.value;
                  onChange({ crewMembers: updated });
                }}
                disabled={disabled}
                className={inputCls}
              />
            </Field>
          ))}
        </div>
      </div>
    </div>
  );
}
