-- Phase 3.4 — Purchase Recommendations & Supplier Extras
-- Safe planning layer only. No external ordering, no financial changes.

-- ── 1. Extend suppliers with optional planning fields ─────────────────────────

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS lead_time_days  integer,
  ADD COLUMN IF NOT EXISTS payment_terms   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS preferred       boolean NOT NULL DEFAULT false;

-- ── 2. purchase_recommendations — source-of-truth for reorder planning ─────────

CREATE TABLE IF NOT EXISTS public.purchase_recommendations (
  id                   text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  item_id              text        NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  supplier_id          text        REFERENCES public.suppliers(id) ON DELETE SET NULL,
  recommendation_type  text        NOT NULL CHECK (recommendation_type IN (
                                      'low_stock', 'out_of_stock', 'over_reserved',
                                      'negative_stock', 'delivery_note_gap', 'manual')),
  current_quantity     numeric     NOT NULL DEFAULT 0,
  reserved_quantity    numeric     NOT NULL DEFAULT 0,
  available_quantity   numeric     NOT NULL DEFAULT 0,
  minimum_quantity     numeric     NOT NULL DEFAULT 0,
  recommended_quantity numeric     NOT NULL DEFAULT 0,
  urgency              text        NOT NULL CHECK (urgency IN ('low','medium','high','critical')),
  status               text        NOT NULL DEFAULT 'draft'
                                   CHECK (status IN (
                                     'draft','pending_approval','approved_internal',
                                     'dismissed','converted_to_order_later','resolved')),
  reason               text        NOT NULL DEFAULT '',
  source_type          text        NOT NULL CHECK (source_type IN (
                                     'inventory_scan','manual','delivery_note','reservation')),
  source_id            text,
  created_by           text,
  approved_by          text,
  approved_at          timestamptz,
  dismissed_reason     text,
  metadata             jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Idempotency: at most one open recommendation per (item, type).
-- Dismissed/resolved/converted are archived — they don't block new recommendations.
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_recommendation_active
  ON public.purchase_recommendations(item_id, recommendation_type)
  WHERE status NOT IN ('dismissed','converted_to_order_later','resolved');

CREATE INDEX IF NOT EXISTS idx_purchase_rec_item_id    ON public.purchase_recommendations(item_id);
CREATE INDEX IF NOT EXISTS idx_purchase_rec_status     ON public.purchase_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_purchase_rec_urgency    ON public.purchase_recommendations(urgency);
CREATE INDEX IF NOT EXISTS idx_purchase_rec_supplier   ON public.purchase_recommendations(supplier_id) WHERE supplier_id IS NOT NULL;

-- ── 3. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.purchase_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_recommendations_select"
  ON public.purchase_recommendations FOR SELECT TO authenticated USING (true);

CREATE POLICY "purchase_recommendations_all_service"
  ON public.purchase_recommendations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 4. updated_at trigger ─────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'touch_purchase_recommendations_updated_at'
  ) THEN
    CREATE TRIGGER touch_purchase_recommendations_updated_at
      BEFORE UPDATE ON public.purchase_recommendations
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
  END IF;
END$$;

-- ── 5. Realtime ───────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'purchase_recommendations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_recommendations;
  END IF;
END$$;
