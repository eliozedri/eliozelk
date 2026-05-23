import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { guard, methodNotAllowed } from "../catalog/_shared";
import {
  publicOrderRow,
  TERMINAL_ORDER_STATUSES,
} from "../_readback-shared";

/**
 * GET /api/jarvis/orders?v=1
 *
 * Query params:
 *   status=open    — filter to non-terminal statuses (graphics_pending,
 *                    graphics_active, graphics_done, production,
 *                    ready_installation). Without this param all
 *                    statuses are returned.
 *   q=<text>       — case-insensitive substring across order_number,
 *                    customer, city.
 *   customer=<text>— exact customer-name match.
 *   page=<n>       — default 1.
 *   limit=<n>      — default 50, capped 200.
 *
 * Read-only. Returns a thin, owner-friendly projection of work_orders.
 * No internal jsonb dump.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const g = guard(req);
  if (!g.ok) return g.response;

  const params = req.nextUrl.searchParams;
  const statusFilter = (params.get("status") ?? "").trim();
  const q = (params.get("q") ?? "").trim();
  const customer = (params.get("customer") ?? "").trim();
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(
      1,
      parseInt(params.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
    ),
  );

  const db = getServiceSupabase();
  let query = db
    .from("work_orders")
    .select(
      "id,order_number,status,priority,customer,city,order_date,updated_at",
      { count: "exact" },
    );

  if (statusFilter === "open") {
    query = query.not(
      "status",
      "in",
      `(${(TERMINAL_ORDER_STATUSES as readonly string[])
        .map((s) => `"${s}"`)
        .join(",")})`,
    );
  } else if (statusFilter.length > 0) {
    query = query.eq("status", statusFilter);
  }

  if (customer.length > 0) {
    query = query.eq("customer", customer);
  }

  if (q.length > 0) {
    // ilike across multiple text columns
    query = query.or(
      `order_number.ilike.%${q}%,customer.ilike.%${q}%,city.ilike.%${q}%`,
    );
  }

  query = query.order("updated_at", { ascending: false });
  query = query.range((page - 1) * limit, page * limit - 1);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "db_read_failed",
        message: error.message.slice(0, 200),
        responded_at: new Date().toISOString(),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    filter: {
      status: statusFilter || null,
      q: q || null,
      customer: customer || null,
    },
    orders: (data ?? []).map((row) => publicOrderRow(row as Record<string, unknown>)),
    total: count ?? (data ?? []).length,
    page,
    limit,
    responded_at: new Date().toISOString(),
  });
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PATCH = methodNotAllowed;
