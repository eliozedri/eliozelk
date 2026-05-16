-- Phase 2.8 — Agent Meetings
-- Provides persistent meeting threads with multi-agent participation.
-- thread_id references communication_threads (no FK to avoid boot-order
-- dependency; constraint can be added once both tables are confirmed present).

CREATE TABLE IF NOT EXISTS agent_meetings (
  id                    text PRIMARY KEY,
  title                 text NOT NULL,
  topic                 text,
  status                text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','completed','cancelled')),
  participating_agents  text[] NOT NULL DEFAULT '{}',
  thread_id             text,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  summary               text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meetings_status ON agent_meetings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_thread ON agent_meetings(thread_id);
CREATE INDEX IF NOT EXISTS idx_meetings_creator ON agent_meetings(created_by);

ALTER TABLE agent_meetings ENABLE ROW LEVEL SECURITY;

-- master / office_manager / finance_manager can read and write meetings
CREATE POLICY "meetings_authorized" ON agent_meetings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND p.role IN ('master', 'office_manager', 'finance_manager')
    )
  );

-- Future: add FK once communication_threads is confirmed applied:
-- ALTER TABLE agent_meetings
--   ADD CONSTRAINT fk_meeting_thread
--   FOREIGN KEY (thread_id) REFERENCES communication_threads(id) ON DELETE SET NULL;
