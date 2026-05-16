import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { returnFromField } from "@/lib/inventory/returnFromField";

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const admin = getServiceSupabase();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

export async function POST(req: NextRequest) {
  const db = getServiceSupabase();

  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  const { data: profile } = await db.from("profiles").select("name").eq("id", userId).single();
  const returnedBy = (profile as { name?: string } | null)?.name ?? userId;

  const result = await returnFromField(db, {
    orderId, catalogItemId, orderItemKey, returnedQty, notes, returnedBy,
  });

  if (result.errors.length > 0) {
    return NextResponse.json({ error: result.errors[0], details: result }, { status: 500 });
  }

  return NextResponse.json(result);
}
