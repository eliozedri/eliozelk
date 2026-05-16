-- Phase 3.1b — Inventory Reservation Ledger
-- Creates inventory_reservations as the source of truth for active item reservations.
-- reserved_quantity on catalog_items remains a denormalized cache from SUM(active reservations).

CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  id               text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  item_id          text        NOT NULL REFERENCES public.catalog_items(id) ON DELETE RESTRICT,
  order_id         text        NOT NULL,        -- work_orders.id; text ref (no FK) for safety
  order_item_key   text        NOT NULL,        -- stable MiscRow.id from the order blob
  source_type      text        NOT NULL DEFAULT 'order',
  quantity         numeric     NOT NULL CHECK (quantity > 0),
  status           text        NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active','released','consumed','cancelled')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  released_at      timestamptz,
  release_reason   text,
  metadata         jsonb
);

-- Only one active reservation allowed per (item, order, row).
-- Released/consumed/cancelled rows are kept as history and are not constrained.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_inventory_reservation
  ON public.inventory_reservations(item_id, order_id, order_item_key)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_invres_item_id     ON public.inventory_reservations(item_id);
CREATE INDEX IF NOT EXISTS idx_invres_order_id    ON public.inventory_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_invres_status      ON public.inventory_reservations(status);
CREATE INDEX IF NOT EXISTS idx_invres_item_status ON public.inventory_reservations(item_id, status);

-- RLS: authenticated users can read; only service_role can write
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'inventory_reservations' AND policyname = 'authenticated_read_inv_reservations'
  ) THEN
    CREATE POLICY "authenticated_read_inv_reservations"
      ON public.inventory_reservations
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'inventory_reservations' AND policyname = 'service_role_all_inv_reservations'
  ) THEN
    CREATE POLICY "service_role_all_inv_reservations"
      ON public.inventory_reservations
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
