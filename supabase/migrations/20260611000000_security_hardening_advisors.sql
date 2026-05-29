-- Security hardening from Supabase security advisors (audit 2026-05-29).
--
-- ⚠️ REVIEW BEFORE APPLYING. This file is NOT auto-applied (no CI applies
-- migrations in this repo). Apply manually after review:
--   supabase db push        (or run in the SQL editor)
-- Then re-run the security advisors to confirm the warnings clear.
--
-- Scope = the SAFE, confirmed subset only. Each legitimate caller was verified
-- in code first:
--   • next_counter / set_catalog_active / touch_last_login / fn_emit_notification
--     are called only by AUTHENTICATED (browser) or SERVICE_ROLE (server) paths —
--     never by anon. The anon key ships to browsers, so anon-executable
--     SECURITY DEFINER functions are an unauthenticated abuse surface
--     (notification spam, catalog toggling). We revoke anon EXECUTE only.
--   • trigger functions + rls_auto_enable are never meant to be called via the
--     REST RPC endpoint at all → revoke from anon AND authenticated.
--   • suppliers: the browser only SELECTs it; all writes go through service_role
--     (which bypasses RLS) → replace the permissive ALL-true policy with
--     SELECT-only for authenticated.
--
-- NOT included (needs an explicit decision — documented in the audit report):
--   • inventory_movements INSERT WITH CHECK(true): the BROWSER (useCatalog.ts)
--     inserts here directly, so tightening it requires first moving that write
--     server-side. Left as-is intentionally.
--   • Leaked-password protection: enable in the Supabase Auth dashboard
--     (not expressible as SQL).

BEGIN;

-- ── 1. Revoke anon EXECUTE on SECURITY DEFINER functions reachable via /rpc ──
DO $$
BEGIN
  -- guarded: REVOKE never errors if the grant is absent, but the function must exist
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.fn_emit_notification(text, text, text, uuid, jsonb, text[]) FROM anon';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.set_catalog_active(text[], boolean) FROM anon';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.next_counter(text) FROM anon';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.touch_last_login() FROM anon';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'Some functions not found — skipping (verify names in production).';
END $$;

-- ── 2. Internal-only functions: revoke from BOTH anon and authenticated ──
-- Trigger functions fire from triggers (definer context) and rls_auto_enable is
-- an admin helper; none should be callable directly via the REST RPC endpoint.
DO $$
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.trg_order_problems_notify() FROM anon, authenticated';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.trg_work_diaries_notify() FROM anon, authenticated';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.trg_work_orders_notify() FROM anon, authenticated';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'Some trigger functions not found — skipping.';
END $$;

-- ── 3. Pin search_path on flagged functions (function_search_path_mutable) ──
DO $$
BEGIN
  EXECUTE 'ALTER FUNCTION public.handle_updated_at() SET search_path = public, pg_temp';
  EXECUTE 'ALTER FUNCTION public.touch_updated_at() SET search_path = public, pg_temp';
  EXECUTE 'ALTER FUNCTION public.touch_last_login() SET search_path = public, pg_temp';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'Some functions not found — skipping search_path pin.';
END $$;

-- ── 4. Tighten suppliers RLS: read-only for authenticated; writes via service_role ──
-- The browser only reads suppliers (SupplierDocuments / Catalog / Warehouse use
-- .select). The previous ALL USING(true) WITH CHECK(true) policy let any signed-in
-- user write/delete suppliers directly via PostgREST, bypassing the API role checks.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='suppliers' AND policyname='suppliers_all') THEN
    DROP POLICY suppliers_all ON public.suppliers;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='suppliers' AND policyname='suppliers_select') THEN
    CREATE POLICY suppliers_select ON public.suppliers
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

COMMIT;
