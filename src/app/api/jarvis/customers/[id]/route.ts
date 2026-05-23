import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { guard, methodNotAllowed } from "../../catalog/_shared";
import { publicCustomerRow, publicOrderRow } from "../../_readback-shared";

/**
 * GET /api/jarvis/customers/[id]?v=1
 *
 * Returns the customer profile + up to 10 of their most recent orders.
 *
 * `id` can be:
 *   • a real customers.id  — returns the master row
 *   • "wo:<lowercased name>" — synthetic id used by the search endpoint
 *     for owners we've only seen on work_orders. Returns a derived row
 *     plus their orders.
 *
 * Always 200 with { ok, found, customer? }.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const g = guard(req);
  if (!g.ok) return g.response;

  const { id } = await ctx.params;
  const db = getServiceSupabase();

  let derived: ReturnType<typeof publicCustomerRow> | null = null;
  let customerName: string | null = null;

  if (id.startsWith("wo:")) {
    customerName = id.slice("wo:".length);
    // Reconstruct a derived row from the most recent matching order
    const { data: lastWo } = await db
      .from("work_orders")
      .select("customer,city,order_date")
      .ilike("customer", customerName)
      .order("order_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastWo) {
      derived = publicCustomerRow({
        id,
        name: String(lastWo.customer ?? customerName),
        location: String(lastWo.city ?? ""),
        phone: "",
        last_order: String(lastWo.order_date ?? ""),
        source: "work_orders",
      });
      customerName = String(lastWo.customer ?? customerName);
    }
  } else {
    const { data, error } = await db
      .from("customers")
      .select("id,name,location,phone,last_order")
      .eq("id", id)
      .maybeSingle();
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
    if (data) {
      derived = publicCustomerRow({ ...data, source: "customers" });
      customerName = String(data.name ?? "");
    }
  }

  if (!derived || !customerName) {
    return NextResponse.json({
      ok: true,
      found: false,
      customer: null,
      orders: [],
      responded_at: new Date().toISOString(),
    });
  }

  // Recent orders for that customer
  const { data: orderRows } = await db
    .from("work_orders")
    .select(
      "id,order_number,status,priority,customer,city,order_date,updated_at",
    )
    .ilike("customer", customerName)
    .order("updated_at", { ascending: false })
    .limit(10);

  return NextResponse.json({
    ok: true,
    found: true,
    customer: derived,
    orders: (orderRows ?? []).map((r) => publicOrderRow(r as Record<string, unknown>)),
    responded_at: new Date().toISOString(),
  });
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PATCH = methodNotAllowed;
