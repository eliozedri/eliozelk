import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAction } from "@/lib/auth/apiAuth";
import { returnFromField } from "@/lib/inventory/returnFromField";

export async function POST(req: NextRequest) {
  const auth = await requireAction(req, "manage_catalog");
  if (!auth.ok) return auth.response;

  const db = getServiceSupabase();

  let orderId: string, catalogItemId: string, orderItemKey: string, returnedQty: number, notes: string;
  try {
    const body = await req.json() as {
      orderId?: string;
      catalogItemId?: string;
      orderItemKey?: string;
      returnedQty?: number;
      notes?: string;
    };
    orderId       = body.orderId ?? "";
    catalogItemId = body.catalogItemId ?? "";
    orderItemKey  = body.orderItemKey ?? "";
    returnedQty   = Number(body.returnedQty ?? 0);
    notes         = body.notes ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!orderId || !catalogItemId || !orderItemKey) {
    return NextResponse.json({ error: "orderId, catalogItemId and orderItemKey are required" }, { status: 400 });
  }
  if (returnedQty <= 0) {
    return NextResponse.json({ error: "returnedQty must be positive" }, { status: 400 });
  }

  // Get user display name for audit
  const { data: profile } = await db.from("profiles").select("name").eq("id", auth.user.id).single();
  const returnedBy = (profile as { name?: string } | null)?.name ?? auth.user.id;

  const result = await returnFromField(db, {
    orderId, catalogItemId, orderItemKey, returnedQty, notes, returnedBy,
  });

  if (result.errors.length > 0) {
    return NextResponse.json({ error: result.errors[0], details: result }, { status: 500 });
  }

  return NextResponse.json(result);
}
