"use client";

import { createContext, useContext } from "react";
import { useOrders } from "@/hooks/useOrders";
import type { OrderState } from "@/types/order";
import type { WorkOrder, WorkOrderStatus, OrderPriority, OrderProblemStatus, OrderProblemCategory, OrderActivityType } from "@/types/workOrder";

interface OrdersContextValue {
  orders: WorkOrder[];
  addOrder: (snapshot: OrderState, priority?: OrderPriority, notes?: string) => Promise<WorkOrder>;
  acknowledgeOrder: (id: string, acknowledgedBy?: string) => Promise<void>;
  completeGraphics: (id: string) => Promise<void>;
  approveCustomerOrder: (id: string) => Promise<void>;
  updateOrderStatus: (id: string, status: WorkOrderStatus) => Promise<void>;
  updateOrderFields: (id: string, fields: Partial<WorkOrder>) => Promise<void>;
  releaseWarehouseOrder: (id: string) => Promise<void>;
  addOrderActivity: (id: string, type: OrderActivityType, description: string, opts?: { by?: string; department?: string; meta?: Record<string, string> }) => void;
  addOrderProblem: (id: string, problem: { department: "graphics" | "fabrication" | "office"; category: OrderProblemCategory; description: string; reportedBy?: string }) => void;
  resolveOrderProblem: (orderId: string, problemId: string, opts?: { resolvedBy?: string; resolutionNotes?: string; newStatus?: OrderProblemStatus }) => void;
  deleteOrder: (id: string) => Promise<void>;
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
