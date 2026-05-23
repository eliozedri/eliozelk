import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  categoryToDepartment,
  guard,
  methodNotAllowed,
} from "../../_shared";

/**
 * GET /api/jarvis/catalog/items/:id?v=1
 *
 * Single-item lookup. Always returns 200 with an `is_active` flag so
 * JARVIS can show a friendly "פריט לא פעיל" message without having to
 * branch on HTTP status codes. The `item` field is null when the row
 * either doesn't exist OR is inactive — JARVIS treats both as
 * "unavailable" from the owner's perspective.
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
  const { data, error } = await db
    .from("catalog_items")
    .select(
      "id,name,type,category,unit_of_measure,dimension_value,dimension_unit,default_price,description,is_active",
    )
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

  if (!data) {
    return NextResponse.json({
      ok: true,
      is_active: false,
      item: null,
      responded_at: new Date().toISOString(),
    });
  }

  if (data.is_active === false) {
    return NextResponse.json({
      ok: true,
      is_active: false,
      item: null,
      responded_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    ok: true,
    is_active: true,
    item: {
      id: data.id,
      name: data.name,
      type: data.type,
      category: data.category,
      department: categoryToDepartment(String(data.category ?? "")),
      unit_of_measure: data.unit_of_measure,
      dimension_value: data.dimension_value,
      dimension_unit: data.dimension_unit,
      default_price: data.default_price,
      description: data.description,
    },
    responded_at: new Date().toISOString(),
  });
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PATCH = methodNotAllowed;
