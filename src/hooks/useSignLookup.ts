"use client";

import { useEffect, useState } from "react";
import { lookupSign } from "@/lib/signLookup";
import type { SignRecord } from "@/types/order";

type LookupStatus = "idle" | "found" | "not_found";

export function useSignLookup(signNumber: string): {
  record: SignRecord | null;
  status: LookupStatus;
} {
  const [record, setRecord] = useState<SignRecord | null>(null);
  const [status, setStatus] = useState<LookupStatus>("idle");

  useEffect(() => {
    if (!signNumber.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecord(null);
      setStatus("idle");
      return;
    }

    const timer = setTimeout(() => {
      const found = lookupSign(signNumber);
      setRecord(found);
      setStatus(found ? "found" : "not_found");
    }, 300);

    return () => clearTimeout(timer);
  }, [signNumber]);

  return { record, status };
}
