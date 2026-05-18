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

function buildQs(extra?: string, top = PAGE, skip?: number): string {
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
      `/BusinessPartners${buildQs(undefined, params?.top, params?.skip)}`,
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
      `/BusinessPartners${buildQs(filter, params?.top, params?.skip)}`,
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
      `/BusinessPartners${buildQs(filter, params?.top, params?.skip)}`,
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
      `/Items${buildQs(undefined, params?.top, params?.skip)}`,
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
      `/Items${buildQs(select, params?.top, params?.skip)}`,
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
      `/Orders${buildQs(filter, params?.top, params?.skip)}`,
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
      `/Invoices${buildQs(filter, params?.top, params?.skip)}`,
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
      `/CreditNotes${buildQs(undefined, params?.top, params?.skip)}`,
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
      `/DeliveryNotes${buildQs(undefined, params?.top, params?.skip)}`,
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
      `/IncomingPayments${buildQs(undefined, params?.top, params?.skip)}`,
      s,
    );
    return res.value;
  });
}
