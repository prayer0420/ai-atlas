-- Durable card goal; all mutations are service-side and fenced by queue leases.
alter table public.ai_atlas_resources add column content_hash text generated always as (md5(coalesce(source_url,'') || E'\n' || raw_text)) stored;
alter table public.ai_atlas_resources add column card_state text;
create function public.ai_atlas_invalidate_cards() returns trigger language plpgsql set search_path=public as $$
begin
 if old.raw_text is distinct from new.raw_text or old.source_url is distinct from new.source_url then new.card_state=null; end if;
 return new;
end $$;
create trigger invalidate_card_goal before update of raw_text,source_url on public.ai_atlas_resources for each row execute function public.ai_atlas_invalidate_cards();
create table public.ai_atlas_card_runs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 resource_id uuid not null references public.ai_atlas_resources(id) on delete cascade,
 queue_id uuid references public.ai_atlas_queue(id), input_hash text not null, brief jsonb not null,
 state text not null default 'queued' check(state in ('queued','running','recovering','waiting_input','failed','completed')),
 node text not null default 'source' check(node in ('source','analysis','story','render','verify','done')),
 revision integer not null default 0, attempts jsonb not null default '{}', data jsonb not null default '{}', manifest jsonb not null default '[]',
 error_code text, message text not null default '카드뉴스 제작을 기다립니다.', next_action text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index ai_atlas_cards_owner_resource on public.ai_atlas_card_runs(user_id,resource_id,created_at desc);
create table public.ai_atlas_card_events (
 id bigint generated always as identity primary key, run_id uuid not null references public.ai_atlas_card_runs(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, node text not null, state text not null,
 code text, strategy text, message text not null, created_at timestamptz not null default now()
);
create index ai_atlas_card_events_run on public.ai_atlas_card_events(user_id,run_id,id);
create table public.ai_atlas_recovery_rules (
 user_id uuid not null references auth.users(id) on delete cascade, signature text not null, strategy text not null,
 successes integer not null default 0, failures integer not null default 0, updated_at timestamptz not null default now(),
 primary key(user_id,signature,strategy), check(strategy in ('retry_connection','rewrite_story','rebuild_images','request_source','check_connection'))
);
alter table public.ai_atlas_card_runs enable row level security;
alter table public.ai_atlas_card_events enable row level security;
alter table public.ai_atlas_recovery_rules enable row level security;
revoke all on public.ai_atlas_card_runs, public.ai_atlas_card_events, public.ai_atlas_recovery_rules from anon,authenticated;
grant select on public.ai_atlas_card_runs, public.ai_atlas_card_events, public.ai_atlas_recovery_rules to authenticated;
grant all on public.ai_atlas_card_runs, public.ai_atlas_card_events, public.ai_atlas_recovery_rules to service_role;
grant usage, select on sequence public.ai_atlas_card_events_id_seq to service_role;
create policy card_runs_own on public.ai_atlas_card_runs for select to authenticated using(user_id=(select auth.uid()));
create policy card_events_own on public.ai_atlas_card_events for select to authenticated using(user_id=(select auth.uid()));
create policy recovery_rules_own on public.ai_atlas_recovery_rules for select to authenticated using(user_id=(select auth.uid()));

create function public.ai_atlas_start_cards(p_user_id uuid,p_resource_id uuid,p_brief jsonb) returns public.ai_atlas_card_runs
language plpgsql security invoker set search_path=public as $$
declare r ai_atlas_resources; c ai_atlas_card_runs; q ai_atlas_queue; prior jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('atlas-cards-'||p_resource_id::text));
 select * into r from ai_atlas_resources where id=p_resource_id and user_id=p_user_id and deleted_at is null for update;
 if not found then raise exception 'RESOURCE_NOT_FOUND'; end if;
 select * into c from ai_atlas_card_runs where user_id=p_user_id and resource_id=p_resource_id order by created_at desc limit 1 for update;
 if c.id is not null then
  select * into q from ai_atlas_queue where id=c.queue_id and user_id=p_user_id;
  if q.status in ('queued','running') then return c; end if;
  if c.input_hash=r.content_hash and c.brief=p_brief and c.state='completed' then return c; end if;
  prior=c.data->'pendingRecovery';
 end if;
 if c.id is null or c.input_hash<>r.content_hash or c.brief<>p_brief or c.error_code='SOURCE_CHANGED' then
  insert into ai_atlas_card_runs(user_id,resource_id,input_hash,brief,data)
  values(p_user_id,p_resource_id,r.content_hash,p_brief,case when prior is not null then jsonb_build_object('pendingRecovery',prior) else '{}'::jsonb end) returning * into c;
 else
  update ai_atlas_card_runs set state='queued', attempts='{}', error_code=null, next_action=null, revision=revision+1,updated_at=now(),message='중단된 단계부터 다시 시작합니다.' where id=c.id returning * into c;
 end if;
 select ai_atlas_enqueue(p_user_id,'analyze','cards:'||c.id::text,jsonb_build_object('goal','cards','runId',c.id,'resourceId',p_resource_id,'manual',true)) into c.queue_id;
 update ai_atlas_card_runs set queue_id=c.queue_id,message='저장한 단계부터 카드뉴스 제작을 이어갑니다.' where id=c.id returning * into c;
 update ai_atlas_resources set card_state=c.state where id=r.id;
 insert into ai_atlas_card_events(run_id,user_id,node,state,message) values(c.id,p_user_id,c.node,c.state,c.message);
 return c;
end $$;

create function public.ai_atlas_checkpoint_cards(p_user_id uuid,p_run_id uuid,p_queue_id uuid,p_lease uuid,p_revision integer,p_hash text,p_patch jsonb,p_event jsonb default '{}') returns public.ai_atlas_card_runs
language plpgsql security invoker set search_path=public as $$
declare c ai_atlas_card_runs; r ai_atlas_resources; n text; s text; d jsonb; m jsonb; pending jsonb;
begin
 perform 1 from ai_atlas_queue where id=p_queue_id and user_id=p_user_id and lease_token=p_lease and status='running' and lease_until>now() and payload->>'runId'=p_run_id::text for update;
 if not found then raise exception 'LEASE_LOST'; end if;
 select * into c from ai_atlas_card_runs where id=p_run_id and user_id=p_user_id and queue_id=p_queue_id and revision=p_revision for update;
 if not found then raise exception 'REVISION_CHANGED'; end if;
 select * into r from ai_atlas_resources where id=c.resource_id and user_id=p_user_id and deleted_at is null for update;
 if not found or r.content_hash<>p_hash then raise exception 'SOURCE_CHANGED'; end if;
 n=coalesce(p_patch->>'node',c.node); s=coalesce(p_patch->>'state',c.state); d=coalesce(p_patch->'data',c.data); m=coalesce(p_patch->'manifest',c.manifest);
 if not (n=c.node or (c.node='source' and n='analysis') or (c.node='analysis' and n='story') or (c.node='story' and n='render') or (c.node='render' and n in ('story','verify')) or (c.node='verify' and n in ('story','render','done'))) then raise exception 'INVALID_EDGE'; end if;
 if (n='done')<>(s='completed') then raise exception 'GOAL_INCOMPLETE'; end if;
 if s='completed' and (coalesce((d->'qa'->>'passed')::boolean,false)=false or jsonb_array_length(m)<>(c.brief->>'count')::int or jsonb_array_length(m)<>(select count(distinct a->>'index') from jsonb_array_elements(m) a) or coalesce(length(d->'story'->>'caption'),0)<40 or exists(select 1 from jsonb_array_elements(m) a where coalesce((a->>'width')::int,0)<>1080 or coalesce((a->>'height')::int,0)<>1350 or coalesce((a->>'checked')::boolean,false)=false or coalesce((a->>'bytes')::int,0)<1 or coalesce(a->>'sha256','')!~'^[a-f0-9]{64}$' or coalesce(a->>'path','') not like p_user_id::text||'/'||c.id::text||'/%')) then raise exception 'GOAL_INCOMPLETE'; end if;
 -- A repair becomes reusable only after its failed node passes validation.
 pending=c.data->'pendingRecovery';
 if pending is not null and p_event->>'recoveryOutcome' in ('success','failure') then
  insert into ai_atlas_recovery_rules(user_id,signature,strategy,successes,failures)
  values(p_user_id,pending->>'signature',pending->>'strategy',case when p_event->>'recoveryOutcome'='success' then 1 else 0 end,case when p_event->>'recoveryOutcome'='failure' then 1 else 0 end)
  on conflict(user_id,signature,strategy) do update set successes=ai_atlas_recovery_rules.successes+excluded.successes, failures=ai_atlas_recovery_rules.failures+excluded.failures,updated_at=now();
 end if;
 update ai_atlas_card_runs set node=n,state=s,input_hash=p_hash,data=d,manifest=m,attempts=coalesce(p_patch->'attempts',attempts),
 error_code=p_patch->>'error_code',next_action=p_patch->>'next_action',message=coalesce(p_patch->>'message',message),revision=revision+1,updated_at=now() where id=c.id returning * into c;
 update ai_atlas_resources set card_state=s where id=c.resource_id;
 insert into ai_atlas_card_events(run_id,user_id,node,state,code,strategy,message) values(c.id,p_user_id,coalesce(p_event->>'node',n),s,p_event->>'code',p_event->>'strategy',coalesce(p_event->>'message',c.message));
 return c;
end $$;
revoke all on function public.ai_atlas_start_cards(uuid,uuid,jsonb), public.ai_atlas_checkpoint_cards(uuid,uuid,uuid,uuid,integer,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ai_atlas_start_cards(uuid,uuid,jsonb), public.ai_atlas_checkpoint_cards(uuid,uuid,uuid,uuid,integer,text,jsonb,jsonb) to service_role;
