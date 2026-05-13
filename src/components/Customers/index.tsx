"use client";

import { useState } from "react";
import { useCustomersContext } from "@/context/CustomersContext";
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
  const { customers, syncStatus, addCustomer, deleteCustomer } = useCustomersContext();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  return (
    <div className="min-h-screen bg-[#f0f2f5] py-6 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-2xl font-bold text-gray-900">לקוחות</h1>
          <CustomersIcon />
          {syncStatus === "offline" && (
            <span className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-200 rounded-full px-2 py-0.5 font-medium">
              מצב לא מקוון — נתונים אינם מסונכרנים
            </span>
          )}
          {syncStatus === "error" && (
            <span className="text-xs bg-red-100 text-red-700 border border-red-200 rounded-full px-2 py-0.5 font-medium">
              שגיאת סנכרון — מוצגים נתונים מקומיים
            </span>
          )}
        </div>

        {(syncStatus === "offline" || syncStatus === "error") && (
          <div className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            ⚠️ המערכת אינה מחוברת לענן. שינויים שתבצע לא יישמרו עד לחזרת החיבור.
          </div>
        )}

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
