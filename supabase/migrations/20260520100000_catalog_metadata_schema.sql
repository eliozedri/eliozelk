-- Add metadata JSONB column to catalog_items.
-- Stores: images, specs, sources, aliases, fleet_only, fleet_managed.
-- Uses ADD COLUMN IF NOT EXISTS — safe to run multiple times.

ALTER TABLE catalog_items
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN catalog_items.metadata IS
  'Structured metadata: {images:[{url,caption,source}], specs:{k:v}, sources:[{type,url,note}], aliases:[str], fleet_only:bool, fleet_managed:bool}';
