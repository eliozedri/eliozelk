"use client";

import { useState } from "react";
import { useOrderForm } from "@/hooks/useOrderForm";
import { useOrdersContext } from "@/context/OrdersContext";
import { OrderHeader } from "./OrderHeader";
import { SignTable } from "./SignTable";
import { MiscSection } from "./MiscSection";
import { FormActions } from "./FormActions";
import type { OrderHeader as OrderHeaderType } from "@/types/order";
import type { OrderPriority } from "@/types/workOrder";

function RoadIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="11" y="2" width="14" height="32" rx="2" fill="#1e3a5f" />
      <rect x="16" y="5" width="4" height="6" rx="1" fill="white" />
      <rect x="16" y="15" width="4" height="6" rx="1" fill="white" />
      <rect x="16" y="25" width="4" height="6" rx="1" fill="white" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function OrderForm() {
  const {
    order,
    updateHeader,
    addSignRow,
    updateSignRow,
    removeSignRow,
    addMiscRow,
    updateMiscRow,
    removeMiscRow,
    addAccessoryRow,
    updateAccessoryRow,
    removeAccessoryRow,
    resetOrder,
  } = useOrderForm();

  const { addOrder } = useOrdersContext();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = (priority: OrderPriority) => {
    const submitted = addOrder(order, priority);
    resetOrder();
    setSuccessMessage(`ההזמנה נשלחה למחלקת גרפיקה בהצלחה — מספר הזמנה: ${submitted.orderNumber}`);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5] py-6 px-4">
      <div className="max-w-4xl mx-auto">

        <div className="flex items-center gap-3 mb-5 no-print">
          <div>
            <div className="text-2xl font-black text-[#1e3a5f] leading-tight">אלקיים</div>
            <div className="text-xs text-gray-500 leading-tight">סימון כבישים בע״מ</div>
          </div>
          <RoadIcon />
        </div>

        <div className="flex items-center gap-2 mb-5">
          <h1 className="text-2xl font-bold text-gray-900">פתיחת הזמנת שילוט</h1>
          <svg className="w-7 h-7 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          </svg>
        </div>

        {successMessage && (
          <div className="flex items-center gap-3 mb-5 p-4 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm font-medium no-print">
            <CheckIcon />
            <span>{successMessage}</span>
            <button
              onClick={() => setSuccessMessage(null)}
              className="mr-auto text-green-600 hover:text-green-800 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        )}

        <OrderHeader
          header={{
            date: order.date,
            customer: order.customer,
            contactPerson: order.contactPerson,
            orderedBy: order.orderedBy,
            location: order.location,
            jobSlash: order.jobSlash,
            city: order.city ?? "",
            reference: order.reference,
          }}
          onChange={(partial) => updateHeader(partial as Partial<OrderHeaderType>)}
        />

        <SignTable
          rows={order.signRows}
          onAdd={addSignRow}
          onUpdate={updateSignRow}
          onRemove={removeSignRow}
        />

        <MiscSection
          title="אביזרים"
          accent="amber"
          rows={order.accessoryRows ?? []}
          onAdd={addAccessoryRow}
          onUpdate={updateAccessoryRow}
          onRemove={removeAccessoryRow}
        />

        <MiscSection
          title="שונות"
          accent="blue"
          rows={order.miscRows}
          onAdd={addMiscRow}
          onUpdate={updateMiscRow}
          onRemove={removeMiscRow}
        />

        <FormActions order={order} onReset={resetOrder} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
