-- Phase 3.2 — Inventory Consumption & Field Diary Reconciliation
-- Source of truth for consumption state.
-- inventory_movements remains the immutable ledger.
-- All statements are idempotent (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS public.inventory_consumptions (
  id               text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  item_id          text        NOT NULL REFERENCES public.catalog_items(id) ON DELETE RESTRICT,
  order_id         text        NOT NULL,
  work_diary_id    text        REFERENCES public.work_diaries(id) ON DELETE RESTRICT,
  reservation_id   text        REFERENCES public.inventory_reservations(id) ON DELETE SET NULL,
  order_item_key   text,
  diary_item_key   text,
  quantity         numeric     NOT NULL CHECK (quantity > 0),
  status           text        NOT NULL DEFAULT 'pending_review'
                               CHECK (status IN ('pending_review','consumed','reversed','cancelled')),
  source_type      text        NOT NULL DEFAULT 'work_diary'
                               CHECK (source_type IN ('work_diary','production','manual_review')),
  consumed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  metadata         jsonb
);

-- Prevent duplicate active/consumed consumption for same order item.
-- One consumption per (order_id, order_item_key) at most.
-- Reversed/cancelled rows are excluded — allow re-consumption after reversal.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_inventory_consumption
  ON public.inventory_consumptions(order_id, order_item_key)
  WHERE status IN ('pending_review', 'consumed');

CREATE INDEX IF NOT EXISTS idx_invcons_item_id
  ON public.inventory_consumptions(item_id);
CREATE INDEX IF NOT EXISTS idx_invcons_order_id
  ON public.inventory_consumptions(order_id);
CREATE INDEX IF NOT EXISTS idx_invcons_diary_id
  ON public.inventory_consumptions(work_diary_id) WHERE work_diary_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invcons_status
  ON public.inventory_consumptions(status);
CREATE INDEX IF NOT EXISTS idx_invcons_item_status
  ON public.inventory_consumptions(item_id, status);

ALTER TABLE public.inventory_consumptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_consumptions_select" ON public.inventory_consumptions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "inventory_consumptions_service_all" ON public.inventory_consumptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Realtime for Warehouse UI live updates
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'inventory_consumptions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_consumptions;
  END IF;
END $$;
