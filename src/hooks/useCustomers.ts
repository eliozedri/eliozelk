"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}

function saveLocal(items: Customer[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* ignore */ }
}

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const ref = useRef<Customer[]>([]);

  // Keep ref always current (safe to read in callbacks without stale closure)
  useEffect(() => { ref.current = customers; }, [customers]);

  // Persist to localStorage after hydration
  useEffect(() => {
    if (!hydrated) return;
    saveLocal(customers);
  }, [customers, hydrated]);

  useEffect(() => {
    const db = getSupabase();
    if (db) {
      db.from("customers").select("*").order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) {
            if (data.length > 0) {
              // Supabase is authoritative — use its data
              const mapped = data.map(r => fromRow(r as Record<string, unknown>));
              setCustomers(mapped);
              saveLocal(mapped);
            } else {
              // Supabase empty (not error) — migrate local data up
              const local = loadLocal();
              setCustomers(local);
              if (local.length > 0) {
                db.from("customers").upsert(local.map(toRow), { onConflict: "id" }).then(() => {});
              }
            }
          } else {
            // Network error — use local cache, do NOT push to cloud
            setCustomers(loadLocal());
          }
          setHydrated(true);
        });
    } else {
      setCustomers(loadLocal());
      setHydrated(true);
    }
  }, []);

  const addCustomer = useCallback((form: CustomerFormState) => {
    const now = new Date().toISOString();
    const newCustomer: Customer = { id: nanoid(), ...form, createdAt: now, updatedAt: now };

    // Optimistic update
    setCustomers(prev => [newCustomer, ...prev]);

    // Cloud write (outside setState — no side effects in updater)
    const db = getSupabase();
    if (db) {
      db.from("customers").insert(toRow(newCustomer)).then(({ error }) => {
        if (error) {
          console.error("[customers] insert failed:", error.message);
          // Revert
          setCustomers(prev => prev.filter(c => c.id !== newCustomer.id));
        }
      });
    }
  }, []);

  const updateCustomer = useCallback((id: string, partial: Partial<Omit<Customer, "id" | "createdAt">>) => {
    const now = new Date().toISOString();
    const original = ref.current.find(c => c.id === id);
    if (!original) return;
    const updated = { ...original, ...partial, updatedAt: now };

    // Optimistic update
    setCustomers(prev => prev.map(c => c.id === id ? updated : c));

    // Cloud write (outside setState)
    const db = getSupabase();
    if (db) {
      db.from("customers").update(toRow(updated)).eq("id", id).then(({ error }) => {
        if (error) {
          console.error("[customers] update failed:", error.message);
          // Revert
          setCustomers(prev => prev.map(c => c.id === id ? original : c));
        }
      });
    }
  }, []);

  const deleteCustomer = useCallback((id: string) => {
    const original = ref.current.find(c => c.id === id);

    // Optimistic update
    setCustomers(prev => prev.filter(c => c.id !== id));

    // Cloud write (outside setState)
    const db = getSupabase();
    if (db) {
      db.from("customers").delete().eq("id", id).then(({ error }) => {
        if (error) {
          console.error("[customers] delete failed:", error.message);
          // Revert
          if (original) setCustomers(prev => [...prev, original].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        }
      });
    }
  }, []);

  return { customers, addCustomer, updateCustomer, deleteCustomer };
}
