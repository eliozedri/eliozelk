"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import type { CatalogItem, CatalogFormState, LinkedProductEntry } from "@/types/catalog";
import { getSupabase } from "@/lib/supabase/client";

const STORAGE_KEY = "elkayam_catalog";

function fromRow(r: Record<string, unknown>): CatalogItem {
  return {
    id: r.id as string,
    name: r.name as string,
    type: r.type as CatalogItem["type"],
    category: r.category as string,
    unitOfMeasure: r.unit_of_measure as string,
    dimensionValue: r.dimension_value as string | undefined,
    dimensionUnit: r.dimension_unit as string | undefined,
    defaultPrice: r.default_price != null ? Number(r.default_price) : null,
    description: r.description as string,
    isActive: r.is_active as boolean,
    hoursPerUnit: r.hours_per_unit != null ? Number(r.hours_per_unit) : undefined,
    linkedProducts: Array.isArray(r.linked_products) ? (r.linked_products as LinkedProductEntry[]) : [],
    currentQuantity: r.current_quantity != null ? Number(r.current_quantity) : 0,
    minimumQuantity: r.minimum_quantity != null ? Number(r.minimum_quantity) : 0,
    reservedQuantity: r.reserved_quantity != null ? Number(r.reserved_quantity) : 0,
    supplierId: r.supplier_id as string | undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function toRow(item: CatalogItem) {
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    category: item.category,
    unit_of_measure: item.unitOfMeasure,
    dimension_value: item.dimensionValue ?? null,
    dimension_unit: item.dimensionUnit ?? null,
    default_price: item.defaultPrice,
    description: item.description,
    is_active: item.isActive,
    hours_per_unit: item.hoursPerUnit ?? null,
    linked_products: item.linkedProducts ?? [],
    current_quantity: item.currentQuantity,
    minimum_quantity: item.minimumQuantity,
    reserved_quantity: item.reservedQuantity,
    supplier_id: item.supplierId ?? null,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

function loadLocal(): CatalogItem[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}

function saveLocal(items: CatalogItem[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* ignore */ }
}

function isNewerOrRecent(existing: string, incoming: string, toleranceMs = 5000): boolean {
  try {
    return new Date(incoming).getTime() > new Date(existing).getTime() - toleranceMs;
  } catch { return true; }
}

export function useCatalog() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const ref = useRef<CatalogItem[]>([]);

  useEffect(() => { ref.current = items; }, [items]);

  useEffect(() => {
    const db = getSupabase();
    if (!db) {
      setItems(loadLocal());
      return;
    }

    const fetchAll = () =>
      db.from("catalog_items").select("*").order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) {
            const mapped = data.map(r => fromRow(r as Record<string, unknown>));
            if (mapped.length > 0) {
              setItems(mapped);
              saveLocal(mapped);
            } else {
              const local = loadLocal();
              if (local.length > 0) {
                console.log("[catalog] migrating local cache to Supabase:", local.length, "rows");
                setItems(local);
                db.from("catalog_items").upsert(local.map(toRow), { onConflict: "id" }).then(({ error: migErr }) => {
                  if (migErr) console.error("[catalog] migration failed:", migErr.message);
                  else saveLocal(local);
                });
              }
            }
          } else {
            setItems(loadLocal());
          }
        });

    fetchAll();

    const channel = db
      .channel("catalog_items_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "catalog_items" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const incoming = fromRow(payload.new as Record<string, unknown>);
            setItems(prev => {
              if (prev.some(i => i.id === incoming.id)) return prev;
              return [incoming, ...prev];
            });
          } else if (payload.eventType === "UPDATE") {
            const incoming = fromRow(payload.new as Record<string, unknown>);
            setItems(prev => prev.map(i =>
              i.id === incoming.id && isNewerOrRecent(i.updatedAt, incoming.updatedAt) ? incoming : i
            ));
          } else if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as { id?: string }).id;
            if (deletedId) setItems(prev => prev.filter(i => i.id !== deletedId));
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          console.log("[catalog] realtime connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[catalog] realtime issue:", status, err?.message ?? "");
        }
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") fetchAll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      db.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const addItem = useCallback((form: CatalogFormState, linkedProducts?: LinkedProductEntry[]): CatalogItem => {
    const now = new Date().toISOString();
    const newItem: CatalogItem = {
      id: nanoid(),
      name: form.name.trim(),
      type: form.type,
      category: form.category.trim(),
      unitOfMeasure: form.unitOfMeasure,
      dimensionValue: form.dimensionValue || undefined,
      dimensionUnit: form.dimensionUnit || undefined,
      defaultPrice: form.defaultPrice ? parseFloat(form.defaultPrice) : null,
      description: form.description.trim(),
      isActive: true,
      linkedProducts: linkedProducts ?? [],
      currentQuantity: 0,
      minimumQuantity: 0,
      reservedQuantity: 0,
      createdAt: now,
      updatedAt: now,
    };

    setItems(prev => [newItem, ...prev]);

    const db = getSupabase();
    if (db) {
      db.from("catalog_items").insert(toRow(newItem)).then(({ error }) => {
        if (error) {
          console.error("[catalog] insert failed:", error.message);
          setItems(prev => prev.filter(i => i.id !== newItem.id));
        }
      });
    }
    return newItem;
  }, []);

  const updateItem = useCallback((id: string, partial: Partial<CatalogFormState>, linkedProducts?: LinkedProductEntry[]) => {
    const now = new Date().toISOString();
    const original = ref.current.find(i => i.id === id);
    if (!original) return;

    const updated: CatalogItem = {
      ...original,
      ...(partial.name !== undefined && { name: partial.name.trim() }),
      ...(partial.type !== undefined && { type: partial.type }),
      ...(partial.category !== undefined && { category: partial.category.trim() }),
      ...(partial.unitOfMeasure !== undefined && { unitOfMeasure: partial.unitOfMeasure }),
      ...(partial.dimensionValue !== undefined && { dimensionValue: partial.dimensionValue || undefined }),
      ...(partial.dimensionUnit !== undefined && { dimensionUnit: partial.dimensionUnit || undefined }),
      ...(partial.defaultPrice !== undefined && { defaultPrice: partial.defaultPrice ? parseFloat(partial.defaultPrice) : null }),
      ...(partial.description !== undefined && { description: partial.description.trim() }),
      ...(linkedProducts !== undefined && { linkedProducts }),
      updatedAt: now,
    };

    setItems(prev => prev.map(i => i.id === id ? updated : i));

    const db = getSupabase();
    if (db) {
      db.from("catalog_items").update(toRow(updated)).eq("id", id).then(({ error }) => {
        if (error) {
          console.error("[catalog] update failed:", error.message);
          setItems(prev => prev.map(i => i.id === id ? original : i));
        }
      });
    }
  }, []);

  const toggleActive = useCallback((id: string) => {
    const now = new Date().toISOString();
    const original = ref.current.find(i => i.id === id);
    if (!original) return;
    const updated = { ...original, isActive: !original.isActive, updatedAt: now };

    setItems(prev => prev.map(i => i.id === id ? updated : i));

    const db = getSupabase();
    if (db) {
      db.from("catalog_items").update({ is_active: updated.isActive, updated_at: now }).eq("id", id).then(({ error }) => {
        if (error) {
          console.error("[catalog] toggleActive failed:", error.message);
          setItems(prev => prev.map(i => i.id === id ? original : i));
        }
      });
    }
  }, []);

  const deleteItem = useCallback((id: string) => {
    const original = ref.current.find(i => i.id === id);
    const remaining = ref.current.filter(i => i.id !== id);
    setItems(remaining);
    saveLocal(remaining);
    const db = getSupabase();
    if (db) {
      db.from("catalog_items").delete().eq("id", id).then(({ error }) => {
        if (error) {
          console.error("[catalog] delete failed:", error.message);
          if (original) setItems(prev => [original, ...prev]);
        }
      });
    }
  }, []);

  // Adjust stock quantity and write an audited movement record.
  // delta > 0 = stock added; delta < 0 = stock removed.
  const adjustStock = useCallback(async (
    itemId: string,
    delta: number,
    movementType: "receive" | "consume" | "adjustment" | "correction" | "return",
    notes: string,
    createdBy: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    const db = getSupabase();
    if (!db) return { ok: false, error: "לא מחובר לבסיס הנתונים" };

    const item = ref.current.find(i => i.id === itemId);
    if (!item) return { ok: false, error: "פריט לא נמצא" };

    const newQty = item.currentQuantity + delta;
    const now = new Date().toISOString();

    // Optimistic update
    setItems(prev => prev.map(i =>
      i.id === itemId ? { ...i, currentQuantity: newQty, updatedAt: now } : i
    ));

    const [moveRes, updateRes] = await Promise.all([
      db.from("inventory_movements").insert({
        item_id: itemId,
        movement_type: movementType,
        quantity: delta,
        source_type: movementType === "correction" ? "correction" : "manual_count",
        notes,
        created_by: createdBy,
        created_at: now,
      }),
      db.from("catalog_items").update({ current_quantity: newQty, updated_at: now }).eq("id", itemId),
    ]);

    if (moveRes.error || updateRes.error) {
      // Rollback
      setItems(prev => prev.map(i => i.id === itemId ? item : i));
      return { ok: false, error: moveRes.error?.message ?? updateRes.error?.message };
    }
    return { ok: true };
  }, []);

  // Update stock thresholds (minimum_quantity) without recording a movement.
  const updateStockConfig = useCallback((
    itemId: string,
    minimumQuantity: number,
    supplierId?: string | null,
  ) => {
    const now = new Date().toISOString();
    const original = ref.current.find(i => i.id === itemId);
    if (!original) return;

    const updated = { ...original, minimumQuantity, supplierId: supplierId ?? undefined, updatedAt: now };
    setItems(prev => prev.map(i => i.id === itemId ? updated : i));

    const db = getSupabase();
    if (db) {
      db.from("catalog_items")
        .update({ minimum_quantity: minimumQuantity, supplier_id: supplierId ?? null, updated_at: now })
        .eq("id", itemId)
        .then(({ error }) => {
          if (error) {
            console.error("[catalog] updateStockConfig failed:", error.message);
            setItems(prev => prev.map(i => i.id === itemId ? original : i));
          }
        });
    }
  }, []);

  return { items, addItem, updateItem, toggleActive, deleteItem, adjustStock, updateStockConfig };
}
