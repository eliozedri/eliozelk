-- =====================================================================
-- Fleet ↔ Finance link + expense classification layer — Phase 2/3
--
-- Additive, non-destructive. Every financial document continues to live
-- in the SINGLE central tables (supplier_documents / expense_records).
-- We only add: a link to the asset, optional links to a maintenance/
-- incident record, the upload source, and a classification layer
-- (business area + expense type). No separate per-department financial
-- tables.
--
-- The duplicate-detection engine (document_duplicate_checks +
-- src/lib/supplierDocuments/duplicateCheck.ts) already works cross-system
-- against ALL supplier_documents — no schema change needed for it.
-- =====================================================================

-- ── supplier_documents: asset link + classification ──────────────────────────
ALTER TABLE public.supplier_documents
  ADD COLUMN IF NOT EXISTS equipment_id          text REFERENCES public.equipment(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_maintenance_id text,
  ADD COLUMN IF NOT EXISTS linked_incident_id    text,
  ADD COLUMN IF NOT EXISTS upload_source         text NOT NULL DEFAULT 'general_scan',
  ADD COLUMN IF NOT EXISTS business_area         text,
  ADD COLUMN IF NOT EXISTS expense_type          text,
  ADD COLUMN IF NOT EXISTS requires_classification boolean NOT NULL DEFAULT false;

-- ── expense_records: mirror classification for reporting ──────────────────────
ALTER TABLE public.expense_records
  ADD COLUMN IF NOT EXISTS equipment_id   text REFERENCES public.equipment(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS business_area  text,
  ADD COLUMN IF NOT EXISTS expense_type   text;

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_supplier_docs_equipment
  ON public.supplier_documents (equipment_id) WHERE equipment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_docs_requires_classification
  ON public.supplier_documents (requires_classification) WHERE requires_classification = true;
CREATE INDEX IF NOT EXISTS idx_supplier_docs_upload_source
  ON public.supplier_documents (upload_source);
CREATE INDEX IF NOT EXISTS idx_expense_records_equipment
  ON public.expense_records (equipment_id) WHERE equipment_id IS NOT NULL;
