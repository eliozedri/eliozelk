-- WhatsApp inbound message log.
-- Stores every message received via the Cloud API webhook.
-- wa_message_id is the idempotency key — Meta may deliver the same event more than once.

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wa_message_id    text        NOT NULL UNIQUE,
  wa_sender_id     text        NOT NULL,
  contact_name     text,
  message_type     text        NOT NULL,
  body             text,
  timestamp_wa     bigint      NOT NULL,
  raw_payload      jsonb       NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_messages_sender_idx
  ON public.whatsapp_messages (wa_sender_id);

CREATE INDEX IF NOT EXISTS whatsapp_messages_created_idx
  ON public.whatsapp_messages (created_at DESC);
