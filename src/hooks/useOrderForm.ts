"use client";

import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import type { MiscRow, OrderState, SignRow } from "@/types/order";

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function emptySignRow(): SignRow {
  return {
    id: nanoid(),
    signNumber: "",
    quantity: "",
    notes: "",
    imageUrl: null,
    size: "",
    type: "",
    lookupStatus: "idle",
  };
}

function emptyMiscRow(): MiscRow {
  return { id: nanoid(), description: "", quantity: "", notes: "" };
}

const STORAGE_KEY = "elkayam_order_draft";

function loadDraft(): OrderState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function initialState(): OrderState {
  return {
    date: todayISO(),
    customer: "",
    contactPerson: "",
    orderedBy: "",
    location: "",
    jobSlash: "",
    city: "",
    reference: "",
    signRows: [emptySignRow()],
    miscRows: [emptyMiscRow()],
    accessoryRows: [emptyMiscRow()],
  };
}

export function useOrderForm() {
  const [order, setOrder] = useState<OrderState>(initialState);

  useEffect(() => {
    const draft = loadDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (draft) {
      // Ensure new fields exist in old drafts
      setOrder({
        ...initialState(),
        ...draft,
        accessoryRows: draft.accessoryRows ?? [emptyMiscRow()],
      });
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  }, [order]);

  const updateHeader = useCallback(
    (partial: Partial<Pick<OrderState, "date" | "customer" | "contactPerson" | "orderedBy" | "location" | "jobSlash" | "city" | "reference">>) => {
      setOrder((prev) => ({ ...prev, ...partial }));
    },
    []
  );

  const addSignRow = useCallback(() => {
    setOrder((prev) => ({ ...prev, signRows: [...prev.signRows, emptySignRow()] }));
  }, []);

  const updateSignRow = useCallback((id: string, partial: Partial<SignRow>) => {
    setOrder((prev) => ({
      ...prev,
      signRows: prev.signRows.map((row) => (row.id === id ? { ...row, ...partial } : row)),
    }));
  }, []);

  const removeSignRow = useCallback((id: string) => {
    setOrder((prev) => {
      const filtered = prev.signRows.filter((r) => r.id !== id);
      return { ...prev, signRows: filtered.length > 0 ? filtered : [emptySignRow()] };
    });
  }, []);

  const addMiscRow = useCallback(() => {
    setOrder((prev) => ({ ...prev, miscRows: [...prev.miscRows, emptyMiscRow()] }));
  }, []);

  const updateMiscRow = useCallback((id: string, partial: Partial<MiscRow>) => {
    setOrder((prev) => ({
      ...prev,
      miscRows: prev.miscRows.map((row) => (row.id === id ? { ...row, ...partial } : row)),
    }));
  }, []);

  const removeMiscRow = useCallback((id: string) => {
    setOrder((prev) => {
      const filtered = prev.miscRows.filter((r) => r.id !== id);
      return { ...prev, miscRows: filtered.length > 0 ? filtered : [emptyMiscRow()] };
    });
  }, []);

  const addAccessoryRow = useCallback(() => {
    setOrder((prev) => ({ ...prev, accessoryRows: [...(prev.accessoryRows ?? []), emptyMiscRow()] }));
  }, []);

  const updateAccessoryRow = useCallback((id: string, partial: Partial<MiscRow>) => {
    setOrder((prev) => ({
      ...prev,
      accessoryRows: (prev.accessoryRows ?? []).map((row) => (row.id === id ? { ...row, ...partial } : row)),
    }));
  }, []);

  const removeAccessoryRow = useCallback((id: string) => {
    setOrder((prev) => {
      const filtered = (prev.accessoryRows ?? []).filter((r) => r.id !== id);
      return { ...prev, accessoryRows: filtered.length > 0 ? filtered : [emptyMiscRow()] };
    });
  }, []);

  const resetOrder = useCallback(() => {
    const fresh = initialState();
    setOrder(fresh);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    order,
    updateHeader,
    addSignRow,
    updateSignRow,
    removeSignRow,
    addMiscRow,
    updateMiscRow,
    removeMiscRow,
    addAccessoryRow,
    updateAccessoryRow,
    removeAccessoryRow,
    resetOrder,
  };
}
