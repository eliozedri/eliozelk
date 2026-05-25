// Incidents collection — list + create.
// GET  /api/equipment/[id]/incidents
// POST /api/equipment/[id]/incidents   (manage_equipment)

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAuth, requireAction } from "@/lib/auth/apiAuth";
import { nanoid } from "nanoid";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const db = getServiceSupabase();
  const { data, error } = await db
    .from("equipment_incidents")
    .select("*")
    .eq("equipment_id", id)
    .order("opened_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAction(req, "manage_equipment");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const reportedBy = String(body.reported_by ?? "") || auth.user.profile.name || auth.user.id;
  const row = {
    id: nanoid(),
    equipment_id: id,
    opened_at: (body.opened_at as string) ?? new Date().toISOString().slice(0, 10),
    incident_type: String(body.incident_type ?? "fault"),
    severity: String(body.severity ?? "medium"),
    description: String(body.description ?? ""),
    status: String(body.status ?? "open"),
    reported_by: reportedBy,
    required_action: String(body.required_action ?? ""),
    due_date: (body.due_date as string) ?? null,
    resolution: String(body.resolution ?? ""),
    cost: (body.cost as number) ?? null,
    photos: Array.isArray(body.photos) ? body.photos : [],
    attachments: Array.isArray(body.attachments) ? body.attachments : [],
    created_at: now,
    updated_at: now,
  };

  const db = getServiceSupabase();
  const { data, error } = await db.from("equipment_incidents").insert(row).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
