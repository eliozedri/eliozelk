import { NextRequest, NextResponse } from "next/server";

/**
 * Shared helpers for the read-only JARVIS catalog endpoints.
 *
 * Auth mirrors /api/jarvis/intake (bearer JARVIS_INTAKE_TOKEN). Version
 * gate is `?v=1`. Every read-only catalog endpoint is wrapped via
 * `guard()` so the auth + version logic lives in one place.
 */

export type GuardResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

export function guard(req: NextRequest): GuardResult {
  const v = req.nextUrl.searchParams.get("v");
  if (v !== "1") {
    return {
      ok: false,
      response: jsonError(400, "version_mismatch", `Unsupported ?v= (expected 1, got ${JSON.stringify(v)})`),
    };
  }
  const expected = process.env.JARVIS_INTAKE_TOKEN ?? "";
  if (!expected) {
    return {
      ok: false,
      response: jsonError(503, "endpoint_not_configured", "Catalog endpoint not configured (JARVIS_INTAKE_TOKEN missing)"),
    };
  }
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!provided || !constantTimeEqual(provided, expected)) {
    return {
      ok: false,
      response: jsonError(401, "unauthorized", "Missing or invalid bearer token"),
    };
  }
  return { ok: true };
}

export function jsonError(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: code,
      message,
      responded_at: new Date().toISOString(),
    },
    { status },
  );
}

export function methodNotAllowed(): NextResponse {
  return jsonError(405, "method_not_allowed", "Only GET is supported.");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Department mapping now lives in src/lib/catalog/departments.ts so the
// Team Bot and this route share one source of truth. Re-exported here to
// keep this module's existing import surface stable.
// ---------------------------------------------------------------------------

export {
  DEPARTMENTS,
  categoryToDepartment,
  findDepartment,
  type DepartmentSlug,
  type DepartmentDef,
} from "@/lib/catalog/departments";
