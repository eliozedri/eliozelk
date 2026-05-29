-- LLM reasoning metadata for the CEO-Agent conversation. Records what the
-- reasoning step decided (summary), which internal agent it routed to, and
-- whether real LLM reasoning ran (vs. the rule-based fallback) + provider.
-- Additive; no business data. JARVIS-namespaced coordination table only.

alter table public.jarvis_ceo_agent_commands
  add column if not exists reasoning_summary text,
  add column if not exists routed_to_agent    text,
  add column if not exists llm_used           boolean not null default false,
  add column if not exists llm_provider        text;
