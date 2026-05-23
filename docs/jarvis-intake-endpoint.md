# JARVIS Intake Endpoint

> The single server-to-server seam between JARVIS (the owner's personal +
> business assistant) and Elkayam. Phase 2.0g introduces this endpoint in
> **dry-run only** mode — it validates JARVIS's requests and echoes a
> structured response without making any database mutation.

## Route

```
POST /api/jarvis/intake?v=1
```

- Versioned via the `?v=` query (only `v=1` is accepted).
- `content-type: application/json`.
- `authorization: Bearer <JARVIS_INTAKE_TOKEN>` (constant-time compared).
- `x-jarvis-request-id: <uuid>` (optional; mirrors the body's `request_id`
  so logs can correlate before parse).

All other HTTP methods return 405.

## Environment variables

| Name | Required | Description |
|---|---|---|
| `JARVIS_INTAKE_TOKEN` | yes (or the route returns 503) | Shared bearer secret. **Generate locally** with `openssl rand -base64 32 \| tr -d '\n='`. Put the same value into the JARVIS-side `ELKAYAM_INTAKE_TOKEN`. Never commit. |
| `JARVIS_INTAKE_LIVE` | no — default safe-off | `"true"` to honour `body.dry_run=false`. Until this is `"true"` the route forces dry-run regardless of body. **Phase 2.0g leaves this unset.** |

The endpoint reads both via `process.env.*`. The repository's `.gitignore`
catches `.env*`, so the runtime values stay out of version control.

## Request

The full request schema lives in `src/app/api/jarvis/intake/intake-contract.ts`.
Required fields:

- `request_id` — UUID v4
- `source_channel` — `"telegram"` or `"whatsapp"`
- `source_sender_id` — channel-native sender id
- `source_message_text` — string or null
- `intent_type` — one of nine supported values (see contract)
- `life_domain` — `"business"` or `"mixed"`
- `recommended_action` — one of five supported actions
- `extracted_entities` — object (open-ended)
- `summary_text` — string or null
- `urgency` — `"low" | "normal" | "high" | "critical" | null`
- `owner_approval` — `{ decided_by: "owner", decided_at: ISO8601, jarvis_approval_id: string, via: "telegram" | "whatsapp" }`
- `dry_run` — optional boolean (defaults effectively to true until
  `JARVIS_INTAKE_LIVE=true`)

## Response

Returned for every accepted/rejected/invalid request. See
`src/app/api/jarvis/intake/intake-contract.ts` `JarvisIntakeResponse`:

```ts
{
  request_id: string;
  agent_task_id: string | null;       // null in dry-run
  status: "queued" | "already_processed" | "invalid"
        | "duplicate_blocked" | "failed" | "needs_clarification"
        | "accepted" | "rejected";
  detected_action?: BusinessOpsAction;
  dry_run: boolean;                    // effective dry-run after env override
  missing_fields?: string[];
  duplicate_warning?: string | null;
  message_to_owner?: string;           // surfaced via Telegram by JARVIS
  operation_request_reference?: string | null;
  safety_notes?: string[];             // e.g. ["phase_2_0g_dry_run", "no_db_writes"]
  notes?: string;
  responded_at: string;
}
```

## HTTP status codes

| HTTP | Body `status` |
|---|---|
| 200 | `"accepted"` / `"queued"` / `"already_processed"` / `"duplicate_blocked"` |
| 400 | `"invalid"` — schema/version failure |
| 401 | `"failed"` — bearer missing or wrong |
| 405 | `"failed"` — wrong method |
| 503 | `"failed"` — `JARVIS_INTAKE_TOKEN` not set |

## Phase 2.0g safety guarantees

The route in this phase:

- Does **no** `INSERT` / `UPDATE` on `work_orders`, `agent_tasks`,
  `agent_action_logs`, `inventory_consumptions`, `work_logs`,
  `schedules`, `customers`, or any business table.
- Does **no** Supabase calls of any kind.
- Honours dry-run defensively even when the request body claims
  `dry_run: false`.
- Returns `safety_notes` so the owner can verify each response.

A `grep -nE 'supabase|insert|update|delete|from\(|db\.' src/app/api/jarvis/intake/`
of the route directory produces zero functional matches — every
appearance is a comment, a string literal in the owner message, or a
type-string in the contract.

## Testing

`tests/app/api/jarvis/intake.test.ts` covers (15 cases):

- auth: missing token env → 503; missing/wrong bearer → 401; length-mismatch
  bearer → 401 (constant-time guard).
- version: missing or wrong `?v=` → 400.
- validation: malformed JSON → 400; missing required fields → 400 invalid;
  unsupported intent_type / recommended_action / non-UUID request_id → 400.
- happy path: 200 accepted with `dry_run=true`, request_id echoed,
  `detected_action` set, `safety_notes` includes
  `phase_2_0g_dry_run` + `no_db_writes` + `live_mode_disabled`.
- live override: `dry_run=false` in body is ignored until
  `JARVIS_INTAKE_LIVE=true`; when set, response reflects body's `dry_run`.
- 405 for non-POST methods.

Run: `npx vitest run tests/app/api/jarvis/intake.test.ts`

## How to wire locally (dev)

1. Generate a secret: `openssl rand -base64 32 | tr -d '\n='`.
2. Append to **both** repos' local env files (both gitignored):
   - `eliozelk/.env.local`: `JARVIS_INTAKE_TOKEN=<value>` and
     `JARVIS_INTAKE_LIVE=false`.
   - `JARVIS/.env`: `ELKAYAM_INTAKE_URL=http://localhost:3000/api/jarvis/intake?v=1`,
     `ELKAYAM_INTAKE_TOKEN=<value>`, `JARVIS_ELKAYAM_INTAKE_ENABLED=true`,
     `JARVIS_ELKAYAM_DRY_RUN=true`.
3. Restart `npm run dev` in the Elkayam repo so Next.js picks up the
   new env.
4. Run `npx tsx scripts/smoke/elkayam-live-connectivity.ts` in JARVIS.

## What this endpoint does NOT do

- Does not authenticate using Supabase user JWTs (it's a service-to-service
  seam, not a user-facing route).
- Does not call any Elkayam agent.
- Does not create or modify any business row.
- Does not emit Telegram or WhatsApp messages.

When Phase 2.0h+ wires real persistence, the new code will live in a
separate file and the dry-run handler in this phase will become the
fallback whenever `JARVIS_INTAKE_LIVE !== "true"`.
