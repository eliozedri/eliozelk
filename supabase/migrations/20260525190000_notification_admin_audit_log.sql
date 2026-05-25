-- Admin notification-rule change audit log (Phase 2b admin foundation).
-- Additive, non-destructive: one new table + RLS. No existing object changed.
-- Records every notification_rules policy change (who / field / old / new / when).
-- Writes happen only via the master-gated service-role API; clients are read-only,
-- and only master may read the audit log.

create table if not exists public.notification_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references public.notification_rules(id) on delete set null,
  rule_event_type text,
  field text not null,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz not null default now()
);

create index if not exists idx_notification_admin_audit_changed_at
  on public.notification_admin_audit_log (changed_at desc);

alter table public.notification_admin_audit_log enable row level security;

-- Master-only read. No INSERT/UPDATE/DELETE policy => writes only via service role.
drop policy if exists notif_admin_audit_read on public.notification_admin_audit_log;
create policy notif_admin_audit_read on public.notification_admin_audit_log
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'master' and coalesce(p.is_active, true) = true));
