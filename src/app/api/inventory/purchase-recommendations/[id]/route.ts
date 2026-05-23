import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAction } from "@/lib/auth/apiAuth";

// PATCH /api/inventory/purchase-recommendations/[id]
// Allowed actions: approve_internal | dismiss | update_quantity
// Strictly forbidden: sending external messages, creating purchase orders, modifying stock.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAction(req, "manage_catalog");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = getServiceSupabase();
  const now = new Date().toISOString();

  let body: {
    action: "approve_internal" | "dismiss" | "update_quantity";
    dismissReason?: string;
    recommendedQuantity?: number;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  // Load current recommendation
  const { data: rec, error: loadErr } = await db.from("purchase_recommendations")
    .select("id,status").eq("id", id).single();
  if (loadErr || !rec) return NextResponse.json({ error: "Recommendation not found" }, { status: 404 });

  const current = rec as { id: string; status: string };

  if (current.status === "dismissed" || current.status === "resolved") {
    return NextResponse.json({ error: `Cannot modify a ${current.status} recommendation` }, { status: 409 });
  }

  let update: Record<string, unknown> = { updated_at: now };

  if (body.action === "approve_internal") {
    // Internal approval only — no external message, no purchase order
    update = { ...update, status: "approved_internal", approved_by: auth.user.id, approved_at: now };
  } else if (body.action === "dismiss") {
    update = { ...update, status: "dismissed", dismissed_reason: body.dismissReason ?? "user_dismissed" };
  } else if (body.action === "update_quantity") {
    if (!body.recommendedQuantity || body.recommendedQuantity <= 0) {
      return NextResponse.json({ error: "recommendedQuantity must be positive" }, { status: 400 });
    }
    update = { ...update, recommended_quantity: body.recommendedQuantity };
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { error } = await db.from("purchase_recommendations").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
