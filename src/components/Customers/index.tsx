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
    <div className="min-h-screen py-6 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-2xl font-bold scene-title">לקוחות</h1>
          <CustomersIcon />
          {syncStatus === "offline" && (
            <span className="text-xs bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/40 rounded-full px-2 py-0.5 font-medium backdrop-blur">
              מצב לא מקוון — נתונים אינם מסונכרנים
            </span>
          )}
          {syncStatus === "error" && (
            <span className="text-xs bg-red-500/15 text-red-300 ring-1 ring-red-400/40 rounded-full px-2 py-0.5 font-medium backdrop-blur">
              שגיאת סנכרון — מוצגים נתונים מקומיים
            </span>
          )}
        </div>

        {(syncStatus === "offline" || syncStatus === "error") && (
          <div className="mb-4 text-sm text-amber-200 bg-amber-500/12 border border-amber-400/30 rounded-lg px-4 py-3 backdrop-blur">
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
