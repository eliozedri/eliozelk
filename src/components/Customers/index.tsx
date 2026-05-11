"use client";

import { useState } from "react";
import { useCustomers } from "@/hooks/useCustomers";
import { CustomerTable } from "./CustomerTable";
import { CustomerDrawer } from "./CustomerDrawer";
import type { Customer } from "@/types/customer";

function CustomersIcon() {
  return (
    <svg className="w-7 h-7 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function CustomersPage() {
  const { customers, addCustomer, deleteCustomer } = useCustomers();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  return (
    <div className="min-h-screen bg-[#f0f2f5] py-6 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-5">
          <h1 className="text-2xl font-bold text-gray-900">לקוחות</h1>
          <CustomersIcon />
        </div>

        <CustomerTable
          customers={customers}
          onAdd={addCustomer}
          onDelete={deleteCustomer}
          onSelect={setSelectedCustomer}
        />
      </div>

      <CustomerDrawer
        customer={selectedCustomer}
        isOpen={selectedCustomer !== null}
        onClose={() => setSelectedCustomer(null)}
      />
    </div>
  );
}
