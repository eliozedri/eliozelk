"use client";

import { useSignLookup } from "@/hooks/useSignLookup";
import type { SignRow } from "@/types/order";

interface Props {
  value: string;
  status: SignRow["lookupStatus"];
  onChange: (value: string) => void;
}

export function SignNumberInput({ value, status, onChange }: Props) {
  const ringClass =
    status === "found"
      ? "ring-2 ring-green-400"
      : status === "not_found"
      ? "ring-2 ring-red-400"
      : "ring-1 ring-gray-300";

  return (
    <div className="flex flex-col gap-0.5">
      <input
        type="text"
        dir="ltr"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="מס׳"
        className={`w-20 px-2 py-1 rounded text-sm border-0 outline-none ${ringClass} focus:ring-2 focus:ring-blue-400 transition-all`}
      />
      {status === "not_found" && (
        <span className="text-xs text-red-500">לא נמצא</span>
      )}
    </div>
  );
}

// Re-export hook so SignRow can use it without a separate import
export { useSignLookup };
