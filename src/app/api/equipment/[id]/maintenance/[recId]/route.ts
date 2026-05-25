// Maintenance record item — update + delete.
// PATCH  /api/equipment/[id]/maintenance/[recId]
// DELETE /api/equipment/[id]/maintenance/[recId]

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAction } from "@/lib/auth/apiAuth";

const UPDATABLE = new Set<string>([
  "service_date", "scheduled_date", "maintenance_type", "description",
  "provider", "cost", "parts_replaced", "notes", "status", "attachments",
]);

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; recId: string }> }) {
  const auth = await requireAction(req, "manage_equipment");
  if (!auth.ok) return auth.response;
  const { recId } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (UPDATABLE.has(k)) patch[k] = v;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "אין שדות לעדכון" }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const db = getServiceSupabase();
  const { data, error } = await db
    .from("equipment_maintenance_records")
    .update(patch)
    .eq("id", recId)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; recId: string }> }) {
  const auth = await requireAction(req, "manage_equipment");
  if (!auth.ok) return auth.response;
  const { recId } = await ctx.params;

  const db = getServiceSupabase();
  const { error } = await db.from("equipment_maintenance_records").delete().eq("id", recId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
