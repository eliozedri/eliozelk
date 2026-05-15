import type { AccountingReportData } from "@/components/pdf/AccountingDocument";
import type { CustomerBillingData } from "@/components/pdf/CustomerBillingDocument";
import type { WorkOrder } from "@/types/workOrder";

async function getXlsx() {
  return (await import("xlsx")).default ?? (await import("xlsx"));
}

const STATUS_LABELS_HE: Record<string, string> = {
  graphics_pending: "ממתין לגרפיקה",
  graphics_active: "בטיפול גרפיקה",
  graphics_done: "גרפיקה הושלמה",
  production: "בייצור",
  ready_installation: "מוכן להתקנה",
  completed: "הושלם",
  cancelled: "בוטל",
};

function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function csvEscape(val: string | number | null | undefined): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function exportCustomerBillingPDF(data: CustomerBillingData): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { CustomerBillingDocument } = await import("@/components/pdf/CustomerBillingDocument");
  const { createElement } = await import("react");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await pdf(createElement(CustomerBillingDocument, { data }) as any).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const d = formatDate(data.generatedAt.split("T")[0]).replace(/\//g, "-");
  a.download = `חיוב_${data.customerName}_${d}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportAccountingPDF(data: AccountingReportData): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { AccountingDocument } = await import("@/components/pdf/AccountingDocument");
  const { createElement } = await import("react");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await pdf(createElement(AccountingDocument, { data }) as any).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `דוח_עבודות_${formatDate(data.generatedAt.split("T")[0]).replace(/\//g, "-")}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportCustomerBillingExcel(customerName: string, orders: WorkOrder[]): Promise<void> {
  const XLSX = await getXlsx();
  const generatedDate = formatDate(new Date().toISOString().split("T")[0]);

  const rows = orders.map((o) => ({
    "מספר הזמנה":    o.orderNumber,
    "שם עבודה":      (o as { jobName?: string | null }).jobName || "",
    "מיקום":          o.location || "",
    "תאריך":          formatDate(o.date),
    "שלטים":          o.signRows.reduce((s, r) => s + (parseInt(r.quantity) || 0), 0),
    "שונות":          o.miscRows.reduce((s, r) => s + (parseInt(r.quantity) || 0), 0),
    "סטטוס":          STATUS_LABELS_HE[o.status] || o.status,
    "סכום לחיוב ₪":   o.billedAmount ?? "",
    "הערת מנהל":     (o as { generalNotes?: string }).generalNotes || "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "חיוב");
  XLSX.writeFile(wb, `חיוב_${customerName}_${generatedDate.replace(/\//g, "-")}.xlsx`);
}

export function exportCustomerBillingCSV(customerName: string, orders: WorkOrder[]): void {
  const rows: string[] = [];
  const generatedDate = formatDate(new Date().toISOString().split("T")[0]);

  const header = [
    "מספר הזמנה", "שם עבודה", "מיקום", "תאריך", "שלטים", "שונות", "הכנסה משוערת", "הערת מנהל"
  ];
  rows.push(header.map(csvEscape).join(","));

  for (const o of orders) {
    const signQty = o.signRows.reduce((s, r) => s + (parseInt(r.quantity) || 0), 0);
    const miscQty = o.miscRows.reduce((s, r) => s + (parseInt(r.quantity) || 0), 0);
    rows.push([
      o.orderNumber,
      (o as { jobName?: string | null }).jobName || "",
      o.location || "",
      formatDate(o.date),
      String(signQty),
      String(miscQty),
      "",
      (o as { generalNotes?: string }).generalNotes || "",
    ].map(csvEscape).join(","));
  }

  const bom = "﻿";
  const content = bom + rows.join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `חיוב_${customerName}_${generatedDate.replace(/\//g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportAccountingExcel(data: AccountingReportData): Promise<void> {
  const XLSX = await getXlsx();

  const rows: Record<string, string | number>[] = [];
  for (const order of data.orders) {
    const baseSign = {
      "מספר הזמנה": order.orderNumber,
      "לקוח": order.customer,
      "מיקום": order.location || "",
      "תאריך": formatDate(order.date),
      "סטטוס": STATUS_LABELS_HE[order.status] || order.status,
      "הערת מנהל": (order as { generalNotes?: string }).generalNotes || "",
    };
    for (const sign of order.signRows) {
      if (!sign.signNumber && !sign.quantity) continue;
      rows.push({ ...baseSign, "סוג": "שלט", "פריט": sign.signNumber || "", "כמות": sign.quantity || "0", "יחידה": "יחידה", "הערות": sign.notes || "" });
    }
    for (const misc of order.miscRows) {
      if (!misc.description) continue;
      rows.push({ ...baseSign, "סוג": "שונות", "פריט": misc.description, "כמות": misc.quantity || "0", "יחידה": misc.catalogItemUnit || "", "הערות": misc.notes || "" });
    }
    if (!order.signRows.length && !order.miscRows.length) {
      rows.push({ ...baseSign, "סוג": "", "פריט": "", "כמות": "", "יחידה": "", "הערות": "" });
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "עבודות");
  const d = formatDate(data.generatedAt.split("T")[0]).replace(/\//g, "-");
  XLSX.writeFile(wb, `דוח_עבודות_${d}.xlsx`);
}

export function exportAccountingCSV(data: AccountingReportData): void {
  const rows: string[] = [];

  const header = [
    "מספר הזמנה",
    "לקוח",
    "מיקום",
    "תאריך הזמנה",
    "סטטוס",
    "הערת מנהל",
    "סוג פריט",
    "שם פריט",
    "כמות",
    "יחידה",
    "הערות",
  ];
  rows.push(header.map(csvEscape).join(","));

  function addOrderRows(order: WorkOrder) {
    const base = [
      order.orderNumber,
      order.customer,
      order.location || "",
      formatDate(order.date),
      STATUS_LABELS_HE[order.status] || order.status,
      (order as { generalNotes?: string }).generalNotes || "",
    ];

    for (const sign of order.signRows) {
      if (!sign.signNumber && !sign.quantity) continue;
      rows.push(
        [
          ...base,
          "שלט",
          sign.signNumber || "",
          sign.quantity || "0",
          "יחידה",
          sign.notes || "",
        ]
          .map(csvEscape)
          .join(",")
      );
    }

    for (const misc of order.miscRows) {
      if (!misc.description) continue;
      rows.push(
        [
          ...base,
          "שונות",
          misc.description,
          misc.quantity || "0",
          misc.catalogItemUnit || "",
          misc.notes || "",
        ]
          .map(csvEscape)
          .join(",")
      );
    }
  }

  for (const order of data.orders) {
    addOrderRows(order);
  }

  const bom = "﻿";
  const content = bom + rows.join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `דוח_עבודות_${formatDate(data.generatedAt.split("T")[0]).replace(/\//g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
