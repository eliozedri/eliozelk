import type { AccountingReportData } from "@/components/pdf/AccountingDocument";
import type { WorkOrder } from "@/types/workOrder";

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

export function exportCustomerBillingCSV(customerName: string, orders: WorkOrder[]): void {
  const rows: string[] = [];
  const generatedDate = formatDate(new Date().toISOString().split("T")[0]);

  const header = [
    "מספר הזמנה", "שם עבודה", "מיקום", "תאריך", "שלטים", "שונות", "הכנסה משוערת"
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

export function exportAccountingCSV(data: AccountingReportData): void {
  const rows: string[] = [];

  const header = [
    "מספר הזמנה",
    "לקוח",
    "מיקום",
    "תאריך הזמנה",
    "סטטוס",
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
