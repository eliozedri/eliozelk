"use client";

import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import type { Customer, CustomerFormState } from "@/types/customer";
import { getSupabase } from "@/lib/supabase/client";

const STORAGE_KEY = "elkayam_customers";

function fromRow(r: Record<string, unknown>): Customer {
  return {
    id: r.id as string,
    name: r.name as string,
    location: r.location as string,
    phone: r.phone as string,
    lastOrder: r.last_order as string,
    notes: r.notes as string | undefined,
    paymentTerms: r.payment_terms as string | undefined,
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
    updatedAt: (r.updated_at as string) ?? new Date().toISOString(),
  };
}

function toRow(c: Customer) {
  return {
    id: c.id,
    name: c.name,
    location: c.location,
    phone: c.phone,
    last_order: c.lastOrder,
    notes: c.notes ?? null,
    payment_terms: c.paymentTerms ?? null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

function loadLocal(): Customer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocal(customers: Customer[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(customers)); } catch { /* ignore */ }
}

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const db = getSupabase();
    if (db) {
      db.from("customers").select("*").order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (!error && data && data.length > 0) {
            const mapped = data.map(fromRow);
            setCustomers(mapped);
            saveLocal(mapped);
          } else {
            // Supabase empty or error — load local and push to cloud
            const local = loadLocal();
            setCustomers(local);
            if (local.length > 0) {
              db.from("customers").upsert(local.map(toRow), { onConflict: "id" }).then(() => {});
            }
          }
          setHydrated(true);
        });
    } else {
      setCustomers(loadLocal());
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveLocal(customers);
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
    const db = getSupabase();
    if (db) db.from("customers").insert(toRow(newCustomer)).then(() => {});
  }, []);

  const updateCustomer = useCallback((id: string, partial: Partial<Omit<Customer, "id" | "createdAt">>) => {
    const now = new Date().toISOString();
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, ...partial, updatedAt: now };
        const db = getSupabase();
        if (db) db.from("customers").update(toRow(updated)).eq("id", id).then(() => {});
        return updated;
      })
    );
  }, []);

  const deleteCustomer = useCallback((id: string) => {
    setCustomers((prev) => prev.filter((c) => c.id !== id));
    const db = getSupabase();
    if (db) db.from("customers").delete().eq("id", id).then(() => {});
  }, []);

  return { customers, addCustomer, updateCustomer, deleteCustomer };
}
