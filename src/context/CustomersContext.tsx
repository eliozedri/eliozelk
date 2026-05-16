"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import type { Customer, CustomerFormState } from "@/types/customer";
import { getSupabase } from "@/lib/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SyncStatus = "loading" | "connected" | "offline" | "error";

interface CustomersContextValue {
  customers: Customer[];
  syncStatus: SyncStatus;
  addCustomer: (form: CustomerFormState) => Promise<Customer>;
  updateCustomer: (id: string, partial: Partial<Omit<Customer, "id" | "createdAt">>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
}

const CustomersContext = createContext<CustomersContextValue | null>(null);

// ─── Local cache (read-only boot cache — written once after successful fetch) ─

const STORAGE_KEY = "elkayam_customers";

function readCache(): Customer[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}

function warmCache(items: Customer[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* ignore */ }
}

// ─── Row mapping ──────────────────────────────────────────────────────────────

function fromRow(r: Record<string, unknown>): Customer {
  return {
    id: r.id as string,
    name: r.name as string,
    location: (r.location as string) ?? "",
    phone: (r.phone as string) ?? "",
    lastOrder: (r.last_order as string) ?? "",
    notes: r.notes as string | undefined,
    paymentTerms: r.payment_terms as string | undefined,
    contactPerson: r.contact_person as string | undefined,
    contactEmail: r.contact_email as string | undefined,
    contactPhone: r.contact_phone as string | undefined,
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
    updatedAt: (r.updated_at as string) ?? new Date().toISOString(),
  };
}

function toRow(c: Customer) {
  // contact_person / contact_email / contact_phone omitted until migration
  // 20260516200000_customer_contact_fields.sql is applied to the live DB.
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isNewer(existingUpdatedAt: string, incomingUpdatedAt: string): boolean {
  try {
    return new Date(incomingUpdatedAt).getTime() > new Date(existingUpdatedAt).getTime();
  } catch {
    return false;
  }
}

function sortByName(a: Customer, b: Customer): number {
  return a.name.localeCompare(b.name, "he");
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function CustomersProvider({ children }: { children: React.ReactNode }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");
  const ref = useRef<Customer[]>([]);

  useEffect(() => { ref.current = customers; }, [customers]);

  useEffect(() => {
    const db = getSupabase();

    if (!db) {
      const cached = readCache();
      setCustomers(cached);
      setSyncStatus("offline");
      console.warn("[customers] Supabase not configured — running from local cache");
      return;
    }

    // Show boot cache immediately to avoid empty flash while fetching
    const cached = readCache();
    if (cached.length > 0) setCustomers(cached);

    // Initial fetch — Supabase is authoritative
    db.from("customers")
      .select("*")
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error("[customers] initial fetch failed:", error.message);
          setSyncStatus("error");
          // Keep showing boot cache — do NOT treat as authoritative
          return;
        }
        const mapped = (data ?? []).map(r => fromRow(r as Record<string, unknown>));
        if (mapped.length > 0) {
          // Supabase has data — it's authoritative
          setCustomers(mapped);
          warmCache(mapped);
        } else {
          // Supabase is empty — one-time migration from localStorage boot cache
          const local = readCache();
          if (local.length > 0) {
            console.log("[customers] migrating local cache to Supabase:", local.length, "rows");
            setCustomers(local);
            db.from("customers").upsert(local.map(toRow), { onConflict: "id" }).then(({ error: migErr }) => {
              if (migErr) console.error("[customers] migration failed:", migErr.message);
            });
          }
          // else: genuinely empty — no-op, don't overwrite cache with []
        }
        setSyncStatus("connected");
      });

    // Realtime subscription — one channel, cleaned up on unmount
    const channel = db
      .channel("customers_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const incoming = fromRow(payload.new as Record<string, unknown>);
            setCustomers(prev => {
              // Deduplicate: optimistic insert already added this ID
              if (prev.some(c => c.id === incoming.id)) return prev;
              return [...prev, incoming].sort(sortByName);
            });
          } else if (payload.eventType === "UPDATE") {
            const incoming = fromRow(payload.new as Record<string, unknown>);
            setCustomers(prev =>
              prev.map(c => {
                if (c.id !== incoming.id) return c;
                // Only apply if incoming is actually newer — prevents stale echo overwriting optimistic state
                return isNewer(c.updatedAt, incoming.updatedAt) ? incoming : c;
              })
            );
          } else if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as { id?: string }).id;
            if (deletedId) {
              setCustomers(prev => prev.filter(c => c.id !== deletedId));
            }
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          console.log("[customers] realtime connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[customers] realtime issue:", status, err?.message ?? "");
        } else if (status === "CLOSED") {
          console.log("[customers] realtime channel closed");
        }
      });

    return () => {
      db.removeChannel(channel);
    };
  }, []);

  // ─── CRUD operations (all throw on failure with Hebrew messages) ────────────

  const addCustomer = useCallback(async (form: CustomerFormState): Promise<Customer> => {
    const db = getSupabase();
    if (!db) throw new Error("לא ניתן לשמור: המערכת אינה מחוברת למסד הנתונים");

    const now = new Date().toISOString();
    const newCustomer: Customer = {
      id: nanoid(),
      name: form.name,
      location: form.location ?? "",
      phone: form.phone ?? "",
      lastOrder: form.lastOrder ?? "",
      notes: form.notes,
      paymentTerms: form.paymentTerms,
      contactPerson: form.contactPerson,
      contactEmail: form.contactEmail,
      contactPhone: form.contactPhone,
      createdAt: now,
      updatedAt: now,
    };

    // Optimistic insert
    setCustomers(prev => [...prev, newCustomer].sort(sortByName));

    const { error } = await db.from("customers").insert(toRow(newCustomer));
    if (error) {
      // Rollback optimistic insert
      setCustomers(prev => prev.filter(c => c.id !== newCustomer.id));
      throw new Error(`שגיאה בשמירת הלקוח: ${error.message}`);
    }

    return newCustomer;
  }, []);

  const updateCustomer = useCallback(async (
    id: string,
    partial: Partial<Omit<Customer, "id" | "createdAt">>
  ): Promise<void> => {
    const db = getSupabase();
    if (!db) throw new Error("לא ניתן לעדכן: המערכת אינה מחוברת למסד הנתונים");

    const original = ref.current.find(c => c.id === id);
    if (!original) throw new Error("לקוח לא נמצא");

    const updated: Customer = { ...original, ...partial, updatedAt: new Date().toISOString() };

    // Optimistic update
    setCustomers(prev => prev.map(c => c.id === id ? updated : c));

    const { error } = await db.from("customers").update(toRow(updated)).eq("id", id);
    if (error) {
      // Rollback
      setCustomers(prev => prev.map(c => c.id === id ? original : c));
      throw new Error(`שגיאה בעדכון הלקוח: ${error.message}`);
    }
  }, []);

  const deleteCustomer = useCallback(async (id: string): Promise<void> => {
    const db = getSupabase();
    if (!db) throw new Error("לא ניתן למחוק: המערכת אינה מחוברת למסד הנתונים");

    const original = ref.current.find(c => c.id === id);

    // Optimistic delete
    setCustomers(prev => prev.filter(c => c.id !== id));

    const { error } = await db.from("customers").delete().eq("id", id);
    if (error) {
      // Rollback
      if (original) setCustomers(prev => [...prev, original].sort(sortByName));
      throw new Error(`שגיאה במחיקת הלקוח: ${error.message}`);
    }
  }, []);

  return (
    <CustomersContext.Provider value={{ customers, syncStatus, addCustomer, updateCustomer, deleteCustomer }}>
      {children}
    </CustomersContext.Provider>
  );
}

// ─── Consumer hook ────────────────────────────────────────────────────────────

export function useCustomersContext(): CustomersContextValue {
  const ctx = useContext(CustomersContext);
  if (!ctx) throw new Error("useCustomersContext must be used inside CustomersProvider");
  return ctx;
}
