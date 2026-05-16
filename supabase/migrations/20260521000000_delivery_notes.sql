-- Phase 3.3 — Delivery Notes Foundation
-- Creates delivery_notes and delivery_note_items tables.
-- Receiving stock is gated: only approved notes increase current_quantity.
-- Idempotency: unique partial index prevents double receiving per item.

-- ── delivery_notes ────────────────────────────────────────────────────────────

CREATE TABLE delivery_notes (
  id              text        PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  supplier_id     text        REFERENCES suppliers(id),
  supplier_name   text,
  document_number text,
  received_date   date        NOT NULL DEFAULT CURRENT_DATE,
  status          text        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','counted','approved','cancelled')),
  notes           text        NOT NULL DEFAULT '',
  created_by      text        NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── delivery_note_items ───────────────────────────────────────────────────────

CREATE TABLE delivery_note_items (
  id                  text        PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  delivery_note_id    text        NOT NULL REFERENCES delivery_notes(id) ON DELETE CASCADE,
  item_id             text        REFERENCES catalog_items(id),
  description         text        NOT NULL DEFAULT '',
  ordered_quantity    numeric,
  delivered_quantity  numeric,
  counted_quantity    numeric,
  unit_of_measure     text,
  status              text        NOT NULL DEFAULT 'pending_mapping'
                                  CHECK (status IN ('pending_mapping','counted','approved','mismatch')),
  metadata            jsonb       NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX idx_delivery_notes_status       ON delivery_notes(status);
CREATE INDEX idx_delivery_notes_supplier     ON delivery_notes(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX idx_delivery_notes_date         ON delivery_notes(received_date DESC);
CREATE INDEX idx_dn_items_note              ON delivery_note_items(delivery_note_id);
CREATE INDEX idx_dn_items_item              ON delivery_note_items(item_id) WHERE item_id IS NOT NULL;
CREATE INDEX idx_dn_items_status            ON delivery_note_items(status);

-- Idempotency: one approved receive movement per mapped item per note.
-- Prevents double-receiving even if approve is called twice.
CREATE UNIQUE INDEX uq_delivery_note_item_approved
  ON delivery_note_items(delivery_note_id, item_id)
  WHERE status = 'approved' AND item_id IS NOT NULL;

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE delivery_notes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_note_items ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read
CREATE POLICY "delivery_notes_select"      ON delivery_notes      FOR SELECT TO authenticated USING (true);
CREATE POLICY "delivery_note_items_select" ON delivery_note_items FOR SELECT TO authenticated USING (true);

-- Only service_role can write (all mutations go through API routes with service key)
CREATE POLICY "delivery_notes_all_service"      ON delivery_notes      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "delivery_note_items_all_service" ON delivery_note_items FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Realtime ──────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE delivery_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE delivery_note_items;
