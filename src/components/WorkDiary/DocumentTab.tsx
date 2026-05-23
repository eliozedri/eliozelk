"use client";

import { useCallback } from "react";
import type { WorkDiary, DiarySignature, DiaryPhoto } from "@/types/workDiary";
import { SignatureCanvas } from "./SignatureCanvas";
import { PhotoUpload } from "./PhotoUpload";

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-500";

interface SignatureBlockProps {
  title: string;
  sig: DiarySignature | null;
  onChange: (sig: DiarySignature) => void;
  disabled: boolean;
  hasError?: boolean;
}

function SignatureBlock({ title, sig, onChange, disabled, hasError = false }: SignatureBlockProps) {
  const current: DiarySignature = sig ?? {
    signerName: "",
    signerRole: "",
    signerEmail: "",
    location: "",
    signedAt: "",
    dataUrl: "",
  };

  function upd(partial: Partial<DiarySignature>) {
    onChange({ ...current, ...partial });
  }

  function handleMarkTime() {
    const now = new Date().toISOString();
    upd({ signedAt: now });
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          upd({
            signedAt: now,
            location: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
          }),
        () => {}
      );
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
      <h3 className="text-sm font-bold text-gray-700 border-b border-gray-100 pb-3">
        {title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            שם מלא *
          </label>
          <input
            type="text"
            value={current.signerName}
            onChange={(e) => upd({ signerName: e.target.value })}
            disabled={disabled}
            className={inputCls}
            placeholder="שם החותם"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            תפקיד
          </label>
          <input
            type="text"
            value={current.signerRole}
            onChange={(e) => upd({ signerRole: e.target.value })}
            disabled={disabled}
            className={inputCls}
            placeholder="תפקיד / מחלקה"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            מייל לקבלת עותק
          </label>
          <input
            type="email"
            value={current.signerEmail}
            onChange={(e) => upd({ signerEmail: e.target.value })}
            disabled={disabled}
            className={inputCls}
            placeholder="example@email.com"
            dir="ltr"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            מיקום
          </label>
          <input
            type="text"
            value={current.location}
            onChange={(e) => upd({ location: e.target.value })}
            disabled={disabled}
            className={inputCls}
            placeholder="מיקום (מולא אוטומטי)"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-600">חתימה</label>
          {!disabled && (
            <button
              type="button"
              onClick={handleMarkTime}
              className="text-xs text-blue-600 hover:text-blue-800 underline transition-colors"
            >
              סמן זמן ומיקום אוטומטי
            </button>
          )}
        </div>
        <SignatureCanvas
          value={current.dataUrl}
          onChange={(dataUrl) => upd({ dataUrl })}
          disabled={disabled}
          hasError={hasError && !current.dataUrl}
        />
        {current.signedAt && (
          <p className="text-xs text-gray-400 mt-1.5">
            נחתם: {new Date(current.signedAt).toLocaleString("he-IL")}
            {current.location && ` | ${current.location}`}
          </p>
        )}
      </div>
    </div>
  );
}

interface Props {
  diary: WorkDiary;
  onChange: (partial: Partial<WorkDiary>) => void;
  disabled?: boolean;
  signatureError?: boolean;
  onSignatureChange?: () => void;
}

export function DocumentTab({ diary, onChange, disabled = false, signatureError = false, onSignatureChange }: Props) {
  const handlePhotos = useCallback(
    (photos: DiaryPhoto[]) => onChange({ photos }),
    [onChange]
  );

  return (
    <div className="space-y-6">
      {/* Photos */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">תמונות מהשטח</h3>
        <PhotoUpload
          photos={diary.photos}
          onChange={handlePhotos}
          disabled={disabled}
        />
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-3">הערות כלליות</h3>
        <textarea
          value={diary.generalNotes}
          onChange={(e) => onChange({ generalNotes: e.target.value })}
          disabled={disabled}
          rows={4}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400 resize-none disabled:bg-gray-50 disabled:text-gray-500"
          placeholder="הערות, תצפיות, מידע נוסף..."
        />
      </div>

      {/* Signatures — worker signature (ראש צוות) is mandatory for submission */}
      <SignatureBlock
        title="חתימת קבלן / מפקח"
        sig={diary.customerSignature}
        onChange={(sig) => onChange({ customerSignature: sig })}
        disabled={disabled}
      />
      <SignatureBlock
        title="חתימת ראש צוות (חובה)"
        sig={diary.companySignature}
        onChange={(sig) => { onChange({ companySignature: sig }); if (sig.dataUrl) onSignatureChange?.(); }}
        disabled={disabled}
        hasError={signatureError}
      />
    </div>
  );
}
