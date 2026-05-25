import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServiceSupabase } from "@/lib/supabase/server";

/**
 * POST /api/orders-intake/web
 *
 * Server-to-server receiver for the EXTERNAL, customer-facing order-request form
 * (hosted by JARVIS). JARVIS validates the public form (its own share token), then
 * forwards the submission here with a shared bearer secret.
 *
 * This endpoint NEVER creates a work_order. It lands the submission as a PENDING
 * team-bot-style draft ("בקשת הזמנה — ממתינה לאישור") for staff review on
 * /team-bot-orders, and fires only a LIGHT notification to master + the office review
 * role (event 'external.order_request') — never department routing/ack/push. The normal
 * order.created flow runs only when staff PROMOTE the draft into a real order.
 *
 * Auth: Authorization: Bearer <EXTERNAL_INTAKE_TOKEN>. If the env var is unset the
 * route is dormant (503) and never publicly usable; a wrong/missing bearer is 401.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Best-effort, per-instance soft rate limit (the bearer secret is the real gate).
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits: number[] = [];

interface IncomingItem {
  name?: unknown;
  quantity?: unknown;
  unit?: unknown;
  notes?: unknown;
}
interface IncomingBody {
  customer_name?: unknown;
  contact_person?: unknown;
  phone?: unknown;
  city?: unknown;
  notes?: unknown;
  items?: unknown;
  external_ref?: unknown;
  source?: unknown;
}

// The sender declares the origin so the review queue can label it. Anything outside the
// known set falls back to the public-form default. Either way it lands as a PENDING
// request — the label never changes the no-auto-work_order / approval-gated behavior.
const ALLOWED_SOURCES = ["external_web_form", "jarvis_admin", "jarvis_bot"] as const;
function normalizeSource(v: unknown): string {
  return typeof v === "string" && (ALLOWED_SOURCES as readonly string[]).includes(v) ? v : "external_web_form";
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function mapItems(raw: unknown): { name: string; quantity: number; unit: string | null; notes: string | null }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 100)
    .map((it) => {
      const o = (it ?? {}) as IncomingItem;
      const name = str(o.name, 200);
      if (!name) return null;
      const qn = typeof o.quantity === "number" ? o.quantity : Number(o.quantity);
      const quantity = Number.isFinite(qn) && qn > 0 ? qn : 1;
      return { name, quantity, unit: str(o.unit, 40), notes: str(o.notes, 500) };
    })
    .filter((x): x is { name: string; quantity: number; unit: string | null; notes: string | null } => x !== null);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.EXTERNAL_INTAKE_TOKEN;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "intake disabled (not configured)" }, { status: 503 });
  }
  const provided = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Soft rate limit.
  const now = Date.now();
  while (hits.length && now - hits[0] > WINDOW_MS) hits.shift();
  if (hits.length >= MAX_PER_WINDOW) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  hits.push(now);

  let body: IncomingBody;
  try {
    body = (await req.json()) as IncomingBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const customerName = str(body.customer_name, 200);
  const contactPerson = str(body.contact_person, 120);
  const phone = str(body.phone, 40);
  const city = str(body.city, 120);
  const notes = str(body.notes, 4000);
  const items = mapItems(body.items);
  const externalRef = str(body.external_ref, 200);
  const source = normalizeSource(body.source);

  // Require some real content so we don't store empty noise.
  if (!customerName && !notes && items.length === 0) {
    return NextResponse.json({ error: "empty submission" }, { status: 400 });
  }

  const db = getServiceSupabase();

  // Idempotency: a retried forward with the same external_ref returns the existing draft.
  if (externalRef) {
    const { data: existing } = await db
      .from("team_bot_order_drafts")
      .select("id")
      .eq("external_ref", externalRef)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: true, id: existing.id, status: "pending_review", duplicate: true });
    }
  }

  const id = randomUUID();
  const { error: insErr } = await db.from("team_bot_order_drafts").insert({
    id,
    telegram_user_id: null,
    submitted_by_name: customerName ?? contactPerson ?? "טופס חיצוני",
    source,
    intake_channel: source,
    status: "pending_review",
    customer: customerName,
    contact_person: contactPerson,
    customer_phone: phone,
    city,
    notes,
    cart: items,
    external_ref: externalRef,
  });
  if (insErr) {
    // Unique-violation on external_ref = a concurrent duplicate; treat as success.
    if ((insErr as { code?: string }).code === "23505" && externalRef) {
      return NextResponse.json({ ok: true, status: "pending_review", duplicate: true });
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Light review notification → master + office_manager only (rule recipients). Never
  // department routing. Best-effort: a notification failure must not lose the request.
  try {
    await db.rpc("fn_emit_notification", {
      p_event_type: "external.order_request",
      p_entity_type: null,
      p_entity_id: null,
      p_created_by: null,
      p_metadata: {
        draft_id: id,
        customer: customerName,
        city,
        item_count: items.length,
        source,
      },
    });
  } catch (err) {
    console.error("[orders-intake/web] notification emit failed:", (err as Error).message);
  }

  return NextResponse.json({ ok: true, id, status: "pending_review" }, { status: 201 });
}
