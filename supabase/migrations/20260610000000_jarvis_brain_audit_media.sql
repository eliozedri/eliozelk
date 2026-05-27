-- Extend jarvis_brain_audit so EVERY owner message is provably accounted for (additive).
-- brain_called distinguishes Brain-routed messages (free text / media → Gemini/Groq) from explicit
-- UI/capture executor actions (button/menu/capture, brain_called=false). media_present + message_type
-- record the media context. This is the runtime proof for the Owner/Master Brain-First Invariant.

alter table public.jarvis_brain_audit
  add column if not exists message_type  text,
  add column if not exists media_present boolean,
  add column if not exists brain_called  boolean;
