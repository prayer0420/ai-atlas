alter table public.ai_atlas_preferences add column card_profile jsonb not null default '{}';

create function public.ai_atlas_revise_cards(p_user_id uuid,p_resource_id uuid,p_base_id uuid,p_revision integer,p_brief jsonb,p_data jsonb,p_version text)
returns public.ai_atlas_card_runs language plpgsql security invoker set search_path=public as $$
declare r ai_atlas_resources; base ai_atlas_card_runs; latest ai_atlas_card_runs; c ai_atlas_card_runs;
begin
 perform pg_advisory_xact_lock(hashtext('atlas-queue-'||p_user_id::text));
 perform pg_advisory_xact_lock(hashtext('atlas-cards-'||p_resource_id::text));
 select * into r from ai_atlas_resources where id=p_resource_id and user_id=p_user_id and deleted_at is null for update;
 if not found then raise exception 'RESOURCE_NOT_FOUND'; end if;
 select * into base from ai_atlas_card_runs where id=p_base_id and resource_id=r.id and user_id=p_user_id and state='completed' and revision=p_revision and input_hash=r.content_hash for update;
 if not found then raise exception 'BASE_CHANGED'; end if;
 select * into latest from ai_atlas_card_runs where resource_id=r.id and user_id=p_user_id order by created_at desc,id desc limit 1;
 if latest.id<>base.id and not coalesce(latest.state in('failed','waiting_input') and latest.data->>'parentRunId'=base.id::text,false) then raise exception 'BASE_CHANGED'; end if;
 if exists(select 1 from ai_atlas_queue where user_id=p_user_id and payload->>'resourceId'=r.id::text and status in('queued','running')) then raise exception 'ALREADY_RUNNING'; end if;
 if jsonb_typeof(p_data->'story'->'cards') is distinct from 'array' then raise exception 'INVALID_REVISION'; end if;
 if (p_brief->>'count')::integer is distinct from jsonb_array_length(p_data->'story'->'cards') or p_brief->>'count' is distinct from base.brief->>'count' then raise exception 'INVALID_REVISION'; end if;
 insert into ai_atlas_card_runs(user_id,resource_id,input_hash,brief,node,origin,requested_version,data,message)
 values(p_user_id,r.id,r.content_hash,p_brief,'render','manual',p_version,(p_data-'qa')||jsonb_build_object('parentRunId',base.id),'수정한 원고로 이미지를 만들고 검수합니다. 이전 완성본은 계속 볼 수 있습니다.') returning * into c;
 insert into ai_atlas_queue(user_id,kind,job_key,payload) values(p_user_id,'analyze','cards:'||c.id::text,jsonb_build_object('goal','cards','runId',c.id,'resourceId',r.id,'manual',true)) returning id into c.queue_id;
 update ai_atlas_card_runs set queue_id=c.queue_id where id=c.id returning * into c;
 update ai_atlas_resources set card_state='queued' where id=r.id;
 insert into ai_atlas_card_events(run_id,user_id,node,state,message) values(c.id,p_user_id,'render','queued',c.message);
 return c;
end $$;
revoke all on function public.ai_atlas_revise_cards(uuid,uuid,uuid,integer,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.ai_atlas_revise_cards(uuid,uuid,uuid,integer,jsonb,jsonb,text) to service_role;
