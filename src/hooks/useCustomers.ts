"use client";

// This hook proxies to CustomersContext (the shared provider in layout.tsx).
// All direct callers have been migrated to useCustomersContext().
// This file exists only for backward compatibility — do not add new callers.
export { useCustomersContext as useCustomers } from "@/context/CustomersContext";
