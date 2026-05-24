-- =====================================================================
-- SUPERSEDED NOTE (2026-05-24): point 1 below was the FIRST step (type only).
-- The full PK rename ops-orchestrator -> ceo was completed in the later
-- migration 20260603000000_rename_ops_orchestrator_to_ceo.sql. The "`id`
-- stays 'ops-orchestrator'" statement below reflects the plan at THIS
-- migration's point in time only — the id is now 'ceo'.
-- =====================================================================
-- Agent identity cleanup
--   1. ops-orchestrator: internal identity renamed to CEO.
--      We change `type` ('orchestrator' -> 'ceo') ONLY. The primary key
--      `id` stays 'ops-orchestrator' because it is referenced (no
--      ON UPDATE CASCADE) by agent_tasks, agent_exceptions,
--      agent_approvals and agent_activity_feed, by the scan route folder
--      /api/agents/ops-orchestrator/scan, and by ~11 code locations.
--      Renaming the PK is high-risk; `type` is the safe internal lever.
--   2. coordination-qa-agent: display name normalized to the official
--      "מנהלת תיאומים ו-QA" (display-only; id/type/FKs untouched).
-- =====================================================================

UPDATE public.agents
   SET type = 'ceo',
       updated_at = now()
 WHERE id = 'ops-orchestrator';

UPDATE public.agents
   SET name = 'מנהלת תיאומים ו-QA',
       updated_at = now()
 WHERE id = 'coordination-qa-agent';
