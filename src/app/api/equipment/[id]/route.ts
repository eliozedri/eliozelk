// Equipment item route — read, update, soft-delete.
// GET    /api/equipment/[id]   → single row (authenticated)
// PATCH  /api/equipment/[id]   → update whitelisted fields (manage_equipment)
// DELETE /api/equipment/[id]   → soft delete (is_active=false) (manage_equipment)

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAuth, requireAction } from "@/lib/auth/apiAuth";

// Fields a client is allowed to update.
const UPDATABLE = new Set<string>([
  "display_name", "category_key", "equipment_type", "manufacturer", "model", "year",
  "license_number", "serial_number", "chassis_number", "engine_number",
  "status", "identification_confidence", "technical_specs", "notes",
  "photos", "documents",
  "last_maintenance_date", "next_maintenance_date", "next_inspection_date", "next_insurance_date",
  "out_of_service_reason", "current_location", "business_use", "license_expiry_date", "mileage",
]);

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const db = getServiceSupabase();
  const { data, error } = await db.from("equipment").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAction(req, "manage_equipment");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

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
  const { data, error } = await db.from("equipment").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAction(req, "manage_equipment");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const db = getServiceSupabase();
  const { error } = await db
    .from("equipment")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
