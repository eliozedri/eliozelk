-- Jarvis WhatsApp Gateway: per-message routing traceability (additive, nullable).
-- sender_role: 'master' (owner) | 'external' (customer). routed_by: 'jarvis_gateway'.
-- Existing rows stay NULL; behavior unchanged.
alter table public.whatsapp_messages
  add column if not exists sender_role text,
  add column if not exists routed_by   text;
