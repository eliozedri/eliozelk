import { NextRequest, NextResponse } from "next/server";
import {
  getBusinessPartners,
  getCustomers,
  getSuppliers,
  getItems,
  getWarehouses,
  getOpenSalesOrders,
  getInvoices,
  getCreditNotes,
  getDeliveryNotes,
  getIncomingPayments,
} from "@/lib/sap/services";
import {
  mapBusinessPartner,
  mapItem,
  mapWarehouse,
  mapSalesOrder,
  mapInvoice,
  mapCreditNote,
  mapDeliveryNote,
  mapPayment,
  SAP_SYNC_PLAN,
  type SapSyncMetadata,
} from "@/lib/sap/mapping";
import { requireAuth } from "@/lib/auth/apiAuth";

const SAMPLE_SIZE = 3;
const DRY_RUN_TOP = 10;

const ENTITY_KEYS = [
  "business_partners",
  "customers",
  "suppliers",
  "items",
  "warehouses",
  "orders",
  "invoices",
  "credit_notes",
  "delivery_notes",
  "payments",
] as const;

type EntityKey = (typeof ENTITY_KEYS)[number];

async function fetchAndMap(
  entity: EntityKey,
): Promise<{ raw: unknown[]; normalized: unknown[]; syncPlan: SapSyncMetadata | undefined }> {
  switch (entity) {
    case "business_partners": {
      const raw = await getBusinessPartners({ top: DRY_RUN_TOP });
      return { raw, normalized: raw.map(mapBusinessPartner), syncPlan: SAP_SYNC_PLAN.find((p) => p.entity === "business_partners_customers") };
    }
    case "customers": {
      const raw = await getCustomers({ top: DRY_RUN_TOP });
      return { raw, normalized: raw.map(mapBusinessPartner), syncPlan: SAP_SYNC_PLAN.find((p) => p.entity === "business_partners_customers") };
    }
    case "suppliers": {
      const raw = await getSuppliers({ top: DRY_RUN_TOP });
      return { raw, normalized: raw.map(mapBusinessPartner), syncPlan: SAP_SYNC_PLAN.find((p) => p.entity === "business_partners_suppliers") };
    }
    case "items": {
      const raw = await getItems({ top: DRY_RUN_TOP });
      return { raw, normalized: raw.map(mapItem), syncPlan: SAP_SYNC_PLAN.find((p) => p.entity === "items") };
    }
    case "warehouses": {
      const raw = await getWarehouses();
      return { raw, normalized: raw.map(mapWarehouse), syncPlan: SAP_SYNC_PLAN.find((p) => p.entity === "warehouses") };
    }
    case "orders": {
      const raw = await getOpenSalesOrders({ top: DRY_RUN_TOP });
      return { raw, normalized: raw.map(mapSalesOrder), syncPlan: SAP_SYNC_PLAN.find((p) => p.entity === "orders") };
    }
    case "invoices": {
      const raw = await getInvoices({ top: DRY_RUN_TOP });
      return { raw, normalized: raw.map(mapInvoice), syncPlan: SAP_SYNC_PLAN.find((p) => p.entity === "invoices") };
    }
    case "credit_notes": {
      const raw = await getCreditNotes({ top: DRY_RUN_TOP });
      return { raw, normalized: raw.map(mapCreditNote), syncPlan: SAP_SYNC_PLAN.find((p) => p.entity === "credit_notes") };
    }
    case "delivery_notes": {
      const raw = await getDeliveryNotes({ top: DRY_RUN_TOP });
      return { raw, normalized: raw.map(mapDeliveryNote), syncPlan: SAP_SYNC_PLAN.find((p) => p.entity === "delivery_notes") };
    }
    case "payments": {
      const raw = await getIncomingPayments({ top: DRY_RUN_TOP });
      return { raw, normalized: raw.map(mapPayment), syncPlan: SAP_SYNC_PLAN.find((p) => p.entity === "payments") };
    }
  }
}

function detectUnmappedFields(
  raw: Record<string, unknown>,
  normalized: Record<string, unknown>,
): string[] {
  const normalizedKeys = new Set(
    Object.keys(normalized).filter((k) => k !== "_sap"),
  );
  return Object.keys(raw).filter((k) => {
    const lk = k.charAt(0).toLowerCase() + k.slice(1);
    return !normalizedKeys.has(lk) && !normalizedKeys.has(k);
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Internal integration diagnostics — authenticated only. With SAP enabled this
  // triggers reads against the SAP service and returns sample records.
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const entity = req.nextUrl.searchParams.get("entity") as EntityKey | null;

  if (!entity) {
    return NextResponse.json({
      supported_entities: ENTITY_KEYS,
      usage: "GET /api/sap/dry-run?entity=<entity_key>",
      sync_plan: SAP_SYNC_PLAN,
    });
  }

  if (!ENTITY_KEYS.includes(entity as EntityKey)) {
    return NextResponse.json(
      { error: `Unknown entity '${entity}'. Supported: ${ENTITY_KEYS.join(", ")}` },
      { status: 400 },
    );
  }

  let result: { raw: unknown[]; normalized: unknown[]; syncPlan: SapSyncMetadata | undefined };
  try {
    result = await fetchAndMap(entity);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  const { raw, normalized, syncPlan } = result;

  const sample = raw.slice(0, SAMPLE_SIZE).map((r, i) => ({
    sap_raw: r,
    normalized: normalized[i],
  }));

  const unmapped =
    raw.length > 0
      ? detectUnmappedFields(
          raw[0] as Record<string, unknown>,
          normalized[0] as Record<string, unknown>,
        )
      : [];

  return NextResponse.json({
    entity,
    total_fetched: raw.length,
    sample,
    unmapped_fields: unmapped,
    future_sync: syncPlan
      ? {
          target_table: syncPlan.phase2TargetTable,
          conflict_key: syncPlan.conflictKey,
          source_of_truth: syncPlan.sourceOfTruth,
          split_note: syncPlan.splitNote ?? null,
          phase: 2,
        }
      : null,
  });
}
