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
    location: "",
    city: "",
    reference: "",
    signRows: [emptySignRow()],
    miscRows: [emptyMiscRow()],
  };
}

export function useOrderForm() {
  const [order, setOrder] = useState<OrderState>(initialState);

  // Load draft from localStorage on mount
  useEffect(() => {
    const draft = loadDraft();
    if (draft) setOrder(draft);
  }, []);

  // Auto-save to localStorage on every change
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  }, [order]);

  const updateHeader = useCallback(
    (partial: Partial<Pick<OrderState, "date" | "customer" | "location" | "city" | "reference">>) => {
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
    resetOrder,
  };
}
