import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { CARD_PROMPT_VERSION, cardBriefSchema } from "../lib/card-workflow";

test("manual cards are unlimited; automatic claims reserve 3x8 per KST day, resume safely and isolate owners", async () => {
  const db = new PGlite();
  const alice = "11111111-1111-4111-8111-111111111111",
    bob = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${alice}'),('${bob}');`,
    );
    for (const file of [
      "202609170001_ai_atlas.sql",
      "202609180001_local_automation.sql",
      "20260918233654_manual_analysis_unlimited.sql",
      "20260922023826_card_goal_workflows.sql",
      "20260922030330_card_goal_queue_failure_sync.sql",
      "20260922051137_card_creation_policy.sql",
      "20260922054708_parallel_cards_progress.sql",
    ])
      await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    let n = 0;
    const start = async (origin: string, user = alice) => {
      const resource = (
        await db.query<{ id: string }>(
          "insert into ai_atlas_resources(user_id,title,raw_text,fingerprint) values($1,'Synthetic','test source',$2) returning id",
          [user, String(n++)],
        )
      ).rows[0];
      return (
        await db.query<any>(
          "select * from ai_atlas_request_cards($1,$2,$3,$4,$5)",
          [
            user,
            resource.id,
            JSON.stringify(cardBriefSchema.parse({ count: 12 })),
            origin,
            CARD_PROMPT_VERSION,
          ],
        )
      ).rows[0];
    };
    const claim = async (user = alice) =>
      (await db.query<any>("select * from ai_atlas_take_job($1)", [user]))
        .rows[0];
    const finish = async (id: string) =>
      db.query("update ai_atlas_queue set status='completed' where id=$1", [
        id,
      ]);
    const auto = await Promise.all(
      Array.from({ length: 5 }, () => start("automatic")),
    );
    assert.ok(auto.every((r) => r.brief.count === 8));
    for (let i = 0; i < 65; i++) await start("manual");
    assert.ok(
      (
        await db.query("select ai_atlas_enqueue($1,'daily','auto-daily')", [
          alice,
        ])
      ).rows.length,
    );
    await db.query(
      "update ai_atlas_queue set status='completed' where user_id=$1 and kind='daily'",
      [alice],
    );
    for (let i = 0; i < 65; i++) {
      const job = await claim();
      assert.equal(job.payload.manual, true);
      await finish(job.id);
    }
    assert.equal(
      (await db.query("select * from ai_atlas_card_daily_usage")).rows.length,
      0,
    );
    const first = await claim();
    assert.equal(first.payload.manual, false);
    assert.equal(await claim(), undefined); // live lease cannot be double claimed
    await db.query(
      "update ai_atlas_queue set lease_until=now()-interval '1 minute' where id=$1",
      [first.id],
    );
    const resumed = await claim();
    assert.equal(resumed.id, first.id);
    assert.notEqual(resumed.lease_token, first.lease_token);
    await finish(resumed.id);
    for (let i = 0; i < 2; i++) await finish((await claim()).id);
    assert.equal(await claim(), undefined);
    const usage = (
      await db.query<any>(
        "select count(*)::int count,sum(cards)::int cards from ai_atlas_card_daily_usage where user_id=$1",
        [alice],
      )
    ).rows[0];
    assert.deepEqual(usage, { count: 3, cards: 24 });
    const deferred = (
      await db.query<any>(
        "select id,payload,available_at=(date_trunc('day',now() at time zone 'Asia/Seoul')+interval '1 day') at time zone 'Asia/Seoul' as midnight from ai_atlas_queue where user_id=$1 and status='queued'",
        [alice],
      )
    ).rows;
    assert.equal(deferred.length, 2);
    assert.ok(deferred.every((r) => r.midnight));
    await start("automatic", bob);
    await finish((await claim(bob)).id);
    // Explicit manual request promotes an automatic job even after its daily limit.
    const pending = auto.find((r) => r.queue_id === deferred[0].id)!;
    const promoted = (
      await db.query<any>(
        "select * from ai_atlas_request_cards($1,$2,$3,'manual',$4)",
        [
          alice,
          pending.resource_id,
          JSON.stringify(pending.brief),
          CARD_PROMPT_VERSION,
        ],
      )
    ).rows[0];
    assert.equal(promoted.id, pending.id);
    assert.equal(promoted.origin, "manual");
    assert.equal((await claim()).id, deferred[0].id);
    await finish(deferred[0].id);
    // Simulate the next calendar day's historical ledger; no process-local counter.
    await db.query(
      "update ai_atlas_card_daily_usage set usage_date=usage_date-1 where user_id=$1",
      [alice],
    );
    await db.query(
      "update ai_atlas_queue set available_at=now() where user_id=$1 and status='queued'",
      [alice],
    );
    assert.ok(await claim());
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${bob}';`);
    assert.equal(
      (await db.query("select * from ai_atlas_card_daily_usage")).rows.length,
      1,
    );
    await assert.rejects(
      () =>
        db.query("select * from ai_atlas_request_cards($1,$2,$3,'manual',$4)", [
          alice,
          pending.resource_id,
          JSON.stringify(pending.brief),
          CARD_PROMPT_VERSION,
        ]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
