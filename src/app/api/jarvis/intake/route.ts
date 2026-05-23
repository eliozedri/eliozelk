import { NextRequest, NextResponse } from "next/server";
import {
  parseJarvisIntakeRequest,
  type JarvisIntakeResponse,
} from "./intake-contract";

/**
 * POST /api/jarvis/intake?v=1
 *
 * The single server-to-server seam between JARVIS and Elkayam.
 * Phase 2.0g: dry-run only. Authenticates the caller using a shared
 * bearer secret, validates the body shape, and returns a structured
 * Operations Manager response WITHOUT touching the Elkayam business
 * tables.
 *
 * Hard guarantees in this phase:
 *   • No agent_tasks insert.
 *   • No work_orders insert/update.
 *   • No work logs / billing / schedules / inventory / equipment writes.
 *   • No customers writes.
 *   • No agent_action_logs writes (skipped in 2.0g — keeps the route
 *     pure validation until JARVIS_INTAKE_LIVE is intentionally
 *     flipped in a later phase).
 *
 * Env contract (all optional except the token if you want it to work):
 *   JARVIS_INTAKE_TOKEN   shared bearer; same value JARVIS uses as
 *                         ELKAYAM_INTAKE_TOKEN. If unset, the route
 *                         returns 503 (not configured).
 *   JARVIS_INTAKE_LIVE    "true" to honour dry_run=false. Default
 *                         "false" forces dry-run regardless of body.
 *                         Phase 2.0g leaves this unset.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const respondedAt = new Date().toISOString();

  // ── Version gate ────────────────────────────────────────────────────────
  const v = req.nextUrl.searchParams.get("v");
  if (v !== "1") {
    return jsonResponse(
      400,
      buildFailureResponse({
        request_id: extractRequestId(req) ?? "",
        respondedAt,
        message: `Unsupported or missing ?v= query (expected 1, got ${JSON.stringify(v)})`,
        safetyNotes: ["version_mismatch"],
      }),
    );
  }

  // ── Auth ────────────────────────────────────────────────────────────────
  const expectedToken = process.env.JARVIS_INTAKE_TOKEN ?? "";
  if (!expectedToken) {
    return jsonResponse(
      503,
      buildFailureResponse({
        request_id: extractRequestId(req) ?? "",
        respondedAt,
        message: "Elkayam intake not configured (JARVIS_INTAKE_TOKEN missing)",
        safetyNotes: ["endpoint_not_configured"],
      }),
    );
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  if (!provided || !constantTimeEqual(provided, expectedToken)) {
    return jsonResponse(
      401,
      buildFailureResponse({
        request_id: extractRequestId(req) ?? "",
        respondedAt,
        message: "Missing or invalid bearer token",
        safetyNotes: ["unauthorized"],
      }),
    );
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return jsonResponse(
      400,
      buildFailureResponse({
        request_id: "",
        respondedAt,
        message: "Body is not valid JSON",
        safetyNotes: ["invalid_json"],
      }),
    );
  }

  const parsed = parseJarvisIntakeRequest(bodyJson);
  if (!parsed.ok) {
    const ridFromBody =
      bodyJson && typeof bodyJson === "object"
        ? ((bodyJson as Record<string, unknown>).request_id as string | undefined)
        : undefined;
    return jsonResponse(400, {
      request_id: ridFromBody ?? "",
      agent_task_id: null,
      status: "invalid",
      detected_action: undefined,
      dry_run: true,
      missing_fields: parsed.missing,
      duplicate_warning: null,
      message_to_owner: parsed.message,
      operation_request_reference: null,
      safety_notes: ["schema_validation_failed"],
      notes: parsed.message,
      responded_at: respondedAt,
    } satisfies JarvisIntakeResponse);
  }

  // ── Dry-run gate (Phase 2.0g: always true) ──────────────────────────────
  const liveAllowed = process.env.JARVIS_INTAKE_LIVE === "true";
  const requestedDryRun = parsed.parsed.dry_run !== false;
  const effectiveDryRun = !liveAllowed || requestedDryRun;

  // ── Build response ──────────────────────────────────────────────────────
  // The handler stops here in Phase 2.0g. No DB mutation. We echo the
  // detected action + missing-info hint (always empty here since the
  // schema validator already caught the required fields).
  const safetyNotes: string[] = [
    "phase_2_0g_dry_run",
    "no_db_writes",
    "owner_approval_recorded_on_jarvis",
  ];
  if (!liveAllowed) safetyNotes.push("live_mode_disabled");

  const messageToOwner = buildOwnerMessage(parsed.parsed, effectiveDryRun);

  const response: JarvisIntakeResponse = {
    request_id: parsed.parsed.request_id,
    agent_task_id: null,
    status: "accepted",
    resolved_customer_id: null,
    resolved_order_id: null,
    detected_action: parsed.parsed.recommended_action,
    dry_run: effectiveDryRun,
    missing_fields: [],
    duplicate_warning: null,
    message_to_owner: messageToOwner,
    operation_request_reference: parsed.parsed.owner_approval.jarvis_approval_id,
    safety_notes: safetyNotes,
    notes: effectiveDryRun
      ? "dry_run echo — Elkayam validated the request but did not persist anything"
      : "live mode — Elkayam would have inserted agent_tasks (not yet wired)",
    responded_at: respondedAt,
  };

  return jsonResponse(200, response);
}

// ── Other methods get 405 ──────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  return jsonResponse(
    405,
    buildFailureResponse({
      request_id: "",
      respondedAt: new Date().toISOString(),
      message: "Method not allowed",
      safetyNotes: ["wrong_method"],
    }),
  );
}

export const PUT = GET;
export const DELETE = GET;
export const PATCH = GET;

// ───────────────────────────────────────────────────────────────────────────

function jsonResponse(status: number, body: JarvisIntakeResponse): NextResponse {
  return NextResponse.json(body, { status });
}

function buildFailureResponse(args: {
  request_id: string;
  respondedAt: string;
  message: string;
  safetyNotes: string[];
}): JarvisIntakeResponse {
  return {
    request_id: args.request_id,
    agent_task_id: null,
    status: "failed",
    detected_action: undefined,
    dry_run: true,
    missing_fields: [],
    duplicate_warning: null,
    message_to_owner: args.message,
    operation_request_reference: null,
    safety_notes: args.safetyNotes,
    notes: args.message,
    responded_at: args.respondedAt,
  };
}

function buildOwnerMessage(
  body: { recommended_action: string; extracted_entities: Record<string, unknown> },
  dryRun: boolean,
): string {
  const action = body.recommended_action;
  const customer =
    typeof body.extracted_entities?.customer === "string"
      ? (body.extracted_entities.customer as string)
      : null;
  const verb =
    action === "create_order_draft"
      ? "create an order draft"
      : action === "update_order_draft"
        ? "update an order draft"
        : action === "create_work_log_draft"
          ? "create a work log draft"
          : action === "create_schedule_draft"
            ? "create a schedule draft"
            : action === "create_task_draft"
              ? "create a task draft"
              : "perform a business action";
  const target = customer ? ` for ${customer}` : "";
  if (dryRun) {
    return `Dry-run accepted: JARVIS asked Elkayam to ${verb}${target}. No record was created.`;
  }
  return `Accepted: Elkayam will ${verb}${target}.`;
}

function extractRequestId(req: NextRequest): string | null {
  return req.headers.get("x-jarvis-request-id");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
