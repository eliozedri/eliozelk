import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const TEST_TOKEN = "test-bearer-elkayam-catalog-2Y8nXq";

// In-memory fake catalog rows that the mocked getServiceSupabase
// returns. The test rewrites this between cases.
let mockRows: Array<{
  id: string;
  name: string;
  type: string;
  category: string;
  unit_of_measure: string;
  dimension_value: string | null;
  dimension_unit: string | null;
  default_price: number | null;
  description: string;
  is_active: boolean;
}> = [];

type Row = (typeof mockRows)[number];
function buildQuery(filtered: Row[]): unknown {
  const result = { data: filtered, error: null, count: filtered.length };
  const builder: Record<string, unknown> = {
    eq: (col: string, val: unknown) =>
      buildQuery(filtered.filter((r) => (r as unknown as Record<string, unknown>)[col] === val)),
    in: (col: string, vals: unknown[]) => {
      const set = new Set(vals);
      return buildQuery(
        filtered.filter((r) => set.has((r as unknown as Record<string, unknown>)[col])),
      );
    },
    or: (_clause: string) => buildQuery(filtered),
    order: () => buildQuery(filtered),
    range: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
    // Thenable so `await query` resolves to {data, error, count}
    then: (onFulfilled: (v: typeof result) => unknown) =>
      Promise.resolve(result).then(onFulfilled),
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  getServiceSupabase: () => ({
    from: () => ({
      select: () => buildQuery(mockRows.slice()),
    }),
  }),
}));

// Late-import the routes AFTER the mock is registered.
const { GET: getDepartments } = await import("@/app/api/jarvis/catalog/departments/route");
const { GET: getItems } = await import("@/app/api/jarvis/catalog/items/route");
const { GET: getItem } = await import("@/app/api/jarvis/catalog/items/[id]/route");

beforeEach(() => {
  process.env.JARVIS_INTAKE_TOKEN = TEST_TOKEN;
  mockRows = [
    { id: "i1", name: "קונוס תנועה", type: "product", category: "אביזרי בטיחות — קונוסים ואביזריהם",
      unit_of_measure: "יחידה", dimension_value: null, dimension_unit: null,
      default_price: null, description: "", is_active: true },
    { id: "i2", name: "שרוול לקונוס", type: "product", category: "אביזרי בטיחות — קונוסים ואביזריהם",
      unit_of_measure: "יחידה", dimension_value: null, dimension_unit: null,
      default_price: null, description: "", is_active: true },
    { id: "i3", name: "מעקה ישן", type: "product", category: "מעקות ומחסומים",
      unit_of_measure: "מטר", dimension_value: null, dimension_unit: null,
      default_price: null, description: "", is_active: false },
    { id: "i4", name: "תמרור עצור", type: "product", category: "שלטים ושילוט",
      unit_of_measure: "יחידה", dimension_value: null, dimension_unit: null,
      default_price: null, description: "", is_active: true },
    { id: "i5", name: "פריט פעיל ללא קטגוריה", type: "product", category: "",
      unit_of_measure: "יחידה", dimension_value: null, dimension_unit: null,
      default_price: null, description: "", is_active: true },
  ];
});

function makeReq(args: { url: string; token?: string | null }): NextRequest {
  const headers: Record<string, string> = {};
  if (args.token) headers.authorization = `Bearer ${args.token}`;
  return new NextRequest(args.url, { method: "GET", headers });
}

describe("GET /api/jarvis/catalog/departments", () => {
  it("503 when JARVIS_INTAKE_TOKEN missing", async () => {
    delete process.env.JARVIS_INTAKE_TOKEN;
    const res = await getDepartments(
      makeReq({ url: "http://localhost/api/jarvis/catalog/departments?v=1", token: TEST_TOKEN }),
    );
    expect(res.status).toBe(503);
  });
  it("401 without bearer", async () => {
    const res = await getDepartments(
      makeReq({ url: "http://localhost/api/jarvis/catalog/departments?v=1", token: null }),
    );
    expect(res.status).toBe(401);
  });
  it("400 with missing version", async () => {
    const res = await getDepartments(
      makeReq({ url: "http://localhost/api/jarvis/catalog/departments", token: TEST_TOKEN }),
    );
    expect(res.status).toBe(400);
  });
  it("200 with valid auth: returns all 7 departments with counts", async () => {
    const res = await getDepartments(
      makeReq({ url: "http://localhost/api/jarvis/catalog/departments?v=1", token: TEST_TOKEN }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.departments)).toBe(true);
    expect(body.departments.length).toBe(7);
    const safety = body.departments.find((d: { slug: string }) => d.slug === "safety");
    expect(safety.active_item_count).toBe(2); // i1 + i2
    const signage = body.departments.find((d: { slug: string }) => d.slug === "signage");
    expect(signage.active_item_count).toBe(1); // i4
    const barriers = body.departments.find((d: { slug: string }) => d.slug === "barriers");
    expect(barriers.active_item_count).toBe(0); // i3 is inactive
    const other = body.departments.find((d: { slug: string }) => d.slug === "other");
    expect(other.active_item_count).toBe(1); // i5 (no category)
  });
});

describe("GET /api/jarvis/catalog/items", () => {
  it("401 without bearer", async () => {
    const res = await getItems(
      makeReq({ url: "http://localhost/api/jarvis/catalog/items?v=1", token: null }),
    );
    expect(res.status).toBe(401);
  });
  it("400 on unknown department slug", async () => {
    const res = await getItems(
      makeReq({
        url: "http://localhost/api/jarvis/catalog/items?v=1&department=nope",
        token: TEST_TOKEN,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("unknown_department");
  });
  it("returns only active items overall (i3 excluded)", async () => {
    const res = await getItems(
      makeReq({ url: "http://localhost/api/jarvis/catalog/items?v=1", token: TEST_TOKEN }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    const ids = body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain("i1");
    expect(ids).toContain("i2");
    expect(ids).toContain("i4");
    expect(ids).toContain("i5");
    expect(ids).not.toContain("i3");
  });
  it("filters by department slug", async () => {
    const res = await getItems(
      makeReq({
        url: "http://localhost/api/jarvis/catalog/items?v=1&department=safety",
        token: TEST_TOKEN,
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    const ids = body.items.map((i: { id: string }) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["i1", "i2"]));
    expect(ids).not.toContain("i4"); // signage
    expect(ids).not.toContain("i5"); // other
  });
});

describe("GET /api/jarvis/catalog/items/[id]", () => {
  it("401 without bearer", async () => {
    const res = await getItem(
      makeReq({ url: "http://localhost/api/jarvis/catalog/items/i1?v=1", token: null }),
      { params: Promise.resolve({ id: "i1" }) },
    );
    expect(res.status).toBe(401);
  });
  it("returns is_active=true with item for active row", async () => {
    const res = await getItem(
      makeReq({ url: "http://localhost/api/jarvis/catalog/items/i1?v=1", token: TEST_TOKEN }),
      { params: Promise.resolve({ id: "i1" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.is_active).toBe(true);
    expect(body.item.id).toBe("i1");
    expect(body.item.department).toBe("safety");
  });
  it("returns is_active=false (item=null) for inactive row", async () => {
    const res = await getItem(
      makeReq({ url: "http://localhost/api/jarvis/catalog/items/i3?v=1", token: TEST_TOKEN }),
      { params: Promise.resolve({ id: "i3" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.is_active).toBe(false);
    expect(body.item).toBeNull();
  });
  it("returns is_active=false for unknown id", async () => {
    const res = await getItem(
      makeReq({ url: "http://localhost/api/jarvis/catalog/items/nope?v=1", token: TEST_TOKEN }),
      { params: Promise.resolve({ id: "nope" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.is_active).toBe(false);
    expect(body.item).toBeNull();
  });
});
