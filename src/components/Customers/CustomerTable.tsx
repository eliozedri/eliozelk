"use client";

import { useState } from "react";
import type { Customer, CustomerFormState } from "@/types/customer";
import { AddCustomerForm } from "./AddCustomerForm";

function CustomersIcon() {
  return (
    <svg className="w-5 h-5 text-blue-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("he-IL");
  } catch {
    return iso;
  }
}

interface Props {
  customers: Customer[];
  onAdd: (form: CustomerFormState) => Promise<unknown>;
  onDelete: (id: string) => Promise<void>;
  onSelect: (customer: Customer) => void;
}

export function CustomerTable({ customers, onAdd, onDelete, onSelect }: Props) {
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setDeleteError(null);
    setDeletingId(id);
    try {
      await onDelete(id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "שגיאה במחיקת הלקוח");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-4 overflow-x-auto">
      {/* Section header */}
      <div className="flex items-center gap-2 px-5 py-3.5 bg-blue-50 rounded-t-xl border-b border-blue-100">
        <h2 className="text-base font-bold text-blue-900">לקוחות</h2>
        <CustomersIcon />
      </div>

      {/* Add customer form */}
      <AddCustomerForm onAdd={onAdd} />

      {deleteError && (
        <div className="mx-5 mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {deleteError}
        </div>
      )}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-3 py-2.5 text-sm font-medium text-gray-500 text-right">שם לקוח</th>
            <th className="px-3 py-2.5 text-sm font-medium text-gray-500 text-right">מיקום</th>
            <th className="px-3 py-2.5 text-sm font-medium text-gray-500 text-right w-36">טלפון</th>
            <th className="px-3 py-2.5 text-sm font-medium text-gray-500 text-right">הזמנה אחרונה</th>
            <th className="px-3 py-2.5 text-sm font-medium text-gray-500 text-right w-32">תאריך הוספה</th>
            <th className="w-10 no-print"></th>
          </tr>
        </thead>
        <tbody>
          {customers.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-5 py-10 text-center text-gray-400 text-sm">
                לא נמצאו לקוחות. הוסף את הלקוח הראשון.
              </td>
            </tr>
          ) : (
            customers.map((customer) => (
              <tr
                key={customer.id}
                onClick={() => onSelect(customer)}
                className="border-b border-gray-100 hover:bg-blue-50/40 transition-colors cursor-pointer"
              >
                <td className="px-3 py-2.5 font-medium text-gray-900">{customer.name}</td>
                <td className="px-3 py-2.5 text-gray-600">{customer.location || "—"}</td>
                <td className="px-3 py-2.5 text-gray-600" dir="ltr">{customer.phone}</td>
                <td className="px-3 py-2.5 text-gray-600">{customer.lastOrder || "—"}</td>
                <td className="px-3 py-2.5 text-gray-500 text-xs">{formatDate(customer.createdAt)}</td>
                <td className="px-2 py-2.5 w-10 no-print">
                  <button
                    type="button"
                    title="מחק לקוח"
                    disabled={deletingId === customer.id}
                    onClick={(e) => handleDelete(e, customer.id)}
                    className="flex items-center justify-center w-8 h-8 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                  >
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
