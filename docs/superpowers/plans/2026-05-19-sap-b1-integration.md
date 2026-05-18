# SAP Business One Integration Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a safe, read-only, disabled-by-default SAP Business One Service Layer integration foundation for Elkayam.

**Architecture:** `src/lib/sap/` adapter layer (config → client → services → mapping) feeds two API routes (`/api/sap/health`, `/api/sap/dry-run`) and an `/integrations` admin page. All SAP calls are stateless: login → read → logout per request. No data written to Supabase.

**Tech Stack:** Next.js App Router, TypeScript, native `fetch` with `AbortController`, SAP Business One Service Layer OData v1, Supabase auth (middleware guards routes automatically).

**Spec:** `docs/superpowers/specs/2026-05-19-sap-b1-integration-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/sap/types.ts` | Create | Raw SAP OData response shapes |
| `src/lib/sap/mapping.ts` | Create | Normalized Elkayam types + mapper functions + Phase 2 sync plan |
| `src/lib/sap/config.ts` | Create | Env loader, mode guard, error types |
| `src/lib/sap/client.ts` | Create | HTTP client: login(), safeGet(), logout() |
| `src/lib/sap/services.ts` | Create | All read service methods, withSapSession() wrapper |
| `src/app/api/sap/health/route.ts` | Create | Health check endpoint — server-only |
| `src/app/api/sap/dry-run/route.ts` | Create | Dry-run preview — server-only, zero DB writes |
| `src/types/auth.ts` | Modify | Add `"integrations"` to TabId + ALL_TABS |
| `src/components/Sidebar.tsx` | Modify | Add Integrations nav item |
| `src/app/integrations/page.tsx` | Create | Integration hub UI (client component) |

---

## Task 1: SAP types layer

**Files:** Create `src/lib/sap/types.ts`, Create `src/lib/sap/mapping.ts`

- [ ] **Step 1: Create `src/lib/sap/types.ts`**

```typescript
export interface SapODataResponse<T> {
  "odata.metadata"?: string;
  value: T[];
  "odata.count"?: number;
}

export interface SapDocumentLine {
  LineNum: number;
  ItemCode: string;
  ItemDescription: string;
  Quantity: number;
  UnitPrice: number;
  LineTotal: number;
  WarehouseCode?: string;
  TaxCode?: string;
}

export interface SapBusinessPartner {
  CardCode: string;
  CardName: string;
  CardType: "cCustomer" | "cSupplier" | "cLead";
  Phone1?: string;
  Phone2?: string;
  Cellular?: string;
  EmailAddress?: string;
  Website?: string;
  FaxNumber?: string;
  Balance?: number;
  CreditLimit?: number;
  Currency?: string;
  FederalTaxID?: string;
  BillToCity?: string;
  BillToCountry?: string;
  ContactPerson?: string;
  CreateDate?: string;
  UpdateDate?: string;
  Frozen?: "tYES" | "tNO";
}

export interface SapItem {
  ItemCode: string;
  ItemName: string;
  ForeignName?: string;
  ItemType?: string;
  ItemsGroupCode?: number;
  QuantityOnStock?: number;
  QuantityOrderedFromVendors?: number;
  QuantityOrderedByCustomers?: number;
  ManageStockByWarehouse?: "tYES" | "tNO";
  PurchaseItem?: "tYES" | "tNO";
  SalesItem?: "tYES" | "tNO";
  InventoryItem?: "tYES" | "tNO";
  BarCode?: string;
  ItemWarehouseInfoCollection?: Array<{
    WarehouseCode: string;
    InStock: number;
    Committed: number;
    Ordered: number;
    MinimalStock: number;
  }>;
  UpdateDate?: string;
  CreateDate?: string;
}

export interface SapWarehouse {
  WarehouseCode: string;
  WarehouseName: string;
  Street?: string;
  City?: string;
  Country?: string;
  ZipCode?: string;
  Inactive?: "tYES" | "tNO";
  DropShip?: "tYES" | "tNO";
}

export interface SapSalesOrder {
  DocEntry: number;
  DocNum: number;
  DocDate: string;
  DocDueDate?: string;
  CardCode: string;
  CardName: string;
  NumAtCard?: string;
  DocCurrency?: string;
  DocTotal: number;
  VatSum?: number;
  PaidToDate?: number;
  DocumentStatus?: "bost_Open" | "bost_Close" | "bost_Paid" | "bost_Cancel";
  Cancelled?: "tYES" | "tNO";
  DocumentLines?: SapDocumentLine[];
  Comments?: string;
  UpdateDate?: string;
  CreateDate?: string;
}

export type SapInvoice = SapSalesOrder & {
  DueDate?: string;
  JournalMemo?: string;
};

export type SapCreditNote = SapInvoice;

export type SapDeliveryNote = Omit<SapSalesOrder, "PaidToDate">;

export interface SapIncomingPayment {
  DocEntry: number;
  DocNum?: number;
  CardCode: string;
  CardName?: string;
  DocDate: string;
  CashSum?: number;
  TransferSum?: number;
  CheckSum?: number;
  DocTotal: number;
  DocCurrency?: string;
  Cancelled?: "tYES" | "tNO";
  UpdateDate?: string;
}
```

- [ ] **Step 2: Create `src/lib/sap/mapping.ts`**

```typescript
import type {
  SapBusinessPartner,
  SapItem,
  SapWarehouse,
  SapSalesOrder,
  SapInvoice,
  SapCreditNote,
  SapDeliveryNote,
  SapIncomingPayment,
  SapDocumentLine,
} from "./types";

export interface NormalizedDocumentLine {
  lineNum: number;
  itemCode: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  warehouseCode?: string;
}

export interface NormalizedBusinessPartner {
  id: string;
  name: string;
  type: "customer" | "supplier" | "lead";
  phone?: string;
  email?: string;
  balance?: number;
  creditLimit?: number;
  currency?: string;
  vatId?: string;
  city?: string;
  country?: string;
  contactPerson?: string;
  frozen: boolean;
  createDate?: string;
  updateDate?: string;
  _sap: { CardCode: string; CardType: string };
}

export interface NormalizedItem {
  id: string;
  name: string;
  foreignName?: string;
  stockQty: number;
  isSalesItem: boolean;
  isPurchaseItem: boolean;
  isInventoryItem: boolean;
  warehouseStock: Array<{
    warehouseCode: string;
    inStock: number;
    committed: number;
    ordered: number;
  }>;
  updateDate?: string;
  _sap: { ItemCode: string };
}

export interface NormalizedWarehouse {
  id: string;
  name: string;
  city?: string;
  country?: string;
  inactive: boolean;
  dropShip: boolean;
  _sap: { WarehouseCode: string };
}

export interface NormalizedSalesOrder {
  id: string;
  docEntry: number;
  customerId: string;
  customerName: string;
  date: string;
  dueDate?: string;
  total: number;
  vatSum?: number;
  currency?: string;
  status: string;
  cancelled: boolean;
  lines: NormalizedDocumentLine[];
  comments?: string;
  updateDate?: string;
  _sap: { DocEntry: number; DocNum: number };
}

export interface NormalizedInvoice {
  id: string;
  docEntry: number;
  customerId: string;
  customerName: string;
  date: string;
  dueDate?: string;
  total: number;
  vatSum?: number;
  paidToDate?: number;
  balance?: number;
  currency?: string;
  status: string;
  cancelled: boolean;
  lines: NormalizedDocumentLine[];
  _sap: { DocEntry: number; DocNum: number };
}

export type NormalizedCreditNote = NormalizedInvoice;

export interface NormalizedDeliveryNote {
  id: string;
  docEntry: number;
  customerId: string;
  customerName: string;
  date: string;
  total: number;
  currency?: string;
  status: string;
  cancelled: boolean;
  lines: NormalizedDocumentLine[];
  _sap: { DocEntry: number; DocNum: number };
}

export interface NormalizedPayment {
  id: string;
  customerId: string;
  customerName?: string;
  date: string;
  total: number;
  currency?: string;
  cancelled: boolean;
  _sap: { DocEntry: number };
}

// ── Mapper functions ──────────────────────────────────────────────────────────

function toPartnerType(t: string): "customer" | "supplier" | "lead" {
  if (t === "cCustomer") return "customer";
  if (t === "cSupplier") return "supplier";
  return "lead";
}

function mapLine(l: SapDocumentLine): NormalizedDocumentLine {
  return {
    lineNum: l.LineNum,
    itemCode: l.ItemCode,
    description: l.ItemDescription,
    quantity: l.Quantity,
    unitPrice: l.UnitPrice,
    lineTotal: l.LineTotal,
    warehouseCode: l.WarehouseCode,
  };
}

export function mapBusinessPartner(bp: SapBusinessPartner): NormalizedBusinessPartner {
  return {
    id: bp.CardCode,
    name: bp.CardName,
    type: toPartnerType(bp.CardType),
    phone: bp.Phone1 ?? bp.Cellular,
    email: bp.EmailAddress,
    balance: bp.Balance,
    creditLimit: bp.CreditLimit,
    currency: bp.Currency,
    vatId: bp.FederalTaxID,
    city: bp.BillToCity,
    country: bp.BillToCountry,
    contactPerson: bp.ContactPerson,
    frozen: bp.Frozen === "tYES",
    createDate: bp.CreateDate,
    updateDate: bp.UpdateDate,
    _sap: { CardCode: bp.CardCode, CardType: bp.CardType },
  };
}

export function mapItem(item: SapItem): NormalizedItem {
  return {
    id: item.ItemCode,
    name: item.ItemName,
    foreignName: item.ForeignName,
    stockQty: item.QuantityOnStock ?? 0,
    isSalesItem: item.SalesItem === "tYES",
    isPurchaseItem: item.PurchaseItem === "tYES",
    isInventoryItem: item.InventoryItem === "tYES",
    warehouseStock: (item.ItemWarehouseInfoCollection ?? []).map((w) => ({
      warehouseCode: w.WarehouseCode,
      inStock: w.InStock,
      committed: w.Committed,
      ordered: w.Ordered,
    })),
    updateDate: item.UpdateDate,
    _sap: { ItemCode: item.ItemCode },
  };
}

export function mapWarehouse(wh: SapWarehouse): NormalizedWarehouse {
  return {
    id: wh.WarehouseCode,
    name: wh.WarehouseName,
    city: wh.City,
    country: wh.Country,
    inactive: wh.Inactive === "tYES",
    dropShip: wh.DropShip === "tYES",
    _sap: { WarehouseCode: wh.WarehouseCode },
  };
}

export function mapSalesOrder(order: SapSalesOrder): NormalizedSalesOrder {
  return {
    id: String(order.DocNum),
    docEntry: order.DocEntry,
    customerId: order.CardCode,
    customerName: order.CardName,
    date: order.DocDate,
    dueDate: order.DocDueDate,
    total: order.DocTotal,
    vatSum: order.VatSum,
    currency: order.DocCurrency,
    status: order.DocumentStatus ?? "unknown",
    cancelled: order.Cancelled === "tYES",
    lines: (order.DocumentLines ?? []).map(mapLine),
    comments: order.Comments,
    updateDate: order.UpdateDate,
    _sap: { DocEntry: order.DocEntry, DocNum: order.DocNum },
  };
}

export function mapInvoice(inv: SapInvoice): NormalizedInvoice {
  const total = inv.DocTotal ?? 0;
  const paid = inv.PaidToDate ?? 0;
  return {
    id: String(inv.DocNum),
    docEntry: inv.DocEntry,
    customerId: inv.CardCode,
    customerName: inv.CardName,
    date: inv.DocDate,
    dueDate: inv.DueDate ?? inv.DocDueDate,
    total,
    vatSum: inv.VatSum,
    paidToDate: paid,
    balance: total - paid,
    currency: inv.DocCurrency,
    status: inv.DocumentStatus ?? "unknown",
    cancelled: inv.Cancelled === "tYES",
    lines: (inv.DocumentLines ?? []).map(mapLine),
    _sap: { DocEntry: inv.DocEntry, DocNum: inv.DocNum },
  };
}

export function mapCreditNote(cn: SapCreditNote): NormalizedCreditNote {
  return mapInvoice(cn);
}

export function mapDeliveryNote(dn: SapDeliveryNote): NormalizedDeliveryNote {
  return {
    id: String(dn.DocNum),
    docEntry: dn.DocEntry,
    customerId: dn.CardCode,
    customerName: dn.CardName,
    date: dn.DocDate,
    total: dn.DocTotal,
    currency: dn.DocCurrency,
    status: dn.DocumentStatus ?? "unknown",
    cancelled: dn.Cancelled === "tYES",
    lines: (dn.DocumentLines ?? []).map(mapLine),
    _sap: { DocEntry: dn.DocEntry, DocNum: dn.DocNum },
  };
}

export function mapPayment(pay: SapIncomingPayment): NormalizedPayment {
  return {
    id: String(pay.DocEntry),
    customerId: pay.CardCode,
    customerName: pay.CardName,
    date: pay.DocDate,
    total: pay.DocTotal,
    currency: pay.DocCurrency,
    cancelled: pay.Cancelled === "tYES",
    _sap: { DocEntry: pay.DocEntry },
  };
}

// ── Phase 2 sync plan (documentation — not implemented in Phase 1) ────────────

export interface SapSyncMetadata {
  entity: string;
  sapKey: string;
  phase2TargetTable: string;
  conflictKey: string;
  sourceOfTruth: "sap" | "elkayam" | "split";
  splitNote?: string;
}

export const SAP_SYNC_PLAN: SapSyncMetadata[] = [
  {
    entity: "business_partners_customers",
    sapKey: "CardCode",
    phase2TargetTable: "customers",
    conflictKey: "sap_card_code",
    sourceOfTruth: "sap",
  },
  {
    entity: "business_partners_suppliers",
    sapKey: "CardCode",
    phase2TargetTable: "suppliers",
    conflictKey: "sap_card_code",
    sourceOfTruth: "sap",
  },
  {
    entity: "items",
    sapKey: "ItemCode",
    phase2TargetTable: "catalog_items",
    conflictKey: "sap_item_code",
    sourceOfTruth: "sap",
  },
  {
    entity: "warehouses",
    sapKey: "WarehouseCode",
    phase2TargetTable: "sap_warehouses",
    conflictKey: "warehouse_code",
    sourceOfTruth: "sap",
  },
  {
    entity: "orders",
    sapKey: "DocNum",
    phase2TargetTable: "sap_orders_mirror",
    conflictKey: "sap_doc_num",
    sourceOfTruth: "split",
    splitNote: "SAP owns financials; Elkayam owns operational execution",
  },
  {
    entity: "invoices",
    sapKey: "DocEntry",
    phase2TargetTable: "sap_invoices_mirror",
    conflictKey: "sap_doc_entry",
    sourceOfTruth: "sap",
  },
  {
    entity: "credit_notes",
    sapKey: "DocEntry",
    phase2TargetTable: "sap_credit_notes_mirror",
    conflictKey: "sap_doc_entry",
    sourceOfTruth: "sap",
  },
  {
    entity: "delivery_notes",
    sapKey: "DocEntry",
    phase2TargetTable: "sap_delivery_notes_mirror",
    conflictKey: "sap_doc_entry",
    sourceOfTruth: "sap",
  },
  {
    entity: "payments",
    sapKey: "DocEntry",
    phase2TargetTable: "sap_payments_mirror",
    conflictKey: "sap_doc_entry",
    sourceOfTruth: "sap",
  },
];
```

---

## Task 2: SAP config + error types

**Files:** Create `src/lib/sap/config.ts`

- [ ] **Step 1: Create `src/lib/sap/config.ts`**

```typescript
export type SapMode = "disabled" | "readonly" | "write_test" | "write_prod";

export interface SapConfig {
  mode: SapMode;
  serviceLayerUrl: string;
  companyDb: string;
  username: string;
  password: string;
}

export interface SapEnvStatus {
  mode: SapMode;
  allPresent: boolean;
  missing: string[];
}

export function getSapEnvStatus(): SapEnvStatus {
  const mode = (process.env.SAP_B1_MODE ?? "disabled") as SapMode;
  if (mode === "disabled") return { mode, allPresent: false, missing: [] };

  const required: [string, string | undefined][] = [
    ["SAP_B1_SERVICE_LAYER_URL", process.env.SAP_B1_SERVICE_LAYER_URL],
    ["SAP_B1_COMPANY_DB", process.env.SAP_B1_COMPANY_DB],
    ["SAP_B1_USERNAME", process.env.SAP_B1_USERNAME],
    ["SAP_B1_PASSWORD", process.env.SAP_B1_PASSWORD],
  ];
  const missing = required.filter(([, v]) => !v).map(([k]) => k);
  return { mode, allPresent: missing.length === 0, missing };
}

export function loadSapConfig(): SapConfig {
  const { mode, allPresent, missing } = getSapEnvStatus();

  if (mode === "disabled") throw new SapDisabledError();
  if (mode === "write_test" || mode === "write_prod") {
    throw new SapModeBlockedError(mode);
  }
  if (!allPresent) throw new SapConfigError(`Missing SAP env vars: ${missing.join(", ")}`);

  return {
    mode,
    serviceLayerUrl: process.env.SAP_B1_SERVICE_LAYER_URL!.replace(/\/$/, ""),
    companyDb: process.env.SAP_B1_COMPANY_DB!,
    username: process.env.SAP_B1_USERNAME!,
    password: process.env.SAP_B1_PASSWORD!,
  };
}

export class SapDisabledError extends Error {
  readonly code = "SAP_DISABLED" as const;
  constructor() { super("SAP integration is disabled (SAP_B1_MODE=disabled)"); }
}

export class SapModeBlockedError extends Error {
  readonly code = "SAP_MODE_BLOCKED" as const;
  constructor(mode: SapMode) { super(`SAP mode '${mode}' is reserved and not yet enabled`); }
}

export class SapConfigError extends Error {
  readonly code = "SAP_CONFIG_ERROR" as const;
  constructor(message: string) { super(message); }
}

export class SapAuthError extends Error {
  readonly code = "SAP_AUTH_ERROR" as const;
  readonly isNetworkError: boolean;
  constructor(message: string, isNetworkError = false) {
    super(message);
    this.isNetworkError = isNetworkError;
  }
}

export class SapRequestError extends Error {
  readonly code = "SAP_REQUEST_ERROR" as const;
  readonly httpStatus?: number;
  constructor(message: string, httpStatus?: number) {
    super(message);
    this.httpStatus = httpStatus;
  }
}
```

---

## Task 3: SAP HTTP client

**Files:** Create `src/lib/sap/client.ts`

- [ ] **Step 1: Create `src/lib/sap/client.ts`**

```typescript
import type { SapConfig } from "./config";
import { SapAuthError, SapRequestError } from "./config";

const TIMEOUT_MS = 10_000;

export interface SapSession {
  b1Session: string;
  routeId: string;
  baseUrl: string;
}

export async function login(config: SapConfig): Promise<SapSession> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${config.serviceLayerUrl}/Login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        CompanyDB: config.companyDb,
        UserName: config.username,
        Password: config.password,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new SapAuthError(
      `SAP login network error: ${err instanceof Error ? err.message : String(err)}`,
      true,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j?.error?.message?.value ?? "";
    } catch { /* ignore parse failure */ }
    throw new SapAuthError(`SAP login failed (${res.status}): ${detail || res.statusText}`);
  }

  const cookieHeader = res.headers.get("set-cookie") ?? "";
  const b1Session = extractCookie(cookieHeader, "B1SESSION");
  const routeId = extractCookie(cookieHeader, "ROUTEID");

  if (!b1Session) {
    throw new SapAuthError("SAP login response missing B1SESSION cookie");
  }

  return { b1Session, routeId, baseUrl: config.serviceLayerUrl };
}

export async function logout(session: SapSession): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    await fetch(`${session.baseUrl}/Logout`, {
      method: "POST",
      headers: { Cookie: cookieHeader(session) },
      signal: controller.signal,
    });
  } catch {
    // logout is best-effort; SAP sessions expire naturally
  } finally {
    clearTimeout(timer);
  }
}

export async function safeGet<T>(path: string, session: SapSession): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${session.baseUrl}${path}`, {
      method: "GET",
      headers: {
        Cookie: cookieHeader(session),
        Prefer: "odata.maxpagesize=50",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch (err) {
    throw new SapRequestError(
      `SAP request network error: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j?.error?.message?.value ?? "";
    } catch { /* ignore */ }
    throw new SapRequestError(
      `SAP GET ${path} failed (${res.status}): ${detail || res.statusText}`,
      res.status,
    );
  }

  return res.json() as Promise<T>;
}

function cookieHeader(session: SapSession): string {
  const parts = [`B1SESSION=${session.b1Session}`];
  if (session.routeId) parts.push(`ROUTEID=${session.routeId}`);
  return parts.join("; ");
}

function extractCookie(header: string, name: string): string {
  return header.match(new RegExp(`(?:^|,\\s*)${name}=([^;,]+)`, "i"))?.[1]?.trim() ?? "";
}
```

---

## Task 4: SAP service methods

**Files:** Create `src/lib/sap/services.ts`

- [ ] **Step 1: Create `src/lib/sap/services.ts`**

```typescript
import { loadSapConfig } from "./config";
import { login, logout, safeGet, type SapSession } from "./client";
import type {
  SapODataResponse,
  SapBusinessPartner,
  SapItem,
  SapWarehouse,
  SapSalesOrder,
  SapInvoice,
  SapCreditNote,
  SapDeliveryNote,
  SapIncomingPayment,
} from "./types";

const PAGE = 50;

async function withSapSession<T>(fn: (session: SapSession) => Promise<T>): Promise<T> {
  const config = loadSapConfig();
  const session = await login(config);
  try {
    return await fn(session);
  } finally {
    await logout(session);
  }
}

function qs(extra?: string, top = PAGE, skip?: number): string {
  const parts: string[] = [];
  if (extra) parts.push(extra);
  parts.push(`$top=${top}`);
  if (skip) parts.push(`$skip=${skip}`);
  return `?${parts.join("&")}`;
}

export async function getBusinessPartners(
  params?: { top?: number; skip?: number },
): Promise<SapBusinessPartner[]> {
  return withSapSession(async (s) => {
    const res = await safeGet<SapODataResponse<SapBusinessPartner>>(
      `/BusinessPartners${qs(undefined, params?.top, params?.skip)}`,
      s,
    );
    return res.value;
  });
}

export async function getCustomers(
  params?: { top?: number; skip?: number },
): Promise<SapBusinessPartner[]> {
  return withSapSession(async (s) => {
    const filter = `$filter=${encodeURIComponent("CardType eq 'cCustomer'")}`;
    const res = await safeGet<SapODataResponse<SapBusinessPartner>>(
      `/BusinessPartners${qs(filter, params?.top, params?.skip)}`,
      s,
    );
    return res.value;
  });
}

export async function getSuppliers(
  params?: { top?: number; skip?: number },
): Promise<SapBusinessPartner[]> {
  return withSapSession(async (s) => {
    const filter = `$filter=${encodeURIComponent("CardType eq 'cSupplier'")}`;
    const res = await safeGet<SapODataResponse<SapBusinessPartner>>(
      `/BusinessPartners${qs(filter, params?.top, params?.skip)}`,
      s,
    );
    return res.value;
  });
}

export async function getItems(
  params?: { top?: number; skip?: number },
): Promise<SapItem[]> {
  return withSapSession(async (s) => {
    const res = await safeGet<SapODataResponse<SapItem>>(
      `/Items${qs(undefined, params?.top, params?.skip)}`,
      s,
    );
    return res.value;
  });
}

export async function getWarehouses(): Promise<SapWarehouse[]> {
  return withSapSession(async (s) => {
    const res = await safeGet<SapODataResponse<SapWarehouse>>("/Warehouses", s);
    return res.value;
  });
}

export async function getInventorySnapshot(
  params?: { top?: number; skip?: number },
): Promise<SapItem[]> {
  return withSapSession(async (s) => {
    const select =
      "$select=ItemCode,ItemName,QuantityOnStock,QuantityOrderedFromVendors,QuantityOrderedByCustomers,ItemWarehouseInfoCollection";
    const res = await safeGet<SapODataResponse<SapItem>>(
      `/Items${qs(select, params?.top, params?.skip)}`,
      s,
    );
    return res.value;
  });
}

export async function getOpenSalesOrders(
  params?: { top?: number; skip?: number },
): Promise<SapSalesOrder[]> {
  return withSapSession(async (s) => {
    const filter = `$filter=${encodeURIComponent(
      "DocumentStatus eq 'bost_Open' and Cancelled eq 'tNO'",
    )}`;
    const res = await safeGet<SapODataResponse<SapSalesOrder>>(
      `/Orders${qs(filter, params?.top, params?.skip)}`,
      s,
    );
    return res.value;
  });
}

export async function getInvoices(
  params?: { top?: number; skip?: number; fromDate?: string },
): Promise<SapInvoice[]> {
  return withSapSession(async (s) => {
    const filters: string[] = [];
    if (params?.fromDate) filters.push(`DocDate ge '${params.fromDate}'`);
    const filter = filters.length
      ? `$filter=${encodeURIComponent(filters.join(" and "))}`
      : undefined;
    const res = await safeGet<SapODataResponse<SapInvoice>>(
      `/Invoices${qs(filter, params?.top, params?.skip)}`,
      s,
    );
    return res.value;
  });
}

export async function getCreditNotes(
  params?: { top?: number; skip?: number },
): Promise<SapCreditNote[]> {
  return withSapSession(async (s) => {
    const res = await safeGet<SapODataResponse<SapCreditNote>>(
      `/CreditNotes${qs(undefined, params?.top, params?.skip)}`,
      s,
    );
    return res.value;
  });
}

export async function getDeliveryNotes(
  params?: { top?: number; skip?: number },
): Promise<SapDeliveryNote[]> {
  return withSapSession(async (s) => {
    const res = await safeGet<SapODataResponse<SapDeliveryNote>>(
      `/DeliveryNotes${qs(undefined, params?.top, params?.skip)}`,
      s,
    );
    return res.value;
  });
}

export async function getIncomingPayments(
  params?: { top?: number; skip?: number },
): Promise<SapIncomingPayment[]> {
  return withSapSession(async (s) => {
    const res = await safeGet<SapODataResponse<SapIncomingPayment>>(
      `/IncomingPayments${qs(undefined, params?.top, params?.skip)}`,
      s,
    );
    return res.value;
  });
}
```

---

## Task 5: Health check API route

**Files:** Create `src/app/api/sap/health/route.ts`

- [ ] **Step 1: Create `src/app/api/sap/health/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getSapEnvStatus, loadSapConfig, SapAuthError } from "@/lib/sap/config";
import { login, logout, safeGet } from "@/lib/sap/client";
import type { SapODataResponse, SapBusinessPartner } from "@/lib/sap/types";

export async function GET(): Promise<NextResponse> {
  const env = getSapEnvStatus();
  const now = new Date().toISOString();

  const base = {
    mode: env.mode,
    env_vars_present: env.allPresent,
    url_reachable: null as boolean | null,
    login_success: null as boolean | null,
    sample_read_success: null as boolean | null,
    sample_entity: null as string | null,
    sample_count: null as number | null,
    checked_at: now,
    error: null as string | null,
  };

  if (env.mode === "disabled") return NextResponse.json(base);

  if (!env.allPresent) {
    return NextResponse.json({
      ...base,
      error: `Missing env vars: ${env.missing.join(", ")}`,
    });
  }

  if (env.mode === "write_test" || env.mode === "write_prod") {
    return NextResponse.json({
      ...base,
      error: `SAP mode '${env.mode}' is reserved and not yet enabled`,
    });
  }

  const config = loadSapConfig();

  let session;
  try {
    session = await login(config);
    base.url_reachable = true;
    base.login_success = true;
  } catch (err) {
    base.url_reachable = err instanceof SapAuthError && err.isNetworkError ? false : true;
    base.login_success = false;
    base.error = err instanceof Error ? err.message : String(err);
    return NextResponse.json(base);
  }

  try {
    const res = await safeGet<SapODataResponse<SapBusinessPartner>>(
      "/BusinessPartners?$top=1",
      session,
    );
    base.sample_read_success = true;
    base.sample_entity = "BusinessPartners";
    base.sample_count = res.value.length;
  } catch (err) {
    base.sample_read_success = false;
    base.error = err instanceof Error ? err.message : String(err);
  } finally {
    await logout(session);
  }

  return NextResponse.json(base);
}
```

---

## Task 6: Dry-run preview API route

**Files:** Create `src/app/api/sap/dry-run/route.ts`

- [ ] **Step 1: Create `src/app/api/sap/dry-run/route.ts`**

```typescript
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
} from "@/lib/sap/mapping";

const SAMPLE_SIZE = 3;
const DRY_RUN_TOP = 10;

type EntityKey =
  | "business_partners"
  | "customers"
  | "suppliers"
  | "items"
  | "warehouses"
  | "orders"
  | "invoices"
  | "credit_notes"
  | "delivery_notes"
  | "payments";

const ENTITY_KEYS: EntityKey[] = [
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
];

async function fetchAndMap(entity: EntityKey) {
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

function unmappedFields(raw: Record<string, unknown>, normalized: Record<string, unknown>): string[] {
  const normalizedValues = new Set(Object.values(normalized).filter((v) => typeof v !== "object"));
  return Object.keys(raw).filter((k) => {
    const v = raw[k];
    return v !== null && v !== undefined && !normalizedValues.has(v) && !(normalized as Record<string, unknown>)[k.toLowerCase()];
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const entity = req.nextUrl.searchParams.get("entity") as EntityKey | null;

  if (entity && !ENTITY_KEYS.includes(entity)) {
    return NextResponse.json(
      { error: `Unknown entity '${entity}'. Supported: ${ENTITY_KEYS.join(", ")}` },
      { status: 400 },
    );
  }

  if (!entity) {
    return NextResponse.json({
      supported_entities: ENTITY_KEYS,
      usage: "GET /api/sap/dry-run?entity=<entity_key>",
      sync_plan: SAP_SYNC_PLAN,
    });
  }

  let result;
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
      ? unmappedFields(
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
```

---

## Task 7: Auth types + Sidebar

**Files:** Modify `src/types/auth.ts`, Modify `src/components/Sidebar.tsx`

- [ ] **Step 1: Add `"integrations"` to `TabId` in `src/types/auth.ts`**

In the `TabId` type, add `| "integrations"` after `"access"`.

In `ALL_TABS`, add:
```typescript
{ id: "integrations", label: "אינטגרציות", path: "/integrations", section: "מערכת" },
```

In `ROLE_DEFAULTS` for `finance_manager`, add `"integrations"` to the tabs array.

- [ ] **Step 2: Add Integrations nav item to `src/components/Sidebar.tsx`**

Add an icon function after `LogoutIcon`:
```typescript
function IntegrationsIcon() {
  return <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="9" height="9" rx="1"/><rect x="13" y="2" width="9" height="9" rx="1"/><rect x="2" y="13" width="9" height="9" rx="1"/><path d="M17 13v4m0 4v-4m0 0h-4m4 0h4"/></svg>;
}
```

Add to `NAV_SECTIONS` under the `"מערכת"` section (before the `canManageAccess` block), or add a new entry:
In the existing `NAV_SECTIONS`, add to `"בנוסף"` section:
```typescript
{ tabId: "integrations", href: "/integrations", label: "אינטגרציות", icon: <IntegrationsIcon />, matchFn: (p) => p.startsWith("/integrations"), noBadge: true },
```

---

## Task 8: Integrations page UI

**Files:** Create `src/app/integrations/page.tsx`

- [ ] **Step 1: Create `src/app/integrations/page.tsx`**

```typescript
"use client";

import { useState, useCallback } from "react";

type HealthResult = {
  mode: string;
  env_vars_present: boolean;
  url_reachable: boolean | null;
  login_success: boolean | null;
  sample_read_success: boolean | null;
  sample_entity: string | null;
  sample_count: number | null;
  checked_at: string;
  error: string | null;
};

type DryRunResult = {
  entity: string;
  total_fetched: number;
  sample: Array<{ sap_raw: unknown; normalized: unknown }>;
  unmapped_fields: string[];
  future_sync: {
    target_table: string;
    conflict_key: string;
    source_of_truth: string;
    split_note: string | null;
    phase: number;
  } | null;
};

const NAVY = "#0d1b2e";
const ENTITIES = [
  { key: "business_partners", label: "שותפים עסקיים" },
  { key: "customers", label: "לקוחות" },
  { key: "suppliers", label: "ספקים" },
  { key: "items", label: "פריטים / קטלוג" },
  { key: "warehouses", label: "מחסנים" },
  { key: "orders", label: "הזמנות מכירה פתוחות" },
  { key: "invoices", label: "חשבוניות" },
  { key: "credit_notes", label: "זיכויים" },
  { key: "delivery_notes", label: "תעודות משלוח" },
  { key: "payments", label: "תקבולים" },
] as const;

function ModeBadge({ mode }: { mode: string }) {
  const colors: Record<string, string> = {
    disabled: "#6b7280",
    readonly: "#10b981",
    write_test: "#f59e0b",
    write_prod: "#ef4444",
  };
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide"
      style={{ backgroundColor: `${colors[mode] ?? "#6b7280"}20`, color: colors[mode] ?? "#6b7280", border: `1px solid ${colors[mode] ?? "#6b7280"}40` }}
    >
      {mode}
    </span>
  );
}

function StatusDot({ value }: { value: boolean | null }) {
  if (value === null) return <span className="text-gray-500">—</span>;
  return value
    ? <span className="text-emerald-400">✓</span>
    : <span className="text-red-400">✗</span>;
}

export default function IntegrationsPage() {
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [dryRuns, setDryRuns] = useState<Record<string, DryRunResult>>({});
  const [dryRunLoading, setDryRunLoading] = useState<Record<string, boolean>>({});
  const [dryRunErrors, setDryRunErrors] = useState<Record<string, string>>({});

  const runHealthCheck = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const res = await fetch("/api/sap/health");
      const data = await res.json();
      setHealth(data);
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : String(err));
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const runDryRun = useCallback(async (entity: string) => {
    setDryRunLoading((p) => ({ ...p, [entity]: true }));
    setDryRunErrors((p) => { const n = { ...p }; delete n[entity]; return n; });
    try {
      const res = await fetch(`/api/sap/dry-run?entity=${entity}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDryRuns((p) => ({ ...p, [entity]: data }));
    } catch (err) {
      setDryRunErrors((p) => ({ ...p, [entity]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setDryRunLoading((p) => ({ ...p, [entity]: false }));
    }
  }, []);

  return (
    <div className="min-h-screen p-6 md:p-8" style={{ backgroundColor: "#f0f4f8" }}>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: NAVY }}>אינטגרציות חיצוניות</h1>
          <p className="text-sm mt-1 text-gray-500">חיבורים למערכות ERP ומקורות נתונים חיצוניים</p>
        </div>

        {/* SAP B1 Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid #f0f4f8" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-sm" style={{ backgroundColor: NAVY }}>SAP</div>
              <div>
                <div className="font-bold text-sm" style={{ color: NAVY }}>SAP Business One</div>
                <div className="text-xs text-gray-400">Service Layer — Read Only</div>
              </div>
            </div>
            <button
              onClick={runHealthCheck}
              disabled={healthLoading}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
              style={{ backgroundColor: NAVY, color: "white" }}
            >
              {healthLoading ? "בודק..." : "בדוק חיבור"}
            </button>
          </div>

          {/* Health result */}
          {(health || healthError) && (
            <div className="px-6 py-4 space-y-3" style={{ borderBottom: "1px solid #f0f4f8" }}>
              {healthError && (
                <p className="text-sm text-red-500">שגיאה: {healthError}</p>
              )}
              {health && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <ModeBadge mode={health.mode} />
                    <span className="text-xs text-gray-400">{new Date(health.checked_at).toLocaleString("he-IL")}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: "משתני סביבה", value: health.env_vars_present },
                      { label: "כתובת URL", value: health.url_reachable },
                      { label: "התחברות", value: health.login_success },
                      { label: "קריאת נתונים", value: health.sample_read_success },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-gray-50 rounded-lg p-3 text-center">
                        <div className="text-lg"><StatusDot value={value} /></div>
                        <div className="text-xs text-gray-500 mt-1">{label}</div>
                      </div>
                    ))}
                  </div>
                  {health.error && (
                    <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{health.error}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Entity dry-run cards */}
          <div className="px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">תצוגה מקדימה של נתונים (Dry Run)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ENTITIES.map(({ key, label }) => {
                const result = dryRuns[key];
                const loading = dryRunLoading[key];
                const err = dryRunErrors[key];
                return (
                  <div key={key} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold" style={{ color: NAVY }}>{label}</span>
                      <button
                        onClick={() => runDryRun(key)}
                        disabled={loading}
                        className="text-xs px-3 py-1 rounded-lg font-medium transition-all disabled:opacity-50 border"
                        style={{ borderColor: "#1d6fd8", color: "#1d6fd8" }}
                      >
                        {loading ? "טוען..." : "הצג תצוגה מקדימה"}
                      </button>
                    </div>
                    {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
                    {result && (
                      <div className="space-y-1 mt-2">
                        <p className="text-xs text-gray-500">נמצאו {result.total_fetched} רשומות (הוצג {Math.min(result.sample.length, 3)})</p>
                        {result.future_sync && (
                          <p className="text-xs text-gray-400">
                            Phase 2: {result.future_sync.target_table} · מפתח: {result.future_sync.conflict_key}
                          </p>
                        )}
                        {result.unmapped_fields.length > 0 && (
                          <p className="text-xs text-amber-500">שדות לא ממופים: {result.unmapped_fields.slice(0, 5).join(", ")}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Phase 2 preparation note */}
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-300 mb-2">Phase 2 — סנכרון לא מופעל עדיין</p>
          <p className="text-sm text-gray-400">לאחר אישור המיפוי, Phase 2 יסנכרן נתוני SAP לטבלאות Supabase. ראה תיעוד בספציפיקציה.</p>
        </div>

      </div>
    </div>
  );
}
```

---

## Task 9: Typecheck + build

- [ ] Run typecheck: `npx tsc --noEmit`
- [ ] Fix any type errors
- [ ] Run build: `npm run build`
- [ ] Commit all changes
