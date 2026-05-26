-- OCR / Document skill audit trail (additive). One row per document/media Jarvis receives.
-- Service-role only (RLS on, no client policy) — same posture as jarvis_master_items.
create table if not exists public.jarvis_documents (
  id             uuid        not null default gen_random_uuid() primary key,
  channel        text        not null,          -- whatsapp | telegram | web
  sender_phone   text,
  sender_role    text        not null,          -- master | external
  media_id       text,
  media_kind     text,                          -- image | document
  mime_type      text,
  caption        text,
  status         text        not null default 'received',  -- received | analyzed | routed | failed
  classification text,                           -- order | customer | supplier | finance | work_note | personal | unclear
  extracted_text text,
  summary        text,
  routed_action  text,                           -- order_draft | ceo | personal | none
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists jarvis_documents_created_idx on public.jarvis_documents (created_at desc);
create index if not exists jarvis_documents_sender_idx  on public.jarvis_documents (sender_phone);

alter table public.jarvis_documents enable row level security;
