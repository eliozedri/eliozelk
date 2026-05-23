import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  DEPARTMENTS,
  categoryToDepartment,
  type DepartmentSlug,
} from "@/lib/catalog/departments";

/**
 * Active-catalog reads for the Team Bot. is_active=true is enforced on every
 * query: inactive / archived / disabled items NEVER appear and can never be
 * added to a cart. validateActiveIds() re-checks at submit time so an item
 * that went inactive mid-session is caught.
 *
 * Department is a derived grouping over the raw Hebrew `category` strings, so
 * filtering happens in JS via categoryToDepartment (mirrors the JARVIS catalog
 * route). The active catalog is small (~100-250 rows) so this is comfortable.
 */

export type CatalogItem = {
  id: string;
  name: string;
  type: string | null;
  category: string | null;
  department: DepartmentSlug;
  unit_of_measure: string | null;
  default_price: number | null;
};

const ITEM_COLUMNS = "id,name,type,category,unit_of_measure,default_price,is_active";

export type DeptCount = { slug: DepartmentSlug; label: string; emoji: string; count: number };

export async function listDepartments(): Promise<DeptCount[]> {
  const db = getServiceSupabase();
  const { data } = await db.from("catalog_items").select("category").eq("is_active", true);
  const counts: Partial<Record<DepartmentSlug, number>> = {};
  for (const row of data ?? []) {
    const slug = categoryToDepartment(String(row.category ?? ""));
    counts[slug] = (counts[slug] ?? 0) + 1;
  }
  return DEPARTMENTS.map((d) => ({
    slug: d.slug,
    label: d.label,
    emoji: d.emoji,
    count: counts[d.slug] ?? 0,
  }));
}

function toItem(r: Record<string, unknown>): CatalogItem {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    type: (r.type as string) ?? null,
    category: (r.category as string) ?? null,
    department: categoryToDepartment(String(r.category ?? "")),
    unit_of_measure: (r.unit_of_measure as string) ?? null,
    default_price: (r.default_price as number) ?? null,
  };
}

export type ItemsPage = { items: CatalogItem[]; total: number; page: number; pageSize: number };

export async function listItems(
  department: DepartmentSlug,
  page: number,
  pageSize = 8,
): Promise<ItemsPage> {
  const db = getServiceSupabase();
  const { data } = await db
    .from("catalog_items")
    .select(ITEM_COLUMNS)
    .eq("is_active", true)
    .order("name", { ascending: true });

  const all = (data ?? [])
    .map((r) => toItem(r as Record<string, unknown>))
    .filter((it) => it.department === department);

  const total = all.length;
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize;
  return { items: all.slice(start, start + pageSize), total, page: safePage, pageSize };
}

export async function getItem(id: string): Promise<CatalogItem | null> {
  const db = getServiceSupabase();
  const { data } = await db
    .from("catalog_items")
    .select(ITEM_COLUMNS)
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  return data ? toItem(data as Record<string, unknown>) : null;
}

/** Return the subset of the given ids that are STILL active. */
export async function activeIdSet(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const db = getServiceSupabase();
  const { data } = await db
    .from("catalog_items")
    .select("id")
    .eq("is_active", true)
    .in("id", ids);
  return new Set((data ?? []).map((r) => String(r.id)));
}
