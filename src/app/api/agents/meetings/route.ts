import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { verifyMasterAuth } from "@/lib/agents/scan-utils";
import { nanoid } from "nanoid";

export async function GET(req: NextRequest) {
  const db = getServiceSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyMasterAuth(db, token);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status") ?? "active";
  const { data, error } = await db.from("agent_meetings")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const db = getServiceSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyMasterAuth(db, token);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, topic, participatingAgents } = await req.json() as {
    title: string;
    topic?: string;
    participatingAgents?: string[];
  };

  if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });

  const meetingId = nanoid();
  const threadId = nanoid();
  const now = new Date().toISOString();
  const agents = participatingAgents ?? [];

  // Create communication thread for this meeting
  const { error: threadErr } = await db.from("communication_threads").insert({
    id: threadId,
    channel: "internal_app",
    agent_id: null,
    user_id: userId,
    title: `פגישה: ${title.trim()}`,
    related_entity_type: "agent_meeting",
    related_entity_id: meetingId,
    status: "active",
    created_at: now,
    updated_at: now,
  });
  if (threadErr) return NextResponse.json({ error: threadErr.message }, { status: 500 });

  // Create meeting record
  const { data: meeting, error: meetErr } = await db.from("agent_meetings").insert({
    id: meetingId,
    title: title.trim(),
    topic: topic?.trim() || null,
    status: "active",
    participating_agents: agents,
    thread_id: threadId,
    created_by: userId,
    created_at: now,
    updated_at: now,
  }).select().single();

  if (meetErr) return NextResponse.json({ error: meetErr.message }, { status: 500 });

  // System welcome message in the meeting thread
  const welcomeParts = [
    `📅 **פגישה: ${title.trim()}**`,
    topic ? `נושא: ${topic.trim()}` : null,
    agents.length > 0 ? `סוכנים: ${agents.length} משתתפים` : null,
    "\nשאל שאלה כדי לקבל תשובה מבוססת נתוני המערכת.",
  ].filter(Boolean).join("\n");

  await db.from("communication_messages").insert({
    id: nanoid(),
    thread_id: threadId,
    sender_type: "system",
    sender_user_id: null,
    agent_id: null,
    channel: "internal_app",
    content: welcomeParts,
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({ meeting, threadId });
}

export async function PATCH(req: NextRequest) {
  const db = getServiceSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyMasterAuth(db, token);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { meetingId, status, summary } = await req.json() as {
    meetingId: string;
    status: "completed" | "cancelled";
    summary?: string;
  };

  if (!meetingId || !status) {
    return NextResponse.json({ error: "meetingId and status required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error } = await db.from("agent_meetings").update({
    status,
    summary: summary?.trim() || null,
    updated_at: now,
  }).eq("id", meetingId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Close the associated thread too
  const { data: m } = await db.from("agent_meetings")
    .select("thread_id").eq("id", meetingId).single();
  if (m?.thread_id) {
    await db.from("communication_threads")
      .update({ status: "closed", updated_at: now })
      .eq("id", m.thread_id as string);
  }

  return NextResponse.json({ ok: true });
}
