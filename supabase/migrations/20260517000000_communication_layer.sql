-- Phase 2.6 — Channel-agnostic communication layer
-- Supports: internal_app (now); whatsapp / telegram / discord / email (future phases)
-- Do NOT remove the channel enum values below — they are intentional future placeholders.

-- ── communication_threads ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS communication_threads (
  id                   text PRIMARY KEY,
  channel              text NOT NULL DEFAULT 'internal_app'
                         CHECK (channel IN ('internal_app','whatsapp','telegram','discord','email')),
  agent_id             text REFERENCES agents(id) ON DELETE SET NULL,
  user_id              uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title                text NOT NULL DEFAULT '',
  related_entity_type  text,
  related_entity_id    text,
  status               text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','archived','closed')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ── communication_messages ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS communication_messages (
  id                   text PRIMARY KEY,
  thread_id            text NOT NULL REFERENCES communication_threads(id) ON DELETE CASCADE,
  sender_type          text NOT NULL CHECK (sender_type IN ('user','agent','system')),
  sender_user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  agent_id             text REFERENCES agents(id) ON DELETE SET NULL,
  channel              text NOT NULL DEFAULT 'internal_app',
  -- external_message_id: reserved for WhatsApp/Telegram/Discord message IDs (future)
  external_message_id  text,
  content              text NOT NULL,
  structured_payload   jsonb,
  source_references    jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ── communication_suggested_actions ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS communication_suggested_actions (
  id                   text PRIMARY KEY,
  thread_id            text NOT NULL REFERENCES communication_threads(id) ON DELETE CASCADE,
  message_id           text NOT NULL REFERENCES communication_messages(id) ON DELETE CASCADE,
  agent_id             text REFERENCES agents(id) ON DELETE SET NULL,
  action_type          text NOT NULL,
  action_payload       jsonb,
  risk_level           text NOT NULL DEFAULT 'low'
                         CHECK (risk_level IN ('low','medium','high','critical')),
  approval_required    boolean NOT NULL DEFAULT false,
  approval_status      text DEFAULT 'pending'
                         CHECK (approval_status IN ('pending','approved','rejected','auto_approved')),
  created_task_id      text,
  created_approval_id  text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_comm_threads_user    ON communication_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_comm_threads_agent   ON communication_threads(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_comm_messages_thread ON communication_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comm_sa_thread       ON communication_suggested_actions(thread_id);
CREATE INDEX IF NOT EXISTS idx_comm_sa_message      ON communication_suggested_actions(message_id);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE communication_threads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_suggested_actions ENABLE ROW LEVEL SECURITY;

-- Users can read/write only their own threads
CREATE POLICY "threads_own" ON communication_threads
  FOR ALL USING (auth.uid() = user_id);

-- Messages belong to threads owned by the user
CREATE POLICY "messages_own_thread" ON communication_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM communication_threads t
      WHERE t.id = thread_id AND t.user_id = auth.uid()
    )
  );

-- Suggested actions belong to threads owned by the user
CREATE POLICY "suggested_actions_own_thread" ON communication_suggested_actions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM communication_threads t
      WHERE t.id = thread_id AND t.user_id = auth.uid()
    )
  );

-- Future WhatsApp/Telegram/Discord integration notes (NOT active):
-- When external channels are enabled, incoming messages will be normalized here
-- via a dedicated webhook → message-normalizer service before hitting this table.
-- external_message_id will hold the platform's native message ID for deduplication.
-- Outbound responses will be drafted via communication_suggested_actions (risk_level=low)
-- and sent only when the channel integration is explicitly activated.
