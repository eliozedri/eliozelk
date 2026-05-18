import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { verifyMasterAuth } from "@/lib/agents/scan-utils";
import { runChatEngine, type PageContext, type HistoryTurn } from "@/lib/agents/chat-engine";
import { nanoid } from "nanoid";

export async function GET(req: NextRequest) {
  const db = getServiceSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyMasterAuth(db, token);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const threadId = req.nextUrl.searchParams.get("threadId");
  if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 });

  // Verify thread ownership
  const { data: thread } = await db.from("communication_threads")
    .select("id,user_id,agent_id")
    .eq("id", threadId)
    .single();
  if (!thread || (thread.user_id as string) !== userId) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const { data, error } = await db.from("communication_messages")
    .select("id,thread_id,sender_type,sender_user_id,agent_id,channel,content,source_references,created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const db = getServiceSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyMasterAuth(db, token);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId, content, pageContext } = await req.json() as {
    threadId: string;
    content: string;
    pageContext?: PageContext | null;
  };
  if (!threadId || !content?.trim()) {
    return NextResponse.json({ error: "threadId and content required" }, { status: 400 });
  }

  // Verify thread ownership and get agent context
  const { data: thread } = await db.from("communication_threads")
    .select("id,user_id,agent_id")
    .eq("id", threadId)
    .single();
  if (!thread || (thread.user_id as string) !== userId) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const agentId = thread.agent_id as string | null;

  // Load last 6 messages for follow-up context (3 pairs)
  const { data: historyRows } = await db
    .from("communication_messages")
    .select("sender_type,content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(6);
  const history: HistoryTurn[] = (historyRows ?? [])
    .reverse()
    .map(m => ({
      role: (m.sender_type as string) === "user" ? "user" : "agent" as const,
      content: m.content as string,
    }));

  const userMsgId = nanoid();
  const now = new Date().toISOString();

  // 1. Persist user message
  const { error: userMsgErr } = await db.from("communication_messages").insert({
    id: userMsgId,
    thread_id: threadId,
    sender_type: "user",
    sender_user_id: userId,
    agent_id: null,
    channel: "internal_app",
    content: content.trim(),
    created_at: now,
  });
  if (userMsgErr) return NextResponse.json({ error: userMsgErr.message }, { status: 500 });

  // 2. Run chat engine against live data
  const engineResult = await runChatEngine(
    db,
    { agentId, userId },
    content.trim(),
    { pageContext: pageContext ?? null, history },
  );

  // 3. Persist agent response
  const agentMsgId = nanoid();
  const responseAgentId = agentId ?? "ops-orchestrator";
  const agentNow = new Date().toISOString();

  const { error: agentMsgErr } = await db.from("communication_messages").insert({
    id: agentMsgId,
    thread_id: threadId,
    sender_type: "agent",
    sender_user_id: null,
    agent_id: responseAgentId,
    channel: "internal_app",
    content: engineResult.content,
    structured_payload: null,
    source_references: engineResult.sourceRefs.length > 0 ? engineResult.sourceRefs : null,
    created_at: agentNow,
  });
  if (agentMsgErr) return NextResponse.json({ error: agentMsgErr.message }, { status: 500 });

  // 4. Touch thread updated_at
  await db.from("communication_threads")
    .update({ updated_at: agentNow })
    .eq("id", threadId);

  return NextResponse.json({
    userMessage: {
      id: userMsgId, thread_id: threadId, sender_type: "user", sender_user_id: userId,
      agent_id: null, channel: "internal_app", content: content.trim(),
      structured_payload: null, source_references: null, created_at: now,
    },
    agentMessage: {
      id: agentMsgId, thread_id: threadId, sender_type: "agent", sender_user_id: null,
      agent_id: responseAgentId, channel: "internal_app", content: engineResult.content,
      structured_payload: null,
      source_references: engineResult.sourceRefs.length > 0 ? engineResult.sourceRefs : null,
      created_at: agentNow,
    },
  });
}
