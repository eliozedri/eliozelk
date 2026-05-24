-- =====================================================================
-- ARCHITECTURE MIGRATION: ops-orchestrator → ceo  (2026-05-24)
--
-- The central executive operations agent is renamed from the legacy id
-- 'ops-orchestrator' to the canonical id 'ceo'. type is also 'ceo'.
-- Hebrew display name stays "מנהל תפעול".
--
-- This is a DELIBERATE, controlled rename — NOT data corruption or
-- inconsistency. Any older migration/doc that says 'ops-orchestrator'
-- refers to the pre-migration name. From here on, the single source of
-- truth and the routing target for all managerial decisions (Jarvis /
-- Telegram / WhatsApp / approvals / notifications / agent routing / chat)
-- is 'ceo'.
--
-- The PK has 10 FK references (all NO ACTION on update), so a direct
-- rename is impossible. Strategy: clone the row under the new id, repoint
-- every child reference, then delete the old row — all in one atomic
-- transaction with post-conditions enforced via RAISE EXCEPTION.
--
-- Applied to production (project gtevmcnasvrahzfdqrqk) on 2026-05-24:
--   32 child rows repointed (action_logs 15, activity_feed 15,
--   comm_messages 1, comm_threads 1). 0 leftovers, 0 orphans, 1 ceo row.
-- =====================================================================

BEGIN;

INSERT INTO public.agents (
  id, name, type, department, description, autonomy_level,
  allowed_read_scopes, allowed_write_scopes, requires_approval_for,
  status, icon, color, last_run_at, created_at, updated_at
)
SELECT
  'ceo', name, 'ceo', department, description, autonomy_level,
  allowed_read_scopes, allowed_write_scopes, requires_approval_for,
  status, icon, color, last_run_at, created_at, now()
FROM public.agents
WHERE id = 'ops-orchestrator'
ON CONFLICT (id) DO NOTHING;

UPDATE public.agent_tasks                     SET agent_id           = 'ceo' WHERE agent_id           = 'ops-orchestrator';
UPDATE public.agent_exceptions                SET agent_id           = 'ceo' WHERE agent_id           = 'ops-orchestrator';
UPDATE public.agent_approvals                 SET agent_id           = 'ceo' WHERE agent_id           = 'ops-orchestrator';
UPDATE public.agent_approvals                 SET requested_by_agent = 'ceo' WHERE requested_by_agent = 'ops-orchestrator';
UPDATE public.agent_decisions                 SET agent_id           = 'ceo' WHERE agent_id           = 'ops-orchestrator';
UPDATE public.agent_action_logs               SET agent_id           = 'ceo' WHERE agent_id           = 'ops-orchestrator';
UPDATE public.agent_activity_feed             SET agent_id           = 'ceo' WHERE agent_id           = 'ops-orchestrator';
UPDATE public.agent_activity_feed             SET related_agent_id   = 'ceo' WHERE related_agent_id   = 'ops-orchestrator';
UPDATE public.communication_threads           SET agent_id           = 'ceo' WHERE agent_id           = 'ops-orchestrator';
UPDATE public.communication_messages          SET agent_id           = 'ceo' WHERE agent_id           = 'ops-orchestrator';
UPDATE public.communication_suggested_actions SET agent_id           = 'ceo' WHERE agent_id           = 'ops-orchestrator';

UPDATE public.agent_meetings
   SET participating_agents = array_replace(participating_agents, 'ops-orchestrator', 'ceo')
 WHERE 'ops-orchestrator' = ANY(participating_agents);

DELETE FROM public.agents WHERE id = 'ops-orchestrator';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.agents WHERE id = 'ops-orchestrator') <> 0 THEN
    RAISE EXCEPTION 'ABORT: ops-orchestrator row still exists';
  END IF;
  IF (SELECT count(*) FROM public.agents WHERE id = 'ceo') <> 1 THEN
    RAISE EXCEPTION 'ABORT: ceo row not present exactly once';
  END IF;
  IF (SELECT count(*) FROM public.agent_activity_feed WHERE agent_id = 'ops-orchestrator') <> 0
  OR (SELECT count(*) FROM public.agent_action_logs   WHERE agent_id = 'ops-orchestrator') <> 0
  OR (SELECT count(*) FROM public.communication_threads  WHERE agent_id = 'ops-orchestrator') <> 0
  OR (SELECT count(*) FROM public.communication_messages WHERE agent_id = 'ops-orchestrator') <> 0 THEN
    RAISE EXCEPTION 'ABORT: leftover child references to ops-orchestrator';
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- DOWN / ROLLBACK (documentation only — do NOT run as part of forward migration):
-- =====================================================================
-- BEGIN;
-- INSERT INTO public.agents (id, name, type, department, description, autonomy_level,
--   allowed_read_scopes, allowed_write_scopes, requires_approval_for,
--   status, icon, color, last_run_at, created_at, updated_at)
-- SELECT 'ops-orchestrator', name, 'orchestrator', department, description, autonomy_level,
--   allowed_read_scopes, allowed_write_scopes, requires_approval_for,
--   status, icon, color, last_run_at, created_at, now()
-- FROM public.agents WHERE id = 'ceo';
-- UPDATE public.agent_tasks                     SET agent_id           = 'ops-orchestrator' WHERE agent_id           = 'ceo';
-- UPDATE public.agent_exceptions                SET agent_id           = 'ops-orchestrator' WHERE agent_id           = 'ceo';
-- UPDATE public.agent_approvals                 SET agent_id           = 'ops-orchestrator' WHERE agent_id           = 'ceo';
-- UPDATE public.agent_approvals                 SET requested_by_agent = 'ops-orchestrator' WHERE requested_by_agent = 'ceo';
-- UPDATE public.agent_decisions                 SET agent_id           = 'ops-orchestrator' WHERE agent_id           = 'ceo';
-- UPDATE public.agent_action_logs               SET agent_id           = 'ops-orchestrator' WHERE agent_id           = 'ceo';
-- UPDATE public.agent_activity_feed             SET agent_id           = 'ops-orchestrator' WHERE agent_id           = 'ceo';
-- UPDATE public.agent_activity_feed             SET related_agent_id   = 'ops-orchestrator' WHERE related_agent_id   = 'ceo';
-- UPDATE public.communication_threads           SET agent_id           = 'ops-orchestrator' WHERE agent_id           = 'ceo';
-- UPDATE public.communication_messages          SET agent_id           = 'ops-orchestrator' WHERE agent_id           = 'ceo';
-- UPDATE public.communication_suggested_actions SET agent_id           = 'ops-orchestrator' WHERE agent_id           = 'ceo';
-- UPDATE public.agent_meetings
--    SET participating_agents = array_replace(participating_agents, 'ceo', 'ops-orchestrator')
--  WHERE 'ceo' = ANY(participating_agents);
-- DELETE FROM public.agents WHERE id = 'ceo';
-- COMMIT;
