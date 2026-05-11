"use client";

import { createContext, useContext } from "react";
import { useOrders } from "@/hooks/useOrders";
import type { OrderState } from "@/types/order";
import type { WorkOrder, WorkOrderStatus, OrderPriority } from "@/types/workOrder";

interface OrdersContextValue {
  orders: WorkOrder[];
  addOrder: (snapshot: OrderState, priority?: OrderPriority, notes?: string) => WorkOrder;
  acknowledgeOrder: (id: string, acknowledgedBy?: string) => void;
  completeGraphics: (id: string) => void;
  updateOrderStatus: (id: string, status: WorkOrderStatus) => void;
  updateOrderFields: (id: string, fields: Partial<WorkOrder>) => void;
}

const OrdersContext = createContext<OrdersContextValue | null>(null);

export function OrdersProvider({ children }: { children: React.ReactNode }) {
  const value = useOrders();
  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export function useOrdersContext(): OrdersContextValue {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error("useOrdersContext must be used inside OrdersProvider");
  return ctx;
}
