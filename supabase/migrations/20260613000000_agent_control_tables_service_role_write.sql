-- Lock agent control tables to service-role writes (audit 2026-05-29).
--
-- ⚠️ APPLY ORDER MATTERS — do NOT run this until the code that moves the browser
-- writes server-side is DEPLOYED to production:
--   • /api/agents/control (new, verifyMasterAuth-gated, audited)
--   • useAgents.ts switched to call it via authedFetch
-- If applied before that deploy, the AgentCommandCenter approve/ack/dismiss/task
-- buttons (which currently write directly from the browser) will start failing.
-- Not auto-applied (no migration CI). Apply manually after the deploy is live and
-- verified, then re-run the Supabase security advisors.
--
-- WHY: these tables had RLS `auth.role() = 'authenticated'` for ALL, so any signed-in
-- user could flip `agent_approvals.approval_status` (bypass an approval) or mutate
-- tasks/exceptions directly via PostgREST. Server writes already use the service role
-- (scan routes + /api/agents/control), which bypasses RLS — so we keep SELECT for
-- authenticated (the UI reads) and remove the authenticated WRITE path.
--
-- ISOLATION: does NOT touch the CEO-agent / Tier-B price flow, which uses
-- `jarvis_ceo_agent_commands` (already service-role-only) + `catalog_items`.

BEGIN;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agent_approvals','agent_tasks','agent_exceptions','agent_activity_feed'] LOOP
    -- drop the permissive ALL policy if present
    EXECUTE format('DROP POLICY IF EXISTS auth_all_%s ON public.%I', t, t);
    -- (re)create read-only access for authenticated; service_role bypasses RLS for writes
    EXECUTE format('DROP POLICY IF EXISTS %s_select ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %s_select ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
  END LOOP;
END $$;

COMMIT;
