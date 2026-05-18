"use client";

import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import type { MiscRow, OrderAttachment, OrderState, SignRow, FabricationDetails } from "@/types/order";

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

function emptyFabrication(): FabricationDetails {
  return { description: "", width: "", height: "", quantity: "", material: "", notes: "" };
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
    city: "",
    orderType: undefined,
    fulfillmentMethod: undefined,
    awaitingCustomerApproval: false,
    requiredDate: "",
    jobName: "",
    location: "",
    signRows: [emptySignRow()],
    accessoryRows: [emptyMiscRow()],
    miscRows: [emptyMiscRow()],
    generalNotes: "",
    attachments: [],
    fabricationRequired: false,
    fabricationDetails: emptyFabrication(),
  };
}

export function useOrderForm() {
  const [order, setOrder] = useState<OrderState>(initialState);

  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      // Migrate old drafts that may be missing new fields
      setOrder({ // eslint-disable-line react-hooks/set-state-in-effect
        ...initialState(),
        ...draft,
        accessoryRows: draft.accessoryRows ?? [emptyMiscRow()],
        generalNotes: draft.generalNotes ?? "",
        attachments: draft.attachments ?? [],
        fabricationRequired: draft.fabricationRequired ?? false,
        fabricationDetails: draft.fabricationDetails ?? emptyFabrication(),
        contactPerson: draft.contactPerson ?? "",
        orderedBy: draft.orderedBy ?? "",
        orderType: draft.orderType ?? undefined,
        fulfillmentMethod: draft.fulfillmentMethod ?? undefined,
        awaitingCustomerApproval: draft.awaitingCustomerApproval ?? false,
      });
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  }, [order]);

  const updateHeader = useCallback(
    (partial: Partial<Pick<OrderState, "date" | "customer" | "contactPerson" | "orderedBy" | "city" | "generalNotes" | "jobName" | "location" | "orderType" | "fulfillmentMethod" | "awaitingCustomerApproval" | "requiredDate">>) => {
      setOrder((prev) => ({ ...prev, ...partial }));
    },
    []
  );

  // Sign rows
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

  // Accessory rows
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

  // Misc rows
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

  const setFabricationRequired = useCallback((required: boolean) => {
    setOrder((prev) => ({ ...prev, fabricationRequired: required }));
  }, []);

  const updateFabrication = useCallback((partial: Partial<FabricationDetails>) => {
    setOrder((prev) => ({
      ...prev,
      fabricationDetails: { ...prev.fabricationDetails, ...partial },
    }));
  }, []);

  const addAttachment = useCallback((attachment: OrderAttachment) => {
    setOrder((prev) => ({ ...prev, attachments: [...(prev.attachments ?? []), attachment] }));
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setOrder((prev) => ({ ...prev, attachments: (prev.attachments ?? []).filter((a) => a.id !== id) }));
  }, []);

  const resetOrder = useCallback(() => {
    const fresh = initialState();
    setOrder(fresh);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    order,
    updateHeader,
    setFabricationRequired,
    addSignRow,
    updateSignRow,
    removeSignRow,
    addAccessoryRow,
    updateAccessoryRow,
    removeAccessoryRow,
    addMiscRow,
    updateMiscRow,
    removeMiscRow,
    updateFabrication,
    addAttachment,
    removeAttachment,
    resetOrder,
  };
}
