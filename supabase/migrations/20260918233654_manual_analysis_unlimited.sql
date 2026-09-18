-- User-submitted resources bypass discovery/automation budgets. They remain
-- durable jobs so the private local worker can process them without exposing
-- the user's PC or local model to the internet.
create or replace function public.ai_atlas_enqueue(p_user_id uuid,p_kind text,p_key text,p_payload jsonb default '{}') returns uuid
language plpgsql security invoker set search_path=public as $$
declare job uuid; is_manual_analysis boolean;
begin
 perform pg_advisory_xact_lock(hashtext('atlas-queue-'||p_user_id::text));
 select id into job from ai_atlas_queue where user_id=p_user_id and kind=p_kind and job_key=p_key and status in ('queued','running');
 if found then return job; end if;
 is_manual_analysis := p_kind='analyze' and coalesce((p_payload->>'manual')::boolean,false);
 if not is_manual_analysis and (select count(*) from ai_atlas_queue where user_id=p_user_id and status in ('queued','running'))>=30 then raise exception 'QUEUE_FULL'; end if;
 if not is_manual_analysis and (select count(*) from ai_atlas_queue where user_id=p_user_id and created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')>=60 then raise exception 'QUEUE_LIMIT'; end if;
 insert into ai_atlas_queue(user_id,kind,job_key,payload) values(p_user_id,p_kind,p_key,p_payload) returning id into job;
 return job;
end $$;

create or replace function public.ai_atlas_take_job(p_user_id uuid) returns setof public.ai_atlas_queue
language plpgsql security invoker set search_path=public as $$
declare job uuid;
begin
 perform pg_advisory_xact_lock(hashtext('atlas-queue-'||p_user_id::text));
 update ai_atlas_queue set status='failed',error='PC 작업이 반복 중단되었습니다. 다시 시도할 수 있습니다.',finished_at=now() where user_id=p_user_id and status='running' and lease_until<now() and attempts>=3;
 if exists(select 1 from ai_atlas_queue where user_id=p_user_id and status='running' and lease_until>now()) then return; end if;
 select id into job from ai_atlas_queue where user_id=p_user_id and attempts<3 and ((status='queued' and available_at<=now()) or (status='running' and lease_until<now())) order by case when kind='analyze' and coalesce((payload->>'manual')::boolean,false) then 0 when kind='analyze' then 1 when kind='question' then 2 when kind='daily' then 3 else 4 end,created_at limit 1 for update skip locked;
 if found then
 return query update ai_atlas_queue set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '30 minutes',error=null where id=job returning *;
 end if;
end $$;

create function public.ai_atlas_claim_manual_analysis(p_resource_id uuid,p_user_id uuid)
returns uuid language plpgsql security invoker set search_path=public as $$
declare item public.ai_atlas_resources; job uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select * into item from public.ai_atlas_resources where id=p_resource_id and user_id=p_user_id and deleted_at is null for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if item.status='analyzing' and item.analysis_started_at>now()-interval '6 minutes' then raise exception 'ALREADY_RUNNING'; end if;
 update public.ai_atlas_analysis_jobs set status='failed',finished_at=now() where resource_id=p_resource_id and status='running' and created_at<now()-interval '6 minutes';
 insert into public.ai_atlas_analysis_jobs(resource_id,user_id) values(p_resource_id,p_user_id) returning id into job;
 update public.ai_atlas_resources set status='analyzing',analysis_job_id=job,analysis_started_at=now(),error_message=null where id=p_resource_id;
 return job;
end $$;

revoke all on function public.ai_atlas_enqueue(uuid,text,text,jsonb),public.ai_atlas_take_job(uuid),public.ai_atlas_claim_manual_analysis(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ai_atlas_enqueue(uuid,text,text,jsonb),public.ai_atlas_take_job(uuid),public.ai_atlas_claim_manual_analysis(uuid,uuid) to service_role;
