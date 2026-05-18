// Duplicate detection for supplier documents.
// Checks by file hash, supplier+document number, and supplier+date+total.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DuplicateCheckResult } from "@/types/supplierDocument";

interface DuplicateCheckInput {
  documentId: string;
  fileHash?: string;
  supplierId?: string;
  supplierNameRaw?: string;
  documentNumber?: string;
  documentDate?: string;
  totalAfterVat?: number;
}

interface DbDocRow {
  id: string;
  document_number: string;
  supplier_name_raw: string;
  document_date: string | null;
  total_after_vat: number | null;
  status: string;
}

export async function runDuplicateCheck(
  db: SupabaseClient,
  input: DuplicateCheckInput
): Promise<DuplicateCheckResult> {
  const candidates: DuplicateCheckResult["candidates"] = [];
  const checkedIds = new Set<string>();

  // ── Check 1: exact file hash ────────────────────────────────────────────
  if (input.fileHash) {
    const { data } = await db
      .from("supplier_documents")
      .select("id,document_number,supplier_name_raw,document_date,total_after_vat,status")
      .eq("file_hash", input.fileHash)
      .neq("id", input.documentId)
      .not("status", "in", '("rejected","archived")')
      .limit(5);

    for (const row of (data ?? []) as DbDocRow[]) {
      if (!checkedIds.has(row.id)) {
        checkedIds.add(row.id);
        candidates.push({
          documentId: row.id,
          documentNumber: row.document_number,
          supplierName: row.supplier_name_raw,
          date: row.document_date ?? undefined,
          total: row.total_after_vat ?? undefined,
          matchReason: "קובץ זהה (hash)",
          matchScore: 1.0,
        });
        // Save the check record
        await db.from("document_duplicate_checks").insert({
          document_id: input.documentId,
          candidate_id: row.id,
          check_type: "file_hash",
          match_score: 1.0,
          result: "duplicate",
          details: "זיהוי קובץ זהה — hash SHA-256 זהה",
        });
      }
    }
  }

  // ── Check 2: same supplier + document number ────────────────────────────
  if (input.documentNumber && input.documentNumber.trim() !== "") {
    let q = db
      .from("supplier_documents")
      .select("id,document_number,supplier_name_raw,document_date,total_after_vat,status")
      .eq("document_number", input.documentNumber.trim())
      .neq("id", input.documentId)
      .not("status", "in", '("rejected","archived")')
      .limit(5);

    if (input.supplierId) {
      q = q.eq("supplier_id", input.supplierId);
    } else if (input.supplierNameRaw) {
      q = q.ilike("supplier_name_raw", `%${input.supplierNameRaw.trim().substring(0, 20)}%`);
    }

    const { data } = await q;
    for (const row of (data ?? []) as DbDocRow[]) {
      if (!checkedIds.has(row.id)) {
        checkedIds.add(row.id);
        candidates.push({
          documentId: row.id,
          documentNumber: row.document_number,
          supplierName: row.supplier_name_raw,
          date: row.document_date ?? undefined,
          total: row.total_after_vat ?? undefined,
          matchReason: "ספק + מספר מסמך זהים",
          matchScore: 0.95,
        });
        await db.from("document_duplicate_checks").insert({
          document_id: input.documentId,
          candidate_id: row.id,
          check_type: "supplier_doc_number",
          match_score: 0.95,
          result: "duplicate",
          details: `מספר מסמך זהה: ${input.documentNumber}`,
        });
      }
    }
  }

  // ── Check 3: same supplier + date + total (within tolerance) ───────────
  if (input.supplierId && input.documentDate && input.totalAfterVat != null) {
    const tol = input.totalAfterVat * 0.01; // 1% tolerance
    const { data } = await db
      .from("supplier_documents")
      .select("id,document_number,supplier_name_raw,document_date,total_after_vat,status")
      .eq("supplier_id", input.supplierId)
      .eq("document_date", input.documentDate)
      .gte("total_after_vat", input.totalAfterVat - tol)
      .lte("total_after_vat", input.totalAfterVat + tol)
      .neq("id", input.documentId)
      .not("status", "in", '("rejected","archived")')
      .limit(5);

    for (const row of (data ?? []) as DbDocRow[]) {
      if (!checkedIds.has(row.id)) {
        checkedIds.add(row.id);
        candidates.push({
          documentId: row.id,
          documentNumber: row.document_number,
          supplierName: row.supplier_name_raw,
          date: row.document_date ?? undefined,
          total: row.total_after_vat ?? undefined,
          matchReason: "ספק + תאריך + סכום דומים",
          matchScore: 0.8,
        });
        await db.from("document_duplicate_checks").insert({
          document_id: input.documentId,
          candidate_id: row.id,
          check_type: "supplier_date_total",
          match_score: 0.8,
          result: "likely_duplicate",
          details: `תאריך: ${input.documentDate} | סכום: ${input.totalAfterVat}`,
        });
      }
    }
  }

  return {
    hasDuplicate: candidates.length > 0,
    candidates,
  };
}
