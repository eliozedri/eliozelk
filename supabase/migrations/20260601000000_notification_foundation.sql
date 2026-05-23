-- Critical Notification & Acknowledgement — Phase 1 foundation.
-- Additive and idempotent. Clients are read-only; all writes happen via
-- SECURITY DEFINER triggers or service-role API routes.

-- ── 1. Tables ──────────────────────────────────────────────────────────
create table if not exists public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  event_type text unique not null,
  enabled boolean not null default true,
  title text not null,
  message text not null,
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  source_module text not null default 'system',
  requires_ack boolean not null default false,
  blocking boolean not null default false,
  play_sound boolean not null default false,
  show_in_center boolean not null default true,
  exclude_actor boolean not null default true,
  reminder_enabled boolean not null default false,
  reminder_interval_minutes integer,
  escalation_enabled boolean not null default false,
  escalation_delay_minutes integer,
  escalation_target jsonb,
  expires_after_minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_rule_recipients (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.notification_rules(id) on delete cascade,
  recipient_type text not null check (recipient_type in ('role','user','group')),
  recipient_value text not null,
  created_at timestamptz not null default now(),
  unique (rule_id, recipient_type, recipient_value)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  rule_id uuid references public.notification_rules(id) on delete set null,
  title text not null,
  message text not null,
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  source_module text not null default 'system',
  related_entity_type text,
  related_entity_id text,
  created_by uuid,
  requires_ack boolean not null default false,
  blocking boolean not null default false,
  play_sound boolean not null default false,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null,
  matched_role text,
  status text not null default 'pending'
    check (status in ('pending','delivered','seen','acknowledged','escalated','failed','expired')),
  delivered_at timestamptz,
  seen_at timestamptz,
  related_opened_at timestamptz,
  acknowledged_at timestamptz,
  ack_was_direct boolean not null default false,
  escalation_level integer not null default 0,
  last_push_sent_at timestamptz,
  next_reminder_at timestamptz,
  created_at timestamptz not null default now(),
  unique (notification_id, user_id)
);

create table if not exists public.notification_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  recipient_id uuid not null references public.notification_recipients(id) on delete cascade,
  user_id uuid not null,
  acknowledged_at timestamptz not null default now(),
  related_opened_at timestamptz,
  ack_was_direct boolean not null default false,
  device_info jsonb,
  created_at timestamptz not null default now()
);

-- ── 2. Indexes ─────────────────────────────────────────────────────────
create index if not exists idx_notification_recipients_user_status on public.notification_recipients (user_id, status);
create index if not exists idx_notification_recipients_notification on public.notification_recipients (notification_id);
create index if not exists idx_notifications_event_type on public.notifications (event_type);
create index if not exists idx_notifications_created_at on public.notifications (created_at desc);
create index if not exists idx_notification_rule_recipients_rule on public.notification_rule_recipients (rule_id);
create index if not exists idx_notification_acks_user on public.notification_acknowledgements (user_id);

-- ── 3. RLS — clients read only their own; master reads all ──────────────
alter table public.notification_rules enable row level security;
alter table public.notification_rule_recipients enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.notification_acknowledgements enable row level security;

drop policy if exists notif_rules_read on public.notification_rules;
create policy notif_rules_read on public.notification_rules
  for select to authenticated using (true);

drop policy if exists notif_rule_recipients_read on public.notification_rule_recipients;
create policy notif_rule_recipients_read on public.notification_rule_recipients
  for select to authenticated using (true);

drop policy if exists notif_recipients_read_own on public.notification_recipients;
create policy notif_recipients_read_own on public.notification_recipients
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'master')
  );

drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications
  for select to authenticated
  using (
    exists (
      select 1 from public.notification_recipients nr
      where nr.notification_id = notifications.id and nr.user_id = auth.uid()
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'master')
  );

drop policy if exists notif_acks_read_own on public.notification_acknowledgements;
create policy notif_acks_read_own on public.notification_acknowledgements
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'master')
  );
-- No INSERT/UPDATE/DELETE policies => default-deny for clients.
-- Triggers (SECURITY DEFINER) and service-role API routes bypass RLS.

-- ── 4. Realtime: deliver recipient-row changes to the targeted user ─────
alter table public.notification_recipients replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.notification_recipients;
exception when duplicate_object then null; end $$;
