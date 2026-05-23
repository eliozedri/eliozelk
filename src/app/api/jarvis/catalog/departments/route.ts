import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  categoryToDepartment,
  DEPARTMENTS,
  guard,
  methodNotAllowed,
  type DepartmentSlug,
} from "../_shared";

/**
 * GET /api/jarvis/catalog/departments?v=1
 *
 * Returns the high-level department list with an active-item count per
 * department. Departments with zero active items are still returned
 * (count: 0) so JARVIS can render a complete menu and visibly grey out
 * empty ones rather than silently hiding them.
 *
 * Read-only. No writes. No mutation paths reachable from this route.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const g = guard(req);
  if (!g.ok) return g.response;

  const db = getServiceSupabase();
  const { data, error } = await db
    .from("catalog_items")
    .select("category")
    .eq("is_active", true);

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "db_read_failed",
        message: error.message.slice(0, 200),
        responded_at: new Date().toISOString(),
      },
      { status: 500 },
    );
  }

  const counts: Partial<Record<DepartmentSlug, number>> = {};
  for (const row of data ?? []) {
    const slug = categoryToDepartment(String(row.category ?? ""));
    counts[slug] = (counts[slug] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    departments: DEPARTMENTS.map((d) => ({
      slug: d.slug,
      label: d.label,
      emoji: d.emoji,
      active_item_count: counts[d.slug] ?? 0,
    })),
    responded_at: new Date().toISOString(),
  });
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PATCH = methodNotAllowed;
