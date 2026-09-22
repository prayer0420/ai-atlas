-- Manual requests never consume automatic capacity. Reservations are made at
-- claim time (not enqueue time), atomically under the owner's queue lock.
alter table public.ai_atlas_card_runs add column origin text not null default 'manual' check(origin in ('manual','automatic'));
alter table public.ai_atlas_card_runs add column requested_version text not null default 'ko-editorial-2026-09-22-v1';
create table public.ai_atlas_card_daily_usage (
 user_id uuid not null references auth.users(id) on delete cascade,
 usage_date date not null, resource_id uuid not null references public.ai_atlas_resources(id) on delete cascade,
 run_id uuid not null references public.ai_atlas_card_runs(id) on delete cascade,
 slot integer not null check(slot between 1 and 3), cards integer not null default 8 check(cards=8),
 primary key(user_id,usage_date,run_id), unique(user_id,usage_date,slot)
);
alter table public.ai_atlas_card_daily_usage enable row level security;
revoke all on public.ai_atlas_card_daily_usage from anon,authenticated;
grant select on public.ai_atlas_card_daily_usage to authenticated;
grant all on public.ai_atlas_card_daily_usage to service_role;
create policy card_usage_own on public.ai_atlas_card_daily_usage for select to authenticated using(user_id=(select auth.uid()));
create function public.ai_atlas_request_cards(p_user_id uuid,p_resource_id uuid,p_brief jsonb,p_origin text,p_version text) returns public.ai_atlas_card_runs
language plpgsql security invoker set search_path=public as $$
declare r ai_atlas_resources; c ai_atlas_card_runs; q ai_atlas_queue; prior jsonb;
begin
 if p_origin not in ('manual','automatic') or p_origin is null then raise exception 'INVALID_ORIGIN'; end if;
 if p_origin='automatic' then p_brief=jsonb_set(p_brief,'{count}','8'); end if;
 perform pg_advisory_xact_lock(hashtext('atlas-queue-'||p_user_id::text));
 perform pg_advisory_xact_lock(hashtext('atlas-cards-'||p_resource_id::text));
 select * into r from ai_atlas_resources where id=p_resource_id and user_id=p_user_id and deleted_at is null for update;
 if not found then raise exception 'RESOURCE_NOT_FOUND'; end if;
 select * into c from ai_atlas_card_runs where user_id=p_user_id and resource_id=p_resource_id order by created_at desc limit 1 for update;
 if c.id is not null then
  select * into q from ai_atlas_queue where id=c.queue_id and user_id=p_user_id;
  if q.status in ('queued','running') then
   if p_origin='manual' and q.status='queued' then
    update ai_atlas_queue set payload=payload||'{"manual":true}',available_at=now() where id=q.id;
    update ai_atlas_card_runs set origin='manual',requested_version=p_version,message='수동 요청으로 제작을 이어갑니다.' where id=c.id returning * into c;
   end if;
   return c;
  end if;
  if c.input_hash=r.content_hash and c.brief=p_brief and c.state='completed' and (p_origin='automatic' or c.data->>'promptVersion'=p_version) then return c; end if;
  prior=c.data->'pendingRecovery';
 end if;
 if c.id is null or c.input_hash<>r.content_hash or c.brief<>p_brief or c.error_code='SOURCE_CHANGED' or c.state='completed' then
  insert into ai_atlas_card_runs(user_id,resource_id,input_hash,brief,origin,requested_version,data)
  values(p_user_id,p_resource_id,r.content_hash,p_brief,p_origin,p_version,case when prior is not null then jsonb_build_object('pendingRecovery',prior) else '{}'::jsonb end) returning * into c;
 else
  update ai_atlas_card_runs set state='queued', origin=p_origin,requested_version=p_version, attempts='{}', error_code=null, next_action=null, revision=revision+1,updated_at=now(),message='중단된 단계부터 다시 시작합니다.' where id=c.id returning * into c;
 end if;
 insert into ai_atlas_queue(user_id,kind,job_key,payload)
 values(p_user_id,'analyze','cards:'||c.id::text,jsonb_build_object('goal','cards','runId',c.id,'resourceId',p_resource_id,'manual',p_origin='manual')) returning id into c.queue_id;
 update ai_atlas_card_runs set queue_id=c.queue_id,message='저장한 단계부터 카드뉴스 제작을 이어갑니다.' where id=c.id returning * into c;
 update ai_atlas_resources set card_state=c.state where id=r.id;
 insert into ai_atlas_card_events(run_id,user_id,node,state,message) values(c.id,p_user_id,c.node,c.state,c.message);
 return c;
end $$;


create or replace function public.ai_atlas_start_cards(p_user_id uuid,p_resource_id uuid,p_brief jsonb) returns public.ai_atlas_card_runs
language sql security invoker set search_path=public as $$
 select public.ai_atlas_request_cards(p_user_id,p_resource_id,p_brief,'manual','ko-editorial-2026-09-22-v2');
$$;
create or replace function public.ai_atlas_take_job(p_user_id uuid) returns setof public.ai_atlas_queue
language plpgsql security invoker set search_path=public as $$
declare job ai_atlas_queue; today date := (now() at time zone 'Asia/Seoul')::date; used integer; resource uuid;
begin
 perform pg_advisory_xact_lock(hashtext('atlas-queue-'||p_user_id::text));
 update ai_atlas_queue set status='failed',error='PC 작업이 반복 중단되었습니다. 다시 시도할 수 있습니다.',finished_at=now() where user_id=p_user_id and status='running' and lease_until<now() and attempts>=3;
 if exists(select 1 from ai_atlas_queue where user_id=p_user_id and status='running' and lease_until>now()) then return; end if;
 for job in select * from ai_atlas_queue where user_id=p_user_id and attempts<3 and ((status='queued' and available_at<=now()) or (status='running' and lease_until<now()))
 order by case when kind='analyze' and coalesce((payload->>'manual')::boolean,false) then 0 when kind='analyze' then 1 when kind='question' then 2 when kind='daily' then 3 else 4 end,created_at for update skip locked
 loop
  if job.payload->>'goal'='cards' and not coalesce((job.payload->>'manual')::boolean,false) then
   resource=(job.payload->>'resourceId')::uuid;
   if not exists(select 1 from ai_atlas_card_daily_usage where user_id=p_user_id and usage_date=today and run_id=(job.payload->>'runId')::uuid) then
    select count(*) into used from ai_atlas_card_daily_usage where user_id=p_user_id and usage_date=today;
    if used>=3 then
     update ai_atlas_queue set status='queued',available_at=(today+1)::timestamp at time zone 'Asia/Seoul',lease_token=null,lease_until=null where id=job.id;
     update ai_atlas_card_runs set message='오늘 자동 제작 3건을 모두 시작했습니다. 다음 날 이어서 제작합니다.' where queue_id=job.id and user_id=p_user_id;
     continue;
    end if;
    insert into ai_atlas_card_daily_usage(user_id,usage_date,resource_id,run_id,slot) values(p_user_id,today,resource,(job.payload->>'runId')::uuid,used+1);
   end if;
  end if;
  return query update ai_atlas_queue set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '30 minutes',error=null where id=job.id returning *;
  return;
 end loop;
end $$;
revoke all on function public.ai_atlas_request_cards(uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.ai_atlas_request_cards(uuid,uuid,jsonb,text,text) to service_role;

-- Manual activity must not exhaust unrelated automation queue capacity.
create or replace function public.ai_atlas_enqueue(p_user_id uuid,p_kind text,p_key text,p_payload jsonb default '{}') returns uuid
language plpgsql security invoker set search_path=public as $$
declare job uuid; is_manual_analysis boolean;
begin
 perform pg_advisory_xact_lock(hashtext('atlas-queue-'||p_user_id::text));
 select id into job from ai_atlas_queue where user_id=p_user_id and kind=p_kind and job_key=p_key and status in ('queued','running');
 if found then return job; end if;
 is_manual_analysis := p_kind='analyze' and coalesce((p_payload->>'manual')::boolean,false);
 if not is_manual_analysis and (select count(*) from ai_atlas_queue where user_id=p_user_id and not (kind='analyze' and coalesce((payload->>'manual')::boolean,false)) and status in ('queued','running'))>=30 then raise exception 'QUEUE_FULL'; end if;
 if not is_manual_analysis and (select count(*) from ai_atlas_queue where user_id=p_user_id and not (kind='analyze' and coalesce((payload->>'manual')::boolean,false)) and created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')>=60 then raise exception 'QUEUE_LIMIT'; end if;
 insert into ai_atlas_queue(user_id,kind,job_key,payload) values(p_user_id,p_kind,p_key,p_payload) returning id into job;
 return job;
end $$;
