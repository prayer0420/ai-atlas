-- AI Atlas only. Existing attendance tables and policies are not changed.
begin;
create table if not exists public.ai_atlas_resources (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(char_length(title) between 1 and 120),
 source_url text,
 source_type text not null default 'text' check(source_type in ('text','web','youtube','instagram','threads')),
 raw_text text not null default '' check(char_length(raw_text)<=60000),
 category text not null default 'AI 기초',
 tags text[] not null default '{}',
 status text not null default 'saved' check(status in ('saved','analyzing','ready','needs_content','failed')),
 lesson jsonb,
 favorite boolean not null default false,
 learned boolean not null default false,
 notes text not null default '' check(char_length(notes)<=20000),
 fingerprint text not null,
 error_message text,
 source_method text,
 model text,
 analysis_job_id uuid,
 analysis_started_at timestamptz,
 search_text text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz
);
create unique index if not exists ai_atlas_resources_unique_active on public.ai_atlas_resources(user_id,fingerprint) where deleted_at is null;
create index if not exists ai_atlas_resources_user_created on public.ai_atlas_resources(user_id,created_at desc);
create table if not exists public.ai_atlas_analysis_jobs (
 id uuid primary key default gen_random_uuid(),
 resource_id uuid not null references public.ai_atlas_resources(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'running' check(status in ('running','completed','failed')),
 created_at timestamptz not null default now(),
 finished_at timestamptz,
 model text,
 input_tokens integer not null default 0,
 output_tokens integer not null default 0
);
create index if not exists ai_atlas_jobs_user_created on public.ai_atlas_analysis_jobs(user_id,created_at);
alter table public.ai_atlas_resources enable row level security;
alter table public.ai_atlas_analysis_jobs enable row level security;
revoke all on public.ai_atlas_resources from anon, authenticated;
revoke all on public.ai_atlas_analysis_jobs from anon, authenticated;
grant select,insert,update on public.ai_atlas_resources to authenticated;
grant select on public.ai_atlas_analysis_jobs to authenticated;
grant all on public.ai_atlas_resources,public.ai_atlas_analysis_jobs to service_role;
create policy "ai_atlas_select_own" on public.ai_atlas_resources for select to authenticated using ((select auth.uid())=user_id);
create policy "ai_atlas_insert_own" on public.ai_atlas_resources for insert to authenticated with check ((select auth.uid())=user_id);
create policy "ai_atlas_update_own" on public.ai_atlas_resources for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "ai_atlas_jobs_select_own" on public.ai_atlas_analysis_jobs for select to authenticated using ((select auth.uid())=user_id);
create or replace function public.ai_atlas_touch_resource() returns trigger language plpgsql set search_path=public as $$
begin
 new.updated_at=now();
 new.search_text=concat_ws(' ',new.title,new.raw_text,new.category,array_to_string(new.tags,' '),new.notes,new.lesson->>'summary');
 return new;
end;
$$;
create trigger ai_atlas_touch before insert or update on public.ai_atlas_resources for each row execute function public.ai_atlas_touch_resource();
-- Only the trusted server can claim a paid analysis. Locking enforces both quota and concurrency.
create or replace function public.ai_atlas_claim_analysis(p_resource_id uuid,p_user_id uuid,p_limit integer)
returns uuid language plpgsql security definer set search_path=public as $$
declare item public.ai_atlas_resources; job uuid; used integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select * into item from public.ai_atlas_resources where id=p_resource_id and user_id=p_user_id and deleted_at is null for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if item.status='analyzing' and item.analysis_started_at>now()-interval '6 minutes' then raise exception 'ALREADY_RUNNING'; end if;
 select count(*) into used from public.ai_atlas_analysis_jobs where user_id=p_user_id and created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
 if used>=least(greatest(p_limit,1),100) then raise exception 'DAILY_LIMIT'; end if;
 update public.ai_atlas_analysis_jobs set status='failed',finished_at=now() where resource_id=p_resource_id and status='running' and created_at<now()-interval '6 minutes';
 insert into public.ai_atlas_analysis_jobs(resource_id,user_id) values(p_resource_id,p_user_id) returning id into job;
 update public.ai_atlas_resources set status='analyzing',analysis_job_id=job,analysis_started_at=now(),error_message=null where id=p_resource_id;
 return job;
end;
$$;
revoke all on function public.ai_atlas_claim_analysis(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_atlas_claim_analysis(uuid,uuid,integer) to service_role;
commit;
