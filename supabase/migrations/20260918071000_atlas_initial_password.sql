alter table public.ai_atlas_login_names
  add column if not exists initial_password_set boolean not null default false;

-- The owner may claim the initial password exactly once through the setup route.
revoke all on public.ai_atlas_login_names from public, anon, authenticated;
grant select, insert, update, delete on public.ai_atlas_login_names to service_role;
