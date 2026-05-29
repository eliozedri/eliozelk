/**
 * CEO-Agent → JARVIS status/clarification callback. When a JARVIS command's
 * status changes (needs_info / executed / failed / approved), the CEO-Agent
 * notifies JARVIS so JARVIS can DM the owner in Telegram. One signed HTTPS hop
 * to the JARVIS Core ingest endpoint; safe-off when unconfigured. Never throws.
 *
 * Env (Elkayam): JARVIS_INGEST_URL (https://<jarvis>/api/core/ingest),
 * JARVIS_CEO_CALLBACK_SECRET (shared with JARVIS). No secret is logged.
 */

export type CeoEventStatus = "needs_info" | "executed" | "failed" | "approved" | "preview_ready" | "reverted";

export interface CeoAgentEvent {
  type: "ceo_agent_event";
  correlation_id: string;
  status: CeoEventStatus;
  title?: string;
  message: string; // owner-facing Hebrew text (question or status)
  needs_answer: boolean; // true for needs_info → JARVIS waits for a Telegram reply
}

export async function notifyJarvis(event: Omit<CeoAgentEvent, "type">): Promise<{ ok: boolean; reason?: string }> {
  const url = process.env.JARVIS_INGEST_URL ?? "";
  const secret = process.env.JARVIS_CEO_CALLBACK_SECRET ?? "";
  if (!url || !secret) return { ok: false, reason: "not_configured" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ type: "ceo_agent_event", ...event }),
    });
    return res.ok ? { ok: true } : { ok: false, reason: `http_${res.status}` };
  } catch (e) {
    return { ok: false, reason: (e as Error).message.slice(0, 80) };
  }
}
