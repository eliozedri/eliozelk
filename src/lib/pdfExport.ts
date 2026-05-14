import type { OrderSnapshot } from "@/types/order";
import type { WorkOrder } from "@/types/workOrder";

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
