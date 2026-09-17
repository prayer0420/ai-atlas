begin;
create table public.ai_atlas_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 daily_enabled boolean not null default true,
 source_ids text[] not null default array['openai','google','huggingface','arxiv','two-minute-papers','geeknews'],
 topics text[] not null default '{}',
 story_count integer not null default 3 check(story_count between 1 and 5),
 auto_wiki boolean not null default true,
 updated_at timestamptz not null default now()
);
create table public.ai_atlas_feed_items (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 source_id text not null, source_name text not null, url text not null, canonical_url text not null,
 title text not null, excerpt text not null default '', published_at timestamptz,
 collected_at timestamptz not null default now(), metrics jsonb not null default '{}',
 score numeric not null default 0, rank_reason text not null default '',
 learned boolean not null default false, favorite boolean not null default false,
 resource_id uuid references public.ai_atlas_resources(id) on delete set null,
 unique(user_id,canonical_url)
);
create index ai_atlas_feed_user_date on public.ai_atlas_feed_items(user_id,collected_at desc);
create index ai_atlas_feed_resource on public.ai_atlas_feed_items(resource_id) where resource_id is not null;
create table public.ai_atlas_issues (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 issue_date date not null, content jsonb not null, mode text not null check(mode in ('preview','ai')),
 warning text, source_report jsonb not null default '[]', created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique(user_id,issue_date)
);
create table public.ai_atlas_tasks (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('daily','wiki','question')), task_key text not null,
 status text not null default 'running' check(status in ('running','completed','failed')),
 attempts integer not null default 1, attempt_day date not null default (now() at time zone 'Asia/Seoul')::date,
 daily_attempts integer not null default 1, result jsonb, error text, model text,
 input_tokens integer not null default 0, output_tokens integer not null default 0,
 created_at timestamptz not null default now(), started_at timestamptz not null default now(), finished_at timestamptz,
 unique(user_id,kind,task_key)
);
create index ai_atlas_tasks_user_date on public.ai_atlas_tasks(user_id,created_at desc);
create table public.ai_atlas_wiki_pages (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 slug text not null, title text not null, kind text not null check(kind in ('concept','entity','guide','synthesis','question')),
 summary text not null, body text not null, source_ids uuid[] not null default '{}', links text[] not null default '{}',
 caveats text[] not null default '{}', protected boolean not null default false, revision integer not null default 1,
 updated_at timestamptz not null default now(), unique(user_id,slug)
);
create index ai_atlas_wiki_user_date on public.ai_atlas_wiki_pages(user_id,updated_at desc);
create table public.ai_atlas_wiki_revisions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 page_id uuid not null references public.ai_atlas_wiki_pages(id) on delete cascade,
 revision integer not null, snapshot jsonb not null, task_id uuid references public.ai_atlas_tasks(id),
 created_at timestamptz not null default now(), unique(page_id,revision)
);
create index ai_atlas_wiki_revisions_user on public.ai_atlas_wiki_revisions(user_id,page_id);
create index ai_atlas_wiki_revisions_task on public.ai_atlas_wiki_revisions(task_id);
alter table public.ai_atlas_preferences enable row level security;
alter table public.ai_atlas_feed_items enable row level security;
alter table public.ai_atlas_issues enable row level security;
alter table public.ai_atlas_tasks enable row level security;
alter table public.ai_atlas_wiki_pages enable row level security;
alter table public.ai_atlas_wiki_revisions enable row level security;
revoke all on public.ai_atlas_preferences,public.ai_atlas_feed_items,public.ai_atlas_issues,public.ai_atlas_tasks,public.ai_atlas_wiki_pages,public.ai_atlas_wiki_revisions from anon,authenticated;
grant select on public.ai_atlas_preferences,public.ai_atlas_feed_items,public.ai_atlas_issues,public.ai_atlas_tasks,public.ai_atlas_wiki_pages,public.ai_atlas_wiki_revisions to authenticated;
grant all on public.ai_atlas_preferences,public.ai_atlas_feed_items,public.ai_atlas_issues,public.ai_atlas_tasks,public.ai_atlas_wiki_pages,public.ai_atlas_wiki_revisions to service_role;
create policy atlas_preferences_read on public.ai_atlas_preferences for select to authenticated using((select auth.uid())=user_id);
create policy atlas_feed_read on public.ai_atlas_feed_items for select to authenticated using((select auth.uid())=user_id);
create policy atlas_issues_read on public.ai_atlas_issues for select to authenticated using((select auth.uid())=user_id);
create policy atlas_tasks_read on public.ai_atlas_tasks for select to authenticated using((select auth.uid())=user_id);
create policy atlas_wiki_read on public.ai_atlas_wiki_pages for select to authenticated using((select auth.uid())=user_id);
create policy atlas_revisions_read on public.ai_atlas_wiki_revisions for select to authenticated using((select auth.uid())=user_id);
-- Internal RPCs run as service_role, not as the database owner.
create function public.ai_atlas_claim_task(p_user_id uuid,p_kind text,p_key text,p_limit integer default 10)
returns uuid language plpgsql security invoker set search_path='' as $$
declare job public.ai_atlas_tasks; used integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':atlas-task',0));
 select * into job from public.ai_atlas_tasks where user_id=p_user_id and kind=p_kind and task_key=p_key for update;
 if found and job.status='completed' then return job.id; end if;
 if exists(select 1 from public.ai_atlas_tasks where user_id=p_user_id and status='running' and started_at>now()-interval '6 minutes') then raise exception 'ALREADY_RUNNING'; end if;
 select coalesce(sum(daily_attempts),0) into used from public.ai_atlas_tasks where user_id=p_user_id and attempt_day=(now() at time zone 'Asia/Seoul')::date;
 if used>=least(greatest(p_limit,1),20) then raise exception 'DAILY_LIMIT'; end if;
 if job.id is not null then
  if job.attempt_day=(now() at time zone 'Asia/Seoul')::date and job.daily_attempts>=3 then raise exception 'RETRY_LIMIT'; end if;
  update public.ai_atlas_tasks set status='running',attempts=attempts+1,daily_attempts=case when attempt_day=(now() at time zone 'Asia/Seoul')::date then daily_attempts+1 else 1 end,attempt_day=(now() at time zone 'Asia/Seoul')::date,started_at=now(),error=null where id=job.id;
  return job.id;
 end if;
 insert into public.ai_atlas_tasks(user_id,kind,task_key) values(p_user_id,p_kind,p_key) returning id into job.id;
 return job.id;
end; $$;
revoke all on function public.ai_atlas_claim_task(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.ai_atlas_claim_task(uuid,text,text,integer) to service_role;
create function public.ai_atlas_write_wiki(p_task_id uuid,p_pages jsonb) returns integer
language plpgsql security invoker set search_path='' as $$
declare owner_id uuid; item jsonb; current_page public.ai_atlas_wiki_pages; saved public.ai_atlas_wiki_pages; ids uuid[]; wrote integer:=0;
begin
 select user_id into owner_id from public.ai_atlas_tasks where id=p_task_id and status='running';
 if owner_id is null then raise exception 'INVALID_TASK'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':atlas-wiki',0));
 for item in select * from jsonb_array_elements(p_pages) loop
  select * into current_page from public.ai_atlas_wiki_pages where user_id=owner_id and slug=item->>'slug' for update;
  if current_page.protected or (current_page.id is not null and current_page.revision<>coalesce((item->>'expected_revision')::integer,0)) then continue; end if;
  ids:=array(select value::uuid from jsonb_array_elements_text(item->'source_ids'));
  if cardinality(ids)=0 or exists(select 1 from unnest(ids) x where not exists(select 1 from public.ai_atlas_resources r where r.id=x and r.user_id=owner_id and r.deleted_at is null)) then raise exception 'INVALID_SOURCES'; end if;
  insert into public.ai_atlas_wiki_pages(user_id,slug,title,kind,summary,body,source_ids,links,caveats,revision)
  values(owner_id,item->>'slug',item->>'title',item->>'kind',item->>'summary',item->>'body',ids,array(select jsonb_array_elements_text(item->'links')),array(select jsonb_array_elements_text(item->'caveats')),1)
  on conflict(user_id,slug) do update set title=excluded.title,kind=excluded.kind,summary=excluded.summary,body=excluded.body,source_ids=excluded.source_ids,links=excluded.links,caveats=excluded.caveats,revision=public.ai_atlas_wiki_pages.revision+1,updated_at=now()
  returning * into saved;
  insert into public.ai_atlas_wiki_revisions(user_id,page_id,revision,snapshot,task_id) values(owner_id,saved.id,saved.revision,to_jsonb(saved),p_task_id);
  wrote:=wrote+1;
 end loop;
 return wrote;
end; $$;
revoke all on function public.ai_atlas_write_wiki(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ai_atlas_write_wiki(uuid,jsonb) to service_role;
commit;
