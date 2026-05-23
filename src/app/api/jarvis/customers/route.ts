import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { guard, methodNotAllowed } from "../catalog/_shared";
import { publicCustomerRow } from "../_readback-shared";

/**
 * GET /api/jarvis/customers?v=1[&q=<text>][&limit=<n>]
 *
 * Searches by name (ilike) and merges two sources:
 *   1. public.customers rows (the proper master).
 *   2. distinct `customer` text values from work_orders that aren't
 *      yet present in customers (real catalog of who JARVIS has
 *      created orders for, used until customers gets backfilled).
 *
 * Read-only. Result rows carry `source` so the caller knows whether
 * an `id` exists or only a text label.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const g = guard(req);
  if (!g.ok) return g.response;

  const params = req.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim();
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(
      1,
      parseInt(params.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
    ),
  );

  const db = getServiceSupabase();

  // 1. Real customers table
  let customersQuery = db
    .from("customers")
    .select("id,name,location,phone,last_order");
  if (q.length > 0) {
    customersQuery = customersQuery.or(
      `name.ilike.%${q}%,location.ilike.%${q}%`,
    );
  }
  customersQuery = customersQuery.order("name", { ascending: true }).limit(limit);

  const { data: customerRows, error: customerErr } = await customersQuery;
  if (customerErr) {
    return NextResponse.json(
      {
        ok: false,
        error: "db_read_failed",
        message: customerErr.message.slice(0, 200),
        responded_at: new Date().toISOString(),
      },
      { status: 500 },
    );
  }

  const knownNames = new Set(
    (customerRows ?? []).map((r) => String(r.name ?? "").toLowerCase().trim()),
  );

  // 2. Distinct customer text values from work_orders that are NOT
  // already represented in customers. These are surfaced with
  // source='work_orders' and no real id so callers know to treat them
  // as "free text we've seen before" rather than master records.
  let workOrdersQuery = db
    .from("work_orders")
    .select("customer,city,order_date");
  if (q.length > 0) {
    workOrdersQuery = workOrdersQuery.ilike("customer", `%${q}%`);
  }
  workOrdersQuery = workOrdersQuery.order("order_date", { ascending: false }).limit(limit * 2);

  const { data: woRows, error: woErr } = await workOrdersQuery;
  if (woErr) {
    return NextResponse.json(
      {
        ok: false,
        error: "db_read_failed",
        message: woErr.message.slice(0, 200),
        responded_at: new Date().toISOString(),
      },
      { status: 500 },
    );
  }

  const seenInWO = new Map<string, { name: string; city: string; order_date: string }>();
  for (const r of woRows ?? []) {
    const name = String(r.customer ?? "").trim();
    if (name.length === 0) continue;
    const key = name.toLowerCase();
    if (knownNames.has(key)) continue;
    if (!seenInWO.has(key)) {
      seenInWO.set(key, {
        name,
        city: String(r.city ?? ""),
        order_date: String(r.order_date ?? ""),
      });
    }
  }

  const merged = [
    ...(customerRows ?? []).map((r) =>
      publicCustomerRow({ ...r, source: "customers" }),
    ),
    ...Array.from(seenInWO.entries()).map(([key, v]) =>
      publicCustomerRow({
        id: `wo:${key}`,
        name: v.name,
        location: v.city,
        phone: "",
        last_order: v.order_date,
        source: "work_orders",
      }),
    ),
  ].slice(0, limit);

  return NextResponse.json({
    ok: true,
    q: q || null,
    customers: merged,
    total: merged.length,
    responded_at: new Date().toISOString(),
  });
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PATCH = methodNotAllowed;
