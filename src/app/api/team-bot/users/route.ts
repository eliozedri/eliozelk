import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  approveUser,
  deactivateUser,
  getUserChatId,
  listUsersByStatus,
  rejectUser,
} from "@/lib/teamBot/auth";
import { sendMessage } from "@/lib/teamBot/telegram";
import { ROLE_LABELS } from "@/lib/teamBot/messages";
import type { TeamBotStatus } from "@/lib/teamBot/types";

/**
 * Web management/audit view for Team Bot access requests. The DB is the
 * source of truth; Telegram is the fast approval interface, this is the
 * management one. Gated to master or users with the manage_access permission.
 *
 *   GET  [?status=pending|approved|rejected|inactive] → list
 *   POST { action: 'approve'|'reject'|'deactivate'|'reactivate', id }
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

function canManage(c: Caller | null): boolean {
  if (!c || !c.is_active) return false;
  if (c.role === "master") return true;
  const perms = c.action_permissions ?? [];
  return perms.includes("*") || perms.includes("manage_access");
}

const VALID_STATUS: TeamBotStatus[] = ["pending", "approved", "rejected", "inactive"];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const caller = await getCaller(req);
  if (!canManage(caller)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const statusParam = req.nextUrl.searchParams.get("status");
  const status = VALID_STATUS.includes(statusParam as TeamBotStatus)
    ? (statusParam as TeamBotStatus)
    : undefined;
  const users = await listUsersByStatus(status);
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const caller = await getCaller(req);
  if (!canManage(caller)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { action?: string; id?: string } | null;
  if (!body?.id || !body?.action) {
    return NextResponse.json({ error: "Missing action or id" }, { status: 400 });
  }
  const reviewer = `web:${caller!.name || "admin"}`;
  const id = body.id;

  switch (body.action) {
    case "approve":
    case "reactivate":
      await approveUser(id, reviewer, "authorized_user");
      await notifyApproved(id).catch(() => {});
      return NextResponse.json({ ok: true });
    case "reject":
      await rejectUser(id, reviewer);
      return NextResponse.json({ ok: true });
    case "deactivate":
      await deactivateUser(id, reviewer);
      return NextResponse.json({ ok: true });
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}

async function notifyApproved(telegramUserId: string): Promise<void> {
  const chatId = (await getUserChatId(telegramUserId)) ?? telegramUserId;
  await sendMessage(
    chatId,
    `✅ קיבלת גישה לבוט הצוות של אלקיים כ־${ROLE_LABELS.authorized_user}.\nשלח /start כדי להתחיל.`,
  );
}
