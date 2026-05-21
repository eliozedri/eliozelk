-- Phase B: Mark all ext-asc-* items as inactive if somehow activated.
-- Safety net — idempotent, safe to re-run.
-- All external_supplier_reference items MUST remain is_active = false.

UPDATE catalog_items
SET
  is_active  = false,
  updated_at = now()
WHERE
  id LIKE 'ext-asc-%'
  AND is_active = true;

-- Add index for fast supplier-only queries
CREATE INDEX IF NOT EXISTS idx_catalog_items_id_prefix
  ON catalog_items (id);

-- Verify: this count must be 0 after migration
DO $$
DECLARE cnt int;
BEGIN
  SELECT COUNT(*) INTO cnt
  FROM catalog_items
  WHERE id LIKE 'ext-asc-%' AND is_active = true;
  IF cnt > 0 THEN
    RAISE EXCEPTION 'CONSTRAINT VIOLATION: % supplier items are marked active', cnt;
  END IF;
END $$;
