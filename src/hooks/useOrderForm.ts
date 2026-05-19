"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import type { MiscRow, OrderAttachment, OrderState, SignRow, FabricationDetails } from "@/types/order";
import type { WorkOrder } from "@/types/workOrder";

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
    signsRows: [emptyMiscRow()],
    accessoryRows: [emptyMiscRow()],
    miscRows: [emptyMiscRow()],
    serviceRows: [emptyMiscRow()],
    generalNotes: "",
    attachments: [],
    fabricationRequired: false,
    fabricationDetails: emptyFabrication(),
  };
}

export function useOrderForm(opts?: { skipLocalStorage?: boolean }) {
  const skipLSRef = useRef(opts?.skipLocalStorage ?? false);
  const [order, setOrder] = useState<OrderState>(initialState);

  useEffect(() => {
    if (skipLSRef.current) {
      // Editing a DB draft — clear any stale localStorage so future /new-order visits start fresh
      if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const draft = loadDraft();
    if (draft) {
      // Migrate old drafts that may be missing new fields
      setOrder({ // eslint-disable-line react-hooks/set-state-in-effect
        ...initialState(),
        ...draft,
        signsRows: draft.signsRows ?? [emptyMiscRow()],
        accessoryRows: draft.accessoryRows ?? [emptyMiscRow()],
        serviceRows: draft.serviceRows ?? [emptyMiscRow()],
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

  // Signs rows (שלטים ושילוט)
  const addSignsRow = useCallback(() => {
    setOrder((prev) => ({ ...prev, signsRows: [...(prev.signsRows ?? []), emptyMiscRow()] }));
  }, []);

  const updateSignsRow = useCallback((id: string, partial: Partial<MiscRow>) => {
    setOrder((prev) => ({
      ...prev,
      signsRows: (prev.signsRows ?? []).map((row) => (row.id === id ? { ...row, ...partial } : row)),
    }));
  }, []);

  const removeSignsRow = useCallback((id: string) => {
    setOrder((prev) => {
      const filtered = (prev.signsRows ?? []).filter((r) => r.id !== id);
      return { ...prev, signsRows: filtered.length > 0 ? filtered : [emptyMiscRow()] };
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

  // Service rows (מוצרים ושירותים נוספים)
  const addServiceRow = useCallback(() => {
    setOrder((prev) => ({ ...prev, serviceRows: [...(prev.serviceRows ?? []), emptyMiscRow()] }));
  }, []);

  const updateServiceRow = useCallback((id: string, partial: Partial<MiscRow>) => {
    setOrder((prev) => ({
      ...prev,
      serviceRows: (prev.serviceRows ?? []).map((row) => (row.id === id ? { ...row, ...partial } : row)),
    }));
  }, []);

  const removeServiceRow = useCallback((id: string) => {
    setOrder((prev) => {
      const filtered = (prev.serviceRows ?? []).filter((r) => r.id !== id);
      return { ...prev, serviceRows: filtered.length > 0 ? filtered : [emptyMiscRow()] };
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

  const initFromWorkOrder = useCallback((o: WorkOrder) => {
    setOrder({
      date: o.date,
      customer: o.customer,
      contactPerson: o.contactPerson ?? "",
      orderedBy: o.orderedBy ?? "",
      city: o.city ?? "",
      orderType: o.orderType,
      fulfillmentMethod: o.fulfillmentMethod ?? undefined,
      awaitingCustomerApproval: o.customerApprovalStatus === "pending",
      requiredDate: o.requiredDate ?? "",
      jobName: o.jobName ?? "",
      location: o.location ?? "",
      signRows: o.signRows.length > 0 ? o.signRows : [emptySignRow()],
      signsRows: (o.signsRows ?? []).length > 0 ? (o.signsRows ?? []) : [emptyMiscRow()],
      accessoryRows: (o.accessoryRows ?? []).length > 0 ? (o.accessoryRows ?? []) : [emptyMiscRow()],
      miscRows: o.miscRows.length > 0 ? o.miscRows : [emptyMiscRow()],
      serviceRows: (o.serviceRows ?? []).length > 0 ? (o.serviceRows ?? []) : [emptyMiscRow()],
      generalNotes: o.generalNotes ?? "",
      attachments: o.attachments ?? [],
      fabricationRequired: o.fabricationRequired ?? false,
      fabricationDetails: o.fabricationDetails ?? emptyFabrication(),
    });
  }, []);

  return {
    order,
    updateHeader,
    setFabricationRequired,
    addSignRow,
    updateSignRow,
    removeSignRow,
    addSignsRow,
    updateSignsRow,
    removeSignsRow,
    addAccessoryRow,
    updateAccessoryRow,
    removeAccessoryRow,
    addServiceRow,
    updateServiceRow,
    removeServiceRow,
    addMiscRow,
    updateMiscRow,
    removeMiscRow,
    updateFabrication,
    addAttachment,
    removeAttachment,
    resetOrder,
    initFromWorkOrder,
  };
}
