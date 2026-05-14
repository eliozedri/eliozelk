-- ── Pre-launch refinements — catalog_items enhancements ─────────────────────
-- Safe to re-apply: all ADD COLUMN use IF NOT EXISTS guard.
--
-- hours_per_unit: conversion factor for time-based units (1 יום = 8 שעות).
--   Stored on the catalog item; used by billing to compute effective hours.
--
-- linked_products: JSON array of { id, name, qty, required } entries.
--   Defines component/accessory relationships between catalog items.
--   Stored in localStorage today; sync to DB once this migration is applied.

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS hours_per_unit NUMERIC,
  ADD COLUMN IF NOT EXISTS linked_products JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Index for linked product lookups (GIN for JSONB containment queries)
CREATE INDEX IF NOT EXISTS idx_catalog_items_linked_products
  ON public.catalog_items USING GIN (linked_products);
