-- Phase 3.0 — Inventory Foundation
-- Extends catalog_items with stock quantities.
-- Adds suppliers and inventory_movements ledger.
-- Does NOT modify existing data; all new columns are nullable or have safe defaults.

-- ── 1. Suppliers ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.suppliers (
  id             text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name           text        NOT NULL,
  contact_person text        NOT NULL DEFAULT '',
  phone          text        NOT NULL DEFAULT '',
  email          text        NOT NULL DEFAULT '',
  notes          text        NOT NULL DEFAULT '',
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers_select" ON public.suppliers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "suppliers_all" ON public.suppliers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 2. Extend catalog_items with stock fields ─────────────────────────────────

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS current_quantity  numeric     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS minimum_quantity  numeric     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserved_quantity numeric     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_id       text        REFERENCES public.suppliers(id) ON DELETE SET NULL;

-- ── 3. Inventory movements ledger ─────────────────────────────────────────────
-- Immutable append-only ledger. No UPDATE policy.
-- Corrections are represented as new rows with movement_type = 'correction'.

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id            text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  item_id       text        NOT NULL REFERENCES public.catalog_items(id) ON DELETE RESTRICT,
  movement_type text        NOT NULL CHECK (movement_type IN (
    'receive', 'reserve', 'release_reservation',
    'consume', 'return', 'adjustment', 'correction'
  )),
  quantity      numeric     NOT NULL,
  source_type   text        NOT NULL CHECK (source_type IN (
    'order', 'work_diary', 'delivery_note',
    'manual_count', 'correction', 'production', 'return_from_field'
  )),
  source_id     text,
  notes         text        NOT NULL DEFAULT '',
  created_by    text        NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
  -- No updated_at: rows are immutable. Use a new correction row to amend.
);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_movements_select" ON public.inventory_movements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "inventory_movements_insert" ON public.inventory_movements
  FOR INSERT TO authenticated WITH CHECK (true);
-- No UPDATE or DELETE policies — the ledger is immutable.

-- ── 4. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_inventory_movements_item_id
  ON public.inventory_movements (item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_source
  ON public.inventory_movements (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_catalog_items_supplier
  ON public.catalog_items (supplier_id);

-- ── 5. Updated_at trigger for suppliers ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS suppliers_touch_updated_at ON public.suppliers;
CREATE TRIGGER suppliers_touch_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
