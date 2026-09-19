alter table public.ai_atlas_preferences
  add column if not exists ai_provider text not null default 'ollama'
  check (ai_provider in ('ollama','hermes'));
