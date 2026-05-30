import { NextResponse, type NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/apiAuth";

// Read-only aggregate of the JARVIS → CEO-Agent review queue
// (jarvis_ceo_agent_commands). Powers the Command Center "open requests" KPI and
// risk pulse. Authenticated-only — internal operational metadata, never public.
// No mutation, no business logic; pure COUNT-style read.

export const dynamic = "force-dynamic";

// Terminal statuses — a request in any of these no longer needs attention.
const TERMINAL = new Set([
  "executed",
  "failed",
  "reverted",
  "rejected",
  "archived",
  "execution_disabled",
  "executed_later",
]);

const PROD_ORIGIN = "https://eliozelk.vercel.app";
function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  if (origin === PROD_ORIGIN) return { "Access-Control-Allow-Origin": origin };
  if (process.env.NODE_ENV !== "production" && origin.startsWith("http://localhost:")) {
    return { "Access-Control-Allow-Origin": origin };
  }
  return {};
}

export async function OPTIONS(request: NextRequest) {
  const cors = corsHeaders(request.headers.get("origin"));
  return new NextResponse(null, {
    status: 204,
    headers: { ...cors, "Access-Control-Allow-Methods": "GET", "Access-Control-Allow-Headers": "Content-Type" },
  });
}

export interface JarvisRequestsSummary {
  /** Non-terminal requests still in the workflow. */
  open: number;
  /** Waiting on an owner decision (pending_review). */
  awaitingOwner: number;
  /** CEO-Agent asked the owner for clarification (needs_info). */
  awaitingClarification: number;
  /** Approved / previewed / second-approved — in the execution pipeline. */
  inExecution: number;
  /** Full status → count breakdown for transparency. */
  byStatus: Record<string, number>;
}

export async function GET(request: NextRequest) {
  const cors = corsHeaders(request.headers.get("origin"));
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  try {
    const db = getServiceSupabase();
    const { data, error } = await db
      .from("jarvis_ceo_agent_commands")
      .select("status")
      .limit(2000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors });

    const byStatus: Record<string, number> = {};
    for (const row of data ?? []) {
      const s = (row.status as string) ?? "unknown";
      byStatus[s] = (byStatus[s] ?? 0) + 1;
    }

    const open = Object.entries(byStatus)
      .filter(([s]) => !TERMINAL.has(s))
      .reduce((n, [, c]) => n + c, 0);

    const summary: JarvisRequestsSummary = {
      open,
      awaitingOwner: byStatus["pending_review"] ?? 0,
      awaitingClarification: byStatus["needs_info"] ?? 0,
      inExecution:
        (byStatus["approved"] ?? 0) +
        (byStatus["preview_ready"] ?? 0) +
        (byStatus["execution_approved"] ?? 0),
      byStatus,
    };

    return NextResponse.json(summary, { headers: { ...cors, "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500, headers: cors });
  }
}
