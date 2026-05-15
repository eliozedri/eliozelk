import type { OrderSnapshot } from "@/types/order";
import type { WorkOrder } from "@/types/workOrder";

function csvEscape(val: string | number | null | undefined): string {
  const s = String(val ?? "");
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportWorkOrderCSV(order: WorkOrder): void {
  const rows: string[] = [];
  const header = ["סוג פריט", "מספר/תיאור", "כמות", "יחידה", "מידה", "סוג", "הערות"];
  rows.push(header.map(csvEscape).join(","));

  for (const r of order.signRows) {
    if (!r.signNumber && !r.quantity) continue;
    rows.push([
      "שלט", r.signNumber || "", r.quantity || "1", "יחידה", r.size || "", r.type || "", r.notes || ""
    ].map(csvEscape).join(","));
  }
  for (const r of (order.accessoryRows ?? [])) {
    if (!r.description) continue;
    rows.push(["אביזר", r.description, r.quantity || "1", r.catalogItemUnit || "יחידה", "", "", r.notes || ""].map(csvEscape).join(","));
  }
  for (const r of order.miscRows) {
    if (!r.description) continue;
    rows.push(["שונות", r.description, r.quantity || "1", r.catalogItemUnit || "יחידה", "", "", r.notes || ""].map(csvEscape).join(","));
  }

  const meta = [
    `# הזמנה: ${order.orderNumber}`,
    `# לקוח: ${order.customer}`,
    order.jobName ? `# שם עבודה: ${order.jobName}` : "",
    order.location ? `# מיקום: ${order.location}` : "",
    `# תאריך: ${order.date}`,
    "",
  ].filter((l) => l !== undefined);

  const bom = "﻿";
  const content = bom + meta.join("\n") + rows.join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `הזמנה_${order.orderNumber}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportOrderPDF(order: OrderSnapshot): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { OrderDocument } = await import("@/components/pdf/OrderDocument");
  const { createElement } = await import("react");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await pdf(createElement(OrderDocument, { order }) as any).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const filename = order.date || "order";
  a.download = `order_${filename}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function openWorkOrderPDF(order: WorkOrder): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { OrderDocument } = await import("@/components/pdf/OrderDocument");
  const { createElement } = await import("react");

  const snapshot: OrderSnapshot = {
    date: order.date,
    customer: order.customer,
    contactPerson: order.contactPerson ?? "",
    orderedBy: order.orderedBy ?? "",
    city: order.city ?? "",
    jobName: order.jobName ?? "",
    location: order.location ?? "",
    signRows: order.signRows ?? [],
    accessoryRows: order.accessoryRows ?? [],
    miscRows: order.miscRows ?? [],
    generalNotes: order.generalNotes ?? "",
    attachments: order.attachments ?? [],
    fabricationRequired: order.fabricationRequired ?? false,
    fabricationDetails: order.fabricationDetails ?? {
      description: "", width: "", height: "", quantity: "", material: "", notes: "",
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await pdf(createElement(OrderDocument, { order: snapshot }) as any).toBlob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  // Revoke after a short delay to allow the browser to load it
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
