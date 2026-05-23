import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { listPendingDrafts, promoteDraft, rejectDraft } from "@/lib/teamBot/promote";

/**
 * Office-side review of Team Bot order drafts.
 *   GET  → list pending_review drafts
 *   POST { action: 'promote' | 'reject', id } → act on a draft
 *
 * Auth: caller must present a Supabase session bearer token and be an active
 * user with create_order permission (or master). Promotion creates a real
 * work_order stamped source='telegram_bot'; the bot itself can never do this.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Caller = { name: string; role: string; is_active: boolean; action_permissions: string[] };

async function getCaller(req: NextRequest): Promise<Caller | null> {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return null;
  const admin = getServiceSupabase();
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await admin
    .from("profiles")
    .select("name, role, is_active, action_permissions")
    .eq("id", user.id)
    .single();
  return (profile as Caller) ?? null;
}

function canReview(c: Caller | null): boolean {
  if (!c || !c.is_active) return false;
  if (c.role === "master") return true;
  const perms = c.action_permissions ?? [];
  return perms.includes("*") || perms.includes("create_order");
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const caller = await getCaller(req);
  if (!canReview(caller)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const drafts = await listPendingDrafts();
  return NextResponse.json({ drafts });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const caller = await getCaller(req);
  if (!canReview(caller)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { action?: string; id?: string } | null;
  if (!body?.id || !body?.action) {
    return NextResponse.json({ error: "Missing action or id" }, { status: 400 });
  }
  const reviewer = caller!.name || "office";

  if (body.action === "promote") {
    const result = await promoteDraft(body.id, reviewer);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result);
  }
  if (body.action === "reject") {
    const result = await rejectDraft(body.id, reviewer);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
