-- Jarvis WhatsApp owner-menu foundation (additive).
-- Both tables are service-role only (written exclusively by server routes); no client RLS
-- policies are added, so they default-deny to anon/auth — same posture as team_bot_* tables.

-- Per-phone conversation state for the owner menu (mirrors team_bot_sessions).
create table if not exists public.whatsapp_sessions (
  phone      text        not null primary key,
  state      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Owner-captured items: CEO/manager requests + personal tasks/notes/reminders + doc refs.
-- Nothing here auto-executes; rows are pending records a human (or future automation) acts on.
create table if not exists public.jarvis_master_items (
  id           uuid        not null default gen_random_uuid() primary key,
  source_phone text,
  kind         text        not null,   -- ceo_request | personal_task | personal_reminder | personal_note | personal_medical | daily_report_request | document
  status       text        not null default 'pending',
  body         text,
  metadata     jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists jarvis_master_items_kind_idx   on public.jarvis_master_items (kind, status);
create index if not exists jarvis_master_items_created_idx on public.jarvis_master_items (created_at desc);

alter table public.whatsapp_sessions   enable row level security;
alter table public.jarvis_master_items enable row level security;
