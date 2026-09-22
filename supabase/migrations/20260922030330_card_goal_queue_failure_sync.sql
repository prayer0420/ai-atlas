-- Crash exhaustion must update the visible goal as well as the transport queue.
create function public.ai_atlas_card_queue_failed() returns trigger
language plpgsql security invoker set search_path=public as $$
declare c ai_atlas_card_runs;
begin
 if new.status='failed' and old.status is distinct from new.status and new.payload->>'goal'='cards' then
  update ai_atlas_card_runs set state='failed',error_code='WORKER_INTERRUPTED',message='처리 연결이 반복 중단됐습니다. 저장한 단계부터 이어갈 수 있습니다.',next_action='이어서 제작',revision=revision+1,updated_at=now()
  where queue_id=new.id and user_id=new.user_id and state in ('queued','running','recovering') returning * into c;
  if found then
   update ai_atlas_resources set card_state='failed' where id=c.resource_id and user_id=c.user_id;
   insert into ai_atlas_card_events(run_id,user_id,node,state,code,message) values(c.id,c.user_id,c.node,c.state,c.error_code,c.message);
  end if;
 end if;
 return new;
end $$;
create trigger card_goal_queue_failure after update of status on public.ai_atlas_queue for each row execute function public.ai_atlas_card_queue_failed();
