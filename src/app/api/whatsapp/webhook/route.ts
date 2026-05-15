import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";

// ── Minimal WhatsApp Cloud API types ─────────────────────────────────────────

interface WaTextMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

interface WaContact {
  profile?: { name?: string };
  wa_id: string;
}

interface WaChangeValue {
  messaging_product: string;
  metadata: { display_phone_number: string; phone_number_id: string };
  contacts?: WaContact[];
  messages?: WaTextMessage[];
}

interface WaWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{ value: WaChangeValue; field: string }>;
  }>;
}

// ── GET — Meta webhook verification ──────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// ── POST — Inbound messages ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null) as WaWebhookPayload | null;
  if (!payload) return NextResponse.json({ ok: true });

  try {
    await handleInboundMessages(payload);
  } catch (err) {
    // Log error but always return 200 so Meta does not retry indefinitely
    console.error("[whatsapp] processing error:", err instanceof Error ? err.message : String(err));
  }

  return NextResponse.json({ ok: true });
}

// ── Message processor ─────────────────────────────────────────────────────────

async function handleInboundMessages(payload: WaWebhookPayload) {
  if (payload.object !== "whatsapp_business_account") return;

  const supabase = getServiceSupabase();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;

      const { contacts = [], messages = [] } = change.value;

      for (const msg of messages) {
        // Idempotency: skip if already stored
        const { data: existing } = await supabase
          .from("whatsapp_messages")
          .select("id")
          .eq("wa_message_id", msg.id)
          .maybeSingle();
        if (existing) continue;

        const contactName =
          contacts.find((c) => c.wa_id === msg.from)?.profile?.name ?? null;
        const isText = msg.type === "text";
        const body = isText ? (msg.text?.body ?? null) : null;

        await supabase.from("whatsapp_messages").insert({
          wa_message_id: msg.id,
          wa_sender_id: msg.from,
          contact_name: contactName,
          message_type: msg.type,
          body,
          timestamp_wa: parseInt(msg.timestamp, 10),
          raw_payload: payload,
        });

        console.log(
          `[whatsapp] received ${msg.type} from ${msg.from} id=${msg.id}`
        );

        if (isText) {
          await sendReply(msg.from, "Jarvis received your message ✅");
        }
      }
    }
  }
}

// ── Outbound reply ────────────────────────────────────────────────────────────

async function sendReply(to: string, text: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.error("[whatsapp] missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN");
    return;
  }

  const res = await fetch(
    `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[whatsapp] reply failed: ${res.status} — ${errText}`);
  } else {
    console.log(`[whatsapp] auto-reply sent to ${to}`);
  }
}
