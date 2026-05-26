-- Order Intake skill: customer-confirmation flag (additive).
-- status stays 'pending_review' so confirmed drafts remain in the office review queue;
-- this flag just marks that the customer said "ready/confirmed" via chat.
alter table public.team_bot_order_drafts
  add column if not exists customer_confirmed boolean not null default false,
  add column if not exists confirmed_at        timestamptz;
