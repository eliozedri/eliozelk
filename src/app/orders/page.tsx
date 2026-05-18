import { OrdersTable } from "@/components/OrdersTable";
import { OrdersTableV2 } from "@/components/OrdersTable/OrdersTableV2";

export default function OrdersPage() {
  return (
    <>
      <OrdersTable />
      <OrdersTableV2 />
    </>
  );
}
