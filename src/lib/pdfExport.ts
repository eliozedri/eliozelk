import type { OrderSnapshot } from "@/types/order";

export async function exportOrderPDF(order: OrderSnapshot): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { OrderDocument } = await import("@/components/pdf/OrderDocument");
  const { createElement } = await import("react");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await pdf(createElement(OrderDocument, { order }) as any).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const filename = order.reference || order.date || "order";
  a.download = `order_${filename}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
