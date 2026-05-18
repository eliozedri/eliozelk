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

// ── Phase 2 sync plan (documented, not implemented in Phase 1) ────────────────

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
