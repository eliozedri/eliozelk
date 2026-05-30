import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { verifyMasterAuth } from "@/lib/agents/scan-utils";
import { llmDiagnostics } from "@/lib/jarvis/llm/index";

export const dynamic = "force-dynamic";

/**
 * Owner-only LLM runtime status (no secrets). Lets the owner verify, live, that
 * the agent-chat reasoning mechanism is actually on: whether the router is
 * enabled, the provider priority (gemini→groq first), the daily budget state,
 * and each provider's presence/health. Returns NO API keys — only presence +
 * health, via llmDiagnostics(). Read-only; no business data.
 */
export async function GET(req: NextRequest) {
  const db = getServiceSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = await verifyMasterAuth(db, token);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const diag = await llmDiagnostics();
    return NextResponse.json({
      ok: true,
      agent_chat_reasoning: diag.enabled ? "live" : "disabled",
      ...diag,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
