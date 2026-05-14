-- ── next_counter mechanism ────────────────────────────────────────────────────
-- The counters table and next_counter() function were created via the Supabase
-- SQL Editor in an earlier session and were never captured in a migration.
-- This migration makes the mechanism reproducible from scratch.
--
-- Safe to re-apply: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION.
-- Does NOT touch the production counter values (order=5, diary=3).

-- 1. Backing table
CREATE TABLE IF NOT EXISTS public.counters (
  key   text    PRIMARY KEY,
  value bigint  NOT NULL DEFAULT 0
);

ALTER TABLE public.counters ENABLE ROW LEVEL SECURITY;

-- No direct-access policies: the SECURITY DEFINER function is the only
-- path in. Service role bypasses RLS for diagnostics.

-- 2. Atomic increment-or-insert function
CREATE OR REPLACE FUNCTION public.next_counter(counter_key text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_val bigint;
BEGIN
  INSERT INTO public.counters (key, value)
  VALUES (counter_key, 1)
  ON CONFLICT (key) DO UPDATE
    SET value = counters.value + 1
  RETURNING value INTO next_val;
  RETURN next_val;
END;
$$;

-- 3. Lock down execute: revoke from PUBLIC (which includes anon),
--    grant only to authenticated.
--    Migration 20260513000001 had this revoke but never ran (repair-only).
REVOKE ALL ON FUNCTION public.next_counter(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_counter(text) TO authenticated;

-- 4. Remove probe/test rows created during session audits.
--    Production rows (order, diary) are intentionally left intact.
DELETE FROM public.counters
WHERE key IN ('__anon_probe__', '__audit_test__', '__inspect_order__', '__inspect_diary__');
