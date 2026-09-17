-- Private, outbound-only local AI worker. No public writes or exposed PC port.
create table public.ai_atlas_queue (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('analyze','daily','wiki','question')),
 job_key text not null, payload jsonb not null default '{}',
 status text not null default 'queued' check(status in ('queued','running','completed','failed')),
 attempts integer not null default 0, lease_token uuid, lease_until timestamptz,
 available_at timestamptz not null default now(), created_at timestamptz not null default now(),
 finished_at timestamptz, error text, result jsonb
);
create unique index ai_atlas_queue_active on public.ai_atlas_queue(user_id,kind,job_key) where status in ('queued','running');
create index ai_atlas_queue_owner_time on public.ai_atlas_queue(user_id,created_at desc);
create table public.ai_atlas_workers (
 user_id uuid primary key references auth.users(id) on delete cascade,
 last_seen timestamptz not null default now(), model text not null,
 engine_ready boolean not null default false, busy boolean not null default false,
 last_error text, vault_synced_at timestamptz, vault_conflicts integer not null default 0
);
alter table public.ai_atlas_queue enable row level security;
alter table public.ai_atlas_workers enable row level security;
revoke all on public.ai_atlas_queue,public.ai_atlas_workers from anon,authenticated;
grant select on public.ai_atlas_queue,public.ai_atlas_workers to authenticated;
grant all on public.ai_atlas_queue,public.ai_atlas_workers to service_role;
create policy queue_read_own on public.ai_atlas_queue for select to authenticated using(user_id=(select auth.uid()));
create policy worker_read_own on public.ai_atlas_workers for select to authenticated using(user_id=(select auth.uid()));
create function public.ai_atlas_enqueue(p_user_id uuid,p_kind text,p_key text,p_payload jsonb default '{}') returns uuid
language plpgsql security invoker set search_path=public as $$
declare job uuid;
begin
 perform pg_advisory_xact_lock(hashtext('atlas-queue-'||p_user_id::text));
 select id into job from ai_atlas_queue where user_id=p_user_id and kind=p_kind and job_key=p_key and status in ('queued','running');
 if found then return job; end if;
 if (select count(*) from ai_atlas_queue where user_id=p_user_id and status in ('queued','running'))>=30 then raise exception 'QUEUE_FULL'; end if;
 if (select count(*) from ai_atlas_queue where user_id=p_user_id and created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')>=60 then raise exception 'QUEUE_LIMIT'; end if;
 insert into ai_atlas_queue(user_id,kind,job_key,payload) values(p_user_id,p_kind,p_key,p_payload) returning id into job;
 return job;
end $$;
create function public.ai_atlas_take_job(p_user_id uuid) returns setof public.ai_atlas_queue
language plpgsql security invoker set search_path=public as $$
declare job uuid;
begin
 perform pg_advisory_xact_lock(hashtext('atlas-queue-'||p_user_id::text));
 update ai_atlas_queue set status='failed',error='PC 작업이 반복 중단되었습니다. 다시 시도할 수 있습니다.',finished_at=now() where user_id=p_user_id and status='running' and lease_until<now() and attempts>=3;
 if exists(select 1 from ai_atlas_queue where user_id=p_user_id and status='running' and lease_until>now()) then return; end if;
 select id into job from ai_atlas_queue where user_id=p_user_id and attempts<3 and ((status='queued' and available_at<=now()) or (status='running' and lease_until<now())) order by case when kind='analyze' then 0 when kind='question' then 1 when kind='daily' then 2 else 3 end,created_at limit 1 for update skip locked;
 if found then
 return query update ai_atlas_queue set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '30 minutes',error=null where id=job returning *;
 end if;
end $$;
revoke all on function public.ai_atlas_enqueue(uuid,text,text,jsonb),public.ai_atlas_take_job(uuid) from public,anon,authenticated;
grant execute on function public.ai_atlas_enqueue(uuid,text,text,jsonb),public.ai_atlas_take_job(uuid) to service_role;
create index if not exists ai_atlas_analysis_jobs_resource on public.ai_atlas_analysis_jobs(resource_id);
