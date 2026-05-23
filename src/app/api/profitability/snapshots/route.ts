import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAction } from "@/lib/auth/apiAuth";

// GET /api/profitability/snapshots?orderId=<id>  — returns one or all snapshots
export async function GET(req: NextRequest) {
  const auth = await requireAction(req, "view_accounting");
  if (!auth.ok) return auth.response;

  const db = getServiceSupabase();
  const orderId = req.nextUrl.searchParams.get("orderId");

  let query = db
    .from("profitability_snapshots")
    .select("*")
    .is("work_diary_id", null)
    .order("updated_at", { ascending: false });

  if (orderId) query = query.eq("order_id", orderId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ snapshots: data ?? [] });
}
