import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { verifyMasterAuth } from "@/lib/agents/scan-utils";
import { nanoid } from "nanoid";

export async function GET(req: NextRequest) {
  const db = getServiceSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyMasterAuth(db, token);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const agentId = req.nextUrl.searchParams.get("agentId");

  let q = db.from("communication_threads")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(20);

  if (agentId) {
    q = q.eq("agent_id", agentId);
  } else {
    q = q.is("agent_id", null);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function DELETE(req: NextRequest) {
  const db = getServiceSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyMasterAuth(db, token);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await req.json() as { threadId?: string };
  if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 });

  // Verify ownership before deleting
  const { data: thread } = await db.from("communication_threads")
    .select("id, user_id")
    .eq("id", threadId)
    .single();
  if (!thread || (thread.user_id as string) !== userId) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Hard delete — messages + suggested_actions cascade automatically
  const { error } = await db.from("communication_threads").delete().eq("id", threadId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return new NextResponse(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  const db = getServiceSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyMasterAuth(db, token);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { agentId?: string | null; title?: string };
  const id = nanoid();
  const now = new Date().toISOString();

  const defaultTitle = body.agentId ? "שיחה עם הסוכן" : "שיחה עם מרכז הפיקוד";

  const { data, error } = await db.from("communication_threads").insert({
    id,
    channel: "internal_app",
    agent_id: body.agentId ?? null,
    user_id: userId,
    title: body.title ?? defaultTitle,
    status: "active",
    created_at: now,
    updated_at: now,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
