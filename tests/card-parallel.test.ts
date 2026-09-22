import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { cardBriefSchema } from "../lib/card-workflow";

test("two card leases remain bounded, quota-safe and exclusive from legacy work; progress counts checked versions", async () => {
  const db = new PGlite();
  const alice = "11111111-1111-4111-8111-111111111111";
  const bob = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${alice}'),('${bob}');`);
    for (const file of ["202609170001_ai_atlas.sql", "202609180001_local_automation.sql", "20260918233654_manual_analysis_unlimited.sql", "20260922023826_card_goal_workflows.sql", "20260922030330_card_goal_queue_failure_sync.sql", "20260922051137_card_creation_policy.sql", "20260922054708_parallel_cards_progress.sql"])
      await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    const runs: any[] = [];
    for (let i = 0; i < 5; i++) {
      const resource = (await db.query<any>("insert into ai_atlas_resources(user_id,title,raw_text,fingerprint) values($1,'Synthetic','source',$2) returning id", [alice, String(i)])).rows[0];
      runs.push((await db.query<any>("select * from ai_atlas_request_cards($1,$2,$3,'automatic','v1')", [alice, resource.id, JSON.stringify(cardBriefSchema.parse({}))])).rows[0]);
    }
    const claim = async (capacity = 2) => (await db.query<any>("select * from ai_atlas_take_job_capacity($1,$2)", [alice, capacity])).rows[0];
    const finish = (id: string) => db.query("update ai_atlas_queue set status='completed' where id=$1", [id]);
    const progress = async (user = alice) => (await db.query<any>("select ai_atlas_card_progress($1) p", [user])).rows[0].p;
    const [first, second] = await Promise.all([claim(), claim()]);
    assert.ok(first && second);
    assert.notEqual(first.id, second.id);
    assert.notEqual(first.payload.resourceId, second.payload.resourceId);
    assert.equal(await claim(99), undefined); // server clamps at two
    assert.equal((await db.query("select * from ai_atlas_take_job($1)", [alice])).rows.length, 0);
    assert.equal((await progress()).active, 2);
    assert.equal((await progress()).queued, 3);
    assert.equal((await progress(bob)).total, 0);
    await db.query("update ai_atlas_queue set lease_until=now()-interval '1 minute', created_at=now()-interval '1 day' where id=$1", [first.id]);
    const resumed = await claim();
    assert.equal(resumed.id, first.id);
    assert.notEqual(resumed.lease_token, first.lease_token);
    assert.equal((await db.query("select * from ai_atlas_card_daily_usage")).rows.length, 2);
    await finish(resumed.id);
    const third = await claim();
    assert.ok(third);
    await finish(second.id);
    assert.equal(await claim(), undefined); // third daily slot reserved while it runs
    assert.equal((await db.query("select * from ai_atlas_card_daily_usage")).rows.length, 3);
    await finish(third.id);
    assert.equal((await progress()).completed, 0); // queue completion isn't a finished image
    const done = runs.find((r) => r.queue_id === first.id)!;
    await db.query("update ai_atlas_card_runs set state='completed',node='done',manifest=$2 where id=$1", [done.id, JSON.stringify(Array.from({ length: 8 }, (_, index) => ({ index })))]);
    assert.equal((await progress()).completed, 1);
    assert.equal((await progress()).images, 8);
    await db.query("select ai_atlas_request_cards($1,$2,$3,'manual','v2')", [alice, done.resource_id, JSON.stringify(done.brief)]);
    assert.equal((await progress()).completed, 0); // new version is honestly still pending
    const manual = await claim();
    assert.equal(manual.payload.manual, true);
    const duplicate = (await db.query<any>("insert into ai_atlas_queue(user_id,kind,job_key,payload) values($1,'analyze','duplicate-probe',$2) returning id", [alice, JSON.stringify(manual.payload)])).rows[0];
    const legacy = (await db.query<any>("insert into ai_atlas_queue(user_id,kind,job_key) values($1,'wiki','exclusive-probe') returning id", [alice])).rows[0];
    assert.equal(await claim(), undefined); // same resource and legacy task both blocked
    await finish(duplicate.id);
    await finish(manual.id);
    assert.equal((await claim()).id, legacy.id);
    await db.query("update ai_atlas_queue set available_at=now(),payload=payload||'{\"manual\":true}' where user_id=$1 and status='queued'", [alice]);
    assert.equal(await claim(), undefined); // legacy work owns the entire pool
    await finish(legacy.id);
    assert.ok(await claim(1));
    assert.equal(await claim(1), undefined); // Ollama remains serial
    await db.exec("set role authenticated");
    await assert.rejects(() => claim(), /permission denied/);
    await assert.rejects(() => progress(), /permission denied/);
    await db.exec("set role anon");
    await assert.rejects(() => claim(), /permission denied/);
  } finally { await db.close(); }
});
