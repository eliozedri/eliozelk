import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { guard, methodNotAllowed } from "../../catalog/_shared";
import { publicOrderDetail } from "../../_readback-shared";

/**
 * GET /api/jarvis/orders/[id]?v=1
 *
 * Returns the public detail shape for a single order. Always 200 with
 * `{ ok, found: bool, order?: ... }` so the caller doesn't branch on
 * HTTP status.
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

  // Try by primary key first, then by order_number (the friendlier
  // owner-visible id).
  let { data, error } = await db
    .from("work_orders")
    .select(
      "id,order_number,status,priority,customer,city,order_date,updated_at,data",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data && !error) {
    const byNumber = await db
      .from("work_orders")
      .select(
        "id,order_number,status,priority,customer,city,order_date,updated_at,data",
      )
      .eq("order_number", id)
      .maybeSingle();
    data = byNumber.data;
    error = byNumber.error;
  }

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

  if (!data) {
    return NextResponse.json({
      ok: true,
      found: false,
      order: null,
      responded_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    ok: true,
    found: true,
    order: publicOrderDetail(data as Record<string, unknown>),
    responded_at: new Date().toISOString(),
  });
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PATCH = methodNotAllowed;
