-- Phase 4.0 CFO Lite: cost_price + profitability_snapshots

-- 1. Add cost_price to catalog_items (financial attribute — not inventory logic)
ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS cost_price numeric DEFAULT NULL;

-- 2. Create profitability_snapshots (analytical only — does not affect billing)
CREATE TABLE IF NOT EXISTS public.profitability_snapshots (
  id                    text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id              text        NOT NULL,
  work_diary_id         text        DEFAULT NULL,
  customer_id           text        DEFAULT NULL,
  revenue               numeric     NOT NULL DEFAULT 0,
  labor_cost            numeric     NOT NULL DEFAULT 0,
  material_cost         numeric     NOT NULL DEFAULT 0,
  vehicle_cost          numeric     NOT NULL DEFAULT 0,
  equipment_cost        numeric     NOT NULL DEFAULT 0,
  subcontractor_cost    numeric     NOT NULL DEFAULT 0,
  other_cost            numeric     NOT NULL DEFAULT 0,
  overhead_cost         numeric     NOT NULL DEFAULT 0,
  total_cost            numeric     NOT NULL DEFAULT 0,
  gross_profit          numeric     NOT NULL DEFAULT 0,
  gross_margin_percent  numeric     NOT NULL DEFAULT 0,
  confidence_level      text        NOT NULL DEFAULT 'missing_data'
                        CHECK (confidence_level IN ('high', 'medium', 'low', 'missing_data')),
  missing_data          jsonb       NOT NULL DEFAULT '[]',
  source_data           jsonb       NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- One order-level snapshot per order (work_diary_id IS NULL = order-level)
CREATE UNIQUE INDEX IF NOT EXISTS uq_profitability_snapshot_order
  ON public.profitability_snapshots (order_id)
  WHERE work_diary_id IS NULL;

-- RLS: anon can read; service_role has full access via bypass
ALTER TABLE public.profitability_snapshots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profitability_snapshots' AND policyname = 'anon read snapshots'
  ) THEN
    EXECUTE 'CREATE POLICY "anon read snapshots" ON public.profitability_snapshots
      FOR SELECT TO anon USING (true)';
  END IF;
END $$;
