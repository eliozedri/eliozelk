"use client";

import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import type { Customer, CustomerFormState } from "@/types/customer";

const STORAGE_KEY = "elkayam_customers";

function loadCustomers(): Customer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage once on mount. Setting hydrated=true in the same
  // batch prevents the save effect from firing with [] before data is loaded.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomers(loadCustomers());
    setHydrated(true);
  }, []);

  // Only persist after hydration — prevents wiping saved data on initial render.
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
  }, [customers, hydrated]);

  const addCustomer = useCallback((form: CustomerFormState) => {
    const now = new Date().toISOString();
    const newCustomer: Customer = {
      id: nanoid(),
      ...form,
      createdAt: now,
      updatedAt: now,
    };
    setCustomers((prev) => [...prev, newCustomer]);
  }, []);

  const updateCustomer = useCallback((id: string, partial: Partial<Omit<Customer, "id" | "createdAt">>) => {
    const now = new Date().toISOString();
    setCustomers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...partial, updatedAt: now } : c))
    );
  }, []);

  const deleteCustomer = useCallback((id: string) => {
    setCustomers((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { customers, addCustomer, updateCustomer, deleteCustomer };
}
