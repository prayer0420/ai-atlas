-- A bounded card pool; non-card tasks remain exclusive. All reservations share
-- the existing owner lock, including the original single-job RPC.
create function public.ai_atlas_take_job_capacity(p_user_id uuid,p_card_capacity integer)
returns setof public.ai_atlas_queue language plpgsql security invoker set search_path=public as $$
declare job ai_atlas_queue; today date := (now() at time zone 'Asia/Seoul')::date;
 used integer; active_count integer; capacity integer := least(2,greatest(1,coalesce(p_card_capacity,1)));
begin
 perform pg_advisory_xact_lock(hashtext('atlas-queue-'||p_user_id::text));
 update ai_atlas_queue set status='failed',error='PC 작업이 반복 중단되었습니다. 다시 시도할 수 있습니다.',finished_at=now()
 where user_id=p_user_id and status='running' and lease_until<now() and attempts>=3;
 select count(*) into active_count from ai_atlas_queue where user_id=p_user_id and status='running' and lease_until>now();
 if active_count>=capacity or exists(select 1 from ai_atlas_queue where user_id=p_user_id and status='running' and lease_until>now()
   and not(kind='analyze' and coalesce(payload->>'goal','')='cards')) then return; end if;
 for job in select q.* from ai_atlas_queue q where q.user_id=p_user_id and q.attempts<3
 and ((q.status='queued' and q.available_at<=now()) or(q.status='running' and q.lease_until<now()))
 and (active_count=0 or(q.kind='analyze' and q.payload->>'goal'='cards'))
 and not exists(select 1 from ai_atlas_queue live where live.user_id=p_user_id and live.status='running' and live.lease_until>now()
   and live.payload->>'resourceId'=q.payload->>'resourceId')
 order by case when q.kind='analyze' and coalesce((q.payload->>'manual')::boolean,false) then 0 when q.kind='analyze' then 1 when q.kind='question' then 2 when q.kind='daily' then 3 else 4 end,q.created_at,q.id
 for update of q skip locked
 loop
  if job.payload->>'goal'='cards' and not coalesce((job.payload->>'manual')::boolean,false) then
   if not exists(select 1 from ai_atlas_card_daily_usage where user_id=p_user_id and usage_date=today and run_id=(job.payload->>'runId')::uuid) then
    select count(*) into used from ai_atlas_card_daily_usage where user_id=p_user_id and usage_date=today;
    if used>=3 then
     update ai_atlas_queue set status='queued',available_at=(today+1)::timestamp at time zone 'Asia/Seoul',lease_token=null,lease_until=null where id=job.id;
     update ai_atlas_card_runs set message='오늘 자동 제작 3건을 모두 시작했습니다. 다음 날 이어서 제작합니다.' where queue_id=job.id and user_id=p_user_id;
     continue;
    end if;
    insert into ai_atlas_card_daily_usage(user_id,usage_date,resource_id,run_id,slot)
    values(p_user_id,today,(job.payload->>'resourceId')::uuid,(job.payload->>'runId')::uuid,used+1);
   end if;
  end if;
  return query update ai_atlas_queue set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '30 minutes',error=null where id=job.id returning *;
  return;
 end loop;
end $$;
revoke all on function public.ai_atlas_take_job_capacity(uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_atlas_take_job_capacity(uuid,integer) to service_role;
create or replace function public.ai_atlas_take_job(p_user_id uuid) returns setof public.ai_atlas_queue
language sql security invoker set search_path=public as $$ select * from public.ai_atlas_take_job_capacity(p_user_id,1); $$;

-- Latest requested versions only: queue completion is never image completion.
create function public.ai_atlas_card_progress(p_user_id uuid) returns jsonb
language sql stable security invoker set search_path=public as $$
 with latest as (
  select r.id,r.title,c.node,c.updated_at,c.manifest,c.brief,
   case when c.input_hash<>r.content_hash then 'attention'
    when c.state='completed' then 'completed'
    when c.state in('failed','waiting_input') or q.status='failed' then 'attention'
    when q.status='running' and q.lease_until>now() then 'active'
    else 'queued' end as state
  from ai_atlas_resources r
  join lateral(select * from ai_atlas_card_runs c where c.user_id=p_user_id and c.resource_id=r.id order by c.created_at desc,c.id desc limit 1)c on true
  left join ai_atlas_queue q on q.id=c.queue_id and q.user_id=p_user_id
  where r.user_id=p_user_id and r.deleted_at is null
 ) select jsonb_build_object(
  'total',count(*),'completed',count(*) filter(where state='completed'),
  'images',coalesce(sum(jsonb_array_length(manifest)) filter(where state='completed'),0),
  'targetImages',coalesce(sum((brief->>'count')::integer),0),
  'active',count(*) filter(where state='active'),'queued',count(*) filter(where state='queued'),
  'attention',count(*) filter(where state='attention'),
  'lastCompletedAt',max(updated_at) filter(where state='completed'),
  'current',coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'node',node,'updatedAt',updated_at) order by updated_at) filter(where state='active'),'[]'::jsonb)
 ) from latest;
$$;
revoke all on function public.ai_atlas_card_progress(uuid) from public,anon,authenticated;
grant execute on function public.ai_atlas_card_progress(uuid) to service_role;
