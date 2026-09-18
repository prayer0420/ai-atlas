-- Private mapping: only the application server can resolve or change login names.
create table public.ai_atlas_login_names (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9_-]{2,29}$'),
  attempts integer not null default 0,
  window_started_at timestamptz not null default now()
);
alter table public.ai_atlas_login_names enable row level security;
revoke all on public.ai_atlas_login_names from public, anon, authenticated;
grant select, insert, update, delete on public.ai_atlas_login_names to service_role;

-- Atomic account-wide limit survives serverless restarts and parallel requests.
create function public.ai_atlas_reserve_login(p_username text)
returns uuid language sql security invoker set search_path = '' as $$
  update public.ai_atlas_login_names
  set attempts = case when window_started_at <= now() - interval '15 minutes' then 1 else attempts + 1 end,
      window_started_at = case when window_started_at <= now() - interval '15 minutes' then now() else window_started_at end
  where username = p_username
    and (attempts < 10 or window_started_at <= now() - interval '15 minutes')
  returning user_id;
$$;
revoke all on function public.ai_atlas_reserve_login(text) from public, anon, authenticated;
grant execute on function public.ai_atlas_reserve_login(text) to service_role;
