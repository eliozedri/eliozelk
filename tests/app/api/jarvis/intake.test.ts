import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, GET } from "@/app/api/jarvis/intake/route";

const TEST_TOKEN = "test-bearer-elkayam-intake-7E9pQrX2";

function makeRequest(args: {
  method?: string;
  token?: string | null;
  body?: unknown;
  query?: string;
  rid?: string;
}): NextRequest {
  const { method = "POST", token = TEST_TOKEN, body, query = "?v=1", rid } = args;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  if (rid) headers["x-jarvis-request-id"] = rid;
  return new NextRequest(`http://localhost:3000/api/jarvis/intake${query}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    request_id: "11111111-2222-3333-4444-555555555555",
    source_channel: "telegram",
    source_sender_id: "owner-chat-id",
    source_message_text: "menu_dialog:new_order customer=Acme Co",
    intent_type: "new_order_candidate",
    life_domain: "business",
    recommended_action: "create_order_draft",
    extracted_entities: { customer: "Acme Co", date_or_time: "Tuesday" },
    summary_text: "New order: Acme Co",
    urgency: "normal",
    owner_approval: {
      decided_by: "owner",
      decided_at: "2026-05-23T10:00:00.000Z",
      jarvis_approval_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      via: "telegram",
    },
    dry_run: true,
    ...overrides,
  };
}

beforeEach(() => {
  process.env.JARVIS_INTAKE_TOKEN = TEST_TOKEN;
  delete process.env.JARVIS_INTAKE_LIVE;
});

describe("POST /api/jarvis/intake — auth", () => {
  it("returns 503 when token env is missing", async () => {
    delete process.env.JARVIS_INTAKE_TOKEN;
    const res = await POST(makeRequest({ body: validBody() }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("failed");
    expect(body.safety_notes).toContain("endpoint_not_configured");
  });

  it("returns 401 when no Authorization header", async () => {
    const res = await POST(makeRequest({ token: null, body: validBody() }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe("failed");
    expect(body.safety_notes).toContain("unauthorized");
  });

  it("returns 401 when bearer is wrong", async () => {
    const res = await POST(makeRequest({ token: "wrong-token", body: validBody() }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when bearer length differs (constant-time guard)", async () => {
    const res = await POST(makeRequest({ token: TEST_TOKEN + "x", body: validBody() }));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/jarvis/intake — version", () => {
  it("rejects missing ?v= with 400", async () => {
    const res = await POST(makeRequest({ body: validBody(), query: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.safety_notes).toContain("version_mismatch");
  });

  it("rejects ?v=2 with 400", async () => {
    const res = await POST(makeRequest({ body: validBody(), query: "?v=2" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/jarvis/intake — validation", () => {
  it("rejects invalid JSON body with 400", async () => {
    const req = new NextRequest("http://localhost:3000/api/jarvis/intake?v=1", {
      method: "POST",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
        "content-type": "application/json",
      },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.safety_notes).toContain("invalid_json");
  });

  it("returns 400 invalid when required fields are missing", async () => {
    const partial = { request_id: "11111111-2222-3333-4444-555555555555" };
    const res = await POST(makeRequest({ body: partial }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe("invalid");
    expect(Array.isArray(body.missing_fields)).toBe(true);
    expect(body.missing_fields.length).toBeGreaterThan(0);
    expect(body.safety_notes).toContain("schema_validation_failed");
  });

  it("returns 400 invalid for unsupported intent_type", async () => {
    const res = await POST(makeRequest({ body: validBody({ intent_type: "what" }) }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.missing_fields).toContain("intent_type:value");
  });

  it("returns 400 invalid for unsupported recommended_action", async () => {
    const res = await POST(
      makeRequest({ body: validBody({ recommended_action: "drop_database" }) }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.missing_fields).toContain("recommended_action:value");
  });

  it("returns 400 invalid for non-UUID request_id", async () => {
    const res = await POST(
      makeRequest({ body: validBody({ request_id: "not-a-uuid" }) }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.missing_fields).toContain("request_id:format");
  });
});

describe("POST /api/jarvis/intake — happy path dry-run", () => {
  it("returns 200 accepted with dry_run=true and matching request_id", async () => {
    const res = await POST(makeRequest({ body: validBody() }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("accepted");
    expect(body.dry_run).toBe(true);
    expect(body.request_id).toBe("11111111-2222-3333-4444-555555555555");
    expect(body.detected_action).toBe("create_order_draft");
    expect(body.agent_task_id).toBeNull();
    expect(body.safety_notes).toContain("phase_2_0g_dry_run");
    expect(body.safety_notes).toContain("no_db_writes");
    expect(body.safety_notes).toContain("live_mode_disabled");
    expect(body.message_to_owner).toContain("Acme Co");
    expect(body.operation_request_reference).toBe(
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    );
  });

  it("forces dry-run even when body claims dry_run=false (JARVIS_INTAKE_LIVE unset)", async () => {
    const res = await POST(makeRequest({ body: validBody({ dry_run: false }) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dry_run).toBe(true);
    expect(body.safety_notes).toContain("live_mode_disabled");
  });

  it("honours dry_run=false ONLY when JARVIS_INTAKE_LIVE=true (still dry-run-shaped in 2.0g)", async () => {
    process.env.JARVIS_INTAKE_LIVE = "true";
    const res = await POST(makeRequest({ body: validBody({ dry_run: false }) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Phase 2.0g handler still doesn't write to DB even when live=true,
    // but `dry_run` in the response reflects the request body.
    expect(body.dry_run).toBe(false);
    expect(body.safety_notes).not.toContain("live_mode_disabled");
  });
});

describe("Other methods — 405", () => {
  it("GET returns 405", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
  });
});
