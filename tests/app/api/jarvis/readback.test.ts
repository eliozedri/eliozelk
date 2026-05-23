import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const TEST_TOKEN = "test-bearer-elkayam-readback-3K7vM";

type WorkOrderRow = {
  id: string;
  order_number: string;
  status: string;
  priority: string;
  customer: string;
  city: string;
  order_date: string;
  updated_at: string;
  data?: Record<string, unknown>;
};
type CustomerRow = {
  id: string;
  name: string;
  location: string;
  phone: string;
  last_order: string;
};

let mockOrders: WorkOrderRow[] = [];
let mockCustomers: CustomerRow[] = [];

function buildQuery<T extends Record<string, unknown>>(
  rows: T[],
): unknown {
  const result = { data: rows, error: null, count: rows.length };
  return {
    eq: (col: string, val: unknown) =>
      buildQuery(rows.filter((r) => r[col] === val)),
    not: (col: string, op: string, valList: string) => {
      // valList shape: ("a","b","c")
      const set = new Set(
        valList
          .replace(/[()"]/g, "")
          .split(",")
          .map((s) => s.trim()),
      );
      return buildQuery(rows.filter((r) => !set.has(String(r[col] ?? ""))));
    },
    ilike: (col: string, pattern: string) => {
      const p = pattern.replace(/%/g, "").toLowerCase();
      return buildQuery(
        rows.filter((r) => String(r[col] ?? "").toLowerCase().includes(p)),
      );
    },
    or: (_clause: string) => buildQuery(rows),
    order: () => buildQuery(rows),
    range: () => Promise.resolve(result),
    limit: () => buildQuery(rows),
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (onFulfilled: (v: typeof result) => unknown) =>
      Promise.resolve(result).then(onFulfilled),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  getServiceSupabase: () => ({
    from: (table: string) => {
      const dataset =
        table === "work_orders" ? mockOrders : table === "customers" ? mockCustomers : [];
      return {
        select: () => buildQuery(dataset as unknown as Array<Record<string, unknown>>),
      };
    },
  }),
}));

const { GET: getOrders } = await import("@/app/api/jarvis/orders/route");
const { GET: getOrderById } = await import("@/app/api/jarvis/orders/[id]/route");
const { GET: getCustomers } = await import("@/app/api/jarvis/customers/route");
const { GET: getCustomerById } =
  await import("@/app/api/jarvis/customers/[id]/route");

beforeEach(() => {
  process.env.JARVIS_INTAKE_TOKEN = TEST_TOKEN;
  mockOrders = [
    {
      id: "o-1",
      order_number: "WO-1001",
      status: "graphics_pending",
      priority: "normal",
      customer: "עיריית אשקלון",
      city: "אשקלון",
      order_date: "2026-04-12",
      updated_at: "2026-04-12T10:00:00Z",
      data: { accessoryRows: [{}, {}], notes: "סימון חניון", contact: { name: "יוסי", phone: "050-1234567" } },
    },
    {
      id: "o-2",
      order_number: "WO-1002",
      status: "completed",
      priority: "low",
      customer: "מועצת תל אביב",
      city: "תל אביב",
      order_date: "2026-03-01",
      updated_at: "2026-03-15T10:00:00Z",
      data: {},
    },
    {
      id: "o-3",
      order_number: "WO-1003",
      status: "production",
      priority: "urgent",
      customer: "עיריית אשקלון",
      city: "אשקלון",
      order_date: "2026-04-18",
      updated_at: "2026-04-18T10:00:00Z",
      data: {},
    },
    {
      id: "o-4",
      order_number: "WO-1004",
      status: "cancelled",
      priority: "normal",
      customer: "ראשות שדרות",
      city: "שדרות",
      order_date: "2026-02-10",
      updated_at: "2026-02-20T10:00:00Z",
      data: {},
    },
  ];
  mockCustomers = [
    { id: "c-1", name: "עיריית אשקלון", location: "אשקלון", phone: "08-1234567", last_order: "2026-04-18" },
  ];
});

function makeReq(args: { url: string; token?: string | null }): NextRequest {
  const headers: Record<string, string> = {};
  if (args.token) headers.authorization = `Bearer ${args.token}`;
  return new NextRequest(args.url, { method: "GET", headers });
}

// ---------------------------------------------------------------------------
describe("GET /api/jarvis/orders — auth + filters", () => {
  it("401 without bearer", async () => {
    const res = await getOrders(
      makeReq({ url: "http://localhost/api/jarvis/orders?v=1", token: null }),
    );
    expect(res.status).toBe(401);
  });

  it("503 when token env missing", async () => {
    delete process.env.JARVIS_INTAKE_TOKEN;
    const res = await getOrders(
      makeReq({ url: "http://localhost/api/jarvis/orders?v=1", token: TEST_TOKEN }),
    );
    expect(res.status).toBe(503);
  });

  it("returns all orders by default", async () => {
    const res = await getOrders(
      makeReq({ url: "http://localhost/api/jarvis/orders?v=1", token: TEST_TOKEN }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.orders.length).toBe(4);
    // every row gets is_open computed
    const open = body.orders.filter((o: { is_open: boolean }) => o.is_open);
    expect(open.length).toBe(2); // o-1 + o-3
  });

  it("status=open excludes completed + cancelled", async () => {
    const res = await getOrders(
      makeReq({
        url: "http://localhost/api/jarvis/orders?v=1&status=open",
        token: TEST_TOKEN,
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    const ids = body.orders.map((o: { id: string }) => o.id);
    expect(ids).toContain("o-1");
    expect(ids).toContain("o-3");
    expect(ids).not.toContain("o-2"); // completed
    expect(ids).not.toContain("o-4"); // cancelled
  });

  it("customer filter exact-matches", async () => {
    const res = await getOrders(
      makeReq({
        url: "http://localhost/api/jarvis/orders?v=1&customer=" +
          encodeURIComponent("עיריית אשקלון"),
        token: TEST_TOKEN,
      }),
    );
    const body = await res.json();
    expect(body.orders.length).toBe(2);
    expect(body.orders.every((o: { customer: string }) => o.customer === "עיריית אשקלון")).toBe(true);
  });

  it("status_he is a polished Hebrew label", async () => {
    const res = await getOrders(
      makeReq({
        url: "http://localhost/api/jarvis/orders?v=1&status=open",
        token: TEST_TOKEN,
      }),
    );
    const body = await res.json();
    const pending = body.orders.find((o: { id: string }) => o.id === "o-1");
    expect(pending.status_he).toBe("ממתין לגרפיקה");
    const prod = body.orders.find((o: { id: string }) => o.id === "o-3");
    expect(prod.status_he).toBe("בייצור");
  });

  it("405 on POST/PUT/DELETE", async () => {
    const { POST, PUT, DELETE } = await import("@/app/api/jarvis/orders/route");
    expect((await POST()).status).toBe(405);
    expect((await PUT()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);
  });
});

// ---------------------------------------------------------------------------
describe("GET /api/jarvis/orders/[id]", () => {
  it("401 without bearer", async () => {
    const res = await getOrderById(
      makeReq({ url: "http://localhost/api/jarvis/orders/o-1?v=1", token: null }),
      { params: Promise.resolve({ id: "o-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns found=true + detail for known id", async () => {
    const res = await getOrderById(
      makeReq({ url: "http://localhost/api/jarvis/orders/o-1?v=1", token: TEST_TOKEN }),
      { params: Promise.resolve({ id: "o-1" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.found).toBe(true);
    expect(body.order.id).toBe("o-1");
    expect(body.order.status_he).toBe("ממתין לגרפיקה");
    expect(body.order.data.items_summary).toBe("2 פריטים");
    expect(body.order.data.notes).toBe("סימון חניון");
    expect(body.order.data.contact.name).toBe("יוסי");
  });

  it("returns found=false for unknown id (200)", async () => {
    const res = await getOrderById(
      makeReq({ url: "http://localhost/api/jarvis/orders/nope?v=1", token: TEST_TOKEN }),
      { params: Promise.resolve({ id: "nope" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.found).toBe(false);
    expect(body.order).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("GET /api/jarvis/customers", () => {
  it("merges customers table + distinct work_orders names", async () => {
    const res = await getCustomers(
      makeReq({ url: "http://localhost/api/jarvis/customers?v=1", token: TEST_TOKEN }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    const names = body.customers.map((c: { name: string }) => c.name);
    expect(names).toContain("עיריית אשקלון"); // from customers table
    expect(names).toContain("מועצת תל אביב"); // from work_orders only
    expect(names).toContain("ראשות שדרות"); // from work_orders only
  });

  it("source tag distinguishes the two", async () => {
    const res = await getCustomers(
      makeReq({ url: "http://localhost/api/jarvis/customers?v=1", token: TEST_TOKEN }),
    );
    const body = await res.json();
    const askelon = body.customers.find((c: { name: string }) => c.name === "עיריית אשקלון");
    expect(askelon.source).toBe("customers");
    const ta = body.customers.find((c: { name: string }) => c.name === "מועצת תל אביב");
    expect(ta.source).toBe("work_orders");
    expect(ta.id.startsWith("wo:")).toBe(true);
  });

  it("filters by q", async () => {
    const res = await getCustomers(
      makeReq({
        url: "http://localhost/api/jarvis/customers?v=1&q=" + encodeURIComponent("אשקלון"),
        token: TEST_TOKEN,
      }),
    );
    const body = await res.json();
    expect(body.customers.length).toBeGreaterThanOrEqual(1);
    expect(body.customers[0].name).toBe("עיריית אשקלון");
  });
});

// ---------------------------------------------------------------------------
describe("GET /api/jarvis/customers/[id]", () => {
  it("returns master + recent orders", async () => {
    const res = await getCustomerById(
      makeReq({ url: "http://localhost/api/jarvis/customers/c-1?v=1", token: TEST_TOKEN }),
      { params: Promise.resolve({ id: "c-1" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.found).toBe(true);
    expect(body.customer.source).toBe("customers");
    expect(body.orders.length).toBeGreaterThanOrEqual(1);
    expect(body.orders.every((o: { customer: string }) => o.customer === "עיריית אשקלון")).toBe(true);
  });

  it("returns synthetic row for wo:* id", async () => {
    const res = await getCustomerById(
      makeReq({
        url: "http://localhost/api/jarvis/customers/wo:" + encodeURIComponent("מועצת תל אביב") + "?v=1",
        token: TEST_TOKEN,
      }),
      { params: Promise.resolve({ id: "wo:מועצת תל אביב" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.found).toBe(true);
    expect(body.customer.source).toBe("work_orders");
  });

  it("returns found=false for unknown", async () => {
    const res = await getCustomerById(
      makeReq({ url: "http://localhost/api/jarvis/customers/c-nope?v=1", token: TEST_TOKEN }),
      { params: Promise.resolve({ id: "c-nope" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.found).toBe(false);
  });
});
