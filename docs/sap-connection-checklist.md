# SAP Business One — Connection Requirements Checklist

Actionable list to take to the SAP technical contact. The Elkayam side
(read-only foundation) is already built: Service Layer client, mode guard,
entity mappings, and `/api/sap/health` + `/api/sap/dry-run` + `/integrations` UI.

## Mode state (set in environment — see `.env.local.example`)
| `SAP_B1_MODE` | Meaning | DB writes |
|---|---|---|
| `disabled` (default) | All SAP calls throw/blocked. Current production state. | none |
| `readonly` | Health check + dry-run reads allowed. **Use this to test the connection.** | none |
| `write_test` / `write_prod` | Blocked stubs — Phase 2, not implemented. | n/a |

## What to REQUEST from the SAP technician
1. **Service Layer URL** — e.g. `https://<sap-host>:50000/b1s/v1` (confirm `v1` vs `v2`).
2. **Company DB name** — e.g. `SBO_ELKAYAM` (the exact DB the Service Layer should log into).
3. **Service Layer user + password** — a dedicated **read-only** B1 user is strongly preferred for the first connection.
4. **Network access** — open the Service Layer port (typically `50000`/HTTPS) to the app's egress IP, or provide VPN details.
5. **TLS certificate** — if the Service Layer uses a self-signed cert, provide the CA/cert; production `fetch` rejects untrusted CAs.
6. **API version** — confirm `/b1s/v1` (or `v2`) and that it is enabled on the license.
7. **Entity licensing** — confirm these OData entities are exposed for the license:
   BusinessPartners, Items, Warehouses, Orders (sales), Invoices, CreditNotes,
   DeliveryNotes, IncomingPayments.

## What is READY on our side (no external input needed)
- Stateless Service Layer client: `/Login` → cookie auth → reads → `/Logout`.
- Normalized mappings for the 8 entity types above (`src/lib/sap/mapping.ts`).
- Safe test endpoints: `GET /api/sap/health` (login + 1-row read + logout) and
  `GET /api/sap/dry-run?entity=<x>` (top-10 read, raw→normalized, zero writes).
- Admin UI at `/integrations` wired to both.

## What is MISSING / placeholder
- The 5 `SAP_B1_*` env values above (must come from the SAP contact).
- Phase-2 write-back + mirror tables (`sap_*`) — designed (`SAP_SYNC_PLAN` in
  `mapping.ts`) but **not implemented**; out of scope until read-only is proven.

## Go-live test procedure (read-only, safe)
1. Set `SAP_B1_MODE=readonly` + the 4 credentials in Vercel env.
2. Open `/integrations` → click **"בדוק חיבור"** (health check).
3. If green, run a per-entity dry-run to confirm field mappings.
4. No code changes are required for this read-only connection test.
