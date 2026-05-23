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
// Department mapping — the real catalog has ~26 distinct category strings,
// some of them long fully-qualified Hebrew labels like
// "אביזרי בטיחות — קונוסים ואביזריהם". We group them into the higher-level
// departments JARVIS exposes to the owner.
// ---------------------------------------------------------------------------

export type DepartmentSlug =
  | "road_marking"
  | "traffic_arrangements"
  | "signage"
  | "safety"
  | "barriers"
  | "field_ops"
  | "other";

export type DepartmentDef = {
  slug: DepartmentSlug;
  label: string;
  emoji: string;
  /** Hebrew categories that fall into this department. Order doesn't matter. */
  categories?: string[];
  /** Prefix-match (for the long "אביזרי בטיחות — ..." family). */
  prefixes?: string[];
};

export const DEPARTMENTS: DepartmentDef[] = [
  {
    slug: "road_marking",
    label: "סימון כבישים",
    emoji: "🛣",
    categories: ["עבודות סימון וצביעה", "הסרת סימון"],
  },
  {
    slug: "traffic_arrangements",
    label: "הסדרי תנועה",
    emoji: "🚧",
    categories: ["הסדרי תנועה"],
  },
  {
    slug: "signage",
    label: "שילוט ותמרור",
    emoji: "🪧",
    categories: ["שלטים ושילוט"],
  },
  {
    slug: "safety",
    label: "אביזרי בטיחות",
    emoji: "🦺",
    categories: ["אביזרי חנייה", "אביזרי כבישים", "דיגלונים"],
    prefixes: ["אביזרי בטיחות"],
  },
  {
    slug: "barriers",
    label: "מעקות / גידור / מחסומים",
    emoji: "🧱",
    categories: ["מעקות ומחסומים", "גדרות ותיחום"],
  },
  {
    slug: "field_ops",
    label: "עבודות שטח ולוגיסטיקה",
    emoji: "📝",
    categories: ["עבודות שטח ולוגיסטיקה", "גובים ותעלות"],
  },
  {
    slug: "other",
    label: "אחר",
    emoji: "📋",
    categories: [],
  },
];

/**
 * Map a raw catalog `category` string to a department slug. Falls back
 * to `other` so no active item gets dropped.
 */
export function categoryToDepartment(rawCategory: string): DepartmentSlug {
  const cat = rawCategory.trim();
  for (const d of DEPARTMENTS) {
    if (d.categories?.includes(cat)) return d.slug;
    if (d.prefixes?.some((p) => cat.startsWith(p))) return d.slug;
  }
  return "other";
}

export function findDepartment(slug: string): DepartmentDef | null {
  return DEPARTMENTS.find((d) => d.slug === slug) ?? null;
}
