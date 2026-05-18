-- =====================================================================
-- Supplier Document Intake Engine — Phase 5.0
-- Covers: supplier_documents, supplier_document_lines, expense_records,
-- expense_lines, product_supplier_mappings, document_duplicate_checks,
-- document_review_events
-- Extensions to: suppliers, catalog_items, inventory_movements
-- =====================================================================

-- ── 1. Extend suppliers with full business intelligence fields ─────────────

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS vat_number    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city          text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS whatsapp      text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_details  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS website       text NOT NULL DEFAULT '';

-- ── 2. Extend catalog_items with reorder intelligence ─────────────────────

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS reorder_point  numeric,
  ADD COLUMN IF NOT EXISTS safety_stock   numeric;

-- ── 3. Extend inventory_movements source_type to accept supplier_document ──
-- Safe: drops the old check constraint and adds a new one with extended set.

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_source_type_check;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_source_type_check
  CHECK (source_type IN (
    'order', 'work_diary', 'delivery_note',
    'manual_count', 'correction', 'production',
    'return_from_field', 'supplier_document'
  ));

-- ── 4. supplier_documents — master intake record per supplier document ─────

CREATE TABLE IF NOT EXISTS public.supplier_documents (
  id                      text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  status                  text        NOT NULL DEFAULT 'draft_ready'
                            CHECK (status IN (
                              'uploaded', 'extracting', 'extraction_failed', 'draft_ready',
                              'needs_review', 'duplicate_suspected', 'approved',
                              'posted', 'rejected', 'archived'
                            )),
  document_type           text        NOT NULL DEFAULT 'unknown'
                            CHECK (document_type IN (
                              'supplier_invoice', 'tax_invoice', 'invoice_receipt', 'receipt',
                              'delivery_note', 'goods_receipt', 'supplier_quote',
                              'supplier_order_confirmation', 'unknown'
                            )),
  -- Supplier
  supplier_id             text        REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name_raw       text        NOT NULL DEFAULT '',
  supplier_vat_raw        text        NOT NULL DEFAULT '',
  -- Document header
  document_number         text        NOT NULL DEFAULT '',
  document_date           date,
  due_date                date,
  currency                text        NOT NULL DEFAULT 'ILS',
  subtotal_before_vat     numeric,
  vat_amount              numeric,
  vat_rate                numeric     DEFAULT 17,
  total_after_vat         numeric,
  payment_status          text        NOT NULL DEFAULT 'unpaid'
                            CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'unknown')),
  -- References to other entities
  linked_order_ref        text        NOT NULL DEFAULT '',
  linked_delivery_note_id text        REFERENCES public.delivery_notes(id) ON DELETE SET NULL,
  -- Extraction / OCR
  raw_text                text,
  parsed_json             jsonb,
  extraction_confidence   numeric,
  extraction_notes        text,
  -- File storage
  file_url                text,
  file_name               text        NOT NULL DEFAULT '',
  file_type               text        NOT NULL DEFAULT '',
  file_hash               text,
  -- Metadata
  notes                   text        NOT NULL DEFAULT '',
  rejection_reason        text,
  -- Posted record links
  expense_record_id       text,
  -- Audit
  created_by              text        NOT NULL DEFAULT '',
  reviewed_by             text,
  approved_by             text,
  approved_at             timestamptz,
  posted_at               timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ── 5. supplier_document_lines — one row per extracted/entered line ────────

CREATE TABLE IF NOT EXISTS public.supplier_document_lines (
  id                      text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_id             text        NOT NULL REFERENCES public.supplier_documents(id) ON DELETE CASCADE,
  line_number             integer     NOT NULL DEFAULT 1,
  original_description    text        NOT NULL DEFAULT '',
  normalized_description  text        NOT NULL DEFAULT '',
  supplier_sku            text        NOT NULL DEFAULT '',
  quantity                numeric,
  unit_of_measure         text        NOT NULL DEFAULT '',
  unit_price              numeric,
  discount_percent        numeric,
  line_subtotal           numeric,
  line_total              numeric,
  category                text        NOT NULL DEFAULT '',
  catalog_item_id         text        REFERENCES public.catalog_items(id) ON DELETE SET NULL,
  inventory_action        text        NOT NULL DEFAULT 'requires_review'
                            CHECK (inventory_action IN (
                              'increase_stock', 'no_inventory_impact', 'create_product_draft',
                              'link_to_existing_product', 'service_only', 'maintenance_expense',
                              'asset_purchase', 'requires_review'
                            )),
  status                  text        NOT NULL DEFAULT 'extracted'
                            CHECK (status IN (
                              'extracted', 'needs_review', 'matched',
                              'product_draft_created', 'excluded', 'posted'
                            )),
  confidence_score        numeric     DEFAULT 1.0,
  warning_flags           text[]      NOT NULL DEFAULT '{}',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ── 6. expense_records — financial output of approved financial documents ──

CREATE TABLE IF NOT EXISTS public.expense_records (
  id                  text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  supplier_id         text        REFERENCES public.suppliers(id) ON DELETE SET NULL,
  document_id         text        REFERENCES public.supplier_documents(id) ON DELETE SET NULL,
  document_type       text        NOT NULL DEFAULT '',
  document_number     text        NOT NULL DEFAULT '',
  expense_date        date        NOT NULL DEFAULT CURRENT_DATE,
  due_date            date,
  category            text        NOT NULL DEFAULT '',
  subtotal            numeric     NOT NULL DEFAULT 0,
  vat_amount          numeric     NOT NULL DEFAULT 0,
  total_amount        numeric     NOT NULL DEFAULT 0,
  currency            text        NOT NULL DEFAULT 'ILS',
  payment_status      text        NOT NULL DEFAULT 'unpaid'
                        CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'unknown')),
  notes               text        NOT NULL DEFAULT '',
  created_by          text        NOT NULL DEFAULT '',
  approved_by         text,
  approved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── 7. expense_lines — line-level breakdown of expense records ─────────────

CREATE TABLE IF NOT EXISTS public.expense_lines (
  id                    text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  expense_record_id     text        NOT NULL REFERENCES public.expense_records(id) ON DELETE CASCADE,
  document_line_id      text        REFERENCES public.supplier_document_lines(id) ON DELETE SET NULL,
  description           text        NOT NULL DEFAULT '',
  quantity              numeric,
  unit_of_measure       text        NOT NULL DEFAULT '',
  unit_price            numeric,
  line_total            numeric     NOT NULL DEFAULT 0,
  category              text        NOT NULL DEFAULT '',
  catalog_item_id       text        REFERENCES public.catalog_items(id) ON DELETE SET NULL,
  inventory_action      text        NOT NULL DEFAULT 'no_inventory_impact',
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ── 8. product_supplier_mappings — intelligence per product+supplier pair ──

CREATE TABLE IF NOT EXISTS public.product_supplier_mappings (
  id                      text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  catalog_item_id         text        NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  supplier_id             text        NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  supplier_sku            text        NOT NULL DEFAULT '',
  supplier_item_name      text        NOT NULL DEFAULT '',
  last_purchase_price     numeric,
  last_purchase_currency  text        NOT NULL DEFAULT 'ILS',
  last_purchase_unit      text        NOT NULL DEFAULT '',
  last_purchase_date      date,
  average_purchase_price  numeric,
  is_preferred            boolean     NOT NULL DEFAULT false,
  lead_time_days          integer,
  minimum_order_quantity  numeric,
  notes                   text        NOT NULL DEFAULT '',
  source_document_id      text        REFERENCES public.supplier_documents(id) ON DELETE SET NULL,
  confidence_score        numeric     NOT NULL DEFAULT 1.0,
  status                  text        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'inactive')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (catalog_item_id, supplier_id)
);

-- ── 9. document_duplicate_checks — duplicate detection results ─────────────

CREATE TABLE IF NOT EXISTS public.document_duplicate_checks (
  id                  text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_id         text        NOT NULL REFERENCES public.supplier_documents(id) ON DELETE CASCADE,
  candidate_id        text        REFERENCES public.supplier_documents(id) ON DELETE SET NULL,
  check_type          text        NOT NULL
                        CHECK (check_type IN (
                          'file_hash', 'supplier_doc_number',
                          'supplier_date_total', 'line_similarity'
                        )),
  match_score         numeric     NOT NULL DEFAULT 0,
  result              text        NOT NULL
                        CHECK (result IN ('duplicate', 'likely_duplicate', 'different')),
  details             text        NOT NULL DEFAULT '',
  resolved_by         text,
  resolved_at         timestamptz,
  override_approved   boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── 10. document_review_events — full audit trail ─────────────────────────

CREATE TABLE IF NOT EXISTS public.document_review_events (
  id            text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_id   text        NOT NULL REFERENCES public.supplier_documents(id) ON DELETE CASCADE,
  event_type    text        NOT NULL,
  field_name    text,
  old_value     text,
  new_value     text,
  notes         text        NOT NULL DEFAULT '',
  created_by    text        NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── 11. Indexes ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_supplier_docs_status
  ON public.supplier_documents (status);
CREATE INDEX IF NOT EXISTS idx_supplier_docs_supplier
  ON public.supplier_documents (supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_docs_date
  ON public.supplier_documents (document_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_supplier_docs_type
  ON public.supplier_documents (document_type);
CREATE INDEX IF NOT EXISTS idx_supplier_docs_hash
  ON public.supplier_documents (file_hash) WHERE file_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_docs_doc_number
  ON public.supplier_documents (supplier_id, document_number) WHERE document_number != '';

CREATE INDEX IF NOT EXISTS idx_doc_lines_document
  ON public.supplier_document_lines (document_id);
CREATE INDEX IF NOT EXISTS idx_doc_lines_catalog_item
  ON public.supplier_document_lines (catalog_item_id) WHERE catalog_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_doc_lines_status
  ON public.supplier_document_lines (status);

CREATE INDEX IF NOT EXISTS idx_expense_records_supplier
  ON public.expense_records (supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expense_records_date
  ON public.expense_records (expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expense_records_document
  ON public.expense_records (document_id) WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_supplier_item
  ON public.product_supplier_mappings (catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_product_supplier_supplier
  ON public.product_supplier_mappings (supplier_id);
CREATE INDEX IF NOT EXISTS idx_product_supplier_preferred
  ON public.product_supplier_mappings (catalog_item_id)
  WHERE is_preferred = true;

CREATE INDEX IF NOT EXISTS idx_dup_checks_document
  ON public.document_duplicate_checks (document_id);

CREATE INDEX IF NOT EXISTS idx_review_events_document
  ON public.document_review_events (document_id);

-- ── 12. updated_at triggers ───────────────────────────────────────────────

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'supplier_documents', 'supplier_document_lines',
    'expense_records', 'product_supplier_mappings'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON public.%I',
      'touch_' || t || '_updated_at', t
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',
      'touch_' || t || '_updated_at', t
    );
  END LOOP;
END$$;

-- ── 13. Row Level Security ─────────────────────────────────────────────────

ALTER TABLE public.supplier_documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_document_lines   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_records           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_lines             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_supplier_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_duplicate_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_review_events    ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read everything
CREATE POLICY "supplier_documents_select"        ON public.supplier_documents        FOR SELECT TO authenticated USING (true);
CREATE POLICY "supplier_document_lines_select"   ON public.supplier_document_lines   FOR SELECT TO authenticated USING (true);
CREATE POLICY "expense_records_select"           ON public.expense_records           FOR SELECT TO authenticated USING (true);
CREATE POLICY "expense_lines_select"             ON public.expense_lines             FOR SELECT TO authenticated USING (true);
CREATE POLICY "product_supplier_mappings_select" ON public.product_supplier_mappings FOR SELECT TO authenticated USING (true);
CREATE POLICY "document_duplicate_checks_select" ON public.document_duplicate_checks FOR SELECT TO authenticated USING (true);
CREATE POLICY "document_review_events_select"    ON public.document_review_events    FOR SELECT TO authenticated USING (true);

-- Only service_role can write (all mutations go through API routes)
CREATE POLICY "supplier_documents_service"        ON public.supplier_documents        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "supplier_document_lines_service"   ON public.supplier_document_lines   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "expense_records_service"           ON public.expense_records           FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "expense_lines_service"             ON public.expense_lines             FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "product_supplier_mappings_service" ON public.product_supplier_mappings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "document_duplicate_checks_service" ON public.document_duplicate_checks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "document_review_events_service"    ON public.document_review_events    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 14. Realtime publications ─────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'supplier_documents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.supplier_documents;
  END IF;
END$$;
