"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";

// A financial document row as shown in הנהלת כספים. Mirrors the central
// supplier_documents table (snake_case) plus the joined supplier name.
export interface FinancialDocRow {
  id: string;
  status: string;
  document_type: string;
  supplier_id: string | null;
  supplier_name_raw: string;
  document_number: string;
  document_date: string | null;
  currency: string;
  subtotal_before_vat: number | null;
  vat_amount: number | null;
  total_after_vat: number | null;
  payment_status: string;
  file_url: string | null;
  file_name: string;
  equipment_id: string | null;
  linked_maintenance_id: string | null;
  linked_incident_id: string | null;
  upload_source: string | null;
  business_area: string | null;
  expense_type: string | null;
  requires_classification: boolean;
  created_at: string;
  suppliers?: { name: string } | null;
}

const SELECT = `
  id, status, document_type, supplier_id, supplier_name_raw, document_number,
  document_date, currency, subtotal_before_vat, vat_amount, total_after_vat,
  payment_status, file_url, file_name, equipment_id, linked_maintenance_id,
  linked_incident_id, upload_source, business_area, expense_type,
  requires_classification, created_at,
  suppliers ( name )
`;

export function useFinancialDocuments() {
  const [documents, setDocuments] = useState<FinancialDocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const db = getSupabase();
    if (!db) { setLoading(false); return; }
    const { data, error: err } = await db
      .from("supplier_documents")
      .select(SELECT)
      .not("status", "in", '("archived")')
      .order("created_at", { ascending: false })
      .limit(500);
    if (err) setError(err.message);
    else { setDocuments((data ?? []) as unknown as FinancialDocRow[]); setError(null); }
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
    const db = getSupabase();
    if (!db) return;
    const channel = db
      .channel("financial-docs-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "supplier_documents" }, () => refetch())
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, [refetch]);

  return { documents, loading, error, refetch };
}
