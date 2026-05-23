import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAuth, requireAction } from "@/lib/auth/apiAuth";

// GET /api/inventory/purchase-recommendations — list active recommendations
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status") ?? "active"; // "active" = non-resolved/dismissed
  const db = getServiceSupabase();

  let query = db.from("purchase_recommendations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (statusFilter === "active") {
    query = query.not("status", "in", '("dismissed","resolved","converted_to_order_later")');
  } else {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/inventory/purchase-recommendations — create manual recommendation
export async function POST(req: NextRequest) {
  const auth = await requireAction(req, "manage_catalog");
  if (!auth.ok) return auth.response;

  const db = getServiceSupabase();
  let body: {
    itemId: string;
    supplierId?: string;
    recommendedQuantity: number;
    reason?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  if (!body.itemId || !body.recommendedQuantity) {
    return NextResponse.json({ error: "itemId and recommendedQuantity required" }, { status: 400 });
  }

  const { data: catRow } = await db.from("catalog_items")
    .select("current_quantity,reserved_quantity,minimum_quantity,supplier_id")
    .eq("id", body.itemId).single();
  if (!catRow) return NextResponse.json({ error: "catalog item not found" }, { status: 404 });

  const c = catRow as { current_quantity: number; reserved_quantity: number; minimum_quantity: number; supplier_id: string | null };
  const now = new Date().toISOString();

  const { data, error } = await db.from("purchase_recommendations").insert({
    item_id:              body.itemId,
    supplier_id:          body.supplierId ?? c.supplier_id,
    recommendation_type:  "manual",
    current_quantity:     c.current_quantity,
    reserved_quantity:    c.reserved_quantity,
    available_quantity:   c.current_quantity - c.reserved_quantity,
    minimum_quantity:     c.minimum_quantity,
    recommended_quantity: body.recommendedQuantity,
    urgency:              "medium",
    status:               "draft",
    reason:               body.reason ?? "המלצה ידנית",
    source_type:          "manual",
    created_by:           auth.user.id,
    created_at:           now,
    updated_at:           now,
  }).select("id").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: (data as { id: string }).id }, { status: 201 });
}
