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
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'master' and coalesce(p.is_active, true) = true)
  );

drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications
  for select to authenticated
  using (
    exists (
      select 1 from public.notification_recipients nr
      where nr.notification_id = notifications.id and nr.user_id = auth.uid()
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'master' and coalesce(p.is_active, true) = true)
  );

drop policy if exists notif_acks_read_own on public.notification_acknowledgements;
create policy notif_acks_read_own on public.notification_acknowledgements
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'master' and coalesce(p.is_active, true) = true)
  );
-- No INSERT/UPDATE/DELETE policies => default-deny for clients.
-- Triggers (SECURITY DEFINER) and service-role API routes bypass RLS.

-- ── 4. Realtime: deliver recipient-row changes to the targeted user ─────
alter table public.notification_recipients replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.notification_recipients;
exception when duplicate_object then null; end $$;

-- ── 5. Resolver: snapshot rule onto a notification, fan out recipients ──
create or replace function public.fn_emit_notification(
  p_event_type text,
  p_entity_type text,
  p_entity_id text,
  p_created_by uuid,
  p_metadata jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.notification_rules%rowtype;
  v_notification_id uuid;
begin
  select * into v_rule from public.notification_rules
  where event_type = p_event_type and enabled = true;
  if not found then
    return;
  end if;

  insert into public.notifications (
    event_type, rule_id, title, message, severity, source_module,
    related_entity_type, related_entity_id, created_by,
    requires_ack, blocking, play_sound, expires_at, metadata
  ) values (
    v_rule.event_type, v_rule.id, v_rule.title, v_rule.message, v_rule.severity, v_rule.source_module,
    p_entity_type, p_entity_id, p_created_by,
    v_rule.requires_ack, v_rule.blocking, v_rule.play_sound,
    case when v_rule.expires_after_minutes is not null
         then now() + make_interval(mins => v_rule.expires_after_minutes) else null end,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_notification_id;

  -- role-targeted
  insert into public.notification_recipients (notification_id, user_id, matched_role, status)
  select v_notification_id, p.id, p.role, 'pending'
  from public.profiles p
  join public.notification_rule_recipients r
    on r.rule_id = v_rule.id and r.recipient_type = 'role' and r.recipient_value = p.role
  where coalesce(p.is_active, true) = true
    and (v_rule.exclude_actor = false or p_created_by is null or p.id <> p_created_by)
  on conflict (notification_id, user_id) do nothing;

  -- explicit user-targeted
  insert into public.notification_recipients (notification_id, user_id, matched_role, status)
  select v_notification_id, p.id, p.role, 'pending'
  from public.profiles p
  join public.notification_rule_recipients r
    on r.rule_id = v_rule.id and r.recipient_type = 'user' and r.recipient_value = p.id::text
  where coalesce(p.is_active, true) = true
    and (v_rule.exclude_actor = false or p_created_by is null or p.id <> p_created_by)
  on conflict (notification_id, user_id) do nothing;

  -- master always receives (so master sees everything in their own center)
  insert into public.notification_recipients (notification_id, user_id, matched_role, status)
  select v_notification_id, p.id, p.role, 'pending'
  from public.profiles p
  where p.role = 'master' and coalesce(p.is_active, true) = true
  on conflict (notification_id, user_id) do nothing;
end;
$$;

-- ── 6. Event triggers ──────────────────────────────────────────────────
-- order.created: fire when an order first becomes non-draft (insert OR draft->live).
create or replace function public.trg_work_orders_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and coalesce(new.status,'') <> 'draft')
     or (tg_op = 'UPDATE' and coalesce(old.status,'') = 'draft' and coalesce(new.status,'') <> 'draft') then
    perform public.fn_emit_notification(
      'order.created', 'work_order', new.id::text, null,
      jsonb_build_object('order_number', new.order_number, 'status', new.status)
    );
  end if;
  return new;
end;
$$;
drop trigger if exists work_orders_notify on public.work_orders;
create trigger work_orders_notify
  after insert or update on public.work_orders
  for each row execute function public.trg_work_orders_notify();

-- diary.submitted: fire when status transitions into 'submitted' (NOT on draft insert).
create or replace function public.trg_work_diaries_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and coalesce(old.status,'') is distinct from 'submitted'
     and coalesce(new.status,'') = 'submitted' then
    perform public.fn_emit_notification(
      'diary.submitted', 'work_diary', new.id::text, null,
      jsonb_build_object('status', new.status)
    );
  end if;
  return new;
end;
$$;
drop trigger if exists work_diaries_notify on public.work_diaries;
create trigger work_diaries_notify
  after update on public.work_diaries
  for each row execute function public.trg_work_diaries_notify();

-- field.issue: every order_problem insert is a genuine field issue.
create or replace function public.trg_order_problems_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_emit_notification(
    'field.issue', 'order_problem', new.id::text, null,
    jsonb_build_object('order_id', new.order_id, 'category', new.category, 'description', new.description)
  );
  return new;
end;
$$;
drop trigger if exists order_problems_notify on public.order_problems;
create trigger order_problems_notify
  after insert on public.order_problems
  for each row execute function public.trg_order_problems_notify();

-- ── 7. Seed the 3 Phase-1 rules + recipients ────────────────────────────
insert into public.notification_rules
  (event_type, enabled, title, message, severity, source_module, requires_ack, blocking, play_sound, show_in_center, exclude_actor)
values
  ('order.created',   true, 'הזמנה חדשה נוצרה',   'נוצרה הזמנה חדשה במערכת',          'warning',  'orders',    false, false, true,  true, true),
  ('diary.submitted', true, 'יומן עבודה הוגש',     'עובד שטח הגיש יומן עבודה',          'info',     'work_logs', false, false, false, true, true),
  ('field.issue',     true, 'בעיה דווחה בשטח',     'דווחה בעיה הדורשת טיפול ואישור',     'critical', 'field',     true,  true,  true,  true, true)
on conflict (event_type) do nothing;

-- recipients (master is auto-added by the resolver, so it is not listed here)
insert into public.notification_rule_recipients (rule_id, recipient_type, recipient_value)
select r.id, 'role', v.role
from public.notification_rules r
join (values
  ('order.created','office_manager'), ('order.created','graphics_manager'),
  ('diary.submitted','fleet_manager'), ('diary.submitted','office_manager'),
  ('field.issue','office_manager'), ('field.issue','fleet_manager')
) as v(event_type, role) on v.event_type = r.event_type
on conflict (rule_id, recipient_type, recipient_value) do nothing;
