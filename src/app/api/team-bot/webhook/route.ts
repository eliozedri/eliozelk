import { NextRequest, NextResponse } from "next/server";
import { isConfigured, webhookSecret } from "@/lib/teamBot/telegram";
import { handleUpdate } from "@/lib/teamBot/router";
import { markUpdateSeen } from "@/lib/teamBot/auth";
import type { TgUpdate } from "@/lib/teamBot/types";

/**
 * POST /api/team-bot/webhook — Telegram update sink for the Elkayam Team Bot.
 *
 * Security:
 *   • Returns 503 until TEAM_BOT_TELEGRAM_TOKEN is configured.
 *   • Verifies Telegram's secret_token via the X-Telegram-Bot-Api-Secret-Token
 *     header (set at setWebhook time). Mismatch → 401, no processing.
 *   • Authorization is default-deny inside handleUpdate — no menu/catalog/order
 *     data reaches a user who is not 'active'.
 *
 * Always returns 200 on accepted updates so Telegram does not retry-storm;
 * duplicate deliveries are de-duped by update_id.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const expectedSecret = webhookSecret();
  const provided = req.headers.get("x-telegram-bot-api-secret-token");
  if (!expectedSecret || provided !== expectedSecret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let update: TgUpdate | null = null;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: true }); // ignore malformed bodies
  }
  if (!update || typeof update.update_id !== "number") {
    return NextResponse.json({ ok: true });
  }

  // Idempotency: ignore Telegram retries of an already-seen update.
  const fromId =
    update.message?.from?.id ?? update.callback_query?.from?.id ?? null;
  const isNew = await markUpdateSeen(update.update_id, fromId != null ? String(fromId) : null);
  if (!isNew) return NextResponse.json({ ok: true });

  try {
    await handleUpdate(update);
  } catch (err) {
    console.error("[team-bot] handleUpdate error:", err instanceof Error ? err.message : String(err));
  }

  return NextResponse.json({ ok: true });
}

// Telegram only POSTs. Everything else is a no-op 405.
export function GET(): NextResponse {
  return NextResponse.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
}
export const PUT = GET;
export const DELETE = GET;
export const PATCH = GET;
