import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  categoryToDepartment,
  findDepartment,
  guard,
  jsonError,
  methodNotAllowed,
  type DepartmentSlug,
} from "../_shared";

/**
 * GET /api/jarvis/catalog/items?v=1[&department=<slug>][&q=<search>]
 *                                [&page=<n>][&limit=<n>]
 *
 * Returns active catalog items, optionally filtered by department slug
 * and/or by a Hebrew name/description substring. Pagination defaults to
 * 50 items per page (we have ~108 active total, so paging is mostly
 * defensive).
 *
 * Read-only. is_active=true is enforced at the DB layer.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const g = guard(req);
  if (!g.ok) return g.response;

  const params = req.nextUrl.searchParams;
  const departmentSlug = (params.get("department") ?? "").trim() as DepartmentSlug | "";
  const search = (params.get("q") ?? "").trim();
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(params.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );

  if (departmentSlug && !findDepartment(departmentSlug)) {
    return jsonError(400, "unknown_department", `Unknown department slug: ${departmentSlug}`);
  }

  const db = getServiceSupabase();
  let query = db
    .from("catalog_items")
    .select(
      "id,name,type,category,unit_of_measure,dimension_value,dimension_unit,default_price,description,is_active",
      { count: "exact" },
    )
    .eq("is_active", true);

  if (search.length > 0) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  }

  query = query.order("name", { ascending: true });
  query = query.range((page - 1) * limit, page * limit - 1);

  const { data, error, count } = await query;
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

  // Department filter happens server-side via the category mapping.
  // (We could push this into the SQL with `in (...)` but the category
  // strings are messy + the mapping is server-owned.)
  let rows = data ?? [];
  if (departmentSlug) {
    rows = rows.filter(
      (r) => categoryToDepartment(String(r.category ?? "")) === departmentSlug,
    );
  }

  return NextResponse.json({
    ok: true,
    department: departmentSlug || null,
    search: search || null,
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      category: r.category,
      department: categoryToDepartment(String(r.category ?? "")),
      unit_of_measure: r.unit_of_measure,
      dimension_value: r.dimension_value,
      dimension_unit: r.dimension_unit,
      default_price: r.default_price,
      description: r.description,
    })),
    total: count ?? rows.length,
    page,
    limit,
    responded_at: new Date().toISOString(),
  });
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PATCH = methodNotAllowed;
