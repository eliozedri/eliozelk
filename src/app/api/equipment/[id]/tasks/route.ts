// Tasks / reminders collection — list + create.
// GET  /api/equipment/[id]/tasks
// POST /api/equipment/[id]/tasks   (manage_equipment)

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
    .from("equipment_tasks")
    .select("*")
    .eq("equipment_id", id)
    .order("due_date", { ascending: true, nullsFirst: false });
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
  const createdBy = auth.user.profile.name || auth.user.id;
  const row = {
    id: nanoid(),
    equipment_id: id,
    title: String(body.title ?? ""),
    task_type: String(body.task_type ?? ""),
    due_date: (body.due_date as string) ?? null,
    status: String(body.status ?? "pending"),
    reminder_at: (body.reminder_at as string) ?? null,
    notes: String(body.notes ?? ""),
    linked_maintenance_id: (body.linked_maintenance_id as string) ?? null,
    created_by: createdBy,
    created_at: now,
    updated_at: now,
  };

  const db = getServiceSupabase();
  const { data, error } = await db.from("equipment_tasks").insert(row).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
