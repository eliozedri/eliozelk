import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  parseJarvisIntakeRequest,
  type JarvisIntakeRequest,
  type JarvisIntakeResponse,
} from "./intake-contract";
import {
  attemptLiveIntakeWrite,
  type LiveIntakeOutcome,
} from "./live-intake";

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

  // ── Three-gate live-write check (Phase 2.0l) ────────────────────────────
  // All three must align for a live write to even be attempted:
  //   1. JARVIS_INTAKE_LIVE = "true"
  //   2. parsed.parsed.recommended_action ∈ JARVIS_INTAKE_ALLOWED_ACTIONS
  //   3. body.dry_run !== true
  // Any one of these missing → fall through to the dry-run response below.
  const liveAllowed = process.env.JARVIS_INTAKE_LIVE === "true";
  const allowedActions = parseAllowedActions(process.env.JARVIS_INTAKE_ALLOWED_ACTIONS);
  const requestedDryRun = parsed.parsed.dry_run !== false;
  const actionAllowed = allowedActions.has(parsed.parsed.recommended_action);

  let liveOutcome: LiveIntakeOutcome | null = null;
  const safetyNotes: string[] = ["owner_approval_recorded_on_jarvis"];

  if (liveAllowed && actionAllowed && !requestedDryRun) {
    // All gates pass — actually attempt the write. Any DB error stays
    // local to this branch; the dry-run fallback runs if the live
    // attempt was blocked or failed gracefully.
    try {
      liveOutcome = await attemptLiveIntakeWrite(
        getServiceSupabase(),
        parsed.parsed,
      );
    } catch (err) {
      const msg = (err as Error).message ?? "unknown_error";
      liveOutcome = { kind: "failed", reason: msg.slice(0, 200) };
    }
  } else {
    // Build a precise list of safety notes for why live didn't run.
    if (!liveAllowed) safetyNotes.push("live_mode_disabled");
    if (!actionAllowed) safetyNotes.push("action_not_allowed_for_live");
    if (requestedDryRun) safetyNotes.push("dry_run_requested");
  }

  // ── Build response ──────────────────────────────────────────────────────
  const effectiveDryRun = liveOutcome === null;
  const messageToOwner = buildOwnerMessage(parsed.parsed, effectiveDryRun, liveOutcome);

  // Common safety notes
  safetyNotes.push("no_business_table_writes");

  let status: JarvisIntakeResponse["status"] = "accepted";
  let agent_task_id: string | null = null;
  let duplicate_warning: string | null = null;
  let operationRequestReference: string | null =
    parsed.parsed.owner_approval.jarvis_approval_id;

  if (liveOutcome) {
    if (liveOutcome.kind === "queued") {
      status = "queued";
      // The intake-record id (NOT an agent_tasks id — we deliberately
      // don't write to agent_tasks in this phase) is surfaced as the
      // reference so JARVIS can correlate later.
      operationRequestReference = liveOutcome.recordId;
      agent_task_id = null;
      safetyNotes.push("intake_record_created");
    } else if (liveOutcome.kind === "already_processed") {
      status = "already_processed";
      operationRequestReference = liveOutcome.recordId;
      agent_task_id = null;
      safetyNotes.push("idempotent_replay");
    } else if (liveOutcome.kind === "duplicate_blocked") {
      status = "needs_clarification";
      duplicate_warning = liveOutcome.warning;
      safetyNotes.push("duplicate_blocked");
    } else if (liveOutcome.kind === "failed") {
      status = "failed";
      safetyNotes.push("live_write_failed");
    }
  }

  const response: JarvisIntakeResponse = {
    request_id: parsed.parsed.request_id,
    agent_task_id,
    status,
    resolved_customer_id: null,
    resolved_order_id: liveOutcome?.kind === "duplicate_blocked"
      ? (liveOutcome.relatedWorkOrderId ?? null)
      : null,
    detected_action: parsed.parsed.recommended_action,
    dry_run: effectiveDryRun,
    missing_fields: [],
    duplicate_warning,
    message_to_owner: messageToOwner,
    operation_request_reference: operationRequestReference,
    safety_notes: safetyNotes,
    notes: buildNotes(effectiveDryRun, liveOutcome),
    responded_at: respondedAt,
  };

  return jsonResponse(200, response);
}

function parseAllowedActions(raw: string | undefined): Set<string> {
  if (!raw || raw.trim().length === 0) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

function buildNotes(
  dryRun: boolean,
  outcome: LiveIntakeOutcome | null,
): string {
  if (dryRun) {
    return "dry_run echo — Elkayam validated the request but did not persist anything";
  }
  if (!outcome) return "live mode requested but no outcome — unexpected";
  if (outcome.kind === "queued") {
    return `live intake record created: ${outcome.recordId}. agent_tasks dispatch is a separate future step.`;
  }
  if (outcome.kind === "already_processed") {
    return `idempotent replay: same request_id already on record (${outcome.recordId}).`;
  }
  if (outcome.kind === "duplicate_blocked") {
    return `duplicate_blocked: ${outcome.warning}`;
  }
  return `live_write_failed: ${outcome.reason}`;
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
  outcome: LiveIntakeOutcome | null = null,
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

  // Live path — describe what happened to the intake record specifically.
  if (outcome?.kind === "duplicate_blocked") {
    return `Intake blocked: an existing open order was found${target}. Owner clarification needed before creating another draft.`;
  }
  if (outcome?.kind === "already_processed") {
    return `Already on record${target} — no new intake row was created (idempotent).`;
  }
  if (outcome?.kind === "failed") {
    return `Live intake attempt failed${target}. No business records were modified.`;
  }
  return `Live intake recorded${target}. The draft sits in jarvis_intake_records and will be dispatched in a future phase.`;
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
